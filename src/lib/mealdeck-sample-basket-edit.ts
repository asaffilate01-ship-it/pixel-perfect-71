import type {MenuItem} from "./mealdeck";
import {
  SAMPLE_MAX_ITEMS,SAMPLE_MAX_PER_DISH,
  summariseSampleBasket,type SampleBasketLine,
} from "./mealdeck-preview-basket";

/**
 * Preview-only basket editing. No ordering, payment or persisted customer data.
 * Exact quantity updates retain the current trusted sample item snapshot
 * and never accept browser-supplied prices for an existing line.
 */
export type SampleBasketEdit={
  lines:SampleBasketLine[];
  changed:boolean;
  reason:"changed"|"invalid_basket"|"unknown_item"|"invalid_quantity"|"limit_reached";
};
const unchanged=(lines:readonly SampleBasketLine[],reason:SampleBasketEdit["reason"]):SampleBasketEdit=>({
  lines:[...lines],changed:false,reason,
});
export function setSampleDishQuantity(
  lines:readonly SampleBasketLine[],
  itemId:string,
  quantity:number,
):SampleBasketEdit{
  const summary=summariseSampleBasket(lines);
  if(!summary.valid)return unchanged(lines,"invalid_basket");
  if(typeof itemId!=="string"||!itemId.trim()||itemId.length>120)return unchanged(lines,"unknown_item");
  const index=lines.findIndex(line=>line.item.id===itemId);
  if(index<0)return unchanged(lines,"unknown_item");
  if(!Number.isSafeInteger(quantity)||quantity<0||quantity>SAMPLE_MAX_PER_DISH)
    return unchanged(lines,"invalid_quantity");
  const old=lines[index]!;
  if(old.quantity===quantity)return unchanged(lines,"changed");
  const next=quantity===0
    ?lines.filter((_,i)=>i!==index)
    :lines.map((line,i)=>i===index?{...line,quantity}:line);
  const result=summariseSampleBasket(next);
  if(!result.valid||result.dishes>SAMPLE_MAX_ITEMS)return unchanged(lines,"limit_reached");
  return {lines:next,changed:true,reason:"changed"};
}
export function clearSampleBasket(lines:readonly SampleBasketLine[]):SampleBasketEdit{
  if(!summariseSampleBasket(lines).valid)return unchanged(lines,"invalid_basket");
  return {lines:[],changed:lines.length>0,reason:"changed"};
}
/** Restore only a recently removed line from the same displayed catalogue. */
export function restoreRemovedSampleDish(
  lines:readonly SampleBasketLine[],
  removed:SampleBasketLine|null,
  catalogue:readonly MenuItem[],
):SampleBasketEdit{
  const state=summariseSampleBasket(lines);
  if(!state.valid)return unchanged(lines,"invalid_basket");
  if(!removed||!Number.isSafeInteger(removed.quantity)||removed.quantity<1||
    removed.quantity>SAMPLE_MAX_PER_DISH)return unchanged(lines,"invalid_quantity");
  const current=catalogue.find(item=>item.id===removed.item.id&&item.brandId===removed.item.brandId);
  if(!current||lines.some(line=>line.item.id===current.id))return unchanged(lines,"unknown_item");
  const next=[...lines,{item:current,quantity:removed.quantity}];
  if(!summariseSampleBasket(next).valid)return unchanged(lines,"limit_reached");
  return {lines:next,changed:true,reason:"changed"};
}
