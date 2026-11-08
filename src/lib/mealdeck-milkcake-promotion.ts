/** Presentation contract only. The database decides eligibility and final money. */
export type MealDeckMilkcakePromotion = {
  id: "sunday-milk-cake-20261108";
  finalUnitPence: 99;
  regularUnitPence: 399;
  maximumQuantityPerOrder: 1;
  discountIncluded: true;
  startsAt: string;
  endsAt: string;
};

export type AppliedMealDeckMilkcakePromotion = MealDeckMilkcakePromotion & {
  eligibleQuantity: 1;
  discountPence: 300;
};

export const MILKCAKE_PROMOTION_STARTS_AT = "2026-11-08T15:00:00Z";
export const MILKCAKE_PROMOTION_ENDS_AT = "2026-11-08T23:00:00Z";

/** Exact reviewed identities; neither an editable name nor a partial SKU grants an offer. */
export const MILKCAKE_PROMOTION_SKUS = [
  "tavo-chicken-desserts-biscoff-milkcake",
  "tavo-chicken-desserts-oreo-milkcake",
  "moktl-desserts-biscoff-milkcake",
  "moktl-desserts-oreo-milkcake",
  "loadd-desserts-biscoff-milkcake",
  "loadd-desserts-oreo-milkcake",
  "skorch-burgers-desserts-biscoff-milkcake",
  "skorch-burgers-desserts-oreo-milkcake",
  "souvano-desserts-biscoff-milkcake",
  "souvano-desserts-oreo-milkcake",
] as const;

export function isMealDeckMilkcakePromotion(value: unknown): value is MealDeckMilkcakePromotion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const promotion = value as Record<string, unknown>;
  return (
    promotion["id"] === "sunday-milk-cake-20261108" &&
    promotion["finalUnitPence"] === 99 &&
    promotion["regularUnitPence"] === 399 &&
    promotion["maximumQuantityPerOrder"] === 1 &&
    promotion["discountIncluded"] === true &&
    typeof promotion["startsAt"] === "string" &&
    typeof promotion["endsAt"] === "string" &&
    Date.parse(promotion["startsAt"]) === Date.parse(MILKCAKE_PROMOTION_STARTS_AT) &&
    Date.parse(promotion["endsAt"]) === Date.parse(MILKCAKE_PROMOTION_ENDS_AT)
  );
}

export function isAppliedMealDeckMilkcakePromotion(
  value: unknown,
): value is AppliedMealDeckMilkcakePromotion {
  return (
    isMealDeckMilkcakePromotion(value) &&
    (value as Partial<AppliedMealDeckMilkcakePromotion>).eligibleQuantity === 1 &&
    (value as Partial<AppliedMealDeckMilkcakePromotion>).discountPence === 300
  );
}

type PricedPromotionLine = {
  lineId: string;
  quantity: number;
  base_unit_pence: number;
  unit_pence: number;
  line_pence: number;
  promotion?: unknown;
};

/** Read one frozen allocation, never guess from a product name or today's clock. */
export function appliedMilkcakePromotion(lines: readonly PricedPromotionLine[]) {
  const marked = lines.filter((line) => line.promotion !== undefined);
  if (marked.length !== 1) return null;
  const line = marked[0]!;
  if (
    !isAppliedMealDeckMilkcakePromotion(line.promotion) ||
    !Number.isSafeInteger(line.quantity) ||
    line.quantity < 1 ||
    line.base_unit_pence !== line.promotion.regularUnitPence ||
    !Number.isSafeInteger(line.unit_pence) ||
    line.unit_pence < line.base_unit_pence ||
    !Number.isSafeInteger(line.line_pence) ||
    line.line_pence !== line.unit_pence * line.quantity
  )
    return null;
  return { lineId: line.lineId, ...line.promotion };
}

/** Reconcile visible 99p lines with the unchanged canonical gross and discounts. */
export function milkcakeQuoteDisplayTotals(total: {
  grossPence: number;
  discountPence: number;
  totalPence: number;
  lines: readonly PricedPromotionLine[];
}) {
  const applied = appliedMilkcakePromotion(total.lines);
  const promotion =
    applied &&
    Number.isSafeInteger(total.grossPence) &&
    Number.isSafeInteger(total.discountPence) &&
    total.discountPence >= applied.discountPence &&
    total.grossPence >= total.discountPence &&
    total.grossPence - total.discountPence === total.totalPence &&
    total.lines.reduce((sum, line) => sum + line.line_pence, 0) === total.grossPence
      ? applied
      : null;
  const includedDiscountPence = promotion?.discountPence ?? 0;
  return {
    itemsSubtotalPence: total.grossPence - includedDiscountPence,
    openingDiscountPence: total.discountPence - includedDiscountPence,
    totalPence: total.totalPence,
    promotion,
  };
}

/** Validate a server snapshot, never the browser clock or a saved basket price. */
export function isPublicMilkcakePromotion(
  value: unknown,
  sku: string,
  pricePence: number,
  checkedAt: string,
): value is MealDeckMilkcakePromotion {
  const checked = Date.parse(checkedAt);
  return (
    isMealDeckMilkcakePromotion(value) &&
    MILKCAKE_PROMOTION_SKUS.some((id) => id === sku) &&
    pricePence === value.regularUnitPence &&
    Number.isFinite(checked) &&
    checked >= Date.parse(value.startsAt) &&
    checked < Date.parse(value.endsAt)
  );
}

export const MILKCAKE_PROMOTION_TERMS =
  "One milkcake per order is 99p after the 30% discount. The displayed 99p offer price already includes this discount. Additional milkcakes are £3.99 each before the usual 30% discount. The one-milkcake limit applies across both flavours and all brands in the same order.";
