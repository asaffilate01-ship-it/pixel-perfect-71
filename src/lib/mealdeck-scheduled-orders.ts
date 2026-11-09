/**
 * Scheduled fulfilment policy for MealDeck Luton, evaluated with the timestamp
 * verified by Stripe. A browser-selected slot is only a request, never payment
 * authority or a kitchen release. UK daylight-saving transitions are handled
 * using Europe/London civil time, not the customer's device clock.
 */
export const MEALDECK_SCHEDULE_TIME_ZONE = "Europe/London" as const;
export const MEALDECK_SCHEDULE_OPEN_MINUTE = 13 * 60;
export const MEALDECK_SCHEDULE_STEP_MINUTES = 15;
export type ScheduledFulfilment = "pickup" | "curbside" | "delivery";
export type MealDeckScheduledSlot = {
  fulfilmentAt: string;
  prepStartAt: string;
};

const scheduleRules = {
  pickup: { leadMinutes: 45, prepMinutes: 30, lastMinute: 22 * 60 + 45 },
  curbside: { leadMinutes: 45, prepMinutes: 30, lastMinute: 22 * 60 + 45 },
  delivery: { leadMinutes: 75, prepMinutes: 60, lastMinute: 22 * 60 + 15 },
} as const;

type LondonTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};
const londonClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: MEALDECK_SCHEDULE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function partsAt(instant: number): LondonTime | null {
  if (!Number.isFinite(instant)) return null;
  const parts = londonClock.formatToParts(new Date(instant));
  const get = (name: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === name)?.value);
  const time = {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
  return Object.values(time).every(Number.isInteger) ? time : null;
}

function millisAtLondonMinute(day: LondonTime, minuteOfDay: number): number | null {
  // All MealDeck service slots occur after the DST switch (which is overnight).
  // Compute the local UTC offset using midday of the same UK calendar date.
  const noonUtc = Date.UTC(day.year, day.month - 1, day.day, 12);
  const noon = partsAt(noonUtc);
  if (!noon || noon.year !== day.year || noon.month !== day.month || noon.day !== day.day)
    return null;
  const offset = noon.hour * 60 + noon.minute - 12 * 60;
  const timestamp = Date.UTC(day.year, day.month - 1, day.day, 0, minuteOfDay - offset);
  const check = partsAt(timestamp);
  if (
    !check || check.year !== day.year || check.month !== day.month ||
    check.day !== day.day || check.hour * 60 + check.minute !== minuteOfDay
  ) return null;
  return timestamp;
}

function asInstant(value: Date | string | number): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string" && /(?:Z|[+-]\d\d:\d\d)$/i.test(value))
    return Date.parse(value);
  return NaN;
}

/** Only offer same-day slots after 13:00 UK local time, never in the past. */
export function mealDeckScheduledSlots(
  verifiedPaymentAt: Date | string | number,
  fulfilment: ScheduledFulfilment,
): MealDeckScheduledSlot[] {
  const paidAt = asInstant(verifiedPaymentAt);
  const day = partsAt(paidAt);
  const rule = scheduleRules[fulfilment];
  if (!day || !rule || day.hour * 60 + day.minute < MEALDECK_SCHEDULE_OPEN_MINUTE)
    return [];
  const result: MealDeckScheduledSlot[] = [];
  const firstMinute = MEALDECK_SCHEDULE_OPEN_MINUTE + rule.leadMinutes;
  for (let minute = firstMinute; minute <= rule.lastMinute; minute += MEALDECK_SCHEDULE_STEP_MINUTES) {
    const fulfilmentAt = millisAtLondonMinute(day, minute);
    const prepStartAt = millisAtLondonMinute(day, minute - rule.prepMinutes);
    if (fulfilmentAt == null || prepStartAt == null ||
        fulfilmentAt < paidAt + rule.leadMinutes * 60_000) continue;
    result.push({
      fulfilmentAt: new Date(fulfilmentAt).toISOString(),
      prepStartAt: new Date(prepStartAt).toISOString(),
    });
  }
  return result;
}

/**
 * Recalculate the chosen slot when a completed payment is verified. If the slot
 * is no longer valid at that moment, hold it for explicit customer/staff
 * rescheduling or refund; never silently mark an invalid scheduled order ready.
 */
export function verifiedScheduledSlot(
  verifiedPaymentAt: Date | string | number,
  fulfilment: ScheduledFulfilment,
  requestedFulfilmentAt: string,
): MealDeckScheduledSlot | null {
  if (!/(?:Z|[+-]\d\d:\d\d)$/i.test(requestedFulfilmentAt)) return null;
  const instant = Date.parse(requestedFulfilmentAt);
  if (!Number.isFinite(instant)) return null;
  return mealDeckScheduledSlots(verifiedPaymentAt, fulfilment).find(
    (slot) => Date.parse(slot.fulfilmentAt) === instant,
  ) ?? null;
}

export function scheduledTimeLabel(instant: string): string {
  const at = Date.parse(instant);
  if (!Number.isFinite(at)) throw new Error("Invalid scheduled time");
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MEALDECK_SCHEDULE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at));
}

/** Purely presentational; feed only from an authorised canonical kitchen card. */
export function scheduledKdsHeadline(
  fulfilment: ScheduledFulfilment,
  fulfilmentAt: string | null | undefined,
  prepStartAt: string | null | undefined,
): string | null {
  if (!fulfilmentAt || !prepStartAt) return null;
  const duration = scheduleRules[fulfilment]?.prepMinutes;
  if (
    !duration ||
    Date.parse(fulfilmentAt) - Date.parse(prepStartAt) !== duration * 60_000
  ) return null;
  const kind = fulfilment === "delivery" ? "DELIVERY" : fulfilment === "curbside" ? "KERBSIDE" : "COLLECTION";
  return "SCHEDULED " + kind + " " + scheduledTimeLabel(fulfilmentAt) +
    " · PREP FROM " + scheduledTimeLabel(prepStartAt) + " (" + duration + " MIN)";
}
