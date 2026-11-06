import {
  nextKdsPassStatus,
  type KdsOrderItem,
  type KdsMutation,
  type KdsOrder,
} from "./mealdeck-kds";

export const KDS_STAGES = [
  "new",
  "accepted",
  "preparing",
  "ready_to_pack",
  "ready_for_handover",
  "done",
] as const;
export type KdsOrderStage = (typeof KDS_STAGES)[number];
export const KDS_STAGE_LABELS: Record<KdsOrderStage, string> = {
  new: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready_to_pack: "Ready to pack",
  ready_for_handover: "Ready for handover",
  done: "Done",
};
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
  if (order.order_status === "fulfilled") return "done";
  if (order.pass?.status === "sealed" || order.pass?.status === "ready_for_handoff")
    return "ready_for_handover";
  if (order.preparation_status === "ready") return "ready_to_pack";
  if (order.preparation_status === "preparing") return "preparing";
  return order.accepted_at ? "accepted" : "new";
}

export function nextKdsOrderAction(order: KdsOrder): KdsOrderAction | null {
  if (!order.routing_complete || order.order_status === "fulfilled") return null;
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
