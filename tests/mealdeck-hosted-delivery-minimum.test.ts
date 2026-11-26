import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { readPublicDeliveryAvailability, publicDeliveryAvailable } from "../src/lib/mealdeck-public-delivery-status";
import { ownDriverShortfallPence, OWN_DRIVER_MINIMUM_PENCE } from "../src/lib/mealdeck-own-driver-delivery";

describe("MealDeck Luton delivery minimum customer feedback", () => {
  test("free £15 minimum continues through December without an automatic courier surcharge", () => {
    expect(OWN_DRIVER_MINIMUM_PENCE).toBe(1500);
    const november = "2026-11-09T18:00:00Z";
    const december = "2026-12-01T18:00:00Z";
    expect(ownDriverShortfallPence(0, november)).toBe(1500);
    expect(ownDriverShortfallPence(1499, november)).toBe(1);
    expect(ownDriverShortfallPence(1500, november)).toBe(0);
    expect(ownDriverShortfallPence(999, december)).toBe(501);
    expect(ownDriverShortfallPence(1000, december)).toBe(500);
    expect(ownDriverShortfallPence(1500, december)).toBe(0);
  });

  test("member registration and real points remain visible if the entry status request fails", () => {
    const account = readFileSync(new URL("../src/components/customer-account.tsx", import.meta.url), "utf8");
    expect(account).toContain("entryPolicy?.emailRegistrationDeferred === true");
    expect(account).not.toContain("entryPolicy?.emailRegistrationDeferred !== false");
    expect(account).toContain("memberLoyaltyView(profile?.loyalty)");
    expect(account).toContain("{loyaltyView.pointsLabel}");
  });

  test("under-minimum baskets show immediate accessible feedback on delivery selection", () => {
    const checkout = readFileSync(new URL("../src/components/launch-checkout.tsx", import.meta.url), "utf8");
    expect(checkout).toContain('fulfilment === "delivery" && deliveryShortfall !== null');
    expect(checkout).toContain('role="alert" aria-live="polite"');
    expect(checkout).toContain("Your basket is below the");
    expect(checkout).toContain("£15 minimum after discounts");
    expect(checkout).not.toContain("From 1 December");
    expect(checkout).not.toContain("needsCourierFeeQuote");
    expect(checkout).toContain("collection or kerbside");
    expect(checkout).toContain('if (fulfilment === "delivery" && deliveryUnderMinimum)');
    const styles = readFileSync(new URL("../src/styles.launch-checkout.css", import.meta.url), "utf8");
    expect(styles).toContain(".md-checkout-timing");
    expect(styles).toContain("button:disabled");
    expect(checkout).toContain("Schedule for later");
    expect(checkout).toContain("You cannot reserve a");
    expect(checkout).toContain("disabled aria-describedby=\"mealdeck-schedule-not-ready\"");
  });
});

describe("Shared anonymous delivery availability", () => {
  test("requires a public open gate and an exact delivery fulfilment", () => {
    expect(publicDeliveryAvailable({ available: true, fulfilments: ["pickup", "delivery"] })).toBe(true);
    expect(publicDeliveryAvailable({ available: false, fulfilments: ["delivery"] })).toBe(false);
    expect(publicDeliveryAvailable({ available: true, fulfilments: "delivery" })).toBe(false);
    expect(publicDeliveryAvailable({ available: true, fulfilments: ["curbside"] })).toBe(false);
    expect(publicDeliveryAvailable({ available: "true", fulfilments: ["delivery"] })).toBe(false);
    expect(publicDeliveryAvailable(null)).toBe(false);
  });

  test("only returns a boolean and never sends guest cookies or bearer credentials", async () => {
    const controller = new AbortController();
    const fetcher = (async (url, init) => {
      expect(url).toBe("/api/checkout");
      expect(init?.credentials).toBe("omit");
      expect(init?.cache).toBe("no-store");
      expect(init?.signal).toBe(controller.signal);
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      return Response.json({ available: true, fulfilments: ["delivery"], guestCheckout: { session: "private" } });
    }) as typeof fetch;
    expect(await readPublicDeliveryAvailability(controller.signal, fetcher)).toBe(true);
  });

  test("HTTP and network failures never return true", async () => {
    const signal = new AbortController().signal;
    const httpFailure = (async () => new Response("", { status: 503 })) as typeof fetch;
    const networkFailure = (async () => { throw new Error("Offline"); }) as typeof fetch;
    await expect(readPublicDeliveryAvailability(signal, httpFailure)).rejects.toThrow();
    await expect(readPublicDeliveryAvailability(signal, networkFailure)).rejects.toThrow();
  });

  test("marketing status is a shared, bounded, foreground-only query, not a checkout authorisation", () => {
    const banner = readFileSync(new URL("../src/components/own-driver-offer-banner.tsx", import.meta.url), "utf8");
    expect(banner).toContain('queryKey: ["mealdeck-public-delivery-availability", "luton"]');
    expect(banner).toContain("refetchIntervalInBackground: false");
    expect(banner).toContain("return query.isSuccess && query.data === true");
    expect(banner).toContain('if (pathname !== "/" && pathname !== "/luton" && pathname !== "/offers") return null;');
    expect(banner).not.toContain("Due to popular demand");
  });
});
