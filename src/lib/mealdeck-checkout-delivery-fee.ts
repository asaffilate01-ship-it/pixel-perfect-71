import { DELIVERY_FEE_PENCE, type FulfilmentType } from "./mealdeck";

/**
 * Server-enforced launch delivery charge. This is NOT a courier quote.
 * Once dynamic delivery pricing is enabled, replace this with a trusted,
 * server-side Dishbee quote tied to location, order and expiry.
 */
export function canonicalDeliveryFeePence(fulfilment: FulfilmentType): number {
  return fulfilment === "delivery" ? DELIVERY_FEE_PENCE : 0;
}

/** Never trust a browser-submitted fee, even if the order is payment-pending. */
export function validateCheckoutDeliveryFee(
  fulfilment: FulfilmentType,
  customerSubmittedPence: number,
): boolean {
  return Number.isSafeInteger(customerSubmittedPence) &&
    customerSubmittedPence === canonicalDeliveryFeePence(fulfilment);
}
