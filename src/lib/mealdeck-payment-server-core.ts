import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CheckoutProblem } from "./mealdeck-checkout-selection";
import { guestTokenHash, readGuestToken } from "./mealdeck-guest-session.server";
import {
  readMealDeckCheckoutServerKey,
  readMealDeckRuntimeConfig,
  type MealDeckRuntimeEnv,
} from "./mealdeck-runtime-config";

export type PaymentJson = Record<string, unknown>;
export const paymentObject = (value: unknown): PaymentJson =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as PaymentJson) : {};
export const PAYMENT_NO_STORE = {
  "Cache-Control": "no-store, private",
  Vary: "Authorization, Cookie",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export function createPaymentClients(env: MealDeckRuntimeEnv, fetcher: typeof fetch) {
  const config = readMealDeckRuntimeConfig(env, "luton");
  if (!config) return null;
  const key = readMealDeckCheckoutServerKey(env, config);
  if (!key) return null;
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher },
  };
  return {
    config,
    publicClient: createClient(config.url, config.anonKey, options),
    service: createClient(config.url, key, options),
  };
}
export type PaymentClients = NonNullable<ReturnType<typeof createPaymentClients>>;
export type PaymentIdentity = { customerId: string | null; guestTokenHash: string | null };

export function paymentUnavailable(message = "Payments are being prepared for this kitchen.") {
  return new CheckoutProblem("payments_unavailable", message, 503);
}

export function paymentDatabaseError(error: unknown): CheckoutProblem {
  const message = String(paymentObject(error)["message"] ?? "");
  const cases: [RegExp, string, string, number][] = [
    [
      /prelaunch_test_account_required/,
      "prelaunch_test_account_required",
      "This live order check is available only to the approved, verified test account.",
      403,
    ],
    [
      /permission|unauthori|forbidden|access_denied/,
      "not_permitted",
      "This account cannot collect payments for this kitchen.",
      403,
    ],
    [
      /registration_required|customer_unavailable|verification_required/,
      "registration_required",
      "Sign in and finish your verified member account before paying.",
      401,
    ],
    [
      /guest_window_closed|outside_opening_hours/,
      "ordering_closed",
      "New payments are closed. Existing payment confirmations will still update.",
      403,
    ],
    [
      /guest_session|guest_unavailable/,
      "guest_session_expired",
      "Your guest session has expired. Continue as a guest during opening hours or sign in.",
      401,
    ],
    [
      /already_paid/,
      "already_paid",
      "This order is already paid. Refresh its payment status.",
      409,
    ],
    [
      /quote_expired|price_changed|offer_changed/,
      "quote_changed",
      "The total has changed or expired. Review a fresh kitchen total.",
      409,
    ],
    [
      /funding_expired|payment_deadline|insufficient_lifetime|room_expired/,
      "payment_deadline",
      "The payment deadline is too close or has passed. Refresh the group status before starting another order.",
      409,
    ],
    [
      /claim|payment_in_progress|collection_pending|overlap|legacy_payment|funding_conflict/,
      "payment_in_progress",
      "A payment is already in progress for this balance. Check that payment before trying again.",
      409,
    ],
    [
      /attempt_conflict|immutable|idempotency/,
      "attempt_conflict",
      "This payment attempt belongs to a different request. Refresh the order.",
      409,
    ],
    [
      /refund_review|payment_hold|order_held|room_cancelled|order_cancelled/,
      "payment_on_hold",
      "This order needs payment review. No further payment can be collected.",
      409,
    ],
    [
      /invalid_share|invalid_token|share_unavailable|room_unavailable|order_unavailable|quote_unavailable|collection_unavailable/,
      "payment_not_found",
      "This payment link or order is unavailable in your session.",
      404,
    ],
    [
      /item_unavailable|modifier_unavailable|upgrade_unavailable|required_choice|invalid_selection|invalid_packing/,
      "menu_changed",
      "A dish, choice or packing allocation has changed. Review the order again.",
      409,
    ],
    [/retry_later|rate_limit/, "retry_later", "Please wait a moment before trying again.", 429],
  ];
  for (const [pattern, code, text, status] of cases)
    if (pattern.test(message)) return new CheckoutProblem(code, text, status);
  return paymentUnavailable();
}

export async function paymentRpc(client: SupabaseClient, name: string, params: PaymentJson) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw paymentDatabaseError(error);
  if (data === null || typeof data !== "object") throw paymentUnavailable();
  return data as PaymentJson;
}

export async function paymentRpcList(client: SupabaseClient, name: string, params: PaymentJson) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw paymentDatabaseError(error);
  if (!Array.isArray(data)) throw paymentUnavailable();
  return data as unknown[];
}

/** The token is verified with Auth; neither request JSON nor decoded JWT claims grant access. */
export async function verifiedPaymentUser(
  request: Request,
  client: SupabaseClient,
  requireStaffMfa = false,
) {
  const header = request.headers.get("Authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9._~-]{20,8192}$/.test(header))
    throw new CheckoutProblem("sign_in_required", "Sign in with your verified account.", 401);
  const { data, error } = await client.auth.getUser(header.slice(7));
  if (
    error ||
    !data.user?.email_confirmed_at ||
    data.user.is_anonymous ||
    !data.user.email ||
    !z.uuid().safeParse(data.user.id).success
  )
    throw new CheckoutProblem("verification_required", "Sign in with your verified account.", 401);
  if (requireStaffMfa && data.user.factors?.some((factor) => factor.status === "verified")) {
    const verified = await client.auth.getClaims(header.slice(7));
    if (verified.error || verified.data?.claims["aal"] !== "aal2")
      throw new CheckoutProblem(
        "mfa_required",
        "Complete your staff account's two-step verification before collecting payments.",
        403,
      );
  }
  return data.user.id;
}

/** A supplied member token never falls back to a guest identity. */
export async function paymentIdentity(
  request: Request,
  clients: PaymentClients,
  required = false,
): Promise<PaymentIdentity> {
  if (request.headers.has("Authorization"))
    return {
      customerId: await verifiedPaymentUser(request, clients.publicClient),
      guestTokenHash: null,
    };
  const token = readGuestToken(request.headers.get("Cookie"));
  if (token) {
    const hash = guestTokenHash(token);
    const { data, error } = await clients.service.rpc("mealdeck_resolve_guest_session", {
      p_tenant: clients.config.tenantId,
      p_location: clients.config.locationId,
      p_token_hash: hash,
    });
    if (error) throw paymentDatabaseError(error);
    if (data !== null && typeof data === "object")
      return { customerId: null, guestTokenHash: hash };
  }
  if (required)
    throw new CheckoutProblem(
      "registration_required",
      "Sign in or continue as a guest during opening hours before paying.",
      401,
    );
  return { customerId: null, guestTokenHash: null };
}

export function paymentIdentityParams(identity: PaymentIdentity) {
  return { p_customer: identity.customerId, p_guest_token_hash: identity.guestTokenHash };
}

export function requirePaymentOrigin(request: Request, nativeBearerAllowed = false) {
  const origin = request.headers.get("Origin");
  const expected = new URL(request.url).origin;
  if (
    (origin !== expected &&
      !(nativeBearerAllowed && !origin && request.headers.has("Authorization"))) ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    throw new CheckoutProblem("invalid_origin", "Open MealDeck directly and try again.", 403);
}

export async function readPaymentInput(request: Request, limit = 200_000): Promise<PaymentJson> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
    throw new CheckoutProblem("invalid_request", "Use a JSON request.", 415);
  if (Number(request.headers.get("Content-Length") ?? 0) > limit)
    throw new CheckoutProblem("request_too_large", "This request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new CheckoutProblem("invalid_request", "Check your request.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > limit) {
      await reader.cancel();
      throw new CheckoutProblem("request_too_large", "This request is too large.", 413);
    }
    chunks.push(part.value);
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as PaymentJson;
  } catch {
    throw new CheckoutProblem("invalid_request", "Check your request.");
  }
}

export function paymentErrorResponse(error: unknown) {
  const problem = error instanceof CheckoutProblem ? error : paymentUnavailable();
  return Response.json(
    { error: problem.code, message: problem.message },
    {
      status: problem.status,
      headers: PAYMENT_NO_STORE,
    },
  );
}
