import {describe,expect,test} from "bun:test";
import {
  PREVIEW_OFFER_FILTERS,PREVIEW_OFFERS,selectPreviewOffers,
} from "../src/lib/mealdeck-preview-offers";

describe("MealDeck homepage offer previews",()=>{
  test("shows six unique illustrative previews in the default view",()=>{
    const result=selectPreviewOffers(PREVIEW_OFFERS,"all");
    expect(result).toHaveLength(6);
    expect(new Set(result.map(offer=>offer.id)).size).toBe(6);
  });
  test("filters to only the selected category without mutating source order",()=>{
    const groups=["basket","sharing","rewards"] as const;
    for(const group of groups){
      const results=selectPreviewOffers(PREVIEW_OFFERS,group);
      expect(results).toHaveLength(2);
      expect(results.every(offer=>offer.category===group)).toBe(true);
    }
    expect(PREVIEW_OFFERS[0]?.id).toBe("burger-ace");
  });
  test("does not list duplicated promotional identifiers twice",()=>{
    const result=selectPreviewOffers([...PREVIEW_OFFERS,PREVIEW_OFFERS[0]!],"all");
    expect(result).toHaveLength(6);
  });
  test("fails closed on an invalid category or result limit",()=>{
    expect(selectPreviewOffers(PREVIEW_OFFERS,"coupon" as "all")).toEqual([]);
    expect(selectPreviewOffers(PREVIEW_OFFERS,"all",-1)).toEqual([]);
    expect(selectPreviewOffers(PREVIEW_OFFERS,"all",1.5)).toEqual([]);
  });
  test("keeps previews explicitly separate from real promotion entitlements",()=>{
    expect(PREVIEW_OFFER_FILTERS).toHaveLength(4);
    for(const offer of PREVIEW_OFFERS){
      expect("redeemable" in offer).toBe(false);
      expect("checkoutCode" in offer).toBe(false);
      expect("active" in offer).toBe(false);
      expect(offer.label.length).toBeGreaterThan(0);
    }
  });
  test("caps results without inventing new offers",()=>{
    expect(selectPreviewOffers(PREVIEW_OFFERS,"all",3)).toEqual(PREVIEW_OFFERS.slice(0,3));
  });
});
