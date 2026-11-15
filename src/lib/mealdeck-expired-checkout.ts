/**
 * Display-only classification. Neither the browser nor the order's age is
 * payment authority. The independent MealDeck server/ledger establishes expiry.
 * A bank or card dispute must still be checked with the payment provider.
 */
export const EXPIRED_CHECKOUT_LABEL = "Payment not completed — checkout expired";

export function isExpiredUnpaidReceipt(receipt: {
  paymentSessionExpired: boolean;
  verifiedPaid: boolean;
  held: boolean;
  paidAt: string | null;
  paymentStatus: string;
}): boolean {
  return receipt.paymentSessionExpired === true &&
    receipt.verifiedPaid === false &&
    receipt.held === false &&
    receipt.paidAt === null &&
    receipt.paymentStatus !== "paid" &&
    receipt.paymentStatus !== "refunded" &&
    receipt.paymentStatus !== "partially_refunded";
}

export function opsCheckoutDisplayStatus(
  order: { source: string | null; status: string; paid_at: string | null },
  verifiedExpiry: boolean,
): string {
  if (
    verifiedExpiry === true &&
    order.source === "mealdeck" &&
    order.status === "payment_pending" &&
    order.paid_at === null
  ) return EXPIRED_CHECKOUT_LABEL;
  return order.status;
}

/** Treat an unavailable or malformed staff RPC response as unknown, not expired. */
export function parseOpsCheckoutExpirations(
  value: unknown,
  requestedIds: readonly string[],
): ReadonlySet<string> | null {
  if (!Array.isArray(value) || value.length > requestedIds.length) return null;
  const allowed = new Set(requestedIds);
  const seen = new Set<string>();
  const expired = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const record = row as Record<string, unknown>;
    const id = record["order_id"];
    const flag = record["payment_session_expired"];
    if (typeof id !== "string" || !allowed.has(id) || seen.has(id) || typeof flag !== "boolean")
      return null;
    seen.add(id);
    if (flag) expired.add(id);
  }
  return expired;
}
