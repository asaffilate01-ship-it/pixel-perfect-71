import { describe, expect, test } from "bun:test";
import {
  getLaunchMenuBrand,
  type LaunchMenuBrand,
  type LaunchMenuItem,
} from "../src/lib/launch-menu-catalogue";
import {
  addLaunchPick,
  cleanLaunchSelections,
  decodeLaunchPicks,
  encodeLaunchPicks,
  isLaunchGroupActive,
  launchPickCount,
  launchSelectionLabels,
  missingLaunchChoices,
  setLaunchPickQuantity,
  toggleLaunchOption,
  updateLaunchPick,
  type LaunchMenuPick,
  type LaunchMenuSelections,
} from "../src/lib/launch-menu-picks";
import { setLaunchCrossChoice } from "../src/lib/launch-menu-upsells";

function dish(brandId: string, sectionId: string, name?: string) {
  const brand = getLaunchMenuBrand(brandId)!;
  const section = brand.sections.find((entry) => entry.id === sectionId)!;
  return {
    brand,
    item: (name ? section.items.find((entry) => entry.name === name) : section.items[0])!,
  };
}

function choose(
  brand: LaunchMenuBrand,
  item: LaunchMenuItem,
  selections: LaunchMenuSelections,
  groupSuffix: string,
  label: string,
) {
  const group = brand.optionGroups.find((entry) => entry.id.endsWith(groupSuffix))!;
  const option = group.options.find((entry) => entry.label === label)!;
  return toggleLaunchOption(brand, item, selections, group.id, option.id);
}

describe("Launch menu planning with source-owned choices and catalogue prices", () => {
  test("Tavo wings require a portion and flavour; distinct combinations stay separate", () => {
    const { brand, item } = dish("tavo-chicken", "fried-chicken-wings");
    expect(addLaunchPick([], brand.id, item.id, {})).toEqual([]);
    let choices = choose(brand, item, {}, "-portion", "5 pcs");
    expect(missingLaunchChoices(brand, item, choices).map((group) => group.label)).toEqual([
      "Flavour",
    ]);
    choices = choose(brand, item, choices, "-flavour", "Korean BBQ");
    let picks = addLaunchPick([], brand.id, item.id, choices, 2);
    const alternative = choose(brand, item, choices, "-flavour", "Dynamite");
    picks = addLaunchPick(picks, brand.id, item.id, alternative);
    picks = addLaunchPick(picks, brand.id, item.id, choices);
    expect(picks.map((pick) => pick.quantity)).toEqual([3, 1]);
    expect(launchSelectionLabels(brand, item, picks[0]!.selections)).toEqual([
      "5 pcs",
      "Korean BBQ",
    ]);
    expect(decodeLaunchPicks(encodeLaunchPicks(picks))).toEqual(picks);
    expect(encodeLaunchPicks(picks)).not.toMatch(/price|total|payment|customer|address/i);
  });

  test("meal-only upgrades disappear when a burger switches back to just the main", () => {
    const { brand, item } = dish("skorch", "beef-smash-deck", "Double Deal");
    let choices = choose(brand, item, {}, "-meal-upgrades", "Mocktail");
    expect(choices).toEqual({});
    choices = choose(brand, item, choices, "-burger-add-ons", "3 Onion Rings");
    choices = choose(brand, item, choices, "-make-it-a-meal", "Make it a meal");
    choices = choose(brand, item, choices, "-meal-upgrades", "Mocktail");
    expect(launchSelectionLabels(brand, item, choices)).toContain("Mocktail");
    choices = choose(brand, item, choices, "-make-it-a-meal", "Make it a meal");
    expect(launchSelectionLabels(brand, item, choices)).toEqual(["3 Onion Rings"]);
  });

  test("Souvano requires a meal side only after make-it-a-meal is selected", () => {
    const { brand, item } = dish("souvano", "lamb-chops");
    expect(missingLaunchChoices(brand, item, {})).toEqual([]);
    let choices = choose(brand, item, {}, "-make-it-a-meal", "Make it a meal");
    expect(missingLaunchChoices(brand, item, choices).map((group) => group.id)).toEqual([
      "souvano-meal-side",
    ]);
    expect(addLaunchPick([], brand.id, item.id, choices)).toEqual([]);
    choices = choose(brand, item, choices, "-meal-side", "Naan");
    expect(addLaunchPick([], brand.id, item.id, choices)).toHaveLength(1);
    choices = choose(brand, item, choices, "-make-it-a-meal", "Make it a meal");
    expect(choices).toEqual({});
  });

  test("rejects wrong-brand modifiers and inactive orphaned dependency groups", () => {
    const { brand, item } = dish("skorch", "beef-smash-deck");
    const foreign = { "tavo-chicken-flavour": ["tavo-chicken-flavour-dynamite"] };
    expect(cleanLaunchSelections(brand, item, foreign)).toEqual({});
    expect(toggleLaunchOption(brand, item, {}, "unknown", "unknown")).toEqual({});
    const group = brand.optionGroups.find((entry) => entry.id === "skorch-burgers-meal-upgrades")!;
    expect(isLaunchGroupActive(group, {}, { ...item, optionGroupIds: [group.id] })).toBe(false);
  });

  test("unknown storage entries cannot provide their own dishes, names or amounts", () => {
    const { brand, item } = dish("moktl", "mocktail-lounge", "Blue Wave");
    const raw = JSON.stringify({
      version: 1,
      picks: [
        { brandId: "fake", itemId: "fake", quantity: 1, selections: {} },
        { brandId: brand.id, itemId: item.id, quantity: -1, selections: {} },
        {
          brandId: brand.id,
          itemId: item.id,
          quantity: 1,
          selections: {},
          pricePence: 0,
          name: "spoofed",
        },
      ],
    });
    const picks = decodeLaunchPicks(raw);
    expect(picks).toHaveLength(1);
    expect(picks[0]?.quantity).toBe(1);
    expect(picks[0]).not.toHaveProperty("pricePence");
    expect(picks[0]).not.toHaveProperty("name");
    expect(decodeLaunchPicks("not json")).toEqual([]);
    expect(decodeLaunchPicks(JSON.stringify({ version: 2, picks }))).toEqual([]);
    expect(decodeLaunchPicks("x".repeat(100_001))).toEqual([]);
  });

  test("quantity caps, removals and invalid quantities preserve the existing picks", () => {
    const { brand } = dish("moktl", "mocktail-lounge");
    const items = brand.sections[0]!.items;
    let picks: LaunchMenuPick[] = [];
    for (const item of items.slice(0, 3)) picks = addLaunchPick(picks, brand.id, item.id, {}, 20);
    expect(launchPickCount(picks)).toBe(60);
    expect(addLaunchPick(picks, brand.id, items[3]!.id, {})).toBe(picks);
    expect(setLaunchPickQuantity(picks, picks[0]!.key, 21)).toBe(picks);
    expect(setLaunchPickQuantity(picks, picks[0]!.key, Number.NaN)).toBe(picks);
    expect(addLaunchPick(picks, brand.id, items[0]!.id, {}, 0.5)).toBe(picks);
    const removed = setLaunchPickQuantity(picks, picks[0]!.key, 0);
    expect(launchPickCount(removed)).toBe(40);
    expect(removed).toHaveLength(2);
  });

  test("attached side/drink combinations persist, share parent quantity and never merge into a different combination", () => {
    const { brand, item } = dish("skorch", "beef-smash-deck", "Double Deal");
    const meal = choose(brand, item, {}, "-make-it-a-meal", "Make it a meal");
    const side = setLaunchCrossChoice(
      brand,
      item,
      meal,
      [],
      "loadd-side-upgrade",
      "loadd-loaded-fries-king-of-hearts",
    );
    const config = setLaunchCrossChoice(
      brand,
      item,
      side.selections,
      side.crossSelections,
      "moktl-drink-upgrade",
      "moktl-mocktail-lounge-blue-wave",
    );
    let picks = addLaunchPick([], brand.id, item.id, config.selections, 2, config.crossSelections);
    picks = addLaunchPick(
      picks,
      brand.id,
      item.id,
      config.selections,
      1,
      [...config.crossSelections].reverse(),
    );
    expect(picks).toHaveLength(1);
    expect(picks[0]?.quantity).toBe(3);
    const otherDrink = setLaunchCrossChoice(
      brand,
      item,
      config.selections,
      config.crossSelections,
      "moktl-drink-upgrade",
      "moktl-mocktail-lounge-mango-mirage",
    );
    picks = addLaunchPick(
      picks,
      brand.id,
      item.id,
      otherDrink.selections,
      1,
      otherDrink.crossSelections,
    );
    const otherSide = setLaunchCrossChoice(
      brand,
      item,
      config.selections,
      config.crossSelections,
      "loadd-side-upgrade",
      "loadd-loaded-mac-cheese-ace-mac",
    );
    picks = addLaunchPick(
      picks,
      brand.id,
      item.id,
      otherSide.selections,
      1,
      otherSide.crossSelections,
    );
    expect(new Set(picks.map((pick) => pick.key)).size).toBe(3);
    picks = setLaunchPickQuantity(picks, picks[0]!.key, 4);
    expect(launchPickCount(picks)).toBe(6);
    expect(picks[0]?.crossSelections).toHaveLength(2);
    expect(picks[0]?.crossSelections?.[0]).not.toHaveProperty("quantity");
    expect(decodeLaunchPicks(encodeLaunchPicks(picks))).toEqual(picks);
    expect(encodeLaunchPicks(picks)).not.toMatch(/price|total|payment|customer|address/i);
    const removed = setLaunchPickQuantity(picks, picks[0]!.key, 0);
    expect(removed).toHaveLength(2);
    expect(removed.every((pick) => pick.brandId === "skorch-burgers")).toBe(true);
    expect(launchPickCount(removed)).toBe(2);
  });

  test("edits are atomic, preserve valid children, and remove meal upgrades when returning to the main", () => {
    const { brand, item } = dish("tavo-chicken", "fried-chicken-wings");
    let choices = choose(brand, item, {}, "-portion", "5 pcs");
    choices = choose(brand, item, choices, "-flavour", "Korean BBQ");
    const main = choices;
    choices = choose(brand, item, choices, "-make-it-a-meal", "Make it a meal");
    const config = setLaunchCrossChoice(
      brand,
      item,
      choices,
      [],
      "moktl-drink-upgrade",
      "moktl-mocktail-lounge-blue-wave",
    );
    const picks = addLaunchPick(
      [],
      brand.id,
      item.id,
      config.selections,
      2,
      config.crossSelections,
    );
    expect(updateLaunchPick(picks, picks[0]!.key, {})).toBe(picks);
    expect(updateLaunchPick(picks, picks[0]!.key, choices, 21)).toBe(picks);
    expect(updateLaunchPick(picks, "stale-key", choices, 1)).toBe(picks);
    const changedFlavour = choose(brand, item, choices, "-flavour", "Dynamite");
    const changed = updateLaunchPick(picks, picks[0]!.key, changedFlavour);
    expect(changed[0]?.crossSelections).toEqual(config.crossSelections);
    expect(changed[0]?.quantity).toBe(2);
    expect(changed[0]?.key).not.toBe(picks[0]?.key);
    const justMain = updateLaunchPick(picks, picks[0]!.key, main);
    expect(justMain[0]).not.toHaveProperty("crossSelections");
    expect(justMain[0]?.quantity).toBe(2);
    expect(justMain).toEqual(addLaunchPick([], brand.id, item.id, main, 2));
  });

  test("an edit only merges exact target combinations and cannot bypass quantity caps", () => {
    const { brand, item } = dish("loadd", "loaded-fries");
    const blue = setLaunchCrossChoice(
      brand,
      item,
      {},
      [],
      "moktl-drink-extra",
      "moktl-mocktail-lounge-blue-wave",
    );
    const mango = setLaunchCrossChoice(
      brand,
      item,
      {},
      [],
      "moktl-drink-extra",
      "moktl-mocktail-lounge-mango-mirage",
    );
    let picks = addLaunchPick([], brand.id, item.id, {}, 2, blue.crossSelections);
    picks = addLaunchPick(picks, brand.id, item.id, {}, 3, mango.crossSelections);
    const merged = updateLaunchPick(picks, picks[0]!.key, {}, 2, mango.crossSelections);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.quantity).toBe(5);
    expect(merged[0]?.crossSelections).toEqual(mango.crossSelections);
    const full = setLaunchPickQuantity(picks, picks[1]!.key, 20);
    expect(updateLaunchPick(full, full[0]!.key, {}, 2, mango.crossSelections)).toBe(full);
    const clear = updateLaunchPick(picks, picks[0]!.key, {}, undefined, []);
    expect(clear[0]).not.toHaveProperty("crossSelections");
    expect(clear[1]?.crossSelections).toEqual(mango.crossSelections);
  });

  test("Heatwave keeps its required Fries choice internally while the basket describes its replacement once", () => {
    const { brand, item } = dish("souvano", "heatwave");
    const choices = choose(brand, item, {}, "-heatwave-base", "Fries");
    const config = setLaunchCrossChoice(
      brand,
      item,
      choices,
      [],
      "loadd-side-upgrade",
      "loadd-loaded-mac-cheese-ace-mac",
    );
    const picks = addLaunchPick(
      [],
      brand.id,
      item.id,
      config.selections,
      1,
      config.crossSelections,
    );
    expect(picks).toHaveLength(1);
    expect(missingLaunchChoices(brand, item, picks[0]!.selections)).toEqual([]);
    expect(picks[0]?.selections["souvano-heatwave-base"]).toEqual(["souvano-heatwave-base-fries"]);
    expect(
      launchSelectionLabels(brand, item, picks[0]!.selections, picks[0]!.crossSelections),
    ).not.toContain("Fries");
    expect(launchSelectionLabels(brand, item, picks[0]!.selections)).toContain("Fries");
    expect(decodeLaunchPicks(encodeLaunchPicks(picks))).toEqual(picks);
  });

  test("v1 legacy choices survive while restored child choices discard browser prices, target quantities and stale modes", () => {
    const { brand, item } = dish("skorch", "beef-smash-deck");
    let choices = choose(brand, item, {}, "-make-it-a-meal", "Make it a meal");
    choices = choose(brand, item, choices, "-meal-upgrades", "Loaded Fries");
    const legacy = addLaunchPick([], brand.id, item.id, choices);
    expect(encodeLaunchPicks(legacy)).not.toContain("crossSelections");
    expect(decodeLaunchPicks(encodeLaunchPicks(legacy))).toEqual(legacy);
    expect(launchSelectionLabels(brand, item, legacy[0]!.selections)).toContain("Loaded Fries");
    const child = {
      slot: "drink",
      mode: "upgrade",
      brandId: "moktl",
      itemId: "moktl-mocktail-lounge-blue-wave",
      pricePence: 0,
      quantity: 20,
      name: "Spoofed drink",
    };
    const restored = decodeLaunchPicks(
      JSON.stringify({ version: 1, picks: [{ ...legacy[0], crossSelections: [child] }] }),
    );
    expect(restored[0]?.crossSelections).toEqual([
      {
        slot: "drink",
        mode: "upgrade",
        brandId: "moktl",
        itemId: "moktl-mocktail-lounge-blue-wave",
      },
    ]);
    expect(encodeLaunchPicks(restored)).not.toMatch(/price|Spoofed/);
    const stale = decodeLaunchPicks(
      JSON.stringify({
        version: 1,
        picks: [{ ...legacy[0], selections: {}, crossSelections: [child] }],
      }),
    );
    expect(stale).toEqual(addLaunchPick([], brand.id, item.id, {}));
    const wrongTarget = decodeLaunchPicks(
      JSON.stringify({
        version: 1,
        picks: [{ ...legacy[0], crossSelections: [{ ...child, brandId: "souvano" }] }],
      }),
    );
    expect(wrongTarget).toEqual(legacy);
  });
});
