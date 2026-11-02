import { describe, expect, test } from "bun:test";
import { applyCourierEvent, projectCustomerTracking, type CourierLedger, type CourierEvent, type TrackingInput } from "../src/lib/mealdeck-fulfilment-status";
const base = (): CourierLedger => ({
  orderId: "ord_1", provider: "uber_direct", bookingReference: null,
  status: "booking", updatedAt: "2026-11-02T22:00:00Z", processedEventIds: [],
});
const event = (change: Partial<CourierEvent> = {}): CourierEvent => ({
  eventId: "e1", orderId: "ord_1", provider: "uber_direct", bookingReference: "booking_1",
  kind: "booking_confirmed", occurredAt: "2026-11-02T22:01:00Z", verified: true, ...change,
});
const tracking = (change: Partial<TrackingInput> = {}): TrackingInput => ({
  orderId: "ord_1", fulfilment: "delivery", paymentConfirmed: true,
  expectedStations: [{ brandId: "skorch", stationId: "grill" }, { brandId: "load_d", stationId: "fryer" }],
  actualTickets: [
    { key: "kds:ord_1:skorch:grill", status: "ready" },
    { key: "kds:ord_1:load_d:fryer", status: "ready" },
  ],
  courier: null, handoffVerified: false, ...change,
});
describe("Phase 18 courier events and private customer tracking", () => {
  test("unrecognised event name is never a state transition", () => {
    expect(applyCourierEvent(base(), event({ kind: "__proto__" as CourierEvent["kind"] })).reason).toBe("invalid_transition");
  });
  test("requires authenticated event", () => {
    expect(applyCourierEvent(base(), event({ verified: false })).reason).toBe("unverified");
  });
  test("booking, assignment, collection and delivery progress monotonically", () => {
    let ledger = applyCourierEvent(base(), event()).next;
    expect(ledger.status).toBe("booked");
    ledger = applyCourierEvent(ledger, event({ eventId: "e2", kind: "courier_assigned",
      occurredAt: "2026-11-02T22:02:00Z" })).next;
    expect(ledger.status).toBe("assigned");
    ledger = applyCourierEvent(ledger, event({ eventId: "e3", kind: "collected",
      occurredAt: "2026-11-02T22:03:00Z" })).next;
    ledger = applyCourierEvent(ledger, event({ eventId: "e4", kind: "delivered",
      occurredAt: "2026-11-02T22:04:00Z" })).next;
    expect(ledger.status).toBe("delivered");
    expect(applyCourierEvent(ledger, event({ eventId: "e5", kind: "cancelled",
      occurredAt: "2026-11-02T22:05:00Z" })).reason).toBe("invalid_transition");
  });
  test("repeated webhook event is ignored", () => {
    const first = applyCourierEvent(base(), event());
    expect(applyCourierEvent(first.next, event()).reason).toBe("duplicate");
  });
  test("prevents cross-order, cross-provider and mismatched booking reference", () => {
    expect(applyCourierEvent(base(), event({ orderId: "other" })).reason).toBe("mismatch");
    expect(applyCourierEvent(base(), event({ provider: "stuart" })).reason).toBe("mismatch");
    const booked = applyCourierEvent(base(), event()).next;
    expect(applyCourierEvent(booked, event({ eventId: "e2", kind: "collected",
      bookingReference: "different" })).reason).toBe("mismatch");
  });
  test("rejects stale and impossible event sequence", () => {
    const booked = applyCourierEvent(base(), event()).next;
    expect(applyCourierEvent(booked, event({ eventId: "e2", kind: "collected",
      occurredAt: "2026-11-02T21:00:00Z" })).reason).toBe("out_of_order");
    expect(applyCourierEvent(base(), event({ kind: "delivered" })).reason).toBe("invalid_transition");
  });
  test("booking failure is not successful delivery", () => {
    expect(applyCourierEvent(base(), event({ kind: "booking_failed", bookingReference: null })).next.status).toBe("failed");
  });
  test("unpaid orders never appear ready or completed", () => {
    expect(projectCustomerTracking(tracking({ paymentConfirmed: false, handoffVerified: true })).phase).toBe("awaiting_payment");
  });
  test("one incomplete kitchen prevents master completion", () => {
    const snapshot = tracking();
    expect(projectCustomerTracking(tracking({ actualTickets: snapshot.actualTickets.slice(0, 1) })).phase).toBe("preparing");
  });
  test("delivery completion needs courier event and verified handoff", () => {
    const courier: CourierLedger = { ...base(), status: "delivered", bookingReference: "booking_1" };
    expect(projectCustomerTracking(tracking({ courier })).phase).toBe("delivery_proof_pending");
    expect(projectCustomerTracking(tracking({ courier, handoffVerified: true })).completed).toBe(true);
  });
  test("pickup and kerbside require proof", () => {
    expect(projectCustomerTracking(tracking({ fulfilment: "pickup" })).phase).toBe("ready_for_collection");
    expect(projectCustomerTracking(tracking({ fulfilment: "kerbside" })).phase).toBe("ready_for_kerbside");
    expect(projectCustomerTracking(tracking({ fulfilment: "kerbside", handoffVerified: true })).completed).toBe(true);
  });
  test("customer projection excludes driver, booking reference, vehicle plate and codes", () => {
    const visible = JSON.stringify(projectCustomerTracking(tracking()));
    expect(visible).not.toContain("booking_1");
    expect(visible).not.toContain("vehiclePlate");
    expect(visible).not.toContain("code");
  });
});
