import {modifierGroupsFor} from "./mealdeck";
import {
  sampleLineUnitPrice,summariseSampleBasket,
  type SampleBasketLine,type SampleBasketSelection,
} from "./mealdeck-preview-basket";

/** Customise one sample dish; selection applies to all units of that dish. */
export function setSampleDishModifiers(
  lines:readonly SampleBasketLine[],
  itemId:string,
  selections:readonly SampleBasketSelection[],
):{lines:SampleBasketLine[];changed:boolean;reason:"changed"|"invalid"|"not_found"|"limit"}{
  if(!summariseSampleBasket(lines).valid||!Array.isArray(selections)||
      typeof itemId!=="string")return {lines:[...lines],changed:false,reason:"invalid"};
  const index=lines.findIndex(line=>line.item.id===itemId);
  if(index<0)return {lines:[...lines],changed:false,reason:"not_found"};
  const target=lines[index]!;
  const candidate={...target,selected:selections.map(x=>({...x}))};
  if(sampleLineUnitPrice(candidate)===null)return {lines:[...lines],changed:false,reason:"invalid"};
  const next=lines.map((line,i)=>i===index?candidate:line);
  if(!summariseSampleBasket(next).valid)return {lines:[...lines],changed:false,reason:"limit"};
  return {lines:next,changed:true,reason:"changed"};
}
export function toggleSampleModifier(
  lines:readonly SampleBasketLine[],
  itemId:string,
  groupId:string,
  optionId:string,
):ReturnType<typeof setSampleDishModifiers>{
  const line=lines.find(row=>row.item.id===itemId);
  if(!line)return {lines:[...lines],changed:false,reason:"not_found"};
  const group=modifierGroupsFor(line.item).find(row=>row.id===groupId);
  const option=group?.options.find(row=>row.id===optionId);
  if(!group||!option)return {lines:[...lines],changed:false,reason:"invalid"};
  const current=line.selected??[];
  const present=current.some(x=>x.groupId===groupId&&x.optionId===optionId);
  const next=present
    ?current.filter(x=>!(x.groupId===groupId&&x.optionId===optionId))
    :[...current,{groupId,optionId}];
  return setSampleDishModifiers(lines,itemId,next);
}
