import { verifyOwnDriverPayment } from "./mealdeck-own-driver-payment.server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { reconcileOrderPaymentWebhook } from "./mealdeck-order-payments-stripe.server";
import {
  kitchenAcceptsNewOrders,
  parseKitchenAvailability,
  type KitchenAvailability,
} from "./mealdeck-kitchen-availability";
import {
  GuestInputError,
  normaliseGuestInput,
  parseGuestSession,
  type GuestSession,
  type GuestCheckoutState,
} from "./mealdeck-guest";
import {
  expiredGuestCookie,
  guestCookie,
  guestTokenHash,
  newGuestToken,
  readGuestToken,
} from "./mealdeck-guest-session.server";
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
  resolveStripeCheckoutSession,
  verifiedStripeEvent,
  verifyStripeAccount,
  type PreparedStripeOrder,
} from "./mealdeck-stripe.server";
import { readMealDeckStripeCheckoutDomain } from "./mealdeck-stripe-checkout-domain.server";
import { ORDER_NOTES_ERROR_MESSAGE, orderNotesMatch } from "./mealdeck-order-notes";
import {
  bindWhatsAppCheckoutOrder,
  readWhatsAppCheckoutBinding,
  registerWhatsAppCheckoutQuote,
} from "./mealdeck-whatsapp-checkout.server";
import { readWhatsAppConfig } from "./mealdeck-whatsapp-transport.server";
import {
  checkOwnDriverArea,
  ownDriverShortfallPence,
  OwnDriverInvalidPostcode,
  OwnDriverPostcodeUnavailable,
} from "./mealdeck-own-driver-delivery";

type Json = Record<string, unknown>;
const object = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const NO_STORE = {
  "Cache-Control": "no-store, private",
  Vary: "Authorization, Cookie",
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
    [/checkout_notes_invalid/, "invalid_notes", ORDER_NOTES_ERROR_MESSAGE, 400],
    [
      /prelaunch_test_account_required/,
      "prelaunch_test_account_required",
      "This live order check is available only to the approved, verified test account.",
      403,
    ],
    [
      /guest_window_closed|guest_unavailable/,
      "guest_window_closed",
      "Guest checkout is available whenever online ordering is open. Please try again during opening hours.",
      403,
    ],
    [
      /outside_opening_hours/,
      "outside_opening_hours",
      "The Luton kitchen is closed. Check the opening hours and try again when we open.",
      403,
    ],
    [
      /guest_session_unavailable|guest_session_invalid/,
      "guest_session_expired",
      "Your guest session is unavailable. Return to checkout to continue as a guest or sign in.",
      401,
    ],
    [
      /guest_invalid_contact|guest_details_invalid/,
      "invalid_guest",
      "Please check your name and WhatsApp number.",
      400,
    ],
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
      "We couldn't find that order in this checkout session.",
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
  fulfilments: ("pickup" | "curbside" | "delivery")[];
  openingOffer: MealDeckOpeningOffer;
  guestCheckout: GuestCheckoutState;
  kitchen: KitchenAvailability | null;
  prelaunchVerification: boolean;
};

export async function readOnlineCheckoutStatus(
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
  verifiedCustomerId: string | null = null,
): Promise<MealDeckOnlineCheckoutStatus> {
  const base: MealDeckOnlineCheckoutStatus = {
    available: false,
    fulfilments: ["pickup", "curbside"],
    openingOffer: unscheduledOpeningOffer(),
    guestCheckout: { eligible: false, session: null },
    kitchen: null,
    prelaunchVerification: false,
  };
  const clients = databaseClients(env, fetcher);
  if (!clients) return base;
  try {
    const scope = { p_tenant: clients.config.tenantId, p_location: clients.config.locationId };
    let state = await rpc(clients.publicClient, "mealdeck_online_checkout_status", scope);
    const publicChannelOpen = state["channelOpen"] === true;
    const integrationApproved = env["MEALDECK_CHECKOUT_INTEGRATION_APPROVED"] === "signed-off";
    let liveVerification: Json | null = null;
    const publicKitchen = parseKitchenAvailability(state["kitchen"]);
    // A scheduled public opening does not sign off payment integration. A
    // currently verified Auth identity can ask the service-only RPC for its own
    // time-limited verification access while public signoff remains pending.
    // The database owns the allowlist and clock; no client email/flag opens it.
    // Operator Pause/Closed and every provider-readiness check remain authoritative.
    if (
      (!publicChannelOpen || !integrationApproved) &&
      clients.service &&
      verifiedCustomerId &&
      z.uuid().safeParse(verifiedCustomerId).success &&
      publicKitchen &&
      kitchenAcceptsNewOrders(publicKitchen.state)
    ) {
      const { data, error } = await clients.service.rpc("mealdeck_checkout_status_for_customer", {
        ...scope,
        p_customer: verifiedCustomerId,
      });
      // A missing extension or failed check never enables ordering. Keep the
      // accurate public kitchen state, rather than replacing it with an empty one.
      if (!error && data && typeof data === "object" && !Array.isArray(data)) {
        state = data as Json;
        liveVerification = object(state["liveVerification"]);
      }
    }
    const openingOffer = parseOpeningOffer(state["openingOffer"]);
    if (!openingOffer) return base;
    const kitchen = parseKitchenAvailability(state["kitchen"]);
    const serverNow = Date.parse(openingOffer.serverNow);
    const verificationStartsAt =
      typeof liveVerification?.["startsAt"] === "string"
        ? Date.parse(liveVerification["startsAt"])
        : NaN;
    const verificationExpiresAt =
      typeof liveVerification?.["expiresAt"] === "string"
        ? Date.parse(liveVerification["expiresAt"])
        : NaN;
    // Only an explicit private RPC admission can waive integration signoff.
    // Validate its database-clock window within the owner's approved bounds;
    // missing/legacy evidence and an expired or unbounded window stay closed.
    const prelaunchVerification =
      liveVerification?.["eligible"] === true &&
      state["channelOpen"] === true &&
      state["guestCheckoutEligible"] === false &&
      Number.isFinite(verificationStartsAt) &&
      Number.isFinite(verificationExpiresAt) &&
      verificationStartsAt >= Date.parse("2026-11-06T08:00:00Z") &&
      verificationExpiresAt <= Date.parse("2026-11-06T23:00:00Z") &&
      serverNow >= verificationStartsAt &&
      serverNow < verificationExpiresAt;
    const stripe = readMealDeckStripeConfig(env);
    const available =
      state["channelOpen"] === true &&
      kitchen !== null &&
      kitchenAcceptsNewOrders(kitchen.state) &&
      kitchen.collectionEstimateMinutes !== null &&
      clients.service !== null &&
      env["MEALDECK_ONLINE_CHECKOUT_ENABLED"] === "true" &&
      ((integrationApproved && publicChannelOpen) || prelaunchVerification) &&
      stripe?.livemode === true &&
      readMealDeckStripeCheckoutDomain(env).status !== "invalid";
    let localDeliveryReady = false;
    if (available && env["MEALDECK_OWN_DRIVER_DELIVERY_ENABLED"] === "true" && clients.service) {
      try {
        const { data, error } = await clients.service.rpc("mealdeck_local_delivery_ready", scope);
        localDeliveryReady = !error && data === true;
      } catch {
        // A delivery configuration issue must never disable existing pickup orders.
        localDeliveryReady = false;
      }
    }
    return {
      ...base,
      fulfilments: localDeliveryReady ? ["pickup", "curbside", "delivery"] : ["pickup", "curbside"],
      openingOffer,
      available,
      kitchen,
      prelaunchVerification,
      guestCheckout: {
        eligible: available && state["guestCheckoutEligible"] === true,
        session: null,
      },
    };
  } catch {
    return base;
  }
}

/** Resolve a bearer with Auth before using a private availability RPC. */
export async function readRequestOnlineCheckoutStatus(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
): Promise<MealDeckOnlineCheckoutStatus> {
  const clients = databaseClients(env, fetcher);
  const customerId =
    request.headers.has("Authorization") && clients
      ? await verifiedCustomer(request, clients.publicClient)
      : null;
  return readOnlineCheckoutStatus(env, fetcher, customerId);
}

function newOrderingUnavailable(status: MealDeckOnlineCheckoutStatus): CheckoutProblem {
  if (status.kitchen?.state === "paused")
    return new CheckoutProblem(
      "kitchen_paused",
      "The Luton kitchen has temporarily paused new orders. Existing orders continue to update.",
      503,
    );
  if (status.kitchen?.state === "closed")
    return new CheckoutProblem(
      "kitchen_closed",
      "The Luton kitchen is closed to new orders. Existing orders continue to update.",
      503,
    );
  return backendProblem({});
}

type CheckoutClients = NonNullable<ReturnType<typeof databaseClients>>;

function requireGuestOrigin(request: Request) {
  const origin = new URL(request.url).origin;
  if (
    request.headers.get("Origin") !== origin ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    throw new CheckoutProblem("invalid_origin", "Refresh MealDeck and try again.", 403);
}

function guestScope(clients: CheckoutClients, token: string) {
  return {
    p_tenant: clients.config.tenantId,
    p_location: clients.config.locationId,
    p_token_hash: guestTokenHash(token),
  };
}

function parseDatabaseGuest(value: unknown): GuestSession | null {
  const data = object(value);
  if (
    data["loyaltyEligible"] !== false ||
    typeof data["expiresAt"] !== "string" ||
    !Number.isFinite(Date.parse(data["expiresAt"]))
  )
    return null;
  return parseGuestSession({ ...data, id: data["guestId"] });
}

async function resolveGuest(
  clients: CheckoutClients,
  token: string | null,
): Promise<GuestSession | null> {
  if (!clients.service || !token) return null;
  const { data, error } = await clients.service.rpc(
    "mealdeck_resolve_guest_session",
    guestScope(clients, token),
  );
  if (error) throw backendProblem(error);
  if (data === null) return null;
  const session = parseDatabaseGuest(data);
  if (!session) throw backendProblem({});
  return session;
}

export async function handleOnlineCheckoutRequest(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
) {
  try {
    if (request.method === "GET") {
      const status = await readRequestOnlineCheckoutStatus(request, env, fetcher);
      const clients = databaseClients(env, fetcher);
      if (clients)
        status.guestCheckout.session = await resolveGuest(
          clients,
          readGuestToken(request.headers.get("Cookie")),
        );
      return Response.json(status, { headers: NO_STORE });
    }
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
    const action = object(input)["action"];
    if (action === "delivery_area") {
      const requestData = object(input);
      if (Object.keys(requestData).some((key) => key !== "action" && key !== "postcode"))
        throw new CheckoutProblem("invalid_request", "Enter only a postcode to check coverage.");
      const status = await readOnlineCheckoutStatus(env, fetcher);
      if (!status.fulfilments.includes("delivery"))
        throw new CheckoutProblem(
          "delivery_unavailable",
          "Delivery is not available at the moment. Please choose collection or kerbside.",
          503,
        );
      try {
        const area = await checkOwnDriverArea(requestData["postcode"], fetcher);
        return Response.json(
          { postcode: area.postcode, eligible: area.eligible, distanceMetres: area.distanceMetres },
          { headers: NO_STORE },
        );
      } catch (error) {
        if (error instanceof OwnDriverInvalidPostcode)
          throw new CheckoutProblem("invalid_postcode", error.message);
        if (error instanceof OwnDriverPostcodeUnavailable)
          throw new CheckoutProblem("area_unavailable", error.message, 503);
        throw error;
      }
    }
    const guestToken = readGuestToken(request.headers.get("Cookie"));
    if (action === "end_guest") {
      requireGuestOrigin(request);
      if (Object.keys(object(input)).some((key) => key !== "action"))
        throw new CheckoutProblem("invalid_request", "Please try ending your guest session again.");
      if (guestToken) {
        const { error } = await clients.service.rpc(
          "mealdeck_end_guest_session",
          guestScope(clients, guestToken),
        );
        if (error) throw backendProblem(error);
      }
      const status = await readOnlineCheckoutStatus(env, fetcher);
      return Response.json(
        { guestCheckout: status.guestCheckout },
        { headers: { ...NO_STORE, "Set-Cookie": expiredGuestCookie() } },
      );
    }
    if (action === "guest") {
      requireGuestOrigin(request);
      const details = normaliseGuestInput(input);
      const status = await readOnlineCheckoutStatus(env, fetcher);
      if (status.kitchen?.state === "paused" || status.kitchen?.state === "closed")
        throw newOrderingUnavailable(status);
      if (!status.guestCheckout.eligible)
        throw new CheckoutProblem(
          "guest_window_closed",
          "Guest checkout is available when the Luton kitchen is accepting orders.",
          403,
        );
      const existing = await resolveGuest(clients, guestToken);
      if (existing) {
        if (
          existing.name !== details.name ||
          existing.email !== details.email ||
          existing.phone !== details.phone
        )
          throw new CheckoutProblem(
            "guest_session_conflict",
            "End your current guest session before changing its contact details. Save any order receipt first.",
            409,
          );
        return Response.json(
          { guestCheckout: { eligible: true, session: existing } },
          { headers: NO_STORE },
        );
      }
      const token = newGuestToken();
      const created = await rpc(clients.service, "mealdeck_begin_guest_session", {
        ...guestScope(clients, token),
        p_name: details.name,
        p_email: details.email,
        p_phone: details.phone,
      });
      const session = parseDatabaseGuest(created);
      if (!session) throw backendProblem({});
      return Response.json(
        { guestCheckout: { eligible: true, session } },
        { headers: { ...NO_STORE, "Set-Cookie": guestCookie(token) } },
      );
    }
    // A supplied member token never silently falls back to a guest cookie.
    const customerId = request.headers.has("Authorization")
      ? await verifiedCustomer(request, clients.publicClient)
      : null;
    if (!customerId) {
      requireGuestOrigin(request);
      if (!guestToken || !(await resolveGuest(clients, guestToken)))
        throw new CheckoutProblem(
          "guest_session_expired",
          "Continue as a guest to place your order, or sign in with your verified email.",
          401,
        );
    }
    // Receipt polling remains available if the operator closes ordering later.
    if (action === "receipt") {
      const parsed = checkoutReceiptInput.safeParse(input);
      if (!parsed.success)
        throw new CheckoutProblem("invalid_request", "Check your order reference.");
      const receipt = await rpc(
        clients.service,
        customerId ? "mealdeck_customer_order_receipt" : "mealdeck_guest_order_receipt",
        customerId
          ? { p_order: parsed.data.orderId, p_customer: customerId }
          : { ...guestScope(clients, guestToken!), p_order: parsed.data.orderId },
      );
      return Response.json({ receipt }, { headers: NO_STORE });
    }
    const whatsapp = await readWhatsAppCheckoutBinding(request, env, fetcher);
    const whatsappActor = customerId
      ? { customerId }
      : { guestTokenHash: guestTokenHash(guestToken!) };
    const whatsappPay = checkoutPayInput.safeParse(input);
    const whatsappRecovery = !!(
      whatsapp?.handoff.orderId &&
      whatsapp.handoff.attemptId &&
      whatsappPay.success &&
      whatsappPay.data.quoteId === whatsapp.handoff.quoteId &&
      whatsappPay.data.attemptId === whatsapp.handoff.attemptId
    );
    if (whatsapp && !whatsappRecovery && !readWhatsAppConfig(env)?.orderingEnabled)
      throw new CheckoutProblem(
        "whatsapp_ordering_paused",
        "New WhatsApp ordering is paused. An existing payment or receipt remains available through its original checkout.",
        503,
      );
    const stripe = readMealDeckStripeConfig(env);
    if (
      !stripe?.livemode ||
      (env["MEALDECK_ONLINE_CHECKOUT_ENABLED"] !== "true" && !whatsappRecovery)
    )
      throw backendProblem({});
    const status = await readOnlineCheckoutStatus(env, fetcher, customerId);
    if (!status.available && !whatsappRecovery) throw newOrderingUnavailable(status);
    if (action === "quote") {
      const selection = normaliseCheckoutSelection(input, clients.config.tenantId);
      let deliveryDistanceMetres: number | null = null;
      if (selection.fulfilment === "delivery") {
        if (!status.fulfilments.includes("delivery") || !selection.deliveryAddress)
          throw new CheckoutProblem(
            "delivery_unavailable",
            "Delivery is unavailable. Choose collection or kerbside.",
            503,
          );
        try {
          const area = await checkOwnDriverArea(selection.deliveryAddress.postcode, fetcher);
          if (!area.eligible)
            throw new CheckoutProblem(
              "outside_delivery_area",
              "Sorry, we're not delivering to your location yet. You can select collection or kerbside pickup.",
            );
          deliveryDistanceMetres = area.distanceMetres;
        } catch (error) {
          if (error instanceof OwnDriverInvalidPostcode)
            throw new CheckoutProblem("invalid_postcode", error.message);
          if (error instanceof OwnDriverPostcodeUnavailable)
            throw new CheckoutProblem("area_unavailable", error.message, 503);
          throw error;
        }
      }
      if (whatsapp && selection.requestHash !== whatsapp.requestHash)
        throw new CheckoutProblem(
          "whatsapp_order_changed",
          "The order differs from your WhatsApp review. Return to WhatsApp to change it.",
          409,
        );
      const quoteRpc = customerId
        ? "mealdeck_create_checkout_quote"
        : "mealdeck_create_guest_checkout_quote";
      const quote = await rpc(
        clients.service,
        selection.notes ? quoteRpc + "_with_notes" : quoteRpc,
        {
          p_tenant: clients.config.tenantId,
          p_location: clients.config.locationId,
          ...(customerId
            ? { p_customer: customerId }
            : { p_token_hash: guestTokenHash(guestToken!) }),
          p_fulfilment: selection.fulfilment === "delivery" ? "pickup" : selection.fulfilment,
          p_vehicle: selection.vehicle,
          p_selection: selection.lines,
          p_request_hash: selection.requestHash,
          p_packing: selection.packingPlan,
          ...(selection.notes ? { p_notes: selection.notes } : {}),
        },
      );
      if (selection.fulfilment === "delivery") {
        const shortfall = ownDriverShortfallPence(quote["totalPence"] as number);
        if (shortfall === null) throw backendProblem({});
        if (shortfall > 0)
          throw new CheckoutProblem(
            "minimum_delivery_order",
            `Your total after discounts is below the £15 free-delivery minimum. Add £${(shortfall / 100).toFixed(2)} more to your basket, or choose collection.`,
          );
        await rpc(clients.service, "mealdeck_bind_local_delivery_quote", {
          p_tenant: clients.config.tenantId,
          p_location: clients.config.locationId,
          p_quote: quote["quoteId"],
          ...(customerId
            ? { p_customer: customerId, p_token_hash: null }
            : { p_customer: null, p_token_hash: guestTokenHash(guestToken!) }),
          p_request_hash: selection.requestHash,
          p_address: selection.deliveryAddress,
          p_distance_metres: deliveryDistanceMetres,
        });
        quote["fulfilment"] = "delivery";
        quote["deliveryEstimateMinutes"] = 60;
        quote["deliveryFeePence"] = 0;
      }
      if (!orderNotesMatch(selection.notes, quote["notes"]))
        throw new CheckoutProblem(
          "notes_not_saved",
          "We couldn't save your special requests. Please review your order again before paying.",
          503,
        );
      if (whatsapp)
        await registerWhatsAppCheckoutQuote(
          whatsapp,
          quote["quoteId"],
          selection.requestHash,
          whatsappActor,
        );
      return Response.json({ quote }, { headers: NO_STORE });
    }
    const parsed = checkoutPayInput.safeParse(input);
    if (!parsed.success)
      throw new CheckoutProblem("invalid_request", "Please review your order before paying.");
    if (
      whatsapp &&
      (whatsapp.handoff.quoteId !== parsed.data.quoteId ||
        (whatsapp.handoff.attemptId && whatsapp.handoff.attemptId !== parsed.data.attemptId))
    )
      throw new CheckoutProblem(
        "whatsapp_attempt_conflict",
        "Resume the original WhatsApp payment attempt.",
        409,
      );
    await verifyStripeAccount(stripe, fetcher);
    // Provider verification may take time. Recheck the scoped clock/readiness
    // immediately before preparing a real payment when public signoff is absent.
    if (env["MEALDECK_CHECKOUT_INTEGRATION_APPROVED"] !== "signed-off" && !whatsappRecovery) {
      const current = await readOnlineCheckoutStatus(env, fetcher, customerId);
      if (!current.available || !current.prelaunchVerification)
        throw newOrderingUnavailable(current);
    }
    const prepared = await rpc(
      clients.service,
      customerId ? "mealdeck_prepare_stripe_order" : "mealdeck_prepare_guest_stripe_order",
      {
        p_quote: parsed.data.quoteId,
        ...(customerId ? { p_customer: customerId } : guestScope(clients, guestToken!)),
        p_attempt: parsed.data.attemptId,
        p_stripe_account: stripe.accountId,
        p_livemode: stripe.livemode,
      },
    );
    if (!z.uuid().safeParse(prepared["orderId"]).success || !Array.isArray(prepared["lines"]))
      throw backendProblem({});
    const order = prepared as unknown as PreparedStripeOrder;
    // Inspect the actor-scoped canonical order, not browser input. A pending
    // order is not a payment: no Stripe session exists until this guard passes.
    await verifyOwnDriverPayment({
      order,
      deliveryEnabled:
        env["MEALDECK_OWN_DRIVER_DELIVERY_ENABLED"] === "true" &&
        status.fulfilments.includes("delivery"),
      readQuote: () =>
        rpc(clients.service!, "mealdeck_local_delivery_quote_for_actor", {
          p_quote: parsed.data.quoteId,
          ...(customerId
            ? { p_customer: customerId, p_token_hash: null }
            : { p_customer: null, p_token_hash: guestTokenHash(guestToken!) }),
        }),
      fetcher,
    });
    // Bind the verified actor and original canonical order before any provider
    // session can be created. Chat messages cannot supply this authority.
    if (whatsapp)
      await bindWhatsAppCheckoutOrder(
        whatsapp,
        {
          quoteId: parsed.data.quoteId,
          attemptId: parsed.data.attemptId,
          orderId: order.orderId,
        },
        whatsappActor,
      );
    const { sessionId, url } = await resolveStripeCheckoutSession(stripe, order, fetcher);
    if (!order.sessionId) {
      const { error } = await clients.service.rpc("mealdeck_bind_stripe_session", {
        p_order: order.orderId,
        p_session: sessionId,
        p_url: url,
        p_account: stripe.accountId,
        p_livemode: stripe.livemode,
      });
      if (error) throw backendProblem(error);
    }
    return Response.json({ checkoutUrl: url, orderId: order.orderId }, { headers: NO_STORE });
  } catch (error) {
    const problem =
      error instanceof CheckoutProblem
        ? error
        : error instanceof GuestInputError
          ? new CheckoutProblem("invalid_guest", error.message)
          : backendProblem({});
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
    const raw = await readBoundedBody(request, 1_000_000);
    const signature = request.headers.get("Stripe-Signature");
    const shared = await reconcileOrderPaymentWebhook(
      raw,
      signature,
      { ...clients, service: clients.service },
      stripe,
      fetcher,
    );
    if (!shared) {
      const event = await verifiedStripeEvent(raw, signature, stripe, fetcher);
      if (event) await rpc(clients.service, "mealdeck_reconcile_stripe_event", event);
    }
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
