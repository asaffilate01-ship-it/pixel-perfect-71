/** Fixed owner-confirmed GMT schedule. Presentation only; never authorises a prize entry. */
export const MUNCHBOX_CINEMA_SCHEDULE = {
  campaign: "munchbox-cinema-20261203",
  advertiseAt: "2026-12-02T21:00:00.000Z",
  startsAt: "2026-12-03T00:00:00.000Z",
  endsAt: "2026-12-07T00:00:00.000Z",
  screeningAt: "2026-12-16T19:20:00.000Z",
  timezone: "Europe/London",
} as const;

export type CinemaPromoPhase = "hidden" | "teaser" | "active" | "ended";
export type CinemaPromoSnapshot = {
  phase: CinemaPromoPhase;
  serverNow: string;
  nextTransitionAt: string | null;
  approved: boolean;
  terms: string | null;
  eligibleProducts: string[];
};

export function cinemaPromoPhase(now: number, approved: boolean): CinemaPromoPhase {
  if (!approved || !Number.isFinite(now)) return "hidden";
  if (now < Date.parse(MUNCHBOX_CINEMA_SCHEDULE.advertiseAt)) return "hidden";
  if (now < Date.parse(MUNCHBOX_CINEMA_SCHEDULE.startsAt)) return "teaser";
  if (now < Date.parse(MUNCHBOX_CINEMA_SCHEDULE.endsAt)) return "active";
  return "ended";
}

export function cinemaPromoNextTransition(now: number, approved: boolean): string | null {
  if (!approved || !Number.isFinite(now)) return null;
  return [MUNCHBOX_CINEMA_SCHEDULE.advertiseAt, MUNCHBOX_CINEMA_SCHEDULE.startsAt,
    MUNCHBOX_CINEMA_SCHEDULE.endsAt].find(at => Date.parse(at) > now) ?? null;
}

/** Schedule polling from the server clock; clients never promote themselves to a new phase. */
export function cinemaPromoRefreshDelay(snapshot: CinemaPromoSnapshot, elapsedMs = 0): number {
  const transition = snapshot.nextTransitionAt === null ? Infinity :
    Date.parse(snapshot.nextTransitionAt) - Date.parse(snapshot.serverNow) - Math.max(0, elapsedMs);
  return Math.max(250, Math.min(60_000, Number.isFinite(transition) ? transition : 60_000));
}
