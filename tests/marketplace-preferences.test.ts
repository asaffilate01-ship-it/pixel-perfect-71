import { describe, expect, test } from "bun:test";
import {
  BASKET_STORAGE_KEY, FAVOURITES_STORAGE_KEY,
  decodeFavourites, normaliseFavouriteIds, toggleFavourite,
  decodeSavedBasket, encodeSavedBasket, restoreSavedBasket,
} from "../src/lib/marketplace-preferences";
import type { CartLine, MenuItem } from "../src/lib/mealdeck";

const burger: MenuItem = {
  id: "burger", brandId: "skorch-burgers", name: "Double Smash",
  category: "Smash burgers", pricePence: 1099, hasModifiers: false,
};
const chips: MenuItem = {
  id: "chips", brandId: "loadd", name: "Loaded Fries",
  category: "Loaded fries", pricePence: 525, hasModifiers: false,
};
const tacos: MenuItem = {
  id: "taco", brandId: "taconelle", name: "French Taco",
  category: "French tacos", pricePence: 875,
  modifierGroups: [{
    id:"heat", name:"Choose heat", minSelect:1, maxSelect:1,
    options:[{id:"mild",name:"Mild",priceDeltaPence:0},{id:"hot",name:"Spicy",priceDeltaPence:75}],
  }],
};
function cart(item:MenuItem,qty=1):CartLine {
  return {...item,lineId:`${item.id}:`,quantity:qty,selectedModifiers:[]};
}
describe("Device-only favourites",()=>{
  test("normalises duplicates, bad input and malformed JSON without throwing",()=>{
    expect(normaliseFavouriteIds(["burger","burger",27,"taco"])).toEqual(["burger","taco"]);
    expect(decodeFavourites('["burger","taco"]')).toEqual(["burger","taco"]);
    expect(decodeFavourites("{bad")).toEqual([]);
    expect(toggleFavourite(["burger"],"burger")).toEqual([]);
    expect(toggleFavourite(["burger"],"taco")).toEqual(["burger","taco"]);
    expect(FAVOURITES_STORAGE_KEY.includes("favourites")).toBe(true);
  });
});
describe("Save basket for later (not an order)",()=>{
  test("serialises only item and modifier IDs and location, never customer or pricing",()=>{
    const json=encodeSavedBasket("luton",[cart(burger,2)]);
    expect(json).not.toContain("Double Smash");
    expect(json).not.toContain("1099");
    expect(JSON.parse(json)).toEqual({
      version:1,location:"luton",lines:[{itemId:"burger",quantity:2,selected:[]}],
    });
    expect(decodeSavedBasket(json)?.lines).toHaveLength(1);
    expect(BASKET_STORAGE_KEY.includes("basket")).toBe(true);
  });
  test("loads latest catalogue prices and groups into a real multi-brand cart",()=>{
    const saved=decodeSavedBasket(encodeSavedBasket("luton",[cart(burger,2),cart(chips,1)]))!;
    const refreshed=[{...burger,pricePence:1299},{...chips,pricePence:599}];
    const result=restoreSavedBasket(saved,"luton",refreshed,[]);
    expect(result.mismatch).toBe(false);
    expect(result.added).toBe(3);
    expect(result.cart).toHaveLength(2);
    expect(result.cart[0]?.pricePence).toBe(1299);
    expect(result.cart[0]?.quantity).toBe(2);
    expect(result.cart[1]?.brandId).toBe("loadd");
  });
  test("never restores a basket across locations or adds missing products",()=>{
    const saved=decodeSavedBasket(encodeSavedBasket("luton",[cart(burger,2),cart(chips,1)]))!;
    const wrong=restoreSavedBasket(saved,"stalbans",[burger,chips]);
    expect(wrong.mismatch).toBe(true);
    expect(wrong.cart).toHaveLength(0);
    const missing=restoreSavedBasket(saved,"luton",[chips]);
    expect(missing.unavailable).toBe(1);
    expect(missing.added).toBe(1);
  });
  test("revalidates modifier IDs and recalculates modifier pricing",()=>{
    const oldLine: CartLine={...tacos,lineId:"taco:heat:hot",quantity:2,
      selectedModifiers:[{id:"hot",name:"Spicy",priceDeltaPence:50,groupId:"heat",groupName:"Choose heat"}]};
    const saved=decodeSavedBasket(encodeSavedBasket("luton",[oldLine]))!;
    const next=restoreSavedBasket(saved,"luton",[tacos]);
    expect(next.cart[0]?.selectedModifiers[0]?.priceDeltaPence).toBe(75);
    expect(next.cart[0]?.quantity).toBe(2);
    const changed:MenuItem={...tacos,modifierGroups:[{
      id:"heat",name:"Choose heat",minSelect:1,maxSelect:1,
      options:[{id:"mild",name:"Mild",priceDeltaPence:0}],
    }]};
    const skipped=restoreSavedBasket(saved,"luton",[changed]);
    expect(skipped.added).toBe(0);
    expect(skipped.unavailable).toBe(1);
  });
  test("rejects malformed or unsafe saved preferences",()=>{
    expect(decodeSavedBasket("{broken")).toBeNull();
    expect(decodeSavedBasket(JSON.stringify({version:1,location:"luton",lines:[{itemId:"burger",quantity:1e5,selected:[]}]}))).toBeNull();
    expect(decodeSavedBasket(JSON.stringify({version:2,location:"luton",lines:[]}))).toBeNull();
  });
  test("reports only quantities actually added at the saved-basket limit", () => {
    const saved=decodeSavedBasket(encodeSavedBasket("luton",[cart(burger,10)]))!;
    const result=restoreSavedBasket(saved,"luton",[burger],[cart(burger,24)]);
    expect(result.cart[0]?.quantity).toBe(25);
    expect(result.added).toBe(1);
    const full=restoreSavedBasket(saved,"luton",[burger],result.cart);
    expect(full.cart[0]?.quantity).toBe(25);
    expect(full.added).toBe(0);
  });
  test("restoring into an existing line refreshes price without reducing its quantity", () => {
    const saved=decodeSavedBasket(encodeSavedBasket("luton",[cart(burger,1)]))!;
    const result=restoreSavedBasket(saved,"luton",[{...burger,pricePence:1299}],[cart(burger,30)]);
    expect(result.cart[0]?.quantity).toBe(30);
    expect(result.cart[0]?.pricePence).toBe(1299);
    expect(result.added).toBe(0);
  });
});

