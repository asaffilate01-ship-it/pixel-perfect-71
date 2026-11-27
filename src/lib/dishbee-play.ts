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
  { id: "snack-trail", name: "Snack Trail", description: "Collect bites, avoid your tail and choose moving or step-by-step play.", state: "playable" },
  { id: "skewer-sort", name: "Skewer Sort", description: "Move one bite at a time until every skewer holds a matching food.", state: "playable" },
  { id: "pantry-sweep", name: "Pantry Sweep", description: "Follow the number clues, flag hidden chillies and uncover the safe pantry shelves.", state: "playable" },
  { id: "bento-sudoku", name: "Bento Sudoku", description: "Give every food its place in a fresh or daily number puzzle, with two tray sizes.", state: "playable" },
  { id: "tray-lines", name: "Tray Lines", description: "Join the dots, close the boxes and outplay the chef or a friend.", state: "playable" },
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

export const PAIR_COUNTS = [4, 6, 8] as const;
export type PairCount = (typeof PAIR_COUNTS)[number];
const EXTRA_PAIR_FOODS: readonly [FoodArt, string][] = [
  ["paratha", "Paratha"], ["cheese", "Cheese"], ["lettuce", "Lettuce"],
  ["drink", "Drink"], ["cake", "Cake"], ["fries", "Fries"],
  ["salsa", "Salsa"], ["tortilla", "Tortilla"],
];

/** Shuffling changes only entertainment puzzles, never a reward or redemption. */
export function makePairs(
  brand: BrandTheme = "mealdeck",
  count: PairCount = 6,
  random: () => number = Math.random,
): PairCard[] {
  const original = BRAND_FOODS[brand] ?? BRAND_FOODS.mealdeck;
  const pairCount = PAIR_COUNTS.includes(count) ? count : 6;
  const foods = [...original];
  for (const food of EXTRA_PAIR_FOODS) {
    if (foods.length >= pairCount) break;
    if (!foods.some(([art]) => art === food[0])) foods.push(food);
  }
  const cards = foods.slice(0, pairCount).flatMap(([art, label], pair) => [
    { id: pair * 2, food: art, art, label },
    { id: pair * 2 + 1, food: art, art, label },
  ]);
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const sample = random();
    const j = Math.min(i, Math.max(0, Number.isFinite(sample) ? Math.floor(sample * (i + 1)) : 0));
    const temp = cards[i]!;
    cards[i] = cards[j]!;
    cards[j] = temp;
  }
  return cards;
}

export type PairRound = {
  cards: PairCard[];
  flipped: number[];
  matched: number[];
  moves: number;
  message: string;
};

export function createPairRound(cards: PairCard[] = []): PairRound {
  return {
    cards,
    flipped: [],
    matched: [],
    moves: 0,
    message: "Choose a card, then find its matching food.",
  };
}

export function isPairRoundComplete(round: PairRound): boolean {
  return round.cards.length > 0 && round.matched.length === round.cards.length;
}

/** Functional state updates make rapid taps and repeated card events safe. */
export function revealPairCard(round: PairRound, id: number): PairRound {
  const card = round.cards.find((item) => item.id === id);
  if (!card || isPairRoundComplete(round) || round.flipped.length >= 2 ||
      round.flipped.includes(id) || round.matched.includes(id)) return round;
  const checking = round.flipped.length === 1;
  return {
    ...round,
    flipped: [...round.flipped, id],
    moves: round.moves + (checking ? 1 : 0),
    message: checking ? "Checking your two cards…" : card.label + " revealed. Find its matching card.",
  };
}

/** Only settle the two cards in the current round. */
export function resolvePairTurn(round: PairRound): PairRound {
  if (round.flipped.length !== 2) return round;
  const [first, second] = round.flipped;
  const a = round.cards.find((item) => item.id === first);
  const b = round.cards.find((item) => item.id === second);
  if (!a || !b || first === undefined || second === undefined || first === second) return round;
  const match = a.food === b.food;
  return {
    ...round,
    flipped: [],
    matched: match ? [...round.matched, first, second] : round.matched,
    message: match ? a.label + " pair found. Choose your next card." : "No match this time. Remember those foods and try again.",
  };
}

/** Best moves is a local entertainment statistic, scoped to one deck and size. */
export function parsePairBest(raw: string | null, count: PairCount): number | null {
  if (raw === null || !/^\d{1,6}$/.test(raw)) return null;
  const moves = Number(raw);
  return Number.isSafeInteger(moves) && moves >= count && moves <= 100_000 ? moves : null;
}

export function choosePairBest(previous: number | null, moves: number, count: PairCount): number | null {
  const candidate = parsePairBest(String(moves), count);
  const validPrevious = previous === null ? null : parsePairBest(String(previous), count);
  if (candidate === null) return validPrevious;
  return validPrevious === null ? candidate : Math.min(validPrevious, candidate);
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

/** Entertainment-only ingredient puzzles. These are not menu or allergen specifications. */
export const RECIPES = [
  { label: "Skorch Burger", emoji: "🍔", art: "burger", ingredients: ["bun", "patty", "lettuce"], clue: "A bread roll, a burger filling and crisp green leaves." },
  { label: "Taconelle French Taco", emoji: "▤", art: "french-taco", ingredients: ["tortilla", "chicken", "salsa"], clue: "A wrap, poultry and a tomato-based salsa." },
  { label: "Load'd Fries", emoji: "🍟", art: "fries", ingredients: ["fries", "cheese", "sauce"], clue: "Crispy potato sticks, a dairy topping and a sauce." },
  { label: "Garden Burger (game)", emoji: "🍔", art: "burger", ingredients: ["bun", "lettuce", "cheese"], clue: "A bread roll, green leaves and a cheese slice." },
  { label: "Chicken Melt (game)", emoji: "🍔", art: "burger", ingredients: ["bun", "chicken", "cheese"], clue: "A bread roll, poultry and a melty dairy topping." },
  { label: "Classic Cheese Stack (game)", emoji: "🍔", art: "burger", ingredients: ["bun", "patty", "cheese"], clue: "A bread roll, burger filling and a cheese slice." },
  { label: "Green Wrap (game)", emoji: "▤", art: "french-taco", ingredients: ["tortilla", "lettuce", "salsa"], clue: "A wrap, leafy greens and tomato salsa." },
  { label: "Cheesy Chicken Wrap (game)", emoji: "▤", art: "french-taco", ingredients: ["tortilla", "chicken", "cheese"], clue: "A wrap, poultry and cheese." },
  { label: "Burger Bowl (game)", emoji: "🍔", art: "burger", ingredients: ["patty", "lettuce", "sauce"], clue: "A burger filling, leafy greens and a sauce, without bread." },
  { label: "Chicken Fries Bowl (game)", emoji: "🍟", art: "fries", ingredients: ["fries", "chicken", "sauce"], clue: "Potato sticks, poultry and a sauce." },
  { label: "Salsa Fries (game)", emoji: "🍟", art: "fries", ingredients: ["fries", "cheese", "salsa"], clue: "Potato sticks, a cheese topping and tomato salsa." },
  { label: "Crispy Chicken Wrap (game)", emoji: "▤", art: "french-taco", ingredients: ["tortilla", "chicken", "lettuce"], clue: "A wrap, poultry and crisp green leaves." },
] as const;
export const RECIPE_DECK_SIZES = [3, 6, 12] as const;
export type RecipeDeckSize = (typeof RECIPE_DECK_SIZES)[number];

/** The three original questions stay first; additional challenges are explicitly fictional. */
export function getRecipeDeck(size: RecipeDeckSize) {
  return RECIPES.slice(0, RECIPE_DECK_SIZES.includes(size) ? size : 3);
}

/** Rapid input cannot select more than three distinct known ingredients. */
export function toggleRecipeIngredient(selected: string[], id: string): string[] {
  if (!INGREDIENTS.some(item => item.id === id)) return selected;
  if (selected.includes(id)) return selected.filter(item => item !== id);
  return selected.length >= 3 ? selected : [...selected, id];
}

export function recipeMatches(selected: string[], target: readonly string[]): boolean {
  return selected.length === target.length && new Set(selected).size === target.length && selected.every((item) => target.includes(item));
}

