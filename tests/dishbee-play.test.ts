import { describe, expect, test } from "bun:test";
import {
  BRAND_THEMES, FOOD_SUITS, GAME_CATALOGUE, INGREDIENTS, RECIPES,
  isBrandTheme, makePairs, recipeMatches,
} from "../src/lib/dishbee-play";

describe("Dishbee Play entertainment-only games", () => {
  test("uses four food suits, not traditional gambling suits", () => {
    expect(FOOD_SUITS.map((item) => item.symbol)).toEqual(["🍔", "🌮", "🍟", "🥤"]);
    expect(new Set(FOOD_SUITS.map((item) => item.id)).size).toBe(4);
    expect(GAME_CATALOGUE.filter((game) => game.state === "playable").map((game) => game.id)).toEqual(["pairs", "recipe"]);
    expect(JSON.stringify(GAME_CATALOGUE)).not.toMatch(/wager|stake|cash_prize|jackpot|redeemable/);
  });
  test("memory games contain exactly six matching pairs and unique card IDs", () => {
    for (let trial = 0; trial < 30; trial += 1) {
      const cards = makePairs();
      expect(cards).toHaveLength(12);
      expect(new Set(cards.map((card) => card.id)).size).toBe(12);
      const symbols = new Map<string, number>();
      for (const card of cards) symbols.set(card.food, (symbols.get(card.food) ?? 0) + 1);
      expect([...symbols.values()]).toEqual([2, 2, 2, 2, 2, 2]);
    }
  });
  test("recipe acceptance requires exact ingredient sets", () => {
    expect(INGREDIENTS).toHaveLength(9);
    for (const recipe of RECIPES) {
      expect(recipeMatches([...recipe.ingredients].reverse(), recipe.ingredients)).toBe(true);
      expect(recipeMatches(["bun"], recipe.ingredients)).toBe(false);
      expect(recipeMatches([...recipe.ingredients, "extra"], recipe.ingredients)).toBe(false);
    }
    expect(recipeMatches(["bun", "bun", "lettuce"], RECIPES[0].ingredients)).toBe(false);
  });
  test("brand skins accept only known food brands", () => {
    for (const brand of Object.keys(BRAND_THEMES)) expect(isBrandTheme(brand)).toBe(true);
    expect(isBrandTheme("unknown-brand")).toBe(false);
    expect(isBrandTheme({})).toBe(false);
  });
});
