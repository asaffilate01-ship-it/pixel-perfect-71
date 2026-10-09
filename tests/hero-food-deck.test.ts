import { describe, expect, test } from "bun:test";
import { heroFoodDeck, foodRanks, chefTitles } from "../src/lib/hero-food-deck";

describe("Hero food deck", () => {
  for (const suit of ["burger", "french-taco", "chicken", "cake"]) {
    test(`${suit} has exactly 13 unique ranks`, () => {
      const cards = heroFoodDeck.filter((card) => card.suit === suit);
      expect(cards).toHaveLength(13);
      expect(cards.map((card) => card.rank)).toEqual(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "C", "H", "M"]);
    });
  }
  test("C H M replace J Q K with culinary titles", () => {
    expect(chefTitles).toEqual({ C: "Chef", H: "Head chef", M: "Master chef" });
    expect(foodRanks).not.toContain("J");
    expect(foodRanks).not.toContain("Q");
    expect(foodRanks).not.toContain("K");
    expect(new Set(heroFoodDeck.map((card) => card.id)).size).toBe(52);
  });
});