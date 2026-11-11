import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  mealDeckDeliveryPolicy,
  priceMealDeckDelivery,
} from "../src/lib/mealdeck-delivery-pricing-policy";
import { ownDriverShortfallPence } from "../src/lib/mealdeck-own-driver-delivery";

const nov = "2026-11-30T23:59:59Z";
const dec = "2026-12-01T00:00:00Z";
const jan = "2027-01-11T18:00:00Z";
const quote = {
  provider: "uber_direct" as const,
  quoteId: "live_uber_1",
  amountPence: 485,
  currency: "GBP",
  estimatedMinutes: 35,
  serviceable: true,
  expiresAt: "2026-12-01T00:09:00Z",
};

describe("MealDeck ongoing free own-driver delivery policy", () => {
  test("£15 after discounts and £0 delivery persist after 30 November without a calendar switch", () => {
    for (const at of [nov, dec, jan, "2027-07-09T12:00:00Z"]) {
      const policy = mealDeckDeliveryPolicy(at);
      expect(policy).toMatchObject({
        phase: "own_driver_free",
        minimumFoodPence: 1500,
        deliveryFeeMode: "free",
      });
      expect(ownDriverShortfallPence(1499, at)).toBe(1);
      expect(ownDriverShortfallPence(1500, at)).toBe(0);
      const priced = priceMealDeckDelivery({
        fulfilmentAtIso: at,
        foodAfterDiscountPence: 1500,
        // An unrelated courier quote must never add a surprise fee to own delivery.
        trustedCourierQuote: { ...quote, amountPence: 999 },
      });
      expect(priced).toEqual({
        ready: true,
        phase: "own_driver_free",
        minimumFoodPence: 1500,
        foodPence: 1500,
        deliveryPence: 0,
        payablePence: 1500,
        quoteId: null,
        courier: null,
      });
    }
  });

  test("a delivery minimum applies to discounted food rather than courier fees", () => {
    expect(priceMealDeckDelivery({
      fulfilmentAtIso: dec,
      foodAfterDiscountPence: 1499,
      trustedCourierQuote: quote,
    })).toEqual({
      ready: false,
      reason: "below_minimum",
      minimumFoodPence: 1500,
      shortfallPence: 1,
      phase: "own_driver_free",
    });
  });

  test("future quoted-courier pricing is opt-in, not enabled by reaching December", () => {
    expect(mealDeckDeliveryPolicy(dec, "quoted_delivery")).toEqual({
      phase: "quoted_delivery",
      minimumFoodPence: 1000,
      deliveryFeeMode: "trusted_quote_required",
      effectiveLocalDate: "2026-12-01",
    });
    const requested = {
      fulfilmentAtIso: dec,
      foodAfterDiscountPence: 1000,
      pricingMode: "quoted_delivery" as const,
    };
    expect(priceMealDeckDelivery(requested)).toEqual({
      ready: false, reason: "quote_required", minimumFoodPence: 1000,
      shortfallPence: null, phase: "quoted_delivery",
    });
    expect(priceMealDeckDelivery({ ...requested, trustedCourierQuote: quote })).toEqual({
      ready: true, phase: "quoted_delivery", minimumFoodPence: 1000,
      foodPence: 1000, deliveryPence: 485, payablePence: 1485,
      quoteId: "live_uber_1", courier: "uber_direct",
    });
  });

  test("explicit future courier pricing rejects forged, expired and unserviceable quotes", () => {
    for (const bad of [
      { ...quote, expiresAt: dec },
      { ...quote, serviceable: false },
      { ...quote, quoteId: "" },
      { ...quote, currency: "USD" },
      { ...quote, amountPence: -1 },
      { ...quote, estimatedMinutes: 0 },
    ]) {
      expect(priceMealDeckDelivery({
        fulfilmentAtIso: dec, foodAfterDiscountPence: 2000,
        pricingMode: "quoted_delivery", trustedCourierQuote: bad,
      })).toMatchObject({ ready: false, reason: "quote_required" });
    }
  });

  test("approved corrective SQL drops only the exact future Luton gate, not payment controls", () => {
    const sql = readFileSync(new URL(
      "../deploy/mealdeck/post-install-migrations/20261111070000_mealdeck_keep_free_own_driver_delivery.sql",
      import.meta.url,
    ), "utf8");
    expect(sql).toContain("profile='mealdeck-independent-v1'");
    expect(sql).toContain("b30716663152ef181423c903058d28e3");
    expect(sql).toContain("mealdeck_december_paid_quote_gate");
    expect(sql).toContain("drop trigger mealdeck_december_paid_quote_gate on public.orders;");
    expect(sql).toContain("mealdeck_free_delivery_unexpected_december_gate");
    expect(sql).not.toMatch(/\b(?:update|delete|truncate|alter table)\s+public\.orders\b/i);
    expect(sql).not.toMatch(/\bdrop\s+(?:function|schema|table)\b/i);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
  });

  test("checkout uses server availability and does not invent a December surcharge", () => {
    const jsx = readFileSync(new URL("../src/components/launch-checkout.tsx", import.meta.url), "utf8");
    expect(jsx).toContain('status?.fulfilments?.includes("delivery") === true');
    expect(jsx).toContain("deliveryArea?.eligible === true");
    expect(jsx).toContain("ownDriverShortfallPence(displayTotal)");
    expect(jsx).toContain("£15 minimum after discounts");
    expect(jsx).toContain("Free delivery");
    expect(jsx).not.toContain("From 1 December");
    expect(jsx).not.toContain("needsCourierFeeQuote");
  });

  test("Europe/London civil date remains trustworthy across DST and year boundaries", () => {
    expect(mealDeckDeliveryPolicy("2027-03-28T00:30:00Z")?.effectiveLocalDate).toBe("2027-03-28");
    expect(mealDeckDeliveryPolicy(nov)?.effectiveLocalDate).toBe("2026-11-30");
    expect(mealDeckDeliveryPolicy(dec)?.effectiveLocalDate).toBe("2026-12-01");
    expect(mealDeckDeliveryPolicy("invalid")).toBeNull();
    expect(mealDeckDeliveryPolicy("2026-10-30T12:00:00Z")).toBeNull();
    expect(mealDeckDeliveryPolicy(dec, "free" as never)).toBeNull();
  });
});
