/**
 * Presentation of the member loyalty panel on /account. The balance always
 * comes from the authenticated profile response; this module never invents
 * or caches a number, and never grants points.
 */
export type MemberLoyaltySnapshot = { enabled: boolean; points: number } | null | undefined;

export type MemberLoyaltyView =
  | { kind: "live"; points: number; pointsLabel: string }
  | { kind: "unavailable" };

export function memberLoyaltyView(loyalty: MemberLoyaltySnapshot): MemberLoyaltyView {
  if (
    !loyalty ||
    loyalty.enabled !== true ||
    !Number.isSafeInteger(loyalty.points) ||
    loyalty.points < 0
  )
    return { kind: "unavailable" };
  return {
    kind: "live",
    points: loyalty.points,
    pointsLabel: loyalty.points.toLocaleString("en-GB"),
  };
}

/** Owner-approved standing earning rules (from 9 November 2026). */
export const MEMBER_LOYALTY_RULES = [
  "Registered, verified members earn 1 point for every complete £1 actually paid after discounts on eligible paid orders from 9 November 2026.",
  "Guest orders earn 0 points.",
  "Points are reversed if an order is refunded or disputed.",
  "Points are not currently redeemable.",
  "Marketing opt-ins are optional and never needed to earn points.",
] as const;

export const MEMBER_LOYALTY_UNAVAILABLE_MESSAGE =
  "Your points balance is temporarily unavailable. Please check back shortly.";
