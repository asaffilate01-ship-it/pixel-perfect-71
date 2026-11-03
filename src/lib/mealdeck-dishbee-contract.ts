import type { LocationKey } from "./mealdeck";

/**
 * The Dishbee serviceability RPC returns canonical tenant/location IDs.
 * Location names, postcode prefixes and browser-selected location are NOT
 * authority for routing a paid MealDeck order.
 */
export type ApprovedKitchenRoute = {
  location: LocationKey;
  tenantId: string;
  locationId: string;
};
export type DishbeeServiceability =
  | { served: true; location: LocationKey; channelOpen: boolean; message: string }
  | { served: false; message: string };
export type DishbeeOrderReceipt = { orderId: string; handoffCode: string };

const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const genericUnavailable = "Live MealDeck ordering is unavailable for this postcode at present.";
const unknownKitchen = "This MealDeck kitchen isn't configured for live ordering yet.";
const publicMessage = (value: unknown, otherwise: string): string =>
  typeof value === "string" && value.length > 0 && value.length <= 220 &&
    !/[<>{}]/.test(value) &&
    ![...value].some(char => char.charCodeAt(0) < 32)
    ? value : otherwise;

/** Server-side interpretation of the PUBLIC, trusted Dishbee RPC response. */
export function resolveDishbeeServiceability(
  value: unknown,
  allowed: readonly ApprovedKitchenRoute[],
): DishbeeServiceability {
  const row = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value;
  if (!record(row)) return { served: false, message: genericUnavailable };
  if (row["served"] !== true) return {
    served: false, message: publicMessage(row["message"], genericUnavailable),
  };
  const tenantId = row["tenant_id"];
  const locationId = row["location_id"];
  if (!uuid(tenantId) || !uuid(locationId) ||
      typeof row["channel_open"] !== "boolean") {
    return { served: false, message: unknownKitchen };
  }
  const matches = allowed.filter(route =>
    uuid(route.tenantId) && uuid(route.locationId) &&
    route.tenantId.toLowerCase() === tenantId.toLowerCase() &&
    route.locationId.toLowerCase() === locationId.toLowerCase());
  // A duplicated or unknown kitchen mapping is an operational fault, not a
  // reason to silently reroute a customer to a different restaurant.
  if (matches.length !== 1) return { served: false, message: unknownKitchen };
  const location = matches[0]!.location;
  return {
    served: true,
    location,
    channelOpen: row["channel_open"],
    message: publicMessage(row["message"],
      row["channel_open"]
        ? "MealDeck serves your postcode."
        : "MealDeck serves your postcode but the kitchen is currently closed."),
  };
}

/**
 * Treat the RPC response as an untrusted network boundary. An order reference
 * without its verified-format private handoff code is NOT a usable checkout.
 * A valid receipt is always payment_pending, never evidence of a paid order.
 */
export function parseDishbeeOrderReceipt(value: unknown): DishbeeOrderReceipt | null {
  const row = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value;
  if (!record(row) || !uuid(row["order_id"]) ||
      typeof row["handoff_code"] !== "string" ||
      !/^\d{4}$/.test(row["handoff_code"])) return null;
  return { orderId: row["order_id"], handoffCode: row["handoff_code"] };
}

/**
 * P32 — strict server-side interpretation of the new DB idempotency receipt.
 * A replay of a paid order is NOT a new payment request.
 * A refund/cancellation needs human review, never a retry under a new ID.
 */
export type DishbeeAttemptReceipt = {
  kind: "payment_pending" | "existing_order" | "needs_support";
  orderId: string;
  handoffCode: string;
  replayed: boolean;
};
const alreadyProcessing = new Set([
  "paid", "accepted", "preparing", "ready", "fulfilled", "completed", "delivered",
]);
const terminalReview = new Set(["cancelled", "refunded", "failed"]);

export function parseDishbeeCheckoutAttemptReceipt(value: unknown): DishbeeAttemptReceipt | null {
  const row = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value;
  if (!record(row) || !uuid(row["order_id"]) ||
      typeof row["handoff_code"] !== "string" ||
      !/^\d{4}$/.test(row["handoff_code"]) ||
      typeof row["replayed"] !== "boolean" ||
      typeof row["order_status"] !== "string") return null;

  const status = row["order_status"];
  const replayed = row["replayed"];
  const base = { orderId: row["order_id"], handoffCode: row["handoff_code"], replayed };
  if (status === "payment_pending" || status === "awaiting_payment") {
    return { ...base, kind: "payment_pending" };
  }
  // A first response can never claim the new pending order is paid.
  if (!replayed) return null;
  if (alreadyProcessing.has(status)) return { ...base, kind: "existing_order" };
  if (terminalReview.has(status)) return { ...base, kind: "needs_support" };
  return null;
}

/**
 * A second intentional fail-closed switch after COMING_SOON. Setting the env
 * flag never connects Adyen or certifies compliance by itself. Operations may
 * set it only when the full Dishbee/Adyen path is independently signed off.
 */
export function mayCreateCustomerOrder(input: {
  comingSoon: boolean;
  kitchenConfigured: boolean;
  checkoutApproval: string | undefined;
}): boolean {
  return !input.comingSoon && input.kitchenConfigured &&
    input.checkoutApproval === "signed-off";
}
