/** Customer membership contracts. No browser field can grant checkout eligibility. */
export const CUSTOMER_PRIVACY_VERSION = "mealdeck-customer-2026-11-05";
export const CUSTOMER_CONSENT_VERSION = "mealdeck-preferences-2026-11-05";

export type CustomerPreferences = {
  emailMarketing: boolean;
  pushMarketing: boolean;
  orderNotifications: boolean;
};

export const EMPTY_CUSTOMER_PREFERENCES: CustomerPreferences = Object.freeze({
  emailMarketing: false,
  pushMarketing: false,
  orderNotifications: false,
});

export type MealDeckCustomerProfile = {
  registered: boolean;
  userId: string;
  email: string;
  emailConfirmedAt: string;
  name: string | null;
  phone: string | null;
  updatedAt: string | null;
  preferences: CustomerPreferences;
  loyalty: { enabled: boolean; points: number; terms: string | null };
};

export type CustomerRegistration = {
  name: string;
  email: string;
  phone: string;
  preferences: CustomerPreferences;
};

export type CustomerCapabilities = {
  registration: true;
  pushReady: boolean;
  loyaltyReady: boolean;
};

export class CustomerAccountError extends Error {
  constructor(
    public readonly code:
      | "unconfigured"
      | "unavailable"
      | "unauthenticated"
      | "unverified"
      | "invalid"
      | "conflict"
      | "rate_limited",
    message: string,
  ) {
    super(message);
    this.name = "CustomerAccountError";
  }
}

/** Accept common UK presentation, store an E.164-shaped number without spaces. */
export function normalizeCustomerPhone(value: string): string | null {
  if (!/^[+\d\s().-]+$/.test(value.trim()) || value.length > 40) return null;
  let phone = value.replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = "+" + phone.slice(2);
  if (/^0\d{10}$/.test(phone)) phone = "+44" + phone.slice(1);
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export function normalizeCustomerName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  // New contact names must also be safe on the canonical kitchen receipt.
  const hasControl = /[\p{Cc}\p{Cf}]/u.test(value);
  return name.length >= 1 && name.length <= 120 && !hasControl ? name : null;
}

export function normalizeCustomerEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseCustomerPreferences(value: unknown): CustomerPreferences | null {
  const entry = object(value);
  if (
    !entry ||
    typeof entry["emailMarketing"] !== "boolean" ||
    typeof entry["pushMarketing"] !== "boolean" ||
    typeof entry["orderNotifications"] !== "boolean"
  )
    return null;
  return {
    emailMarketing: entry["emailMarketing"],
    pushMarketing: entry["pushMarketing"],
    orderNotifications: entry["orderNotifications"],
  };
}

export function validateCustomerRegistration(value: CustomerRegistration): CustomerRegistration {
  const name = normalizeCustomerName(value.name);
  const email = normalizeCustomerEmail(value.email);
  const phone = normalizeCustomerPhone(value.phone);
  const preferences = parseCustomerPreferences(value.preferences);
  if (!name) throw new CustomerAccountError("invalid", "Enter your name (up to 120 characters).");
  if (!email) throw new CustomerAccountError("invalid", "Enter a valid email address.");
  if (!phone)
    throw new CustomerAccountError(
      "invalid",
      "Enter your UK phone number, or use a country code such as +44.",
    );
  if (!preferences)
    throw new CustomerAccountError("invalid", "Please review your communication preferences.");
  return { name, email, phone, preferences };
}

export function parseCustomerCapabilities(value: unknown): CustomerCapabilities | null {
  const entry = object(value);
  if (
    !entry ||
    entry["schemaVersion"] !== 1 ||
    entry["registration"] !== true ||
    typeof entry["pushReady"] !== "boolean" ||
    typeof entry["loyaltyReady"] !== "boolean"
  )
    return null;
  return {
    registration: true,
    pushReady: entry["pushReady"],
    loyaltyReady: entry["loyaltyReady"],
  };
}

/** Parse only the authenticated server response, never localStorage or user metadata. */
export function parseCustomerProfile(value: unknown): MealDeckCustomerProfile | null {
  const entry = object(value);
  if (!entry) return null;
  const preferences = parseCustomerPreferences(entry["preferences"]);
  const loyalty = object(entry["loyalty"]);
  if (
    typeof entry["registered"] !== "boolean" ||
    typeof entry["userId"] !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry["userId"]) ||
    typeof entry["email"] !== "string" ||
    !normalizeCustomerEmail(entry["email"]) ||
    typeof entry["emailConfirmedAt"] !== "string" ||
    !Number.isFinite(Date.parse(entry["emailConfirmedAt"])) ||
    !(entry["name"] === null || typeof entry["name"] === "string") ||
    !(entry["phone"] === null || typeof entry["phone"] === "string") ||
    !(entry["updatedAt"] === null || typeof entry["updatedAt"] === "string") ||
    !preferences ||
    !loyalty ||
    typeof loyalty["enabled"] !== "boolean" ||
    !Number.isSafeInteger(loyalty["points"]) ||
    (loyalty["points"] as number) < 0 ||
    !(loyalty["terms"] === null || typeof loyalty["terms"] === "string")
  )
    return null;
  if (
    entry["registered"] &&
    (typeof entry["name"] !== "string" ||
      !normalizeCustomerName(entry["name"]) ||
      typeof entry["phone"] !== "string" ||
      !normalizeCustomerPhone(entry["phone"]) ||
      typeof entry["updatedAt"] !== "string" ||
      !Number.isFinite(Date.parse(entry["updatedAt"])))
  )
    return null;
  return {
    registered: entry["registered"],
    userId: entry["userId"],
    email: entry["email"],
    emailConfirmedAt: entry["emailConfirmedAt"],
    name: entry["name"],
    phone: entry["phone"],
    updatedAt: entry["updatedAt"],
    preferences,
    loyalty: {
      enabled: loyalty["enabled"],
      points: loyalty["points"] as number,
      terms: loyalty["terms"],
    },
  };
}

export function isWebPushPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^B[A-Za-z0-9_-]{86}$/.test(value)) return false;
  try {
    const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=");
    return decoded.length === 65 && decoded.charCodeAt(0) === 4;
  } catch {
    return false;
  }
}

/** Push clicks only navigate to local public pages, never a payload URL or token. */
export function safeCustomerNotificationPath(value: unknown): string {
  return value === "/account" || value === "/menus" ? value : "/account";
}
