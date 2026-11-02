/**
 * Pure delivery quotation comparison. Quotes must originate from trusted server
 * integrations; no customer-supplied courier pricing or serviceability flags.
 * This helper does not book, charge, or dispatch a courier.
 */
export type DeliveryQuote={
 provider:"own_fleet"|"uber_direct"|"deliveroo_express"|"just_eat_go"|"stuart";
 quoteId:string;amountPence:number;currency:string;
 estimatedMinutes:number;serviceable:boolean;expiresAt:string;
};
export type DeliveryChoice={
 selected:DeliveryQuote|null;
 reason:"selected"|"no_serviceable_quotes";
};
export function chooseDelivery(
 quotes:readonly DeliveryQuote[],currency:string,nowIso:string,
 maxDeliveryMinutes:number,
):DeliveryChoice{
 const now=Date.parse(nowIso);
 if(!Number.isFinite(now)||!currency||!Number.isSafeInteger(maxDeliveryMinutes)||maxDeliveryMinutes<=0){
  return {selected:null,reason:"no_serviceable_quotes"};
 }
 const valid=quotes.filter(q=>
  q.serviceable&&q.currency===currency&&q.quoteId.length>0&&
  Number.isSafeInteger(q.amountPence)&&q.amountPence>=0&&
  Number.isSafeInteger(q.estimatedMinutes)&&q.estimatedMinutes>0&&
  q.estimatedMinutes<=maxDeliveryMinutes&&
  Number.isFinite(Date.parse(q.expiresAt))&&Date.parse(q.expiresAt)>now
 );
 const priority:Record<DeliveryQuote["provider"],number>={
  own_fleet:0,uber_direct:1,deliveroo_express:2,just_eat_go:3,stuart:4,
 };
 const sorted=[...valid].sort((a,b)=>
  a.amountPence-b.amountPence||
  a.estimatedMinutes-b.estimatedMinutes||
  priority[a.provider]-priority[b.provider]||
  a.quoteId.localeCompare(b.quoteId)
 );
 const selected=sorted[0];
 return selected?{selected,reason:"selected"}:{selected:null,reason:"no_serviceable_quotes"};
}
