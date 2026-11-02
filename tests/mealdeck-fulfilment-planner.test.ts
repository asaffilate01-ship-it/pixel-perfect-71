import { describe, expect, test } from "bun:test";
import { evaluateMasterPass, planCourierBooking, type KitchenTicketState, type CourierPlanInput } from "../src/lib/mealdeck-fulfilment-planner";
const station = [{ brandId: "skorch", stationId: "grill" }, { brandId: "load_d", stationId: "fryer" }];
const tickets = (status: KitchenTicketState["status"] = "ready"): KitchenTicketState[] => station.map(s => ({
  key: ["kds", "ord_1", s.brandId, s.stationId].join(":"), status,
}));
const input = (change: Partial<CourierPlanInput> = {}): CourierPlanInput => ({
  order: { orderId: "ord_1", currency: "GBP", totalPence: 2500, status: "paid",
    shares: [{ shareId: "share1", participantId: "person1", currency: "GBP", duePence: 2500,
      capturedPence: 2500, refundedPence: 0, paymentStatus: "captured" }] },
  expectedStations: station, actualTickets: tickets(),
  quotes: [{ provider: "uber_direct", quoteId: "q-1", amountPence: 500, currency: "GBP",
    estimatedMinutes: 35, expiresAt: "2026-11-03T00:00:00Z", serviceable: true },
    { provider: "own_fleet", quoteId: "q-2", amountPence: 350, currency: "GBP",
      estimatedMinutes: 40, expiresAt: "2026-11-03T00:00:00Z", serviceable: true }],
  nowIso: "2026-11-02T22:00:00Z", maxDeliveryMinutes: 60,
  maxCourierCostPence: 600, bookingState: "none", ...change,
});
describe("Phase 17 master pass and courier planning", () => {
  test("all brands must be ready", () => {
    expect(evaluateMasterPass("ord_1", station, tickets()).ready).toBe(true);
    expect(evaluateMasterPass("ord_1", station, tickets("preparing")).ready).toBe(false);
  });
  test("missing, unknown, duplicate or cancelled tickets cannot complete", () => {
    expect(evaluateMasterPass("ord_1", station, tickets().slice(0, 1)).reason).toBe("kitchens_incomplete");
    expect(evaluateMasterPass("ord_1", station, [...tickets(), { key: "other", status: "ready" }]).reason).toBe("invalid_routing");
    expect(evaluateMasterPass("ord_1", [...station, station[0]!], tickets()).reason).toBe("invalid_routing");
    expect(evaluateMasterPass("ord_1", station, tickets("cancelled")).reason).toBe("kitchen_cancelled");
  });
  test("selects cheapest eligible quote with stable one-order booking identity", () => {
    const result = planCourierBooking(input());
    expect(result.ready).toBe(true);
    expect(result.request?.provider).toBe("own_fleet");
    expect(result.request?.idempotencyKey).toBe("mealdeck:delivery:ord_1");
    expect(planCourierBooking(input()).request).toEqual(result.request);
  });
  test("never plans before paid capture or after refund", () => {
    const initial = input();
    expect(planCourierBooking(input({ order: { ...initial.order, status: "payment_pending" } })).reason).toBe("payment_unconfirmed");
    expect(planCourierBooking(input({ order: { ...initial.order,
      shares: [{ ...initial.order.shares[0]!, refundedPence: 1 }] } })).reason).toBe("payment_unconfirmed");
  });
  test("waits for all brand stations and rejects cancelled production", () => {
    expect(planCourierBooking(input({ actualTickets: tickets("preparing") })).reason).toBe("kitchens_incomplete");
    expect(planCourierBooking(input({ actualTickets: tickets("cancelled") })).reason).toBe("kitchen_cancelled");
  });
  test("requires operator reconciliation before any retry or switching couriers", () => {
    for (const bookingState of ["requesting", "booked", "failed", "cancelled"] as const) {
      expect(planCourierBooking(input({ bookingState })).reason).toBe("booking_already_attempted");
    }
  });
  test("respects courier budget, ETA, currency, TTL and serviceability", () => {
    const initial = input();
    expect(planCourierBooking(input({ maxCourierCostPence: 100 })).reason).toBe("no_eligible_quote");
    expect(planCourierBooking(input({ maxDeliveryMinutes: 10 })).reason).toBe("no_eligible_quote");
    expect(planCourierBooking(input({ quotes: initial.quotes.map(q => ({ ...q, currency: "EUR" })) })).ready).toBe(false);
    expect(planCourierBooking(input({ quotes: initial.quotes.map(q => ({ ...q, serviceable: false })) })).ready).toBe(false);
    expect(planCourierBooking(input({ quotes: initial.quotes.map(q => ({ ...q, expiresAt: initial.nowIso })) })).ready).toBe(false);
  });
  test("rejects malformed policy and missing expected routes", () => {
    expect(planCourierBooking(input({ maxCourierCostPence: -1 })).reason).toBe("invalid_policy");
    expect(planCourierBooking(input({ expectedStations: [] })).reason).toBe("invalid_routing");
  });
});
