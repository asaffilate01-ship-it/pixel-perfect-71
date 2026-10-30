import { describe, expect, test } from "bun:test";
import {
  BROWSE_CATEGORIES, browseBrands, browseMenu,
  matchesBrowseCategory, basketSuggestions, refineMenuPrice,
} from "../src/lib/marketplace-discovery";
import type { Brand, CartLine, MenuItem } from "../src/lib/mealdeck";

const brands=[
  {id:"skorch-burgers",name:"Skorch Burgers",category:"Smash burgers"},
  {id:"taconelle",name:"Taconelle",category:"French tacos"},
  {id:"icova",name:"Icova",category:"Iced coffee · chai · desserts"},
  {id:"moktl",name:"Moktl",category:"Zero-alcohol mocktails"},
] as Brand[];
const items=[
  {id:"burger",brandId:"skorch-burgers",name:"Double Smash Burger",category:"Smash burgers",pricePence:999},
  {id:"taco",brandId:"taconelle",name:"Grilled French Taco",category:"French tacos",pricePence:899},
  {id:"latte",brandId:"icova",name:"Iced Latte",category:"Add-on drinks",pricePence:395},
  {id:"cooler",brandId:"moktl",name:"Citrus Cooler",category:"Add-on drinks",pricePence:425},
  {id:"dessert",brandId:"icova",name:"Milk Cake",category:"Desserts",pricePence:450},
] as MenuItem[];
function cart(item:MenuItem):CartLine{return {...item,lineId:item.id,quantity:1,selectedModifiers:[]};}
describe("category → brand → dish navigation",()=>{
  test("keeps distinct search categories, including drinks and desserts",()=>{
    expect(new Set(BROWSE_CATEGORIES.map(c=>c.id)).size).toBe(BROWSE_CATEGORIES.length);
    expect(matchesBrowseCategory(items[0]!,"burgers",brands[0])).toBe(true);
    expect(matchesBrowseCategory(items[1]!,"french-tacos",brands[1])).toBe(true);
    expect(matchesBrowseCategory(items[2]!,"drinks",brands[2])).toBe(true);
  });
  test("choosing a category shows only brands serving that category",()=>{
    expect(browseBrands(items,brands,"burgers").map(b=>b.id)).toEqual(["skorch-burgers"]);
    expect(browseBrands(items,brands,"french-tacos").map(b=>b.id)).toEqual(["taconelle"]);
  });
  test("brand and category filtering never adds unavailable dishes",()=>{
    expect(browseMenu(items,"taconelle","french-tacos","",brands).map(i=>i.id)).toEqual(["taco"]);
    expect(browseMenu(items,"skorch-burgers","french-tacos","",brands)).toEqual([]);
    expect(browseMenu(items,null,"all","iced",brands).map(i=>i.id)).toEqual(["latte"]);
  });
  test("mixed-menu brands do not make a cake a drink or a latte a dessert",()=>{
    expect(matchesBrowseCategory(items[2]!,"desserts",brands[2])).toBe(false);
    expect(matchesBrowseCategory(items[4]!,"drinks",brands[2])).toBe(false);
    expect(matchesBrowseCategory(items[4]!,"desserts",brands[2])).toBe(true);
  });
  test("fries are available as a customer category",()=>{
    expect(BROWSE_CATEGORIES.some(c=>c.id==="sides")).toBe(true);
    const fries:MenuItem={id:"fries",brandId:"loadd",name:"Loaded Fries",category:"Fries & sides",pricePence:450};
    const loadd={id:"loadd",name:"Load'd",category:"French tacos · mac n cheese"} as Brand;
    expect(matchesBrowseCategory(fries,"sides",loadd)).toBe(true);
    expect(matchesBrowseCategory(fries,"french-tacos",loadd)).toBe(false);
  });
  test("recommendations only use real catalogue items not already in basket",()=>{
    const suggestions=basketSuggestions(items,[cart(items[0]!)],brands);
    expect(suggestions.length).toBeLessThanOrEqual(4);
    expect(suggestions.some(s=>s.item.id==="burger")).toBe(false);
    expect(suggestions.every(s=>items.includes(s.item))).toBe(true);
    expect(suggestions[0]?.reason).toBe("Add a drink");
    expect(basketSuggestions(items,[],brands)).toEqual([]);
  });
});

describe("accurate dish labels", () => {
  const dish = (name: string, category = "Menu"): MenuItem => ({ id: name, name, category, brandId: "test", pricePence: 500 });
  test.each(["Chicken salad", "Tuna salad", "Plantain chicken", "Non-vegetarian curry", "Non vegetarian curry"])("does not infer vegetarian status for %s", name => {
    expect(matchesBrowseCategory(dish(name), "vegetarian")).toBe(false);
  });
  test.each(["Vegetarian curry", "Vegan burger", "Plant-based bowl", "Veggie wrap"])("accepts explicit dish label: %s", name => {
    expect(matchesBrowseCategory(dish(name), "vegetarian")).toBe(true);
  });
  test("brand-level vegetarian marketing does not label an unspecified dish", () => {
    expect(matchesBrowseCategory(dish("House special"), "vegetarian", { id: "test", name: "Sabzora", category: "Vegetarian" } as Brand)).toBe(false);
  });
  test.each(["Shepherd's Pie", "Steak pie", "Sweet chilli chicken"])("does not classify %s as dessert", name => {
    expect(matchesBrowseCategory(dish(name, "Hot meals"), "desserts")).toBe(false);
  });
  test.each(["Apple pie", "Milk cake", "Chocolate brownie", "Ice cream"])("keeps %s in desserts", name => {
    expect(matchesBrowseCategory(dish(name), "desserts")).toBe(true);
  });
});

describe("budget and price discovery", () => {
  test("budget is inclusive and uses only supplied catalogue items", () => {
    const result = refineMenuPrice(items, 425);
    expect(result.map(item => item.id)).toEqual(["latte", "cooler"]);
    expect(result.every(item => items.includes(item))).toBe(true);
  });
  test("supports both price orders without mutating the catalogue", () => {
    const original = items.map(item => item.id);
    expect(refineMenuPrice(items, null, "price-low").map(item => item.pricePence)).toEqual([395, 425, 450, 899, 999]);
    expect(refineMenuPrice(items, null, "price-high").map(item => item.pricePence)).toEqual([999, 899, 450, 425, 395]);
    expect(items.map(item => item.id)).toEqual(original);
    expect(refineMenuPrice(items, null).map(item => item.id)).toEqual(original);
  });
  test.each([-1, NaN, Infinity, 4.5])("invalid budget %s cannot silently disable the limit", budget => {
    expect(refineMenuPrice(items, budget)).toEqual([]);
  });
  test("does not present invalid amounts as affordable dishes", () => {
    const invalid = [-1, NaN, Infinity, 42.5].map(pricePence => ({ ...items[0]!, pricePence }));
    expect(refineMenuPrice(invalid, null)).toEqual([]);
  });
  test("zero budget is a real filter, not unlimited", () => {
    expect(refineMenuPrice(items, 0)).toEqual([]);
  });
  test("budget composes with category and text search", () => {
    expect(refineMenuPrice(browseMenu(items, null, "drinks", "iced", brands), 400).map(item => item.id)).toEqual(["latte"]);
  });
});

