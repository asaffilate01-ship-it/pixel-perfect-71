import { createHash } from "node:crypto";
import { z } from "zod";
import { CheckoutProblem } from "./mealdeck-checkout-selection";
import {
  paymentObject,
  paymentRpc,
  paymentUnavailable,
  type PaymentClients,
  type PaymentJson,
} from "./mealdeck-payment-server-core";
import {
  safeStripeCheckoutUrl,
  stripeRequest,
  verifyStripeAccount,
  verifyStripeSignature,
  type MealDeckStripeConfig,
} from "./mealdeck-stripe.server";

const identifier = (prefix: string) =>
  z
    .string()
    .regex(new RegExp("^" + prefix + "[A-Za-z0-9_]+$"))
    .max(255);
const sessionId = identifier("cs_");
const intentId = identifier("pi_");
const instant = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const collectionSchema = z.object({
  collectionId: z.uuid(),
  attemptId: z.uuid(),
  orderId: z.uuid(),
  quoteId: z.uuid(),
  roomId: z.uuid().nullable(),
  tenantId: z.uuid(),
  locationId: z.uuid(),
  method: z.enum(["checkout", "terminal"]),
  amountPence: z.number().int().positive().max(99_999_999),
  currency: z.literal("gbp"),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  stripeAccount: identifier("acct_"),
  livemode: z.boolean(),
  status: z.enum(["reserved", "pending", "paid", "cancelled", "refund_review"]),
  shareIds: z.array(z.uuid()).min(1).max(10),
  sessionId: sessionId.nullable(),
  sessionUrl: z.string().nullable(),
  paymentIntentId: intentId.nullable(),
  expiresAt: instant,
  email: z.string().email().nullable(),
  terminalLocationId: identifier("tml_").nullable(),
  cancelRequested: z.boolean(),
  coverRemaining: z.boolean(),
  requestShareId: z.uuid().nullable(),
});
export type PaymentCollection = z.infer<typeof collectionSchema>;

export function parsePaymentCollection(value: unknown): PaymentCollection {
  const result = collectionSchema.safeParse(value);
  if (!result.success)
    throw paymentUnavailable("The saved payment could not be verified. Please refresh its status.");
  return result.data;
}

function mismatch(): never {
  throw new CheckoutProblem(
    "payment_not_verified",
    "The payment could not be verified. No new charge has been requested.",
    503,
  );
}

function resourceId(value: unknown): unknown {
  return typeof value === "string" ? value : paymentObject(value)["id"];
}

function checkScope(
  collection: PaymentCollection,
  clients: PaymentClients,
  stripe: MealDeckStripeConfig,
) {
  if (
    collection.tenantId !== clients.config.tenantId ||
    collection.locationId !== clients.config.locationId ||
    collection.stripeAccount !== stripe.accountId ||
    collection.livemode !== stripe.livemode
  )
    mismatch();
}

function requireRecoverableCreation(collection: PaymentCollection) {
  // Stripe may prune API v1 idempotency keys after 24 hours. Creation retries
  // are limited to this claim's original, shorter lifetime; bound IDs remain
  // readable/cancellable after it. A local clock never releases the claim.
  if (Date.parse(collection.expiresAt) <= Date.now())
    throw new CheckoutProblem(
      "payment_recovery_required",
      "The original payment request has expired without a saved provider reference. Staff must check the provider before replacing this payment.",
      409,
    );
}

export async function loadPaymentCollection(
  clients: PaymentClients,
  stripe: MealDeckStripeConfig,
  collectionId: string,
): Promise<PaymentCollection> {
  if (!z.uuid().safeParse(collectionId).success) mismatch();
  const result = parsePaymentCollection(
    await paymentRpc(clients.service, "mealdeck_order_payment_collection", {
      p_collection: collectionId,
      p_account: stripe.accountId,
      p_livemode: stripe.livemode,
    }),
  );
  checkScope(result, clients, stripe);
  return result;
}

function metadata(collection: PaymentCollection) {
  return {
    source: "mealdeck",
    mealdeck_collection_id: collection.collectionId,
    mealdeck_order_id: collection.orderId,
    mealdeck_quote_id: collection.quoteId,
    mealdeck_request_hash: collection.requestHash,
    mealdeck_payment_method: collection.method,
    mealdeck_tenant_id: collection.tenantId,
    mealdeck_location_id: collection.locationId,
    ...(collection.terminalLocationId
      ? { mealdeck_terminal_location_id: collection.terminalLocationId }
      : {}),
  };
}

function checkMetadata(resource: PaymentJson, collection: PaymentCollection) {
  const actual = paymentObject(resource["metadata"]);
  for (const [key, value] of Object.entries(metadata(collection)))
    if (actual[key] !== value) mismatch();
}

/** All monetary values originate in the frozen server-priced claim. */
export function groupSessionParameters(collection: PaymentCollection) {
  if (collection.method !== "checkout" || !collection.roomId) mismatch();
  const body = new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    "payment_method_options[card][request_three_d_secure]": "automatic",
    client_reference_id: collection.orderId,
    success_url: "https://mealdeck.co.uk/group-pay?room=" + collection.roomId,
    cancel_url: "https://mealdeck.co.uk/group-pay?room=" + collection.roomId,
    expires_at: String(Math.floor(Date.parse(collection.expiresAt) / 1000)),
    "line_items[0][price_data][currency]": "gbp",
    "line_items[0][price_data][unit_amount]": String(collection.amountPence),
    "line_items[0][price_data][product_data][name]": "MealDeck · your group order contribution",
    "line_items[0][price_data][product_data][description]":
      "One group order for Luton collection or kerbside pickup. The kitchen receives the order after its full total is paid.",
    "line_items[0][quantity]": "1",
    "custom_text[submit][message]":
      "MealDeck is a trading name of 313 Brands Ltd. Your payment is linked to this group's saved order.",
  });
  if (collection.email) body.set("customer_email", collection.email);
  for (const [key, value] of Object.entries(metadata(collection))) {
    body.set("metadata[" + key + "]", value);
    body.set("payment_intent_data[metadata][" + key + "]", value);
  }
  return body;
}

export function terminalIntentParameters(collection: PaymentCollection) {
  if (collection.method !== "terminal" || !collection.terminalLocationId) mismatch();
  const body = new URLSearchParams({
    amount: String(collection.amountPence),
    currency: "gbp",
    "payment_method_types[0]": "card_present",
    capture_method: "automatic",
    description: "MealDeck · Luton collection payment",
  });
  for (const [key, value] of Object.entries(metadata(collection)))
    body.set("metadata[" + key + "]", value);
  return body;
}

function checkSession(session: PaymentJson, collection: PaymentCollection) {
  checkMetadata(session, collection);
  if (
    collection.method !== "checkout" ||
    !sessionId.safeParse(session["id"]).success ||
    (collection.sessionId && session["id"] !== collection.sessionId) ||
    session["livemode"] !== collection.livemode ||
    session["mode"] !== "payment" ||
    session["client_reference_id"] !== collection.orderId ||
    session["currency"] !== "gbp" ||
    session["amount_total"] !== collection.amountPence ||
    !["open", "complete", "expired"].includes(String(session["status"]))
  )
    mismatch();
}

function checkIntent(intent: PaymentJson, collection: PaymentCollection) {
  checkMetadata(intent, collection);
  const types = intent["payment_method_types"];
  if (
    !intentId.safeParse(intent["id"]).success ||
    (collection.paymentIntentId && intent["id"] !== collection.paymentIntentId) ||
    intent["livemode"] !== collection.livemode ||
    intent["currency"] !== "gbp" ||
    intent["amount"] !== collection.amountPence ||
    !Array.isArray(types) ||
    types.length !== 1 ||
    types[0] !== (collection.method === "terminal" ? "card_present" : "card") ||
    (collection.method === "terminal" && intent["capture_method"] !== "automatic")
  )
    mismatch();
}

async function bindCollection(
  clients: PaymentClients,
  stripe: MealDeckStripeConfig,
  collection: PaymentCollection,
  session: PaymentJson | null,
  intent: PaymentJson | null,
) {
  const bound = parsePaymentCollection(
    await paymentRpc(clients.service, "mealdeck_bind_order_payment", {
      p_collection: collection.collectionId,
      p_session: session ? session["id"] : null,
      p_intent: intent ? intent["id"] : (resourceId(session?.["payment_intent"]) ?? null),
      p_url: session
        ? (safeStripeCheckoutUrl(session["url"], stripe.checkoutDomain) ??
          safeStripeCheckoutUrl(collection.sessionUrl, stripe.checkoutDomain))
        : null,
      p_account: stripe.accountId,
      p_livemode: stripe.livemode,
    }),
  );
  checkScope(bound, clients, stripe);
  return bound;
}

/** The same frozen claim always uses the same Stripe idempotency key. */
export async function ensureCheckoutCollection(
  clients: PaymentClients,
  stripe: MealDeckStripeConfig,
  collection: PaymentCollection,
  fetcher: typeof fetch,
) {
  checkScope(collection, clients, stripe);
  if (collection.method !== "checkout") mismatch();
  if (stripe.checkoutDomain?.status === "invalid") throw paymentUnavailable();
  if (!collection.sessionId) requireRecoverableCreation(collection);
  let session = collection.sessionId
    ? await stripeRequest(
        stripe,
        "checkout/sessions/" + collection.sessionId + "?expand[]=payment_intent.latest_charge",
        fetcher,
      )
    : await stripeRequest(stripe, "checkout/sessions", fetcher, {
        body: groupSessionParameters(collection),
        idempotencyKey: "mealdeck-payment-" + collection.collectionId,
      });
  checkSession(session, collection);
  // An idempotent creation replay can return its original (open) response
  // after the real Session has completed or expired. Read its present state.
  if (!collection.sessionId) {
    session = await stripeRequest(
      stripe,
      "checkout/sessions/" + session["id"] + "?expand[]=payment_intent.latest_charge",
      fetcher,
    );
    checkSession(session, collection);
  }
  const intent = paymentObject(session["payment_intent"]);
  if (Object.keys(intent).length) checkIntent(intent, collection);
  let current = collection;
  if (!collection.sessionId && session["status"] === "open") {
    current = await bindCollection(clients, stripe, collection, session, null);
  } else if (!collection.sessionId) {
    // Completed/expired Sessions may no longer have a URL. Independently
    // verified reconciliation binds those IDs atomically in the ledger.
    await reconcileObservation(
      clients,
      stripe,
      collection,
      session,
      Object.keys(intent).length ? intent : null,
    );
    current = await loadPaymentCollection(clients, stripe, collection.collectionId);
  }
  const checkoutUrl =
    session["status"] === "open" &&
    session["payment_status"] === "unpaid" &&
    !current.cancelRequested &&
    Date.parse(current.expiresAt) > Date.now()
      ? safeStripeCheckoutUrl(session["url"], stripe.checkoutDomain)
      : null;
  if (
    session["status"] === "open" &&
    (!checkoutUrl || new URL(checkoutUrl).pathname !== "/c/pay/" + session["id"]) &&
    !current.cancelRequested &&
    Date.parse(current.expiresAt) > Date.now()
  )
    mismatch();
  return { collection: current, session, checkoutUrl };
}

export async function ensureTerminalCollection(
  clients: PaymentClients,
  stripe: MealDeckStripeConfig,
  collection: PaymentCollection,
  fetcher: typeof fetch,
) {
  checkScope(collection, clients, stripe);
  if (collection.method !== "terminal") mismatch();
  if (!collection.paymentIntentId) requireRecoverableCreation(collection);
  const intent = collection.paymentIntentId
    ? await stripeRequest(
        stripe,
        "payment_intents/" + collection.paymentIntentId + "?expand[]=latest_charge",
        fetcher,
      )
    : await stripeRequest(stripe, "payment_intents", fetcher, {
        body: terminalIntentParameters(collection),
        idempotencyKey: "mealdeck-payment-" + collection.collectionId,
      });
  checkIntent(intent, collection);
  return {
    collection: collection.paymentIntentId
      ? collection
      : await bindCollection(clients, stripe, collection, null, intent),
    intent,
  };
}

type ProviderObservation = {
  state: "collectable" | "processing" | "paid" | "cancelled" | "hold";
  captured: number;
  refunded: number;
  disputed: boolean;
  type: string | null;
};

/** A successful SDK result is deliberately not an input to this function. */
function inspectProviderState(
  collection: PaymentCollection,
  session: PaymentJson | null,
  intent: PaymentJson | null,
  sourceType?: string,
): ProviderObservation {
  if (session) checkSession(session, collection);
  if (intent) checkIntent(intent, collection);
  if (session && intent && resourceId(session["payment_intent"]) !== intent["id"]) mismatch();
  const charge = paymentObject(intent?.["latest_charge"]);
  const captured = intent?.["amount_received"] ?? 0;
  if (
    !Number.isSafeInteger(captured) ||
    (captured as number) < 0 ||
    ((captured as number) !== 0 && captured !== collection.amountPence)
  )
    mismatch();
  if (captured === collection.amountPence) {
    const refunded = charge["amount_refunded"];
    if (
      !intent ||
      intent["status"] !== "succeeded" ||
      (session && (session["status"] !== "complete" || session["payment_status"] !== "paid")) ||
      !identifier("ch_").safeParse(charge["id"]).success ||
      resourceId(charge["payment_intent"]) !== intent["id"] ||
      charge["livemode"] !== collection.livemode ||
      charge["currency"] !== "gbp" ||
      charge["amount"] !== collection.amountPence ||
      charge["amount_captured"] !== collection.amountPence ||
      charge["paid"] !== true ||
      charge["captured"] !== true ||
      charge["status"] !== "succeeded" ||
      !Number.isSafeInteger(refunded) ||
      (refunded as number) < 0 ||
      (refunded as number) > collection.amountPence ||
      (collection.method === "terminal" &&
        paymentObject(charge["payment_method_details"])["type"] !== "card_present")
    )
      mismatch();
    const disputed = charge["disputed"] === true || sourceType === "charge.dispute.created";
    return {
      state: disputed || (refunded as number) > 0 ? "hold" : "paid",
      captured: collection.amountPence,
      refunded: refunded as number,
      disputed,
      type:
        sourceType &&
        ["charge.refunded", "charge.dispute.created", "charge.dispute.closed"].includes(sourceType)
          ? sourceType
          : collection.method === "checkout"
            ? "checkout.session.completed"
            : "payment_intent.succeeded",
    };
  }
  if (
    charge["paid"] === true ||
    charge["captured"] === true ||
    Number(charge["amount_captured"] ?? 0) > 0 ||
    Number(charge["amount_refunded"] ?? 0) > 0 ||
    intent?.["status"] === "succeeded"
  )
    mismatch();
  if (session?.["status"] === "expired" && session["payment_status"] === "unpaid")
    return {
      state: "cancelled",
      captured: 0,
      refunded: 0,
      disputed: false,
      type: "checkout.session.expired",
    };
  if (!session && intent?.["status"] === "canceled")
    return {
      state: "cancelled",
      captured: 0,
      refunded: 0,
      disputed: false,
      type: "payment_intent.canceled",
    };
  if (
    collection.method === "terminal" &&
    intent &&
    ["requires_payment_method", "requires_confirmation"].includes(String(intent["status"]))
  )
    return { state: "collectable", captured: 0, refunded: 0, disputed: false, type: null };
  return { state: "processing", captured: 0, refunded: 0, disputed: false, type: null };
}

async function reconcileObservation(
  clients: PaymentClients,
  stripe: MealDeckStripeConfig,
  collection: PaymentCollection,
  session: PaymentJson | null,
  intent: PaymentJson | null,
  evidence?: { id: string; hash: string; type: string },
) {
  const observation = inspectProviderState(collection, session, intent, evidence?.type);
  if (!observation.type) return observation;
  const payload = {
    collectionId: collection.collectionId,
    sessionId: session?.["id"] ?? null,
    intentId: intent?.["id"] ?? null,
    stripeAccount: stripe.accountId,
    livemode: stripe.livemode,
    ...observation,
  };
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  // If an older webhook now observes a later provider state, record the present
  // independently fetched observation rather than relabel the original event.
  const useEvent = evidence && evidence.type === observation.type;
  await paymentRpc(clients.service, "mealdeck_reconcile_order_payment", {
    p_event: useEvent ? evidence.id : "obs_" + hash,
    p_hash: useEvent ? evidence.hash : hash,
    p_type: observation.type,
    p_collection: collection.collectionId,
    p_order: collection.orderId,
    p_session: session?.["id"] ?? null,
    p_intent: intent?.["id"] ?? null,
    p_account: stripe.accountId,
    p_livemode: stripe.livemode,
    p_currency: "gbp",
    p_captured: observation.captured,
    p_refunded: observation.refunded,
    p_disputed: observation.disputed,
  });
  return observation;
}

export async function observeOrderPayment(
  clients: PaymentClients,
  stripe: MealDeckStripeConfig,
  collection: PaymentCollection,
  fetcher: typeof fetch,
) {
  checkScope(collection, clients, stripe);
  if (collection.method === "checkout") {
    if (!collection.sessionId)
      return {
        state: "processing" as const,
        captured: 0,
        refunded: 0,
        disputed: false,
        type: null,
      };
    const session = await stripeRequest(
      stripe,
      "checkout/sessions/" + collection.sessionId + "?expand[]=payment_intent.latest_charge",
      fetcher,
    );
    const intent =
      session["payment_intent"] === null ? null : paymentObject(session["payment_intent"]);
    return reconcileObservation(clients, stripe, collection, session, intent, undefined);
  }
  if (!collection.paymentIntentId) {
    // The immutable attempt can recover a lost create response within its
    // lifetime. Creating an unconfirmed PI never collects a customer's card.
    collection = (await ensureTerminalCollection(clients, stripe, collection, fetcher)).collection;
  }
  const intent = await stripeRequest(
    stripe,
    "payment_intents/" + collection.paymentIntentId + "?expand[]=latest_charge",
    fetcher,
  );
  return reconcileObservation(clients, stripe, collection, null, intent);
}

/** Mark cancellation in the DB first. Unknown provider outcomes keep claims locked. */
export async function cancelOrderCollection(
  clients: PaymentClients,
  stripe: MealDeckStripeConfig,
  original: PaymentCollection,
  fetcher: typeof fetch,
) {
  checkScope(original, clients, stripe);
  if (!original.cancelRequested) mismatch();
  let collection = original;
  if (collection.method === "checkout") {
    const prepared = await ensureCheckoutCollection(clients, stripe, collection, fetcher);
    collection = prepared.collection;
    if (prepared.session["status"] === "open") {
      try {
        await stripeRequest(
          stripe,
          "checkout/sessions/" + collection.sessionId + "/expire",
          fetcher,
          {
            body: new URLSearchParams(),
            idempotencyKey: "mealdeck-expire-" + collection.collectionId,
          },
        );
      } catch {
        /* A concurrent capture or network failure is resolved by the independent read below. */
      }
    }
  } else {
    const prepared = await ensureTerminalCollection(clients, stripe, collection, fetcher);
    collection = prepared.collection;
    if (
      [
        "requires_payment_method",
        "requires_confirmation",
        "requires_action",
        "requires_capture",
        "processing",
      ].includes(String(prepared.intent["status"]))
    ) {
      try {
        await stripeRequest(
          stripe,
          "payment_intents/" + collection.paymentIntentId + "/cancel",
          fetcher,
          {
            body: new URLSearchParams({ cancellation_reason: "requested_by_customer" }),
            idempotencyKey: "mealdeck-cancel-" + collection.collectionId,
          },
        );
      } catch {
        /* Never release a claim from a local cancellation result. */
      }
    }
  }
  return observeOrderPayment(clients, stripe, collection, fetcher);
}

const commonEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.canceled",
  "payment_intent.processing",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
]);

/** Returns false only when a valid event belongs to the existing legacy adapter. */
export async function reconcileOrderPaymentWebhook(
  raw: string,
  signature: string | null,
  clients: PaymentClients,
  stripe: MealDeckStripeConfig,
  fetcher: typeof fetch,
): Promise<boolean> {
  if (!verifyStripeSignature(raw, signature, stripe.webhookSecret))
    throw new CheckoutProblem("invalid_signature", "Invalid webhook signature.", 400);
  let event: PaymentJson;
  try {
    event = paymentObject(JSON.parse(raw));
  } catch {
    throw new CheckoutProblem("invalid_event", "Invalid event.", 400);
  }
  if (!identifier("evt_").safeParse(event["id"]).success || typeof event["type"] !== "string")
    throw new CheckoutProblem("invalid_event", "Invalid event.", 400);
  if (
    event["livemode"] !== stripe.livemode ||
    (event["account"] != null && event["account"] !== stripe.accountId)
  )
    throw new CheckoutProblem("wrong_payment_account", "Event account mismatch.", 400);
  if (!commonEvents.has(event["type"])) return false;
  await verifyStripeAccount(stripe, fetcher, false);
  const trusted = await stripeRequest(stripe, "events/" + event["id"], fetcher);
  if (
    trusted["id"] !== event["id"] ||
    trusted["type"] !== event["type"] ||
    trusted["livemode"] !== stripe.livemode ||
    (trusted["account"] != null && trusted["account"] !== stripe.accountId)
  )
    mismatch();
  const resource = paymentObject(paymentObject(trusted["data"])["object"]);
  let session: PaymentJson | null = null;
  let intent: PaymentJson | null = null;
  if (event["type"].startsWith("checkout.session.")) {
    if (!sessionId.safeParse(resource["id"]).success) mismatch();
    session = await stripeRequest(
      stripe,
      "checkout/sessions/" + resource["id"] + "?expand[]=payment_intent.latest_charge",
      fetcher,
    );
    if (resourceId(session) !== resourceId(resource)) mismatch();
    if (session["payment_intent"] != null) intent = paymentObject(session["payment_intent"]);
  } else {
    let paymentIntentId = event["type"].startsWith("payment_intent.")
      ? resource["id"]
      : resourceId(resource["payment_intent"]);
    if (!paymentIntentId && identifier("ch_").safeParse(resourceId(resource["charge"])).success) {
      const charge = await stripeRequest(
        stripe,
        "charges/" + resourceId(resource["charge"]),
        fetcher,
      );
      if (charge["id"] !== resourceId(resource["charge"])) mismatch();
      paymentIntentId = resourceId(charge["payment_intent"]);
    }
    if (!intentId.safeParse(paymentIntentId).success) mismatch();
    intent = await stripeRequest(
      stripe,
      "payment_intents/" + paymentIntentId + "?expand[]=latest_charge",
      fetcher,
    );
    if (intent["id"] !== paymentIntentId) mismatch();
  }
  const meta = paymentObject((session ?? intent)?.["metadata"]);
  if (meta["source"] !== "mealdeck" || meta["mealdeck_collection_id"] === undefined) return false;
  if (!z.uuid().safeParse(meta["mealdeck_collection_id"]).success) mismatch();
  const collection = await loadPaymentCollection(
    clients,
    stripe,
    meta["mealdeck_collection_id"] as string,
  );
  if (collection.method === "checkout" && !session) {
    if (!collection.sessionId) {
      const response = await stripeRequest(
        stripe,
        "checkout/sessions?payment_intent=" + intent?.["id"] + "&limit=2",
        fetcher,
      );
      const sessions = response["data"];
      if (
        !Array.isArray(sessions) ||
        sessions.length !== 1 ||
        !sessionId.safeParse(paymentObject(sessions[0])["id"]).success
      )
        mismatch();
      session = await stripeRequest(
        stripe,
        "checkout/sessions/" +
          paymentObject(sessions[0])["id"] +
          "?expand[]=payment_intent.latest_charge",
        fetcher,
      );
    } else {
      session = await stripeRequest(
        stripe,
        "checkout/sessions/" + collection.sessionId + "?expand[]=payment_intent.latest_charge",
        fetcher,
      );
    }
    if (resourceId(session["payment_intent"]) !== intent?.["id"]) mismatch();
    intent = paymentObject(session["payment_intent"]);
  }
  if (collection.method === "terminal" && session) mismatch();
  await reconcileObservation(clients, stripe, collection, session, intent, {
    id: trusted["id"] as string,
    hash: createHash("sha256").update(JSON.stringify(trusted)).digest("hex"),
    type: trusted["type"] as string,
  });
  return true;
}
