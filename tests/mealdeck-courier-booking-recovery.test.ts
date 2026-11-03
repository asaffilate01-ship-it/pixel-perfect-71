import {describe,expect,test} from "bun:test";
import {reconcileCourierBooking,type CourierAttempt,type CourierLookup} from "../src/lib/mealdeck-courier-booking-recovery";
const now="2026-11-03T22:00:00Z";
const attempt=():CourierAttempt=>({
  tenantId:"tenant-1",locationId:"luton",orderId:"order-1",
  provider:"uber_direct",quoteId:"quote-1",
  idempotencyKey:"courier:tenant-1:luton:order-1",
  state:"uncertain",providerBookingId:null,
  requestedAt:"2026-11-03T21:45:00Z",
});
const lookup=(changes:Partial<CourierLookup>={}):CourierLookup=>({
  provider:"uber_direct",idempotencyKey:"courier:tenant-1:luton:order-1",
  checkedAt:"2026-11-03T21:55:00Z",verified:true,result:"not_found",
  providerBookingId:null,...changes,
});
describe("courier booking uncertainty recovery",()=>{
  test("confirmed provider lookup records existing booking rather than rebooking",()=>{
    const result=reconcileCourierBooking(attempt(),lookup({result:"confirmed",providerBookingId:"delivery-33"}),now);
    expect(result).toEqual({action:"record_booking",reason:"booking_found",
      providerBookingId:"delivery-33",idempotencyKey:"courier:tenant-1:luton:order-1"});
  });
  test("only suggests retry using original provider idempotency key",()=>{
    const result=reconcileCourierBooking(attempt(),lookup(),now);
    expect(result.action).toBe("retry_same_key");
    expect(result.idempotencyKey).toBe(attempt().idempotencyKey);
  });
  test("holds during grace period even for verified not-found",()=>{
    const result=reconcileCourierBooking(attempt(),lookup({checkedAt:"2026-11-03T21:46:00Z"}),now);
    expect(result.reason).toBe("not_found_grace");
  });
  test("holds without verified provider lookup",()=>{
    expect(reconcileCourierBooking(attempt(),null,now).reason).toBe("await_lookup");
    expect(reconcileCourierBooking(attempt(),lookup({verified:false}),now).reason).toBe("unverified_lookup");
  });
  test("rejects cross-provider and cross-order results",()=>{
    expect(reconcileCourierBooking(attempt(),lookup({provider:"stuart"}),now).reason).toBe("lookup_mismatch");
    expect(reconcileCourierBooking(attempt(),lookup({idempotencyKey:"courier:other"}),now).reason).toBe("lookup_mismatch");
  });
  test("never automatically rebooks cancelled, rejected or confirmed attempts",()=>{
    for(const state of ["cancelled","rejected","confirmed"] as const){
      expect(reconcileCourierBooking({...attempt(),state},lookup(),now).reason).toBe("already_terminal");
    }
  });
  test("provider unavailable remains on hold and explicit refusal needs review",()=>{
    expect(reconcileCourierBooking(attempt(),lookup({result:"unavailable"}),now).action).toBe("hold");
    expect(reconcileCourierBooking(attempt(),lookup({result:"rejected"}),now).action).toBe("manual_review");
  });
  test("blocks an inconsistent provider booking ID",()=>{
    expect(reconcileCourierBooking(attempt(),lookup({result:"not_found",providerBookingId:"booking-1"}),now).action).toBe("manual_review");
  });
  test("blocks noncanonical booking keys, impossible dates and invalid retry windows",()=>{
    expect(reconcileCourierBooking({...attempt(),idempotencyKey:"changed"},lookup(),now).reason).toBe("invalid");
    expect(reconcileCourierBooking(attempt(),lookup(),"2026-11-03T21:00:00Z").reason).toBe("invalid");
    expect(reconcileCourierBooking(attempt(),lookup(),now,5).reason).toBe("invalid");
  });
});
