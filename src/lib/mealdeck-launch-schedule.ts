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

/**
 * Owner-confirmed regular Luton hours from 9 November 2026 (Europe/London).
 * Display and preview only: real checkout availability stays with the server
 * and the staff Online / Busy / Pause / Closed controls.
 */
export const MEALDECK_LUTON_WEEKLY_HOURS = Object.freeze([
  Object.freeze({
    days: "Monday to Thursday",
    shortDays: "Mon–Thu",
    isoWeekdays: Object.freeze([1, 2, 3, 4]),
    schemaDays: Object.freeze(["Monday", "Tuesday", "Wednesday", "Thursday"]),
    opens: "17:00",
    closes: "23:00",
    hoursLabel: "5pm–11pm",
  }),
  Object.freeze({
    days: "Friday to Sunday",
    shortDays: "Fri–Sun",
    isoWeekdays: Object.freeze([5, 6, 7]),
    schemaDays: Object.freeze(["Friday", "Saturday", "Sunday"]),
    opens: "16:00",
    closes: "23:00",
    hoursLabel: "4pm–11pm",
  }),
] as const);

export const MEALDECK_LUTON_HOURS_LABEL =
  MEALDECK_LUTON_WEEKLY_HOURS.map((row) => `${row.shortDays} ${row.hoursLabel}`).join(" · ") +
  " · UK time";

export const MEALDECK_LUTON_HOURS_PROSE =
  MEALDECK_LUTON_WEEKLY_HOURS.map((row) => `${row.days}, ${row.hoursLabel}`).join("; ") +
  ". All times are UK local time.";

const londonParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: MEALDECK_LAUNCH_TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const ISO_WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Whether the regular Luton hours cover this instant, in UK local time. */
export function isMealDeckLutonRegularHoursAt(now: Date | number): boolean {
  const timestamp = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(timestamp)) return false;
  const parts = Object.fromEntries(
    londonParts.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]),
  );
  const weekday = ISO_WEEKDAY[parts["weekday"] ?? ""];
  const minutes = Number(parts["hour"]) * 60 + Number(parts["minute"]);
  const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  return MEALDECK_LUTON_WEEKLY_HOURS.some((row) => {
    if (!weekday || !(row.isoWeekdays as readonly number[]).includes(weekday)) return false;
    return minutes >= toMinutes(row.opens) && minutes < toMinutes(row.closes);
  });
}

/** Marketing-only Sunday pre-opening notice. It never grants checkout or delivery access. */
export function isMealDeckSundayDeliveryPreopen(now: number): boolean {
  const sunday = MEALDECK_LAUNCH_DAYS[2];
  return (
    Number.isFinite(now) &&
    now >= Date.parse(`${sunday.date}T00:00:00Z`) &&
    now < Date.parse(sunday.opensAt)
  );
}

/** Sunday service copy must disappear outside the actual Sunday opening window. */
export function isMealDeckSundayDeliveryService(now: number): boolean {
  const sunday = MEALDECK_LAUNCH_DAYS[2];
  return (
    Number.isFinite(now) &&
    now >= Date.parse(sunday.opensAt) &&
    now < Date.parse(sunday.closesAt)
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
