/**
 * Pure payment-release decision for multi-brand shared baskets.
 * Inputs MUST be assembled from authenticated server-side provider webhooks.
 * This module does not verify webhooks, capture funds or create KDS tickets.
 */
export type SplitShare={
  shareId:string;participantId:string;duePence:number;
  capturedPence:number;refundedPence:number;
  currency:string;paymentStatus:"pending"|"authorised"|"captured"|"failed"|"cancelled";
};
export type GroupPayment={
  orderId:string;currency:string;totalPence:number;
  status:"payment_pending"|"paid"|"cancelled";
  shares:readonly SplitShare[];
};
export type ReleaseDecision={
  release:boolean;reason:
  "ready"|"invalid_order"|"cancelled"|"unpaid"|"invalid_shares"|
  "allocation_mismatch"|"payments_incomplete";
  outstandingPence:number;
};
const validAmount=(n:number)=>Number.isSafeInteger(n)&&n>=0;
export function evaluateGroupKdsRelease(order:GroupPayment):ReleaseDecision{
  const no=(reason:ReleaseDecision["reason"],outstandingPence=0):ReleaseDecision=>({release:false,reason,outstandingPence});
  if(!order.orderId||!order.currency||!validAmount(order.totalPence)||order.totalPence===0)return no("invalid_order");
  if(order.status==="cancelled")return no("cancelled");
  if(order.status!=="paid")return no("unpaid");
  if(!order.shares.length)return no("invalid_shares");
  const ids=new Set<string>();
  let allocation=0,remaining=0,invalidSettlement=false;
  for(const share of order.shares){
    if(!share.shareId||!share.participantId||ids.has(share.shareId)||
      share.currency!==order.currency||!validAmount(share.duePence)||share.duePence===0||
      !validAmount(share.capturedPence)||!validAmount(share.refundedPence)||
      share.refundedPence>share.capturedPence)return no("invalid_shares");
    ids.add(share.shareId);
    allocation+=share.duePence;
    if(!Number.isSafeInteger(allocation))return no("invalid_shares");
    const net=share.capturedPence-share.refundedPence;
    if(share.paymentStatus!=="captured"||net!==share.duePence){
      remaining+=Math.max(0,share.duePence-net);
      if(net>share.duePence)invalidSettlement=true;
    }
  }
  if(allocation!==order.totalPence)return no("allocation_mismatch");
  if(invalidSettlement||remaining>0||order.shares.some(s=>s.paymentStatus!=="captured"))return no("payments_incomplete",remaining);
  return {release:true,reason:"ready",outstandingPence:0};
}
