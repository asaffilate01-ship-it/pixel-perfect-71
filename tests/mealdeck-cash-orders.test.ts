import { describe, expect, test } from "bun:test";
import { handleCashOrdersRequest } from "../src/lib/mealdeck-cash-orders.server";
import {
  cashQuoteSchema,
  CashOrderError,
  requestCashOrderWithToken,
  type CashAction,
} from "../src/lib/mealdeck-cash-orders";
import { launchMenuBrands } from "../src/lib/launch-menu-catalogue";

const uid = (last: number) => "10000000-0000-4000-8000-" + String(last).padStart(12, "0");
const scope = { tenantId: uid(1), locationId: uid(2) };
const env = {
  MEALDECK_SUPABASE_URL: "https://cashfixture.supabase.co",
  MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_cash_fixture_public",
  MEALDECK_CHECKOUT_SERVER_KEY: "sb_secret_cash_fixture_server",
  MEALDECK_TENANT_ID: scope.tenantId,
  MEALDECK_LUTON_LOCATION_ID: scope.locationId,
  MEALDECK_ONLINE_CHECKOUT_ENABLED: "true",
  MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "signed-off",
};
const token = "fixture-staff-token-1234567890";
const brand = launchMenuBrands.find((entry) => entry.id === "skorch-burgers")!;
const item = brand.sections
  .flatMap((section) => section.items)
  .find((entry) => entry.name === "The Ace")!;
const quoteInput = () => ({
  action: "quote" as const,
  fulfilment: "pickup" as const,
  picks: [{ brandId: brand.id, itemId: item.id, quantity: 1, selections: {} }],
  packing: { cutleryRequested: false, separateBags: false, bagCount: 1, allocations: [] },
  customerName: "Amna O’Neill",
  customerPhone: "07700 900123",
  notes: "No onions",
});
const quote = () => ({
  quoteId: uid(3),
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  currency: "GBP",
  fulfilment: "pickup",
  grossPence: 499,
  discountPence: 150,
  totalPence: 349,
  collectionEstimateMinutes: 30,
  customerName: "Amna O’Neill",
  customerPhone: "+447700900123",
  notes: "No onions",
  lines: [
    {
      lineId: "line-1",
      parentLineId: null,
      name: "The Ace",
      quantity: 1,
      base_unit_pence: 499,
      unit_pence: 499,
      line_pence: 499,
      modifiers: [],
      attachment: null,
    },
  ],
  packingPlan: {
    version: 1,
    separateBags: false,
    cutleryRequested: false,
    bags: [{ number: 1, allocations: [{ lineId: "line-1", quantity: 1 }] }],
  },
});
const order = () => ({
  orderId: uid(4),
  quoteId: uid(3),
  orderNumber: "0008",
  handoffCode: "4721",
  fulfilment: "pickup",
  currency: "GBP",
  paymentMethod: "cash",
  cashReceived: true,
  paymentStatus: "paid",
  verifiedPaid: true,
  status: "accepted",
  totalPence: 349,
  receivedAt: new Date().toISOString(),
  acceptedAt: null,
  customerName: "Amna O’Neill",
  customerPhone: "+447700900123",
  notes: "No onions",
});
const confirm: CashAction = {
  action: "confirm",
  quoteId: uid(3),
  attemptId: uid(5),
  cashReceived: true,
};
function harness(
  options: {
    saved?: boolean;
    cancelled?: boolean;
    permission?: boolean;
    verified?: boolean;
    mfa?: boolean;
    quote?: Record<string, unknown>;
    error?: string;
  } = {},
) {
  const calls: { path: string; args: Record<string, unknown> }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const args =
      typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    calls.push({ path: url.pathname, args });
    if (url.hostname !== "cashfixture.supabase.co") throw new Error("Unexpected provider request");
    if (url.pathname === "/auth/v1/user")
      return options.verified === false
        ? Response.json({ message: "Invalid token" }, { status: 401 })
        : Response.json({
            id: uid(9),
            email: "staff@example.invalid",
            email_confirmed_at: "2026-11-01T12:00:00Z",
            is_anonymous: false,
            ...(options.mfa
              ? { factors: [{ id: uid(8), status: "verified", factor_type: "totp" }] }
              : {}),
          });
    if (options.permission === false)
      return Response.json(
        { message: "mealdeck_payment_staff_forbidden", code: "P0001" },
        { status: 400 },
      );
    if (options.error)
      return Response.json({ message: options.error, code: "P0001" }, { status: 400 });
    if (url.pathname.endsWith("mealdeck_create_cash_quote"))
      return Response.json(options.quote ?? quote());
    if (url.pathname.endsWith("mealdeck_cash_order_status"))
      return Response.json({
        order: options.saved ? order() : null,
        replayed: options.saved ?? false,
        ...(options.cancelled === undefined ? {} : { cancelled: options.cancelled }),
      });
    if (url.pathname.endsWith("mealdeck_cancel_cash_order_attempt"))
      return Response.json({
        order: options.saved ? order() : null,
        replayed: options.saved ?? false,
        cancelled: !options.saved,
      });
    if (url.pathname.endsWith("mealdeck_confirm_cash_order"))
      return Response.json({ order: order(), replayed: false });
    throw new Error("Unexpected cash fixture path");
  }) as typeof fetch;
  const request = (
    body: unknown,
    overrides: { origin?: string; token?: string; scope?: object } = {},
  ) =>
    new Request("https://mealdeck.co.uk/api/ops/cash", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: overrides.origin ?? "https://mealdeck.co.uk",
        Authorization: "Bearer " + (overrides.token ?? token),
      },
      body: JSON.stringify({ ...scope, ...(body as object), ...overrides.scope }),
    });
  return { calls, fetcher, request };
}

describe("cash staff API boundary", () => {
  test("uses verified staff and canonical source choices without any Stripe/native credential", async () => {
    const h = harness();
    const response = await handleCashOrdersRequest(h.request(quoteInput()), env, h.fetcher);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(cashQuoteSchema.safeParse(result.quote).success).toBe(true);
    expect(result.quote.customerPhone).toBe("+447700900123");
    const rpc = h.calls.find((call) => call.path.endsWith("mealdeck_create_cash_quote"))!;
    expect(rpc.args.p_actor).toBe(uid(9));
    expect(rpc.args.p_tenant).toBe(scope.tenantId);
    expect(rpc.args.p_customer_phone).toBe("+447700900123");
    expect(rpc.args.p_notes).toBe("No onions");
    expect(rpc.args.p_request_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(rpc.args)).not.toContain("totalPence");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(
      h.calls.every(
        (call) => call.path.startsWith("/auth/") || call.path.startsWith("/rest/v1/rpc/mealdeck_"),
      ),
    ).toBe(true);
  });

  test("requires same-origin, current verified staff/MFA and configured scope", async () => {
    for (const options of [{ verified: false }, { mfa: true }, { permission: false }]) {
      const h = harness(options);
      const response = await handleCashOrdersRequest(h.request(confirm), env, h.fetcher);
      expect(response.status).not.toBe(200);
      expect(h.calls.some((call) => call.path.endsWith("mealdeck_confirm_cash_order"))).toBe(false);
    }
    const h = harness();
    expect(
      (
        await handleCashOrdersRequest(
          h.request(confirm, { origin: "https://other.invalid" }),
          env,
          h.fetcher,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleCashOrdersRequest(
          h.request(confirm, { scope: { locationId: uid(99) } }),
          env,
          h.fetcher,
        )
      ).status,
    ).toBe(403);
    expect(h.calls.length).toBe(0);
  });

  test("missing contact, unsafe notes, amount/actor injection and unconfirmed cash never reach the mutation RPC", async () => {
    const invalid = [
      { ...quoteInput(), customerName: " " },
      { ...quoteInput(), customerPhone: "" },
      { ...quoteInput(), customerName: "\u202E" },
      { ...quoteInput(), notes: "Bad\u0007" },
      { ...quoteInput(), fulfilment: "curbside" },
      { ...quoteInput(), totalPence: 1 },
      { ...quoteInput(), actor: uid(8) },
      { ...confirm, cashReceived: false },
    ];
    for (const body of invalid) {
      const h = harness();
      const response = await handleCashOrdersRequest(h.request(body), env, h.fetcher);
      expect(response.status).toBe(400);
      expect(h.calls.filter((call) => call.path.startsWith("/rest/")).length).toBe(0);
    }
  });

  test("frozen contact/notes must echo exactly and monetary mismatch fails closed", async () => {
    for (const changed of [
      { notes: null },
      { customerName: "Other" },
      { customerPhone: "+447700900999" },
      { totalPence: 1 },
    ]) {
      const h = harness({ quote: { ...quote(), ...changed } });
      const response = await handleCashOrdersRequest(h.request(quoteInput()), env, h.fetcher);
      expect(response.status).toBe(502);
      expect(h.calls.some((call) => call.path.endsWith("mealdeck_confirm_cash_order"))).toBe(false);
    }
  });

  test("confirmation first recovers the same pair, and a committed cash result survives closure", async () => {
    const h = harness();
    expect((await handleCashOrdersRequest(h.request(confirm), env, h.fetcher)).status).toBe(200);
    expect(
      h.calls
        .filter((call) => call.path.startsWith("/rest/"))
        .map((call) => call.path.split("/").at(-1)),
    ).toEqual(["mealdeck_cash_order_status", "mealdeck_confirm_cash_order"]);
    const args = h.calls.at(-1)!.args;
    expect(args.p_quote).toBe(confirm.quoteId);
    expect(args.p_attempt).toBe(confirm.attemptId);
    expect(args.p_cash_received).toBe(true);
    const recovered = harness({ saved: true });
    const response = await handleCashOrdersRequest(
      recovered.request(confirm),
      {
        ...env,
        MEALDECK_ONLINE_CHECKOUT_ENABLED: "false",
        MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "pending",
      },
      recovered.fetcher,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).replayed).toBe(true);
    expect(recovered.calls.some((call) => call.path.endsWith("mealdeck_confirm_cash_order"))).toBe(
      false,
    );
    const missing = harness();
    const status = await handleCashOrdersRequest(
      missing.request({ ...confirm, action: "status", cashReceived: undefined }),
      { ...env, MEALDECK_ONLINE_CHECKOUT_ENABLED: "false" },
      missing.fetcher,
    );
    expect(await status.json()).toEqual({ order: null, replayed: false });
    expect(
      (
        await handleCashOrdersRequest(
          missing.request(confirm),
          { ...env, MEALDECK_ONLINE_CHECKOUT_ENABLED: "false" },
          missing.fetcher,
        )
      ).status,
    ).toBe(409);
  });

  test("reports safe permission, stale-price and stock failures without exposing database details", async () => {
    for (const [error, code] of [
      ["mealdeck_payment_staff_forbidden", "not_permitted"],
      ["mealdeck_checkout_price_changed", "quote_changed"],
      ["mealdeck_checkout_modifier_unavailable", "menu_changed"],
    ]) {
      const h = harness({ error });
      const response = await handleCashOrdersRequest(h.request(confirm), env, h.fetcher);
      const body = await response.json();
      expect(body.error).toBe(code);
      expect(JSON.stringify(body)).not.toContain(error);
    }
  });

  test("close-unused is a server-confirmed terminal result and never refunds a saved cash order", async () => {
    const action = { action: "cancel", quoteId: confirm.quoteId, attemptId: confirm.attemptId };
    const empty = harness();
    const closed = await handleCashOrdersRequest(
      empty.request(action),
      { ...env, MEALDECK_ONLINE_CHECKOUT_ENABLED: "false" },
      empty.fetcher,
    );
    expect(await closed.json()).toEqual({ order: null, replayed: false, cancelled: true });
    expect(
      empty.calls
        .filter((entry) => entry.path.startsWith("/rest/"))
        .map((entry) => entry.path.split("/").at(-1)),
    ).toEqual(["mealdeck_cancel_cash_order_attempt"]);
    const saved = harness({ saved: true });
    const result = await handleCashOrdersRequest(saved.request(action), env, saved.fetcher);
    const value = await result.json();
    expect(value.order.orderId).toBe(order().orderId);
    expect(value.cancelled).toBe(false);
    const blocked = harness({ cancelled: true });
    const reject = await handleCashOrdersRequest(blocked.request(confirm), env, blocked.fetcher);
    expect(reject.status).toBe(409);
    expect((await reject.json()).error).toBe("cash_attempt_closed");
    expect(blocked.calls.some((entry) => entry.path.endsWith("mealdeck_confirm_cash_order"))).toBe(
      false,
    );
  });
});

describe("cash client response-loss semantics", () => {
  test("keeps abort/transport/malformed/unrecognized error results uncertain, with the original pair", async () => {
    const responses: (() => Promise<Response>)[] = [
      async () => {
        throw new Error("aborted");
      },
      async () => new Response("proxy error", { status: 400 }),
      async () => Response.json({ error: "unexpected", message: "Unknown" }, { status: 400 }),
      async () =>
        Response.json({ error: "not_permitted", message: "Unavailable" }, { status: 503 }),
      async () => Response.json({ order: null, replayed: false }),
      async () => Response.json({ order: { ...order(), quoteId: uid(99) }, replayed: true }),
    ];
    const controller = new AbortController();
    for (const response of responses) {
      const fetcher = (async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.signal).toBe(controller.signal);
        expect(JSON.parse(String(init?.body))).toEqual({ ...scope, ...confirm });
        expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer " + token);
        return response();
      }) as typeof fetch;
      try {
        await requestCashOrderWithToken(scope, confirm, token, controller.signal, fetcher);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(CashOrderError);
        expect((error as CashOrderError).outcomeUnknown).toBe(true);
      }
    }
  });
  test("a recognized API rejection and a verified null status are distinct from an unknown confirmation", async () => {
    const reject = (async () =>
      Response.json(
        { error: "quote_changed", message: "Review a fresh total." },
        { status: 409 },
      )) as typeof fetch;
    try {
      await requestCashOrderWithToken(scope, confirm, token, undefined, reject);
      expect.unreachable();
    } catch (error) {
      expect((error as CashOrderError).outcomeUnknown).toBe(false);
      expect((error as CashOrderError).code).toBe("quote_changed");
    }
    const empty = (async () => Response.json({ order: null, replayed: false })) as typeof fetch;
    expect(
      await requestCashOrderWithToken(
        scope,
        { action: "status", quoteId: confirm.quoteId, attemptId: confirm.attemptId },
        token,
        undefined,
        empty,
      ),
    ).toEqual({ order: null, replayed: false });
  });

  test("a null cancel response is accepted only with explicit cancelled:true", async () => {
    const cancel: CashAction = {
      action: "cancel",
      quoteId: confirm.quoteId,
      attemptId: confirm.attemptId,
    };
    const empty = (async () => Response.json({ order: null, replayed: false })) as typeof fetch;
    try {
      await requestCashOrderWithToken(scope, cancel, token, undefined, empty);
      expect.unreachable();
    } catch (error) {
      expect((error as CashOrderError).outcomeUnknown).toBe(true);
    }
    const closed = (async () =>
      Response.json({ order: null, replayed: false, cancelled: true })) as typeof fetch;
    expect(await requestCashOrderWithToken(scope, cancel, token, undefined, closed)).toEqual({
      order: null,
      replayed: false,
      cancelled: true,
    });
  });
});
