/**
 * MealDeck launch-channel restrictions.
 * Dishbee remains the source of truth for *live* channel availability, but
 * neither this storefront nor its server may offer a mode outside this policy.
 *
 * Cafe 1 St Albans direct ordering is a separate Dishbee tenant and has its
 * own channel policy; it must not be restricted by MealDeck's rules.
 */
export type MealDeckLaunchLocation = "luton" | "stalbans";
export type MealDeckLaunchFulfilment = "delivery" | "pickup" | "curbside" | "dinein";

export const mealDeckLaunchFulfilments: Readonly<
  Record<MealDeckLaunchLocation, readonly MealDeckLaunchFulfilment[]>
> = {
  luton: ["delivery", "pickup", "curbside"],
  stalbans: ["delivery"],
};

export function isMealDeckLaunchFulfilmentAllowed(
  location: MealDeckLaunchLocation,
  fulfilment: MealDeckLaunchFulfilment,
): boolean {
  return mealDeckLaunchFulfilments[location].includes(fulfilment);
}
