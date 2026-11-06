import { randomUUID } from "node:crypto";
import { z } from "zod";
import { orderNumberSchema } from "./mealdeck-order-number";
import { launchMenuBrands, LAUNCH_MENU_PRICE_REVISION } from "./launch-menu-catalogue";
import {
  CheckoutProblem,
  checkoutQuoteInput,
  normaliseCheckoutSelection,
} from "./mealdeck-checkout-selection";
import { kitchenAcceptsNewOrders, parseKitchenAvailability } from "./mealdeck-kitchen-availability";
import {
  cancelOrderCollection,
  ensureTerminalCollection,
  loadPaymentCollection,
  observeOrderPayment,
  parsePaymentCollection,
  type PaymentCollection,
} from "./mealdeck-order-payments-stripe.server";
import {
  createPaymentClients,
  PAYMENT_NO_STORE,
  paymentDatabaseError,
  paymentErrorResponse,
  paymentObject,
  paymentRpc,
  paymentUnavailable,
  readPaymentInput,
  requirePaymentOrigin,
  verifiedPaymentUser,
  type PaymentClients,
  type PaymentJson,
} from "./mealdeck-payment-server-core";
import { readMealDeckBackendConfig, type MealDeckRuntimeEnv } from "./mealdeck-runtime-config";
import {
  readMealDeckStripeConfig,
  stripeRequest,
  type MealDeckStripeConfig,
} from "./mealdeck-stripe.server";

const attemptRequest = (action: "prepare" | "reconcile" | "cancel") =>
  z
    .strictObject({
      action: z.literal(action),
      quoteId: z.uuid().optional(),
      orderId: z.uuid().optional(),
      attemptId: z.uuid(),
    })
    .refine((value) => Boolean(value.quoteId) !== Boolean(value.orderId));
const inputSchema = z.union([
  z.strictObject({ action: z.literal("bootstrap") }),
  z.strictObject({ action: z.literal("config") }),
  z.strictObject({ action: z.literal("connection_token") }),
  z.strictObject({ action: z.literal("catalogue") }),
  z.strictObject({
    action: z.literal("lookup"),
    reference: z.union([z.uuid(), z.string().regex(/^\d{4}$/)]),
  }),
  checkoutQuoteInput,
  attemptRequest("prepare"),
  attemptRequest("reconcile"),
  attemptRequest("cancel"),
]);

const pence = z.number().int().nonnegative().max(100_000_000);
const publicOrderSchema = z
  .object({
    orderId: z.uuid(),
    orderNumber: orderNumberSchema.nullable().optional(),
    handoffCode: z
      .string()
      .regex(/^\d{4}$/)
      .nullable(),
    fulfilment: z.enum(["pickup", "curbside"]),
    kitchenName: z.literal("MealDeck Luton"),
    currency: z.literal("gbp"),
    totalPence: pence,
    paidPence: pence,
    remainingPence: pence,
    status: z.enum(["unpaid", "processing", "paid", "hold", "cancelled"]),
    canCollect: z.boolean(),
    lines: z
      .array(
        z.object({
          name: z.string().min(1).max(240),
          quantity: z.number().int().min(1).max(600),
          linePence: pence,
          description: z.string().max(2000).optional(),
        }),
      )
      .min(1)
      .max(600),
    message: z.string().max(1000),
  })
  .refine((order) =>
    order.status === "hold"
      ? order.remainingPence === Math.max(0, order.totalPence - order.paidPence)
      : order.paidPence + order.remainingPence === order.totalPence,
  )
  .refine((order) => order.status !== "paid" || (order.remainingPence === 0 && !order.canCollect));
export type TerminalPublicOrder = z.infer<typeof publicOrderSchema>;

function terminalLocation(env: MealDeckRuntimeEnv) {
  const value = env["MEALDECK_STRIPE_TERMINAL_LOCATION_ID"]?.trim();
  return value && /^tml_[A-Za-z0-9]+$/.test(value) ? value : null;
}

function terminalConfigured(env: MealDeckRuntimeEnv, stripe: MealDeckStripeConfig | null) {
  return (
    stripe !== null &&
    terminalLocation(env) !== null &&
    env["MEALDECK_TERMINAL_ENABLED"] === "true" &&
    env["MEALDECK_TERMINAL_INTEGRATION_APPROVED"] === "signed-off" &&
    env["MEALDECK_CHECKOUT_INTEGRATION_APPROVED"] === "signed-off" &&
    !(stripe.livemode && env["MEALDECK_TERMINAL_SIMULATED"] === "true")
  );
}

async function terminalAdmission(clients: PaymentClients) {
  const raw = await paymentRpc(clients.publicClient, "mealdeck_online_checkout_status", {
    p_tenant: clients.config.tenantId,
    p_location: clients.config.locationId,
  });
  const kitchen = parseKitchenAvailability(raw["kitchen"]);
  return (
    raw["channelOpen"] === true &&
    kitchen !== null &&
    kitchen.collectionEstimateMinutes !== null &&
    kitchenAcceptsNewOrders(kitchen.state)
  );
}

async function verifyTerminalLocation(
  stripe: MealDeckStripeConfig,
  location: string,
  fetcher: typeof fetch,
  requireNewCharges: boolean,
) {
  const account = await stripeRequest(stripe, "account", fetcher);
  if (
    account["id"] !== stripe.accountId ||
    account["country"] !== "GB" ||
    (requireNewCharges && account["charges_enabled"] !== true)
  )
    throw paymentUnavailable("The Luton Stripe account is not ready for phone payments.");
  const place = await stripeRequest(stripe, "terminal/locations/" + location, fetcher);
  if (
    place["id"] !== location ||
    place["livemode"] !== stripe.livemode ||
    paymentObject(place["address"])["country"] !== "GB"
  )
    throw paymentUnavailable("The configured Stripe Terminal location could not be verified.");
}

function staffScope(actor: string, clients: PaymentClients) {
  return {
    p_actor: actor,
    p_tenant: clients.config.tenantId,
    p_location: clients.config.locationId,
  };
}

export function terminalOrderForApp(data: PaymentJson, ready: boolean): TerminalPublicOrder {
  const active = paymentObject(data["activeCollection"]);
  const held =
    data["held"] === true ||
    data["status"] === "refund_review" ||
    data["paymentStatus"] === "refunded";
  const paid = data["verifiedPaid"] === true;
  const cancelled = data["status"] === "cancelled";
  const pending =
    !paid && (data["onlinePaymentActive"] === true || Boolean(active["collectionId"]));
  const status = held
    ? "hold"
    : cancelled
      ? "cancelled"
      : paid
        ? "paid"
        : pending
          ? "processing"
          : "unpaid";
  const remaining = data["remainingPence"];
  const canCollect =
    ready &&
    !held &&
    !paid &&
    !cancelled &&
    typeof remaining === "number" &&
    remaining > 0 &&
    data["onlinePaymentActive"] !== true &&
    (Number(data["collectiblePence"]) > 0 ||
      (active["method"] === "terminal" &&
        active["cancelRequested"] === false &&
        ["reserved", "pending"].includes(String(active["status"])) &&
        Date.parse(String(active["expiresAt"])) > Date.now()));
  const lines = Array.isArray(data["lines"])
    ? data["lines"].map((value) => {
        const line = paymentObject(value);
        const description = Array.isArray(line["modifiers"])
          ? line["modifiers"]
              .map((entry) => paymentObject(entry)["name"])
              .filter((entry) => typeof entry === "string")
              .join(" · ")
          : "";
        return {
          name: line["name"],
          quantity: line["quantity"],
          linePence: line["line_pence"],
          ...(description ? { description } : {}),
        };
      })
    : [];
  const messages = {
    paid: "This order is paid. Do not collect another payment at pickup. Staff acceptance and preparation remain separate.",
    hold: "This order needs authorised payment or refund review. Do not collect another payment.",
    cancelled:
      "This order is cancelled. Check any payment still processing before starting a replacement order.",
    processing:
      data["onlinePaymentActive"] === true
        ? "An online payment already owns this balance. Let that payment finish or be safely cancelled before collecting on a phone."
        : "Resume or check the existing phone payment. Do not create a replacement charge while its result is unknown.",
    unpaid: ready
      ? "Review the order and outstanding amount before asking the customer to tap."
      : "New phone payments are currently unavailable. Existing payment results can still be checked.",
  };
  const parsed = publicOrderSchema.safeParse({
    orderId: data["orderId"],
    ...(data["orderNumber"] === undefined ? {} : { orderNumber: data["orderNumber"] }),
    handoffCode: data["displayCode"] ?? null,
    fulfilment: data["fulfilment"],
    kitchenName: "MealDeck Luton",
    currency: "gbp",
    totalPence: data["totalPence"],
    paidPence: data["paidPence"],
    remainingPence: remaining,
    status,
    canCollect,
    lines,
    message: messages[status],
  });
  if (!parsed.success)
    throw paymentUnavailable(
      "This order's payment balance could not be verified. No new charge has been requested.",
    );
  return parsed.data;
}

async function findStaffAttempt(clients: PaymentClients, actor: string, attemptId: string) {
  const { data, error } = await clients.service.rpc("mealdeck_terminal_payment_attempt", {
    ...staffScope(actor, clients),
    p_attempt: attemptId,
  });
  if (error) throw paymentDatabaseError(error);
  return data === null ? null : parsePaymentCollection(data);
}

function assertAttemptTarget(
  collection: PaymentCollection,
  input: { orderId?: string | undefined; quoteId?: string | undefined; attemptId: string },
) {
  if (
    collection.attemptId !== input.attemptId ||
    (input.orderId && collection.orderId !== input.orderId) ||
    (input.quoteId && collection.quoteId !== input.quoteId)
  )
    throw new CheckoutProblem(
      "attempt_conflict",
      "This payment attempt belongs to a different order. Check its saved status.",
      409,
    );
}

async function readStaffOrder(clients: PaymentClients, actor: string, reference: string) {
  return paymentRpc(clients.service, "mealdeck_terminal_order_status", {
    ...staffScope(actor, clients),
    p_reference: reference,
  });
}

function publicQuote(raw: PaymentJson) {
  const required = [
    "quoteId",
    "expiresAt",
    "grossPence",
    "discountPence",
    "totalPence",
    "collectionEstimateMinutes",
    "lines",
    "packingPlan",
  ];
  if (
    !z.uuid().safeParse(raw["quoteId"]).success ||
    !Number.isFinite(Date.parse(String(raw["expiresAt"]))) ||
    !pence.safeParse(raw["grossPence"]).success ||
    !pence.safeParse(raw["discountPence"]).success ||
    !pence.safeParse(raw["totalPence"]).success ||
    Number(raw["grossPence"]) - Number(raw["discountPence"]) !== raw["totalPence"] ||
    !Array.isArray(raw["lines"])
  )
    throw paymentUnavailable("The kitchen total could not be verified. Refresh the quote.");
  return Object.fromEntries(required.map((key) => [key, raw[key]]));
}

export async function handleTerminalRequest(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
) {
  try {
    if (request.method !== "POST")
      return Response.json(
        { error: "method_not_allowed" },
        { status: 405, headers: PAYMENT_NO_STORE },
      );
    const parsed = inputSchema.safeParse(await readPaymentInput(request));
    if (!parsed.success)
      throw new CheckoutProblem(
        "invalid_request",
        "Check the phone payment request and try again.",
      );
    const input = parsed.data;
    const respond = (value: unknown) => Response.json(value, { headers: PAYMENT_NO_STORE });
    if (input.action === "bootstrap") {
      const backend = readMealDeckBackendConfig(env);
      return respond({
        apiVersion: 1,
        auth:
          backend.status === "ready"
            ? { url: backend.backend.url, publishableKey: backend.backend.publishableKey }
            : null,
        message:
          backend.status === "ready"
            ? "Sign in with your authorised MealDeck staff account."
            : "The MealDeck staff connection is not configured yet.",
      });
    }
    requirePaymentOrigin(request, true);
    const clients = createPaymentClients(env, fetcher);
    if (!clients) throw paymentUnavailable("The MealDeck staff connection is not configured yet.");
    const actor = await verifiedPaymentUser(request, clients.publicClient, true);
    const authorization = await paymentRpc(
      clients.service,
      "mealdeck_terminal_authorize",
      staffScope(actor, clients),
    );
    if (
      authorization["authorized"] !== true ||
      authorization["tenantId"] !== clients.config.tenantId ||
      authorization["locationId"] !== clients.config.locationId
    )
      throw new CheckoutProblem(
        "not_permitted",
        "This staff account cannot collect payments for the Luton kitchen.",
        403,
      );
    const stripe = readMealDeckStripeConfig(env);
    const location = terminalLocation(env);
    const configured = terminalConfigured(env, stripe);
    // A closed or temporarily unreadable admission gate stops new sales only.
    // Staff can still inspect/cancel/reconcile previously saved provider attempts.
    let admission = false;
    if (configured) {
      try {
        admission = await terminalAdmission(clients);
      } catch {
        admission = false;
      }
    }
    if (input.action === "config") {
      let ready = admission;
      let reason: string | null = !configured
        ? "terminal_unconfigured"
        : !admission
          ? "kitchen_closed"
          : null;
      if (ready && stripe && location) {
        try {
          await verifyTerminalLocation(stripe, location, fetcher, true);
        } catch {
          ready = false;
          reason = "stripe_unavailable";
        }
      }
      return respond({
        ready,
        reason,
        message: ready
          ? "Phone payments are ready for this authorised Luton kitchen. Review the exact order before collecting."
          : "New phone payments are not ready. Saved orders and pending payment results can still be checked.",
        kitchen: { id: clients.config.locationId, name: "MealDeck Luton" },
        stripeLocationId: location,
        mode: stripe?.livemode ? "live" : "test",
        simulationAllowed:
          !!stripe && !stripe.livemode && env["MEALDECK_TERMINAL_SIMULATED"] === "true",
        canCreateSale: ready,
      });
    }
    if (input.action === "lookup")
      return respond({
        order: terminalOrderForApp(
          await readStaffOrder(clients, actor, input.reference),
          admission,
        ),
      });
    if (input.action === "catalogue")
      return respond({
        brands: launchMenuBrands,
        priceRevision: LAUNCH_MENU_PRICE_REVISION,
        notice:
          "Menu prices are for planning. Review the current kitchen total before collecting payment.",
      });
    if (input.action === "quote") {
      if (!admission)
        throw paymentUnavailable(
          "The kitchen is not accepting new phone payments. Existing payment results can still be checked.",
        );
      const selection = normaliseCheckoutSelection(input, clients.config.tenantId);
      return respond({
        quote: publicQuote(
          await paymentRpc(clients.service, "mealdeck_create_terminal_quote", {
            ...staffScope(actor, clients),
            p_fulfilment: selection.fulfilment,
            p_vehicle: selection.vehicle,
            p_selection: selection.lines,
            p_packing: selection.packingPlan,
            p_request_hash: selection.requestHash,
          }),
        ),
      });
    }
    if (!stripe || !location)
      throw paymentUnavailable(
        "Stripe Terminal is not configured. The saved payment has not been replaced.",
      );
    if (input.action === "connection_token") {
      if (!configured) throw paymentUnavailable("Phone payment activation has not been completed.");
      await verifyTerminalLocation(stripe, location, fetcher, false);
      const token = await stripeRequest(stripe, "terminal/connection_tokens", fetcher, {
        body: new URLSearchParams({ location }),
        idempotencyKey: "mealdeck-terminal-token-" + randomUUID(),
      });
      if (
        typeof token["secret"] !== "string" ||
        !/^pst_[A-Za-z0-9_-]{16,4096}$/.test(token["secret"])
      )
        throw paymentUnavailable();
      // Stripe's token location parameter scopes internet readers only. Tap to
      // Pay scope is additionally enforced by every staff/quote/claim RPC here.
      return respond({ secret: token["secret"] });
    }
    let collection = await findStaffAttempt(clients, actor, input.attemptId);
    if (collection) assertAttemptTarget(collection, input);
    if (input.action === "prepare" && !collection) {
      if (!admission)
        throw paymentUnavailable(
          "The kitchen is not accepting new phone payments. Existing payment results can still be checked.",
        );
      await verifyTerminalLocation(stripe, location, fetcher, true);
      collection = parsePaymentCollection(
        await paymentRpc(clients.service, "mealdeck_prepare_terminal_payment", {
          ...staffScope(actor, clients),
          p_quote: input.quoteId ?? null,
          p_order: input.orderId ?? null,
          p_attempt: input.attemptId,
          p_stripe_account: stripe.accountId,
          p_livemode: stripe.livemode,
          p_terminal_location: location,
        }),
      );
    } else {
      await verifyTerminalLocation(stripe, location, fetcher, false);
    }
    if (!collection)
      throw new CheckoutProblem(
        "attempt_not_found",
        "No payment has been reserved for this attempt. Review the order and retry the same saved attempt.",
        404,
      );
    assertAttemptTarget(collection, input);
    if (collection.terminalLocationId !== location)
      throw paymentUnavailable(
        "This payment belongs to a different Terminal location. Ask an administrator to check it.",
      );
    if (input.action === "cancel") {
      await paymentRpc(clients.service, "mealdeck_cancel_terminal_payment", {
        ...staffScope(actor, clients),
        p_collection: collection.collectionId,
      });
      collection = await loadPaymentCollection(clients, stripe, collection.collectionId);
      await cancelOrderCollection(clients, stripe, collection, fetcher);
    } else if (collection.cancelRequested) {
      await cancelOrderCollection(clients, stripe, collection, fetcher);
    } else if (input.action === "prepare") {
      // Recovery may repeat creation with the SAME provider idempotency key.
      // A network timeout never authorises a new payment amount or intent.
      collection = (await ensureTerminalCollection(clients, stripe, collection, fetcher))
        .collection;
      await observeOrderPayment(clients, stripe, collection, fetcher);
    } else {
      await observeOrderPayment(clients, stripe, collection, fetcher);
    }
    collection = await loadPaymentCollection(clients, stripe, collection.collectionId);
    const raw = await readStaffOrder(clients, actor, collection.orderId);
    const order = terminalOrderForApp(raw, admission);
    let action: "collect" | "reconcile" | "none" = "reconcile";
    let attemptStatus: "reserved" | "processing" | "succeeded" | "cancelled" | "hold" =
      "processing";
    let clientSecret: string | null = null;
    if (collection.status === "paid") {
      attemptStatus = "succeeded";
      action = "none";
    } else if (collection.status === "cancelled") {
      attemptStatus = "cancelled";
      action = "none";
    } else if (
      collection.status === "refund_review" ||
      order.status === "hold" ||
      order.status === "cancelled"
    ) {
      attemptStatus = "hold";
      action = "none";
    } else if (order.canCollect && !collection.cancelRequested && collection.paymentIntentId) {
      const prepared = await ensureTerminalCollection(clients, stripe, collection, fetcher);
      if (
        ["requires_payment_method", "requires_confirmation"].includes(
          String(prepared.intent["status"]),
        )
      ) {
        const secret = prepared.intent["client_secret"];
        if (
          typeof secret !== "string" ||
          !secret.startsWith(collection.paymentIntentId + "_secret_") ||
          secret.length > 500
        )
          throw paymentUnavailable();
        clientSecret = secret;
        attemptStatus = "reserved";
        action = "collect";
      }
    }
    return respond({
      order,
      attempt: {
        id: collection.attemptId,
        paymentIntentId: collection.paymentIntentId,
        clientSecret,
        status: attemptStatus,
      },
      action,
    });
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
