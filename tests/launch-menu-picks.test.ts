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
  type LaunchMenuPick,
  type LaunchMenuSelections,
} from "../src/lib/launch-menu-picks";

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

describe("Launch menu planning with source-owned choices and unknown prices", () => {
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
});
