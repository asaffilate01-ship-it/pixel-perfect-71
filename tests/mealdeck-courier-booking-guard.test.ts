import {describe,expect,test} from "bun:test";
import {planCourierBooking,type CourierBookingContext} from "../src/lib/mealdeck-courier-booking-guard";
import type {DeliveryQuote} from "../src/lib/mealdeck-delivery-selection";

const now="2026-11-03T21:00:00Z";
const context=():CourierBookingContext=>({
  tenantId:"tenant-1",locationId:"luton",orderId:"order-123",
  currency:"GBP",fulfilment:"delivery",paymentStatus:"paid",
  allKitchenStationsReady:true,alreadyBooked:false,existingBookingRequest:false,
  maximumDeliveryMinutes:70,
});
const quote=(changes:Partial<DeliveryQuote>={}):DeliveryQuote=>({
  provider:"uber_direct",quoteId:"quote-1",amountPence:430,currency:"GBP",
  estimatedMinutes:35,serviceable:true,expiresAt:"2026-11-03T21:10:00Z",...changes,
});

describe("single courier booking gate",()=>{
  test("selects cheapest available quote and stable order-level key",()=>{
    const result=planCourierBooking(context(),[quote(),quote({provider:"own_fleet",quoteId:"own-1",amountPence:300})],now);
    expect(result.allowed).toBe(true);
    expect(result.intent?.provider).toBe("own_fleet");
    expect(result.intent?.idempotencyKey).toBe("courier:tenant-1:luton:order-123");
  });
  test("never books for pending or refunded orders",()=>{
    expect(planCourierBooking({...context(),paymentStatus:"pending"},[quote()],now).allowed).toBe(false);
    expect(planCourierBooking({...context(),paymentStatus:"refunded"},[quote()],now).allowed).toBe(false);
  });
  test("requires every kitchen station ready",()=>{
    expect(planCourierBooking({...context(),allKitchenStationsReady:false},[quote()],now).reason).toBe("kitchens_not_ready");
  });
  test("blocks repeat and uncertain requests",()=>{
    expect(planCourierBooking({...context(),alreadyBooked:true},[quote()],now).reason).toBe("already_requested");
    expect(planCourierBooking({...context(),existingBookingRequest:true},[quote()],now).reason).toBe("already_requested");
  });
  test("does not book pickup or kerbside",()=>{
    expect(planCourierBooking({...context(),fulfilment:"pickup"},[quote()],now).reason).toBe("not_delivery");
    expect(planCourierBooking({...context(),fulfilment:"kerbside"},[quote()],now).reason).toBe("not_delivery");
  });
  test("fails closed for expired, wrong currency or nonserviceable quotes",()=>{
    expect(planCourierBooking(context(),[quote({expiresAt:now})],now).reason).toBe("no_valid_quote");
    expect(planCourierBooking(context(),[quote({currency:"EUR"})],now).reason).toBe("no_valid_quote");
    expect(planCourierBooking(context(),[quote({serviceable:false})],now).reason).toBe("no_valid_quote");
  });
  test("rejects unsafe ids and invalid provider quote identifiers",()=>{
    expect(planCourierBooking({...context(),orderId:"../other"},[quote()],now).reason).toBe("invalid_context");
    expect(planCourierBooking(context(),[quote({quoteId:"../other"})],now).reason).toBe("no_valid_quote");
  });
  test("never invents a provider when none is available",()=>{
    expect(planCourierBooking(context(),[],now)).toEqual({allowed:false,reason:"no_valid_quote",intent:null});
  });
});
