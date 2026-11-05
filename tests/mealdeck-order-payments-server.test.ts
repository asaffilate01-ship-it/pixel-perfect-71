import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  cancelOrderCollection,
  ensureCheckoutCollection,
  ensureTerminalCollection,
  groupSessionParameters,
  observeOrderPayment,
  reconcileOrderPaymentWebhook,
  terminalIntentParameters,
  type PaymentCollection,
} from "../src/lib/mealdeck-order-payments-stripe.server";
import { createPaymentClients } from "../src/lib/mealdeck-payment-server-core";
import { readMealDeckStripeConfig } from "../src/lib/mealdeck-stripe.server";
import { handleMealDeckStripeWebhook } from "../src/lib/mealdeck-online-checkout.server";
import { handleTerminalRequest, terminalOrderForApp } from "../src/lib/mealdeck-terminal.server";

const uid = (last: number) => "10000000-0000-4000-8000-" + String(last).padStart(12, "0");
const env = {
  MEALDECK_SUPABASE_URL: "https://paymentfixture.supabase.co",
  MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_payment_fixture_public",
  MEALDECK_CHECKOUT_SERVER_KEY: "sb_secret_payment_fixture_server",
  MEALDECK_TENANT_ID: uid(1),
  MEALDECK_LUTON_LOCATION_ID: uid(2),
  MEALDECK_STRIPE_SECRET_KEY: "sk_test_" + "a".repeat(32),
  MEALDECK_STRIPE_WEBHOOK_SECRET: "whsec_" + "b".repeat(32),
  MEALDECK_STRIPE_ACCOUNT_ID: "acct_fixture",
  MEALDECK_STRIPE_MODE: "test",
  MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "signed-off",
  MEALDECK_TERMINAL_ENABLED: "true",
  MEALDECK_TERMINAL_INTEGRATION_APPROVED: "signed-off",
  MEALDECK_STRIPE_TERMINAL_LOCATION_ID: "tml_fixture",
};
const stripe = readMealDeckStripeConfig(env)!;
const baseCollection = (method: "checkout" | "terminal" = "terminal"): PaymentCollection => ({
  collectionId: uid(3),
  attemptId: uid(4),
  orderId: uid(5),
  quoteId: uid(6),
  roomId: method === "checkout" ? uid(7) : null,
  tenantId: uid(1),
  locationId: uid(2),
  method,
  amountPence: 1001,
  currency: "gbp",
  requestHash: "a".repeat(64),
  stripeAccount: "acct_fixture",
  livemode: false,
  status: "pending",
  shareIds: [uid(8)],
  sessionId: method === "checkout" ? "cs_test_fixture" : null,
  sessionUrl: method === "checkout" ? "https://checkout.stripe.com/c/pay/cs_test_fixture" : null,
  paymentIntentId: "pi_fixture",
  expiresAt: new Date(Date.now() + 35 * 60_000).toISOString(),
  email: null,
  terminalLocationId: method === "terminal" ? "tml_fixture" : null,
  cancelRequested: false,
  coverRemaining: false,
  requestShareId: method === "checkout" ? uid(8) : null,
});
function providerMetadata(c: PaymentCollection) {
  return {
    source: "mealdeck",
    mealdeck_collection_id: c.collectionId,
    mealdeck_order_id: c.orderId,
    mealdeck_quote_id: c.quoteId,
    mealdeck_request_hash: c.requestHash,
    mealdeck_payment_method: c.method,
    mealdeck_tenant_id: c.tenantId,
    mealdeck_location_id: c.locationId,
    ...(c.terminalLocationId ? { mealdeck_terminal_location_id: c.terminalLocationId } : {}),
  };
}
function paidIntent(c: PaymentCollection) {
  return {
    id: "pi_fixture",
    amount: c.amountPence,
    amount_received: c.amountPence,
    currency: "gbp",
    livemode: false,
    status: "succeeded",
    capture_method: "automatic",
    payment_method_types: [c.method === "terminal" ? "card_present" : "card"],
    metadata: providerMetadata(c),
    latest_charge: {
      id: "ch_fixture",
      payment_intent: "pi_fixture",
      amount: c.amountPence,
      amount_captured: c.amountPence,
      amount_refunded: 0,
      disputed: false,
      currency: "gbp",
      livemode: false,
      status: "succeeded",
      paid: true,
      captured: true,
      payment_method_details: { type: c.method === "terminal" ? "card_present" : "card" },
    } as {
      id: string;
      payment_intent: string;
      amount: number;
      amount_captured: number;
      amount_refunded: number;
      disputed: boolean;
      currency: string;
      livemode: boolean;
      status: string;
      paid: boolean;
      captured: boolean;
      payment_method_details: { type: string };
    } | null,
    client_secret: "pi_fixture_secret_fixture",
  };
}
function fixture(method: "checkout" | "terminal" = "terminal") {
  const collection = baseCollection(method);
  const intent = paidIntent(collection);
  const session = {
    id: "cs_test_fixture",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    currency: "gbp",
    livemode: false,
    amount_total: collection.amountPence,
    client_reference_id: collection.orderId,
    metadata: providerMetadata(collection),
    payment_intent: intent as ReturnType<typeof paidIntent> | null,
    url: "https://checkout.stripe.com/c/pay/cs_test_fixture",
  };
  const event: Record<string, unknown> = {
    id: "evt_fixture",
    type: method === "checkout" ? "checkout.session.completed" : "payment_intent.succeeded",
    livemode: false,
    data: { object: method === "checkout" ? { id: session.id } : { id: intent.id } },
  };
  const calls: {
    path: string;
    method: string;
    args: Record<string, unknown>;
    idempotency: string | null;
  }[] = [];
  const state = {
    verified: true,
    permission: true,
    channel: true,
    attemptExists: true,
    chargesEnabled: true,
    accountCountry: "GB",
    locationCountry: "GB",
    locationMode: false,
    failCancellation: false,
    failProviderRead: false,
  };
  const rawOrder: Record<string, unknown> = {
    orderId: collection.orderId,
    displayCode: "1234",
    fulfilment: "pickup",
    status: "payment_pending",
    paymentStatus: "pending",
    verifiedPaid: false,
    totalPence: 1001,
    paidPence: 0,
    remainingPence: 1001,
    collectiblePence: 0,
    held: false,
    activeCollection: collection,
    onlinePaymentActive: method === "checkout",
    lines: [{ lineId: "line-1", name: "The Ace", quantity: 1, line_pence: 1001, modifiers: [] }],
  };
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const method = init?.method ?? "GET";
    const args =
      typeof init?.body === "string" && init.body.startsWith("{")
        ? JSON.parse(init.body)
        : Object.fromEntries(new URLSearchParams(String(init?.body ?? "")));
    calls.push({
      path: url.pathname + url.search,
      method,
      args,
      idempotency: new Headers(init?.headers).get("Idempotency-Key"),
    });
    const fail = (message: string, status = 400) =>
      Response.json({ message, code: "P0001" }, { status });
    if (url.pathname === "/auth/v1/user")
      return state.verified
        ? Response.json({
            id: uid(9),
            email: "staff@example.invalid",
            email_confirmed_at: "2026-11-01T12:00:00Z",
            is_anonymous: false,
          })
        : fail("Invalid token", 401);
    const name = url.pathname.split("/").at(-1);
    if (name === "mealdeck_terminal_authorize")
      return state.permission
        ? Response.json({ authorized: true, tenantId: uid(1), locationId: uid(2) })
        : fail("mealdeck_payment_staff_forbidden");
    if (name === "mealdeck_online_checkout_status")
      return Response.json({
        channelOpen: state.channel,
        kitchen: { state: state.channel ? "online" : "closed", collectionEstimateMinutes: 25 },
      });
    if (name === "mealdeck_order_payment_collection") return Response.json(collection);
    if (name === "mealdeck_terminal_payment_attempt")
      return Response.json(state.attemptExists ? collection : null);
    if (name === "mealdeck_terminal_order_status") return Response.json(rawOrder);
    if (name === "mealdeck_bind_order_payment") {
      collection.sessionId = args.p_session as string | null;
      collection.sessionUrl = args.p_url as string | null;
      collection.paymentIntentId = args.p_intent as string | null;
      collection.status = "pending";
      return Response.json(collection);
    }
    if (name === "mealdeck_reconcile_order_payment")
      return Response.json({
        ok: true,
        orderId: collection.orderId,
        collectionId: collection.collectionId,
      });
    if (url.hostname === "api.stripe.com") {
      if (name === "account")
        return Response.json({
          id: "acct_fixture",
          country: state.accountCountry,
          charges_enabled: state.chargesEnabled,
        });
      if (url.pathname === "/v1/terminal/locations/tml_fixture")
        return Response.json({
          id: "tml_fixture",
          livemode: state.locationMode,
          address: { country: state.locationCountry },
        });
      if (url.pathname === "/v1/terminal/connection_tokens")
        return Response.json({ secret: "pst_test_" + "a".repeat(48) });
      if (url.pathname.startsWith("/v1/events/")) return Response.json(event);
      if (url.pathname.endsWith("/cancel")) {
        if (state.failCancellation) return fail("Unknown result", 503);
        intent.status = "canceled";
        intent.amount_received = 0;
        intent.latest_charge = null;
        return Response.json(intent);
      }
      if (url.pathname.endsWith("/expire")) {
        if (state.failCancellation) return fail("Unknown result", 503);
        session.status = "expired";
        session.payment_status = "unpaid";
        session.payment_intent = null;
        return Response.json(session);
      }
      if (state.failProviderRead) throw new Error("Simulated connection loss");
      if (
        url.pathname === "/v1/payment_intents" ||
        url.pathname === "/v1/payment_intents/pi_fixture"
      )
        return Response.json(intent);
      if (
        url.pathname === "/v1/checkout/sessions" ||
        url.pathname === "/v1/checkout/sessions/cs_test_fixture"
      )
        return Response.json(session);
    }
    throw new Error("Unexpected fixture path: " + url.pathname);
  }) as typeof fetch;
  const clients = createPaymentClients(env, fetcher)!;
  const reconciliations = () =>
    calls.filter((call) => call.path.endsWith("/mealdeck_reconcile_order_payment"));
  const webhook = () => {
    const raw = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    return {
      raw,
      signature:
        "t=" +
        timestamp +
        ",v1=" +
        createHmac("sha256", stripe.webhookSecret)
          .update(timestamp + "." + raw)
          .digest("hex"),
    };
  };
  const terminal = (body: unknown, headers: Record<string, string> = {}, runtime = env) =>
    handleTerminalRequest(
      new Request("https://mealdeck.co.uk/api/terminal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + "v".repeat(48),
          ...headers,
        },
        body: JSON.stringify(body),
      }),
      runtime,
      fetcher,
    );
  return {
    collection,
    intent,
    session,
    event,
    calls,
    state,
    rawOrder,
    fetcher,
    clients,
    reconciliations,
    webhook,
    terminal,
  };
}

describe("immutable shared and Terminal provider collection", () => {
  test("provider creation uses frozen integer pence and fixed secret-free return URLs", () => {
    const group = baseCollection("checkout");
    const session = groupSessionParameters(group);
    expect(session.get("line_items[0][price_data][unit_amount]")).toBe("1001");
    expect(session.get("success_url")).toBe(
      "https://mealdeck.co.uk/group-pay?room=" + group.roomId,
    );
    expect(session.toString()).not.toContain("key=");
    expect(session.get("metadata[mealdeck_collection_id]")).toBe(group.collectionId);
    expect(session.get("payment_intent_data[metadata][mealdeck_collection_id]")).toBe(
      group.collectionId,
    );
    const terminal = terminalIntentParameters(baseCollection());
    expect(terminal.get("capture_method")).toBe("automatic");
    expect(terminal.get("payment_method_types[0]")).toBe("card_present");
    expect(terminal.get("amount")).toBe("1001");
    expect(() => terminalIntentParameters(group)).toThrow();
  });
  test("lost-response creation retries use one idempotency key and one bound intent", async () => {
    const f = fixture();
    f.collection.paymentIntentId = null;
    f.intent.status = "requires_payment_method";
    f.intent.amount_received = 0;
    f.intent.latest_charge = null;
    const original = structuredClone(f.collection);
    await ensureTerminalCollection(f.clients, stripe, original, f.fetcher);
    await ensureTerminalCollection(f.clients, stripe, original, f.fetcher);
    const creations = f.calls.filter((call) => call.path === "/v1/payment_intents");
    expect(creations).toHaveLength(2);
    expect(new Set(creations.map((call) => call.idempotency)).size).toBe(1);
    expect(creations[0]!.idempotency).toBe("mealdeck-payment-" + f.collection.collectionId);
    expect(f.collection.paymentIntentId).toBe("pi_fixture");
    expect(f.reconciliations()).toHaveLength(0);
  });
  test("independent provider retrieval creates narrow evidence and no client success field", async () => {
    for (const method of ["checkout", "terminal"] as const) {
      const f = fixture(method);
      const result = await observeOrderPayment(f.clients, stripe, f.collection, f.fetcher);
      expect(result.state).toBe("paid");
      const evidence = f.reconciliations()[0]!.args;
      expect(evidence.p_event).toMatch(/^obs_[a-f0-9]{64}$/);
      expect(evidence.p_captured).toBe(1001);
      expect(evidence.p_order).toBe(f.collection.orderId);
      expect(evidence.p_collection).toBe(f.collection.collectionId);
      expect(JSON.stringify(evidence)).not.toContain("client_secret");
      expect(evidence).not.toHaveProperty("paid");
    }
  });
  test("mismatched provider scope, metadata, charge type and amount never reach reconciliation", async () => {
    const changes = [
      (f: ReturnType<typeof fixture>) => {
        f.intent.amount = 1;
      },
      (f: ReturnType<typeof fixture>) => {
        f.intent.amount_received = 1000;
      },
      (f: ReturnType<typeof fixture>) => {
        f.intent.metadata.mealdeck_order_id = uid(99);
      },
      (f: ReturnType<typeof fixture>) => {
        f.intent.metadata.mealdeck_quote_id = uid(99);
      },
      (f: ReturnType<typeof fixture>) => {
        f.intent.metadata.mealdeck_collection_id = uid(99);
      },
      (f: ReturnType<typeof fixture>) => {
        f.intent.metadata.mealdeck_request_hash = "b".repeat(64);
      },
      (f: ReturnType<typeof fixture>) => {
        f.intent.metadata.mealdeck_location_id = uid(99);
      },
      (f: ReturnType<typeof fixture>) => {
        f.intent.metadata.mealdeck_terminal_location_id = "tml_wrong";
      },
      (f: ReturnType<typeof fixture>) => {
        f.intent.currency = "usd";
      },
      (f: ReturnType<typeof fixture>) => {
        f.intent.livemode = true;
      },
      (f: ReturnType<typeof fixture>) => {
        f.intent.latest_charge!.captured = false;
      },
      (f: ReturnType<typeof fixture>) => {
        f.intent.latest_charge!.payment_intent = "pi_other";
      },
      (f: ReturnType<typeof fixture>) => {
        f.intent.latest_charge!.payment_method_details.type = "card";
      },
      (f: ReturnType<typeof fixture>) => {
        f.intent.latest_charge!.amount_refunded = 1002;
      },
      (f: ReturnType<typeof fixture>) => {
        f.collection.tenantId = uid(99);
      },
      (f: ReturnType<typeof fixture>) => {
        f.collection.stripeAccount = "acct_other";
      },
    ];
    for (const change of changes) {
      const f = fixture();
      change(f);
      await expect(
        observeOrderPayment(f.clients, stripe, f.collection, f.fetcher),
      ).rejects.toThrow();
      expect(f.reconciliations()).toHaveLength(0);
    }
  });
  test("a declined, processing, unbound or unavailable attempt never releases a claim", async () => {
    for (const status of [
      "requires_payment_method",
      "requires_confirmation",
      "processing",
      "requires_action",
    ]) {
      const f = fixture();
      f.intent.status = status;
      f.intent.amount_received = 0;
      f.intent.latest_charge = null;
      await observeOrderPayment(f.clients, stripe, f.collection, f.fetcher);
      expect(f.reconciliations()).toHaveLength(0);
    }
    const f = fixture();
    f.collection.paymentIntentId = null;
    f.intent.status = "requires_payment_method";
    f.intent.amount_received = 0;
    f.intent.latest_charge = null;
    expect((await observeOrderPayment(f.clients, stripe, f.collection, f.fetcher)).state).toBe(
      "collectable",
    );
    expect(f.calls.filter((call) => call.path === "/v1/payment_intents")).toHaveLength(1);
    expect(f.collection.paymentIntentId).toBe("pi_fixture");
    f.collection.paymentIntentId = "pi_fixture";
    f.state.failProviderRead = true;
    await expect(observeOrderPayment(f.clients, stripe, f.collection, f.fetcher)).rejects.toThrow();
    expect(f.reconciliations()).toHaveLength(0);
  });
  test("an unbound expired attempt never creates a fresh provider object after idempotency retention", async () => {
    for (const method of ["checkout", "terminal"] as const) {
      const f = fixture(method);
      f.collection.paymentIntentId = null;
      f.collection.sessionId = null;
      f.collection.expiresAt = new Date(Date.now() - 48 * 60 * 60_000).toISOString();
      const ensure = method === "terminal" ? ensureTerminalCollection : ensureCheckoutCollection;
      await expect(ensure(f.clients, stripe, f.collection, f.fetcher)).rejects.toThrow(/provider/);
      expect(f.calls).toHaveLength(0);
    }
  });
  test("only independently verified provider cancellation releases an unpaid claim", async () => {
    const f = fixture();
    f.collection.cancelRequested = true;
    f.intent.status = "requires_payment_method";
    f.intent.amount_received = 0;
    f.intent.latest_charge = null;
    f.state.failCancellation = true;
    expect((await cancelOrderCollection(f.clients, stripe, f.collection, f.fetcher)).state).toBe(
      "collectable",
    );
    expect(f.reconciliations()).toHaveLength(0);
    f.state.failCancellation = false;
    expect((await cancelOrderCollection(f.clients, stripe, f.collection, f.fetcher)).state).toBe(
      "cancelled",
    );
    expect(f.reconciliations()[0]!.args.p_type).toBe("payment_intent.canceled");
    expect(f.reconciliations()[0]!.args.p_captured).toBe(0);
  });
  test("a capture racing cancellation remains recorded for database refund review", async () => {
    const f = fixture();
    f.collection.cancelRequested = true;
    await cancelOrderCollection(f.clients, stripe, f.collection, f.fetcher);
    expect(f.reconciliations()[0]!.args.p_captured).toBe(1001);
    expect(f.calls.some((call) => call.path.includes("/refunds"))).toBe(false);
  });
  test("expired and cancel-requested sessions never return a fresh payment link", async () => {
    const f = fixture("checkout");
    f.session.status = "open";
    f.session.payment_status = "unpaid";
    f.session.payment_intent = null;
    f.collection.expiresAt = new Date(Date.now() - 1000).toISOString();
    expect(
      (await ensureCheckoutCollection(f.clients, stripe, f.collection, f.fetcher)).checkoutUrl,
    ).toBeNull();
    f.collection.expiresAt = new Date(Date.now() + 600_000).toISOString();
    f.collection.cancelRequested = true;
    expect(
      (await ensureCheckoutCollection(f.clients, stripe, f.collection, f.fetcher)).checkoutUrl,
    ).toBeNull();
  });
});

describe("signed common payment webhook", () => {
  test("forged events stop before provider or database calls", async () => {
    const f = fixture();
    await expect(
      reconcileOrderPaymentWebhook("{}", "t=0,v1=fake", f.clients, stripe, f.fetcher),
    ).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });
  test("routes Terminal and shared Checkout through frozen collection reconciliation, including webhook before binding", async () => {
    for (const method of ["terminal", "checkout"] as const) {
      const f = fixture(method);
      f.collection.paymentIntentId = null;
      f.collection.sessionId = null;
      const { raw, signature } = f.webhook();
      expect(await reconcileOrderPaymentWebhook(raw, signature, f.clients, stripe, f.fetcher)).toBe(
        true,
      );
      expect(f.reconciliations()[0]!.args.p_event).toBe("evt_fixture");
      expect(f.reconciliations()[0]!.args.p_intent).toBe("pi_fixture");
      expect(f.reconciliations()[0]!.args.p_session).toBe(
        method === "checkout" ? "cs_test_fixture" : null,
      );
    }
  });
  test("HTTP webhook remains active with sales disabled and never sends new collections to the legacy reconciler", async () => {
    const f = fixture();
    f.state.chargesEnabled = false;
    const { raw, signature } = f.webhook();
    const response = await handleMealDeckStripeWebhook(
      new Request("https://mealdeck.co.uk/api/stripe/webhook", {
        method: "POST",
        headers: { "Stripe-Signature": signature },
        body: raw,
      }),
      { ...env, MEALDECK_TERMINAL_ENABLED: "false" },
      f.fetcher,
    );
    expect(response.status).toBe(200);
    expect(f.reconciliations()).toHaveLength(1);
    expect(f.calls.some((call) => call.path.endsWith("mealdeck_reconcile_stripe_event"))).toBe(
      false,
    );
  });
  test("refund and dispute observations preserve money and require a hold without initiating refunds", async () => {
    const f = fixture();
    f.intent.latest_charge!.amount_refunded = 201;
    f.intent.latest_charge!.disputed = true;
    const result = await observeOrderPayment(f.clients, stripe, f.collection, f.fetcher);
    expect(result.state).toBe("hold");
    expect(f.reconciliations()[0]!.args).toMatchObject({
      p_captured: 1001,
      p_refunded: 201,
      p_disputed: true,
    });
  });
});

describe("authorised native payment API", () => {
  test("bootstrap returns public auth configuration only", async () => {
    const response = await handleTerminalRequest(
      new Request("https://mealdeck.co.uk/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bootstrap" }),
      }),
      env,
    );
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain(env.MEALDECK_SUPABASE_PUBLISHABLE_KEY);
    expect(text).not.toContain(env.MEALDECK_CHECKOUT_SERVER_KEY);
    expect(text).not.toContain(env.MEALDECK_STRIPE_SECRET_KEY);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  test("body identity, amount, provider IDs and ambiguous recovery requests are rejected before network access", async () => {
    for (const extra of [
      { amountPence: 1 },
      { actor: uid(9) },
      { tenantId: uid(1) },
      { location: "tml_wrong" },
      { paymentIntentId: "pi_wrong" },
      { paid: true },
      { quoteId: uid(6) },
    ]) {
      const f = fixture();
      expect(
        (await f.terminal({ action: "prepare", orderId: uid(5), attemptId: uid(4), ...extra }))
          .status,
      ).toBe(400);
      expect(f.calls).toHaveLength(0);
    }
  });
  test("invalid identity, wrong staff permission and browser cross-origin calls cannot create a token", async () => {
    const f = fixture();
    f.state.verified = false;
    expect((await f.terminal({ action: "connection_token" })).status).toBe(401);
    f.state.verified = true;
    f.state.permission = false;
    expect((await f.terminal({ action: "connection_token" })).status).toBe(403);
    f.state.permission = true;
    expect(
      (await f.terminal({ action: "connection_token" }, { Origin: "https://attacker.invalid" }))
        .status,
    ).toBe(403);
    expect(f.calls.some((call) => call.path.includes("/v1/terminal/connection_tokens"))).toBe(
      false,
    );
  });
  test("unknown recovery attempts do not reserve or create a new payment", async () => {
    const f = fixture();
    f.state.attemptExists = false;
    const response = await f.terminal({ action: "reconcile", quoteId: uid(6), attemptId: uid(4) });
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("attempt_not_found");
    expect(
      f.calls.some(
        (call) =>
          call.path.endsWith("/mealdeck_prepare_terminal_payment") ||
          (call.method === "POST" && call.path === "/v1/payment_intents"),
      ),
    ).toBe(false);
  });
  test("wrong Terminal country/mode and live simulation never report ready", async () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => {
        f.state.locationCountry = "US";
      },
      (f: ReturnType<typeof fixture>) => {
        f.state.accountCountry = "US";
      },
      (f: ReturnType<typeof fixture>) => {
        f.state.locationMode = true;
      },
      (f: ReturnType<typeof fixture>) => {
        f.state.chargesEnabled = false;
      },
    ]) {
      const f = fixture();
      change(f);
      expect((await (await f.terminal({ action: "config" })).json()).ready).toBe(false);
    }
    const f = fixture();
    const live = {
      ...env,
      MEALDECK_STRIPE_MODE: "live",
      MEALDECK_STRIPE_SECRET_KEY: "sk_live_" + "a".repeat(32),
      MEALDECK_TERMINAL_SIMULATED: "true",
    };
    const config = await (await f.terminal({ action: "config" }, {}, live)).json();
    expect(config.ready).toBe(false);
    expect(config.simulationAllowed).toBe(false);
  });
  test("paid, held, online-owned, expired and closed balances cannot be offered for tapping", () => {
    const f = fixture();
    for (const raw of [
      { ...f.rawOrder, verifiedPaid: true, paidPence: 1001, remainingPence: 0 },
      { ...f.rawOrder, held: true, paidPence: 1500, remainingPence: 0 },
      { ...f.rawOrder, onlinePaymentActive: true },
      {
        ...f.rawOrder,
        activeCollection: { ...f.collection, expiresAt: new Date(Date.now() - 1).toISOString() },
      },
    ])
      expect(terminalOrderForApp(raw, true).canCollect).toBe(false);
    expect(terminalOrderForApp(f.rawOrder, false).canCollect).toBe(false);
    expect(
      terminalOrderForApp({ ...f.rawOrder, held: true, paidPence: 1500, remainingPence: 0 }, true)
        .paidPence,
    ).toBe(1500);
  });
});
