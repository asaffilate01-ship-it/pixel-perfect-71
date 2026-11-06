import { afterEach, describe, expect, test } from "bun:test";
import {
  parseSharedPaymentCapabilities,
  parseSharedPaymentRoom,
  parseSharedPaymentResult,
  sharedPaymentUnclaimedPence,
  sharedPaymentRequestSchema,
  type SharedPaymentRequest,
  type SharedPaymentRoom,
} from "../src/lib/mealdeck-shared-payments";
import {
  LAST_SHARED_PAYMENT_ROOM_KEY,
  parseSharedPaymentInvitation,
  readSharedPaymentCapabilities,
  rememberSharedPaymentRoom,
  requestSharedPayment,
  resolveSharedPaymentRoom,
  safeSharedPaymentCheckoutUrl,
  safeSharedPaymentInviteUrl,
} from "../src/lib/mealdeck-shared-payments-browser";

const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const token = "a".repeat(43);
const room = (): SharedPaymentRoom => ({
  schemaVersion: 1,
  roomId: id(1),
  orderId: id(2),
  handoffCode: null,
  splitMode: "by_bag",
  status: "awaiting_payment",
  currency: "gbp",
  totalPence: 1000,
  paidPence: 0,
  remainingPence: 1000,
  expiresAt: "2026-11-06T16:00:00Z",
  viewer: { role: "organiser", shareId: null },
  canPay: true,
  canCancel: true,
  message: "Waiting for the group.",
  shares: [
    { shareId: id(3), bagNumber: 1, amountPence: 400, paidPence: 0, status: "unpaid" },
    { shareId: id(4), bagNumber: 2, amountPence: 600, paidPence: 0, status: "unpaid" },
  ],
  lines: [
    {
      lineId: "line-1",
      name: "First menu choice",
      quantity: 1,
      linePence: 400,
      description: "Reviewed flavour and extras",
    },
    { lineId: "line-2", name: "Second menu choice", quantity: 1, linePence: 600 },
  ],
  bags: [
    { number: 1, allocations: [{ lineId: "line-1", quantity: 1 }] },
    { number: 2, allocations: [{ lineId: "line-2", quantity: 1 }] },
  ],
  cutleryRequested: false,
  fulfilment: "pickup",
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const payment: SharedPaymentRequest = {
  action: "pay",
  roomId: id(1),
  attemptId: id(5),
  coverRemaining: true,
  reviewConfirmed: true,
};
const originalLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
afterEach(() => {
  if (originalLocal) Object.defineProperty(globalThis, "localStorage", originalLocal);
  else Reflect.deleteProperty(globalThis, "localStorage");
  if (originalSession) Object.defineProperty(globalThis, "sessionStorage", originalSession);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
});

describe("shared payment snapshots are strict, role-aware server data", () => {
  test("accepts the complete organiser room and authoritative total", () => {
    expect(parseSharedPaymentRoom(room())).toEqual(room());
    expect(
      parseSharedPaymentResult({ room: room(), inviteLinks: [], checkoutUrl: null })?.room
        .totalPence,
    ).toBe(1000);
  });
  test("preserves canonical person names with the exact food and share, rejecting malformed names", () => {
    const value = room();
    value.bags[0]!.name = "Amer";
    value.bags[1]!.name = "Jay";
    const parsed = parseSharedPaymentRoom(value)!;
    expect(parsed.bags).toEqual(value.bags);
    expect(parsed.shares).toEqual(value.shares);
    expect(parsed.lines).toEqual(value.lines);
    for (const name of ["", "Amer ", "Amer\x1b@", "Amer\u202e", "A".repeat(33), null]) {
      Object.assign(value.bags[0]!, { name });
      expect(parseSharedPaymentRoom(value)).toBeNull();
    }
  });
  test("organiser cover excludes processing, paid and stopped shares", () => {
    const value = room();
    value.shares[1]!.status = "processing";
    expect(value.remainingPence).toBe(1000);
    expect(sharedPaymentUnclaimedPence(value)).toBe(400);
    value.shares[0]!.paidPence = 125;
    expect(sharedPaymentUnclaimedPence(value)).toBe(275);
    for (const status of ["paid", "cancelled", "refund_review"] as const) {
      value.shares[0]!.status = status;
      expect(sharedPaymentUnclaimedPence(value)).toBe(0);
    }
  });
  test("accepts only bounded, unique server resume descriptors for an open funding room", () => {
    const value = room();
    value.canPay = false;
    value.shares.forEach((share) => (share.status = "processing"));
    const resume = { attemptId: id(5), amountPence: 1000, coverRemaining: true };
    expect(
      parseSharedPaymentResult({ room: value, resumePayments: [resume] })?.resumePayments,
    ).toEqual([resume]);
    expect(parseSharedPaymentResult({ room: value, resumePayments: [] })?.resumePayments).toEqual(
      [],
    );
    expect(parseSharedPaymentResult({ room: value })?.resumePayments).toBeUndefined();
    for (const changed of [
      { ...resume, attemptId: "bad" },
      { ...resume, amountPence: 0 },
      { ...resume, amountPence: 1000.5 },
      { ...resume, amountPence: 1001 },
      { ...resume, coverRemaining: "true" },
      { ...resume, providerSessionId: "cs_private" },
    ])
      expect(parseSharedPaymentResult({ room: value, resumePayments: [changed] })).toBeNull();
    expect(parseSharedPaymentResult({ room: value, resumePayments: [resume, resume] })).toBeNull();
    for (const status of ["cancelled", "expired", "refund_review", "hold"] as const)
      expect(
        parseSharedPaymentResult({ room: { ...value, status }, resumePayments: [resume] }),
      ).toBeNull();
  });
  test("accepts a private participant subset without inventing missing shares", () => {
    const value = room();
    value.viewer = { role: "participant", shareId: id(4) };
    value.canCancel = false;
    value.shares = [value.shares[1]!];
    value.lines = [value.lines[1]!];
    value.bags = [value.bags[1]!];
    const parsed = parseSharedPaymentRoom(value)!;
    expect(parsed.shares).toHaveLength(1);
    expect(parsed.totalPence).toBe(1000);
    expect(parsed.remainingPence).toBe(1000);
    expect(parsed.shares[0]!.amountPence).toBe(600);
  });
  test("rejects missing own-share identity, participant cancellation and forged authority fields", () => {
    const value = room();
    value.viewer = { role: "participant", shareId: id(99) };
    value.canCancel = false;
    expect(parseSharedPaymentRoom(value)).toBeNull();
    value.viewer.shareId = id(3);
    value.canCancel = true;
    expect(parseSharedPaymentRoom(value)).toBeNull();
    expect(parseSharedPaymentRoom({ ...room(), customerEmail: "private@example.com" })).toBeNull();
    expect(parseSharedPaymentRoom({ ...room(), verifiedPaid: true })).toBeNull();
  });
  test("rejects malformed money, dates, currency, share totals and duplicate bags", () => {
    for (const delta of [
      { totalPence: 1000.5 },
      { paidPence: -1 },
      { remainingPence: 1001 },
      { currency: "usd" },
      { expiresAt: "not-a-date" },
      { handoffCode: "12" },
    ])
      expect(parseSharedPaymentRoom({ ...room(), ...delta })).toBeNull();
    const mismatch = room();
    mismatch.shares[0]!.amountPence = 399;
    expect(parseSharedPaymentRoom(mismatch)).toBeNull();
    const duplicate = room();
    duplicate.bags[1]!.number = 1;
    expect(parseSharedPaymentRoom(duplicate)).toBeNull();
  });
  test("rejects incomplete or excessive packing instead of displaying a smaller order", () => {
    const missing = room();
    missing.bags[0]!.allocations[0]!.lineId = "unknown";
    expect(parseSharedPaymentRoom(missing)).toBeNull();
    const excess = room();
    excess.bags[0]!.allocations[0]!.quantity = 2;
    expect(parseSharedPaymentRoom(excess)).toBeNull();
    const missingBag = room();
    missingBag.bags.pop();
    expect(parseSharedPaymentRoom(missingBag)).toBeNull();
  });
  test("a paid or stopped room cannot advertise another payment", () => {
    for (const status of ["paid", "cancelled", "expired", "refund_review", "hold"])
      expect(parseSharedPaymentRoom({ ...room(), status, canPay: true })).toBeNull();
    expect(
      parseSharedPaymentRoom({ ...room(), status: "paid", canPay: false, remainingPence: 10 }),
    ).toBeNull();
    const complete = room();
    complete.status = "paid";
    complete.canPay = false;
    complete.paidPence = 1000;
    complete.remainingPence = 0;
    expect(parseSharedPaymentRoom(complete)?.status).toBe("paid");
  });
  test("capabilities and actions reject incomplete or injected configuration", () => {
    expect(
      parseSharedPaymentCapabilities({
        available: false,
        guestEligible: false,
        message: "Setup unavailable",
      })?.available,
    ).toBe(false);
    expect(parseSharedPaymentCapabilities({ available: true })).toBeNull();
    expect(sharedPaymentRequestSchema.safeParse({ ...payment, totalPence: 1 }).success).toBe(false);
    expect(
      sharedPaymentRequestSchema.safeParse({
        action: "create",
        quoteId: id(1),
        attemptId: id(5),
        bagCount: 1,
        splitMode: "equal",
        reviewConfirmed: true,
      }).success,
    ).toBe(false);
  });
});

describe("shared payment transport preserves the selected payer identity", () => {
  test("resuming reuses the exact server attempt even when new claims are unavailable", async () => {
    const value = room();
    value.canPay = false;
    value.shares[1]!.status = "processing";
    const resume = { attemptId: id(77), amountPence: 600, coverRemaining: false };
    const read = await requestSharedPayment(
      "guest",
      { action: "room", roomId: value.roomId },
      async () => {
        throw new Error("Guest must not read member identity");
      },
      undefined,
      (async () => json({ room: value, resumePayments: [resume] })) as typeof fetch,
    );
    let sent: unknown;
    const pending = read.resumePayments![0]!;
    const result = await requestSharedPayment(
      "guest",
      {
        action: "pay",
        roomId: value.roomId,
        attemptId: pending.attemptId,
        coverRemaining: pending.coverRemaining,
        reviewConfirmed: true,
      },
      async () => {
        throw new Error("Guest must not read member identity");
      },
      undefined,
      (async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return json({ room: value, checkoutUrl: "https://checkout.stripe.com/c/pay/cs_saved" });
      }) as typeof fetch,
    );
    expect(sent).toEqual({
      action: "pay",
      roomId: id(1),
      attemptId: id(77),
      coverRemaining: false,
      reviewConfirmed: true,
    });
    expect(result.room.canPay).toBe(false);
    expect(result.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_saved");
  });
  test("guest payment uses only the cookie, even if a member token exists", async () => {
    let tokenCalls = 0;
    let seen: RequestInit | undefined;
    const fetcher = (async (_url, init) => {
      seen = init;
      return json({ room: room(), checkoutUrl: null });
    }) as typeof fetch;
    await requestSharedPayment(
      "guest",
      payment,
      async () => {
        tokenCalls += 1;
        return "member-token";
      },
      undefined,
      fetcher,
    );
    expect(tokenCalls).toBe(0);
    expect(new Headers(seen?.headers).has("Authorization")).toBe(false);
    expect(seen?.credentials).toBe("same-origin");
    expect(seen?.cache).toBe("no-store");
    expect(JSON.parse(String(seen?.body))).toEqual(payment);
  });
  test("member payment requires its bearer token and never falls back to guest", async () => {
    let calls = 0;
    let authorization = "";
    const fetcher = (async (_url, init) => {
      calls += 1;
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      return json({ room: room() });
    }) as typeof fetch;
    await expect(
      requestSharedPayment("member", payment, async () => null, undefined, fetcher),
    ).rejects.toThrow("Sign in");
    expect(calls).toBe(0);
    await requestSharedPayment("member", payment, async () => "member-token", undefined, fetcher);
    expect(authorization).toBe("Bearer member-token");
  });
  test("optional room access cannot be used to start a payment", async () => {
    let calls = 0;
    const fetcher = (async () => {
      calls += 1;
      return json({ room: room() });
    }) as typeof fetch;
    await expect(
      requestSharedPayment("access", payment, async () => null, undefined, fetcher),
    ).rejects.toThrow("Choose member or guest");
    expect(calls).toBe(0);
    await requestSharedPayment(
      "access",
      { action: "room", roomId: id(1) },
      async () => {
        throw new Error("Account unavailable");
      },
      undefined,
      fetcher,
    );
    expect(calls).toBe(1);
  });
  test("rejects malformed or mismatched snapshots and preserves abort control", async () => {
    const controller = new AbortController();
    let seenSignal: AbortSignal | null | undefined;
    const fetcher = (async (_url, init) => {
      seenSignal = init?.signal;
      return json({ room: { ...room(), roomId: id(99) } });
    }) as typeof fetch;
    await expect(
      requestSharedPayment("guest", payment, async () => null, controller.signal, fetcher),
    ).rejects.toThrow("did not match");
    expect(seenSignal).toBe(controller.signal);
    await expect(
      requestSharedPayment("guest", payment, async () => null, undefined, (async () =>
        json({ paid: true })) as typeof fetch),
    ).rejects.toThrow("incomplete details");
  });
  test("shows server failures and does not treat unavailable setup as enabled", async () => {
    await expect(
      requestSharedPayment("guest", payment, async () => null, undefined, (async () =>
        json({ message: "This share is already processing." }, 409)) as typeof fetch),
    ).rejects.toThrow("already processing");
    const value = await readSharedPaymentCapabilities(undefined, (async () =>
      json({
        available: false,
        guestEligible: false,
        message: "Setup unavailable",
      })) as typeof fetch);
    expect(value.available).toBe(false);
  });
});

describe("payment invitation secrets never become ordinary navigation or saved state", () => {
  const fragment = "#share=" + id(3) + "&key=" + token;
  const url = "https://mealdeck.co.uk/group-pay?room=" + id(1) + fragment;
  test("parses only a complete scoped invitation fragment", () => {
    expect(parseSharedPaymentInvitation(id(1), fragment)).toEqual({
      roomId: id(1),
      shareId: id(3),
      token,
    });
    expect(parseSharedPaymentInvitation(id(1), "")).toBeNull();
    for (const value of [
      "#share=" + id(3),
      fragment + "&key=" + token,
      fragment + "&role=organiser",
      "#share=bad&key=" + token,
      "#share=" + id(3) + "&key=short",
    ])
      expect(() => parseSharedPaymentInvitation(id(1), value)).toThrow();
  });
  test("accepts only the same room/share on an approved site, without extra query authority", () => {
    expect(safeSharedPaymentInviteUrl(url, id(1), id(3), "https://mealdeck.co.uk")).toBe(url);
    for (const value of [
      url.replace("mealdeck.co.uk", "evil.example"),
      url.replace("/group-pay", "/account"),
      url.replace("?room=", "?paid=true&room="),
      url.replace("https://", "https://user:pass@"),
      url.replace(id(3), id(9)),
    ])
      expect(safeSharedPaymentInviteUrl(value, id(1), id(3), "https://mealdeck.co.uk")).toBeNull();
  });
  test("redirects only to the existing approved Stripe Checkout path", () => {
    expect(safeSharedPaymentCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_example")).toBe(
      "https://checkout.stripe.com/c/pay/cs_test_example",
    );
    for (const value of [
      "javascript:alert(1)",
      "https://checkout.stripe.com.evil.example/c/pay/a",
      "https://checkout.stripe.com/login",
      "https://user@checkout.stripe.com/c/pay/a",
      "/c/pay/a",
    ])
      expect(safeSharedPaymentCheckoutUrl(value)).toBeNull();
  });
  test("stores only the room UUID and rejects an invalid explicit link instead of using another room", () => {
    const values = new Map<string, string>();
    const storage = {
      setItem: (key: string, value: string) => values.set(key, value),
      getItem: (key: string) => values.get(key) ?? null,
    };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage });
    expect(rememberSharedPaymentRoom(id(1))).toBe(true);
    expect([...values.entries()]).toEqual([[LAST_SHARED_PAYMENT_ROOM_KEY, id(1)]]);
    expect(resolveSharedPaymentRoom("")).toBe(id(1));
    expect(resolveSharedPaymentRoom("?room=" + id(2))).toBe(id(2));
    expect(() => resolveSharedPaymentRoom("?room=invalid")).toThrow("invalid");
    expect(() => resolveSharedPaymentRoom("?room=" + id(1) + "&room=" + id(2))).toThrow("invalid");
    expect(JSON.stringify([...values.values()])).not.toContain(token);
  });
});
