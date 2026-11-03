import { describe, expect, test } from "bun:test";
import {
  BROWSE_CATEGORIES, browseBrands, browseMenu,
  matchesBrowseCategory, basketSuggestions,
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
  test("dietary browsing never guesses vegetarian status from a brand, salad or name",()=>{
    const vegetarianBrand={id:"sabzora",name:"Sabzora",category:"Indian vegetarian"} as Brand;
    const unreviewed={id:"salad",brandId:"sabzora",name:"Garden Salad",category:"Fresh",pricePence:600} as MenuItem;
    const meat={id:"meat",brandId:"sabzora",name:"Grilled Chicken Salad",category:"Fresh",pricePence:850} as MenuItem;
    const ambiguous={id:"veg-burger",brandId:"sabzora",name:"Plant Burger",category:"Burgers",pricePence:750} as MenuItem;
    const labelled={id:"veg",brandId:"sabzora",name:"Veg Delight",category:"Vegetarian",pricePence:780} as MenuItem;
    expect(matchesBrowseCategory(unreviewed,"vegetarian",vegetarianBrand)).toBe(false);
    expect(matchesBrowseCategory(meat,"vegetarian",vegetarianBrand)).toBe(false);
    expect(matchesBrowseCategory(ambiguous,"vegetarian",vegetarianBrand)).toBe(false);
    expect(matchesBrowseCategory(labelled,"vegetarian",vegetarianBrand)).toBe(true);
    expect(browseMenu([unreviewed,meat,ambiguous,labelled],null,"vegetarian","",[vegetarianBrand]).map(x=>x.id))
      .toEqual(["veg"]);
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
