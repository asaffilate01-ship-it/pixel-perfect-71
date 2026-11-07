import type { KdsOrder } from "./mealdeck-kds";
import type { KdsCompletedOrder } from "./mealdeck-kds-workflow";
import { kdsOrderStage, type KdsOrderStage } from "./mealdeck-kds-presentation";
import { formatPackingBagName } from "./mealdeck-packing-name";
import { orderDisplayNumber } from "./mealdeck-order-number";
import { MARKETPLACE_LABELS } from "./mealdeck-marketplace";

export type KdsView = "tickets" | "stages";
export type KdsSort = "oldest" | "newest";
export type KdsFulfilmentFilter = "all" | KdsOrder["fulfilment"];
export type KdsStageFilter = "all" | KdsOrderStage;

export const KDS_ACTIVE_STAGES = ["queued", "accepted", "preparing", "ready", "sealed"] as const;
export const KDS_FULFILMENT_LABELS: Record<KdsOrder["fulfilment"], string> = {
  delivery: "Delivery",
  pickup: "Collection",
  curbside: "Kerbside",
  dine_in: "Dine in",
};

/** Filters select complete master orders; they never trim a ticket's food or bags. */
export function matchesKdsOrderSearch(order: KdsOrder | KdsCompletedOrder, query: string): boolean {
  const terms = query.trim().toLocaleLowerCase("en-GB").split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const values = [
    orderDisplayNumber(order.order_number, order.display_code),
    order.display_code,
    ...(order.marketplace
      ? [
          order.marketplace.display_reference,
          MARKETPLACE_LABELS[order.marketplace.platform],
          MARKETPLACE_LABELS[order.marketplace.platform].replace(/\s/g, ""),
        ]
      : []),
    KDS_FULFILMENT_LABELS[order.fulfilment],
    order.notes ?? "",
    ...order.items.flatMap((item) => [
      item.item_name,
      item.brand_name,
      item.participant_name ?? "",
      item.notes ?? "",
      ...item.modifiers,
      ...(item.mealComponents?.map((component) => component.name) ?? []),
      ...(item.bags?.map(formatPackingBagName) ?? []),
    ]),
    ...("vehicle" in order && order.vehicle
      ? [order.vehicle.make, order.vehicle.colour, order.vehicle.registrationLast4]
      : []),
    ...((order.fulfilment === "pickup" || order.fulfilment === "curbside") && order.pickupContact
      ? [order.pickupContact.name, order.pickupContact.phone]
      : []),
  ].map((value) => value.toLocaleLowerCase("en-GB"));
  return terms.every((term) => values.some((value) => value.includes(term)));
}

type Filters = { query: string; fulfilment: KdsFulfilmentFilter; sort: KdsSort };

export function selectKdsOrders(
  orders: readonly KdsOrder[],
  filters: Filters & { stage: KdsStageFilter },
): KdsOrder[] {
  return orders
    .filter(
      (order) =>
        (filters.stage === "all" || kdsOrderStage(order) === filters.stage) &&
        (filters.fulfilment === "all" || order.fulfilment === filters.fulfilment) &&
        matchesKdsOrderSearch(order, filters.query),
    )
    .sort((a, b) => {
      const difference = Date.parse(a.released_at) - Date.parse(b.released_at);
      return (
        (filters.sort === "newest" ? -difference : difference) ||
        a.order_id.localeCompare(b.order_id)
      );
    });
}

export function selectCompletedKdsOrders(
  orders: readonly KdsCompletedOrder[],
  filters: Filters,
): KdsCompletedOrder[] {
  return orders
    .filter(
      (order) =>
        (filters.fulfilment === "all" || order.fulfilment === filters.fulfilment) &&
        matchesKdsOrderSearch(order, filters.query),
    )
    .sort((a, b) => {
      const difference = Date.parse(a.completed_at) - Date.parse(b.completed_at);
      return (
        (filters.sort === "newest" ? -difference : difference) ||
        a.order_id.localeCompare(b.order_id)
      );
    });
}

export function kdsTicketProgress(order: KdsOrder) {
  const readyLines = order.items.filter((item) => item.status === "ready").length;
  return {
    readyLines,
    totalLines: order.items.length,
    quantity: order.items.reduce((total, item) => total + item.quantity, 0),
    bagCount: new Set(order.items.flatMap((item) => item.bags?.map((bag) => bag.number) ?? []))
      .size,
    percent: order.items.length ? Math.round((readyLines / order.items.length) * 100) : 0,
  };
}

export function kdsClockTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
  });
}
