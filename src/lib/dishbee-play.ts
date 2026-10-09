/**
 * Dishbee Play: entertainment-only card games.
 * Invariant: gameplay results MUST NOT create monetary value, loyalty points,
 * discount codes, food rewards or payment entitlements.
 * The verified-order loyalty ledger is a separate server-side system.
 */

/** Food-suit artwork keys. Artwork itself lives in src/lib/food-suit-artwork.ts. */
export type SuitArt = "burger" | "french-taco" | "chicken" | "cake" | "fries" | "drink" | "paratha";

export const FOOD_SUITS = [
  { id: "burger", symbol: "🍔", art: "burger", label: "Burgers", brand: "Skorch" },
  { id: "taco", symbol: "🌮", art: "french-taco", label: "Tacos", brand: "Taconelle" },
  { id: "fries", symbol: "🍟", art: "fries", label: "Fries", brand: "Load'd" },
  { id: "drinks", symbol: "🥤", art: "drink", label: "Drinks", brand: "Vyta" },
] as const;

export const GAME_CATALOGUE = [
  { id: "pairs", name: "Food Pairs", description: "Find six food pairs in as few moves as possible.", state: "playable" },
  { id: "recipe", name: "Recipe Rush", description: "Build three recipes from the correct ingredient cards.", state: "playable" },
  { id: "go-dish", name: "Go Dish!", description: "Build food-suit sets and ask opponents for matches.", state: "planned" },
  { id: "kitchen-chaos", name: "Kitchen Chaos", description: "An original colour and food-suit shedding game.", state: "planned" },
  { id: "solitaire", name: "MealDeck Solitaire", description: "Sort your food cards into complete kitchen stacks.", state: "planned" },
  { id: "full-house", name: "Full House", description: "Complete food-themed hands with fixed, transparent rules.", state: "planned" },
] as const;

export const BRAND_THEMES = {
  mealdeck: { label: "MealDeck", symbol: "🃏", art: "cake", accent: "#f8c94c", subtitle: "Every brand. One place to play." },
  skorch: { label: "Skorch Burgers", symbol: "🍔", art: "burger", accent: "#fb923c", subtitle: "Fire up your next round." },
  taconelle: { label: "Taconelle", symbol: "🌮", art: "french-taco", accent: "#b1ef8b", subtitle: "A fresh twist on game night." },
  loadd: { label: "Load'd", symbol: "🍟", art: "fries", accent: "#ff8c8c", subtitle: "Play fully loaded." },
  paratique: { label: "Paratique", symbol: "🫓", art: "paratha", accent: "#e8b77e", subtitle: "The perfect playtime pairing." },
  tavo: { label: "Tavo Chicken", symbol: "🍗", art: "chicken", accent: "#e8ad64", subtitle: "Bring your A-game." },
  vyta: { label: "Vyta", symbol: "🥤", art: "drink", accent: "#8bdfe0", subtitle: "Play refreshed." },
} as const;
export type BrandTheme = keyof typeof BRAND_THEMES;
export function isBrandTheme(value: unknown): value is BrandTheme {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(BRAND_THEMES, value);
}

export type PairCard = { id: number; food: string; art: SuitArt; label: string };
const FOODS: readonly [string, SuitArt, string][] = [
  ["🍔", "burger", "Burger"], ["🌮", "french-taco", "Taco"], ["🍟", "fries", "Fries"],
  ["🥤", "drink", "Drink"], ["🍗", "chicken", "Chicken"], ["🫓", "paratha", "Paratha"],
];

/** Shuffling changes only entertainment puzzles, never a reward or redemption. */
export function makePairs(): PairCard[] {
  const cards = FOODS.flatMap(([food, art, label], pair) => [
    { id: pair * 2, food, art, label }, { id: pair * 2 + 1, food, art, label },
  ]);
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = cards[i]!;
    cards[i] = cards[j]!;
    cards[j] = temp;
  }
  return cards;
}

/** Ingredient tile artwork keys, mapped in src/lib/food-suit-artwork.ts. */
export type TileArt = "bun" | "patty" | "lettuce" | "tortilla" | "chicken" | "salsa" | "fries" | "cheese" | "sauce";

export const INGREDIENTS = [
  { id: "bun", label: "Bun", emoji: "🍞", art: "bun" },
  { id: "patty", label: "Patty", emoji: "🥩", art: "patty" },
  { id: "lettuce", label: "Lettuce", emoji: "🥬", art: "lettuce" },
  { id: "tortilla", label: "Tortilla", emoji: "🫓", art: "tortilla" },
  { id: "chicken", label: "Chicken", emoji: "🍗", art: "chicken" },
  { id: "salsa", label: "Salsa", emoji: "🍅", art: "salsa" },
  { id: "fries", label: "Fries", emoji: "🍟", art: "fries" },
  { id: "cheese", label: "Cheese", emoji: "🧀", art: "cheese" },
  { id: "sauce", label: "Sauce", emoji: "🥫", art: "sauce" },
] as const;

export const RECIPES = [
  { label: "Skorch Burger", emoji: "🍔", art: "burger", ingredients: ["bun", "patty", "lettuce"] },
  { label: "Taconelle Taco", emoji: "🌮", art: "french-taco", ingredients: ["tortilla", "chicken", "salsa"] },
  { label: "Load'd Fries", emoji: "🍟", art: "fries", ingredients: ["fries", "cheese", "sauce"] },
] as const;

export function recipeMatches(selected: string[], target: readonly string[]): boolean {
  return selected.length === target.length && new Set(selected).size === target.length && selected.every((item) => target.includes(item));
}
