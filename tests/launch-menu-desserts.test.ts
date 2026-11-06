import { describe, expect, test } from "bun:test";
import { launchMenuBrands } from "../src/lib/launch-menu-catalogue";
import { getLaunchDessertRecommendations } from "../src/lib/launch-menu-desserts";
import {
  addLaunchPick,
  decodeLaunchPicks,
  encodeLaunchPicks,
  findLaunchMenuItem,
} from "../src/lib/launch-menu-picks";
import { normaliseCheckoutSelection } from "../src/lib/mealdeck-checkout-selection";

const ace = "skorch-burgers-beef-smash-deck-the-ace";
const basePicks = () => addLaunchPick([], "skorch-burgers", ace, {}, 1);

function currentCatalogue() {
  const catalogue = structuredClone(launchMenuBrands);
  for (const brand of catalogue)
    for (const section of brand.sections) for (const item of section.items) item.available = true;
  return catalogue;
}

describe("Optional milkcake recommendations", () => {
  test("offers each flavour once after food or drinks, prioritising the menu being browsed", () => {
    const catalogue = currentCatalogue();
    for (const brand of catalogue) {
      const recommendations = getLaunchDessertRecommendations(basePicks(), catalogue, brand.id);
      expect(recommendations.map(({ item }) => [item.name, item.pricePence])).toEqual([
        ["Biscoff Milkcake", 399],
        ["Oreo Milkcake", 399],
      ]);
      expect(recommendations.every((entry) => entry.brand.id === brand.id)).toBe(true);
    }
    const drink = addLaunchPick([], "moktl", "moktl-mocktail-lounge-virgin-mojito", {});
    expect(
      getLaunchDessertRecommendations(drink, catalogue).map((entry) => entry.brand.id),
    ).toEqual(["moktl", "moktl"]);
    expect(getLaunchDessertRecommendations([], catalogue)).toEqual([]);
  });

  test("never advertises source-only, hidden or unpriced desserts as available", () => {
    expect(getLaunchDessertRecommendations(basePicks(), launchMenuBrands)).toEqual([]);
    const catalogue = currentCatalogue();
    for (const brand of catalogue) {
      const desserts = brand.sections.find((section) => section.id === "desserts")!;
      desserts.items[0]!.available = false;
      desserts.items[1]!.pricePence = null;
    }
    expect(getLaunchDessertRecommendations(basePicks(), catalogue)).toEqual([]);
  });

  test("uses current names and prices and finds one available alternative per flavour", () => {
    const catalogue = currentCatalogue();
    findLaunchMenuItem(
      "skorch-burgers",
      "skorch-burgers-desserts-biscoff-milkcake",
      catalogue,
    )!.item.available = false;
    const oreo = findLaunchMenuItem(
      "skorch-burgers",
      "skorch-burgers-desserts-oreo-milkcake",
      catalogue,
    )!.item;
    oreo.name = "Oreo Milk Cake";
    oreo.pricePence = 449;
    const recommendations = getLaunchDessertRecommendations(basePicks(), catalogue, "skorch");
    expect(recommendations).toHaveLength(2);
    expect(recommendations[0]!.brand.id).not.toBe("skorch-burgers");
    expect(recommendations[0]!.item.id).toEndWith("-biscoff-milkcake");
    expect(recommendations[1]!.item).toMatchObject({ name: "Oreo Milk Cake", pricePence: 449 });
    expect(
      launchMenuBrands
        .flatMap((brand) => brand.sections.flatMap((section) => section.items))
        .find((item) => item.id === oreo.id)!.pricePence,
    ).toBe(399);
  });

  test("stops prompting after either dessert is present, across brands and current stock states", () => {
    const catalogue = currentCatalogue();
    for (const brand of catalogue) {
      for (const flavour of ["biscoff", "oreo"]) {
        const id = `${brand.id}-desserts-${flavour}-milkcake`;
        const picks = addLaunchPick(basePicks(), brand.id, id, {});
        expect(picks).toHaveLength(2);
        findLaunchMenuItem(brand.id, id, catalogue)!.item.available = false;
        expect(getLaunchDessertRecommendations(picks, catalogue, "skorch-burgers")).toEqual([]);
      }
    }
  });

  test("adds a separate item that survives saved-basket and server packing normalisation", () => {
    const original = basePicks();
    const [recommendation] = getLaunchDessertRecommendations(original, currentCatalogue());
    const picks = addLaunchPick(original, recommendation!.brand.id, recommendation!.item.id, {}, 1);
    expect(original).toHaveLength(1);
    expect(picks[0]).toEqual(original[0]);
    expect(picks[1]).toMatchObject({ quantity: 1, selections: {} });
    expect(picks[1]!.crossSelections).toBeUndefined();
    const restored = decodeLaunchPicks(encodeLaunchPicks(picks));
    expect(restored).toEqual(picks);
    const canonical = normaliseCheckoutSelection(
      {
        action: "quote",
        fulfilment: "pickup",
        picks: restored.map(({ key: _key, ...pick }) => pick),
        packing: {
          cutleryRequested: false,
          separateBags: true,
          bagCount: 2,
          allocations: [
            { lineId: "line-1", bag: 1, quantity: 1 },
            { lineId: "line-2", bag: 2, quantity: 1 },
          ],
        },
      },
      "00000000-0000-4000-8000-000000000001",
    );
    expect(canonical.lines).toEqual([
      {
        lineId: "line-1",
        parentLineId: null,
        sku: ace,
        quantity: 1,
        modifiers: [],
        attachment: null,
      },
      {
        lineId: "line-2",
        parentLineId: null,
        sku: recommendation!.item.id,
        quantity: 1,
        modifiers: [],
        attachment: null,
      },
    ]);
    expect(canonical.packingPlan.bags[1]!.allocations).toEqual([{ lineId: "line-2", quantity: 1 }]);
  });

  test("avoids one-tap additions that need customisation or exceed the basket limit", () => {
    const catalogue = currentCatalogue();
    for (const brand of catalogue)
      for (const item of brand.sections.find((section) => section.id === "desserts")!.items)
        item.optionGroupIds = ["future-required-dessert-choice"];
    expect(getLaunchDessertRecommendations(basePicks(), catalogue)).toEqual([]);
    const full = basePicks().map((pick) => ({ ...pick, quantity: 60 }));
    expect(getLaunchDessertRecommendations(full, currentCatalogue())).toEqual([]);
  });
});
