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
  MEALDECK_STRIPE_SECRET_KEY: "sk_test_" + "a".repeat(32),
  MEALDECK_STRIPE_WEBHOOK_SECRET: "whsec_" + "b".repeat(32),
  MEALDECK_STRIPE_ACCOUNT_ID: "acct_fixture",
  MEALDECK_STRIPE_MODE: "test",
  MEALDECK_SHARED_PAYMENTS_ENABLED: "true",
  MEALDECK_GROUP_LINK_SECRET: "g".repeat(64),
};
const token = "fixture_prelaunch_bearer_long_enough";

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
  };
  function status(privateCustomer?: unknown) {
    const at = Date.parse(state.at);
    const publicOpen = at >= Date.parse("2026-11-06T15:00:00Z");
    const testOpen =
      privateCustomer === tester && at >= Date.parse("2026-11-06T08:00:00Z") && !publicOpen;
    const open =
      (publicOpen || testOpen) && state.configured && ["online", "busy"].includes(state.kitchen);
    return {
      channelOpen: open,
      guestCheckoutEligible: open && publicOpen,
      kitchen: { state: state.kitchen, collectionEstimateMinutes: 30 },
      openingOffer: {
        status: publicOpen || testOpen ? "active" : "upcoming",
        startsAt: "2026-11-06T15:00:00Z",
        endsAt: "2026-11-08T23:00:00Z",
        timezone: "Europe/London",
        serverNow: state.at,
      },
    };
  }
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const headers = new Headers(init?.headers);
    const name = url.pathname.split("/").at(-1)!;
    const args: Record<string, unknown> = init?.body ? JSON.parse(String(init.body)) : {};
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
    f.state.userId = other;
    const response = await handleOnlineCheckoutRequest(
      f.request("/api/checkout?email=test%40mealdeck.co.uk&customerId=" + tester),
      env,
      f.fetcher,
    );
    expect((await response.json()).available).toBe(false);
    expect(
      f.calls.find((c) => c.name === "mealdeck_checkout_status_for_customer")?.args["p_customer"],
    ).toBe(other);
    f.calls.length = 0;
    const anonymous = await handleOnlineCheckoutRequest(
      f.request("/api/checkout?email=test%40mealdeck.co.uk", false),
      env,
      f.fetcher,
    );
    expect((await anonymous.json()).available).toBe(false);
    expect(f.calls.some((c) => c.name === "mealdeck_checkout_status_for_customer")).toBe(false);
  });

  test("invalid, unverified and anonymous Auth identities do not gain early access", async () => {
    for (const change of [{ badToken: true }, { verified: false }, { anonymous: true }]) {
      const f = fixture();
      Object.assign(f.state, change);
      const response = await handleOnlineCheckoutRequest(f.request(), env, f.fetcher);
      expect(response.status).toBe(401);
      expect(f.calls.some((c) => c.name === "mealdeck_checkout_status_for_customer")).toBe(false);
    }
  });

  test("the server's 08:00–14:59:59 window hands back to public eligibility at 15:00", async () => {
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
    for (const kitchen of ["paused", "closed"]) {
      const f = fixture();
      f.state.kitchen = kitchen;
      const response = await handleOnlineCheckoutRequest(f.request(), env, f.fetcher);
      const data = await response.json();
      expect(data.available).toBe(false);
      expect(data.kitchen.state).toBe(kitchen);
      expect(f.calls.some((c) => c.name === "mealdeck_checkout_status_for_customer")).toBe(false);
    }
    const missing = fixture();
    missing.state.missingRpc = true;
    expect(
      (await (await handleOnlineCheckoutRequest(missing.request(), env, missing.fetcher)).json())
        .available,
    ).toBe(false);
    for (const setting of [
      "MEALDECK_ONLINE_CHECKOUT_ENABLED",
      "MEALDECK_CHECKOUT_INTEGRATION_APPROVED",
      "MEALDECK_STRIPE_SECRET_KEY",
      "MEALDECK_CHECKOUT_SERVER_KEY",
    ]) {
      const f = fixture();
      const response = await handleOnlineCheckoutRequest(
        f.request(),
        { ...env, [setting]: "" },
        f.fetcher,
      );
      expect((await response.json()).available).toBe(false);
    }
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

  test("group room and shared-payment capability reads use the same account boundary", async () => {
    for (const [path, handler] of [
      ["/api/group-orders", handleGroupOrdersRequest],
      ["/api/group-payments", handleSharedPaymentsRequest],
    ] as const) {
      const f = fixture();
      const signedIn = await handler(f.request(path), env, f.fetcher);
      expect(signedIn.status).toBe(200);
      expect((await signedIn.json()).available).toBe(true);
      const anonymous = await handler(f.request(path, false), env, f.fetcher);
      expect((await anonymous.json()).available).toBe(false);
      f.state.userId = other;
      expect((await (await handler(f.request(path), env, f.fetcher)).json()).available).toBe(false);
    }
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
