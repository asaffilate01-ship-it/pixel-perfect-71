export const KITCHEN_AVAILABILITY_STATES = ["online", "busy", "paused", "closed"] as const;

export type KitchenAvailabilityState = (typeof KITCHEN_AVAILABILITY_STATES)[number];

export type KitchenAvailability = {
  state: KitchenAvailabilityState;
  collectionEstimateMinutes: number | null;
};

export function parseKitchenAvailabilityState(value: unknown): KitchenAvailabilityState | null {
  return KITCHEN_AVAILABILITY_STATES.includes(value as KitchenAvailabilityState)
    ? (value as KitchenAvailabilityState)
    : null;
}

export function parseKitchenAvailability(value: unknown): KitchenAvailability | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const state = parseKitchenAvailabilityState(input["state"]);
  const minutes = input["collectionEstimateMinutes"];
  if (
    !state ||
    !(
      minutes === null ||
      (Number.isInteger(minutes) && (minutes as number) >= 5 && (minutes as number) <= 180)
    )
  )
    return null;
  return { state, collectionEstimateMinutes: minutes as number | null };
}

export function kitchenAcceptsNewOrders(state: KitchenAvailabilityState): boolean {
  return state === "online" || state === "busy";
}
