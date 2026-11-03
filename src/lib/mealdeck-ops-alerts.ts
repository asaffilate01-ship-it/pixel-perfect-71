import type { OpsOrder } from "./mealdeck-ops-types";

/** Phase 21: evidence-limited operations review suggestions, NOT verified incidents.
 * Only canonical order metadata is used; no estimated KDS, courier or Adyen state.
 */
export type OpsOrderAlert = {
  orderId: string;
  priority: "high" | "review" | "info";
  reason: "paid_cancelled" | "status_conflict" | "preparation_review" | "payment_pending";
  ageMinutes: number;
  title: string;
  detail: string;
};
export type OpsAlertOptions = {
  pendingAfterMinutes?: number;
  preparationAfterMinutes?: number;
  limit?: number;
};
const priorities: Record<OpsOrderAlert["priority"], number> = { high: 0, review: 1, info: 2 };
const positiveMinute = (value: number) => Number.isSafeInteger(value) && value >= 1 && value <= 1440;
const terminal = new Set(["fulfilled", "delivered", "completed", "cancelled", "refunded"]);
const inPreparation = new Set(["paid", "accepted", "preparing", "ready"]);

export function reviewOrderExceptions(
  orders: readonly OpsOrder[], nowIso: string, options: OpsAlertOptions = {},
): OpsOrderAlert[] {
  const now = Date.parse(nowIso);
  const pending = options.pendingAfterMinutes ?? 30;
  const preparation = options.preparationAfterMinutes ?? 45;
  const limit = options.limit ?? 20;
  if (!Number.isFinite(now) || !positiveMinute(pending) ||
    !positiveMinute(preparation) ||
    !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return [];
  const alerts: OpsOrderAlert[] = [];
  const seen = new Set<string>();
  for (const order of orders.slice(0, 2000)) {
    if (!order.order_id || seen.has(order.order_id)) continue;
    seen.add(order.order_id);
    const created = Date.parse(order.created_at);
    const paid = order.paid_at ? Date.parse(order.paid_at) : null;
    const sinceCreated = Math.floor((now - created) / 60000);
    const sincePaid = paid === null ? null : Math.floor((now - paid) / 60000);
    if (!Number.isFinite(sinceCreated) || sinceCreated < 0 ||
      (sincePaid !== null && (!Number.isFinite(sincePaid) || sincePaid < 0))) continue;
    const status = order.status.toLowerCase();
    if (paid !== null && status === "cancelled") {
      alerts.push({
        orderId: order.order_id, priority: "high", reason: "paid_cancelled",
        ageMinutes: sincePaid!, title: "Review paid cancellation",
        detail: "Recorded payment and cancellation both exist. Check the provider settlement and refund ledger; nothing has been refunded automatically.",
      });
    } else if (paid !== null && (status === "payment_pending" || status === "awaiting_payment")) {
      alerts.push({
        orderId: order.order_id, priority: "high", reason: "status_conflict",
        ageMinutes: sincePaid!, title: "Review payment-state mismatch",
        detail: "An order has a paid timestamp but remains in a pending state. Verify canonical payment and order records before taking action.",
      });
    } else if (paid !== null && inPreparation.has(status) &&
      sincePaid !== null && sincePaid >= preparation) {
      alerts.push({
        orderId: order.order_id, priority: "review", reason: "preparation_review",
        ageMinutes: sincePaid, title: "Check preparation progress",
        detail: "A recorded paid order is still in a preparation-stage order status. Actual KDS tickets and kitchen readiness have not been checked.",
      });
    } else if (paid === null && !terminal.has(status) &&
      (status === "payment_pending" || status === "awaiting_payment") &&
      sinceCreated >= pending) {
      alerts.push({
        orderId: order.order_id, priority: "info", reason: "payment_pending",
        ageMinutes: sinceCreated, title: "Review unresolved checkout",
        detail: "Payment remains unrecorded after the review threshold. Do not send to KDS unless Dishbee verifies capture.",
      });
    }
  }
  return alerts.sort((a, b) => priorities[a.priority] - priorities[b.priority] ||
    b.ageMinutes - a.ageMinutes || a.orderId.localeCompare(b.orderId)).slice(0, limit);
}
