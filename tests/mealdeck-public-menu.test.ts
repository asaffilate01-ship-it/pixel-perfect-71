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
