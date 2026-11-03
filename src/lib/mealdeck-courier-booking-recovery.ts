import type {DeliveryQuote} from "./mealdeck-delivery-selection";

/**
 * Server-side booking response reconciliation. This module does not contact
 * providers or store state. Only feed it trusted, persisted records and
 * authenticated provider lookups; all decisions need an atomic DB lock.
 */
export type CourierAttempt={
  tenantId:string;locationId:string;orderId:string;
  provider:DeliveryQuote["provider"];quoteId:string;
  idempotencyKey:string;
  state:"requesting"|"uncertain"|"confirmed"|"rejected"|"cancelled";
  providerBookingId:string|null;
  requestedAt:string;
};
export type CourierLookup={
  provider:DeliveryQuote["provider"];
  idempotencyKey:string;
  checkedAt:string;
  verified:boolean;
  result:"confirmed"|"not_found"|"unavailable"|"rejected"|"cancelled";
  providerBookingId:string|null;
};
export type RecoveryDecision={
  action:"hold"|"record_booking"|"manual_review"|"retry_same_key";
  reason:"invalid"|"already_terminal"|"await_lookup"|"unverified_lookup"|
    "lookup_mismatch"|"provider_unavailable"|"booking_found"|"provider_rejected"|
    "not_found_grace"|"not_found_retry"|"inconsistent_result";
  providerBookingId:string|null;
  idempotencyKey:string|null;
};
const id=(v:string)=>/^[A-Za-z0-9_-]{1,80}$/.test(v);
const providers=new Set<DeliveryQuote["provider"]>([
  "own_fleet","uber_direct","deliveroo_express","just_eat_go","stuart",
]);
const blocked=(reason:RecoveryDecision["reason"],action:RecoveryDecision["action"]="hold"):RecoveryDecision=>({
  action,reason,providerBookingId:null,idempotencyKey:null,
});
/**
 * An unknown booking must never produce a new-provider booking.
 * A retry is only a suggestion to retry with the ORIGINAL key/provider.
 */
export function reconcileCourierBooking(
  attempt:CourierAttempt,
  lookup:CourierLookup|null,
  nowIso:string,
  safeRetryAfterSeconds=300,
):RecoveryDecision{
  const now=Date.parse(nowIso),requested=Date.parse(attempt.requestedAt);
  const expectedKey=`courier:${attempt.tenantId}:${attempt.locationId}:${attempt.orderId}`;
  if(!id(attempt.tenantId)||!id(attempt.locationId)||!id(attempt.orderId)||
    !id(attempt.quoteId)||!providers.has(attempt.provider)||
    attempt.idempotencyKey!==expectedKey||!Number.isFinite(requested)||
    !Number.isFinite(now)||requested>now||!Number.isSafeInteger(safeRetryAfterSeconds)||
    safeRetryAfterSeconds<60||safeRetryAfterSeconds>86400)return blocked("invalid");
  if(attempt.state==="confirmed"||attempt.state==="cancelled"||
    attempt.state==="rejected")return blocked("already_terminal");
  if(attempt.providerBookingId!==null)return blocked("inconsistent_result","manual_review");
  if(!lookup)return blocked("await_lookup");
  if(!lookup.verified)return blocked("unverified_lookup");
  const checked=Date.parse(lookup.checkedAt);
  if(lookup.provider!==attempt.provider||lookup.idempotencyKey!==expectedKey||
    !Number.isFinite(checked)||checked<requested||checked>now)return blocked("lookup_mismatch");
  if(lookup.result==="confirmed"){
    if(!lookup.providerBookingId||lookup.providerBookingId.length>160)return blocked("inconsistent_result","manual_review");
    return {action:"record_booking",reason:"booking_found",
      providerBookingId:lookup.providerBookingId,idempotencyKey:expectedKey};
  }
  if(lookup.providerBookingId!==null)return blocked("inconsistent_result","manual_review");
  if(lookup.result==="unavailable")return blocked("provider_unavailable");
  if(lookup.result==="rejected"||lookup.result==="cancelled")
    return blocked("provider_rejected","manual_review");
  if(checked-requested<safeRetryAfterSeconds*1000)return blocked("not_found_grace");
  return {action:"retry_same_key",reason:"not_found_retry",providerBookingId:null,
    idempotencyKey:expectedKey};
}
