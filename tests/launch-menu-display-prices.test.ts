import { describe, expect, test } from "bun:test";
import { getLaunchMenuBrand, launchMenuBrands } from "../src/lib/launch-menu-catalogue";
import {
  formatLaunchMenuPrice,
  launchMenuBasketDisplayPrice,
  launchMenuCrossChoicePrice,
  launchMenuPickDisplayPrice,
} from "../src/lib/launch-menu-display-prices";
import type { LaunchMenuSelections } from "../src/lib/launch-menu-picks";
import { setLaunchCrossChoice } from "../src/lib/launch-menu-upsells";

const brand = getLaunchMenuBrand("skorch-burgers")!;
const burger = brand.sections.find((section) => section.id === "beef-smash-deck")!.items[0]!;
const sideId = "loadd-loaded-fries-king-of-hearts";
const drinkId = "moktl-mocktail-lounge-mango-mirage";
const mealGroup = "skorch-burgers-make-it-a-meal";
const upgradeGroup = "skorch-burgers-meal-upgrades";
const meal: LaunchMenuSelections = { [mealGroup]: [`${mealGroup}-make-it-a-meal`] };

function burgerPick(quantity = 1) {
  return { brandId: brand.id, itemId: burger.id, quantity, selections: {} };
}

function bothChoices(mode: "extra" | "upgrade") {
  const side = setLaunchCrossChoice(
    brand,
    burger,
    mode === "upgrade" ? meal : {},
    [],
    "loadd-side-" + mode,
    sideId,
  );
  return setLaunchCrossChoice(
    brand,
    burger,
    side.selections,
    side.crossSelections,
    "moktl-drink-" + mode,
    drinkId,
  );
}

describe("Launch menu displayed prices", () => {
  test("formats integer pence in GBP and never makes missing or invalid prices free", () => {
    expect(formatLaunchMenuPrice(2_000)).toBe("£20.00");
    expect(formatLaunchMenuPrice(0)).toBe("£0.00");
    for (const missing of [null, -1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(formatLaunchMenuPrice(missing)).toBe("Price unavailable");
    }
  });

  test("every source item displays its actual price and variable items require an explicit complete selection", () => {
    let count = 0;
    for (const menuBrand of launchMenuBrands) {
      for (const section of menuBrand.sections) {
        for (const item of section.items) {
          const firstVariant = item.priceVariants?.[0];
          const selections = firstVariant
            ? Object.fromEntries(
                Object.entries(firstVariant.selections).map(([key, value]) => [key, [value]]),
              )
            : {};
          const price = launchMenuPickDisplayPrice({
            brandId: menuBrand.id,
            itemId: item.id,
            quantity: 1,
            selections,
          });
          expect(price.baseUnitPence).toBe(firstVariant?.pricePence ?? item.pricePence);
          expect(price.itemsSubtotalPence).toBe(firstVariant?.pricePence ?? item.pricePence);
          if (firstVariant)
            expect(
              launchMenuPickDisplayPrice({
                brandId: menuBrand.id,
                itemId: item.id,
                quantity: 1,
                selections: {},
              }).itemsSubtotalPence,
            ).toBeNull();
          count++;
        }
      }
    }
    expect(count).toBe(79);
  });

  test("reads current catalogue prices instead of amounts attached to saved browser picks", () => {
    const forged = { ...burgerPick(3), pricePence: 1, totalPence: 3, discountPence: 5_999 };
    const price = launchMenuPickDisplayPrice(forged);
    expect(price.baseUnitPence).toBe(399);
    expect(price.itemsSubtotalPence).toBe(1_197);
  });

  test("separate Load’d and Moktl extras are one full item per parent unit", () => {
    const price = launchMenuPickDisplayPrice({ ...burgerPick(2), ...bothChoices("extra") });
    expect(price.baseLinePence).toBe(798);
    expect(price.additions.map((entry) => [entry.mode, entry.unitPence, entry.linePence])).toEqual([
      ["extra", 550, 1_100],
      ["extra", 450, 900],
    ]);
    expect(price.itemsSubtotalPence).toBe(2_798);
  });

  test("meal, side upgrade and drink upgrade use their specified surcharges per parent unit", () => {
    const price = launchMenuPickDisplayPrice({ ...burgerPick(2), ...bothChoices("upgrade") });
    expect(price.options.map((option) => [option.label, option.linePence])).toEqual([
      ["Make it a meal", 500],
    ]);
    expect(price.additions.map((entry) => [entry.mode, entry.unitPence, entry.linePence])).toEqual([
      ["upgrade", 299, 598],
      ["upgrade", 299, 598],
    ]);
    expect(price.itemsSubtotalPence).toBe(2_494);
    expect(launchMenuCrossChoicePrice("upgrade", "loadd", sideId)).toBe(299);
    expect(launchMenuCrossChoicePrice("upgrade", "loadd", "loadd-loaded-mac-cheese-ace-mac")).toBe(
      399,
    );
    expect(launchMenuCrossChoicePrice("extra", "loadd", "loadd-loaded-mac-cheese-ace-mac")).toBe(
      500,
    );
    expect(launchMenuCrossChoicePrice("upgrade", "moktl", "moktl-mocktail-lounge-rush-hour")).toBe(
      299,
    );
    expect(launchMenuCrossChoicePrice("extra", "moktl", "moktl-mocktail-lounge-rush-hour")).toBe(
      600,
    );
  });

  test("named replacements remove generic upgrades before calculating, preventing double charges", () => {
    const config = bothChoices("upgrade");
    const price = launchMenuPickDisplayPrice({
      ...burgerPick(2),
      crossSelections: config.crossSelections,
      selections: {
        ...meal,
        [upgradeGroup]: [`${upgradeGroup}-loaded-fries`, `${upgradeGroup}-mocktail`],
      },
    });
    expect(price.options.map((option) => option.optionId)).toEqual([`${mealGroup}-make-it-a-meal`]);
    expect(price.additions).toHaveLength(2);
    expect(price.itemsSubtotalPence).toBe(2_494);
  });

  test("each selected optional add-on is charged once for every parent unit", () => {
    const addOns = "skorch-burgers-burger-add-ons";
    const price = launchMenuPickDisplayPrice({
      ...burgerPick(3),
      selections: { [addOns]: [`${addOns}-2-rashers`, `${addOns}-cheese-slice`] },
    });
    expect(price.options.map((option) => option.linePence)).toEqual([597, 150]);
    expect(price.itemsSubtotalPence).toBe(1_944);
  });

  test("included portion and flavour choices do not add a second charge", () => {
    const price = launchMenuPickDisplayPrice({
      brandId: "tavo-chicken",
      itemId: "tavo-chicken-fried-chicken-wings-fried-chicken-wings",
      quantity: 2,
      selections: {
        "tavo-chicken-portion": ["tavo-chicken-portion-8-pcs"],
        "tavo-chicken-flavour": ["tavo-chicken-flavour-korean-bbq"],
      },
    });
    expect(price.options.map((option) => option.linePence)).toEqual([0, 0]);
    expect(price.itemsSubtotalPence).toBe(1_598);
  });

  test("Souvano includes its chosen side and only adds a separately priced cross-brand extra", () => {
    const souvano = getLaunchMenuBrand("souvano")!;
    const heatwave = souvano.sections.find((section) => section.id === "heatwave")!.items[0]!;
    const config = setLaunchCrossChoice(
      souvano,
      heatwave,
      { "souvano-heatwave-base": ["souvano-heatwave-base-fries"] },
      [],
      "loadd-side-extra",
      sideId,
    );
    const price = launchMenuPickDisplayPrice({
      brandId: souvano.id,
      itemId: heatwave.id,
      quantity: 2,
      ...config,
    });
    expect(price.options.map((option) => option.linePence)).toEqual([0]);
    expect(price.additions.map((addition) => addition.linePence)).toEqual([1100]);
    expect(price.itemsSubtotalPence).toBe(2498);
  });

  test("legacy generic upgrades remain charged when there is no named replacement", () => {
    const price = launchMenuPickDisplayPrice({
      ...burgerPick(),
      selections: { ...meal, [upgradeGroup]: [`${upgradeGroup}-loaded-fries`] },
    });
    expect(price.options).toHaveLength(2);
    expect(price.additions).toHaveLength(0);
    expect(price.itemsSubtotalPence).toBe(948);
  });

  test("removing the meal drops stale upgrades rather than charging hidden selections", () => {
    const config = bothChoices("upgrade");
    const price = launchMenuPickDisplayPrice({
      ...burgerPick(),
      selections: { [upgradeGroup]: [`${upgradeGroup}-loaded-fries`] },
      crossSelections: config.crossSelections,
    });
    expect(price.options).toHaveLength(0);
    expect(price.additions).toHaveLength(0);
    expect(price.itemsSubtotalPence).toBe(399);
  });

  test("basket subtotal combines quantities, modifiers and separate dishes without delivery assumptions", () => {
    const basket = launchMenuBasketDisplayPrice([
      burgerPick(2),
      { ...burgerPick(2), ...bothChoices("upgrade") },
      { brandId: "moktl", itemId: drinkId, quantity: 3, selections: {} },
    ]);
    expect(basket.itemsSubtotalPence).toBe(4_642);
    expect(basket.hasPaidChoices).toBe(true);
    expect(launchMenuBasketDisplayPrice([]).itemsSubtotalPence).toBe(0);
  });

  test("Tavo dip is one £1.50 selection, with no additional flavour charge", () => {
    const price = launchMenuPickDisplayPrice({
      brandId: "tavo-chicken",
      itemId: "tavo-chicken-burgers-cruncher",
      quantity: 2,
      selections: { "tavo-chicken-dipped-burger": ["tavo-chicken-dipped-burger-korean-bbq"] },
    });
    expect(price.options.map((option) => option.linePence)).toEqual([300]);
    expect(price.itemsSubtotalPence).toBe(1198);
  });

  test("unknown items and invalid quantities never turn into a misleading partial subtotal", () => {
    const unknown = { ...burgerPick(), itemId: "unknown" };
    expect(launchMenuPickDisplayPrice(unknown).itemsSubtotalPence).toBeNull();
    expect(launchMenuBasketDisplayPrice([burgerPick(), unknown]).itemsSubtotalPence).toBeNull();
    expect(launchMenuCrossChoicePrice("upgrade", "loadd", "unknown")).toBeNull();
    for (const quantity of [0, -1, 1.5, NaN, Infinity, 21]) {
      expect(launchMenuPickDisplayPrice(burgerPick(quantity)).itemsSubtotalPence).toBeNull();
    }
  });
});
