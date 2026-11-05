import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { CheckoutProblem } from "./mealdeck-checkout-selection";
import type { MealDeckRuntimeEnv } from "./mealdeck-runtime-config";

/** Pinned to the current stable API verified in Stripe's official reference. */
export const MEALDECK_STRIPE_API_VERSION = "2026-10-28.endive";
export type MealDeckStripeConfig = {
  secretKey: string;
  webhookSecret: string;
  accountId: string;
  livemode: boolean;
};
type Json = Record<string, unknown>;

export function readMealDeckStripeConfig(env: MealDeckRuntimeEnv): MealDeckStripeConfig | null {
  const secretKey = env["MEALDECK_STRIPE_SECRET_KEY"]?.trim();
  const webhookSecret = env["MEALDECK_STRIPE_WEBHOOK_SECRET"]?.trim();
  const accountId = env["MEALDECK_STRIPE_ACCOUNT_ID"]?.trim();
  const mode = env["MEALDECK_STRIPE_MODE"];
  if (
    !secretKey ||
    !/^sk_(test|live)_[A-Za-z0-9]{16,512}$/.test(secretKey) ||
    !webhookSecret ||
    !/^whsec_[A-Za-z0-9]{16,512}$/.test(webhookSecret) ||
    !accountId ||
    !/^acct_[A-Za-z0-9]+$/.test(accountId) ||
    !["test", "live"].includes(mode ?? "") ||
    !secretKey.startsWith("sk_" + mode + "_")
  )
    return null;
  return { secretKey, webhookSecret, accountId, livemode: mode === "live" };
}

export function safeStripeCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 5000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "checkout.stripe.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith("/c/pay/")
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export async function stripeRequest(
  config: MealDeckStripeConfig,
  path: string,
  fetcher: typeof fetch,
  options?: { body: URLSearchParams; idempotencyKey: string },
): Promise<Json> {
  const response = await fetcher("https://api.stripe.com/v1/" + path, {
    method: options ? "POST" : "GET",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: "Bearer " + config.secretKey,
      "Stripe-Version": MEALDECK_STRIPE_API_VERSION,
      ...(options
        ? {
            "Content-Type": "application/x-www-form-urlencoded",
            "Idempotency-Key": options.idempotencyKey,
          }
        : {}),
    },
    ...(options ? { body: options.body.toString() } : {}),
  });
  if (!response.ok)
    throw new CheckoutProblem(
      "payment_service_unavailable",
      "Secure payment is temporarily unavailable. Please try again.",
      503,
    );
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new CheckoutProblem(
      "invalid_provider_response",
      "We couldn't verify the payment response.",
      503,
    );
  return result as Json;
}

export async function verifyStripeAccount(
  config: MealDeckStripeConfig,
  fetcher: typeof fetch,
  requireNewCharges = true,
) {
  const account = await stripeRequest(config, "account", fetcher);
  if (
    account["id"] !== config.accountId ||
    (requireNewCharges && account["charges_enabled"] !== true)
  )
    throw new CheckoutProblem(
      "payment_account_unavailable",
      "Payments are not available yet.",
      503,
    );
}

export type PreparedStripeOrder = {
  orderId: string;
  quoteId: string;
  totalPence: number;
  grossPence: number;
  discountPence: number;
  currency: "gbp";
  email: string;
  fulfilment: "pickup" | "curbside";
  sessionId: string | null;
  sessionUrl: string | null;
  expiresAt: string;
  lines: { name: string; quantity: number; line_pence: number }[];
  requestHash: string;
};

export function stripeSessionParameters(order: PreparedStripeOrder) {
  if (
    !Number.isSafeInteger(order.totalPence) ||
    order.totalPence <= 0 ||
    order.currency !== "gbp" ||
    !Number.isFinite(Date.parse(order.expiresAt))
  )
    throw new CheckoutProblem("invalid_order", "Please refresh your order total.", 409);
  const origin = "https://mealdeck.co.uk";
  const body = new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    "payment_method_options[card][request_three_d_secure]": "automatic",
    customer_email: order.email,
    client_reference_id: order.orderId,
    success_url: origin + "/checkout?order=" + order.orderId,
    cancel_url: origin + "/checkout?order=" + order.orderId + "&cancelled=1",
    expires_at: String(Math.floor(Date.parse(order.expiresAt) / 1000)),
    "line_items[0][price_data][currency]": "gbp",
    "line_items[0][price_data][unit_amount]": String(order.totalPence),
    "line_items[0][price_data][product_data][name]":
      "MealDeck · Luton " + (order.fulfilment === "curbside" ? "kerbside pickup" : "collection"),
    "line_items[0][price_data][product_data][description]": [
      order.lines.map((line) => line.quantity + " × " + line.name).join("; "),
      order.discountPence > 0 ? "Opening weekend: 30% off everything included in this total." : "",
    ]
      .filter(Boolean)
      .join(". ")
      .slice(0, 500),
    "line_items[0][quantity]": "1",
    "custom_text[submit][message]":
      "MealDeck is a trading name of 313 Brands Ltd. " +
      (order.fulfilment === "curbside" ? "Kerbside pickup in Luton." : "Collection in Luton."),
  });
  // Hosted Checkout presents Apple Pay / Google Pay when supported by the
  // customer's device and Stripe account. It is never a bespoke Samsung button.
  // No shipping_address_collection or required billing_address_collection for pickup.
  for (const [key, value] of Object.entries({
    mealdeck_order_id: order.orderId,
    mealdeck_quote_id: order.quoteId,
    mealdeck_request_hash: order.requestHash,
    source: "mealdeck",
  })) {
    body.set("metadata[" + key + "]", value);
    body.set("payment_intent_data[metadata][" + key + "]", value);
  }
  return body;
}

export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  now = Date.now(),
) {
  if (!header || header.length > 4096 || !secret.startsWith("whsec_")) return false;
  const parts = header.split(",").map((part) => part.trim().split("=", 2));
  const timestamps = parts.filter(([key]) => key === "t").map(([, value]) => value);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (timestamps.length !== 1 || !/^\d{10,12}$/.test(timestamps[0] ?? "")) return false;
  const timestamp = Number(timestamps[0]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(now / 1000) - timestamp) > 300)
    return false;
  const expected = createHmac("sha256", secret)
    .update(timestamp + "." + rawBody)
    .digest();
  return signatures.some(
    (value) =>
      typeof value === "string" &&
      /^[a-f0-9]{64}$/i.test(value) &&
      timingSafeEqual(expected, Buffer.from(value, "hex")),
  );
}

const supportedEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
]);
const object = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const id = (value: unknown) => (typeof value === "string" ? value : object(value)["id"]);
const providerId = (value: unknown, prefix: string) =>
  typeof value === "string" && new RegExp("^" + prefix + "[A-Za-z0-9_]+$").test(value);

/** Authenticates the event and independently reads provider state before database reconciliation. */
export async function verifiedStripeEvent(
  rawBody: string,
  signature: string | null,
  config: MealDeckStripeConfig,
  fetcher: typeof fetch,
) {
  if (!verifyStripeSignature(rawBody, signature, config.webhookSecret))
    throw new CheckoutProblem("invalid_signature", "Invalid webhook signature.", 400);
  let event: Json;
  try {
    event = object(JSON.parse(rawBody));
  } catch {
    throw new CheckoutProblem("invalid_event", "Invalid event.");
  }
  if (!providerId(event["id"], "evt_") || typeof event["type"] !== "string")
    throw new CheckoutProblem("invalid_event", "Invalid event.");
  if (
    event["livemode"] !== config.livemode ||
    (event["account"] != null && event["account"] !== config.accountId)
  )
    throw new CheckoutProblem("wrong_payment_account", "Event account mismatch.", 400);
  if (!supportedEvents.has(event["type"])) return null;
  await verifyStripeAccount(config, fetcher, false);
  const trusted = await stripeRequest(config, "events/" + event["id"], fetcher);
  if (
    trusted["id"] !== event["id"] ||
    trusted["type"] !== event["type"] ||
    trusted["livemode"] !== config.livemode
  )
    throw new CheckoutProblem("event_mismatch", "Event mismatch.", 400);
  const resource = object(object(trusted["data"])["object"]);
  let session: Json;
  if (String(trusted["type"]).startsWith("checkout.session.")) {
    if (!providerId(resource["id"], "cs_"))
      throw new CheckoutProblem("invalid_session", "Invalid session.");
    session = await stripeRequest(
      config,
      "checkout/sessions/" + resource["id"] + "?expand[]=payment_intent.latest_charge",
      fetcher,
    );
  } else {
    let intentId = id(resource["payment_intent"]);
    if (!intentId && providerId(id(resource["charge"]), "ch_")) {
      const charge = await stripeRequest(config, "charges/" + id(resource["charge"]), fetcher);
      intentId = id(charge["payment_intent"]);
    }
    if (!providerId(intentId, "pi_"))
      throw new CheckoutProblem("invalid_intent", "Invalid payment reference.");
    const sessions = await stripeRequest(
      config,
      "checkout/sessions?payment_intent=" + intentId + "&limit=2",
      fetcher,
    );
    const list = sessions["data"];
    if (!Array.isArray(list) || list.length !== 1 || !providerId(object(list[0])["id"], "cs_"))
      return null;
    session = await stripeRequest(
      config,
      "checkout/sessions/" + object(list[0])["id"] + "?expand[]=payment_intent.latest_charge",
      fetcher,
    );
  }
  const metadata = object(session["metadata"]);
  // Other legitimate Stripe activity on the merchant account is not MealDeck.
  if (metadata["source"] !== "mealdeck") return null;
  const intent = object(session["payment_intent"]);
  const charge = object(intent["latest_charge"]);
  const intentMetadata = object(intent["metadata"]);
  const orderId = metadata["mealdeck_order_id"];
  if (
    typeof orderId !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(orderId) ||
    session["mode"] !== "payment" ||
    session["status"] !== "complete" ||
    session["payment_status"] !== "paid" ||
    session["livemode"] !== config.livemode ||
    intent["livemode"] !== config.livemode ||
    charge["livemode"] !== config.livemode ||
    session["client_reference_id"] !== orderId ||
    intentMetadata["mealdeck_order_id"] !== orderId ||
    intentMetadata["source"] !== "mealdeck" ||
    metadata["mealdeck_quote_id"] !== intentMetadata["mealdeck_quote_id"] ||
    metadata["mealdeck_request_hash"] !== intentMetadata["mealdeck_request_hash"] ||
    intent["status"] !== "succeeded" ||
    charge["paid"] !== true ||
    charge["captured"] !== true ||
    charge["status"] !== "succeeded" ||
    session["currency"] !== "gbp" ||
    intent["currency"] !== "gbp" ||
    charge["currency"] !== "gbp" ||
    !Number.isSafeInteger(session["amount_total"]) ||
    (session["amount_total"] as number) <= 0 ||
    session["amount_total"] !== intent["amount_received"] ||
    intent["amount_received"] !== charge["amount"] ||
    charge["amount_captured"] !== session["amount_total"] ||
    !Number.isSafeInteger(charge["amount_refunded"]) ||
    !providerId(intent["id"], "pi_") ||
    !providerId(session["id"], "cs_")
  )
    throw new CheckoutProblem("payment_not_verified", "The payment could not be verified.", 503);
  return {
    p_event: trusted["id"],
    p_hash: createHash("sha256").update(JSON.stringify(trusted)).digest("hex"),
    p_type: trusted["type"],
    p_order: orderId,
    p_session: session["id"],
    p_intent: intent["id"],
    p_account: config.accountId,
    p_livemode: config.livemode,
    p_currency: "gbp",
    p_captured: intent["amount_received"],
    p_refunded: charge["amount_refunded"],
    p_disputed: charge["disputed"] === true || trusted["type"] === "charge.dispute.created",
  };
}
