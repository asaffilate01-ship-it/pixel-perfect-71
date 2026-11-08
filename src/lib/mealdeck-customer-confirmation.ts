/**
 * Presentation only: use the existing canonical handoff code returned by
 * the private guest/member receipt. Never generate a second code, derive one
 * from an order number, or show a credential before verified payment.
 */
export type CustomerConfirmationFulfilment = "pickup" | "curbside" | "delivery";

export function visibleCustomerConfirmationCode(receipt: {
  verifiedPaid: boolean;
  handoffCode: string | null | undefined;
}): string | null {
  if (receipt.verifiedPaid !== true || typeof receipt.handoffCode !== "string") return null;
  return /^[0-9]{4}$/.test(receipt.handoffCode) ? receipt.handoffCode : null;
}

export function customerConfirmationInstruction(fulfilment: CustomerConfirmationFulfilment): string {
  if (fulfilment === "delivery") {
    return "Show this code to your MealDeck driver when your order arrives.";
  }
  if (fulfilment === "curbside") {
    return "Show this code to the MealDeck team when your order is brought to your car.";
  }
  return "Give this code to the MealDeck team when you collect your order.";
}
