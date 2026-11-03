/**
 * Sign an expiring, non-payment MealDeck estimate on the server.
 *
 * No address/phone/postcode in the token: only a keyed fingerprint. The token
 * attests to a provisional Dishbee menu + delivery-policy snapshot, not to
 * captured money, a provider quote, an accepted order or a reservation.
 *
 * Server-only: never import this module into a browser component.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type SignedQuoteLine = {
  itemId: string;
  quantity: number;
  modifierIds: readonly string[];
};

export type QuoteBinding = {
  tenantId: string;
  locationId: string;
  location: "luton" | "stalbans";
  fulfilment: "delivery" | "pickup" | "curbside";
  postcode: string;
  lines: readonly SignedQuoteLine[];
};

export type QuoteAmounts = {
  goodsPence: number;
  deliveryPence: number;
  totalPence: number;
  currency: "GBP";
};

type SignedPayload = QuoteAmounts & {
  v: 1;
  fingerprint: string;
  issuedAtMs: number;
  expiresAtMs: number;
};

export type QuoteIssueResult =
  | { ready: true; token: string; expiresAt: string }
  | { ready: false; reason: "invalid_input" | "secret_unavailable" };

export type QuoteVerification =
  | { valid: true; amounts: QuoteAmounts; expiresAt: string }
  | { valid: false; reason: "invalid_quote" | "expired" | "mismatch" | "secret_unavailable" };

const MAX_TOKEN_BYTES = 1536;
const TTL_MS = 2 * 60_000;
const SECRET_MIN_BYTES = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeMoney = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= 10_000_000;
const validSecret = (s: string | undefined): s is string =>
  typeof s === "string" && Buffer.byteLength(s, "utf8") >= SECRET_MIN_BYTES;
const normalisePostcode = (value: string): string =>
  value.toUpperCase().replace(/\s+/g, "");

function canonicalBinding(input: QuoteBinding): string | null {
  if (!UUID.test(input.tenantId) || !UUID.test(input.locationId) ||
      !["luton", "stalbans"].includes(input.location) ||
      !["delivery", "pickup", "curbside"].includes(input.fulfilment) ||
      (input.location === "stalbans" && input.fulfilment !== "delivery") ||
      !Array.isArray(input.lines) || !input.lines.length ||
      input.lines.length > 60) return null;

  const postcode = normalisePostcode(input.postcode);
  if (!/^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(postcode)) return null;

  const lines: Array<{ itemId: string; quantity: number; modifierIds: string[] }> = [];
  for (const line of input.lines) {
    if (!UUID.test(line.itemId) || !Number.isSafeInteger(line.quantity) ||
        line.quantity < 1 || line.quantity > 50 ||
        !Array.isArray(line.modifierIds) || line.modifierIds.length > 20 ||
        !line.modifierIds.every((id: string) => UUID.test(id))) return null;
    const modifierIds = line.modifierIds.map((id: string) => id.toLowerCase()).sort();
    if (new Set(modifierIds).size !== modifierIds.length) return null;
    lines.push({ itemId: line.itemId.toLowerCase(), quantity: line.quantity, modifierIds });
  }
  // Basket position does not affect the price identity; selected modifiers,
  // quantity and duplicate lines do. No individual customer data is exposed.
  lines.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify({
    tenantId: input.tenantId.toLowerCase(),
    locationId: input.locationId.toLowerCase(),
    location: input.location,
    fulfilment: input.fulfilment,
    postcode,
    lines,
  });
}

function fingerprint(binding: string, secret: string) {
  return createHmac("sha256", secret).update("mealdeck-quote-binding-v1:")
    .update(binding).digest("base64url");
}

function signature(body: string, secret: string) {
  return createHmac("sha256", secret).update("mealdeck-quote-token-v1:")
    .update(body).digest("base64url");
}

function equalSecrets(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function validAmounts(a: QuoteAmounts): boolean {
  return a.currency === "GBP" && safeMoney(a.goodsPence) && a.goodsPence > 0 &&
    safeMoney(a.deliveryPence) && safeMoney(a.totalPence) &&
    a.totalPence === a.goodsPence + a.deliveryPence;
}

export function issueMealDeckQuote(input: {
  binding: QuoteBinding;
  amounts: QuoteAmounts;
  secret: string | undefined;
  nowMs: number;
}): QuoteIssueResult {
  if (!validSecret(input.secret)) return { ready: false, reason: "secret_unavailable" };
  const binding = canonicalBinding(input.binding);
  if (!binding || !validAmounts(input.amounts) ||
      (input.binding.fulfilment !== "delivery" && input.amounts.deliveryPence !== 0) ||
      !Number.isSafeInteger(input.nowMs) || input.nowMs <= 0) {
    return { ready: false, reason: "invalid_input" };
  }
  const payload: SignedPayload = {
    v: 1, ...input.amounts,
    fingerprint: fingerprint(binding, input.secret),
    issuedAtMs: input.nowMs, expiresAtMs: input.nowMs + TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const token = body + "." + signature(body, input.secret);
  if (token.length > MAX_TOKEN_BYTES) return { ready: false, reason: "invalid_input" };
  return { ready: true, token, expiresAt: new Date(payload.expiresAtMs).toISOString() };
}

export function verifyMealDeckQuote(input: {
  token: string;
  binding: QuoteBinding;
  secret: string | undefined;
  nowMs: number;
}): QuoteVerification {
  const invalid = (reason: Extract<QuoteVerification, { valid: false }>["reason"]): QuoteVerification =>
    ({ valid: false, reason });
  if (!validSecret(input.secret)) return invalid("secret_unavailable");
  const binding = canonicalBinding(input.binding);
  if (!binding || typeof input.token !== "string" ||
      input.token.length < 40 || input.token.length > MAX_TOKEN_BYTES ||
      !Number.isSafeInteger(input.nowMs)) return invalid("invalid_quote");
  const parts = input.token.split(".");
  if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) {
    return invalid("invalid_quote");
  }
  const body = parts[0]!;
  const suppliedSignature = parts[1]!;
  if (!equalSecrets(signature(body, input.secret), suppliedSignature)) {
    return invalid("invalid_quote");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return invalid("invalid_quote");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return invalid("invalid_quote");
  }
  const data = parsed as Partial<SignedPayload>;
  if (data.v !== 1 || typeof data.fingerprint !== "string" ||
      !Number.isSafeInteger(data.issuedAtMs) ||
      !Number.isSafeInteger(data.expiresAtMs) ||
      !validAmounts(data as QuoteAmounts) ||
      (input.binding.fulfilment !== "delivery" && data.deliveryPence !== 0)) {
    return invalid("invalid_quote");
  }
  const issued = data.issuedAtMs!;
  const expiry = data.expiresAtMs!;
  if (expiry <= issued || expiry - issued > TTL_MS ||
      issued > input.nowMs + 5_000) return invalid("invalid_quote");
  if (input.nowMs >= expiry) return invalid("expired");
  if (!equalSecrets(fingerprint(binding, input.secret), data.fingerprint)) {
    return invalid("mismatch");
  }
  return {
    valid: true,
    amounts: {
      currency: "GBP",
      goodsPence: data.goodsPence!,
      deliveryPence: data.deliveryPence!,
      totalPence: data.totalPence!,
    },
    expiresAt: new Date(expiry).toISOString(),
  };
}

/**
 * Never permit a stale signed estimate to decide the final amount. The
 * authoritative Dishbee menu and delivery fee must be reread immediately.
 */
export function matchesCurrentDishbeeAmounts(
  quoted: QuoteAmounts,
  current: QuoteAmounts,
): boolean {
  return validAmounts(quoted) && validAmounts(current) &&
    quoted.currency === current.currency &&
    quoted.goodsPence === current.goodsPence &&
    quoted.deliveryPence === current.deliveryPence &&
    quoted.totalPence === current.totalPence;
}
