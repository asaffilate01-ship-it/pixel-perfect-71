import { describe, expect, test } from "bun:test";
import {
  mealDeckDeliveryPolicy, priceMealDeckDelivery,
} from "../src/lib/mealdeck-delivery-pricing-policy";
import { ownDriverShortfallPence } from "../src/lib/mealdeck-own-driver-delivery";

const nov = "2026-11-30T23:59:59Z";
const dec = "2026-12-01T00:00:00Z";
const quote = {
  provider: "uber_direct" as const,
  quoteId: "live_uber_1",
  amountPence: 485,
  currency: "GBP",
  estimatedMinutes: 35,
  serviceable: true,
  expiresAt: "2026-12-01T00:09:00Z",
};

describe("MealDeck monthly delivery pricing policy", () => {
  test("November keeps free delivery with £15 food minimum after discounts", () => {
    expect(mealDeckDeliveryPolicy(nov)).toEqual({
      phase: "november_free",
      minimumFoodPence: 1500,
      deliveryFeeMode: "free",
      effectiveLocalDate: "2026-11-30",
    });
    expect(ownDriverShortfallPence(1499, nov)).toBe(1);
    expect(ownDriverShortfallPence(1500, nov)).toBe(0);
    const price = priceMealDeckDelivery({
      fulfilmentAtIso: nov, foodAfterDiscountPence: 1500,
      trustedCourierQuote: { ...quote, amountPence: 999 },
    });
    expect(price).toEqual({
      ready: true, phase: "november_free", minimumFoodPence: 1500,
      foodPence: 1500, deliveryPence: 0, payablePence: 1500,
      quoteId: null, courier: null,
    });
  });

  test("from 1 December food minimum is £10, with verified courier charge", () => {
    expect(mealDeckDeliveryPolicy(dec)).toEqual({
      phase: "quoted_delivery",
      minimumFoodPence: 1000,
      deliveryFeeMode: "trusted_quote_required",
      effectiveLocalDate: "2026-12-01",
    });
    expect(ownDriverShortfallPence(999, dec)).toBe(1);
    expect(ownDriverShortfallPence(1000, dec)).toBe(0);
    expect(priceMealDeckDelivery({
      fulfilmentAtIso: dec, foodAfterDiscountPence: 1000,
    })).toEqual({
      ready: false, reason: "quote_required", minimumFoodPence: 1000,
      shortfallPence: null, phase: "quoted_delivery",
    });
    expect(priceMealDeckDelivery({
      fulfilmentAtIso: dec, foodAfterDiscountPence: 1000,
      trustedCourierQuote: quote,
    })).toEqual({
      ready: true, phase: "quoted_delivery",
      minimumFoodPence: 1000, foodPence: 1000,
      deliveryPence: 485, payablePence: 1485,
      quoteId: "live_uber_1", courier: "uber_direct",
    });
  });

  test("minimum is based on discounted food, NOT paid delivery charges", () => {
    expect(priceMealDeckDelivery({
      fulfilmentAtIso: dec, foodAfterDiscountPence: 999, trustedCourierQuote: quote,
    })).toEqual({
      ready: false, reason: "below_minimum", minimumFoodPence: 1000,
      shortfallPence: 1, phase: "quoted_delivery",
    });
  });

  test("no invented, expired or unserviceable quote can produce a December payment", () => {
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
        trustedCourierQuote: bad,
      })).toMatchObject({ ready: false, reason: "quote_required" });
    }
  });

  test("London date controls the boundary, not a device-local date", () => {
    const octoberUtc = "2027-03-28T00:30:00Z";
    expect(mealDeckDeliveryPolicy(octoberUtc)?.effectiveLocalDate).toBe("2027-03-28");
    expect(mealDeckDeliveryPolicy("2026-11-30T23:30:00Z")?.phase).toBe("november_free");
    expect(mealDeckDeliveryPolicy("2026-12-01T00:00:00Z")?.phase).toBe("quoted_delivery");
    expect(mealDeckDeliveryPolicy("invalid")).toBeNull();
  });
});
