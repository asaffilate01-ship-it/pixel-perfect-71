/**
 * Validate and minimize one tracking RPC reply for read-only presentation.
 * Parsing a row does not verify payment, release food, approve a courier URL,
 * or establish a lifecycle transition. The backend remains authoritative and
 * the presentation model separately interprets supported status combinations.
 */
export type TrackingProjectionRow = Readonly<{
  orderStatus: string;
  fulfilment: string;
  passStatus?: string;
  deliveryStatus?: string;
  trackingUrlCandidate?: string;
  createdAt?: string;
  updatedAt?: string;
}>;

export type TrackingReply =
  | Readonly<{ kind: "found"; row: TrackingProjectionRow }>
  | Readonly<{ kind: "not_found" }>
  | Readonly<{ kind: "invalid" }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isStatusCode(value: unknown): value is string {
  // Require literal, already-normalized codes. Never coerce arrays, numbers or
  // objects, and never trim/lowercase a malformed reply into a trusted status.
  return typeof value === "string" && value === value.trim() && /^[a-z_]{1,60}$/.test(value);
}

function ownValue(row: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(row, key) ? row[key] : undefined;
}

function boundedString(value: unknown, maximum: number): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    ? value
    : undefined;
}

export function parseMealDeckTrackingReply(value: unknown): TrackingReply {
  if (!Array.isArray(value) || value.length > 1) return { kind: "invalid" };
  if (value.length === 0) return { kind: "not_found" };
  const raw = value[0];
  if (!isRecord(raw)) return { kind: "invalid" };

  const orderStatus = ownValue(raw, "order_status");
  const fulfilment = ownValue(raw, "fulfilment");
  const passStatus = ownValue(raw, "pass_status");
  const deliveryStatus = ownValue(raw, "delivery_status");
  if (
    !isStatusCode(orderStatus) ||
    !isStatusCode(fulfilment) ||
    (passStatus != null && !isStatusCode(passStatus)) ||
    (deliveryStatus != null && !isStatusCode(deliveryStatus))
  )
    return { kind: "invalid" };

  // Keep URL approval on the server. Calendar/chronology validation belongs to
  // the presentation clock; malformed non-string or oversized times are omitted.
  // A legacy reply lacking created_at must never borrow updated_at or Date.now().
  const trackingUrlCandidate = boundedString(ownValue(raw, "tracking_url"), 2048);
  const createdAt = boundedString(ownValue(raw, "created_at"), 40);
  const updatedAt = boundedString(ownValue(raw, "updated_at"), 40);
  return {
    kind: "found",
    row: {
      orderStatus,
      fulfilment,
      ...(passStatus != null ? { passStatus } : {}),
      ...(deliveryStatus != null ? { deliveryStatus } : {}),
      ...(trackingUrlCandidate !== undefined ? { trackingUrlCandidate } : {}),
      ...(createdAt !== undefined ? { createdAt } : {}),
      ...(updatedAt !== undefined ? { updatedAt } : {}),
    },
  };
}
