import type { DeliveryQuote } from "./mealdeck-delivery-selection";

/**
 * The owner-approved Luton own-driver offer continues: free delivery for £15+
 * discounted food within the independent server-verified 4 km area, while the
 * checkout and driver capacity are enabled. The November promotion has NO
 * automatic 1 December switch to paid/£10 delivery.
 *
 * Trusted courier pricing remains an explicit FUTURE integration mode; merely
 * reaching a calendar date must never change the customer's payable amount.
 * A quote is not proof of payment, delivery serviceability, or a booking.
 * Effective service day is parsed in Europe/London, not device-local time.
 */
export type DeliveryPricingPhase = "own_driver_free" | "quoted_delivery";
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
export function mealDeckDeliveryPolicy(
  fulfilmentAtIso: string,
  /** Only a reviewed server-side integration may deliberately enable quoted pricing. */
  phase: DeliveryPricingPhase = "own_driver_free",
): DeliveryPricingPolicy | null {
  const day = londonDate(fulfilmentAtIso);
  if (!day || day < "2026-11-01" ||
    (phase !== "own_driver_free" && phase !== "quoted_delivery")) return null;
  return {
    phase,
    minimumFoodPence: phase === "own_driver_free" ? 1_500 : 1_000,
    deliveryFeeMode: phase === "own_driver_free" ? "free" : "trusted_quote_required",
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
 * Only when a trusted server-controlled integration explicitly selects
 * "quoted_delivery" is the real courier fee considered. There is no
 * date-based auto-transition. Future markup needs separately approved policy.
 * If actual booking later costs more, MealDeck bears the difference rather
 * than changing the price of a fully paid order.
 */
export function priceMealDeckDelivery(input: {
  fulfilmentAtIso: string;
  foodAfterDiscountPence: number;
  trustedCourierQuote?: DeliveryQuote | null;
  /** Not a browser/checkout setting; future trusted pricing integration only. */
  pricingMode?: DeliveryPricingPhase;
}): DeliveryCheckoutPrice {
  const policy = mealDeckDeliveryPolicy(input.fulfilmentAtIso, input.pricingMode);
  const food = input.foodAfterDiscountPence;
  if (!policy || !Number.isSafeInteger(food) || food < 0)
    return { ready: false, reason: "invalid", minimumFoodPence: null,
      shortfallPence: null, phase: null };
  const shortfall = Math.max(0, policy.minimumFoodPence - food);
  if (shortfall) return { ready: false, reason: "below_minimum",
    minimumFoodPence: policy.minimumFoodPence, shortfallPence: shortfall,
    phase: policy.phase };
  if (policy.phase === "own_driver_free") return {
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
