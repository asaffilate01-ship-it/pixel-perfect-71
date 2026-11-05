export type CustomerOrderSummary = {
  orderId: string;
  handoffCode: string | null;
  verifiedPaid: boolean;
  held: boolean;
  paymentSessionExpired: boolean;
  fulfilment: "pickup" | "curbside";
  totalPence: number;
  createdAt: string;
  paidAt: string | null;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyForCollectionAt: string | null;
  completedAt: string | null;
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
      !(
        entry["handoffCode"] === null ||
        (typeof entry["handoffCode"] === "string" && /^[0-9]{4}$/.test(entry["handoffCode"]))
      ) ||
      typeof entry["verifiedPaid"] !== "boolean" ||
      typeof entry["held"] !== "boolean" ||
      typeof entry["paymentSessionExpired"] !== "boolean" ||
      !["pickup", "curbside"].includes(String(entry["fulfilment"])) ||
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
      handoffCode: entry["handoffCode"] as string | null,
      verifiedPaid: entry["verifiedPaid"],
      held: entry["held"],
      paymentSessionExpired: entry["paymentSessionExpired"],
      fulfilment: entry["fulfilment"] as "pickup" | "curbside",
      totalPence: entry["totalPence"] as number,
      createdAt: entry["createdAt"],
      ...Object.fromEntries(timestamps.map((key) => [key, entry[key]])),
    } as CustomerOrderSummary);
  }
  return result;
}
export function customerOrderStatus(order: CustomerOrderSummary) {
  if (order.held) return "Needs team review";
  if (!order.verifiedPaid)
    return order.paymentSessionExpired ? "Payment session expired" : "Awaiting payment";
  if (order.completedAt) return "Completed";
  if (order.readyForCollectionAt) return "Ready to collect";
  if (order.preparingAt) return "Preparing";
  if (order.acceptedAt) return "Accepted";
  return "Order placed";
}
