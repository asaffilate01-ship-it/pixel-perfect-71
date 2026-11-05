/** Shared presentation contract. Eligibility and money are decided on the server. */
export type MealDeckOpeningOffer = {
  status: "unscheduled" | "upcoming" | "active" | "ended";
  startsAt: string | null;
  endsAt: string | null;
  timezone: "Europe/London";
  serverNow: string;
};

export const OPENING_OFFER_PERCENT = 30;
export const OPENING_OFFER_DAYS = 3;
export const OPENING_OFFER_TERMS_VERSION = "opening-weekend-20261105-v1";
export const OPENING_OFFER_FULFILMENTS = ["pickup", "curbside"] as const;

export function unscheduledOpeningOffer(now = new Date()): MealDeckOpeningOffer {
  return {
    status: "unscheduled",
    startsAt: null,
    endsAt: null,
    timezone: "Europe/London",
    serverNow: now.toISOString(),
  };
}

/** Display helper only; checkout recomputes this from the database clock. */
export function openingOfferDiscountPence(grossPence: number): number {
  if (!Number.isSafeInteger(grossPence) || grossPence < 0 || grossPence > 10_000_000)
    throw new Error("Invalid basket amount");
  // Round the whole basket discount once. Never round each brand separately.
  return Math.floor((grossPence * OPENING_OFFER_PERCENT + 50) / 100);
}

export type MealDeckKerbsideVehicle = {
  make: string;
  registrationLast4: string;
  colour: string;
};

export function parseKerbsideVehicle(value: unknown): MealDeckKerbsideVehicle | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !["make", "registrationLast4", "colour"].includes(key)))
    return null;
  const make = typeof data["make"] === "string" ? data["make"].trim() : "";
  const colour = typeof data["colour"] === "string" ? data["colour"].trim() : "";
  const registrationLast4 =
    typeof data["registrationLast4"] === "string"
      ? data["registrationLast4"].trim().toUpperCase()
      : "";
  const containsControlCharacter = Array.from(make + colour).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  // UK registrations contain letters as well as digits. Store only the requested suffix.
  return make.length >= 2 &&
    make.length <= 60 &&
    colour.length >= 2 &&
    colour.length <= 40 &&
    !containsControlCharacter &&
    /^[A-Z0-9]{4}$/.test(registrationLast4)
    ? { make, registrationLast4, colour }
    : null;
}

export function parseOpeningOffer(value: unknown): MealDeckOpeningOffer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    !["unscheduled", "upcoming", "active", "ended"].includes(String(v["status"])) ||
    v["timezone"] !== "Europe/London" ||
    typeof v["serverNow"] !== "string" ||
    !Number.isFinite(Date.parse(v["serverNow"]))
  )
    return null;
  const validDate = (date: unknown) =>
    typeof date === "string" && Number.isFinite(Date.parse(date));
  if (v["status"] === "unscheduled") {
    if (v["startsAt"] !== null || v["endsAt"] !== null) return null;
  } else if (
    !validDate(v["startsAt"]) ||
    !validDate(v["endsAt"]) ||
    Date.parse(v["endsAt"] as string) <= Date.parse(v["startsAt"] as string)
  )
    return null;
  return v as MealDeckOpeningOffer;
}
