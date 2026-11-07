import { receiptPromotionAssets } from "./receipt-promotion-assets.mjs";

/** All images and destinations are fixed reviewed data. Receipt fields select
 * an index only; they never become image bytes, destinations or markup. */
export const receiptPromotions = receiptPromotionAssets;

/** The canonical positive sequence is stored as a decimal string and can
 * exceed JavaScript's safe integer range. Compute the remainder digit by digit.
 * Legacy orders use a stable FNV-1a hash of the order UUID, never a print-job,
 * copy number, device-local counter, time or random value. */
export function receiptPromotionIndex(orderNumber, orderId) {
  if (
    typeof orderNumber === "string" &&
    /^(?!0000$)(?:[0-9]{4}|[1-9][0-9]{4,18})$/.test(orderNumber)
  ) {
    let remainder = 0;
    for (const digit of orderNumber) remainder = (remainder * 10 + digit.charCodeAt(0) - 48) % 8;
    return (remainder + 7) % 8;
  }
  if (
    typeof orderId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)
  ) {
    throw new TypeError("A canonical order identity is required for the receipt promotion.");
  }
  let hash = 0x811c9dc5;
  for (const character of orderId.toLowerCase())
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0;
  return hash % 8;
}

/** Reprints of the same canonical order always retain their original slot. */
export function receiptPromotionForOrder({ orderNumber, orderId }) {
  return receiptPromotions[receiptPromotionIndex(orderNumber, orderId)];
}
