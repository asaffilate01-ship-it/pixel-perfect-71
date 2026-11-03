import type { CartLine, FulfilmentType, LocationKey } from "./mealdeck";

/**
 * An attempt is a single customer-approved checkout intent.
 * Stored in this page's React ref only: never in a URL, localStorage or logs.
 * The Dishbee Postgres primary key, NOT this helper, enforces uniqueness.
 */
export type CheckoutAttempt = Readonly<{ id: string; fingerprint: string }>;
export type CheckoutCustomer = Readonly<{
  name: string;
  phone: string;
  email: string;
  carMake: string;
  vehicleRegistration: string;
  address1: string;
  city: string;
  postcode: string;
  notes: string;
}>;
export type CheckoutSnapshot = Readonly<{
  location: LocationKey;
  fulfilment: FulfilmentType;
  customer: CheckoutCustomer;
  lines: readonly CartLine[];
}>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validText = (value: unknown, max: number) =>
  typeof value === "string" && value.length <= max;

/**
 * This is a transient equality key, not proof of identity or a payment hash.
 * Deliberately exclude the expiring quote token: refreshing an otherwise
 * identical quote must preserve the attempt ID after a lost response.
 */
export function checkoutSnapshotFingerprint(value: CheckoutSnapshot): string | null {
  if (!value || !["luton", "stalbans"].includes(value.location) ||
      !["delivery", "pickup", "curbside"].includes(value.fulfilment) ||
      (value.location === "stalbans" && value.fulfilment !== "delivery") ||
      !Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 60 ||
      !value.customer || !validText(value.customer.name, 120) ||
      !validText(value.customer.phone, 40) ||
      !validText(value.customer.email, 160) ||
      !validText(value.customer.carMake, 60) ||
      !validText(value.customer.vehicleRegistration, 12) ||
      !validText(value.customer.address1, 200) ||
      !validText(value.customer.city, 120) ||
      !validText(value.customer.postcode, 12) ||
      !validText(value.customer.notes, 400)) return null;

  const lines = [];
  for (const line of value.lines) {
    if (!line || typeof line.id !== "string" || line.id.length === 0 ||
        !Number.isSafeInteger(line.quantity) || line.quantity < 1 ||
        line.quantity > 50 || !Array.isArray(line.selectedModifiers) ||
        line.selectedModifiers.length > 20) return null;
    const modifiers = [];
    for (const m of line.selectedModifiers) {
      if (!m || typeof m.id !== "string" || typeof m.groupId !== "string" ||
          !validText(m.name, 80) || !validText(m.groupName, 120) ||
          !Number.isSafeInteger(m.priceDeltaPence)) return null;
      modifiers.push({
        id: m.id, groupId: m.groupId, groupName: m.groupName,
        name: m.name, priceDeltaPence: m.priceDeltaPence,
      });
    }
    lines.push({ itemId: line.id, quantity: line.quantity, modifiers });
  }
  return JSON.stringify({
    location: value.location, fulfilment: value.fulfilment,
    lines, customer: {
      name: value.customer.name, phone: value.customer.phone,
      email: value.customer.email, carMake: value.customer.carMake,
      vehicleRegistration: value.customer.vehicleRegistration,
      address1: value.customer.address1, city: value.customer.city,
      postcode: value.customer.postcode, notes: value.customer.notes,
    },
  });
}

/**
 * Same exact checkout data -> retry same UUID. Any changed input -> new UUID.
 * UUID must be produced by the browser's cryptographic randomUUID API.
 * Never fall back to Math.random, timestamps or a hash of customer data.
 */
export function getOrCreateCheckoutAttempt(
  previous: CheckoutAttempt | null,
  fingerprint: string | null,
  generateUuid: () => string,
): CheckoutAttempt | null {
  if (!fingerprint) return null;
  if (previous?.fingerprint === fingerprint && UUID_V4.test(previous.id)) {
    return previous;
  }
  let uuid: string;
  try {
    uuid = generateUuid();
  } catch {
    return null;
  }
  if (typeof uuid !== "string" || !UUID_V4.test(uuid)) return null;
  return { id: uuid.toLowerCase(), fingerprint };
}
