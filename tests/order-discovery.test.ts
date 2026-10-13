import { describe, expect, test } from "bun:test";
import { cafe1Menu, coreMenu } from "../src/lib/sample-menus";
import { addItem, brandById } from "../src/lib/mealdeck";
import {
  ORDER_CATEGORIES, categoryCounts, orderCategoryFor, searchCatalogue,
  suggestedAdditions,
} from "../src/lib/order-discovery";

const find = (id: string) => [...coreMenu, ...cafe1Menu].find(item => item.id === id)!;

describe("MealDeck category → brand → menu discovery", () => {
  test("uses real food rather than broad brand shortcuts", () => {
    expect(orderCategoryFor(find("taconelle-1"))).toBe("french-tacos");
    expect(orderCategoryFor(find("loadd-1"))).toBe("french-tacos");
    expect(orderCategoryFor(find("skorch-1"))).toBe("burgers");
    expect(orderCategoryFor(find("tavo-1"))).toBe("chicken");
    expect(orderCategoryFor(find("vyta-1"))).toBe("healthy");
    expect(orderCategoryFor(find("c1-cornflake-tart"))).toBe("desserts");
    expect(orderCategoryFor(find("c1-lasagne"))).toBe("pasta");
    expect(orderCategoryFor(find("c1-full-english-regular"))).toBe("breakfast");
    expect(orderCategoryFor(find("forvello-1"))).toBe("pizza");
    expect(orderCategoryFor(find("rise-1"))).toBe("breakfast");
  });
  test("category counts reflect only actual catalogue entries", () => {
    const counts = categoryCounts(coreMenu);
    expect(counts.all).toBe(coreMenu.length);
    expect(ORDER_CATEGORIES.filter(category => category.id !== "all").reduce((n, cat) => n + counts[cat.id], 0)).toBe(coreMenu.length);
    expect(counts["french-tacos"]).toBeGreaterThanOrEqual(2);
    expect(categoryCounts([]).all).toBe(0);
  });
  test("searches dish name, restaurant, description and selected category", () => {
    const byBrand = searchCatalogue(coreMenu, {
      search: "SkOrCh",
      brandName: id => brandById(id)?.name ?? id,
    });
    expect(byBrand).toHaveLength(1);
    expect(byBrand[0]?.id).toBe("skorch-1");
    const frenchTaco = searchCatalogue(coreMenu, { category: "french-tacos" });
    expect(frenchTaco.map(item => item.id)).toContain("taconelle-1");
    expect(frenchTaco.map(item => item.id)).toContain("loadd-1");
    expect(searchCatalogue(coreMenu, { category: "french-tacos", brandId: "taconelle" }).map(i => i.id))
      .toEqual(["taconelle-1"]);
    expect(searchCatalogue(coreMenu, { search: "xyznotavailable" })).toHaveLength(0);
  });
});

describe("MealDeck optional suggestions", () => {
  const catalogue = [...cafe1Menu, ...coreMenu];
  const burger = find("skorch-1");
  const lines = addItem([], burger);
  test("never invents items, prices, promotions or baskets", () => {
    expect(suggestedAdditions(catalogue, [])).toEqual([]);
    const suggestions = suggestedAdditions(catalogue, lines);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]?.kind).toBe("drink");
    expect(suggestions.map(s => s.item.id)).not.toContain(burger.id);
    for (const suggestion of suggestions) {
      expect(catalogue.some(item => item.id === suggestion.item.id)).toBe(true);
      expect(suggestion.item.pricePence).toBeGreaterThan(0);
      expect(suggestion.explanation).not.toMatch(/free|discount|half.price|coupon|deal/);
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(1);
  });
  test("won't repeatedly recommend a drink already in the basket", () => {
    const withCoffee = addItem(lines, find("icova-1"));
    const suggestions = suggestedAdditions(catalogue, withCoffee);
    expect(suggestions.some(s => s.item.id === "icova-1")).toBe(false);
    expect(suggestions.some(s => s.kind === "drink")).toBe(false);
    expect(suggestedAdditions(catalogue, withCoffee, 0)).toEqual([]);
  });
  test("does not display unavailable venue catalogue items", () => {
    const suggestions = suggestedAdditions(coreMenu, lines);
    expect(suggestions.every(s => coreMenu.some(i => i.id === s.item.id))).toBe(true);
    expect(suggestions.some(s => s.item.brandId === "cafe1")).toBe(false);
  });
});
