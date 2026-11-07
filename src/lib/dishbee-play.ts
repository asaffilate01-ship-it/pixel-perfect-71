/**
 * Dishbee Play: entertainment-only card games.
 * Invariant: gameplay results MUST NOT create monetary value, loyalty points,
 * discount codes, food rewards or payment entitlements.
 * The verified-order loyalty ledger is a separate server-side system.
 */

/** Food-suit artwork keys. Artwork itself lives in src/lib/food-suit-artwork.ts. */
export type SuitArt = "burger" | "french-taco" | "chicken" | "cake" | "fries" | "drink" | "paratha";

/** Ingredient tile artwork keys, mapped in src/lib/food-suit-artwork.ts. */
export type TileArt = "bun" | "patty" | "lettuce" | "tortilla" | "chicken" | "salsa" | "fries" | "cheese" | "sauce";

/** Anything that can appear as a card face. */
export type FoodArt = SuitArt | TileArt;

/** Identical icon mapping to the approved MealDeck master card design. */
export const FOOD_SUITS = [
  { id: "burger", symbol: "🍔", art: "burger", label: "Smashburger", brand: "Skorch" },
  { id: "chicken", symbol: "🍗", art: "chicken", label: "Chicken Leg", brand: "Tavo Chicken" },
  { id: "french-taco", symbol: "▤", art: "french-taco", label: "French Taco", brand: "Taconelle" },
  { id: "cake", symbol: "🍰", art: "cake", label: "Cake", brand: "MealDeck" },
] as const;

export const GAME_CATALOGUE = [
  { id: "sauce-switch", name: "Sauce Switch", description: "Flip neighbouring tiles and clear the tray in a fresh daily logic puzzle.", state: "playable" },
  { id: "menu-quest", name: "Menu Quest", description: "Find the hidden food words. Tap the first and last letters to join them.", state: "playable" },
  { id: "tray-tactics", name: "Tray Tactics", description: "Capture the tray with clever food flips against the chef or a friend.", state: "playable" },
  { id: "feast-2048", name: "Feast 2048", description: "Merge matching food tiles into a record-breaking feast.", state: "playable" },
  { id: "four-to-feast", name: "Four to Feast", description: "Outthink the house chef or challenge a friend to connect four.", state: "playable" },
  { id: "order-echo", name: "Order Echo", description: "Remember a growing order sequence across three challenge levels.", state: "playable" },
  { id: "kitchen-shuffle", name: "Kitchen Shuffle", description: "Solve 3×3 and 4×4 sliding puzzles, including a daily challenge.", state: "playable" },
  { id: "pairs", name: "Food Pairs", description: "Flip and match delicious MealDeck food icons.", state: "playable" },
  { id: "recipe", name: "Recipe Rush", description: "Build signature meals from the right ingredients.", state: "playable" },
  { id: "kitchen-chaos", name: "Kitchen Chaos", description: "Take on the house chef in a colourful, original food-card game.", state: "playable" },
  { id: "snap", name: "Brand Snap", description: "Spot matching official MealDeck brand logos.", state: "playable" },
  { id: "go-dish", name: "Go Dish!", description: "Ask for food-card ranks and collect complete sets.", state: "playable" },
  { id: "full-house", name: "Full House", description: "Find five cards forming three of one food suit and two of another.", state: "playable" },
  { id: "solitaire", name: "Kitchen Stacks", description: "Sort each food suit from one to four in a solo challenge.", state: "playable" },
] as const;

export const BRAND_THEMES = {
  mealdeck: { label: "MealDeck", symbol: "🍽️", art: "burger", accent: "#f8c94c", subtitle: "Every brand. One place to play." },
  skorch: { label: "Skorch Burgers", symbol: "🍔", art: "burger", accent: "#fb923c", subtitle: "Fire up your next round." },
  taconelle: { label: "Taconelle", symbol: "▤", art: "french-taco", accent: "#b1ef8b", subtitle: "A fresh twist on game night." },
  loadd: { label: "Load'd", symbol: "🍟", art: "fries", accent: "#ff8c8c", subtitle: "Play fully loaded." },
  paratique: { label: "Paratique", symbol: "🫓", art: "paratha", accent: "#e8b77e", subtitle: "The perfect playtime pairing." },
  tavo: { label: "Tavo Chicken", symbol: "🍗", art: "chicken", accent: "#e8ad64", subtitle: "Bring your A-game." },
  vyta: { label: "Vyta", symbol: "🥤", art: "drink", accent: "#8bdfe0", subtitle: "Play refreshed." },
} as const;
export type BrandTheme = keyof typeof BRAND_THEMES;
export function isBrandTheme(value: unknown): value is BrandTheme {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(BRAND_THEMES, value);
}

export type PairCard = { id: number; food: string; art: FoodArt; label: string };

/** Each brand skin deals its own dishes — the deck changes, the rules never do. */
export const BRAND_FOODS: Record<BrandTheme, readonly [FoodArt, string][]> = {
  mealdeck: [["burger", "Burger"], ["french-taco", "French Taco"], ["chicken", "Chicken"], ["cake", "Cake"], ["fries", "Fries"], ["drink", "Drink"]],
  skorch: [["burger", "Smash Burger"], ["bun", "Bun"], ["patty", "Patty"], ["cheese", "Cheese"], ["sauce", "Sauce"], ["fries", "Fries"]],
  taconelle: [["french-taco", "French Taco"], ["tortilla", "Tortilla"], ["salsa", "Salsa"], ["lettuce", "Lettuce"], ["chicken", "Chicken"], ["drink", "Drink"]],
  loadd: [["fries", "Loaded Fries"], ["cheese", "Cheese"], ["sauce", "Sauce"], ["patty", "Patty"], ["bun", "Bun"], ["drink", "Drink"]],
  paratique: [["paratha", "Paratha"], ["patty", "Patty"], ["lettuce", "Lettuce"], ["salsa", "Salsa"], ["chicken", "Chicken"], ["drink", "Drink"]],
  tavo: [["chicken", "Chicken Leg"], ["patty", "Patty"], ["sauce", "Sauce"], ["lettuce", "Lettuce"], ["bun", "Bun"], ["drink", "Drink"]],
  vyta: [["drink", "Fresh Juice"], ["cake", "Milk Cake"], ["fries", "Fries"], ["burger", "Burger"], ["paratha", "Paratha"], ["french-taco", "French Taco"]],
};

/** Shuffling changes only entertainment puzzles, never a reward or redemption. */
export function makePairs(brand: BrandTheme = "mealdeck"): PairCard[] {
  const foods = BRAND_FOODS[brand] ?? BRAND_FOODS.mealdeck;
  const cards = foods.flatMap(([art, label], pair) => [
    { id: pair * 2, food: art, art, label }, { id: pair * 2 + 1, food: art, art, label },
  ]);
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = cards[i]!;
    cards[i] = cards[j]!;
    cards[j] = temp;
  }
  return cards;
}

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
  { label: "Taconelle French Taco", emoji: "▤", art: "french-taco", ingredients: ["tortilla", "chicken", "salsa"] },
  { label: "Load'd Fries", emoji: "🍟", art: "fries", ingredients: ["fries", "cheese", "sauce"] },
] as const;

export function recipeMatches(selected: string[], target: readonly string[]): boolean {
  return selected.length === target.length && new Set(selected).size === target.length && selected.every((item) => target.includes(item));
}

