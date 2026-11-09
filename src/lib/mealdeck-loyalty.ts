/**
 * MealDeck loyalty policy effective Monday 9 November 2026 (Europe/London).
 * Presentation/contract utilities only. The database payment-reconciliation
 * trigger is the sole authority to issue, reverse or correct points.
 */
export const MEALDECK_LOYALTY_START = "2026-11-09T00:00:00.000Z";
export const MEALDECK_PENCE_PER_POINT = 100;

export const MEALDECK_LOYALTY_TERMS =
  "From 9 November 2026, registered customers with verified email earn 1 point per complete £1 actually paid after discounts on eligible MealDeck orders. Only confirmed paid member orders qualify; guest orders do not. Refunded or disputed amounts do not earn points. Points are not cash and cannot currently be spent.";

export function mealdeckNetPaidPoints(
  payablePence: number,
  refundedPence = 0,
): number {
  if (
    !Number.isSafeInteger(payablePence) ||
    !Number.isSafeInteger(refundedPence) ||
    payablePence < 0 ||
    refundedPence < 0 ||
    refundedPence > payablePence
  ) throw new Error("Invalid paid/refunded pence");
  return Math.floor((payablePence - refundedPence) / MEALDECK_PENCE_PER_POINT);
}

export function mealdeckOrderEarnsPoints(input: {
  paidAt: string | null;
  registered: boolean;
  emailVerified: boolean;
  isGuest: boolean;
  paymentStatus: "paid" | "partially_refunded" | "refunded" | "pending" | "other";
  cancelledOrDisputed: boolean;
}): boolean {
  return (
    input.registered && input.emailVerified && !input.isGuest &&
    input.paidAt !== null &&
    Number.isFinite(Date.parse(input.paidAt)) &&
    Date.parse(input.paidAt) >= Date.parse(MEALDECK_LOYALTY_START) &&
    ["paid", "partially_refunded"].includes(input.paymentStatus) &&
    !input.cancelledOrDisputed
  );
}
