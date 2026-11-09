/**
 * MealDeck Luton scheduled fulfilment policy (UK local time).
 *
 * This is a deterministic policy/visualisation contract, NOT a payment or
 * booking authority. The independent MealDeck server must resolve it using
 * a trusted clock, current staff availability, saved order and verified
 * Stripe capture before it issues a confirmed slot or releases any KDS ticket.
 */
export const MEALDECK_SCHEDULED_ORDERS_ENABLED = false as const;
export const SCHEDULE_TIMEZONE = "Europe/London" as const;
export const SCHEDULE_SLOT_MINUTES = 15;
export const PREORDER_OPENS_MINUTES = 13 * 60;
export const GROUP_UNPAID_ROOM_TTL_MINUTES = 30;
export type ScheduledFulfilment = "pickup" | "curbside" | "delivery";
export type ScheduleOrderSource = "personal" | "group";

export type ScheduleSlot = Readonly<{
  serviceDate: string;
  fulfilment: ScheduledFulfilment;
  time: string; // selected 15-minute local HH:mm
  slotAt: string; // exact UTC timestamp, never derived from browser input alone
  prepStartsAt: string; // exact UTC timestamp
  preparationMinutes: 30 | 60;
}>;

type DayWindow = Readonly<{
  kitchenOpensMinutes: number;
  kitchenClosesMinutes: number;
  firstPickupMinutes: number;
  firstDeliveryMinutes: number;
  lastPickupMinutes: number;
  lastDeliveryMinutes: number;
}>;

const london = new Intl.DateTimeFormat("en-GB", {
  timeZone: SCHEDULE_TIMEZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const strictDate = /^\d{4}-\d{2}-\d{2}$/;
const strictInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/i;
const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const ceilToQuarter = (minutes: number) => Math.ceil(minutes / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_MINUTES;

function validServiceDate(value: string): boolean {
  if (!strictDate.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day || year < 2026 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value;
}

function instantMs(value: string): number {
  const ms = strictInstant.test(value) ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : NaN;
}

export function londonClockAt(instant: string): {
  date: string;
  minutes: number;
} | null {
  const ms = instantMs(instant);
  if (!Number.isFinite(ms)) return null;
  const parts = Object.fromEntries(
    london.formatToParts(new Date(ms)).map((part) => [part.type, part.value]),
  );
  const year = parts["year"], month = parts["month"], day = parts["day"];
  const hour = Number(parts["hour"]), minute = Number(parts["minute"]);
  if (!year || !month || !day || !Number.isInteger(hour) ||
      !Number.isInteger(minute) || hour < 0 || hour > 23 ||
      minute < 0 || minute > 59) return null;
  // Preserve seconds and milliseconds: a payment at 18:30:59 cannot claim a
  // 19:00 pickup slot (it has less than the full 30 minutes of prep time).
  return { date: `${year}-${month}-${day}`, minutes: hour * 60 + minute + (ms % 60_000) / 60_000 };
}

/** Resolve UK evening slots across summer and winter time, without using device TZ. */
export function londonSlotInstant(serviceDate: string, minutes: number): string | null {
  if (!validServiceDate(serviceDate) || !Number.isInteger(minutes) ||
      minutes < 0 || minutes >= 24 * 60) return null;
  const [year, month, day] = serviceDate.split("-").map(Number);
  const localAsUtc = Date.UTC(year!, month! - 1, day!, Math.floor(minutes / 60), minutes % 60);
  // UK evening is outside the DST switch hour; verify round-trip against Intl.
  for (const offsetMinutes of [60, 0]) {
    const utc = new Date(localAsUtc - offsetMinutes * 60_000).toISOString();
    const actual = londonClockAt(utc);
    if (actual?.date === serviceDate && actual.minutes === minutes) return utc;
  }
  return null;
}

export function lutonScheduleDay(serviceDate: string): DayWindow | null {
  if (!validServiceDate(serviceDate) || serviceDate < "2026-11-09") return null;
  const [y, m, d] = serviceDate.split("-").map(Number);
  const day = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  const opens = day >= 1 && day <= 4 ? 17 * 60 : 16 * 60;
  return {
    kitchenOpensMinutes: opens,
    kitchenClosesMinutes: 23 * 60,
    firstPickupMinutes: opens + 45,
    firstDeliveryMinutes: opens + 75,
    lastPickupMinutes: 22 * 60 + 45,
    lastDeliveryMinutes: 22 * 60 + 15,
  };
}

export function preparationMinutes(fulfilment: ScheduledFulfilment): 30 | 60 {
  return fulfilment === "delivery" ? 60 : 30;
}

/**
 * Opens at 13:00 daily, for the CURRENT UK date only. Show available slots
 * at browsing time, then call this AGAIN with the provider-confirmed payment
 * time before final acceptance. Never trust a saved quote's old availability.
 */
export function mealdeckScheduledSlots(input: {
  serverNow: string;
  fulfilment: ScheduledFulfilment;
  serviceDate?: string;
}): ScheduleSlot[] {
  const now = londonClockAt(input.serverNow);
  if (!now || now.minutes < PREORDER_OPENS_MINUTES) return [];
  const date = input.serviceDate ?? now.date;
  if (date !== now.date) return [];
  const day = lutonScheduleDay(date);
  if (!day) return [];
  const delivery = input.fulfilment === "delivery";
  const earliest = Math.max(
    delivery ? day.firstDeliveryMinutes : day.firstPickupMinutes,
    now.minutes + preparationMinutes(input.fulfilment),
  );
  const last = delivery ? day.lastDeliveryMinutes : day.lastPickupMinutes;
  const slots: ScheduleSlot[] = [];
  for (let minute = ceilToQuarter(earliest); minute <= last; minute += 15) {
    const slotAt = londonSlotInstant(date, minute);
    const prepStartsAt = londonSlotInstant(date, minute - preparationMinutes(input.fulfilment));
    if (slotAt && prepStartsAt) {
      slots.push({
        serviceDate: date,
        fulfilment: input.fulfilment,
        time: hhmm(minute),
        slotAt,
        prepStartsAt,
        preparationMinutes: preparationMinutes(input.fulfilment),
      });
    }
  }
  return slots;
}

export type ScheduledPaymentEvidence = Readonly<{
  serverNow: string;
  paymentConfirmedAt: string | null;
  paymentStatus: "pending" | "paid" | "partially_paid" | "refunded" | "disputed";
  canonicalTotalPence: number;
  capturedPence: number;
  refundedPence: number;
  held: boolean;
  selectedSlotAt: string;
  fulfilment: ScheduledFulfilment;
  source: ScheduleOrderSource;
}>;

export type ScheduledOrderDecision =
  | Readonly<{ status: "confirmed"; slot: ScheduleSlot; releaseToKdsAt: string }>
  | Readonly<{ status: "unconfirmed"; reason: string }>;

/** All group shares or full personal checkout must be captured first. */
export function confirmScheduledOrderPayment(input: ScheduledPaymentEvidence): ScheduledOrderDecision {
  if (!input.paymentConfirmedAt || input.paymentStatus !== "paid" ||
      input.held || !Number.isSafeInteger(input.canonicalTotalPence) ||
      input.canonicalTotalPence <= 0 ||
      input.capturedPence !== input.canonicalTotalPence ||
      input.refundedPence !== 0)
    return { status: "unconfirmed", reason: "full_verified_payment_required" };
  const paid = londonClockAt(input.paymentConfirmedAt);
  const current = londonClockAt(input.serverNow);
  if (!paid || !current || paid.date !== current.date ||
      instantMs(input.paymentConfirmedAt) > instantMs(input.serverNow))
    return { status: "unconfirmed", reason: "invalid_payment_time" };
  const slots = mealdeckScheduledSlots({
    serverNow: input.paymentConfirmedAt,
    fulfilment: input.fulfilment,
    serviceDate: current.date,
  });
  const slot = slots.find((candidate) => candidate.slotAt === input.selectedSlotAt);
  if (!slot)
    return { status: "unconfirmed", reason: "slot_no_longer_feasible_after_payment" };
  // If provider capture arrived after prep was due, flag for operator resolution,
  // not an optimistic confirmation. Never discard the captured money.
  if (instantMs(input.serverNow) > instantMs(slot.prepStartsAt))
    return { status: "unconfirmed", reason: "paid_slot_requires_operator_resolution" };
  return { status: "confirmed", slot, releaseToKdsAt: slot.prepStartsAt };
}

export function scheduledKdsTopNote(
  slot: ScheduleSlot,
  paymentVerified: boolean,
): { title: string; detail: string } | null {
  if (!paymentVerified || !validServiceDate(slot.serviceDate) ||
      !["pickup", "curbside", "delivery"].includes(slot.fulfilment) ||
      !Number.isFinite(instantMs(slot.slotAt)) ||
      !Number.isFinite(instantMs(slot.prepStartsAt)) ||
      instantMs(slot.slotAt) - instantMs(slot.prepStartsAt) !== preparationMinutes(slot.fulfilment) * 60_000 ||
      londonClockAt(slot.slotAt)?.date !== slot.serviceDate ||
      londonClockAt(slot.slotAt)?.minutes % 15 !== 0 ||
      slot.time !== hhmm(londonClockAt(slot.slotAt)!.minutes) ||
      slot.preparationMinutes !== preparationMinutes(slot.fulfilment))
    return null;
  const destination = slot.fulfilment === "delivery" ? "DELIVERY" :
    slot.fulfilment === "curbside" ? "KERBSIDE PICKUP" : "COLLECTION";
  const prepClock = londonClockAt(slot.prepStartsAt);
  const prepTime = prepClock ? hhmm(prepClock.minutes) : "—";
  return {
    title: `SCHEDULED ${destination} · ${slot.time} UK`,
    detail: `PREP START ${prepTime} · ALLOW ${slot.preparationMinutes} MINUTES`,
  };
}
