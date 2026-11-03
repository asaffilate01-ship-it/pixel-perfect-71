/**
 * Phase 27: one-time server-side estimate from the current PUBLIC Dishbee
 * catalogue. No browser price, modifier delta or promotional claim is used.
 * This is not an accepted order, guaranteed price, captured payment or quote
 * from a courier. Checkout independently reprices everything in Dishbee.
 */
export type EstimateLine={
 itemId:string;quantity:number;modifierIds:readonly string[];
};
export type GoodsEstimate=
 |{valid:true;goodsPence:number;itemCount:number}
 |{valid:false;reason:"invalid_cart"|"unavailable_item"|"invalid_modifiers"|"invalid_price"};
const MAX_ORDER_PENCE=10_000_000;
const money=(value:unknown,allowNegative=false):value is number=>
 typeof value==="number"&&Number.isSafeInteger(value)&&
 (allowNegative?value>=-100_000:value>=0)&&value<=MAX_ORDER_PENCE;
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const uuid=(v:unknown)=>typeof v==="string"&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const fail=(reason:"invalid_cart"|"unavailable_item"|"invalid_modifiers"|"invalid_price"):GoodsEstimate=>
 ({valid:false,reason});

/** Exact item-price and modifier calculation on trusted server catalogue rows. */
export function estimateGoodsFromDishbee(
 rows:readonly unknown[],lines:readonly EstimateLine[],
):GoodsEstimate{
 if(lines.length<1||lines.length>60||rows.length>3000)return fail("invalid_cart");
 const byId=new Map<string,Record<string,unknown>>();
 for(const row of rows){
  if(!obj(row)||!uuid(row["item_id"])||byId.has(row["item_id"] as string))
   return fail("unavailable_item");
  byId.set(row["item_id"] as string,row);
 }
 let goods=0,itemCount=0;
 for(const line of lines){
  if(!uuid(line.itemId)||!Number.isSafeInteger(line.quantity)||
   line.quantity<1||line.quantity>50||
   !Array.isArray(line.modifierIds)||line.modifierIds.length>20||
   line.modifierIds.some(id=>!uuid(id))||
   new Set(line.modifierIds).size!==line.modifierIds.length)
    return fail("invalid_cart");
  const item=byId.get(line.itemId);
  if(!item||item["channel_open"]!==true)return fail("unavailable_item");
  if(!money(item["price_pence"]))return fail("invalid_price");
  const rawGroups=item["modifier_groups"];
  if(!Array.isArray(rawGroups))return fail("invalid_modifiers");
  let optionsPence=0;
  const used=new Set<string>();
  for(const raw of rawGroups){
   if(!obj(raw)||!Array.isArray(raw["options"])||
    !Number.isSafeInteger(raw["minSelect"])||
    !Number.isSafeInteger(raw["maxSelect"])||
    (raw["minSelect"] as number)<0||
    (raw["maxSelect"] as number)<(raw["minSelect"] as number))
    return fail("invalid_modifiers");
   let count=0;
   for(const option of raw["options"]){
    if(!obj(option)||!uuid(option["id"])||
      !money(option["priceDeltaPence"],true))return fail("invalid_modifiers");
    const id=option["id"] as string;
    if(line.modifierIds.includes(id)){
      if(used.has(id))return fail("invalid_modifiers");
      used.add(id);
      count++;
      optionsPence+=option["priceDeltaPence"] as number;
    }
   }
   if(count<(raw["minSelect"] as number)||count>(raw["maxSelect"] as number))
    return fail("invalid_modifiers");
  }
  if(used.size!==line.modifierIds.length)return fail("invalid_modifiers");
  const unit=(item["price_pence"] as number)+optionsPence;
  if(!money(unit)||unit<0)return fail("invalid_price");
  goods+=unit*line.quantity;
  itemCount+=line.quantity;
  if(!money(goods)||itemCount>3000)return fail("invalid_price");
 }
 if(goods<=0)return fail("invalid_price");
 return {valid:true,goodsPence:goods,itemCount};
}

/** A single scalar from the Dishbee delivery-policy RPC, not a client fee. */
export function verifyDishbeeFeeResult(raw:unknown):number|null{
 return money(raw)?raw:null;
}
