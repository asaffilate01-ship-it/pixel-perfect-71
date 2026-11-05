import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  handleOnlineCheckoutRequest,
  readOnlineCheckoutStatus,
} from "../src/lib/mealdeck-online-checkout.server";
import {
  GUEST_PRIVACY_VERSION,
  normaliseGuestInput,
  parseGuestCheckoutState,
} from "../src/lib/mealdeck-guest";
import {
  GUEST_COOKIE_NAME,
  guestTokenHash,
  newGuestToken,
  readGuestToken,
} from "../src/lib/mealdeck-guest-session.server";
import { launchMenuBrands } from "../src/lib/launch-menu-catalogue";

const tenant = "10000000-0000-4000-8000-000000000001";
const location = "20000000-0000-4000-8000-000000000001";
const guestId = "30000000-0000-4000-8000-000000000001";
const memberId = "40000000-0000-4000-8000-000000000001";
const quoteId = "50000000-0000-4000-8000-000000000001";
const orderId = "60000000-0000-4000-8000-000000000001";
const env = {
  MEALDECK_SUPABASE_URL: "https://mealdeckfixture.supabase.co",
  MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_mealdeck_fixture_public_only",
  MEALDECK_CHECKOUT_SERVER_KEY: "sb_secret_mealdeck_fixture_server_only",
  MEALDECK_TENANT_ID: tenant,
  MEALDECK_LUTON_LOCATION_ID: location,
  MEALDECK_ONLINE_CHECKOUT_ENABLED: "true",
  MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "signed-off",
  MEALDECK_STRIPE_SECRET_KEY: "sk_test_" + "a".repeat(32),
  MEALDECK_STRIPE_WEBHOOK_SECRET: "whsec_" + "b".repeat(32),
  MEALDECK_STRIPE_ACCOUNT_ID: "acct_fixture",
  MEALDECK_STRIPE_MODE: "test",
};
const contact = {
  action: "guest",
  name: "Guest Customer",
  email: "guest@example.invalid",
  phone: "07700900123",
  privacyVersion: GUEST_PRIVACY_VERSION,
};
const normalContact = { name: contact.name, email: contact.email, phone: "+447700900123" };
const prepared = {
  orderId,
  quoteId,
  totalPence: 279,
  grossPence: 399,
  discountPence: 120,
  currency: "gbp",
  email: contact.email,
  fulfilment: "pickup",
  sessionId: null,
  sessionUrl: null,
  expiresAt: new Date(Date.now() + 35 * 60_000).toISOString(),
  requestHash: "a".repeat(64),
  lines: [{ name: "The Ace", quantity: 1, line_pence: 399 }],
};

function fixture() {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const sessions = new Map<string, Record<string, unknown>>();
  const state = {
    eligible: true,
    channel: true,
    verifiedMember: true,
    kitchen: { state: "online", collectionEstimateMinutes: 25 } as unknown,
  };
  let receiptHash: string | null = null;
  const error = (message: string) => Response.json({ message, code: "P0001" }, { status: 400 });
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const name = url.pathname.split("/").at(-1)!;
    const args =
      init?.body && String(init.body).startsWith("{") ? JSON.parse(String(init.body)) : {};
    calls.push({ name, args });
    if (url.pathname === "/auth/v1/user")
      return state.verifiedMember
        ? Response.json({
            id: memberId,
            email: "member@example.invalid",
            email_confirmed_at: "2026-11-01T10:00:00Z",
            is_anonymous: false,
          })
        : Response.json({ message: "Invalid session" }, { status: 401 });
    if (name === "mealdeck_online_checkout_status")
      return Response.json({
        channelOpen: state.channel,
        guestCheckoutEligible: state.eligible,
        kitchen: state.kitchen,
        openingOffer: {
          status: "active",
          startsAt: "2026-11-06T15:00:00Z",
          endsAt: "2026-11-08T23:00:00Z",
          timezone: "Europe/London",
          serverNow: "2026-11-06T16:00:00Z",
        },
      });
    if (name === "mealdeck_begin_guest_session") {
      const session = {
        guestId,
        name: args.p_name,
        email: args.p_email,
        phone: args.p_phone,
        expiresAt: "2026-12-06T16:00:00Z",
        loyaltyEligible: false,
      };
      sessions.set(String(args.p_token_hash), session);
      return Response.json(session);
    }
    if (name === "mealdeck_resolve_guest_session")
      return Response.json(sessions.get(String(args.p_token_hash)) ?? null);
    if (name === "mealdeck_end_guest_session") {
      sessions.delete(String(args.p_token_hash));
      return Response.json(true);
    }
    if (name === "mealdeck_create_guest_checkout_quote")
      return state.eligible
        ? Response.json({ quoteId, totalPence: 279 })
        : error("mealdeck_checkout_guest_window_closed");
    if (name === "mealdeck_create_checkout_quote")
      return Response.json({ quoteId, totalPence: 279 });
    if (name === "mealdeck_prepare_guest_stripe_order") {
      if (!state.eligible) return error("mealdeck_checkout_guest_window_closed");
      receiptHash = String(args.p_token_hash);
      return Response.json(prepared);
    }
    if (name === "mealdeck_guest_order_receipt")
      return receiptHash === args.p_token_hash && args.p_order === orderId
        ? Response.json({ orderId, verifiedPaid: false, status: "payment_pending" })
        : error("mealdeck_checkout_order_unavailable");
    if (url.hostname === "api.stripe.com" && name === "account")
      return Response.json({ id: env.MEALDECK_STRIPE_ACCOUNT_ID, charges_enabled: true });
    if (url.hostname === "api.stripe.com" && ["sessions", "cs_test_guest"].includes(name))
      return Response.json({
        id: "cs_test_guest",
        url: "https://checkout.stripe.com/c/pay/cs_test_guest",
        livemode: false,
        client_reference_id: orderId,
        amount_total: 279,
        currency: "gbp",
        mode: "payment",
        status: "open",
        payment_status: "unpaid",
        metadata: {
          source: "mealdeck",
          mealdeck_order_id: orderId,
          mealdeck_quote_id: quoteId,
          mealdeck_request_hash: prepared.requestHash,
        },
      });
    if (name === "mealdeck_bind_stripe_session") return Response.json(true);
    throw new Error("Unexpected call: " + name);
  }) as typeof fetch;
  const post = (body: unknown, cookie = "", extras: Record<string, string> = {}, runtime = env) =>
    handleOnlineCheckoutRequest(
      new Request("https://mealdeck.co.uk/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://mealdeck.co.uk",
          ...(cookie ? { Cookie: cookie } : {}),
          ...extras,
        },
        body: JSON.stringify(body),
      }),
      runtime,
      fetcher,
    );
  const start = async () => {
    const response = await post(contact);
    expect(response.status).toBe(200);
    return response.headers.get("Set-Cookie")!.split(";")[0]!;
  };
  return { calls, sessions, state, fetcher, post, start };
}

function selection() {
  const brand = launchMenuBrands.find((b) => b.id === "skorch-burgers")!;
  const item = brand.sections.flatMap((s) => s.items).find((i) => i.name === "The Ace")!;
  return {
    action: "quote",
    fulfilment: "pickup",
    picks: [{ brandId: brand.id, itemId: item.id, quantity: 1, selections: {} }],
    packing: { cutleryRequested: false, separateBags: false, bagCount: 1, allocations: [] },
  };
}
const pay = {
  action: "pay",
  quoteId,
  attemptId: "70000000-0000-4000-8000-000000000001",
  reviewConfirmed: true,
};

describe("guest checkout private browser capability", () => {
  test("uses high-entropy host-only HttpOnly cookies, persists only a digest and creates no Auth account", async () => {
    const f = fixture();
    const response = await f.post(contact);
    expect(response.status).toBe(200);
    const cookie = response.headers.get("Set-Cookie")!;
    for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=2592000"])
      expect(cookie).toContain(flag);
    expect(cookie).not.toContain("Domain=");
    const token = readGuestToken(cookie)!;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const body = await response.text();
    expect(body).not.toContain(token);
    expect(JSON.parse(body).guestCheckout.session).toEqual({ id: guestId, ...normalContact });
    expect(f.calls.find((c) => c.name === "mealdeck_begin_guest_session")?.args).toEqual({
      p_tenant: tenant,
      p_location: location,
      p_token_hash: createHash("sha256").update(token).digest("hex"),
      p_name: normalContact.name,
      p_email: normalContact.email,
      p_phone: normalContact.phone,
    });
    expect(f.calls.some((c) => /signup|register|preferences|loyalty|invite/.test(c.name))).toBe(
      false,
    );
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Vary")).toContain("Cookie");
  });
  test("rejects injected member/price/consent fields and normalises only guest contact details", async () => {
    expect(normaliseGuestInput(contact)).toEqual(normalContact);
    for (const extra of [
      { member: true },
      { customerId: memberId },
      { points: 1000 },
      { emailMarketing: true },
      { totalPence: 1 },
      { privacyVersion: "old" },
    ]) {
      const f = fixture();
      expect((await f.post({ ...contact, ...extra })).status).toBe(400);
      expect(f.calls.some((c) => c.name === "mealdeck_begin_guest_session")).toBe(false);
    }
    expect(parseGuestCheckoutState({ eligible: "true", session: null })).toBeNull();
    expect(
      parseGuestCheckoutState({ eligible: true, session: { id: guestId, ...normalContact } }),
    ).not.toBeNull();
  });
  test("does not create a session outside server-approved opening hours or when payment gates are off", async () => {
    const f = fixture();
    f.state.eligible = false;
    expect((await f.post(contact)).status).toBe(403);
    f.state.eligible = true;
    expect(
      (await f.post(contact, "", {}, { ...env, MEALDECK_ONLINE_CHECKOUT_ENABLED: "false" })).status,
    ).toBe(403);
    expect(f.calls.some((c) => c.name === "mealdeck_begin_guest_session")).toBe(false);
  });
  test("requires same-origin guest mutations and rejects malformed or duplicate cookie identities", async () => {
    const f = fixture();
    for (const origin of ["https://attacker.invalid", "null", ""])
      expect((await f.post(contact, "", { Origin: origin })).status).toBe(403);
    expect((await f.post(contact, "", { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    const cookie = await f.start();
    expect(readGuestToken(cookie + "; " + cookie)).toBeNull();
    expect(readGuestToken(GUEST_COOKIE_NAME + "=short")).toBeNull();
    expect((await f.post(selection(), cookie + "; " + cookie)).status).toBe(401);
    expect(newGuestToken()).not.toBe(newGuestToken());
  });
  test("reuses identical session contact but requires explicit ending before identity change", async () => {
    const f = fixture();
    const cookie = await f.start();
    expect((await f.post(contact, cookie)).status).toBe(200);
    expect(f.calls.filter((c) => c.name === "mealdeck_begin_guest_session")).toHaveLength(1);
    expect((await f.post({ ...contact, email: "different@example.invalid" }, cookie)).status).toBe(
      409,
    );
    const end = await f.post({ action: "end_guest" }, cookie);
    expect(end.status).toBe(200);
    expect(end.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect((await f.post(selection(), cookie)).status).toBe(401);
  });
  test("uses guest-scoped server pricing and the existing reviewed Stripe payment path", async () => {
    const f = fixture();
    const cookie = await f.start();
    expect((await f.post(selection(), cookie)).status).toBe(200);
    const args = f.calls.find((c) => c.name === "mealdeck_create_guest_checkout_quote")!.args;
    expect(args.p_customer).toBeUndefined();
    expect(args.p_tenant).toBe(tenant);
    expect(args.p_location).toBe(location);
    expect(args.p_token_hash).toBe(guestTokenHash(readGuestToken(cookie)!));
    expect((await f.post({ ...selection(), totalPence: 1 }, cookie)).status).toBe(400);
    expect((await f.post({ ...pay, reviewConfirmed: false }, cookie)).status).toBe(400);
    const result = await f.post(pay, cookie);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_guest",
      orderId,
    });
    expect(f.calls.some((c) => /reconcile|release|mark_paid/.test(c.name))).toBe(false);
  });
  test("existing guest receipts survive closing time while fresh checkout is refused and another guest is denied", async () => {
    const f = fixture();
    const cookie = await f.start();
    await f.post(pay, cookie);
    const otherCookie = await f.start();
    f.state.eligible = false;
    f.state.channel = false;
    expect((await f.post(selection(), cookie)).status).toBe(503);
    const runtime = { ...env, MEALDECK_ONLINE_CHECKOUT_ENABLED: "false" };
    const receipt = await f.post({ action: "receipt", orderId }, cookie, {}, runtime);
    expect(receipt.status).toBe(200);
    expect((await receipt.json()).receipt.verifiedPaid).toBe(false);
    expect((await f.post({ action: "receipt", orderId }, otherCookie, {}, runtime)).status).toBe(
      404,
    );
    const status = await handleOnlineCheckoutRequest(
      new Request("https://mealdeck.co.uk/api/checkout", { headers: { Cookie: cookie } }),
      runtime,
      f.fetcher,
    );
    expect((await status.json()).guestCheckout).toEqual({
      eligible: false,
      session: { id: guestId, ...normalContact },
    });
  });
  test("member tokens retain their own authority and never fall back to an existing guest cookie", async () => {
    const f = fixture();
    const cookie = await f.start();
    const auth = { Authorization: "Bearer fixture_member_token_that_is_long_enough" };
    expect((await f.post(selection(), cookie, auth)).status).toBe(200);
    expect(f.calls.find((c) => c.name === "mealdeck_create_checkout_quote")?.args.p_customer).toBe(
      memberId,
    );
    f.state.verifiedMember = false;
    expect((await f.post(selection(), cookie, auth)).status).toBe(401);
    expect(f.calls.some((c) => c.name === "mealdeck_create_guest_checkout_quote")).toBe(false);
  });
  test("online and busy retain actual pickup estimates and all other opening/readiness gates", async () => {
    const f = fixture();
    for (const state of ["online", "busy"] as const) {
      f.state.kitchen = { state, collectionEstimateMinutes: 45 };
      const status = await readOnlineCheckoutStatus(env, f.fetcher);
      expect(status.available).toBe(true);
      expect(status.guestCheckout.eligible).toBe(true);
      expect(status.kitchen).toEqual({ state, collectionEstimateMinutes: 45 });
      f.state.channel = false;
      expect((await readOnlineCheckoutStatus(env, f.fetcher)).available).toBe(false);
      f.state.channel = true;
      expect(
        (
          await readOnlineCheckoutStatus(
            { ...env, MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "" },
            f.fetcher,
          )
        ).available,
      ).toBe(false);
    }
  });
  test("pause and close refuse fresh member/guest checkout while keeping an existing receipt accessible", async () => {
    const f = fixture();
    const cookie = await f.start();
    expect((await f.post(pay, cookie)).status).toBe(200);
    const preparedCalls = f.calls.filter((call) => /prepare.*stripe_order/.test(call.name)).length;
    for (const state of ["paused", "closed"] as const) {
      // Fail closed even if an upstream response inconsistently says channelOpen.
      f.state.kitchen = { state, collectionEstimateMinutes: 45 };
      const status = await readOnlineCheckoutStatus(env, f.fetcher);
      expect(status.available).toBe(false);
      expect(status.guestCheckout.eligible).toBe(false);
      for (const body of [contact, selection(), pay]) {
        const response = await f.post(body, cookie);
        expect(response.status).toBe(503);
        expect((await response.json()).error).toBe("kitchen_" + state);
      }
      expect(
        (
          await f.post(selection(), cookie, {
            Authorization: "Bearer fixture_member_token_that_is_long_enough",
          })
        ).status,
      ).toBe(503);
      expect((await f.post({ action: "receipt", orderId }, cookie)).status).toBe(200);
    }
    expect(f.calls.filter((call) => /prepare.*stripe_order/.test(call.name))).toHaveLength(
      preparedCalls,
    );
    expect(f.calls.some((call) => /create_.*checkout_quote/.test(call.name))).toBe(false);
    expect((await f.post({ action: "end_guest" }, cookie)).status).toBe(200);
  });
  test("missing or malformed kitchen states never enable checkout or invent an estimate", async () => {
    const f = fixture();
    for (const kitchen of [
      null,
      undefined,
      {},
      { state: "accepting", collectionEstimateMinutes: 25 },
      { state: "online", collectionEstimateMinutes: "25" },
      { state: "busy", collectionEstimateMinutes: null },
      { state: "busy", collectionEstimateMinutes: 4 },
      { state: "busy", collectionEstimateMinutes: 181 },
    ]) {
      f.state.kitchen = kitchen;
      const status = await readOnlineCheckoutStatus(env, f.fetcher);
      expect(status.available).toBe(false);
      expect(status.guestCheckout.eligible).toBe(false);
    }
  });
});
