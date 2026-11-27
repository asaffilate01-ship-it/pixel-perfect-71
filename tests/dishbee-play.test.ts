import { describe, expect, test } from "bun:test";
import {
  BRAND_FOODS, BRAND_THEMES, FOOD_SUITS, GAME_CATALOGUE, INGREDIENTS, RECIPES,
  isBrandTheme, makePairs, recipeMatches, createPairRound, revealPairCard, resolvePairTurn,
  isPairRoundComplete, parsePairBest, choosePairBest, PAIR_COUNTS,
} from "../src/lib/dishbee-play";

describe("Dishbee Play entertainment-only games", () => {
  test("uses four food suits, not traditional gambling suits", () => {
    expect(FOOD_SUITS.map((item) => item.id)).toEqual(["burger", "chicken", "french-taco", "cake"]);
    expect(FOOD_SUITS.map((item) => item.art)).toEqual(["burger", "chicken", "french-taco", "cake"]);
    expect(new Set(FOOD_SUITS.map((item) => item.id)).size).toBe(4);
    expect(GAME_CATALOGUE.filter((game) => game.state === "playable").map((game) => game.id))
      .toEqual(["snack-trail", "skewer-sort", "pantry-sweep", "bento-sudoku", "tray-lines", "sauce-switch", "menu-quest", "tray-tactics", "feast-2048", "four-to-feast", "order-echo", "kitchen-shuffle", "pairs", "recipe", "kitchen-chaos", "snap", "go-dish", "full-house", "solitaire"]);
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
  test("every brand skin deals its own six-dish deck", () => {
    for (const brand of Object.keys(BRAND_THEMES) as (keyof typeof BRAND_THEMES)[]) {
      const dishes = BRAND_FOODS[brand].map(([art]) => art);
      expect(dishes).toHaveLength(6);
      expect(new Set(dishes).size).toBe(6);
      const cards = makePairs(brand);
      expect(cards).toHaveLength(12);
      expect(new Set(cards.map((card) => card.art)).size).toBe(6);
      const counts = new Map<string, number>();
      for (const card of cards) counts.set(card.food, (counts.get(card.food) ?? 0) + 1);
      expect([...counts.values()]).toEqual([2, 2, 2, 2, 2, 2]);
    }
    // Skorch and Vyta must not deal the same deck — "Play as" has to mean something.
    expect(BRAND_FOODS.skorch.map(([art]) => art)).not.toEqual(BRAND_FOODS.vyta.map(([art]) => art));
    expect(BRAND_FOODS.skorch.map(([art]) => art)).not.toEqual(BRAND_FOODS.mealdeck.map(([art]) => art));
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


describe("Food Pairs difficulty and safe turn resolution", () => {
  test("every brand has exactly the requested number of unique pairs at all sizes", () => {
    for (const brand of Object.keys(BRAND_THEMES) as (keyof typeof BRAND_THEMES)[]) {
      for (const count of PAIR_COUNTS) {
        const cards = makePairs(brand, count, () => 0.5);
        expect(cards).toHaveLength(count * 2);
        expect(new Set(cards.map((card) => card.id)).size).toBe(count * 2);
        const foods = new Map<string, number>();
        for (const card of cards) foods.set(card.food, (foods.get(card.food) ?? 0) + 1);
        expect([...foods.values()]).toEqual(Array(count).fill(2));
        expect(makePairs(brand, count, () => 0.5)).toEqual(cards);
      }
    }
  });

  test("ignores double taps, unknown cards, third-card taps and already matched cards", () => {
    const cards = makePairs("mealdeck", 4, () => 0.5);
    const first = cards[0]!;
    const match = cards.find((card) => card.food === first.food && card.id !== first.id)!;
    const other = cards.find((card) => card.food !== first.food)!;
    let state = createPairRound(cards);
    state = revealPairCard(state, first.id);
    expect(revealPairCard(state, first.id)).toBe(state);
    expect(revealPairCard(state, -1)).toBe(state);
    state = revealPairCard(state, match.id);
    expect(state.moves).toBe(1);
    expect(revealPairCard(state, other.id)).toBe(state);
    state = resolvePairTurn(state);
    expect(state.matched).toEqual([first.id, match.id]);
    expect(revealPairCard(state, match.id)).toBe(state);
    expect(resolvePairTurn(state)).toBe(state);
  });

  test("mismatches count as one move and a perfect round finishes after all pairs", () => {
    const cards = makePairs("mealdeck", 8, () => 0);
    const a = cards[0]!;
    const b = cards.find((card) => card.food !== a.food)!;
    let state = resolvePairTurn(revealPairCard(revealPairCard(createPairRound(cards), a.id), b.id));
    expect(state.moves).toBe(1);
    expect(state.matched).toEqual([]);
    expect(state.flipped).toEqual([]);
    for (const food of new Set(cards.map((card) => card.food))) {
      const [first, second] = cards.filter((card) => card.food === food);
      state = resolvePairTurn(revealPairCard(revealPairCard(state, first!.id), second!.id));
    }
    expect(isPairRoundComplete(state)).toBe(true);
    expect(state.moves).toBe(9);
    expect(revealPairCard(state, a.id)).toBe(state);
    expect(isPairRoundComplete(createPairRound())).toBe(false);
  });

  test("only plausible completed-move counts can become a personal best", () => {
    for (const raw of [null, "", " 8 ", "8.5", "-1", "3", "NaN", "100001", "Infinity"]) {
      expect(parsePairBest(raw, 8)).toBeNull();
    }
    expect(parsePairBest("8", 8)).toBe(8);
    expect(choosePairBest(null, 12, 8)).toBe(12);
    expect(choosePairBest(12, 10, 8)).toBe(10);
    expect(choosePairBest(10, 12, 8)).toBe(10);
    expect(choosePairBest(10, 3, 8)).toBe(10);
  });
});
