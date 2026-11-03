/**
 * Public, privacy-minimised presentation of authenticated Dishbee tracking.
 *
 * This is a READ-ONLY projection. It cannot release KDS, arrange a courier,
 * confirm a capture, verify delivery proof or change any order state.
 * Never generate a success timeline from browser-originated fields.
 */
export type TrackingSnapshot = {
  orderStatus: string;
  fulfilment: string;
  passStatus?: string | undefined;
  deliveryStatus?: string | undefined;
  updatedAt?: string | undefined;
};
export type TrackingStepId = "payment" | "kitchen" | "packing" | "handoff";
export type TrackingStepState = "done" | "current" | "upcoming" | "review";
export type TrackingStep = Readonly<{
  id: TrackingStepId;
  title: string;
  detail: string;
  state: TrackingStepState;
}>;
export type TrackingPresentation = Readonly<{
  headline: string;
  description: string;
  tone: "progress" | "review" | "reported";
  stages: readonly TrackingStep[];
  canOpenCourierTracking: boolean;
  updatedAtIso: string | null;
}>;

const pendingStatuses = new Set(["payment_pending", "awaiting_payment"]);
const paidStatuses = new Set([
  "paid", "accepted", "preparing", "ready", "fulfilled", "completed", "delivered",
]);
const closedStatuses = new Set(["cancelled", "refunded", "failed"]);
const passStatuses = new Set(["ready_to_pack", "packing", "sealed", "ready_for_handoff"]);
const packedStatuses = new Set(["sealed", "ready_for_handoff"]);
const deliveryStatuses = new Set([
  "waiting_for_kitchen", "waiting_for_ready", "pending_quote", "quoted",
  "booking", "booked", "requested", "accepted", "driver_assigned",
  "arriving_pickup", "picked_up", "arriving_customer", "delivered",
  "cancelled", "failed",
]);
const deliveryInTransit = new Set(["picked_up", "arriving_customer", "delivered"]);
const deliveryProviderActive = new Set([
  "booked", "requested", "accepted", "driver_assigned", "arriving_pickup",
  "picked_up", "arriving_customer", "delivered",
]);
const deliveryEarly = new Set(["waiting_for_kitchen", "waiting_for_ready", "pending_quote", "quoted", "booking"]);
const handoffOrders = new Set(["fulfilled", "completed", "delivered"]);

function normaliseStatus(value: unknown): string | null {
  if (value == null || value === "") return null;
  return typeof value === "string" && /^[a-z_]{1,60}$/.test(value)
    ? value : null;
}
function safeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    return null;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function stage(
  id: TrackingStepId,
  title: string,
  detail: string,
  state: TrackingStepState,
): TrackingStep {
  return { id, title, detail, state };
}
function baseStages(mode: string): TrackingStep[] {
  return [
    stage("payment", "Payment", "Awaiting verified payment", "upcoming"),
    stage("kitchen", "Kitchen preparation", "Waiting for payment", "upcoming"),
    stage("packing", "One MealDeck pack", "Waiting for the complete order", "upcoming"),
    stage("handoff", mode === "delivery" ? "One delivery" :
      mode === "curbside" ? "Kerbside handoff" : "Collection",
      "Not yet ready for handoff", "upcoming"),
  ];
}
const view = (
  headline: string,
  description: string,
  tone: TrackingPresentation["tone"],
  stages: TrackingStep[],
  canOpenCourierTracking: boolean,
  updatedAtIso: string | null,
): TrackingPresentation =>
  ({ headline, description, tone, stages, canOpenCourierTracking, updatedAtIso });

function review(stages: TrackingStep[], updatedAtIso: string | null,
  headline = "We're checking your order's progress",
  description = "Our system cannot confirm the next step from the latest update. Please contact MealDeck support if you need help.",
): TrackingPresentation {
  const last = stages.findLastIndex(step => step.state === "current");
  const index = last >= 0 ? last : 0;
  stages[index] = { ...stages[index]!, state: "review",
    detail: "Needs a verified status update" };
  return view(headline, description, "review", stages, false, updatedAtIso);
}

/**
 * Server-supplied statuses only. Unknown/conflicting/closed statuses never
 * become a successful delivery claim. A provider's delivered event alone is
 * NOT proof that the customer accepted the handoff.
 */
export function presentMealDeckTracking(snapshot: TrackingSnapshot): TrackingPresentation {
  const order = normaliseStatus(snapshot.orderStatus);
  const pass = normaliseStatus(snapshot.passStatus);
  const delivery = normaliseStatus(snapshot.deliveryStatus);
  const mode = snapshot.fulfilment;
  const updatedAtIso = safeTimestamp(snapshot.updatedAt);
  const stages = baseStages(mode);

  if ((mode !== "delivery" && mode !== "pickup" && mode !== "curbside") ||
      !order || (!paidStatuses.has(order) && !pendingStatuses.has(order) && !closedStatuses.has(order)) ||
      (snapshot.passStatus && (!pass || !passStatuses.has(pass))) ||
      (snapshot.deliveryStatus && (!delivery || !deliveryStatuses.has(delivery))) ||
      (mode !== "delivery" && delivery !== null)) {
    return review(stages, updatedAtIso);
  }

  if (closedStatuses.has(order)) {
    return review(stages, updatedAtIso,
      "This order needs assistance",
      "A cancellation, refund or other exception is recorded. Contact support to confirm the outcome; no new payment or refund is initiated here.");
  }

  if (pendingStatuses.has(order)) {
    // Never trust a pass or courier field to override a pending-payment order.
    if (pass !== null ||
        (delivery !== null && !deliveryEarly.has(delivery))) {
      return review(stages, updatedAtIso);
    }
    stages[0] = stage("payment", "Payment", "Awaiting a server-confirmed payment", "current");
    return view("Awaiting payment",
      "Your order has not been released to the kitchens. Preparation will only begin after payment is verified.",
      "progress", stages, false, updatedAtIso);
  }

  stages[0] = stage("payment", "Payment", "Payment marked confirmed by Dishbee", "done");
  const kitchenReady = pass !== null || ["ready", "fulfilled", "completed", "delivered"].includes(order);
  stages[1] = stage("kitchen", "Kitchen preparation",
    kitchenReady ? "Dishbee reports preparation complete" : "Your brands are preparing their dishes",
    kitchenReady ? "done" : "current");
  if (pass === "ready_to_pack" || pass === "packing") {
    stages[2] = stage("packing", "One MealDeck pack",
      "All brands are being packed together", "current");
  } else if (pass && packedStatuses.has(pass)) {
    stages[2] = stage("packing", "One MealDeck pack",
      "Dishbee reports the complete multi-brand pack is ready", "done");
  } else if (kitchenReady) {
    stages[2] = stage("packing", "One MealDeck pack",
      "Packing status is not confirmed yet", "current");
  }

  if (mode !== "delivery") {
    if (handoffOrders.has(order) && pass && packedStatuses.has(pass)) {
      stages[3] = stage("handoff", mode === "curbside" ? "Kerbside handoff" : "Collection",
        "The kitchen reports that the order was handed over", "done");
      return view("Order recorded as handed over",
        "Dishbee reports the collection or kerbside handoff complete.",
        "reported", stages, false, updatedAtIso);
    }
    if (handoffOrders.has(order) && (!pass || !packedStatuses.has(pass))) {
      return review(stages, updatedAtIso);
    }
    if (pass === "ready_for_handoff") {
      stages[3] = stage("handoff", mode === "curbside" ? "Kerbside handoff" : "Collection",
        "Ready for the authorised handoff; keep your collection code", "current");
      return view(mode === "curbside" ? "Ready for kerbside" : "Ready for collection",
        "Your order is packed. Staff will verify the required handoff details.",
        "progress", stages, false, updatedAtIso);
    }
    return view(pass === "sealed" ? "Your MealDeck order is packed" :
      pass === "packing" ? "Packing your complete order" : "Your meal is being prepared",
      "All dishes stay together under one MealDeck order. We will show handoff readiness when the kitchen confirms it.",
      "progress", stages, false, updatedAtIso);
  }

  if (delivery === "failed" || delivery === "cancelled") {
    return review(stages, updatedAtIso, "Delivery needs assistance",
      "A courier issue is recorded. The kitchen or support team needs to confirm the next delivery step.");
  }
  if (delivery && deliveryInTransit.has(delivery) && (!pass || !packedStatuses.has(pass))) {
    return review(stages, updatedAtIso);
  }
  if (delivery && deliveryProviderActive.has(delivery) && (!pass || !packedStatuses.has(pass))) {
    return review(stages, updatedAtIso);
  }
  if (handoffOrders.has(order) && delivery !== "delivered") {
    // A completed order with no delivered courier evidence is not a
    // verified one-delivery outcome.
    return review(stages, updatedAtIso);
  }
  if (delivery === "delivered") {
    stages[3] = stage("handoff", "One delivery", "Courier reports delivered", "done");
    return view("Courier reports delivery",
      "The courier's system marked this order delivered. This update is not independent proof of customer receipt; contact support if it has not arrived.",
      "reported", stages, true, updatedAtIso);
  }
  if (delivery === "picked_up" || delivery === "arriving_customer") {
    stages[3] = stage("handoff", "One delivery", "Courier has collected the complete order", "current");
    return view("Your MealDeck order is on its way",
      "One delivery is in progress for the full basket. Check the courier link if available.",
      "progress", stages, true, updatedAtIso);
  }
  if (delivery && deliveryProviderActive.has(delivery)) {
    stages[3] = stage("handoff", "One delivery", "Delivery provider has an active booking", "current");
    return view("Courier arranged",
      "Your packed order is awaiting its delivery handoff. Exact collection time is not guaranteed.",
      "progress", stages, true, updatedAtIso);
  }
  if (pass === "ready_for_handoff") {
    stages[3] = stage("handoff", "One delivery", "Ready for the courier to collect", "current");
    return view("Packed and ready for dispatch",
      "All participating brands are packed together. A courier handoff has not yet been confirmed.",
      "progress", stages, false, updatedAtIso);
  }
  return view(pass === "sealed" ? "Your complete MealDeck basket is packed" :
    pass === "packing" ? "Packing your order" : kitchenReady ? "Kitchen preparation is complete" :
    "Your brands are preparing their dishes",
    "MealDeck will show one delivery only after the complete order is ready and a courier status is verified.",
    "progress", stages, false, updatedAtIso);
}
