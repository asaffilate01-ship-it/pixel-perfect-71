import type { CartLine, MenuItem, Brand } from "./mealdeck";

/** Customer-first browse categories. Map from actual item and brand metadata. */
export const BROWSE_CATEGORIES = [
  { id: "all", label: "All food", emoji: "🍽️" },
  { id: "burgers", label: "Burgers", emoji: "🍔" },
  { id: "chicken", label: "Chicken", emoji: "🍗" },
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
  const title=normalize(`${item.name} ${item.category} ${brand?.category ?? ""} ${brand?.name ?? ""}`);
  const cat:BrowseCategory[]=[];
  const matches=(...terms:string[])=>terms.some(term=>title.includes(term));
  if(matches("burger","smash","skorch"))cat.push("burgers");
  if(matches("chicken","wing","tender","tavo"))cat.push("chicken");
  if(matches("french taco","taconelle","wrap","loadd"))cat.push("french-tacos");
  if(matches("indian","curry","desi","tarka","paratha","paratique","sabzora","daal"))cat.push("indian");
  if(matches("pizza","forvello"))cat.push("pizza");
  if(matches("pasta","rigatoni","pastarivo","mac n cheese"))cat.push("pasta");
  if(matches("breakfast","brunch","rise & griddle","pancake","omelette"))cat.push("breakfast");
  if(matches("grill","souvano","souvlaki","shawarma"))cat.push("grill");
  if(matches("veg","salad","sabzora","plant"))cat.push("vegetarian");
  if(matches("drink","juice","smoothie","coffee","chai","iced latte","moktl","icova","vyta","cooler"))cat.push("drinks");
  if(matches("dessert","cake","pie","sweet","brownie","cookie","ice cream"))cat.push("desserts");
  return cat;
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
