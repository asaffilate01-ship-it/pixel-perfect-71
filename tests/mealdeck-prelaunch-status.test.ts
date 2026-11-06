import { describe, expect, test } from "bun:test";
import { launchMenuBrands } from "../src/lib/launch-menu-catalogue";
import {
  handleOnlineCheckoutRequest,
  readOnlineCheckoutStatus,
} from "../src/lib/mealdeck-online-checkout.server";
import { handleGroupOrdersRequest } from "../src/lib/mealdeck-group-rooms.server";
import { handleSharedPaymentsRequest } from "../src/lib/mealdeck-shared-payments.server";
import { requestMealDeckAvailability } from "../src/lib/mealdeck-checkout-browser";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tester = id(3);
const other = id(4);
const env = {
  MEALDECK_SUPABASE_URL: "https://prelaunchfixture.supabase.co",
  MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prelaunch_fixture_public_only",
  MEALDECK_CHECKOUT_SERVER_KEY: "sb_secret_prelaunch_fixture_server_only",
  MEALDECK_TENANT_ID: id(1),
  MEALDECK_LUTON_LOCATION_ID: id(2),
  MEALDECK_ONLINE_CHECKOUT_ENABLED: "true",
  MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "signed-off",
  MEALDECK_STRIPE_SECRET_KEY: "sk_live_" + "a".repeat(32),
  MEALDECK_STRIPE_WEBHOOK_SECRET: "whsec_" + "b".repeat(32),
  MEALDECK_STRIPE_ACCOUNT_ID: "acct_fixture",
  MEALDECK_STRIPE_MODE: "live",
  MEALDECK_SHARED_PAYMENTS_ENABLED: "true",
  MEALDECK_GROUP_LINK_SECRET: "g".repeat(64),
};
const token = "fixture_prelaunch_bearer_long_enough";
const verificationWindow = {
  startsAt: "2026-11-06T08:00:00Z",
  expiresAt: "2026-11-06T23:00:00Z",
};

// HTTP contract tests with simulated Auth and database. No provider call, email,
// production login or financial action is made by this fixture.
function fixture() {
  const calls: { name: string; args: Record<string, unknown>; key: string | null }[] = [];
  const state = {
    at: "2026-11-06T10:30:00Z",
    userId: tester,
    verified: true,
    anonymous: false,
    badToken: false,
    kitchen: "online",
    configured: true,
    missingRpc: false,
    providerCrossesCutoff: false,
    publicStatusOverrides: {} as Record<string, unknown>,
    privateStatusOverrides: {} as Record<string, unknown>,
  };
  function status(privateCustomer?: unknown) {
    const at = Date.parse(state.at);
    const publicOpen =
      at >= Date.parse("2026-11-06T15:00:00Z") && at < Date.parse("2026-11-06T23:00:00Z");
    const testOpen =
      privateCustomer === tester &&
      at >= Date.parse(verificationWindow.startsAt) &&
      at < Date.parse(verificationWindow.expiresAt);
    const open =
      (publicOpen || testOpen) && state.configured && ["online", "busy"].includes(state.kitchen);
    return {
      channelOpen: open,
      guestCheckoutEligible: open && publicOpen && !testOpen,
      kitchen: { state: state.kitchen, collectionEstimateMinutes: 30 },
      openingOffer: {
        status: publicOpen || testOpen ? "active" : "upcoming",
        startsAt: "2026-11-06T15:00:00Z",
        endsAt: "2026-11-08T23:00:00Z",
        timezone: "Europe/London",
        serverNow: state.at,
      },
      ...(privateCustomer === undefined
        ? state.publicStatusOverrides
        : {
            liveVerification: testOpen
              ? { eligible: true, ...verificationWindow }
              : { eligible: false },
            ...state.privateStatusOverrides,
          }),
    };
  }
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const headers = new Headers(init?.headers);
    const name = url.pathname.split("/").at(-1)!;
    const args: Record<string, unknown> =
      init?.body && String(init.body).startsWith("{") ? JSON.parse(String(init.body)) : {};
    calls.push({ name, args, key: headers.get("apikey") });
    if (url.pathname === "/auth/v1/user") {
      if (state.badToken) return Response.json({ message: "Invalid session" }, { status: 401 });
      return Response.json({
        id: state.userId,
        email: state.userId === tester ? "test@mealdeck.co.uk" : "other@example.invalid",
        email_confirmed_at: state.verified ? "2026-11-06T08:00:00Z" : null,
        is_anonymous: state.anonymous,
      });
    }
    if (name === "mealdeck_online_checkout_status") return Response.json(status());
    if (name === "mealdeck_checkout_status_for_customer") {
      if (state.missingRpc)
        return Response.json({ code: "PGRST202", message: "Missing extension" }, { status: 404 });
      return Response.json(status(args["p_customer"]));
    }
    if (name === "mealdeck_create_checkout_quote")
      return Response.json({ quoteId: id(5), totalPence: 279 });
    if (name === "account" && url.hostname === "api.stripe.com") {
      if (state.providerCrossesCutoff) state.at = verificationWindow.expiresAt;
      return Response.json({ id: "acct_fixture", charges_enabled: true });
    }
    if (name === "mealdeck_prepare_stripe_order")
      return Response.json({
        orderId: id(6),
        quoteId: id(5),
        totalPence: 279,
        grossPence: 399,
        discountPence: 120,
        currency: "gbp",
        email: "test@mealdeck.co.uk",
        fulfilment: "pickup",
        sessionId: null,
        sessionUrl: null,
        expiresAt: new Date(Date.now() + 35 * 60_000).toISOString(),
        requestHash: "d".repeat(64),
        lines: [{ name: "The Ace", quantity: 1, line_pence: 399 }],
      });
    if (["sessions", "cs_live_prelaunch"].includes(name) && url.hostname === "api.stripe.com")
      return Response.json({
        id: "cs_live_prelaunch",
        url: "https://checkout.stripe.com/c/pay/cs_live_prelaunch",
        livemode: true,
        mode: "payment",
        status: "open",
        payment_status: "unpaid",
        client_reference_id: id(6),
        amount_total: 279,
        currency: "gbp",
        metadata: {
          source: "mealdeck",
          mealdeck_order_id: id(6),
          mealdeck_quote_id: id(5),
          mealdeck_request_hash: "d".repeat(64),
        },
      });
    if (name === "mealdeck_bind_stripe_session") return Response.json(true);
    throw new Error("Unexpected provider request: " + url.pathname);
  }) as typeof fetch;
  const request = (path = "/api/checkout", authorised = true, input?: unknown) =>
    new Request("https://mealdeck.co.uk" + path, {
      method: input ? "POST" : "GET",
      headers: {
        ...(authorised ? { Authorization: "Bearer " + token } : {}),
        ...(input ? { "Content-Type": "application/json", Origin: "https://mealdeck.co.uk" } : {}),
      },
      ...(input ? { body: JSON.stringify(input) } : {}),
    });
  return { state, calls, fetcher, request };
}

describe("identity-bound prelaunch availability", () => {
  test("the public endpoint stays closed while the approved account has access", async () => {
    const f = fixture();
    expect((await readOnlineCheckoutStatus(env, f.fetcher)).available).toBe(false);
    expect(f.calls.some((c) => c.name === "mealdeck_checkout_status_for_customer")).toBe(false);
    const response = await handleOnlineCheckoutRequest(f.request(), env, f.fetcher);
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(response.headers.get("Vary")).toContain("Authorization");
    expect(result.available).toBe(true);
    expect(result.guestCheckout.eligible).toBe(false);
    expect(result.kitchen.state).toBe("online");
    const scoped = f.calls.find((c) => c.name === "mealdeck_checkout_status_for_customer")!;
    expect(scoped.key).toBe(env.MEALDECK_CHECKOUT_SERVER_KEY);
    expect(scoped.args).toEqual({ p_tenant: id(1), p_location: id(2), p_customer: tester });
    expect(JSON.stringify(result)).not.toContain(env.MEALDECK_CHECKOUT_SERVER_KEY);
  });

  test("another valid account cannot borrow the test account via request parameters", async () => {
    const f = fixture();
    f.state.at = "2026-11-06T15:30:00Z";
    f.state.userId = other;
    const runtime = { ...env, MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "" };
    const response = await handleOnlineCheckoutRequest(
      f.request("/api/checkout?email=test%40mealdeck.co.uk&customerId=" + tester),
      runtime,
      f.fetcher,
    );
    expect((await response.json()).available).toBe(false);
    expect(
      f.calls.find((c) => c.name === "mealdeck_checkout_status_for_customer")?.args["p_customer"],
    ).toBe(other);
    f.calls.length = 0;
    const anonymous = await handleOnlineCheckoutRequest(
      f.request("/api/checkout?email=test%40mealdeck.co.uk", false),
      runtime,
      f.fetcher,
    );
    expect((await anonymous.json()).available).toBe(false);
    expect(f.calls.some((c) => c.name === "mealdeck_checkout_status_for_customer")).toBe(false);
  });

  test("invalid, unverified and anonymous Auth identities do not gain early access", async () => {
    for (const change of [{ badToken: true }, { verified: false }, { anonymous: true }]) {
      const f = fixture();
      f.state.at = "2026-11-06T15:30:00Z";
      Object.assign(f.state, change);
      const response = await handleOnlineCheckoutRequest(
        f.request(),
        { ...env, MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "" },
        f.fetcher,
      );
      expect(response.status).toBe(401);
      expect(f.calls.some((c) => c.name === "mealdeck_checkout_status_for_customer")).toBe(false);
    }
  });

  test("public signoff uses normal public eligibility from the scheduled opening", async () => {
    const f = fixture();
    for (const [at, allowed, guest] of [
      ["2026-11-06T07:59:59Z", false, false],
      ["2026-11-06T08:00:00Z", true, false],
      ["2026-11-06T14:59:59Z", true, false],
      ["2026-11-06T15:00:00Z", true, true],
    ] as const) {
      f.state.at = at;
      const response = await handleOnlineCheckoutRequest(f.request(), env, f.fetcher);
      const data = await response.json();
      expect(data.available).toBe(allowed);
      expect(data.guestCheckout.eligible).toBe(guest);
    }
    const anonymous = await handleOnlineCheckoutRequest(
      f.request("/api/checkout", false),
      env,
      f.fetcher,
    );
    expect((await anonymous.json()).available).toBe(true);
  });

  test("operator pause/closed, missing RPC and incomplete payment configuration still close checkout", async () => {
    const runtime = { ...env, MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "" };
    for (const kitchen of ["paused", "closed"]) {
      const f = fixture();
      f.state.at = "2026-11-06T15:30:00Z";
      f.state.kitchen = kitchen;
      const response = await handleOnlineCheckoutRequest(f.request(), runtime, f.fetcher);
      const data = await response.json();
      expect(data.available).toBe(false);
      expect(data.kitchen.state).toBe(kitchen);
      expect(f.calls.some((c) => c.name === "mealdeck_checkout_status_for_customer")).toBe(false);
    }
    const missing = fixture();
    missing.state.at = "2026-11-06T15:30:00Z";
    missing.state.missingRpc = true;
    expect(
      await (await handleOnlineCheckoutRequest(missing.request(), runtime, missing.fetcher)).json(),
    ).toMatchObject({
      available: false,
      prelaunchVerification: false,
      kitchen: { state: "online", collectionEstimateMinutes: 30 },
      openingOffer: { status: "active" },
    });
    for (const setting of [
      "MEALDECK_ONLINE_CHECKOUT_ENABLED",
      "MEALDECK_STRIPE_SECRET_KEY",
      "MEALDECK_STRIPE_WEBHOOK_SECRET",
      "MEALDECK_STRIPE_ACCOUNT_ID",
      "MEALDECK_CHECKOUT_SERVER_KEY",
    ]) {
      const f = fixture();
      f.state.at = "2026-11-06T15:30:00Z";
      const response = await handleOnlineCheckoutRequest(
        f.request(),
        { ...runtime, [setting]: "" },
        f.fetcher,
      );
      expect((await response.json()).available).toBe(false);
    }
  });

  test("private admission follows the database clock until its exclusive expiry", async () => {
    const f = fixture();
    const runtime = { ...env, MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "" };
    for (const [at, admitted] of [
      ["2026-11-06T07:59:59Z", false],
      ["2026-11-06T08:00:00Z", true],
      ["2026-11-06T14:59:59Z", true],
      ["2026-11-06T15:00:00Z", true],
      ["2026-11-06T22:59:59Z", true],
      ["2026-11-06T23:00:00Z", false],
    ] as const) {
      f.state.at = at;
      const response = await handleOnlineCheckoutRequest(f.request(), runtime, f.fetcher);
      expect(await response.json()).toMatchObject({
        available: admitted,
        prelaunchVerification: admitted,
        guestCheckout: { eligible: false },
      });
    }
  });

  test("an open schedule and missing, malformed or expired private evidence cannot waive signoff", async () => {
    const runtime = { ...env, MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "" };
    for (const evidence of [
      undefined,
      null,
      {},
      { eligible: false },
      { eligible: "true", ...verificationWindow },
      { eligible: true, expiresAt: verificationWindow.expiresAt },
      { eligible: true, startsAt: verificationWindow.startsAt },
      { eligible: true, ...verificationWindow, startsAt: "not-a-date" },
      { eligible: true, ...verificationWindow, expiresAt: "not-a-date" },
      { eligible: true, ...verificationWindow, startsAt: "2026-11-06T16:00:00Z" },
      { eligible: true, ...verificationWindow, expiresAt: "2026-11-06T15:30:00Z" },
      { eligible: true, ...verificationWindow, startsAt: "2026-11-06T07:00:00Z" },
      { eligible: true, ...verificationWindow, expiresAt: "2026-11-07T00:00:00Z" },
    ]) {
      const f = fixture();
      f.state.at = "2026-11-06T15:30:00Z";
      f.state.privateStatusOverrides = { liveVerification: evidence };
      const response = await handleOnlineCheckoutRequest(f.request(), runtime, f.fetcher);
      expect(await response.json()).toMatchObject({
        available: false,
        prelaunchVerification: false,
        guestCheckout: { eligible: false },
        kitchen: { state: "online" },
      });
    }
  });

  test("verification evidence is private-only and never permits guest checkout", async () => {
    const runtime = { ...env, MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "" };
    const f = fixture();
    f.state.at = "2026-11-06T15:30:00Z";
    f.state.publicStatusOverrides = {
      liveVerification: { eligible: true, ...verificationWindow },
      guestCheckoutEligible: false,
    };
    const publicResponse = await handleOnlineCheckoutRequest(
      f.request("/api/checkout", false),
      runtime,
      f.fetcher,
    );
    expect(await publicResponse.json()).toMatchObject({
      available: false,
      prelaunchVerification: false,
    });
    expect(f.calls.some((call) => call.name === "mealdeck_checkout_status_for_customer")).toBe(
      false,
    );
    f.state.privateStatusOverrides = { guestCheckoutEligible: true };
    const privateResponse = await handleOnlineCheckoutRequest(f.request(), runtime, f.fetcher);
    expect(await privateResponse.json()).toMatchObject({
      available: false,
      prelaunchVerification: false,
      guestCheckout: { eligible: false },
    });
  });

  test("signed-off public ordering does not depend on the private verification extension", async () => {
    const f = fixture();
    f.state.at = "2026-11-06T15:30:00Z";
    f.state.missingRpc = true;
    for (const authenticated of [true, false]) {
      const response = await handleOnlineCheckoutRequest(
        f.request("/api/checkout", authenticated),
        env,
        f.fetcher,
      );
      expect(await response.json()).toMatchObject({
        available: true,
        prelaunchVerification: false,
        guestCheckout: { eligible: true },
      });
    }
    expect(f.calls.some((call) => call.name === "mealdeck_checkout_status_for_customer")).toBe(
      false,
    );
  });

  test("ordinary quote requests use the verified account, not public-only availability", async () => {
    const f = fixture();
    const brand = launchMenuBrands.find((b) => b.id === "skorch-burgers")!;
    const item = brand.sections.flatMap((s) => s.items).find((i) => i.name === "The Ace")!;
    const body = {
      action: "quote",
      fulfilment: "pickup",
      picks: [{ brandId: brand.id, itemId: item.id, quantity: 1, selections: {} }],
      packing: { cutleryRequested: false, separateBags: false, bagCount: 1, allocations: [] },
    };
    const response = await handleOnlineCheckoutRequest(
      f.request("/api/checkout", true, body),
      env,
      f.fetcher,
    );
    expect(response.status).toBe(200);
    expect(
      f.calls.find((c) => c.name === "mealdeck_create_checkout_quote")?.args["p_customer"],
    ).toBe(tester);
    f.state.userId = other;
    f.calls.length = 0;
    expect(
      (await handleOnlineCheckoutRequest(f.request("/api/checkout", true, body), env, f.fetcher))
        .status,
    ).toBe(503);
    expect(f.calls.some((c) => c.name === "mealdeck_create_checkout_quote")).toBe(false);
  });

  test("existing group payment capabilities keep their identity boundary while new rooms wait until Monday", async () => {
    for (const [path, handler] of [
      ["/api/group-orders", handleGroupOrdersRequest],
      ["/api/group-payments", handleSharedPaymentsRequest],
    ] as const) {
      const f = fixture();
      const signedIn = await handler(f.request(path), env, f.fetcher, () =>
        Date.parse("2026-11-06T10:30:00Z"),
      );
      expect(signedIn.status).toBe(200);
      const capabilities = await signedIn.json();
      expect(capabilities.available).toBe(path === "/api/group-payments");
      expect(capabilities.newRoomsAvailable).toBe(false);
      expect(capabilities.groupOrderingStartsAt).toBe("2026-11-09T00:00:00Z");
      const anonymous = await handler(f.request(path, false), env, f.fetcher);
      expect((await anonymous.json()).available).toBe(false);
      f.state.userId = other;
      expect((await (await handler(f.request(path), env, f.fetcher)).json()).available).toBe(false);
    }
  });

  test("only the admitted live verification may run after scheduled opening while signoff is pending", async () => {
    const runtime = { ...env, MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "" };
    const f = fixture();
    f.state.at = "2026-11-06T15:30:00Z";
    let response = await handleOnlineCheckoutRequest(f.request(), runtime, f.fetcher);
    expect(await response.json()).toMatchObject({ available: true, prelaunchVerification: true });
    const payment = { action: "pay", quoteId: id(5), attemptId: id(9), reviewConfirmed: true };
    response = await handleOnlineCheckoutRequest(
      f.request("/api/checkout", true, payment),
      runtime,
      f.fetcher,
    );
    expect(response.status).toBe(200);
    expect(
      f.calls.find((c) => c.name === "mealdeck_prepare_stripe_order")?.args["p_livemode"],
    ).toBe(true);
    expect(f.calls.filter((c) => c.name === "sessions")).toHaveLength(1);
    expect(f.calls.some((c) => /confirm.*payment|release.*kds/.test(c.name))).toBe(false);
    f.state.userId = other;
    expect(
      (await (await handleOnlineCheckoutRequest(f.request(), runtime, f.fetcher)).json()).available,
    ).toBe(false);
    f.state.userId = tester;
    f.state.at = verificationWindow.expiresAt;
    expect(
      await (await handleOnlineCheckoutRequest(f.request(), runtime, f.fetcher)).json(),
    ).toMatchObject({ available: false, prelaunchVerification: false });
    expect(
      (
        await (
          await handleOnlineCheckoutRequest(f.request("/api/checkout", false), runtime, f.fetcher)
        ).json()
      ).available,
    ).toBe(false);
  });

  test("provider checks crossing the private expiry cannot prepare a payment without public signoff", async () => {
    const f = fixture();
    f.state.at = "2026-11-06T22:59:59Z";
    f.state.providerCrossesCutoff = true;
    const response = await handleOnlineCheckoutRequest(
      f.request("/api/checkout", true, {
        action: "pay",
        quoteId: id(5),
        attemptId: id(9),
        reviewConfirmed: true,
      }),
      { ...env, MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "" },
      f.fetcher,
    );
    expect(response.status).toBe(503);
    expect(
      f.calls.some((c) => c.name === "mealdeck_prepare_stripe_order" || c.name === "sessions"),
    ).toBe(false);
  });

  test("sandbox credentials never enable this live verification or public trading", async () => {
    const f = fixture();
    const sandbox = {
      ...env,
      MEALDECK_STRIPE_MODE: "test",
      MEALDECK_STRIPE_SECRET_KEY: "sk_test_" + "a".repeat(32),
    };
    expect(
      (await (await handleOnlineCheckoutRequest(f.request(), sandbox, f.fetcher)).json()).available,
    ).toBe(false);
    f.state.at = "2026-11-06T15:00:00Z";
    expect(
      (
        await (
          await handleOnlineCheckoutRequest(f.request("/api/checkout", false), sandbox, f.fetcher)
        ).json()
      ).available,
    ).toBe(false);
  });
});

describe("private availability transport", () => {
  test("all three availability URLs send the current bearer with no-store and same-origin", async () => {
    const sent: RequestInit[] = [];
    const fetcher = (async (_input: unknown, init?: RequestInit) => {
      sent.push(init!);
      return Response.json({ available: true });
    }) as typeof fetch;
    for (const path of ["/api/checkout", "/api/group-orders", "/api/group-payments"] as const)
      await requestMealDeckAvailability(path, async () => token, undefined, fetcher);
    expect(sent).toHaveLength(3);
    for (const init of sent) {
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer " + token);
      expect(init.cache).toBe("no-store");
      expect(init.credentials).toBe("same-origin");
    }
  });
  test("missing local identity stays anonymous and an aborted lookup sends nothing", async () => {
    const sent: RequestInit[] = [];
    const fetcher = (async (_input: unknown, init?: RequestInit) => {
      sent.push(init!);
      return Response.json({ available: false });
    }) as typeof fetch;
    await requestMealDeckAvailability("/api/checkout", async () => null, undefined, fetcher);
    expect(new Headers(sent[0]?.headers).has("Authorization")).toBe(false);
    const controller = new AbortController();
    controller.abort();
    await expect(
      requestMealDeckAvailability("/api/checkout", async () => token, controller.signal, fetcher),
    ).rejects.toThrow("Request aborted");
    expect(sent).toHaveLength(1);
  });
});
