/**
 * Read-only customer presentation of the authenticated MealDeck tracking reply.
 * No browser field, elapsed clock or progress percentage can confirm payment,
 * advance the kitchen, book a courier or prove customer receipt.
 */
export type TrackingSnapshot = {
  orderStatus: string;
  fulfilment: string;
  passStatus?: string | undefined;
  deliveryStatus?: string | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  observedAt?: string | undefined;
};
export type TrackingStepId =
  "placed" | "accepted" | "preparing" | "packing" | "ready" | "handoff" | "delivered";
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
  fulfilmentLabel: string;
  paymentRecorded: boolean;
  isFinalStatus: boolean;
  canOpenCourierTracking: boolean;
  progress: Readonly<{ reached: number; total: number; percent: number; label: string }>;
  createdAtIso: string | null;
  updatedAtIso: string | null;
  observedAtIso: string | null;
  clockReferenceMs: number | null;
  elapsedAtObservationSeconds: number | null;
}>;

const pendingStatuses = new Set(["payment_pending", "awaiting_payment"]);
const paidStatuses = new Set([
  "paid",
  "accepted",
  "preparing",
  "ready",
  "fulfilled",
  "completed",
  "delivered",
]);
const closedStatuses = new Set(["cancelled", "refunded", "failed"]);
const passStatuses = new Set([
  "waiting_for_kitchen",
  "ready_to_pack",
  "packing",
  "sealed",
  "ready_for_handoff",
  "handed_off",
  "cancelled",
]);
const preparedPassStatuses = new Set([
  "ready_to_pack",
  "packing",
  "sealed",
  "ready_for_handoff",
  "handed_off",
]);
const packedStatuses = new Set(["sealed", "ready_for_handoff", "handed_off"]);
const deliveryStatuses = new Set([
  "waiting_for_kitchen",
  "waiting_for_ready",
  "pending_quote",
  "quoted",
  "booking",
  "booked",
  "requested",
  "accepted",
  "driver_assigned",
  "arriving_pickup",
  "picked_up",
  "arriving_customer",
  "delivered",
  "cancelled",
  "failed",
]);
const deliveryProviderActive = new Set([
  "booked",
  "requested",
  "accepted",
  "driver_assigned",
  "arriving_pickup",
  "picked_up",
  "arriving_customer",
  "delivered",
]);
const deliveryEarly = new Set([
  "waiting_for_kitchen",
  "waiting_for_ready",
  "pending_quote",
  "quoted",
  "booking",
]);
const handoffOrders = new Set(["fulfilled", "completed", "delivered"]);

function normaliseStatus(value: unknown): string | null {
  if (value == null || value === "") return null;
  return typeof value === "string" && /^[a-z_]{1,60}$/.test(value) ? value : null;
}

/** Explicit timezone and a real calendar date; Date.parse alone normalises invalid days. */
function safeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-](\d{2}):(\d{2}))$/i.exec(
      value,
    );
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1]! ||
    Number(parts[4]) > 23 ||
    Number(parts[5]) > 59 ||
    Number(parts[6]) > 59 ||
    Number(parts[8] ?? 0) > 23 ||
    Number(parts[9] ?? 0) > 59
  )
    return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function readClock(snapshot: TrackingSnapshot, nowMs: number) {
  const observedAtIso = safeTimestamp(snapshot.observedAt);
  // The server observation anchors elapsed time even if the device wall clock
  // is wrong. A malformed supplied observation time fails closed.
  const clockReferenceMs =
    snapshot.observedAt !== undefined
      ? observedAtIso
        ? Date.parse(observedAtIso)
        : null
      : Number.isFinite(nowMs)
        ? nowMs
        : null;
  const created = safeTimestamp(snapshot.createdAt);
  const updated = safeTimestamp(snapshot.updatedAt);
  const createdAtIso =
    created && clockReferenceMs !== null && Date.parse(created) <= clockReferenceMs
      ? created
      : null;
  const updatedAtIso =
    updated &&
    clockReferenceMs !== null &&
    Date.parse(updated) <= clockReferenceMs &&
    (!createdAtIso || Date.parse(updated) >= Date.parse(createdAtIso))
      ? updated
      : null;
  return {
    createdAtIso,
    updatedAtIso,
    observedAtIso,
    clockReferenceMs,
    elapsedAtObservationSeconds:
      createdAtIso && clockReferenceMs !== null
        ? Math.floor((clockReferenceMs - Date.parse(createdAtIso)) / 1000)
        : null,
  };
}

/** Monotonic time since this snapshot arrived, never a guessed ETA or completion time. */
export function trackingElapsedSeconds(
  value: Pick<TrackingPresentation, "elapsedAtObservationSeconds" | "isFinalStatus">,
  millisecondsSinceObservation: number,
): number | null {
  const initial = value.elapsedAtObservationSeconds;
  if (
    initial === null ||
    !Number.isSafeInteger(initial) ||
    initial < 0 ||
    !Number.isFinite(millisecondsSinceObservation) ||
    millisecondsSinceObservation < 0
  )
    return null;
  const elapsed =
    initial + (value.isFinalStatus ? 0 : Math.floor(millisecondsSinceObservation / 1000));
  return Number.isSafeInteger(elapsed) ? elapsed : null;
}

export function formatTrackingElapsed(seconds: number | null): string | null {
  if (seconds === null || !Number.isSafeInteger(seconds) || seconds < 0) return null;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return (
    (days ? days + "d " : "") +
    (hours || days ? hours + "h " : "") +
    minutes +
    "m " +
    remainder +
    "s"
  );
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
  const ready =
    mode === "delivery"
      ? "Ready for courier"
      : mode === "curbside"
        ? "Ready for kerbside"
        : "Ready for collection";
  const stages: TrackingStep[] = [
    stage("placed", "Placed", "Waiting for payment confirmation", "upcoming"),
    stage("accepted", "Accepted", "Waiting for kitchen acceptance", "upcoming"),
    stage("preparing", "Preparing", "Preparation has not been confirmed", "upcoming"),
    stage("packing", "Packed", "All brands will be packed together", "upcoming"),
    stage("ready", ready, "Handoff readiness is not confirmed", "upcoming"),
    stage(
      "handoff",
      mode === "delivery" ? "Out for delivery" : mode === "curbside" ? "Handed over" : "Collected",
      mode === "delivery"
        ? "Courier collection is not confirmed"
        : "Customer handoff is not confirmed",
      "upcoming",
    ),
  ];
  if (mode === "delivery") {
    stages.push(stage("delivered", "Delivered", "Delivery is not reported yet", "upcoming"));
  }
  return stages;
}

/**
 * A paid order is placed, not automatically accepted/preparing. A sealed pack
 * is not a handoff. A courier's delivered event remains a report.
 */
export function presentMealDeckTracking(
  snapshot: TrackingSnapshot,
  nowMs = Date.now(),
): TrackingPresentation {
  const order = normaliseStatus(snapshot.orderStatus);
  const pass = normaliseStatus(snapshot.passStatus);
  const delivery = normaliseStatus(snapshot.deliveryStatus);
  const mode = snapshot.fulfilment;
  const clock = readClock(snapshot, nowMs);
  const stages = baseStages(mode);
  let paymentRecorded = false;

  function view(
    headline: string,
    description: string,
    tone: TrackingPresentation["tone"] = "progress",
    canOpenCourierTracking = false,
  ): TrackingPresentation {
    let reached = 0;
    for (const [index, step] of stages.entries()) {
      if (step.state === "done" || step.state === "current") reached = index + 1;
    }
    return {
      headline,
      description,
      tone,
      stages,
      fulfilmentLabel:
        mode === "delivery"
          ? "Delivery"
          : mode === "pickup"
            ? "Collection"
            : mode === "curbside"
              ? "Kerbside"
              : "Order updates",
      paymentRecorded,
      isFinalStatus: tone === "reported" || closedStatuses.has(order ?? ""),
      canOpenCourierTracking,
      progress: {
        reached,
        total: stages.length,
        percent: (reached / stages.length) * 100,
        label:
          tone === "review"
            ? "Order progress needs review"
            : paymentRecorded
              ? headline + ". Stage " + reached + " of " + stages.length
              : "Payment is not confirmed; kitchen progress has not started",
      },
      ...clock,
    };
  }

  function review(
    headline = "We're checking your order's progress",
    description = "The latest update cannot confirm the next step. Contact MealDeck support if you need help.",
  ): TrackingPresentation {
    const current = stages.findIndex((step) => step.state === "current");
    const upcoming = stages.findIndex((step) => step.state === "upcoming");
    const index = current >= 0 ? current : upcoming >= 0 ? upcoming : stages.length - 1;
    stages[index] = {
      ...stages[index]!,
      state: "review",
      detail: "Needs a confirmed status update",
    };
    return view(headline, description, "review");
  }

  if (
    (mode !== "delivery" && mode !== "pickup" && mode !== "curbside") ||
    !order ||
    (!paidStatuses.has(order) && !pendingStatuses.has(order) && !closedStatuses.has(order)) ||
    (snapshot.passStatus && (!pass || !passStatuses.has(pass))) ||
    (snapshot.deliveryStatus && (!delivery || !deliveryStatuses.has(delivery))) ||
    (mode !== "delivery" && delivery !== null)
  )
    return review();

  if (closedStatuses.has(order)) {
    return review(
      "This order needs assistance",
      "A cancellation, refund or other exception is recorded. Contact support to confirm the outcome.",
    );
  }
  if (pendingStatuses.has(order)) {
    if (pass !== null || (delivery !== null && !deliveryEarly.has(delivery))) return review();
    return view(
      "Awaiting payment",
      "Your order has not been released to the kitchen. Preparation will only begin after payment is verified.",
    );
  }

  paymentRecorded = true;
  stages[0] = stage("placed", "Placed", "Payment confirmed", "done");
  const kitchenReady =
    (pass !== null && preparedPassStatuses.has(pass)) ||
    ["ready", "fulfilled", "completed", "delivered"].includes(order);
  const preparationStarted = order === "preparing" || kitchenReady;
  if (order === "accepted" || preparationStarted) {
    stages[1] = stage("accepted", "Accepted", "Your order is with the kitchen", "done");
  }
  if (preparationStarted) {
    stages[2] = stage(
      "preparing",
      "Preparing",
      kitchenReady ? "Kitchen preparation is complete" : "Your brands are preparing their dishes",
      kitchenReady ? "done" : "current",
    );
  }
  if (pass === "packing") {
    stages[3] = stage("packing", "Packing", "All brands are being packed together", "current");
  } else if (pass && packedStatuses.has(pass)) {
    stages[3] = stage("packing", "Packed", "Your complete order is packed", "done");
  } else if (kitchenReady) {
    stages[3] = stage(
      "packing",
      "Packed",
      pass === "ready_to_pack"
        ? "Preparation is complete; packing has not started"
        : "Waiting for a confirmed packing update",
      "upcoming",
    );
  }

  if (pass === "cancelled") {
    return review(
      "Your order needs assistance",
      "A cancellation is recorded for the kitchen handoff. Contact MealDeck to confirm the next step.",
    );
  }

  if (mode !== "delivery") {
    if (handoffOrders.has(order)) {
      if (!pass || !packedStatuses.has(pass)) return review();
      stages[4] = { ...stages[4]!, state: "done", detail: "Kitchen handoff recorded" };
      stages[5] = {
        ...stages[5]!,
        state: "done",
        detail: "The kitchen reports that your order was handed over",
      };
      return view(
        "Order recorded as handed over",
        "The kitchen reports your collection or kerbside handoff complete.",
        "reported",
      );
    }
    if (pass === "handed_off") {
      return review(
        "Confirming your handoff",
        "The kitchen reports a handoff, but the order's completion has not been confirmed.",
      );
    }
    if (pass === "ready_for_handoff") {
      stages[4] = {
        ...stages[4]!,
        state: "current",
        detail: "Your order is ready; keep your collection code for staff",
      };
      return view(
        mode === "curbside" ? "Ready for kerbside" : "Ready for collection",
        "Your full order is packed. Staff will verify the required handoff details.",
      );
    }
  } else {
    if (delivery === "failed" || delivery === "cancelled") {
      return review(
        "Delivery needs assistance",
        "A courier issue is recorded. The kitchen or support team needs to confirm the next delivery step.",
      );
    }
    if (delivery && deliveryProviderActive.has(delivery) && (!pass || !packedStatuses.has(pass)))
      return review();
    if (handoffOrders.has(order) && delivery !== "delivered") return review();
    if (delivery === "delivered") {
      stages[4] = { ...stages[4]!, state: "done", detail: "Courier collection recorded" };
      stages[5] = { ...stages[5]!, state: "done", detail: "Courier transport recorded" };
      stages[6] = { ...stages[6]!, state: "done", detail: "Courier reports delivered" };
      return view(
        "Courier reports delivery",
        "Your courier has marked this order as delivered. If it hasn’t arrived, contact MealDeck support.",
        "reported",
        true,
      );
    }
    if (delivery === "picked_up" || delivery === "arriving_customer") {
      stages[4] = {
        ...stages[4]!,
        state: "done",
        detail: "The courier collected your packed order",
      };
      stages[5] = {
        ...stages[5]!,
        state: "current",
        detail:
          delivery === "arriving_customer"
            ? "The courier reports approaching your address"
            : "Your complete order is with the courier",
      };
      return view(
        "Your MealDeck order is on its way",
        "One delivery is in progress for your full basket. Open the courier link for available updates.",
        "progress",
        true,
      );
    }
    if (pass === "handed_off") {
      stages[4] = { ...stages[4]!, state: "done", detail: "Kitchen handoff recorded" };
      return view(
        "Kitchen handoff recorded",
        "The kitchen reports handing over your packed order. We are waiting for the next courier update.",
        "progress",
        delivery !== null && deliveryProviderActive.has(delivery),
      );
    }
    if (pass === "ready_for_handoff") {
      stages[4] = { ...stages[4]!, state: "current", detail: "Ready for the courier to collect" };
    }
    if (delivery && deliveryProviderActive.has(delivery)) {
      return view(
        "Courier arranged",
        "A courier booking is recorded. Collection from the kitchen has not been confirmed.",
        "progress",
        true,
      );
    }
    if (pass === "ready_for_handoff") {
      return view(
        "Packed and ready for dispatch",
        "All brands are packed together. Courier collection has not been confirmed.",
      );
    }
  }

  if (pass === "sealed") {
    return view(
      "Your MealDeck order is packed",
      "Everything is packed together. We are waiting for the kitchen to confirm handoff readiness.",
    );
  }
  if (pass === "packing") {
    return view(
      "Packing your complete order",
      "Your brands are being checked and packed together.",
    );
  }
  if (kitchenReady) {
    return view(
      "Kitchen preparation is complete",
      "Your dishes are ready to enter the packing stage.",
    );
  }
  if (order === "preparing") {
    return view(
      "Preparing your MealDeck order",
      "Your brands are preparing their dishes in the shared kitchen.",
    );
  }
  if (order === "accepted") {
    return view(
      "Order accepted",
      "The kitchen has accepted your order. Preparation has not been recorded yet.",
    );
  }
  return view(
    "Order placed",
    "Your payment is confirmed. We are waiting for the kitchen to accept your order.",
  );
}
