import {describe,expect,it} from "bun:test";
import {
  recommendCrossBrandOffers,groupPaymentProgress,handoffRequirements,
  previewFulfilments,DEFAULT_CROSS_BRAND_OFFERS,
} from "../src/lib/multibrand-offers";
import type {MenuItem} from "../src/lib/mealdeck";

const menu:MenuItem[]=[
  {id:"burger",brandId:"skorch-burgers",category:"Burgers",name:"Double Smash Burger",pricePence:1099},
  {id:"fries",brandId:"loadd",category:"Sides",name:"Loaded Fries",pricePence:595},
  {id:"drink",brandId:"moktl",category:"Drinks",name:"Moktl Citrus Cooler",pricePence:425},
  {id:"closed",brandId:"icova",category:"Drinks",name:"Iced Latte",pricePence:375},
];
describe("MealDeck cross-brand upsells",()=>{
  it("suggests Load'd and Moktl for a Skorch burger, using only the supplied catalogue",()=>{
    const offers=recommendCrossBrandOffers({menu,cart:[menu[0]]});
    expect(offers.map(x=>x.target.brandId)).toEqual(["loadd","moktl"]);
    expect(offers[0]?.indicativePricePence).toBe(595);
    expect(offers[0]?.kind).toBe("upgrade");
  });
  it("never duplicates an item already in the basket or fabricates a discount",()=>{
    const offers=recommendCrossBrandOffers({menu,cart:[menu[0],menu[1]]});
    expect(offers.some(x=>x.target.id==="fries")).toBe(false);
    expect(offers.every(x=>x.indicativePricePence===x.target.pricePence)).toBe(true);
  });
  it("does not recommend items absent from a location's eligible menu",()=>{
    expect(recommendCrossBrandOffers({menu:[menu[0]],cart:[menu[0]]})).toEqual([]);
    expect(recommendCrossBrandOffers({menu,cart:[]})).toEqual([]);
  });
  it("requires explicit enabled rules and respects priority and limits",()=>{
    const disabled=DEFAULT_CROSS_BRAND_OFFERS.map(rule=>({...rule,enabled:false}));
    expect(recommendCrossBrandOffers({menu,cart:[menu[0]],rules:disabled})).toEqual([]);
    expect(recommendCrossBrandOffers({menu,cart:[menu[0]],limit:1})).toHaveLength(1);
  });
});
describe("Group payment and delivery safety",()=>{
  it("tracks invitees and host-paid remainder without treating pledges as payment",()=>{
    const result=groupPaymentProgress({totalPence:3000,hostCoveredPence:1000,contributions:[
      {participantId:"a",amountPence:1000,paidPence:1000},
      {participantId:"b",amountPence:1000,paidPence:0},
    ]});
    expect(result).toEqual({coveredPence:2000,remainingPence:1000,fullyCovered:false,valid:true});
  });
  it("only considers a group covered once every penny is verified",()=>{
    expect(groupPaymentProgress({totalPence:3000,hostCoveredPence:2000,contributions:[
      {participantId:"a",amountPence:1000,paidPence:1000},
    ]}).fullyCovered).toBe(true);
    expect(groupPaymentProgress({totalPence:3000,hostCoveredPence:2000,contributions:[
      {participantId:"a",amountPence:1000,paidPence:100},
    ]}).fullyCovered).toBe(false);
  });
  it("rejects duplicate invitees, overpayment and invalid amounts",()=>{
    expect(groupPaymentProgress({totalPence:500,contributions:[
      {participantId:"a",amountPence:250,paidPence:250},
      {participantId:"a",amountPence:250,paidPence:250},
    ]}).valid).toBe(false);
    expect(groupPaymentProgress({totalPence:500,hostCoveredPence:600,contributions:[]}).valid).toBe(false);
  });
  it("shows only delivery for MealDeck St Albans and requires handoff proofs",()=>{
    expect(previewFulfilments("stalbans")).toEqual(["delivery"]);
    expect(previewFulfilments("luton")).toEqual(["delivery","pickup","curbside"]);
    expect(handoffRequirements("curbside")).toContain("Vehicle registration");
    expect(handoffRequirements("curbside")).toContain("Order handoff code");
    expect(handoffRequirements("delivery")).toContain("Courier collection verification");
    expect(handoffRequirements("pickup")).toContain("Customer collection verification");
    expect(handoffRequirements("delivery")).toContain("Verified payment");
  });
});
