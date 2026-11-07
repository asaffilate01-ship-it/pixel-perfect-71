import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WhatsAppDraftReview } from "../src/components/whatsapp-checkout";
import { launchMenuBrands } from "../src/lib/launch-menu-catalogue";
import { addLaunchPick } from "../src/lib/launch-menu-picks";
import { normaliseCheckoutSelection } from "../src/lib/mealdeck-checkout-selection";
import { requestMealDeckCheckout } from "../src/lib/mealdeck-checkout-browser";
import {
  parseWhatsAppCheckoutContext,
  matchingWhatsAppReceiptContext,
  readWhatsAppPaymentAttempt,
  rememberWhatsAppPaymentAttempt,
  requestWhatsAppCheckout,
  takeWhatsAppCheckoutFragment,
  whatsAppCheckoutStorageKey,
  whatsAppDraftBagQuantities,
  whatsAppGuestContactMatches,
  whatsAppPaymentRecovery,
  whatsAppQuoteInput,
  type WhatsAppCheckoutContext,
} from "../src/lib/mealdeck-whatsapp-checkout-browser";

const handoffId = "00000000-0000-4000-8000-000000000001";
const quoteId = "00000000-0000-4000-8000-000000000002";
const attemptId = "00000000-0000-4000-8000-000000000003";
const orderId = "00000000-0000-4000-8000-000000000004";
const otherId = "00000000-0000-4000-8000-000000000005";
const token = "a1".repeat(32);
const skorch = launchMenuBrands.find((brand) => brand.id === "skorch-burgers")!;
const ace = skorch.sections
  .flatMap((section) => section.items)
  .find((item) => item.name === "The Ace")!;
const moktl = launchMenuBrands.find((brand) => brand.id === "moktl")!;
const drink = moktl.sections[0]!.items[0]!;

function fixture(): WhatsAppCheckoutContext {
  const picks = addLaunchPick(
    addLaunchPick([], skorch.id, ace.id, {}, 2),
    moktl.id,
    drink.id,
    {},
    1,
  );
  return {
    handoffId,
    expiresAt: "2026-11-07T19:30:00.000Z",
    orderId: null,
    quoteId: null,
    attemptId: null,
    checkoutMode: null,
    paused: false,
    draft: {
      picks,
      fulfilment: "curbside",
      vehicle: { make: "Volkswagen", colour: "Blue", registrationLast4: "4ABC" },
      customer: { name: "A Customer", phone: "+447700900123" },
      notes: "No onions\nSauce on the side",
      packingPlan: {
        cutleryRequested: true,
        separateBags: true,
        bagCount: 2,
        allocations: [
          { lineId: "line-1", bag: 1, quantity: 1 },
          { lineId: "line-1", bag: 2, quantity: 1 },
          { lineId: "line-2", bag: 2, quantity: 1 },
        ],
      },
    },
  };
}

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
  };
}

describe("private WhatsApp checkout handoff", () => {
  test("removes a fragment before the redeem request and never places its capability in a URL or header", async () => {
    const events: string[] = [];
    const history = {
      state: { key: "router-state" },
      replaceState: (state: unknown, _title: string, path?: string | URL | null) => {
        expect(state).toEqual({ key: "router-state" });
        expect(path).toBe("/whatsapp/checkout");
        events.push("replace");
      },
    };
    const action = takeWhatsAppCheckoutFragment(
      { pathname: "/whatsapp/checkout", search: "", hash: "#token=" + token },
      history,
    );
    const request = (async (url: unknown, init?: RequestInit) => {
      events.push("request");
      expect(url).toBe("/api/whatsapp/checkout");
      expect(init?.method).toBe("POST");
      expect(init?.credentials).toBe("same-origin");
      expect(init?.cache).toBe("no-store");
      expect(init?.referrerPolicy).toBe("no-referrer");
      expect(new Headers(init?.headers).get("Authorization")).toBeNull();
      expect(JSON.stringify(init?.headers)).not.toContain(token);
      expect(JSON.parse(init?.body as string)).toEqual({ action: "redeem", token });
      return Response.json(fixture());
    }) as typeof fetch;
    expect((await requestWhatsAppCheckout(action, request)).handoffId).toBe(handoffId);
    expect(events).toEqual(["replace", "request"]);
  });

  test("malformed, duplicated and query-string capabilities fail closed after address cleanup", () => {
    const paths: unknown[] = [];
    const history = {
      state: null,
      replaceState: (_state: unknown, _title: string, path?: string | URL | null) => {
        paths.push(path);
      },
    };
    for (const hash of [
      "#token=short",
      "#token=" + token + "&token=" + token,
      "#token=" + token + "&name=Alice",
      "#" + token + "%20",
    ])
      expect(() =>
        takeWhatsAppCheckoutFragment({ pathname: "/whatsapp/checkout", search: "", hash }, history),
      ).toThrow("incomplete");
    expect(() =>
      takeWhatsAppCheckoutFragment(
        { pathname: "/whatsapp/checkout", search: "?token=" + token, hash: "" },
        history,
      ),
    ).toThrow("incomplete");
    expect(paths).toEqual(Array(5).fill("/whatsapp/checkout"));
    expect(
      takeWhatsAppCheckoutFragment(
        { pathname: "/whatsapp/checkout", search: "", hash: "" },
        history,
      ),
    ).toEqual({ action: "current" });
  });

  test("invalid and expired responses do not reveal server diagnostics or silently resume a different draft", async () => {
    const request = (async () =>
      Response.json({ message: "private debug " + token }, { status: 410 })) as typeof fetch;
    await expect(requestWhatsAppCheckout({ action: "current" }, request)).rejects.toThrow(
      "expired",
    );
    try {
      await requestWhatsAppCheckout({ action: "current" }, request);
    } catch (error) {
      expect(String(error)).not.toContain(token);
    }
    const malformed = (async () => Response.json({ draft: fixture().draft })) as typeof fetch;
    await expect(requestWhatsAppCheckout({ action: "current" }, malformed)).rejects.toThrow(
      "verify every part",
    );
  });
});

describe("WhatsApp selection and contact boundary", () => {
  test("transfers complete raw packing and car details into the existing canonical quote engine", () => {
    const context = parseWhatsAppCheckoutContext(fixture())!;
    expect(context.draft.picks).toHaveLength(2);
    const input = whatsAppQuoteInput(context.draft);
    expect(input).not.toHaveProperty("customer");
    expect(input).not.toHaveProperty("marketingConsent");
    expect(input.picks[0]).not.toHaveProperty("key");
    expect(input.packing).toEqual(context.draft.packingPlan);
    const canonical = normaliseCheckoutSelection(input, handoffId);
    expect(canonical.fulfilment).toBe("curbside");
    expect(canonical.vehicle).toEqual(context.draft.vehicle);
    expect(canonical.notes).toBe(context.draft.notes);
    expect(canonical.packingPlan.bags).toEqual([
      { number: 1, allocations: [{ lineId: "line-1", quantity: 1 }] },
      {
        number: 2,
        allocations: [
          { lineId: "line-1", quantity: 1 },
          { lineId: "line-2", quantity: 1 },
        ],
      },
    ]);
    expect(whatsAppDraftBagQuantities(context.draft)).toEqual({
      "line-1": [1, 1],
      "line-2": [0, 1],
    });
  });

  test("rejects partial or altered picks and malformed packing instead of dropping choices", () => {
    type UntrustedCheckoutReply = {
      orderId: unknown;
      draft: {
        picks: { quantity: unknown; key: unknown; totalPence?: unknown }[];
        packingPlan: { allocations: { bag: unknown; name?: unknown }[] };
        fulfilment: unknown;
        vehicle: { registrationLast4: unknown } | null;
      };
    };
    const mutations: ((value: UntrustedCheckoutReply) => void)[] = [
      (value) => {
        value.draft.picks[1]!.quantity = 0;
      },
      (value) => {
        value.draft.picks[1]!.totalPence = 1;
      },
      (value) => {
        value.draft.picks[1]!.key = value.draft.picks[0]!.key;
      },
      (value) => {
        value.draft.packingPlan.allocations.pop();
      },
      (value) => {
        value.draft.packingPlan.allocations.push(value.draft.packingPlan.allocations[0]!);
      },
      (value) => {
        value.draft.packingPlan.allocations[0]!.bag = 3;
      },
      (value) => {
        value.draft.packingPlan.allocations[0]!.name = "Injected group name";
      },
      (value) => {
        value.draft.fulfilment = "delivery";
      },
      (value) => {
        value.draft.vehicle!.registrationLast4 = "AB12ABC";
      },
      (value) => {
        value.orderId = orderId;
      },
    ];
    for (const mutate of mutations) {
      const value = fixture();
      mutate(value);
      expect(parseWhatsAppCheckoutContext(value)).toBeNull();
    }
  });

  test("chat flags never become privacy acknowledgement, membership or marketing consent", () => {
    const input = fixture();
    const projected = parseWhatsAppCheckoutContext({
      ...input,
      token,
      registered: true,
      draft: {
        ...input.draft,
        privacyAcknowledged: true,
        marketingConsent: true,
        orderUpdatesConsent: true,
        checkoutLocked: true,
      },
    })!;
    expect(projected).not.toHaveProperty("token");
    expect(projected).not.toHaveProperty("registered");
    for (const field of [
      "privacyAcknowledged",
      "marketingConsent",
      "orderUpdatesConsent",
      "checkoutLocked",
    ])
      expect(projected.draft).not.toHaveProperty(field);
    expect(
      whatsAppGuestContactMatches(projected.draft, {
        name: " A  Customer ",
        phone: "07700 900123",
      }),
    ).toBe(true);
    expect(
      whatsAppGuestContactMatches(projected.draft, {
        name: "Another customer",
        phone: "07700 900123",
      }),
    ).toBe(false);
    expect(
      whatsAppGuestContactMatches(projected.draft, { name: "A Customer", phone: "+447700900999" }),
    ).toBe(false);
  });

  test("preserves the canonical Unicode notes limit and safely escapes review text", () => {
    const context = fixture();
    context.draft.notes = "🍋".repeat(1000);
    expect(parseWhatsAppCheckoutContext(context)).not.toBeNull();
    context.draft.notes = "a".repeat(1001);
    expect(parseWhatsAppCheckoutContext(context)).toBeNull();
    context.draft.notes = "Sauce <script>alert(1)</script>\nSeparate please";
    context.draft.customer.name = "A <Customer>";
    const html = renderToStaticMarkup(
      createElement(WhatsAppDraftReview, { draft: context.draft, catalogue: launchMenuBrands }),
    );
    expect(html).toContain("A &lt;Customer&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("The Ace");
    expect(html).toContain("Bag 1 × 1 · Bag 2 × 1");
    expect(html).toContain("4ABC");
    expect(html).not.toContain("£");
  });
});

describe("isolated payment recovery", () => {
  test("persists only the original payment identifiers and never replaces personal or group baskets", () => {
    const storage = memoryStorage();
    for (const key of [
      "mealdeck-launch-picks-v1",
      "mealdeck-checkout-picks-v1",
      "mealdeck-checkout-group-v1",
      "mealdeck-checkout-attempt-v2",
      "mealdeck-checkout-mode-v1",
    ])
      storage.setItem(key, "existing " + key);
    const before = [...storage.entries];
    const attempt = { quoteId, attemptId, checkoutMode: "guest" as const };
    expect(rememberWhatsAppPaymentAttempt(storage, handoffId, attempt)).toBe(true);
    expect(readWhatsAppPaymentAttempt(storage, handoffId)).toEqual(attempt);
    expect(readWhatsAppPaymentAttempt(storage, otherId)).toBeNull();
    expect(rememberWhatsAppPaymentAttempt(storage, handoffId, { ...attempt, orderId })).toBe(true);
    expect(
      rememberWhatsAppPaymentAttempt(storage, handoffId, { ...attempt, quoteId: otherId }),
    ).toBe(false);
    expect(
      rememberWhatsAppPaymentAttempt(storage, handoffId, { ...attempt, attemptId: otherId }),
    ).toBe(false);
    expect(
      rememberWhatsAppPaymentAttempt(storage, handoffId, { ...attempt, checkoutMode: "member" }),
    ).toBe(false);
    for (const [key, value] of before) expect(storage.getItem(key)).toBe(value);
    expect(
      Object.keys(JSON.parse(storage.getItem(whatsAppCheckoutStorageKey(handoffId))!)).sort(),
    ).toEqual(["attemptId", "checkoutMode", "orderId", "quoteId"]);
  });

  test("blocks replacement even after an interrupted first payment before an order ID is returned", () => {
    const storage = memoryStorage();
    const attempt = { quoteId, attemptId, checkoutMode: "guest" as const };
    expect(rememberWhatsAppPaymentAttempt(storage, handoffId, attempt)).toBe(true);
    expect(
      rememberWhatsAppPaymentAttempt(storage, handoffId, { ...attempt, attemptId: otherId }),
    ).toBe(false);
    const context = fixture();
    expect(whatsAppPaymentRecovery(context, attempt, quoteId, "guest")).toEqual(attempt);
    expect(whatsAppPaymentRecovery(context, attempt, quoteId, "member")).toBeNull();
    expect(whatsAppPaymentRecovery(context, attempt, otherId, "guest")).toBeNull();
  });

  test("restores the server-bound original attempt when local recovery was lost", () => {
    const context = { ...fixture(), quoteId, attemptId, orderId, checkoutMode: "guest" as const };
    expect(matchingWhatsAppReceiptContext(context, orderId)).toBe(context);
    expect(matchingWhatsAppReceiptContext(context, otherId)).toBeNull();
    expect(matchingWhatsAppReceiptContext(fixture(), orderId)).toBeNull();
    expect(whatsAppPaymentRecovery(context, null, quoteId, "guest")).toEqual({
      quoteId,
      attemptId,
      orderId,
      checkoutMode: "guest",
    });
    expect(whatsAppPaymentRecovery(context, null, otherId, "guest")).toBeNull();
    expect(whatsAppPaymentRecovery(context, null, quoteId, "member")).toBeNull();
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    expect(
      rememberWhatsAppPaymentAttempt(storage, handoffId, {
        quoteId,
        attemptId,
        checkoutMode: "guest",
      }),
    ).toBe(false);
  });

  test("only dedicated quote/pay calls opt in; member and guest authentication stay authoritative", async () => {
    const requests: RequestInit[] = [];
    const request = (async (_url: unknown, init?: RequestInit) => {
      requests.push(init!);
      return Response.json({ ok: true });
    }) as typeof fetch;
    let memberTokenReads = 0;
    const account = async () => {
      memberTokenReads += 1;
      return "verified-member-token";
    };
    for (const action of ["quote", "pay", "guest", "end_guest", "receipt"])
      await requestMealDeckCheckout("guest", { action }, account, undefined, request, {
        source: "whatsapp",
      });
    expect(memberTokenReads).toBe(0);
    expect(requests.map((entry) => new Headers(entry.headers).get("X-Mealdeck-WhatsApp"))).toEqual([
      "1",
      "1",
      null,
      null,
      null,
    ]);
    for (const entry of requests)
      expect(new Headers(entry.headers).has("Authorization")).toBe(false);
    await requestMealDeckCheckout("member", { action: "quote" }, account, undefined, request, {
      source: "whatsapp",
    });
    expect(new Headers(requests.at(-1)!.headers).get("Authorization")).toBe(
      "Bearer verified-member-token",
    );
    await requestMealDeckCheckout("guest", { action: "pay" }, account, undefined, request);
    expect(new Headers(requests.at(-1)!.headers).has("X-Mealdeck-WhatsApp")).toBe(false);
  });
});
