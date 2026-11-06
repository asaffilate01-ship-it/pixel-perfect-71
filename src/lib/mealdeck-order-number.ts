import { z } from "zod";

/** A canonical display reference, never payment evidence or a collection credential. */
export const ORDER_NUMBER_PATTERN = /^(?!0000$)(?:[0-9]{4}|[1-9][0-9]{4,18})$/;

export function isOrderNumber(value: unknown): value is string {
  return typeof value === "string" && ORDER_NUMBER_PATTERN.test(value);
}

export const orderNumberSchema = z.string().regex(ORDER_NUMBER_PATTERN);

/** Older orders keep their existing reference until a canonical number is available. */
export function orderDisplayNumber(
  orderNumber: string | null | undefined,
  fallback: string,
): string {
  return isOrderNumber(orderNumber) ? orderNumber : fallback;
}
