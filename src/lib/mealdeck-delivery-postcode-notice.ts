/**
 * Explain rejected local delivery checks without conflating a postcode that
 * cannot be verified with a postcode genuinely outside the 4 km radius.
 * No geocoding, eligibility or payment decision is made here.
 */
export function deliveryAreaRejectionMessage(distanceMetres: number | null): string {
  return distanceMetres === null
    ? "We couldn't verify this as a current postcode. It may no longer be in use, may be newly issued, or the lookup may be unavailable. Check the postcode for your address."
    : "This postcode is outside MealDeck's 4 km delivery area. You can choose collection or kerbside pickup.";
}
