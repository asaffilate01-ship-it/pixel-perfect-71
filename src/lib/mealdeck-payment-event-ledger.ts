/**
 * Verified-provider-event reducer for group payment shares.
 * Only invoke AFTER authenticating the Adyen webhook and binding merchant,
 * order, amount, currency, and payment reference to server-owned records.
 * This pure reducer never authorizes an actual transaction or publishes KDS.
 */
export type PaymentEvent={
 eventId:string;shareId:string;providerReference:string;currency:string;
 kind:"capture"|"refund"|"authorisation"|"failure";
 amountPence:number; verified:boolean;
};
export type ShareLedger={
 shareId:string;providerReference:string;currency:string;duePence:number;
 capturedPence:number;refundedPence:number;processedEventIds:readonly string[];
};
export type EventDecision={
 accepted:boolean;reason:"applied"|"duplicate"|"unverified"|"invalid"|"mismatch"|"overcapture"|"overrefund"|"no_settlement";
 next:ShareLedger;
};
const safe=(n:number)=>Number.isSafeInteger(n)&&n>=0;
export function applyVerifiedPaymentEvent(share:ShareLedger,event:PaymentEvent):EventDecision{
 const reject=(reason:EventDecision["reason"]):EventDecision=>({accepted:false,reason,next:share});
 if(!event.verified)return reject("unverified");
 if(!event.eventId||!event.shareId||!event.providerReference||!event.currency||
   !safe(event.amountPence)||event.amountPence===0||!safe(share.duePence)||share.duePence===0||
   !safe(share.capturedPence)||!safe(share.refundedPence)||share.refundedPence>share.capturedPence)return reject("invalid");
 if(share.processedEventIds.includes(event.eventId))return reject("duplicate");
 if(event.shareId!==share.shareId||event.providerReference!==share.providerReference||
   event.currency!==share.currency)return reject("mismatch");
 if(event.kind!=="capture"&&event.kind!=="refund")return reject("no_settlement");
 if(event.kind==="capture"&&event.amountPence>share.duePence-share.capturedPence)return reject("overcapture");
 if(event.kind==="refund"&&event.amountPence>share.capturedPence-share.refundedPence)return reject("overrefund");
 const next:ShareLedger={
  ...share,
  capturedPence:share.capturedPence+(event.kind==="capture"?event.amountPence:0),
  refundedPence:share.refundedPence+(event.kind==="refund"?event.amountPence:0),
  processedEventIds:[...share.processedEventIds,event.eventId],
 };
 return {accepted:true,reason:"applied",next};
}
