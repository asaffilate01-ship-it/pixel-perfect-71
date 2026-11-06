import {
  nextKdsPassStatus,
  type KdsOrderItem,
  type KdsMutation,
  type KdsOrder,
} from "./mealdeck-kds";

export const KDS_STAGE_LABELS = {
  queued: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready to pack",
  sealed: "Ready for handover",
  done: "Done",
} as const;
export type KdsOrderStage = keyof typeof KDS_STAGE_LABELS;
export type KdsOrderAction = {
  target: "accept" | "order" | "pass" | "item" | "handoff";
  itemId?: string;
  ready?: boolean;
  code?: string;
  status: KdsMutation["status"];
  label: string;
};
export type KdsBrandItems = { key: string; name: string; items: KdsOrderItem[] };

/** Presentation only. Canonical state and transitions are rechecked by the RPC. */
export function kdsOrderStage(order: KdsOrder): KdsOrderStage {
  if (order.pass?.status === "sealed" || order.pass?.status === "ready_for_handoff")
    return "sealed";
  // Packing is an activity within Ready to pack, not a seventh queue.
  if (order.pass?.status === "packing") return "ready";
  if (order.preparation_status === "queued" && order.accepted_at) return "accepted";
  return order.preparation_status;
}

export function nextKdsOrderAction(order: KdsOrder): KdsOrderAction | null {
  if (!order.routing_complete) return null;
  if (!order.accepted_at) return { target: "accept", status: "accepted", label: "Accept order" };
  if (order.pass?.status === "sealed" || order.pass?.status === "ready_for_handoff") return null;
  if (order.pass?.status === "packing" || order.pass?.status === "ready_to_pack") {
    if (order.preparation_status !== "ready") return null;
    const packing = nextKdsPassStatus(order.pass.status);
    if (!packing) return null;
    return {
      target: "pass",
      status: packing,
      label: packing === "packing" ? "Start packing" : "Ready for handover",
    };
  }
  // Readiness comes only from the individual item checklist. There is no
  // bulk-ready action that can bypass a forgotten drink or another brand.
  return order.preparation_status === "queued"
    ? { target: "order", status: "preparing", label: "Start preparing" }
    : null;
}

/**
 * A dish can be routed to more than one station (for example prep and assembly).
 * Use canonical purchased lines, not station routes: each dish is shown once,
 * including lines whose station routing still needs an operations review.
 * Distinct order lines remain separate even when their names or choices match.
 */
export function groupKdsItems(order: KdsOrder): KdsBrandItems[] {
  const groups = new Map<string, KdsBrandItems>();
  for (const item of order.items.filter((i) => !i.parent_checkout_line_id)) {
    const key = item.brand_id ?? item.brand_name;
    const group = groups.get(key) ?? { key, name: item.brand_name, items: [] };
    group.items.push(
      item,
      ...order.items.filter(
        (child) =>
          child.parent_checkout_line_id && child.parent_checkout_line_id === item.checkout_line_id,
      ),
    );
    groups.set(key, group);
  }
  return [...groups.values()];
}
