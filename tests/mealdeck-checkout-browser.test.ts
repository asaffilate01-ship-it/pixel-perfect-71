import { describe, expect, test } from "bun:test";
import {
  checkoutModeForEntry,
  requestMealDeckCheckout,
} from "../src/lib/mealdeck-checkout-browser";

describe("checkout identity transport", () => {
  test("weekend guest entry overrides an old member choice before and after policy loads", () => {
    for (const registrationDeferred of [undefined, true]) {
      expect(
        checkoutModeForEntry("member", {
          hasOrder: false,
          registrationDeferred,
          registered: false,
        }),
      ).toBe("guest");
      expect(
        checkoutModeForEntry("guest", { hasOrder: false, registrationDeferred, registered: false }),
      ).toBe("guest");
    }
  });
  test("existing receipts, registered test sign-in and Monday member entry keep their selected identity", () => {
    for (const selected of ["member", "guest"] as const) {
      expect(
        checkoutModeForEntry(selected, {
          hasOrder: true,
          registrationDeferred: true,
          registered: false,
        }),
      ).toBe(selected);
      expect(
        checkoutModeForEntry(selected, {
          hasOrder: false,
          registrationDeferred: true,
          registered: true,
        }),
      ).toBe(selected);
      expect(
        checkoutModeForEntry(selected, {
          hasOrder: false,
          registrationDeferred: false,
          registered: false,
        }),
      ).toBe(selected);
    }
  });
  test("guest quote, payment and receipt use cookies without reading a signed-in member token", async () => {
    let tokenReads = 0;
    const requests: RequestInit[] = [];
    const request = (async (_url: unknown, init?: RequestInit) => {
      requests.push(init!);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    const token = async () => {
      tokenReads += 1;
      return "existing-member-token";
    };
    for (const action of ["quote", "pay", "receipt"])
      await requestMealDeckCheckout("guest", { action }, token, undefined, request);
    expect(tokenReads).toBe(0);
    expect(requests).toHaveLength(3);
    for (const request of requests) {
      expect(request.credentials).toBe("same-origin");
      expect(request.cache).toBe("no-store");
      expect(new Headers(request.headers).has("Authorization")).toBe(false);
    }
  });

  test("member checkout retains the verified account bearer", async () => {
    let sent: RequestInit | undefined;
    const request = (async (_url: unknown, init?: RequestInit) => {
      sent = init;
      return new Response(JSON.stringify({ quote: { quoteId: "member-quote" } }));
    }) as typeof fetch;
    const result = await requestMealDeckCheckout<{ quote: { quoteId: string } }>(
      "member",
      { action: "quote" },
      async () => "member-token",
      undefined,
      request,
    );
    expect(new Headers(sent?.headers).get("Authorization")).toBe("Bearer member-token");
    expect(result.quote.quoteId).toBe("member-quote");
  });

  test("a missing member token cannot silently fall back to a guest cookie", async () => {
    let requested = false;
    const request = (async () => {
      requested = true;
      return new Response("{}");
    }) as typeof fetch;
    await expect(
      requestMealDeckCheckout("member", { action: "pay" }, async () => null, undefined, request),
    ).rejects.toThrow("Sign in and verify your email");
    expect(requested).toBe(false);
  });

  test("guest errors preserve server guidance and the abort signal", async () => {
    const controller = new AbortController();
    let sentSignal: AbortSignal | null | undefined;
    const request = (async (_url: unknown, init?: RequestInit) => {
      sentSignal = init?.signal;
      return new Response(JSON.stringify({ message: "Guest checkout has closed." }), {
        status: 409,
      });
    }) as typeof fetch;
    await expect(
      requestMealDeckCheckout(
        "guest",
        { action: "guest" },
        async () => null,
        controller.signal,
        request,
      ),
    ).rejects.toThrow("Guest checkout has closed.");
    expect(sentSignal).toBe(controller.signal);
  });
});
