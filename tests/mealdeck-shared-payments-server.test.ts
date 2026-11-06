import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  groupAccessCookie,
  groupPaymentUuid,
  groupShareToken,
  handleSharedPaymentsRequest,
  readSharedPaymentCapabilities,
  sharedRoomForBrowser,
} from "../src/lib/mealdeck-shared-payments.server";

const uid = (last: number) => "20000000-0000-4000-8000-" + String(last).padStart(12, "0");
const secret = "A".repeat(43);
const env = {
  MEALDECK_SUPABASE_URL: "https://groupfixture.supabase.co",
  MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_group_fixture_public",
  MEALDECK_CHECKOUT_SERVER_KEY: "sb_secret_group_fixture_server",
  MEALDECK_TENANT_ID: uid(1),
  MEALDECK_LUTON_LOCATION_ID: uid(2),
  MEALDECK_STRIPE_SECRET_KEY: "sk_live_" + "a".repeat(32),
  MEALDECK_STRIPE_WEBHOOK_SECRET: "whsec_" + "b".repeat(32),
  MEALDECK_STRIPE_ACCOUNT_ID: "acct_fixture",
  MEALDECK_STRIPE_MODE: "live",
  MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "signed-off",
  MEALDECK_ONLINE_CHECKOUT_ENABLED: "true",
  MEALDECK_SHARED_PAYMENTS_ENABLED: "true",
  MEALDECK_GROUP_LINK_SECRET: secret,
};
function rawRoom() {
  return {
    roomId: uid(3),
    orderId: uid(4),
    quoteId: uid(5),
    version: 1,
    splitMode: "by_bag",
    currency: "GBP",
    status: "collecting",
    totalPence: 1001,
    capturedPence: 0,
    paidPence: 0,
    refundedPence: 0,
    remainingPence: 1001,
    unclaimedPence: 1001,
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    fundingExpired: false,
    holdReason: null,
    viewer: { role: "organiser", shareId: null },
    handoffCode: null,
    fulfilment: "pickup",
    shares: [
      { shareId: uid(6), bagNumber: 1, amountPence: 500, paidPence: 0, status: "unclaimed" },
      { shareId: uid(7), bagNumber: 2, amountPence: 501, paidPence: 0, status: "unclaimed" },
    ],
    lines: [
      {
        lineId: "line-1",
        name: "The Ace",
        quantity: 1,
        line_pence: 500,
        modifiers: [{ name: "Cheese" }],
      },
      { lineId: "line-2", name: "Loaded fries", quantity: 1, line_pence: 501, modifiers: [] },
    ],
    packingPlan: {
      version: 1,
      separateBags: true,
      cutleryRequested: false,
      bags: [
        { number: 1, allocations: [{ lineId: "line-1", quantity: 1 }] },
        { number: 2, allocations: [{ lineId: "line-2", quantity: 1 }] },
      ],
    },
    email: "private@example.invalid",
    phone: "private-contact",
    tokenHash: "never-public",
    paymentIntentId: "pi_private",
  };
}
function fixture() {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const state = {
    exists: false,
    verified: true,
    available: true,
    role: "organiser",
    failCollections: false,
    serverNow: Date.parse("2026-11-09T00:00:00Z"),
  };
  const collections: Record<string, unknown>[] = [];
  const room = rawRoom();
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const name = url.pathname.split("/").at(-1)!;
    const args =
      typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : {};
    calls.push({ name, args });
    const missing = () =>
      Response.json(
        { message: "mealdeck_payment_room_unavailable", code: "P0001" },
        { status: 400 },
      );
    if (url.pathname === "/auth/v1/user")
      return state.verified
        ? Response.json({
            id: uid(9),
            email: "member@example.invalid",
            email_confirmed_at: "2026-11-01T12:00:00Z",
            is_anonymous: false,
          })
        : Response.json({ message: "Invalid token" }, { status: 401 });
    if (name === "mealdeck_online_checkout_status")
      return Response.json({
        channelOpen: state.available,
        kitchen: { state: state.available ? "online" : "closed", collectionEstimateMinutes: 25 },
        guestCheckoutEligible: true,
        openingOffer: {
          status: "active",
          startsAt: "2026-11-06T15:00:00Z",
          endsAt: "2026-11-08T23:00:00Z",
          timezone: "Europe/London",
          serverNow: "2026-11-06T16:00:00Z",
        },
      });
    if (name === "account") return Response.json({ id: "acct_fixture", charges_enabled: true });
    if (name === "mealdeck_group_payment_collections")
      return state.failCollections
        ? Response.json({ message: "temporary_database_failure", code: "P0001" }, { status: 503 })
        : Response.json(collections);
    if (name === "mealdeck_create_group_payment_room") {
      state.exists = true;
      room.roomId = args.p_room;
      room.splitMode = args.p_split_mode;
      room.shares = room.shares.map((share, i) => ({
        ...share,
        shareId: args.p_share_tokens[i].shareId,
      }));
      return Response.json(room);
    }
    if (name === "mealdeck_group_payment_status") {
      if (!state.exists || args.p_room !== room.roomId) return missing();
      if (state.role === "organiser") return Response.json(room);
      return Response.json({
        ...room,
        viewer: { role: "participant", shareId: room.shares[1]!.shareId },
        shares: room.shares.slice(1),
        lines: room.lines.slice(1),
        packingPlan: { ...room.packingPlan, bags: room.packingPlan.bags.slice(1) },
      });
    }
    throw new Error("Unexpected fixture path: " + url.pathname);
  }) as typeof fetch;
  const post = (body: unknown, headers: Record<string, string> = {}, runtime = env) =>
    handleSharedPaymentsRequest(
      new Request("https://mealdeck.co.uk/api/group-payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://mealdeck.co.uk",
          ...headers,
        },
        body: JSON.stringify(body),
      }),
      runtime,
      fetcher,
      () => state.serverNow,
    );
  const member = { Authorization: "Bearer " + "m".repeat(48) };
  return { calls, state, room, fetcher, post, member, collections };
}

describe("private group payment links and server projection", () => {
  test("server projection keeps person names, canonical choices and exact share totals without contact data", () => {
    const value = rawRoom();
    Object.assign(value.packingPlan.bags[0]!, { name: "Amer" });
    Object.assign(value.packingPlan.bags[1]!, { name: "Jay" });
    const result = sharedRoomForBrowser(value, { available: true, hasIdentity: true });
    expect(result.bags).toEqual(value.packingPlan.bags);
    expect(result.lines[0]!.description).toContain("Cheese");
    expect(result.shares.map((share) => share.amountPence)).toEqual([500, 501]);
    expect(JSON.stringify(result)).not.toContain("private@example.invalid");
    expect(JSON.stringify(result)).not.toContain("private-contact");
  });
  test("stable identifiers recover the same request while keys and purposes remain separated", () => {
    const first = groupPaymentUuid(secret, "room", [uid(1), uid(5)]);
    expect(first).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(groupPaymentUuid(secret, "room", [uid(1), uid(5)])).toBe(first);
    expect(groupPaymentUuid(secret, "share", [uid(1), uid(5)])).not.toBe(first);
    expect(groupPaymentUuid("B".repeat(43), "room", [uid(1), uid(5)])).not.toBe(first);
    expect(groupShareToken(secret, uid(3), uid(6))).not.toBe(
      groupShareToken(secret, uid(3), uid(7)),
    );
    expect(groupShareToken(secret, uid(3), uid(6))).not.toBe(
      groupShareToken(secret, uid(4), uid(6)),
    );
  });
  test("valid fragment token redemption stores scoped access in an HttpOnly cookie and sends only its hash to the DB", async () => {
    const f = fixture();
    f.state.exists = true;
    f.state.role = "participant";
    const token = groupShareToken(secret, f.room.roomId, uid(7));
    const response = await f.post({
      action: "join",
      roomId: f.room.roomId,
      shareId: uid(7),
      token,
    });
    expect(response.status).toBe(200);
    const cookie = response.headers.get("Set-Cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api/group-payments");
    const body = await response.text();
    for (const forbidden of [
      token,
      "private@example.invalid",
      "private-contact",
      "tokenHash",
      "pi_private",
    ])
      expect(body).not.toContain(forbidden);
    const call = f.calls.find((item) => item.name === "mealdeck_group_payment_status")!;
    expect(call.args.p_share_token_hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(call.args.p_customer).toBeNull();
    expect(call.args.p_guest_token_hash).toBeNull();
    expect(JSON.stringify(call.args)).not.toContain(token);
    expect(JSON.parse(body).room.shares).toHaveLength(1);
    expect(JSON.parse(body).room.totalPence).toBe(1001);
    expect(JSON.parse(body).room.viewer.role).toBe("participant");
  });
  test("tampering or moving a token to another room/share cannot read that room", async () => {
    for (const input of [
      { roomId: uid(4), shareId: uid(7), token: groupShareToken(secret, uid(3), uid(7)) },
      { roomId: uid(3), shareId: uid(6), token: groupShareToken(secret, uid(3), uid(7)) },
      { roomId: uid(3), shareId: uid(7), token: "A".repeat(43) },
    ]) {
      const f = fixture();
      f.state.exists = true;
      expect((await f.post({ action: "join", ...input })).status).toBe(404);
      expect(f.calls.some((call) => call.name === "mealdeck_group_payment_status")).toBe(false);
    }
  });
  test("the redeemed room cookie is restored server-side and never treated as a payer identity", async () => {
    const f = fixture();
    f.state.exists = true;
    f.state.role = "participant";
    const token = groupShareToken(secret, uid(3), uid(7));
    const Cookie = groupAccessCookie(uid(3), uid(7), token).split(";")[0]!;
    expect((await f.post({ action: "room", roomId: uid(3) }, { Cookie })).status).toBe(200);
    expect(
      (
        await f.post(
          {
            action: "pay",
            roomId: uid(3),
            attemptId: uid(10),
            coverRemaining: false,
            reviewConfirmed: true,
          },
          { Cookie },
        )
      ).status,
    ).toBe(401);
    expect(f.calls.some((call) => call.name === "mealdeck_prepare_group_payment")).toBe(false);
  });
  test("private columns and raw prices cannot leak through the browser snapshot projection", () => {
    const room = sharedRoomForBrowser(rawRoom(), { available: true, hasIdentity: true });
    expect(room.canPay).toBe(true);
    expect(room.status).toBe("awaiting_payment");
    const json = JSON.stringify(room);
    for (const field of ["email", "phone", "tokenHash", "paymentIntentId", "quoteId"])
      expect(json).not.toContain(field);
    expect(room.lines[0]!.description).toBe("Cheese");
    expect(
      sharedRoomForBrowser(
        { ...rawRoom(), status: "cancelled", holdReason: "cancelled" },
        { available: true, hasIdentity: true },
      ).status,
    ).toBe("cancelled");
    const held = sharedRoomForBrowser(
      {
        ...rawRoom(),
        status: "refund_review",
        paidPence: 1500,
        remainingPence: 0,
        holdReason: "late_capture",
      },
      { available: true, hasIdentity: true },
    );
    expect(held.paidPence).toBe(1500);
    expect(held.canPay).toBe(false);
  });
});

describe("group creation admission and safe retry", () => {
  test("new group payment rooms wait until 9 November while existing rooms recover", async () => {
    const f = fixture();
    const input = {
      action: "create",
      quoteId: uid(5),
      attemptId: uid(10),
      bagCount: 2,
      splitMode: "by_bag",
      reviewConfirmed: true,
    };
    f.state.serverNow = Date.parse("2026-11-08T23:59:59Z");
    expect((await f.post(input, f.member)).status).toBe(403);
    expect(f.calls.some((c) => c.name === "mealdeck_create_group_payment_room")).toBe(false);
    expect((await f.post({ ...input, serverNow: "2026-11-09T00:00:00Z" }, f.member)).status).toBe(
      400,
    );
    f.state.serverNow = Date.parse("2026-11-09T00:00:00Z");
    expect((await f.post(input, f.member)).status).toBe(200);
    f.state.serverNow = Date.parse("2026-11-08T23:59:59Z");
    expect((await f.post(input, f.member)).status).toBe(200);
    expect(f.calls.filter((c) => c.name === "mealdeck_create_group_payment_room")).toHaveLength(1);
  });
  test("resume descriptors expose only the current payer's unexpired attempt and never provider credentials", async () => {
    const f = fixture();
    f.state.exists = true;
    const pending = {
      collectionId: uid(11),
      attemptId: uid(10),
      orderId: uid(4),
      quoteId: uid(5),
      roomId: uid(3),
      tenantId: uid(1),
      locationId: uid(2),
      method: "checkout",
      amountPence: 500,
      currency: "gbp",
      requestHash: "a".repeat(64),
      stripeAccount: "acct_fixture",
      livemode: true,
      status: "pending",
      shareIds: [uid(6)],
      sessionId: "cs_test_private",
      sessionUrl: "https://checkout.stripe.com/c/pay/cs_test_private",
      paymentIntentId: "pi_private",
      expiresAt: new Date(Date.now() + 35 * 60_000).toISOString(),
      email: "payer@example.invalid",
      terminalLocationId: null,
      cancelRequested: false,
      coverRemaining: true,
      requestShareId: null,
      payerAccess: true,
    };
    f.collections.push(
      pending,
      { ...pending, collectionId: uid(12), attemptId: uid(13), payerAccess: false },
      {
        ...pending,
        collectionId: uid(14),
        attemptId: uid(15),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
    );
    const result = await (await f.post({ action: "room", roomId: uid(3) }, f.member)).json();
    expect(result.resumePayments).toEqual([
      { attemptId: uid(10), amountPence: 500, coverRemaining: true },
    ]);
    const text = JSON.stringify(result);
    expect(text).not.toContain("pi_private");
    expect(text).not.toContain("cs_test_private");
    expect(text).not.toContain("payer@example.invalid");
    f.state.role = "participant";
    const token = groupShareToken(secret, uid(3), uid(7));
    const anonymous = await (
      await f.post(
        { action: "room", roomId: uid(3) },
        {
          Cookie: groupAccessCookie(uid(3), uid(7), token).split(";")[0]!,
        },
      )
    ).json();
    expect(anonymous.resumePayments).toEqual([]);
  });
  test("asynchronous recovery-read failures remain private structured API failures", async () => {
    const f = fixture();
    f.state.exists = true;
    f.state.failCollections = true;
    const response = await f.post({ action: "room", roomId: uid(3) }, f.member);
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const body = await response.text();
    expect(body).toContain("payments_unavailable");
    expect(body).not.toContain("temporary_database_failure");
  });
  test("an unconfigured server exposes an unavailable state instead of a fake payment path", async () => {
    expect((await readSharedPaymentCapabilities({})).available).toBe(false);
    const response = await handleSharedPaymentsRequest(
      new Request("https://mealdeck.co.uk/api/group-payments"),
      {},
    );
    expect(response.status).toBe(200);
    expect((await response.json()).available).toBe(false);
  });
  test("one server-created room survives a lost response and reopening after sales close", async () => {
    const f = fixture();
    const input = {
      action: "create",
      quoteId: uid(5),
      attemptId: uid(10),
      bagCount: 2,
      splitMode: "by_bag",
      reviewConfirmed: true,
    };
    const first = await f.post(input, f.member);
    expect(first.status).toBe(200);
    const result = await first.json();
    expect(result.inviteLinks).toHaveLength(2);
    for (const link of result.inviteLinks) {
      const url = new URL(link.url);
      expect(url.origin).toBe("https://mealdeck.co.uk");
      expect(url.searchParams.has("key")).toBe(false);
      expect(url.hash).toContain("&key=");
    }
    f.state.available = false;
    const retry = await f.post(input, f.member);
    expect(retry.status).toBe(200);
    expect((await retry.json()).room.roomId).toBe(result.room.roomId);
    expect(
      f.calls.filter((call) => call.name === "mealdeck_create_group_payment_room"),
    ).toHaveLength(1);
    const created = f.calls.find(
      (call) => call.name === "mealdeck_create_group_payment_room",
    )!.args;
    expect(created.p_customer).toBe(uid(9));
    expect(created.p_share_tokens).toHaveLength(2);
    expect((created.p_share_tokens as { tokenHash: string }[])[0]!.tokenHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(created).not.toHaveProperty("amountPence");
    expect((await f.post({ ...input, splitMode: "equal" }, f.member)).status).toBe(409);
  });
  test("CSRF, unreviewed requests and supplied price/identity fields stop before network work", async () => {
    const input = {
      action: "create",
      quoteId: uid(5),
      attemptId: uid(10),
      bagCount: 2,
      splitMode: "by_bag",
      reviewConfirmed: true,
    };
    const f = fixture();
    expect((await f.post(input, { ...f.member, Origin: "https://attacker.invalid" })).status).toBe(
      403,
    );
    for (const extra of [
      { totalPence: 1 },
      { customerId: uid(9) },
      { paid: true },
      { reviewConfirmed: false },
    ])
      expect((await f.post({ ...input, ...extra }, f.member)).status).toBe(400);
    expect(f.calls).toHaveLength(0);
  });
  test("an invalid supplied member token does not fall back to the guest cookie or participant access", async () => {
    const f = fixture();
    f.state.verified = false;
    f.state.exists = true;
    const token = groupShareToken(secret, uid(3), uid(7));
    const response = await f.post(
      { action: "room", roomId: uid(3) },
      { ...f.member, Cookie: groupAccessCookie(uid(3), uid(7), token).split(";")[0]! },
    );
    expect(response.status).toBe(401);
    expect(
      f.calls.some(
        (call) =>
          call.name === "mealdeck_group_payment_status" ||
          call.name === "mealdeck_resolve_guest_session",
      ),
    ).toBe(false);
  });
});
