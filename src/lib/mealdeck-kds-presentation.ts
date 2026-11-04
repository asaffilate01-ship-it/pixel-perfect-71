import {
  nextKdsOrderStatus,
  nextKdsPassStatus,
  type KdsOrderItem,
  type KdsMutation,
  type KdsOrder,
} from "./mealdeck-kds";

export type KdsOrderStage = "queued" | "preparing" | "ready" | "packing" | "sealed";
export type KdsOrderAction = {
  target: "order" | "pass";
  status: KdsMutation["status"];
  label: string;
};
export type KdsBrandItems = { key: string; name: string; items: KdsOrderItem[] };

/** Presentation only. Canonical state and transitions are rechecked by the RPC. */
export function kdsOrderStage(order: KdsOrder): KdsOrderStage {
  if (order.pass?.status === "sealed" || order.pass?.status === "ready_for_handoff")
    return "sealed";
  if (order.pass?.status === "packing") return "packing";
  return order.preparation_status;
}

export function nextKdsOrderAction(order: KdsOrder): KdsOrderAction | null {
  if (!order.routing_complete) return null;
  if (order.pass?.status === "sealed" || order.pass?.status === "ready_for_handoff") return null;
  if (order.pass?.status === "packing" || order.pass?.status === "ready_to_pack") {
    if (order.preparation_status !== "ready") return null;
    const packing = nextKdsPassStatus(order.pass.status);
    if (!packing) return null;
    return {
      target: "pass",
      status: packing,
      label: packing === "packing" ? "Start packing" : "Seal order",
    };
  }
  const preparation = nextKdsOrderStatus(order.preparation_status);
  return preparation
    ? {
        target: "order",
        status: preparation,
        label: preparation === "preparing" ? "Start order" : "Ready to pack",
      }
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
  for (const item of order.items) {
    const key = item.brand_id ?? item.brand_name;
    const group = groups.get(key) ?? { key, name: item.brand_name, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}
