import type { DeliveryQuote } from "./mealdeck-delivery-selection";

/**
 * Effective date: fulfilment date in Europe/London (not a browser-local clock).
 * During the remaining November 2026 promotion the customer pays no delivery
 * fee when their discounted FOOD basket is at least £15.
 * Starting 1 December 2026, the minimum becomes £10 and a genuine
 * provider-cost-derived delivery fee must be confirmed before payment.
 * A missing quote NEVER becomes an automatic free delivery.
 */
export type DeliveryPricingPhase = "november_free" | "quoted_delivery";
export type DeliveryPricingPolicy = {
  phase: DeliveryPricingPhase;
  minimumFoodPence: number;
  deliveryFeeMode: "free" | "trusted_quote_required";
  effectiveLocalDate: string;
};

function londonDate(iso: string): string | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.valueOf())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (type: "year" | "month" | "day") =>
    parts.find((p) => p.type === type)?.value;
  const year = get("year"), month = get("month"), day = get("day");
  return year && month && day ? year + "-" + month + "-" + day : null;
}
export function mealDeckDeliveryPolicy(fulfilmentAtIso: string): DeliveryPricingPolicy | null {
  const day = londonDate(fulfilmentAtIso);
  if (!day) return null;
  const promotional = day >= "2026-11-01" && day <= "2026-11-30";
  return {
    phase: promotional ? "november_free" : "quoted_delivery",
    minimumFoodPence: promotional ? 1_500 : 1_000,
    deliveryFeeMode: promotional ? "free" : "trusted_quote_required",
    effectiveLocalDate: day,
  };
}

export type DeliveryCheckoutPrice =
  | { ready: true; minimumFoodPence: number; foodPence: number;
      deliveryPence: number; payablePence: number; phase: DeliveryPricingPhase;
      quoteId: string | null; courier: DeliveryQuote["provider"] | null }
  | { ready: false; reason: "invalid" | "below_minimum" | "quote_required";
      minimumFoodPence: number | null; shortfallPence: number | null;
      phase: DeliveryPricingPhase | null };

/**
 * Called with a server-verified selected quote after checking enabled provider,
 * serviceability, origin/destination, pickup window, currency and expiry.
 * For December, the initial pricing basis is the real quoted courier fee,
 * before any separately authorised markup/rounding policy is introduced.
 * If actual booking later costs more, MealDeck bears the difference rather
 * than changing the price of a fully paid order.
 */
export function priceMealDeckDelivery(input: {
  fulfilmentAtIso: string;
  foodAfterDiscountPence: number;
  trustedCourierQuote?: DeliveryQuote | null;
}): DeliveryCheckoutPrice {
  const policy = mealDeckDeliveryPolicy(input.fulfilmentAtIso);
  const food = input.foodAfterDiscountPence;
  if (!policy || !Number.isSafeInteger(food) || food < 0)
    return { ready: false, reason: "invalid", minimumFoodPence: null,
      shortfallPence: null, phase: null };
  const shortfall = Math.max(0, policy.minimumFoodPence - food);
  if (shortfall) return { ready: false, reason: "below_minimum",
    minimumFoodPence: policy.minimumFoodPence, shortfallPence: shortfall,
    phase: policy.phase };
  if (policy.phase === "november_free") return {
    ready: true, foodPence: food, minimumFoodPence: policy.minimumFoodPence,
    deliveryPence: 0, payablePence: food, phase: policy.phase,
    quoteId: null, courier: null,
  };
  const q = input.trustedCourierQuote;
  const now = Date.parse(input.fulfilmentAtIso);
  if (!q || !Number.isFinite(now) || !q.serviceable ||
      q.currency !== "GBP" || !/^[A-Za-z0-9_-]{1,80}$/.test(q.quoteId) ||
      !Number.isSafeInteger(q.amountPence) || q.amountPence < 0 ||
      !Number.isSafeInteger(q.estimatedMinutes) || q.estimatedMinutes < 1 ||
      !Number.isFinite(Date.parse(q.expiresAt)) ||
      Date.parse(q.expiresAt) <= now)
    return { ready: false, reason: "quote_required",
      minimumFoodPence: policy.minimumFoodPence, shortfallPence: null,
      phase: policy.phase };
  const total = food + q.amountPence;
  if (!Number.isSafeInteger(total))
    return { ready: false, reason: "invalid", minimumFoodPence: null,
      shortfallPence: null, phase: null };
  return { ready: true, foodPence: food,
    minimumFoodPence: policy.minimumFoodPence,
    deliveryPence: q.amountPence, payablePence: total, phase: policy.phase,
    quoteId: q.quoteId, courier: q.provider };
}
