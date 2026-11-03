import { describe, expect, test } from "bun:test";
import {
  adjustSampleBasket, summariseSampleBasket,
  SAMPLE_MAX_ITEMS, SAMPLE_MAX_PER_DISH,
} from "../src/lib/mealdeck-preview-basket";
import type { MenuItem } from "../src/lib/mealdeck";

const burger: MenuItem = {
  id: "skorch-1", brandId: "skorch-burgers", category: "Burgers",
  name: "Skorch Double Smash", pricePence: 999,
};
const drink: MenuItem = {
  id: "moktl-1", brandId: "moktl", category: "Drinks",
  name: "Moktl Citrus Cooler", pricePence: 425,
};
describe("Coming Soon: one multi-brand sample deck", () => {
  test("repeated additions increment quantity; one delivery fee is never fabricated", () => {
    let lines = adjustSampleBasket([], burger, 1);
    lines = adjustSampleBasket(lines, burger, 1);
    lines = adjustSampleBasket(lines, drink, 1);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.quantity).toBe(2);
    expect(summariseSampleBasket(lines)).toEqual({
      valid: true, dishes: 3, brands: 2, subtotalPence: 2423,
    });
    lines = adjustSampleBasket(lines, burger, -1);
    expect(summariseSampleBasket(lines).subtotalPence).toBe(1424);
    lines = adjustSampleBasket(lines, burger, -1);
    expect(lines.map(line => line.item.id)).toEqual(["moktl-1"]);
  });
  test("removing absent dishes does not alter a basket", () => {
    expect(adjustSampleBasket([], drink, -1)).toEqual([]);
  });
  test("per-dish and entire deck caps reject extras", () => {
    const max = Array.from({ length: SAMPLE_MAX_PER_DISH }, () => burger)
      .reduce((lines) => adjustSampleBasket(lines, burger, 1), [] as ReturnType<typeof adjustSampleBasket>);
    expect(summariseSampleBasket(max).dishes).toBe(SAMPLE_MAX_PER_DISH);
    expect(adjustSampleBasket(max, burger, 1)).toEqual(max);
    const sixty = [burger, drink, { ...drink, id: "icova-1", brandId: "icova" }]
      .reduce((lines, item) =>
        Array.from({ length: SAMPLE_MAX_PER_DISH }).reduce(
          current => adjustSampleBasket(current, item, 1), lines,
        ), [] as ReturnType<typeof adjustSampleBasket>);
    expect(summariseSampleBasket(sixty).dishes).toBe(SAMPLE_MAX_ITEMS);
    expect(adjustSampleBasket(sixty, { ...drink, id: "extra" }, 1)).toEqual(sixty);
  });
  test("rejects invalid, duplicate, spoofed and over-limit amounts", () => {
    const invalid = { ...burger, pricePence: -1 };
    expect(adjustSampleBasket([], invalid, 1)).toEqual([]);
    expect(adjustSampleBasket([], { ...burger, pricePence: Number.NaN }, 1)).toEqual([]);
    expect(summariseSampleBasket([{ item: burger, quantity: 1 }, { item: burger, quantity: 1 }]).valid).toBe(false);
    expect(summariseSampleBasket([{ item: burger, quantity: 21 }]).valid).toBe(false);
    expect(adjustSampleBasket([{ item: burger, quantity: 1 }], { ...burger, brandId: "other" }, 1))
      .toEqual([{ item: burger, quantity: 1 }]);
    expect(summariseSampleBasket([{ item: { ...burger, pricePence: 10_000_000 }, quantity: 2 }]).valid).toBe(false);
  });
});
