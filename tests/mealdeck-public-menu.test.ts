import { describe, expect, test } from "bun:test";
import { launchMenuBrands, getLaunchMenuBrand } from "../src/lib/launch-menu-catalogue";
import {
  hydrateMealDeckPublicMenu,
  parseMealDeckPublicMenu,
  type MealDeckPublicMenuSnapshot,
} from "../src/lib/mealdeck-public-menu";
import {
  launchMenuPickDisplayPrice,
  launchMenuCrossChoicePrice,
} from "../src/lib/launch-menu-display-prices";
import { findLaunchMenuItem } from "../src/lib/launch-menu-picks";
import {
  describeLaunchCrossChoice,
  getLaunchCrossOffers,
  launchCrossSelectionSummaries,
  setLaunchCrossChoice,
} from "../src/lib/launch-menu-upsells";

function snapshot(): MealDeckPublicMenuSnapshot {
  return {
    available: true,
    checkedAt: "2026-11-06T11:00:00Z",
    items: launchMenuBrands.flatMap((brand) =>
      brand.sections.flatMap((section) =>
        section.items.map((item) => ({
          sku: item.id,
          name: item.name,
          description: item.description ?? null,
          pricePence: item.pricePence!,
          replacementPricePence: section.id === "loaded-fries" ? 299 : null,
          options: Object.fromEntries([
            ...brand.optionGroups
              .filter((group) => item.optionGroupIds.includes(group.id))
              .flatMap((group) =>
                group.options.map((option) => [
                  option.id,
                  { pricePence: option.pricePence ?? 0, available: option.available !== false },
                ]),
              ),
            ...(item.priceVariants ?? []).map((variant) => [
              variant.optionId,
              { pricePence: variant.pricePence - item.pricePence!, available: true },
            ]),
          ]),
        })),
      ),
    ),
  };
}

describe("current public menu prices and availability", () => {
  test("category and option renames reach the menu while stable selections and product availability stay intact", () => {
    const original = JSON.stringify(launchMenuBrands);
    const brand = getLaunchMenuBrand("skorch-burgers")!;
    const section = brand.sections[0]!;
    const item = section.items[1]!;
    const group = brand.optionGroups.find(
      (entry) => item.optionGroupIds.includes(entry.id) && !entry.required && !entry.when,
    )!;
    const option = group.options.find((entry) => entry.available !== false)!;
    const live = snapshot();
    // A hidden first product must not prevent the section's remaining live name from appearing.
    live.items = live.items.filter((row) => row.sku !== section.items[0]!.id);
    for (const source of section.items) {
      const row = live.items.find((entry) => entry.sku === source.id);
      if (row) row.categoryName = "Smash burgers from the kitchen";
    }
    for (const row of live.items) {
      if (row.options[option.id]) row.options[option.id]!.label = "Extra smoky cheese";
    }
    live.items.find((row) => row.sku === item.id)!.options[option.id]!.available = false;
    const catalogue = hydrateMealDeckPublicMenu(live);
    const current = findLaunchMenuItem(brand.id, item.id, catalogue)!;
    expect(current.section.id).toBe(section.id);
    expect(current.section.title).toBe("Smash burgers from the kitchen");
    expect(
      current.brand.optionGroups
        .find((entry) => entry.id === group.id)!
        .options.find((entry) => entry.id === option.id)!.label,
    ).toBe("Extra smoky cheese");
    expect(current.item.availableOptionIds).not.toContain(option.id);
    expect(
      launchMenuPickDisplayPrice(
        {
          brandId: brand.id,
          itemId: item.id,
          quantity: 1,
          selections: { [group.id]: [option.id] },
        },
        catalogue,
      ).itemsSubtotalPence,
    ).toBeNull();
    expect(findLaunchMenuItem(brand.id, section.items[0]!.id, catalogue)!.item.available).toBe(
      false,
    );
    expect(catalogue.find((entry) => entry.id === "tavo-chicken")!.sections[0]!.title).toBe(
      getLaunchMenuBrand("tavo-chicken")!.sections[0]!.title,
    );
    expect(JSON.stringify(launchMenuBrands)).toBe(original);
  });

  test("snapshots from before the label migration preserve reviewed labels and exact variant choices", () => {
    const live = snapshot();
    expect(parseMealDeckPublicMenu(live)).not.toBeNull();
    const catalogue = hydrateMealDeckPublicMenu(live);
    for (const brand of launchMenuBrands) {
      const current = catalogue.find((entry) => entry.id === brand.id)!;
      expect(current.sections.map((section) => section.title)).toEqual(
        brand.sections.map((section) => section.title),
      );
      expect(
        current.optionGroups.flatMap((group) => group.options.map((option) => option.label)),
      ).toEqual(brand.optionGroups.flatMap((group) => group.options.map((option) => option.label)));
    }
    const source = getLaunchMenuBrand("tavo-chicken")!
      .sections.flatMap((section) => section.items)
      .find((item) => item.priceVariants)!;
    const variant = source.priceVariants![0]!;
    const row = live.items.find((item) => item.sku === source.id)!;
    row.options[variant.optionId]!.label = "Kitchen portion and flavour";
    const current = findLaunchMenuItem("tavo-chicken", source.id, hydrateMealDeckPublicMenu(live))!
      .item.priceVariants![0]!;
    expect(current.label).toBe("Kitchen portion and flavour");
    expect(current.optionId).toBe(variant.optionId);
    expect(current.groupId).toBe(variant.groupId);
    expect(current.selections).toEqual(variant.selections);
    expect(current.pricePence).toBe(variant.pricePence);
  });

  test("present labels must be nonempty bounded text while omitted labels remain compatible", () => {
    for (const label of [null, 12, "", "   ", "x".repeat(141)]) {
      const badCategory = snapshot();
      Object.assign(badCategory.items[0]!, { categoryName: label });
      expect(parseMealDeckPublicMenu(badCategory)).toBeNull();
      const badReplacement = snapshot();
      Object.assign(badReplacement.items[0]!, { replacementLabel: label });
      expect(parseMealDeckPublicMenu(badReplacement)).toBeNull();
      const badOption = snapshot();
      const option = Object.values(
        badOption.items.find((row) => Object.keys(row.options).length)!.options,
      )[0]!;
      Object.assign(option, { label });
      expect(parseMealDeckPublicMenu(badOption)).toBeNull();
    }
  });

  test("a saved basket uses current base and modifier prices without changing reviewed templates", () => {
    const original = JSON.stringify(launchMenuBrands);
    const live = snapshot();
    const burger = getLaunchMenuBrand("skorch-burgers")!.sections[0]!.items[0]!;
    const row = live.items.find((item) => item.sku === burger.id)!;
    row.name = "Kitchen’s updated burger";
    row.description = null;
    row.pricePence = 649;
    const catalogue = hydrateMealDeckPublicMenu(live);
    const found = findLaunchMenuItem("skorch-burgers", burger.id, catalogue)!;
    expect(found.item.name).toBe(row.name);
    expect(found.item.description).toBeUndefined();
    expect(
      launchMenuPickDisplayPrice(
        { brandId: "skorch-burgers", itemId: burger.id, quantity: 2, selections: {} },
        catalogue,
      ).itemsSubtotalPence,
    ).toBe(1298);
    expect(JSON.stringify(launchMenuBrands)).toBe(original);
  });

  test("hidden products stay identifiable in saved baskets but cannot produce a purchasable subtotal", () => {
    const live = snapshot();
    const removed = live.items.pop()!;
    const catalogue = hydrateMealDeckPublicMenu(live);
    const sourceBrand = launchMenuBrands.find((brand) =>
      brand.sections.some((section) => section.items.some((item) => item.id === removed.sku)),
    )!;
    const item = findLaunchMenuItem(sourceBrand.id, removed.sku, catalogue)!.item;
    expect(item.available).toBe(false);
    expect(
      launchMenuPickDisplayPrice(
        { brandId: sourceBrand.id, itemId: item.id, quantity: 1, selections: {} },
        catalogue,
      ).itemsSubtotalPence,
    ).toBeNull();
  });

  test("Tavo portion and flavour read the exact canonical variant price and reject a disabled variant", () => {
    const source = getLaunchMenuBrand("tavo-chicken")!
      .sections.flatMap((section) => section.items)
      .find((item) => item.priceVariants)!;
    const variant = source.priceVariants![0]!;
    const live = snapshot(),
      row = live.items.find((item) => item.sku === source.id)!;
    row.pricePence = 500;
    row.options[variant.optionId] = { pricePence: 127, available: true };
    const pick = {
      brandId: "tavo-chicken",
      itemId: source.id,
      quantity: 2,
      selections: Object.fromEntries(
        Object.entries(variant.selections).map(([key, value]) => [key, [value]]),
      ),
    };
    expect(
      launchMenuPickDisplayPrice(pick, hydrateMealDeckPublicMenu(live)).itemsSubtotalPence,
    ).toBe(1254);
    row.options[variant.optionId]!.available = false;
    expect(
      launchMenuPickDisplayPrice(pick, hydrateMealDeckPublicMenu(live)).itemsSubtotalPence,
    ).toBeNull();
  });

  test("a product’s missing option link cannot borrow availability from another product", () => {
    const brand = getLaunchMenuBrand("skorch-burgers")!,
      source = brand.sections[0]!.items[0]!;
    const group = brand.optionGroups.find(
      (entry) => source.optionGroupIds.includes(entry.id) && !entry.required && !entry.when,
    )!;
    const option = group.options.find((entry) => entry.available !== false)!;
    const live = snapshot(),
      row = live.items.find((item) => item.sku === source.id)!;
    delete row.options[option.id];
    expect(
      launchMenuPickDisplayPrice(
        {
          brandId: brand.id,
          itemId: source.id,
          quantity: 1,
          selections: { [group.id]: [option.id] },
        },
        hydrateMealDeckPublicMenu(live),
      ).itemsSubtotalPence,
    ).toBeNull();
  });

  test("a required included drink may be satisfied by an eligible live replacement", () => {
    const brand = getLaunchMenuBrand("skorch-burgers")!;
    const source = brand.sections.find((section) => section.id === "kids-meal")!.items[0]!;
    const group = brand.optionGroups.find(
      (entry) => source.optionGroupIds.includes(entry.id) && entry.required && entry.replacedBy,
    )!;
    const live = snapshot();
    const row = live.items.find((item) => item.sku === source.id)!;
    for (const option of group.options) row.options[option.id]!.available = false;
    const offer = getLaunchCrossOffers(brand, source, {}).find(
      (entry) => entry.mode === "upgrade" && entry.slot === group.replacedBy!.crossSlot,
    )!;
    const target = live.items.find((item) => item.sku === offer.choices[0]!.itemId)!;
    target.replacementPricePence = 349;
    const selected = setLaunchCrossChoice(brand, source, {}, [], offer.id, target.sku);
    const catalogue = hydrateMealDeckPublicMenu(live);
    expect(findLaunchMenuItem(brand.id, source.id, catalogue)!.item.available).toBe(true);
    expect(
      launchMenuPickDisplayPrice(
        { brandId: brand.id, itemId: source.id, quantity: 1, ...selected },
        catalogue,
      ).itemsSubtotalPence,
    ).toBe(row.pricePence + 349);
    // Included/free replacements are valid too; their stable choice IDs do not change.
    target.replacementPricePence = 0;
    expect(
      findLaunchMenuItem(brand.id, source.id, hydrateMealDeckPublicMenu(live))!.item.available,
    ).toBe(true);
  });

  test("missing or disabled replacements cannot keep a required-choice product available", () => {
    const brand = getLaunchMenuBrand("skorch-burgers")!;
    const source = brand.sections.find((section) => section.id === "kids-meal")!.items[0]!;
    const group = brand.optionGroups.find(
      (entry) => source.optionGroupIds.includes(entry.id) && entry.required && entry.replacedBy,
    )!;
    const live = snapshot();
    const row = live.items.find((item) => item.sku === source.id)!;
    for (const option of group.options) row.options[option.id]!.available = false;
    const offer = getLaunchCrossOffers(brand, source, {}).find(
      (entry) => entry.mode === "upgrade" && entry.slot === group.replacedBy!.crossSlot,
    )!;
    for (const choice of offer.choices)
      live.items.find((item) => item.sku === choice.itemId)!.replacementPricePence = null;
    // Active side replacements are not substitutes for a required drink.
    expect(
      live.items.some(
        (item) => item.sku.startsWith("loadd-") && item.replacementPricePence !== null,
      ),
    ).toBe(true);
    expect(
      findLaunchMenuItem(brand.id, source.id, hydrateMealDeckPublicMenu(live))!.item.available,
    ).toBe(false);
    const targetId = offer.choices[0]!.itemId;
    live.items.find((item) => item.sku === targetId)!.replacementPricePence = 299;
    live.items = live.items.filter((item) => item.sku !== targetId);
    expect(
      findLaunchMenuItem(brand.id, source.id, hydrateMealDeckPublicMenu(live))!.item.available,
    ).toBe(false);
    row.options[group.options[0]!.id]!.available = true;
    expect(
      findLaunchMenuItem(brand.id, source.id, hydrateMealDeckPublicMenu(live))!.item.available,
    ).toBe(true);
  });

  test("named replacement upgrades use their saved surcharge independently of standalone prices", () => {
    const live = snapshot(),
      id = "loadd-loaded-fries-king-of-hearts";
    const row = live.items.find((item) => item.sku === id)!;
    row.pricePence = 899;
    row.replacementPricePence = 349;
    const catalogue = hydrateMealDeckPublicMenu(live);
    expect(launchMenuCrossChoicePrice("extra", "loadd", id, catalogue)).toBe(899);
    expect(launchMenuCrossChoicePrice("upgrade", "loadd", id, catalogue)).toBe(349);
    row.replacementPricePence = null;
    expect(
      launchMenuCrossChoicePrice("upgrade", "loadd", id, hydrateMealDeckPublicMenu(live)),
    ).toBeNull();
  });

  test("renamed charged replacements keep the target dish clear without changing choices, counts or amounts", () => {
    const brand = getLaunchMenuBrand("skorch-burgers")!;
    const burger = brand.sections[0]!.items[0]!;
    const targetId = "loadd-loaded-fries-king-of-hearts";
    const mealGroup = "skorch-burgers-make-it-a-meal";
    const selected = setLaunchCrossChoice(
      brand,
      burger,
      { [mealGroup]: [`${mealGroup}-make-it-a-meal`] },
      [],
      "loadd-side-upgrade",
      targetId,
    );
    const pick = { brandId: brand.id, itemId: burger.id, quantity: 2, ...selected };
    const live = snapshot();
    const before = launchMenuPickDisplayPrice(pick, hydrateMealDeckPublicMenu(live));
    const row = live.items.find((item) => item.sku === targetId)!;
    row.name = "King from the kitchen";
    row.categoryName = "Kitchen loaded fries";
    row.replacementLabel = "Truffle fries upgrade";
    const catalogue = hydrateMealDeckPublicMenu(live);
    const offer = getLaunchCrossOffers(brand, burger, selected.selections).find(
      (entry) => entry.slot === "side",
    )!;
    const choice = offer.choices.find((entry) => entry.itemId === targetId)!;
    const display = describeLaunchCrossChoice(choice, "upgrade", catalogue);
    expect(display.label).toBe("Truffle fries upgrade · King from the kitchen");
    expect(display.name).toBe("King from the kitchen");
    expect(display.sectionTitle).toBe("Kitchen loaded fries");
    expect(display.itemId).toBe(targetId);
    expect(display.pricePence).toBe(choice.pricePence);
    expect(describeLaunchCrossChoice(choice, "extra", catalogue).label).toBe(row.name);
    const summaries = launchCrossSelectionSummaries(
      brand,
      burger,
      selected.selections,
      selected.crossSelections,
      catalogue,
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.itemName).toBe(row.name);
    expect(summaries[0]!.label).toContain("Truffle fries upgrade · King from the kitchen");
    expect(summaries[0]!.mode).toBe("upgrade");
    expect(launchMenuPickDisplayPrice(pick, catalogue)).toEqual(before);
    // Omitted labels and callers without a live snapshot retain the reviewed wording.
    delete row.replacementLabel;
    expect(
      describeLaunchCrossChoice(choice, "upgrade", hydrateMealDeckPublicMenu(live)).label,
    ).toBe(row.name);
    expect(describeLaunchCrossChoice(choice, "upgrade").label).toBe(choice.name);
    expect(
      launchCrossSelectionSummaries(
        brand,
        burger,
        selected.selections,
        selected.crossSelections,
      )[0]!.itemName,
    ).toBe(choice.name);
  });

  test("malformed responses, duplicate products and invalid monetary values fail closed", () => {
    expect(parseMealDeckPublicMenu(snapshot())).not.toBeNull();
    expect(parseMealDeckPublicMenu({ available: false, items: [] })).toBeNull();
    const live = snapshot();
    live.items.push(live.items[0]!);
    expect(parseMealDeckPublicMenu(live)).toBeNull();
    for (const pricePence of [-1, 0.5, NaN, Infinity]) {
      const bad = snapshot();
      bad.items[0]!.pricePence = pricePence;
      expect(parseMealDeckPublicMenu(bad)).toBeNull();
    }
  });
});
