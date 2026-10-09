/**
 * Dishbee Play: entertainment-only card games.
 * Invariant: gameplay results MUST NOT create monetary value, loyalty points,
 * discount codes, food rewards or payment entitlements.
 * The verified-order loyalty ledger is a separate server-side system.
 */
export const FOOD_SUITS = [
  { id: "burger", symbol: "🍔", label: "Burgers", brand: "Skorch" },
  { id: "taco", symbol: "🌮", label: "Tacos", brand: "Taconelle" },
  { id: "fries", symbol: "🍟", label: "Fries", brand: "Load'd" },
  { id: "drinks", symbol: "🥤", label: "Drinks", brand: "Vyta" },
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
  mealdeck: { label: "MealDeck", symbol: "🃏", accent: "#f8c94c", subtitle: "Every brand. One place to play." },
  skorch: { label: "Skorch Burgers", symbol: "🍔", accent: "#fb923c", subtitle: "Fire up your next round." },
  taconelle: { label: "Taconelle", symbol: "🌮", accent: "#b1ef8b", subtitle: "A fresh twist on game night." },
  loadd: { label: "Load'd", symbol: "🍟", accent: "#ff8c8c", subtitle: "Play fully loaded." },
  paratique: { label: "Paratique", symbol: "🫓", accent: "#e8b77e", subtitle: "The perfect playtime pairing." },
  tavo: { label: "Tavo Chicken", symbol: "🍗", accent: "#e8ad64", subtitle: "Bring your A-game." },
  vyta: { label: "Vyta", symbol: "🥤", accent: "#8bdfe0", subtitle: "Play refreshed." },
} as const;
export type BrandTheme = keyof typeof BRAND_THEMES;
export function isBrandTheme(value: unknown): value is BrandTheme {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(BRAND_THEMES, value);
}

export type PairCard = { id: number; food: string; label: string };
const FOODS = [
  ["🍔", "Burger"], ["🌮", "Taco"], ["🍟", "Fries"],
  ["🥤", "Drink"], ["🍗", "Chicken"], ["🫓", "Paratha"],
] as const;

/** Shuffling changes only entertainment puzzles, never a reward or redemption. */
export function makePairs(): PairCard[] {
  const cards = FOODS.flatMap(([food, label], pair) => [
    { id: pair * 2, food, label }, { id: pair * 2 + 1, food, label },
  ]);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export const INGREDIENTS = [
  { id: "bun", label: "Bun", emoji: "🍞" },
  { id: "patty", label: "Patty", emoji: "🥩" },
  { id: "lettuce", label: "Lettuce", emoji: "🥬" },
  { id: "tortilla", label: "Tortilla", emoji: "🫓" },
  { id: "chicken", label: "Chicken", emoji: "🍗" },
  { id: "salsa", label: "Salsa", emoji: "🍅" },
  { id: "fries", label: "Fries", emoji: "🍟" },
  { id: "cheese", label: "Cheese", emoji: "🧀" },
  { id: "sauce", label: "Sauce", emoji: "🥫" },
] as const;

export const RECIPES = [
  { label: "Skorch Burger", emoji: "🍔", ingredients: ["bun", "patty", "lettuce"] },
  { label: "Taconelle Taco", emoji: "🌮", ingredients: ["tortilla", "chicken", "salsa"] },
  { label: "Load'd Fries", emoji: "🍟", ingredients: ["fries", "cheese", "sauce"] },
] as const;

export function recipeMatches(selected: string[], target: readonly string[]): boolean {
  return selected.length === target.length && selected.every((item) => target.includes(item));
}
