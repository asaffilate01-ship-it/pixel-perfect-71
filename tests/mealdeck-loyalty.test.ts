import { describe, expect, test } from "bun:test";
import {
  MEALDECK_LOYALTY_START,
  MEALDECK_LOYALTY_TERMS,
  mealdeckNetPaidPoints,
  mealdeckOrderEarnsPoints,
} from "../src/lib/mealdeck-loyalty";

describe("MealDeck one point per completed pound after discounts", () => {
  test("calculates whole paid pounds only and accounts for refunds", () => {
    expect(mealdeckNetPaidPoints(0)).toBe(0);
    expect(mealdeckNetPaidPoints(99)).toBe(0);
    expect(mealdeckNetPaidPoints(100)).toBe(1);
    expect(mealdeckNetPaidPoints(1599)).toBe(15);
    expect(mealdeckNetPaidPoints(2333)).toBe(23);
    expect(mealdeckNetPaidPoints(2333, 500)).toBe(18);
    expect(mealdeckNetPaidPoints(2333, 2333)).toBe(0);
    expect(() => mealdeckNetPaidPoints(1200, 1201)).toThrow();
    expect(() => mealdeckNetPaidPoints(NaN)).toThrow();
    expect(() => mealdeckNetPaidPoints(150.5)).toThrow();
  });
  test("requires a verified, registered, paid non-guest order from 9 November", () => {
    const eligible = {
      paidAt: MEALDECK_LOYALTY_START,
      registered: true,
      emailVerified: true,
      isGuest: false,
      paymentStatus: "paid" as const,
      cancelledOrDisputed: false,
    };
    expect(mealdeckOrderEarnsPoints(eligible)).toBe(true);
    expect(mealdeckOrderEarnsPoints({ ...eligible, registered: false })).toBe(false);
    expect(mealdeckOrderEarnsPoints({ ...eligible, emailVerified: false })).toBe(false);
    expect(mealdeckOrderEarnsPoints({ ...eligible, isGuest: true })).toBe(false);
    expect(mealdeckOrderEarnsPoints({ ...eligible, paymentStatus: "pending" })).toBe(false);
    expect(mealdeckOrderEarnsPoints({ ...eligible, paymentStatus: "refunded" })).toBe(false);
    expect(mealdeckOrderEarnsPoints({ ...eligible, cancelledOrDisputed: true })).toBe(false);
    expect(mealdeckOrderEarnsPoints({ ...eligible, paidAt: null })).toBe(false);
    expect(mealdeckOrderEarnsPoints({ ...eligible, paidAt: "2026-11-08T23:59:59.999Z" })).toBe(false);
    expect(mealdeckOrderEarnsPoints({ ...eligible, paymentStatus: "partially_refunded" })).toBe(true);
    expect(MEALDECK_LOYALTY_TERMS).toContain("1 point per complete £1");
  });
});
