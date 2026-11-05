import { describe, expect, test } from "bun:test";
import {
  resolveDishbeeServiceability, parseDishbeeOrderReceipt,
  parseDishbeeCheckoutAttemptReceipt,
  mayCreateCustomerOrder, type ApprovedKitchenRoute,
} from "../src/lib/mealdeck-dishbee-contract";
const tenants = {
  meal: "11111111-1111-4111-8111-111111111111",
  other: "99999999-9999-4999-8999-999999999999",
};
const places = {
  luton: "22222222-2222-4222-8222-222222222222",
  stalbans: "33333333-3333-4333-8333-333333333333",
};
const approved: ApprovedKitchenRoute[] = [
  { location: "luton", tenantId: tenants.meal, locationId: places.luton },
  { location: "stalbans", tenantId: tenants.meal, locationId: places.stalbans },
];
const response = (patch: Record<string, unknown> = {}) => ({
  served: true, tenant_id: tenants.meal, location_id: places.luton,
  town: "St Albans", location_name: "Wrong text", channel_open: true,
  message: "Your MealDeck kitchen serves this postcode.",
  ...patch,
});
describe("Phase 22 canonical Dishbee kitchen routing", () => {
  test("routes by exact configured tenant and location, never postcode/town text", () => {
    expect(resolveDishbeeServiceability(response(), approved)).toMatchObject({
      served: true, location: "luton", channelOpen: true,
    });
    expect(resolveDishbeeServiceability(response({ location_id: places.stalbans, town: "Luton" }), approved))
      .toMatchObject({ served: false });
  });
  test("does not trust a valid location ID from a different tenant", () => {
    expect(resolveDishbeeServiceability(response({ tenant_id: tenants.other }), approved).served).toBe(false);
    expect(resolveDishbeeServiceability(response({ location_id: tenants.other }), approved).served).toBe(false);
  });
  test("fails closed for ambiguous, absent or malformed kitchen configuration", () => {
    expect(resolveDishbeeServiceability(response(), []).served).toBe(false);
    expect(resolveDishbeeServiceability(response(), [...approved, approved[0]!]).served).toBe(false);
    expect(resolveDishbeeServiceability(response({ location_id: "not-uuid" }), approved).served).toBe(false);
  });
  test("closed kitchens stay served but not open", () => {
    expect(resolveDishbeeServiceability(response({ channel_open: false }), approved))
      .toMatchObject({ served: true, channelOpen: false });
    expect(resolveDishbeeServiceability(response({ channel_open: "true" }), approved).served).toBe(false);
  });
  test("provider errors, array ambiguity and unknown postcodes never invent service", () => {
    expect(resolveDishbeeServiceability(null, approved).served).toBe(false);
    expect(resolveDishbeeServiceability([response(), response()], approved).served).toBe(false);
    expect(resolveDishbeeServiceability({ served: false, message: "Not covered" }, approved))
      .toEqual({ served: false, message: "Not covered" });
    expect(resolveDishbeeServiceability({ served: true, message: "<secret>" }, approved).served).toBe(false);
  });
});
describe("Phase 23 payment-pending receipt and launch gate", () => {
  const order = { order_id: "44444444-4444-4444-8444-444444444444", handoff_code: "0702" };
  test("accepts only a canonical UUID and 4-digit private checkout code", () => {
    expect(parseDishbeeOrderReceipt([order]))
      .toEqual({ orderId: order.order_id, handoffCode: "0702" });
    expect(parseDishbeeOrderReceipt({ ...order, handoff_code: "0000" })).not.toBeNull();
  });
  test("rejects wrong, missing, ambiguous or fabricated receipts", () => {
    for(const value of [
      null, [order, order], { ...order, handoff_code: "" },
      { ...order, handoff_code: "123456" }, { ...order, handoff_code: "123a" },
      { ...order, order_id: "x" }, { ...order, order_id: 12 },
    ]) expect(parseDishbeeOrderReceipt(value)).toBeNull();
  });
  test("COMING_SOON and absent approvals always prevent customer order writes", () => {
    expect(mayCreateCustomerOrder({
      location: "luton", fulfilment: "delivery",
      comingSoon: true, kitchenConfigured: true, checkoutApproval: "signed-off",
    })).toBe(false);
    expect(mayCreateCustomerOrder({
      location: "luton", fulfilment: "delivery",
      comingSoon: false, kitchenConfigured: false, checkoutApproval: "signed-off",
    })).toBe(false);
    expect(mayCreateCustomerOrder({
      location: "luton", fulfilment: "delivery",
      comingSoon: false, kitchenConfigured: true, checkoutApproval: undefined,
    })).toBe(false);
    expect(mayCreateCustomerOrder({
      location: "luton", fulfilment: "delivery",
      comingSoon: false, kitchenConfigured: true, checkoutApproval: "true",
    })).toBe(false);
    expect(mayCreateCustomerOrder({
      location: "luton", fulfilment: "delivery",
      comingSoon: false, kitchenConfigured: true, checkoutApproval: "signed-off",
    })).toBe(true);
  });
  test("an open global gate and configured kitchen never activate a future location", () => {
    for (const location of ["stalbans", "bedford", "unknown"])
      for (const fulfilment of ["delivery", "pickup", "curbside", "dinein"])
        expect(mayCreateCustomerOrder({
          location, fulfilment,
          comingSoon: false, kitchenConfigured: true, checkoutApproval: "signed-off",
        })).toBe(false);
    expect(mayCreateCustomerOrder({
      location: "luton", fulfilment: "dinein",
      comingSoon: false, kitchenConfigured: true, checkoutApproval: "signed-off",
    })).toBe(false);
  });
});

describe("P32 canonical idempotent checkout receipts", () => {
  const receipt = {
    order_id:"44444444-4444-4444-8444-444444444444",
    handoff_code:"0070",order_status:"payment_pending",replayed:false,
  };
  test("new pending order and exact same-attempt replay remain pending", () => {
    expect(parseDishbeeCheckoutAttemptReceipt([receipt])).toEqual({
      kind:"payment_pending",orderId:receipt.order_id,
      handoffCode:"0070",replayed:false,
    });
    expect(parseDishbeeCheckoutAttemptReceipt([{...receipt,replayed:true}])).toEqual({
      kind:"payment_pending",orderId:receipt.order_id,
      handoffCode:"0070",replayed:true,
    });
  });
  test("a replay of a paid/ready order is not treated as an unpaid new order", () => {
    for(const order_status of ["paid","accepted","preparing","ready","fulfilled"]) {
      expect(parseDishbeeCheckoutAttemptReceipt({...receipt,order_status,replayed:true})?.kind)
        .toBe("existing_order");
      expect(parseDishbeeCheckoutAttemptReceipt({...receipt,order_status,replayed:false}))
        .toBeNull();
    }
  });
  test("cancelled/refunded attempts require support and never a new payment claim", () => {
    for(const order_status of ["cancelled","refunded","failed"]) {
      expect(parseDishbeeCheckoutAttemptReceipt({...receipt,order_status,replayed:true})?.kind)
        .toBe("needs_support");
    }
  });
  test("fails closed on ambiguous or malformed, spoofed receipts", () => {
    for(const value of [
      null,[receipt,receipt],{...receipt,replayed:"true"},
      {...receipt,order_status:"paid",replayed:false},
      {...receipt,handoff_code:"123a"}, {...receipt,handoff_code:"12345"},
      {...receipt,order_id:"some-ref"}, {...receipt,order_status:"hacked"},
    ]) expect(parseDishbeeCheckoutAttemptReceipt(value)).toBeNull();
  });
});
