import { evaluateMasterPass, type KitchenTicketState } from "./mealdeck-fulfilment-planner";
import type { KitchenStation } from "./mealdeck-kds-outbox";
import type { DeliveryQuote } from "./mealdeck-delivery-selection";

/** Events must be authenticated and bound to canonical orders server-side. */
export type CourierStage = "booking" | "booked" | "assigned" | "collected" |
  "delivered" | "failed" | "cancelled";
export type CourierEventKind = "booking_confirmed" | "courier_assigned" |
  "collected" | "delivered" | "booking_failed" | "cancelled";
export type CourierLedger = {
  orderId: string;
  provider: DeliveryQuote["provider"];
  bookingReference: string | null;
  status: CourierStage;
  updatedAt: string;
  processedEventIds: readonly string[];
};
export type CourierEvent = {
  eventId: string;
  orderId: string;
  provider: DeliveryQuote["provider"];
  bookingReference: string | null;
  kind: CourierEventKind;
  occurredAt: string;
  verified: boolean;
};
export type CourierEventDecision = {
  accepted: boolean;
  reason: "applied" | "unverified" | "invalid" | "duplicate" |
    "mismatch" | "out_of_order" | "invalid_transition";
  next: CourierLedger;
};
const transitions: Record<CourierStage, Partial<Record<CourierEventKind, CourierStage>>> = {
  booking: { booking_confirmed: "booked", booking_failed: "failed", cancelled: "cancelled" },
  booked: { courier_assigned: "assigned", collected: "collected", cancelled: "cancelled" },
  assigned: { collected: "collected", cancelled: "cancelled" },
  collected: { delivered: "delivered" },
  delivered: {}, failed: {}, cancelled: {},
};
export function applyCourierEvent(current: CourierLedger, event: CourierEvent): CourierEventDecision {
  const no = (reason: CourierEventDecision["reason"]): CourierEventDecision => ({
    accepted: false, reason, next: current,
  });
  if (!event.verified) return no("unverified");
  const occurred = Date.parse(event.occurredAt);
  const previous = Date.parse(current.updatedAt);
  if (!event.eventId || event.eventId.length > 160 || !event.orderId ||
      !Number.isFinite(occurred) || !Number.isFinite(previous)) return no("invalid");
  if (current.processedEventIds.includes(event.eventId)) return no("duplicate");
  if (event.orderId !== current.orderId || event.provider !== current.provider) return no("mismatch");
  if (occurred < previous) return no("out_of_order");
  if (!Object.hasOwn(transitions, current.status)) return no("invalid");
  const allowed = transitions[current.status];
  const nextStatus = Object.hasOwn(allowed, event.kind) ? allowed[event.kind] : undefined;
  if (!nextStatus) return no("invalid_transition");
  if (event.kind === "booking_confirmed") {
    if (current.bookingReference !== null || !event.bookingReference ||
        event.bookingReference.length > 160) return no("mismatch");
  } else if (event.bookingReference !== current.bookingReference) {
    return no("mismatch");
  }
  return {
    accepted: true, reason: "applied",
    next: {
      ...current, status: nextStatus,
      bookingReference: event.kind === "booking_confirmed"
        ? event.bookingReference : current.bookingReference,
      updatedAt: event.occurredAt,
      processedEventIds: [...current.processedEventIds, event.eventId],
    },
  };
}
export type CustomerTracking = {
  phase: "awaiting_payment" | "preparing" | "needs_assistance" |
    "ready_for_dispatch" | "courier_arranged" | "on_the_way" |
    "delivery_proof_pending" | "ready_for_collection" | "ready_for_kerbside" | "completed";
  kitchensReady: number;
  kitchensTotal: number;
  completed: boolean;
};
export type TrackingInput = {
  orderId: string;
  fulfilment: "delivery" | "pickup" | "kerbside";
  paymentConfirmed: boolean; // authoritative server-owned settlement ONLY
  expectedStations: readonly KitchenStation[];
  actualTickets: readonly KitchenTicketState[];
  courier: CourierLedger | null;
  handoffVerified: boolean; // server-checked proof ONLY
};

/** Privacy-minimised customer status projection, never a state mutation. */
export function projectCustomerTracking(input: TrackingInput): CustomerTracking {
  const pass = evaluateMasterPass(input.orderId, input.expectedStations, input.actualTickets);
  const result = (phase: CustomerTracking["phase"], completed = false): CustomerTracking => ({
    phase, kitchensReady: pass.completed, kitchensTotal: pass.total, completed,
  });
  if (!input.paymentConfirmed) return result("awaiting_payment");
  if (pass.reason === "invalid_routing" || pass.reason === "kitchen_cancelled") {
    return result("needs_assistance");
  }
  if (!pass.ready) return result("preparing");
  if (input.fulfilment === "pickup" || input.fulfilment === "kerbside") {
    if (input.handoffVerified) return result("completed", true);
    return result(input.fulfilment === "pickup" ? "ready_for_collection" : "ready_for_kerbside");
  }
  if (!input.courier) return result("ready_for_dispatch");
  if (input.courier.orderId !== input.orderId ||
      input.courier.status === "failed" || input.courier.status === "cancelled") {
    return result("needs_assistance");
  }
  if (input.courier.status === "delivered") {
    return input.handoffVerified ? result("completed", true) : result("delivery_proof_pending");
  }
  if (input.courier.status === "collected") return result("on_the_way");
  if (input.courier.status === "booked" || input.courier.status === "assigned") {
    return result("courier_arranged");
  }
  return result("ready_for_dispatch");
}
