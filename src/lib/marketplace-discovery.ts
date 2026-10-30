import type { CartLine, MenuItem, Brand } from "./mealdeck";

/** Customer-first browse categories. Map from actual item and brand metadata. */
export const BROWSE_CATEGORIES = [
  { id: "all", label: "All food", emoji: "🍽️" },
  { id: "burgers", label: "Burgers", emoji: "🍔" },
  { id: "chicken", label: "Chicken", emoji: "🍗" },
  { id: "sides", label: "Fries & sides", emoji: "🍟" },
  { id: "french-tacos", label: "French tacos", emoji: "🥙" },
  { id: "indian", label: "Indian", emoji: "🍛" },
  { id: "pizza", label: "Pizza", emoji: "🍕" },
  { id: "pasta", label: "Pasta", emoji: "🍝" },
  { id: "breakfast", label: "Breakfast", emoji: "🥞" },
  { id: "grill", label: "Grill", emoji: "🥙" },
  { id: "vegetarian", label: "Vegetarian", emoji: "🥗" },
  { id: "drinks", label: "Drinks", emoji: "🥤" },
  { id: "desserts", label: "Desserts", emoji: "🍰" },
] as const;
export type BrowseCategory = (typeof BROWSE_CATEGORIES)[number]["id"];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[’']/g, "").trim();
}
function categoryFor(item: MenuItem, brand?: Brand): BrowseCategory[] {
  // Classify the actual dish first. A mixed-menu brand such as Icova must not
  // make all its iced coffees appear under Desserts (or its cakes under Drinks).
  const fromText = (text: string): BrowseCategory[] => {
    const result: BrowseCategory[] = [];
    const matches = (...terms: string[]) => terms.some(term => text.includes(term));
    if (matches("burger", "smash")) result.push("burgers");
    if (matches("chicken", "wing", "tender")) result.push("chicken");
    if (matches("loaded fries", "fries", "chips", "side dishes")) result.push("sides");
    if (matches("french taco", "grilled taco", "taconelle", "wrap")) result.push("french-tacos");
    if (matches("indian", "curry", "desi", "tarka", "paratha", "sabzora", "daal")) result.push("indian");
    if (matches("pizza", "margherita", "forvello")) result.push("pizza");
    if (matches("pasta", "rigatoni", "mac n cheese")) result.push("pasta");
    if (matches("breakfast", "brunch", "pancake", "omelette")) result.push("breakfast");
    if (matches("grill", "souvano", "souvlaki", "shawarma")) result.push("grill");
    if (matches("drink", "juice", "smoothie", "coffee", "chai", "iced latte", "mocktail", "cooler")) result.push("drinks");
    if (/\b(?:desserts?|cakes?|brownies?|cookies?|ice cream|puddings?)\b/.test(text)
      || /\b(?:apple|cherry|pecan|lemon|banoffee|pumpkin) pie\b/.test(text)) result.push("desserts");
    return result;
  };
  const itemText = normalize(`${item.name} ${item.category}`);
  const own = fromText(itemText);
  // Dietary discovery requires an explicit item label, not a cuisine, brand,
  // "salad" or an ingredient guess. It is not an allergen/suitability guarantee.
  if (/\b(?:vegetarian|veggie|vegan|plant[- ]based)\b/.test(itemText)
    && !/\bnon[- ]?(?:vegetarian|vegan)\b/.test(itemText)) own.push("vegetarian");
  if (own.length) return [...new Set(own)];
  // Fall back to cuisine only; a brand must never assign dietary labels to a dish.
  return [...new Set(fromText(normalize(`${brand?.category ?? ""} ${brand?.name ?? ""}`)))];
}
export function matchesBrowseCategory(item:MenuItem,category:BrowseCategory,brand?:Brand):boolean {
  return category==="all" || categoryFor(item,brand).includes(category);
}
export function browseBrands(items:readonly MenuItem[], brands:readonly Brand[], category:BrowseCategory, search=""):Brand[] {
  const q=normalize(search);
  return brands.filter(brand=>items.some(item=>item.brandId===brand.id &&
    matchesBrowseCategory(item,category,brand) &&
    (!q || normalize(`${item.name} ${item.category} ${brand.name} ${brand.category}`).includes(q))));
}
export function browseMenu(items:readonly MenuItem[],brandId:string|null,category:BrowseCategory,search:string,brands:readonly Brand[]):MenuItem[] {
  const q=normalize(search);
  return items.filter(item=>(!brandId||item.brandId===brandId) &&
    matchesBrowseCategory(item,category,brands.find(brand=>brand.id===item.brandId)) &&
    (!q || normalize(`${item.name} ${item.category} ${item.description||""} ${brands.find(brand=>brand.id===item.brandId)?.name||""}`).includes(q)));
}
export type Suggestion={item:MenuItem;reason:string};
/** Transparent, deterministic recommendations. Never fabricate a promotion or discount. */
export function basketSuggestions(items:readonly MenuItem[],lines:readonly CartLine[],brands:readonly Brand[],limit=4):Suggestion[]{
  if(lines.length===0)return [];
  const basketIds=new Set(lines.map(line=>line.id));
  const brandsInBasket=new Set(lines.map(line=>line.brandId));
  const spentBrands=new Set(lines.map(line=>brands.find(brand=>brand.id===line.brandId)?.category));
  const drinksInBasket=lines.some(line=>matchesBrowseCategory(line,"drinks",brands.find(b=>b.id===line.brandId)));
  const dessertInBasket=lines.some(line=>matchesBrowseCategory(line,"desserts",brands.find(b=>b.id===line.brandId)));
  return items.filter(item=>!basketIds.has(item.id)).map(item=>{
    const brand=brands.find(b=>b.id===item.brandId);
    const drink=matchesBrowseCategory(item,"drinks",brand);
    const dessert=matchesBrowseCategory(item,"desserts",brand);
    const newBrand=!brandsInBasket.has(item.brandId);
    const score=(drink&&!drinksInBasket?100:0)+(dessert&&!dessertInBasket?60:0)+(newBrand?22:0)+(!spentBrands.has(brand?.category)?4:0);
    return {item,score,reason:drink&&!drinksInBasket?"Add a drink":dessert&&!dessertInBasket?"Finish with something sweet":newBrand?"Try another MealDeck brand":"More from this kitchen"};
  }).sort((a,b)=>b.score-a.score || a.item.pricePence-b.item.pricePence || a.item.id.localeCompare(b.item.id))
    .slice(0,Math.max(0,limit)).map(({item,reason})=>({item,reason}));
}


export type MenuPriceSort = "menu" | "price-low" | "price-high";

/** Base-price discovery only: modifiers and delivery are not a quoted total. */
export function refineMenuPrice(
  items: readonly MenuItem[], maxPence: number | null, sort: MenuPriceSort = "menu",
): MenuItem[] {
  if (maxPence !== null && (!Number.isSafeInteger(maxPence) || maxPence < 0)) return [];
  const matches = items.filter(item => Number.isSafeInteger(item.pricePence)
    && item.pricePence >= 0 && (maxPence === null || item.pricePence <= maxPence));
  if (sort === "menu") return matches;
  return matches.sort((a, b) => (sort === "price-high" ? b.pricePence - a.pricePence : a.pricePence - b.pricePence)
    || a.id.localeCompare(b.id));
}
