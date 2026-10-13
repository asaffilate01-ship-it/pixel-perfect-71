/**
 * MealDeck category-led restaurant discovery.
 *
 * Uses only the catalogue returned for the selected location. It does not
 * invent discounts, opening times, availability, delivery fees or prices.
 * Cross-sells are suggestions, never automatic additions to the basket.
 */
import type { CartLine, MenuItem } from "./mealdeck";

export const ORDER_CATEGORIES = [
  { id: "all", label: "All food", symbol: "🍽️" },
  { id: "burgers", label: "Burgers", symbol: "🍔" },
  { id: "chicken", label: "Chicken", symbol: "🍗" },
  { id: "french-tacos", label: "French tacos", symbol: "▤" },
  { id: "pizza", label: "Pizza", symbol: "🍕" },
  { id: "pasta", label: "Pasta & mac", symbol: "🍝" },
  { id: "indian", label: "Indian", symbol: "🍛" },
  { id: "grill", label: "Grill", symbol: "🔥" },
  { id: "breakfast", label: "Breakfast", symbol: "🥞" },
  { id: "fries", label: "Fries & sides", symbol: "🍟" },
  { id: "wraps", label: "Wraps & sandwiches", symbol: "🥪" },
  { id: "healthy", label: "Fresh & healthy", symbol: "🥗" },
  { id: "desserts", label: "Desserts", symbol: "🍰" },
  { id: "drinks", label: "Drinks", symbol: "🥤" },
  { id: "classics", label: "Classics", symbol: "🍴" },
] as const;

export type OrderCategory = (typeof ORDER_CATEGORIES)[number]["id"];

function normalise(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
}

export function orderCategoryFor(item: Pick<MenuItem, "name" | "category" | "brandId">): OrderCategory {
  const label = normalise(`${item.name} ${item.category}`);
  const brand = normalise(item.brandId);
  // Deliberately handle French tacos before wraps, and a Vyta bowl before juices.
  if (/nourish bowl|salad|protein bowl|healthy bowl/.test(label)) return "healthy";
  if (/dessert|cake|brownie|tart|mud pie|ice cream|sundae|cookie|sweet treat|pudding/.test(label)) return "desserts";
  if (/iced latte|coffee|chai|matcha|tea\b|mocktail|smoothie|milkshake|juice|drinks|iced coffee|hot chocolate/.test(label)
    || brand === "icova" || brand === "moktl") return "drinks";
  if (/french taco|french tacos/.test(label) || brand === "taconelle") return "french-tacos";
  if (/pizza|margherita|forvello/.test(label) || brand === "forvello") return "pizza";
  if (/pasta|mac n cheese|mac & cheese|rigatoni|lasagne|spaghetti|penne/.test(label) || brand === "pastarivo") return "pasta";
  if (/loaded fries|fries|chips\b|side dish|sides/.test(label) && !/fish & chips|fish and chips/.test(label)) return "fries";
  if (/burger|smash|quarter.pound|half.pound/.test(label) || brand === "skorch-burgers") return "burgers";
  if (/breakfast|brunch|full english|pancake|egg|omelette/.test(label) || brand === "rise-and-griddle") return "breakfast";
  if (/souvlaki|grilled skewer|mediterranean grill|kebab|shawarma|d[oö]ner/.test(label) || brand === "souvano") return "grill";
  if (/chicken|wings|tenders|drumstick/.test(label) || brand === "tavo-chicken") return "chicken";
  if (/paratha|panini|sandwich|wrap|toastie|tortilla/.test(label) || brand === "paratique") return "wraps";
  if (/curry|indian|veg delight|biryani|daal|desi|tarka/.test(label)
    || ["tarka-box", "sabzora"].includes(brand)) return "indian";
  if (/fresh|fruit|vegetarian|nourish/.test(label) || brand === "vyta") return "healthy";
  return "classics";
}

export function categoryCounts(items: readonly MenuItem[]): Record<OrderCategory, number> {
  const counts = Object.fromEntries(ORDER_CATEGORIES.map(({ id }) => [id, 0])) as Record<OrderCategory, number>;
  counts.all = items.length;
  for (const item of items) counts[orderCategoryFor(item)] += 1;
  return counts;
}

export function searchCatalogue(
  items: readonly MenuItem[],
  opts: { category?: OrderCategory; search?: string; brandId?: string | null; brandName?: (id: string) => string },
): MenuItem[] {
  const category = opts.category ?? "all";
  const query = normalise(opts.search ?? "");
  return items.filter(item => {
    if (category !== "all" && orderCategoryFor(item) !== category) return false;
    if (opts.brandId && item.brandId !== opts.brandId) return false;
    if (!query) return true;
    const brand = opts.brandName?.(item.brandId) ?? item.brandId;
    return normalise([item.name, item.category, item.description ?? "", brand].join(" ")).includes(query);
  });
}

export type BasketSuggestion = {
  item: MenuItem;
  kind: "drink" | "side" | "dessert" | "other-brand";
  explanation: string;
};

export function suggestedAdditions(
  items: readonly MenuItem[],
  basket: readonly CartLine[],
  limit = 3,
): BasketSuggestion[] {
  if (!basket.length || limit <= 0) return [];
  const selectedIds = new Set(basket.map(item => item.id));
  const brandsInBasket = new Set(basket.map(item => item.brandId));
  const kinds = new Set(basket.map(orderCategoryFor));
  const candidates = items.filter(item => item.pricePence > 0 && !selectedIds.has(item.id));
  const selected: BasketSuggestion[] = [];
  const used = new Set<string>();
  const choose = (category: OrderCategory, kind: BasketSuggestion["kind"], explanation: string) => {
    if (selected.length >= limit) return;
    const options = candidates.filter(item => !used.has(item.id) && orderCategoryFor(item) === category);
    // Prefer food from another participating brand, then lower genuine menu prices.
    options.sort((a, b) => Number(brandsInBasket.has(a.brandId)) - Number(brandsInBasket.has(b.brandId))
      || a.pricePence - b.pricePence || a.name.localeCompare(b.name));
    const item = options[0];
    if (item) {
      selected.push({ item, kind, explanation });
      used.add(item.id);
    }
  };
  const basketHasMain = basket.some(item => !["drinks", "desserts", "fries"].includes(orderCategoryFor(item)));
  if (basketHasMain && !kinds.has("drinks")) choose("drinks", "drink", "A drink with your meal");
  if (basketHasMain && !kinds.has("fries")) choose("fries", "side", "Make it a meal with a side");
  if (basketHasMain && !kinds.has("desserts")) choose("desserts", "dessert", "Something sweet to finish");
  if (selected.length < limit) {
    const different = candidates.filter(item => !used.has(item.id) && !brandsInBasket.has(item.brandId));
    different.sort((a, b) => a.pricePence - b.pricePence || a.name.localeCompare(b.name));
    const item = different[0];
    if (item) selected.push({ item, kind: "other-brand", explanation: "Try something from another brand" });
  }
  return selected.slice(0, limit);
}
