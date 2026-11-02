import { chooseDelivery, type DeliveryQuote } from "./mealdeck-delivery-selection";
import { evaluateGroupKdsRelease, type GroupPayment } from "./mealdeck-group-payment-gate";
import type { KitchenStation } from "./mealdeck-kds-outbox";

/** Server-owned kitchen receipts, never browser-supplied completion flags. */
export type KitchenTicketState = {
  key: string;
  status: "queued" | "accepted" | "preparing" | "ready" | "handed_over" | "cancelled";
};
export type PassDecision = {
  ready: boolean;
  reason: "ready" | "invalid_routing" | "kitchens_incomplete" | "kitchen_cancelled";
  completed: number;
  total: number;
};
const validId = (s: string) => /^[A-Za-z0-9_-]{1,80}$/.test(s);

export function evaluateMasterPass(
  orderId: string,
  expectedStations: readonly KitchenStation[],
  actualTickets: readonly KitchenTicketState[],
): PassDecision {
  const total = expectedStations.length;
  const no = (reason: PassDecision["reason"], completed = 0): PassDecision => ({
    ready: false, reason, completed, total,
  });
  if (!validId(orderId) || total === 0) return no("invalid_routing");
  const expected = new Set<string>();
  for (const station of expectedStations) {
    if (!validId(station.brandId) || !validId(station.stationId)) return no("invalid_routing");
    const key = ["kds", orderId, station.brandId, station.stationId].join(":");
    if (expected.has(key)) return no("invalid_routing");
    expected.add(key);
  }
  const actual = new Map<string, KitchenTicketState["status"]>();
  for (const ticket of actualTickets) {
    if (!expected.has(ticket.key) || actual.has(ticket.key)) return no("invalid_routing");
    actual.set(ticket.key, ticket.status);
  }
  let completed = 0;
  for (const key of expected) {
    const status = actual.get(key);
    if (status === "cancelled") return no("kitchen_cancelled", completed);
    if (status === "ready" || status === "handed_over") completed++;
  }
  return completed === total
    ? { ready: true, reason: "ready", completed, total }
    : no("kitchens_incomplete", completed);
}
export type ExistingBooking = "none" | "requesting" | "booked" | "failed" | "cancelled" | "delivered";
export type CourierBookingRequest = {
  orderId: string;
  idempotencyKey: string;
  provider: DeliveryQuote["provider"];
  quoteId: string;
  costPence: number;
  currency: string;
  expiresAt: string;
};
export type CourierPlan = {
  ready: boolean;
  reason: "ready" | "payment_unconfirmed" | "invalid_routing" |
    "kitchens_incomplete" | "kitchen_cancelled" | "booking_already_attempted" |
    "invalid_policy" | "no_eligible_quote";
  request: CourierBookingRequest | null;
};
export type CourierPlanInput = {
  order: GroupPayment;
  expectedStations: readonly KitchenStation[];
  actualTickets: readonly KitchenTicketState[];
  quotes: readonly DeliveryQuote[];
  nowIso: string;
  maxDeliveryMinutes: number;
  maxCourierCostPence: number;
  bookingState: ExistingBooking;
};
/** Plans, but DOES NOT submit, a courier booking. Inputs must be canonical. */
export function planCourierBooking(input: CourierPlanInput): CourierPlan {
  const no = (reason: CourierPlan["reason"]): CourierPlan => ({
    ready: false, reason, request: null,
  });
  if (input.bookingState !== "none") return no("booking_already_attempted");
  if (!evaluateGroupKdsRelease(input.order).release) return no("payment_unconfirmed");
  const pass = evaluateMasterPass(input.order.orderId, input.expectedStations, input.actualTickets);
  if (!pass.ready) return no(pass.reason);
  if (!Number.isSafeInteger(input.maxCourierCostPence) || input.maxCourierCostPence < 0 ||
      !Number.isSafeInteger(input.maxDeliveryMinutes) || input.maxDeliveryMinutes <= 0) {
    return no("invalid_policy");
  }
  const withinBudget = input.quotes.filter(q => q.amountPence <= input.maxCourierCostPence);
  const quote = chooseDelivery(withinBudget, input.order.currency, input.nowIso, input.maxDeliveryMinutes).selected;
  if (!quote || !quote.quoteId.trim() || quote.quoteId.length > 160) return no("no_eligible_quote");
  return {
    ready: true, reason: "ready",
    request: {
      orderId: input.order.orderId,
      idempotencyKey: ["mealdeck", "delivery", input.order.orderId].join(":"),
      provider: quote.provider, quoteId: quote.quoteId,
      costPence: quote.amountPence, currency: quote.currency,
      expiresAt: quote.expiresAt,
    },
  };
}
