import { describe, expect, test } from "bun:test";
import {
  MEALDECK_STRIPE_CHECKOUT_HOST,
  safeHostedCheckoutUrl,
  safeMealDeckCheckoutRedirect,
} from "../src/lib/mealdeck-checkout-url";
import { readMealDeckStripeCheckoutDomain } from "../src/lib/mealdeck-stripe-checkout-domain.server";
import { safeSharedPaymentCheckoutUrl } from "../src/lib/mealdeck-shared-payments-browser";
import {
  readMealDeckStripeConfig,
  resolveStripeCheckoutSession,
  safeStripeCheckoutUrl,
  type PreparedStripeOrder,
} from "../src/lib/mealdeck-stripe.server";

const env = {
  MEALDECK_STRIPE_SECRET_KEY: "sk_test_" + "a".repeat(32),
  MEALDECK_STRIPE_WEBHOOK_SECRET: "whsec_" + "b".repeat(32),
  MEALDECK_STRIPE_ACCOUNT_ID: "acct_fixture",
  MEALDECK_STRIPE_MODE: "test",
  MEALDECK_STRIPE_CHECKOUT_HOST: MEALDECK_STRIPE_CHECKOUT_HOST,
};
const stripe = readMealDeckStripeConfig(env)!;
const customUrl =
  "https://pay.mealdeck.co.uk/c/pay/cs_test_fixture?prefilled=1#fidkdWxOYHwnPyd1blpf%2B";
const defaultUrl = "https://checkout.stripe.com/c/pay/cs_test_fixture#fidkdWxOYHwnPyd1blpf%2B";
const prepared = (): PreparedStripeOrder => ({
  orderId: "00000000-0000-4000-8000-000000000001",
  quoteId: "00000000-0000-4000-8000-000000000002",
  totalPence: 279,
  grossPence: 399,
  discountPence: 120,
  currency: "gbp",
  email: "customer@example.invalid",
  fulfilment: "pickup",
  sessionId: null,
  sessionUrl: null,
  expiresAt: new Date(Date.now() + 35 * 60_000).toISOString(),
  requestHash: "c".repeat(64),
  lines: [{ name: "The Ace", quantity: 1, line_pence: 399 }],
});
const response = (order = prepared()) => ({
  id: "cs_test_fixture",
  url: customUrl as string | null,
  livemode: false,
  mode: "payment",
  status: "open",
  payment_status: "unpaid",
  client_reference_id: order.orderId,
  amount_total: order.totalPence,
  currency: "gbp",
  metadata: {
    source: "mealdeck",
    mealdeck_order_id: order.orderId,
    mealdeck_quote_id: order.quoteId,
    mealdeck_request_hash: order.requestHash,
  },
});

describe("MealDeck's exact hosted Checkout domain", () => {
  test("requires the exact server setting and exposes no secret in its domain status", () => {
    expect(readMealDeckStripeCheckoutDomain({})).toEqual({
      status: "default",
      hostname: "checkout.stripe.com",
    });
    expect(readMealDeckStripeCheckoutDomain(env)).toEqual({
      status: "configured",
      hostname: "pay.mealdeck.co.uk",
    });
    expect(
      readMealDeckStripeCheckoutDomain({ VITE_MEALDECK_STRIPE_CHECKOUT_HOST: "pay.mealdeck.co.uk" })
        .status,
    ).toBe("default");
    for (const value of [
      "https://pay.mealdeck.co.uk",
      "*.mealdeck.co.uk",
      "pay.mealdeck.co.uk:443",
      "pay.mealdeck.co.uk/",
      "pay.mealdeck.co.uk.evil.invalid",
      "mealdeck.co.uk",
      "checkout.stripe.com,pay.mealdeck.co.uk",
      "other.example.invalid",
    ]) {
      const config = readMealDeckStripeConfig({ ...env, MEALDECK_STRIPE_CHECKOUT_HOST: value });
      // Credentials remain usable by webhooks and read-only reconciliation.
      expect(config).not.toBeNull();
      expect(config!.checkoutDomain).toEqual({ status: "invalid", hostname: null });
      expect(safeStripeCheckoutUrl(defaultUrl, config!.checkoutDomain)).toBeNull();
    }
  });

  test("preserves provider URLs byte-for-byte and retains existing Stripe sessions after opt-in", () => {
    expect(safeStripeCheckoutUrl(customUrl)).toBeNull();
    for (const value of [customUrl, defaultUrl]) {
      expect(safeStripeCheckoutUrl(value, stripe.checkoutDomain)).toBe(value);
      expect(safeMealDeckCheckoutRedirect(value)).toBe(value);
      expect(safeSharedPaymentCheckoutUrl(value)).toBe(value);
    }
    expect(safeHostedCheckoutUrl(defaultUrl)).toBe(defaultUrl);
  });

  test("rejects deceptive origins, wrong Stripe products, paths, credentials and malformed bytes", () => {
    for (const value of [
      "http://pay.mealdeck.co.uk/c/pay/cs_test_fixture",
      "//pay.mealdeck.co.uk/c/pay/cs_test_fixture",
      "https://pay.mealdeck.co.uk.evil.invalid/c/pay/cs_test_fixture",
      "https://x.pay.mealdeck.co.uk/c/pay/cs_test_fixture",
      "https://pay.mealdeck.co.uk./c/pay/cs_test_fixture",
      "https://user:secret@pay.mealdeck.co.uk/c/pay/cs_test_fixture",
      "https://pay.mealdeck.co.uk:8443/c/pay/cs_test_fixture",
      "https://pay.mealdeck.co.uk:443/c/pay/cs_test_fixture",
      "https://pay.mealdeck.co.uk/%63/pay/cs_test_fixture",
      "https://pay.mealdeck.co.uk/c/pay/../login",
      "https://pay.mealdeck.co.uk/c/pay/",
      "https://pay.mealdeck.co.uk/c/pay/cs_test_fixture/another",
      "https://pay.mealdeck.co.uk/c/pay/cs_test_fixture\\evil",
      "https://pay.mealdeck.co.uk/login",
      "https://pay.mealdeck.co.uk/p/session/bps_123",
      "https://buy.stripe.com/123",
      "https://billing.stripe.com/p/session/bps_123",
      " " + customUrl,
      customUrl + "\n",
      customUrl + "a".repeat(4096),
      null,
    ]) {
      expect(safeStripeCheckoutUrl(value, stripe.checkoutDomain)).toBeNull();
      expect(safeMealDeckCheckoutRedirect(value)).toBeNull();
      expect(safeSharedPaymentCheckoutUrl(value)).toBeNull();
    }
  });
});

describe("single-order Checkout recovery on the original provider Session", () => {
  test("creates once with the frozen attempt and reads current state before returning a custom URL", async () => {
    const order = prepared();
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = (async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return Response.json(response(order));
    }) as typeof fetch;
    expect(await resolveStripeCheckoutSession(stripe, order, fetcher)).toEqual({
      sessionId: "cs_test_fixture",
      url: customUrl,
    });
    expect(calls.map((call) => call.init?.method)).toEqual(["POST", "GET"]);
    expect(new Headers(calls[0]!.init?.headers).get("Idempotency-Key")).toBe(
      "mealdeck-order-" + order.orderId,
    );
    expect(calls[1]!.url).toBe("https://api.stripe.com/v1/checkout/sessions/cs_test_fixture");
    const form = new URLSearchParams(String(calls[0]!.init?.body));
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("279");
    expect(form.get("success_url")).toBe("https://mealdeck.co.uk/checkout?order=" + order.orderId);
    expect(form.toString()).not.toContain("pay.mealdeck");
  });

  test("recovers by saved Session ID even if its old URL is invalid; never creates a replacement", async () => {
    const order = {
      ...prepared(),
      sessionId: "cs_test_fixture",
      sessionUrl: "https://old.invalid/session",
    };
    const methods: string[] = [];
    const fetcher = (async (_url: unknown, init?: RequestInit) => {
      methods.push(init!.method!);
      return Response.json(response(order));
    }) as typeof fetch;
    expect((await resolveStripeCheckoutSession(stripe, order, fetcher)).url).toBe(customUrl);
    expect(methods).toEqual(["GET"]);
  });

  test("a lost-response retry cannot use the stale open POST response after payment", async () => {
    const order = prepared();
    const methods: string[] = [];
    const fetcher = (async (_url: unknown, init?: RequestInit) => {
      methods.push(init!.method!);
      return Response.json(
        init?.method === "POST"
          ? response(order)
          : {
              ...response(order),
              url: null,
              status: "complete",
              payment_status: "paid",
            },
      );
    }) as typeof fetch;
    await expect(resolveStripeCheckoutSession(stripe, order, fetcher)).rejects.toThrow(
      "already been submitted",
    );
    expect(methods).toEqual(["POST", "GET"]);
  });

  test("expired, completed, unrelated or mispriced Sessions never supply a payment link", async () => {
    const order = { ...prepared(), sessionId: "cs_test_fixture", sessionUrl: defaultUrl };
    for (const changed of [
      { ...response(order), status: "expired", url: null },
      { ...response(order), status: "complete", payment_status: "unpaid", url: null },
      { ...response(order), mode: "subscription" },
      { ...response(order), livemode: true },
      { ...response(order), amount_total: 1 },
      { ...response(order), client_reference_id: "another-order" },
      {
        ...response(order),
        metadata: { ...response(order).metadata, mealdeck_quote_id: "another-quote" },
      },
      { ...response(order), id: "cs_test_different" },
      { ...response(order), url: "https://pay.mealdeck.co.uk/c/pay/cs_test_different" },
      { ...response(order), url: "https://evil.invalid/c/pay/cs_test_fixture" },
    ]) {
      const methods: string[] = [];
      await expect(
        resolveStripeCheckoutSession(stripe, order, (async (_url, init) => {
          methods.push(init!.method!);
          return Response.json(changed);
        }) as typeof fetch),
      ).rejects.toThrow();
      expect(methods).toEqual(["GET"]);
    }
  });

  test("invalid custom configuration and expired unbound attempts stop before provider creation", async () => {
    let requests = 0;
    const fetcher = (async () => {
      requests++;
      return Response.json({});
    }) as typeof fetch;
    await expect(
      resolveStripeCheckoutSession(
        { ...stripe, checkoutDomain: { status: "invalid", hostname: null } },
        prepared(),
        fetcher,
      ),
    ).rejects.toThrow();
    await expect(
      resolveStripeCheckoutSession(
        stripe,
        { ...prepared(), expiresAt: new Date(Date.now() - 1).toISOString() },
        fetcher,
      ),
    ).rejects.toThrow("expired");
    expect(requests).toBe(0);
  });
});
