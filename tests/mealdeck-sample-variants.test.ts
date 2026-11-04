import {describe,expect,test} from "bun:test";
import type {MenuItem} from "../src/lib/mealdeck";
import {adjustSampleBasket,summariseSampleBasket,type SampleBasketLine} from "../src/lib/mealdeck-preview-basket";
import {duplicateSampleVariant,restoreSampleVariant,sampleVariantKey,setSampleVariantQuantity,toggleSampleVariantOption} from "../src/lib/mealdeck-sample-variants";

const burger:MenuItem={
  id:"burger",brandId:"skorch-burgers",category:"Burgers",name:"Burger",pricePence:900,
  modifierGroups:[{id:"extras",name:"Extras",minSelect:0,maxSelect:2,options:[
    {id:"cheese",name:"Cheese",priceDeltaPence:100},
    {id:"sauce",name:"Sauce",priceDeltaPence:50},
  ]}],
};
const drink:MenuItem={id:"drink",brandId:"moktl",category:"Drinks",name:"Drink",pricePence:300};
const plain:SampleBasketLine[]=[{item:burger,quantity:2},{item:drink,quantity:1}];

describe("Phase 42: independent customised sample variants",()=>{
  test("same dish can have two configurations with accurate money totals",()=>{
    const copy=duplicateSampleVariant(plain,"burger");
    expect(copy.changed).toBe(true);
    expect(copy.lines).toHaveLength(3);
    const variant=copy.lines[2]!;
    expect(variant.variantId).toBe("burger::variant:1");
    const customised=toggleSampleVariantOption(copy.lines,sampleVariantKey(variant),"extras","cheese");
    expect(customised.changed).toBe(true);
    expect(customised.lines[0]?.selected).toBeUndefined();
    expect(customised.lines[2]?.selected).toEqual([{groupId:"extras",optionId:"cheese"}]);
    expect(summariseSampleBasket(customised.lines)).toEqual({
      valid:true,dishes:4,brands:2,subtotalPence:3100,
    });
  });
  test("quantities and removals target one version only",()=>{
    const copies=duplicateSampleVariant(plain,"burger").lines;
    const updated=setSampleVariantQuantity(copies,"burger::variant:1",3);
    expect(updated.changed).toBe(true);
    expect(updated.lines[0]?.quantity).toBe(2);
    expect(updated.lines[2]?.quantity).toBe(3);
    const removed=setSampleVariantQuantity(updated.lines,"burger::variant:1",0);
    expect(removed.lines).toHaveLength(2);
    expect(removed.lines[0]?.quantity).toBe(2);
  });
  test("duplicating another variant uses a fresh ID and retained selections",()=>{
    const once=duplicateSampleVariant(plain,"burger").lines;
    const customised=toggleSampleVariantOption(once,"burger::variant:1","extras","sauce").lines;
    const twice=duplicateSampleVariant(customised,"burger::variant:1");
    expect(twice.changed).toBe(true);
    expect(twice.lines[3]?.variantId).toBe("burger::variant:2");
    expect(twice.lines[3]?.selected).toEqual([{groupId:"extras",optionId:"sauce"}]);
  });
  test("menu add and remove target base version, not independently customised variants",()=>{
    const variants=duplicateSampleVariant(plain,"burger").lines;
    const customised=toggleSampleVariantOption(variants,"burger::variant:1","extras","cheese").lines;
    const menuAdded=adjustSampleBasket(customised,burger,1);
    expect(menuAdded.find(x=>x.variantId===undefined&&x.item.id==="burger")?.quantity).toBe(3);
    expect(menuAdded.find(x=>x.variantId)?.quantity).toBe(1);
    const noBase=customised.filter(x=>x.item.id!=="burger"||x.variantId);
    const newBase=adjustSampleBasket(noBase,burger,1);
    expect(newBase.filter(x=>x.item.id==="burger")).toHaveLength(2);
    expect(newBase.find(x=>x.variantId===undefined&&x.item.id==="burger")?.quantity).toBe(1);
  });
  test("undo restores just the removed variant from the current catalogue",()=>{
    const copies=duplicateSampleVariant(plain,"burger").lines;
    const removed=copies[2]!;
    const result=restoreSampleVariant(copies.slice(0,2),removed,[burger,drink]);
    expect(result.changed).toBe(true);
    expect(result.lines[2]?.variantId).toBe("burger::variant:1");
    expect(restoreSampleVariant(result.lines,removed,[burger,drink]).changed).toBe(false);
    expect(restoreSampleVariant(copies.slice(0,2),removed,[drink]).changed).toBe(false);
  });
  test("tampering with duplicate identifiers, brand, or base prices fails closed",()=>{
    const copies=duplicateSampleVariant(plain,"burger").lines;
    expect(summariseSampleBasket([...copies,copies[2]!]).valid).toBe(false);
    expect(summariseSampleBasket([...plain,{item:{...burger,brandId:"other"},quantity:1,variantId:"burger::variant:1"}]).valid).toBe(false);
    expect(summariseSampleBasket([...plain,{item:{...burger,pricePence:1},quantity:1,variantId:"burger::variant:1"}]).valid).toBe(false);
    expect(summariseSampleBasket([...plain,{item:burger,quantity:1,variantId:"forged"}]).valid).toBe(false);
  });
  test("invalid modifier groups and quantity limits leave the original basket untouched",()=>{
    const copies=duplicateSampleVariant(plain,"burger").lines;
    expect(toggleSampleVariantOption(copies,"burger::variant:1","extras","unknown").changed).toBe(false);
    expect(setSampleVariantQuantity(copies,"burger::variant:1",-1).changed).toBe(false);
    expect(setSampleVariantQuantity(copies,"burger::variant:1",1.5).changed).toBe(false);
    expect(setSampleVariantQuantity(copies,"missing",2).reason).toBe("not_found");
    expect(copies[0]?.quantity).toBe(2);
  });
  test("the result remains a preview only, never a paid order",()=>{
    const result=duplicateSampleVariant(plain,"burger");
    expect("orderId" in result).toBe(false);
    expect("paymentStatus" in result).toBe(false);
    expect("deliveryFee" in result).toBe(false);
  });
});
