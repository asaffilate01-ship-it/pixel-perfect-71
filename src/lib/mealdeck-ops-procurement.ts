/** Pure UI-side purchasing validation. The Supabase RPC is the only authority. */
export type PurchaseStatus=
  "draft"|"submitted"|"approved"|"partially_received"|"received"|"cancelled";
export type ExpiryKind="use_by"|"best_before"|"none";
export type ExpiryState="expired"|"due_soon"|"ok"|"not_applicable";
export type PurchaseLineSummary={
  pack_count:number;
  base_units_per_pack:number;
  received_base_units:number;
  price_per_pack_pence:number|null;
};

export function positiveBaseQuantity(text:string,unit:string="g"):number|null{
  if(!/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,3})?$/.test(text.trim()))return null;
  const value=Number(text);
  return Number.isFinite(value)&&value>0&&value<=10000000&&
    (unit!=="each"||Number.isInteger(value))?value:null;
}
export function poRemainingBaseUnits(line:PurchaseLineSummary):number|null{
  const total=line.pack_count*line.base_units_per_pack;
  const received=line.received_base_units;
  if(!Number.isInteger(line.pack_count)||line.pack_count<1||
     !Number.isFinite(total)||total<=0||!Number.isFinite(received)||
     received<0||received>total)return null;
  return Math.round(Math.max(0,total-received)*1000)/1000;
}
export function quotedPoTotalPence(
  lines:readonly PurchaseLineSummary[],
):number|null{
  if(!lines.length)return null;
  let value=0;
  for(const line of lines){
    if(!Number.isSafeInteger(line.pack_count)||line.pack_count<=0||
       line.price_per_pack_pence===null||
       !Number.isSafeInteger(line.price_per_pack_pence)||
       line.price_per_pack_pence<0)return null;
    value+=line.pack_count*line.price_per_pack_pence;
    if(!Number.isSafeInteger(value))return null;
  }
  return value;
}
export function canSubmitPurchase(status:PurchaseStatus,hasLines:boolean):boolean{
  return status==="draft"&&hasLines;
}
export function canApprovePurchase(
  status:PurchaseStatus,globalFinanceManager:boolean,isCreator:boolean,
):boolean{
  return status==="submitted"&&globalFinanceManager&&!isCreator;
}
export function batchExpiryState(
  kind:ExpiryKind,expiryISO:string|null,asOfISO:string,alertDays=14,
):ExpiryState{
  if(kind==="none")return"not_applicable";
  if(!expiryISO||!validISODate(expiryISO)||!validISODate(asOfISO))return"expired";
  if(expiryISO<asOfISO)return"expired";
  const base=Date.parse(asOfISO+"T00:00:00Z");
  const expiry=Date.parse(expiryISO+"T00:00:00Z");
  if(!Number.isFinite(base)||!Number.isFinite(expiry))return"expired";
  return Math.round((expiry-base)/86400000)<=alertDays?"due_soon":"ok";
}
function validISODate(text:string):boolean{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return false;
  const parsed=new Date(text+"T00:00:00Z");
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===text;
}
export function expiryLabel(state:ExpiryState,kind:ExpiryKind="use_by"):string{
  switch(state){
    case"expired":return kind==="best_before"?"Past best-before — inspect quality":"Expired use-by — quarantine";
    case"due_soon":return"Expiry approaching";
    case"not_applicable":return"No expiry recorded";
    default:return"Within date";
  }
}
