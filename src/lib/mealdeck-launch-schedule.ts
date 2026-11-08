/** Owner-confirmed launch hours. Server/database time decides checkout eligibility. */
export const MEALDECK_LAUNCH_TIME_ZONE = "Europe/London" as const;

export const MEALDECK_LAUNCH_DAYS = Object.freeze([
  Object.freeze({
    date: "2026-11-06",
    label: "Friday 6 November",
    shortLabel: "Fri 6 Nov",
    opensAt: "2026-11-06T15:00:00Z",
    closesAt: "2026-11-07T00:00:00Z",
    hoursLabel: "3pm–midnight",
  }),
  Object.freeze({
    date: "2026-11-07",
    label: "Saturday 7 November",
    shortLabel: "Sat 7 Nov",
    opensAt: "2026-11-07T15:00:00Z",
    closesAt: "2026-11-08T00:00:00Z",
    hoursLabel: "3pm–midnight",
  }),
  Object.freeze({
    date: "2026-11-08",
    label: "Sunday 8 November",
    shortLabel: "Sun 8 Nov",
    opensAt: "2026-11-08T15:00:00Z",
    closesAt: "2026-11-08T23:00:00Z",
    hoursLabel: "3pm–11pm",
  }),
] as const);

export type MealDeckLaunchDay = (typeof MEALDECK_LAUNCH_DAYS)[number];

export const MEALDECK_LAUNCH_HOURS_LABEL =
  MEALDECK_LAUNCH_DAYS.map((day) => `${day.shortLabel} ${day.hoursLabel}`).join(" · ") +
  " · 2026 · UK time";

export const MEALDECK_LAUNCH_HOURS_PROSE =
  MEALDECK_LAUNCH_DAYS.map((day) => `${day.label}, ${day.hoursLabel}`).join("; ") +
  ". All times are UK local time.";

/** Marketing-only Sunday pre-opening notice. It never grants checkout or delivery access. */
export function isMealDeckSundayDeliveryPreopen(now: number): boolean {
  const sunday = MEALDECK_LAUNCH_DAYS[2];
  return (
    Number.isFinite(now) &&
    now >= Date.parse(`${sunday.date}T00:00:00Z`) &&
    now < Date.parse(sunday.opensAt)
  );
}

/** Exact launch windows, including the nightly closure. No browser-local dates. */
export function mealDeckLaunchWindowAt(now: Date | string | number): MealDeckLaunchDay | null {
  const timestamp =
    now instanceof Date
      ? now.getTime()
      : typeof now === "number"
        ? now
        : typeof now === "string" && /(?:Z|[+-]\d{2}:\d{2})$/i.test(now)
          ? Date.parse(now)
          : Number.NaN;
  if (!Number.isFinite(timestamp)) return null;
  return (
    MEALDECK_LAUNCH_DAYS.find(
      (day) => timestamp >= Date.parse(day.opensAt) && timestamp < Date.parse(day.closesAt),
    ) ?? null
  );
}

/** A time-window check, not a replacement for payment, kitchen or session authority. */
export function isMealDeckGuestCheckoutWindow(now: Date | string | number): boolean {
  return mealDeckLaunchWindowAt(now) !== null;
}
