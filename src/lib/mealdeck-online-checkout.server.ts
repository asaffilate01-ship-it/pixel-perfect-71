import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  readMealDeckCheckoutServerKey,
  readMealDeckRuntimeConfig,
  type MealDeckRuntimeEnv,
} from "./mealdeck-runtime-config";
import {
  CheckoutProblem,
  checkoutPayInput,
  checkoutReceiptInput,
  normaliseCheckoutSelection,
} from "./mealdeck-checkout-selection";
import {
  parseOpeningOffer,
  unscheduledOpeningOffer,
  type MealDeckOpeningOffer,
} from "./mealdeck-opening-offer";
import {
  readMealDeckStripeConfig,
  safeStripeCheckoutUrl,
  stripeRequest,
  stripeSessionParameters,
  verifiedStripeEvent,
  verifyStripeAccount,
  type PreparedStripeOrder,
} from "./mealdeck-stripe.server";

type Json = Record<string, unknown>;
const object = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const NO_STORE = {
  "Cache-Control": "no-store, private",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
};

function databaseClients(env: MealDeckRuntimeEnv, fetcher: typeof fetch) {
  const config = readMealDeckRuntimeConfig(env, "luton");
  if (!config) return null;
  const key = readMealDeckCheckoutServerKey(env, config);
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher },
  };
  return {
    config,
    publicClient: createClient(config.url, config.anonKey, options),
    service: key ? createClient(config.url, key, options) : null,
  };
}

function backendProblem(error: unknown): CheckoutProblem {
  const message = String(object(error)["message"] ?? "");
  const known: [RegExp, string, string, number][] = [
    [
      /handoff_capacity/,
      "kitchen_at_capacity",
      "This kitchen cannot accept another order right now. Your basket is unchanged. Please try again later.",
      503,
    ],
    [
      /registration_required/,
      "registration_required",
      "Register and verify your email before paying.",
      401,
    ],
    [
      /vehicle_required/,
      "vehicle_required",
      "Enter the car make, colour and last 4 registration characters.",
      400,
    ],
    [
      /price_changed|offer_changed|quote_expired/,
      "quote_changed",
      "Your total needs updating. Review a fresh total before paying.",
      409,
    ],
    [
      /already_paid/,
      "already_paid",
      "This order is already paid. Open your order confirmation.",
      409,
    ],
    [
      /session_expired/,
      "session_expired",
      "This payment session expired. Review your basket to start again.",
      409,
    ],
    [
      /attempt_conflict/,
      "attempt_conflict",
      "This checkout attempt belongs to another basket. Review your order again.",
      409,
    ],
    [
      /item_unavailable|modifier_unavailable|upgrade_unavailable|required_choice/,
      "menu_changed",
      "A dish or choice has changed. Please review your basket.",
      409,
    ],
    [/retry_later/, "retry_later", "Please wait a moment before reviewing another total.", 429],
    [
      /order_unavailable|quote_unavailable/,
      "order_unavailable",
      "We couldn't find that order in your account.",
      404,
    ],
  ];
  for (const [pattern, code, text, status] of known)
    if (pattern.test(message)) return new CheckoutProblem(code, text, status);
  return new CheckoutProblem(
    "checkout_unavailable",
    "Ordering is being prepared. Your basket is safe — please try again shortly.",
    503,
  );
}

async function rpc(client: SupabaseClient, name: string, params: Json) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw backendProblem(error);
  if (!data || typeof data !== "object") throw backendProblem({});
  return data as Json;
}

async function verifiedCustomer(request: Request, client: SupabaseClient) {
  const header = request.headers.get("Authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9._~-]{20,8192}$/.test(header))
    throw new CheckoutProblem(
      "registration_required",
      "Register and verify your email to continue.",
      401,
    );
  const token = header.slice(7);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.email_confirmed_at || data.user.is_anonymous || !data.user.email)
    throw new CheckoutProblem(
      "verification_required",
      "Sign in with your verified email to continue.",
      401,
    );
  // Each database write independently rechecks the profile and auth.users record.
  return data.user.id;
}

async function readBoundedBody(request: Request, limit: number) {
  if (Number(request.headers.get("Content-Length") ?? 0) > limit)
    throw new CheckoutProblem("request_too_large", "The request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new CheckoutProblem("request_too_large", "The request is too large.", 413);
    }
    chunks.push(value);
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(output);
}

export type MealDeckOnlineCheckoutStatus = {
  available: boolean;
  fulfilments: ["pickup", "curbside"];
  openingOffer: MealDeckOpeningOffer;
};

export async function readOnlineCheckoutStatus(
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
): Promise<MealDeckOnlineCheckoutStatus> {
  const base: MealDeckOnlineCheckoutStatus = {
    available: false,
    fulfilments: ["pickup", "curbside"],
    openingOffer: unscheduledOpeningOffer(),
  };
  const clients = databaseClients(env, fetcher);
  if (!clients) return base;
  try {
    const state = await rpc(clients.publicClient, "mealdeck_online_checkout_status", {
      p_tenant: clients.config.tenantId,
      p_location: clients.config.locationId,
    });
    const openingOffer = parseOpeningOffer(state["openingOffer"]);
    if (!openingOffer) return base;
    return {
      ...base,
      openingOffer,
      available:
        state["channelOpen"] === true &&
        clients.service !== null &&
        env["MEALDECK_ONLINE_CHECKOUT_ENABLED"] === "true" &&
        env["MEALDECK_CHECKOUT_INTEGRATION_APPROVED"] === "signed-off" &&
        readMealDeckStripeConfig(env) !== null,
    };
  } catch {
    return base;
  }
}

export async function handleOnlineCheckoutRequest(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
) {
  try {
    if (request.method === "GET")
      return Response.json(await readOnlineCheckoutStatus(env, fetcher), { headers: NO_STORE });
    if (request.method !== "POST")
      return Response.json({ error: "method_not_allowed" }, { status: 405, headers: NO_STORE });
    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new CheckoutProblem("invalid_origin", "Refresh MealDeck and try again.", 403);
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
      throw new CheckoutProblem("invalid_request", "Use a JSON request.", 415);
    let input: unknown;
    try {
      input = JSON.parse(await readBoundedBody(request, 200_000));
    } catch (error) {
      if (error instanceof CheckoutProblem) throw error;
      throw new CheckoutProblem("invalid_request", "Please review your order.");
    }
    const clients = databaseClients(env, fetcher);
    if (!clients?.service) throw backendProblem({});
    const customerId = await verifiedCustomer(request, clients.publicClient);
    const action = object(input)["action"];
    // Receipt polling remains available if the operator closes ordering later.
    if (action === "receipt") {
      const parsed = checkoutReceiptInput.safeParse(input);
      if (!parsed.success)
        throw new CheckoutProblem("invalid_request", "Check your order reference.");
      const receipt = await rpc(clients.service, "mealdeck_customer_order_receipt", {
        p_order: parsed.data.orderId,
        p_customer: customerId,
      });
      return Response.json({ receipt }, { headers: NO_STORE });
    }
    const stripe = readMealDeckStripeConfig(env);
    if (
      !stripe ||
      env["MEALDECK_ONLINE_CHECKOUT_ENABLED"] !== "true" ||
      env["MEALDECK_CHECKOUT_INTEGRATION_APPROVED"] !== "signed-off"
    )
      throw backendProblem({});
    if (action === "quote") {
      const selection = normaliseCheckoutSelection(input, clients.config.tenantId);
      const quote = await rpc(clients.service, "mealdeck_create_checkout_quote", {
        p_tenant: clients.config.tenantId,
        p_location: clients.config.locationId,
        p_customer: customerId,
        p_fulfilment: selection.fulfilment,
        p_vehicle: selection.vehicle,
        p_selection: selection.lines,
        p_request_hash: selection.requestHash,
        p_packing: selection.packingPlan,
      });
      return Response.json({ quote }, { headers: NO_STORE });
    }
    const parsed = checkoutPayInput.safeParse(input);
    if (!parsed.success)
      throw new CheckoutProblem("invalid_request", "Please review your order before paying.");
    await verifyStripeAccount(stripe, fetcher);
    const prepared = await rpc(clients.service, "mealdeck_prepare_stripe_order", {
      p_quote: parsed.data.quoteId,
      p_customer: customerId,
      p_attempt: parsed.data.attemptId,
      p_stripe_account: stripe.accountId,
      p_livemode: stripe.livemode,
    });
    if (!z.uuid().safeParse(prepared["orderId"]).success || !Array.isArray(prepared["lines"]))
      throw backendProblem({});
    const order = prepared as unknown as PreparedStripeOrder;
    let url = safeStripeCheckoutUrl(order.sessionUrl);
    if (!url) {
      const session = await stripeRequest(stripe, "checkout/sessions", fetcher, {
        body: stripeSessionParameters(order),
        idempotencyKey: "mealdeck-order-" + order.orderId,
      });
      url = safeStripeCheckoutUrl(session["url"]);
      if (
        !url ||
        typeof session["id"] !== "string" ||
        session["livemode"] !== stripe.livemode ||
        session["client_reference_id"] !== order.orderId ||
        session["amount_total"] !== order.totalPence ||
        session["currency"] !== "gbp" ||
        session["payment_status"] !== "unpaid"
      )
        throw backendProblem({});
      const { error } = await clients.service.rpc("mealdeck_bind_stripe_session", {
        p_order: order.orderId,
        p_session: session["id"],
        p_url: url,
        p_account: stripe.accountId,
        p_livemode: stripe.livemode,
      });
      if (error) throw backendProblem(error);
    }
    return Response.json({ checkoutUrl: url, orderId: order.orderId }, { headers: NO_STORE });
  } catch (error) {
    const problem = error instanceof CheckoutProblem ? error : backendProblem({});
    return Response.json(
      { error: problem.code, message: problem.message },
      { status: problem.status, headers: NO_STORE },
    );
  }
}

export async function handleMealDeckStripeWebhook(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
) {
  try {
    if (request.method !== "POST")
      return Response.json({ error: "method_not_allowed" }, { status: 405, headers: NO_STORE });
    const stripe = readMealDeckStripeConfig(env);
    const clients = databaseClients(env, fetcher);
    if (!stripe || !clients?.service)
      throw new CheckoutProblem("webhook_unconfigured", "Webhook unavailable.", 503);
    const event = await verifiedStripeEvent(
      await readBoundedBody(request, 1_000_000),
      request.headers.get("Stripe-Signature"),
      stripe,
      fetcher,
    );
    if (event) await rpc(clients.service, "mealdeck_reconcile_stripe_event", event);
    // Webhooks stay active after checkout closes, so paid/refunded orders reconcile.
    return Response.json({ received: true }, { headers: NO_STORE });
  } catch (error) {
    const problem =
      error instanceof CheckoutProblem
        ? error
        : new CheckoutProblem("webhook_retry", "Please retry.", 503);
    return Response.json({ error: problem.code }, { status: problem.status, headers: NO_STORE });
  }
}
