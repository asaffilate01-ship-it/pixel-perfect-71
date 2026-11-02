import {evaluateGroupKdsRelease,type GroupPayment} from "./mealdeck-group-payment-gate";

/**
 * Pure planning step for an atomic paid-order KDS outbox transaction.
 * Never trust GroupPayment fields from a client: load them from verified
 * server-owned order/share records under a database transaction lock.
 */
export type KitchenStation={brandId:string;stationId:string};
export type KdsTicketPlan={
 key:string;orderId:string;brandId:string;stationId:string;
};
export type KdsOutboxPlan={
 ready:boolean;reason:string;tickets:KdsTicketPlan[];
};
const id=(value:string)=>/^[a-zA-Z0-9_-]{1,80}$/.test(value);
export function planPaidKdsDispatch(
 order:GroupPayment,
 stations:readonly KitchenStation[],
 existingKeys:ReadonlySet<string>,
):KdsOutboxPlan{
 const payment=evaluateGroupKdsRelease(order);
 if(!payment.release)return {ready:false,reason:payment.reason,tickets:[]};
 if(!id(order.orderId)||stations.length===0)return {ready:false,reason:"invalid_stations",tickets:[]};
 const unique=new Set<string>();
 const tickets:KdsTicketPlan[]=[];
 for(const station of stations){
  if(!id(station.brandId)||!id(station.stationId))return {ready:false,reason:"invalid_stations",tickets:[]};
  const key=`kds:${order.orderId}:${station.brandId}:${station.stationId}`;
  if(unique.has(key))continue;
  unique.add(key);
  if(!existingKeys.has(key))tickets.push({key,orderId:order.orderId,brandId:station.brandId,stationId:station.stationId});
 }
 return {ready:true,reason:tickets.length?"enqueue":"already_enqueued",tickets};
}
