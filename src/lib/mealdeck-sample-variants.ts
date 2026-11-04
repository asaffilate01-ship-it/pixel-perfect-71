import {modifierGroupsFor,type MenuItem} from "./mealdeck";
import {SAMPLE_MAX_ITEMS,SAMPLE_MAX_PER_DISH,sampleLineUnitPrice,summariseSampleBasket,
  type SampleBasketLine,type SampleBasketSelection} from "./mealdeck-preview-basket";

export type VariantEditResult={
  lines:SampleBasketLine[];changed:boolean;
  reason:"changed"|"invalid"|"not_found"|"limit";
};
const reject=(lines:readonly SampleBasketLine[],reason:VariantEditResult["reason"]):VariantEditResult=>
  ({lines:[...lines],changed:false,reason});
export const sampleVariantKey=(line:SampleBasketLine)=>line.variantId??line.item.id;

/**
 * Duplicate a sample dish as an independent one-serving variant. The identifier
 * is UI-local, deterministic and has NO payment or security significance.
 */
export function duplicateSampleVariant(
  lines:readonly SampleBasketLine[],key:string,
):VariantEditResult{
  if(!summariseSampleBasket(lines).valid)return reject(lines,"invalid");
  const original=lines.find(line=>sampleVariantKey(line)===key);
  if(!original)return reject(lines,"not_found");
  const summary=summariseSampleBasket(lines);
  if(summary.dishes>=SAMPLE_MAX_ITEMS||lines.length>=SAMPLE_MAX_ITEMS)return reject(lines,"limit");
  let serial=1;
  while(lines.some(line=>sampleVariantKey(line)===original.item.id+"::variant:"+serial))serial++;
  const next:SampleBasketLine[]=[...lines,{
    item:original.item,quantity:1,variantId:original.item.id+"::variant:"+serial,
    selected:original.selected?.map(value=>({...value}))??[],
  }];
  return summariseSampleBasket(next).valid
    ?{lines:next,changed:true,reason:"changed"}:reject(lines,"limit");
}
/** Update quantity for one exact line, never every version of the dish. */
export function setSampleVariantQuantity(
  lines:readonly SampleBasketLine[],key:string,quantity:number,
):VariantEditResult{
  if(!summariseSampleBasket(lines).valid)return reject(lines,"invalid");
  const index=lines.findIndex(line=>sampleVariantKey(line)===key);
  if(index<0)return reject(lines,"not_found");
  if(!Number.isSafeInteger(quantity)||quantity<0||quantity>SAMPLE_MAX_PER_DISH)return reject(lines,"invalid");
  if(lines[index]!.quantity===quantity)return reject(lines,"changed");
  const next=quantity===0?lines.filter((_,i)=>i!==index)
    :lines.map((line,i)=>i===index?{...line,quantity}:line);
  return summariseSampleBasket(next).valid
    ?{lines:next,changed:true,reason:"changed"}:reject(lines,"limit");
}
/** Selected options and prices are validated against the canonical sample dish. */
export function toggleSampleVariantOption(
  lines:readonly SampleBasketLine[],key:string,groupId:string,optionId:string,
):VariantEditResult{
  if(!summariseSampleBasket(lines).valid)return reject(lines,"invalid");
  const index=lines.findIndex(line=>sampleVariantKey(line)===key);
  if(index<0)return reject(lines,"not_found");
  const original=lines[index]!;
  const group=modifierGroupsFor(original.item).find(g=>g.id===groupId);
  if(!group||!group.options.some(o=>o.id===optionId))return reject(lines,"invalid");
  const selected=original.selected??[];
  const exists=selected.some(s=>s.groupId===groupId&&s.optionId===optionId);
  const nextSelected:SampleBasketSelection[]=exists
    ?selected.filter(s=>!(s.groupId===groupId&&s.optionId===optionId))
    :[...selected,{groupId,optionId}];
  const candidate={...original,selected:nextSelected};
  if(sampleLineUnitPrice(candidate)===null)return reject(lines,"invalid");
  const next=lines.map((line,i)=>i===index?candidate:line);
  return summariseSampleBasket(next).valid
    ?{lines:next,changed:true,reason:"changed"}:reject(lines,"limit");
}
/** Restore a deleted variant using the currently displayed catalogue only. */
export function restoreSampleVariant(
  lines:readonly SampleBasketLine[],removed:SampleBasketLine|null,
  catalogue:readonly MenuItem[],
):VariantEditResult{
  if(!summariseSampleBasket(lines).valid||!removed||!Number.isSafeInteger(removed.quantity)||
    removed.quantity<1||removed.quantity>SAMPLE_MAX_PER_DISH)return reject(lines,"invalid");
  const current=catalogue.find(item=>item.id===removed.item.id&&item.brandId===removed.item.brandId);
  if(!current||lines.some(line=>sampleVariantKey(line)===sampleVariantKey(removed)))
    return reject(lines,"not_found");
  const next=[...lines,{...removed,item:current}];
  return summariseSampleBasket(next).valid
    ?{lines:next,changed:true,reason:"changed"}:reject(lines,"limit");
}
