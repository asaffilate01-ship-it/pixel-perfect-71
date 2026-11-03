import {chooseDelivery,type DeliveryQuote} from "./mealdeck-delivery-selection";

/**
 * Pure, conservative courier booking planner. All inputs must be assembled
 * from trusted server-owned data inside a transaction, NOT the browser.
 * No external booking call is performed here.
 */
export type CourierBookingContext={
  tenantId:string;locationId:string;orderId:string;
  currency:string;fulfilment:"delivery"|"pickup"|"kerbside";
  paymentStatus:"pending"|"paid"|"refunded"|"cancelled";
  allKitchenStationsReady:boolean;
  alreadyBooked:boolean;
  existingBookingRequest:boolean;
  maximumDeliveryMinutes:number;
};
export type CourierBookingIntent={
  idempotencyKey:string;
  tenantId:string;locationId:string;orderId:string;
  provider:DeliveryQuote["provider"];quoteId:string;
  amountPence:number;currency:string;
};
export type CourierBookingDecision={
  allowed:boolean;
  reason:"ready"|"invalid_context"|"not_delivery"|"payment_not_paid"|
    "kitchens_not_ready"|"already_requested"|"no_valid_quote";
  intent:CourierBookingIntent|null;
};
const validId=(value:string)=>/^[A-Za-z0-9_-]{1,80}$/.test(value);
const blocked=(reason:CourierBookingDecision["reason"]):CourierBookingDecision=>({
  allowed:false,reason,intent:null,
});
export function planCourierBooking(
  context:CourierBookingContext,
  quotes:readonly DeliveryQuote[],
  nowIso:string,
):CourierBookingDecision{
  if(!validId(context.tenantId)||!validId(context.locationId)||
    !validId(context.orderId)||! /^[A-Z]{3}$/.test(context.currency)||
    !Number.isSafeInteger(context.maximumDeliveryMinutes)||
    context.maximumDeliveryMinutes<=0)return blocked("invalid_context");
  if(context.fulfilment!=="delivery")return blocked("not_delivery");
  if(context.paymentStatus!=="paid")return blocked("payment_not_paid");
  if(!context.allKitchenStationsReady)return blocked("kitchens_not_ready");
  // Never automatically rebook an order. An uncertain provider response must
  // be investigated rather than treated as a failed request.
  if(context.alreadyBooked||context.existingBookingRequest)return blocked("already_requested");
  const choice=chooseDelivery(quotes,context.currency,nowIso,context.maximumDeliveryMinutes);
  if(!choice.selected)return blocked("no_valid_quote");
  const q=choice.selected;
  if(!validId(q.quoteId))return blocked("no_valid_quote");
  return {
    allowed:true,reason:"ready",
    intent:{
      idempotencyKey:`courier:${context.tenantId}:${context.locationId}:${context.orderId}`,
      tenantId:context.tenantId,locationId:context.locationId,orderId:context.orderId,
      provider:q.provider,quoteId:q.quoteId,amountPence:q.amountPence,currency:q.currency,
    },
  };
}
