import { describe, expect, test } from "bun:test";
import {
  resolveDishbeeServiceability, parseDishbeeOrderReceipt,
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
      .toMatchObject({ served: true, location: "stalbans" });
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
      comingSoon: true, kitchenConfigured: true, checkoutApproval: "signed-off",
    })).toBe(false);
    expect(mayCreateCustomerOrder({
      comingSoon: false, kitchenConfigured: false, checkoutApproval: "signed-off",
    })).toBe(false);
    expect(mayCreateCustomerOrder({
      comingSoon: false, kitchenConfigured: true, checkoutApproval: undefined,
    })).toBe(false);
    expect(mayCreateCustomerOrder({
      comingSoon: false, kitchenConfigured: true, checkoutApproval: "true",
    })).toBe(false);
    expect(mayCreateCustomerOrder({
      comingSoon: false, kitchenConfigured: true, checkoutApproval: "signed-off",
    })).toBe(true);
  });
});
