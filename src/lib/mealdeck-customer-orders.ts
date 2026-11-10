import { isOrderNumber } from "./mealdeck-order-number";

export type CustomerOrderSummary = {
  orderId: string;
  orderNumber?: string | null;
  handoffCode: string | null;
  verifiedPaid: boolean;
  held: boolean;
  paymentSessionExpired: boolean;
  fulfilment: "pickup" | "curbside" | "delivery";
  totalPence: number;
  createdAt: string;
  paidAt: string | null;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyForCollectionAt: string | null;
  completedAt: string | null;
  /** Auth-scoped staff/KDS evidence only; no location coordinates or ETA. */
  localDriverStatus?: "awaiting_driver" | "with_driver" | "delivered" | null;
};
const timestamps = [
  "paidAt",
  "acceptedAt",
  "preparingAt",
  "readyForCollectionAt",
  "completedAt",
] as const;
export function parseCustomerOrders(value: unknown): CustomerOrderSummary[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const orders = (value as Record<string, unknown>)["orders"];
  if (!Array.isArray(orders) || orders.length > 20) return null;
  const result: CustomerOrderSummary[] = [];
  const seen = new Set<string>();
  for (const order of orders) {
    if (!order || typeof order !== "object" || Array.isArray(order)) return null;
    const entry = order as Record<string, unknown>;
    if (
      typeof entry["orderId"] !== "string" ||
      !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(entry["orderId"]) ||
      seen.has(entry["orderId"]) ||
      (entry["orderNumber"] != null && !isOrderNumber(entry["orderNumber"])) ||
      !(
        entry["handoffCode"] === null ||
        (typeof entry["handoffCode"] === "string" && /^[0-9]{4}$/.test(entry["handoffCode"]))
      ) ||
      typeof entry["verifiedPaid"] !== "boolean" ||
      (entry["localDriverStatus"] !== undefined &&
        entry["localDriverStatus"] !== null &&
        !["awaiting_driver", "with_driver", "delivered"].includes(
          String(entry["localDriverStatus"]),
        )) ||
      (entry["localDriverStatus"] != null &&
        (entry["fulfilment"] !== "delivery" ||
          entry["verifiedPaid"] !== true ||
          entry["held"] !== false)) ||
      typeof entry["held"] !== "boolean" ||
      typeof entry["paymentSessionExpired"] !== "boolean" ||
      !["pickup", "curbside", "delivery"].includes(String(entry["fulfilment"])) ||
      !Number.isSafeInteger(entry["totalPence"]) ||
      (entry["totalPence"] as number) < 1 ||
      (entry["totalPence"] as number) > 10_000_000 ||
      typeof entry["createdAt"] !== "string" ||
      !Number.isFinite(Date.parse(entry["createdAt"])) ||
      timestamps.some(
        (key) =>
          !(
            entry[key] === null ||
            (typeof entry[key] === "string" && Number.isFinite(Date.parse(entry[key])))
          ),
      )
    )
      return null;
    if (entry["verifiedPaid"] && (entry["held"] || !entry["paidAt"] || !entry["handoffCode"]))
      return null;
    seen.add(entry["orderId"]);
    result.push({
      orderId: entry["orderId"],
      ...(entry["orderNumber"] === undefined
        ? {}
        : { orderNumber: entry["orderNumber"] as string | null }),
      handoffCode: entry["handoffCode"] as string | null,
      verifiedPaid: entry["verifiedPaid"],
      held: entry["held"],
      paymentSessionExpired: entry["paymentSessionExpired"],
      fulfilment: entry["fulfilment"] as "pickup" | "curbside" | "delivery",
      totalPence: entry["totalPence"] as number,
      createdAt: entry["createdAt"],
      ...(entry["localDriverStatus"] === undefined
        ? {}
        : {
            localDriverStatus: entry["localDriverStatus"] as CustomerOrderSummary["localDriverStatus"],
          }),
      ...Object.fromEntries(timestamps.map((key) => [key, entry[key]])),
    } as CustomerOrderSummary);
  }
  return result;
}
export function customerOrderStatus(order: CustomerOrderSummary) {
  if (order.held) return "Needs team review";
  if (!order.verifiedPaid)
    return order.paymentSessionExpired ? "Payment session expired" : "Awaiting payment";
  if (order.completedAt)
    return order.fulfilment === "delivery" && order.localDriverStatus === "delivered"
      ? "Delivered"
      : "Completed";
  if (order.fulfilment === "delivery" && order.readyForCollectionAt) {
    if (order.localDriverStatus === "with_driver") return "With your driver";
    if (order.localDriverStatus === "delivered") return "Delivery confirmation pending";
    if (order.localDriverStatus === "awaiting_driver") return "Packed · awaiting driver";
  }
  if (order.readyForCollectionAt)
    return order.fulfilment === "delivery" ? "Packed for delivery" : "Ready to collect";
  if (order.preparingAt) return "Preparing";
  if (order.acceptedAt) return "Accepted";
  return "Order placed";
}
