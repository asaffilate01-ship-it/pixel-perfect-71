/**
 * Owner-approved first launch: one kitchen in Luton.
 *
 * Future location configuration remains available to operations, but a valid
 * environment binding or the global opening switch cannot expand this scope.
 * This policy does not verify serviceability, payment or kitchen readiness.
 */
export const MEALDECK_LAUNCH_LOCATIONS = ["luton"] as const;
export const MEALDECK_LAUNCH_FULFILMENTS = ["delivery", "pickup", "curbside"] as const;
export const MEALDECK_LAUNCH_LOCATION_MESSAGE =
  "MealDeck is launching in Luton first. St Albans and Bedford are coming soon.";

export function isMealDeckLaunchLocation(value: unknown): value is "luton" {
  return MEALDECK_LAUNCH_LOCATIONS.some((location) => location === value);
}

/** Walk-in collection uses pickup; kerbside uses the existing curbside mode. */
export function isMealDeckLaunchFulfilment(
  location: unknown,
  fulfilment: unknown,
): fulfilment is (typeof MEALDECK_LAUNCH_FULFILMENTS)[number] {
  return (
    isMealDeckLaunchLocation(location) &&
    MEALDECK_LAUNCH_FULFILMENTS.some((mode) => mode === fulfilment)
  );
}
