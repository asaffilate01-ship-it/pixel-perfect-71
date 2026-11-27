import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { launchMenuBrands } from "../src/lib/launch-menu-catalogue";
import {
  MUNCHBOX_CINEMA_SCHEDULE as schedule,
  cinemaPromoPhase,
  cinemaPromoNextTransition,
  cinemaPromoRefreshDelay,
} from "../src/lib/mealdeck-cinema-promotion";
import { readCinemaPromoConfig, readCinemaPromoStatus } from "../src/lib/mealdeck-cinema-promotion.server";

const advertise = Date.parse(schedule.advertiseAt);
const starts = Date.parse(schedule.startsAt);
const ends = Date.parse(schedule.endsAt);
// A reviewed catalogue fixture exercises exact identity validation only. It is
// not an actual qualifying Munchbox or an approved production configuration.
const fixture = launchMenuBrands[0]!.sections[0]!.items[0]!;
const approvedFixture = {
  MEALDECK_MUNCHBOX_CINEMA_PROMO_APPROVED: "true",
  MEALDECK_MUNCHBOX_CINEMA_PROMO_SKUS: JSON.stringify([fixture.id]),
  MEALDECK_MUNCHBOX_CINEMA_PROMO_TERMS:
    "Synthetic test terms only. The operator must review the real eligible products, age, entry, prize, and draw conditions before publication.",
};

describe("Munchbox cinema promotion scheduled publication", () => {
  test("teaser begins at 9pm on 2 December, qualifying window starts three hours later", () => {
    expect(schedule.timezone).toBe("Europe/London");
    expect(schedule.advertiseAt).toBe("2026-12-02T21:00:00.000Z");
    expect(schedule.startsAt).toBe("2026-12-03T00:00:00.000Z");
    expect(schedule.endsAt).toBe("2026-12-07T00:00:00.000Z");
    expect(starts - advertise).toBe(3 * 60 * 60 * 1000);
    expect(ends - starts).toBe(4 * 24 * 60 * 60 * 1000);
    expect(cinemaPromoPhase(advertise - 1, true)).toBe("hidden");
    expect(cinemaPromoPhase(advertise, true)).toBe("teaser");
    expect(cinemaPromoPhase(starts - 1, true)).toBe("teaser");
    expect(cinemaPromoPhase(starts, true)).toBe("active");
    expect(cinemaPromoPhase(ends - 1, true)).toBe("active");
    expect(cinemaPromoPhase(ends, true)).toBe("ended");
    expect(cinemaPromoPhase(ends + 1, true)).toBe("ended");
  });

  test("no approval, missing terms or invalid exact SKUs always fail closed", () => {
    for (const env of [
      {},
      { ...approvedFixture, MEALDECK_MUNCHBOX_CINEMA_PROMO_APPROVED: "false" },
      { ...approvedFixture, MEALDECK_MUNCHBOX_CINEMA_PROMO_APPROVED: "TRUE" },
      { ...approvedFixture, MEALDECK_MUNCHBOX_CINEMA_PROMO_TERMS: "" },
      { ...approvedFixture, MEALDECK_MUNCHBOX_CINEMA_PROMO_SKUS: "[]" },
      { ...approvedFixture, MEALDECK_MUNCHBOX_CINEMA_PROMO_SKUS: "not json" },
      { ...approvedFixture, MEALDECK_MUNCHBOX_CINEMA_PROMO_SKUS: '["not-a-reviewed-catalogue-id"]' },
      { ...approvedFixture, MEALDECK_MUNCHBOX_CINEMA_PROMO_SKUS: JSON.stringify([fixture.id, fixture.id]) },
    ]) {
      expect(readCinemaPromoConfig(env)).toBeNull();
      for (const now of [advertise, starts, ends - 1, ends]) {
        const status = readCinemaPromoStatus(env, now);
        expect(status.phase).toBe("hidden");
        expect(status.approved).toBe(false);
        expect(status.terms).toBeNull();
        expect(status.eligibleProducts).toEqual([]);
      }
    }
    expect(readCinemaPromoStatus(approvedFixture, NaN).phase).toBe("hidden");
  });

  test("approved status discloses product names and terms only during or after advertising", () => {
    const before = readCinemaPromoStatus(approvedFixture, advertise - 1);
    expect(before.phase).toBe("hidden");
    expect(before.terms).toBeNull();
    expect(before.eligibleProducts).toEqual([]);
    for (const [now, phase] of [[advertise, "teaser"], [starts, "active"], [ends, "ended"]] as const) {
      const status = readCinemaPromoStatus(approvedFixture, now);
      expect(status.phase).toBe(phase);
      expect(status.eligibleProducts).toEqual([fixture.name]);
      expect(status.terms).toBe(approvedFixture.MEALDECK_MUNCHBOX_CINEMA_PROMO_TERMS);
      expect(status.serverNow).toBe(new Date(now).toISOString());
      expect(Object.keys(status).sort()).toEqual(
        ["phase", "serverNow", "nextTransitionAt", "approved", "terms", "eligibleProducts"].sort(),
      );
    }
  });

  test("refresh delays derive from server boundaries, not browser wall-clock time", () => {
    expect(cinemaPromoNextTransition(advertise - 1, true)).toBe(schedule.advertiseAt);
    expect(cinemaPromoNextTransition(advertise, true)).toBe(schedule.startsAt);
    expect(cinemaPromoNextTransition(starts, true)).toBe(schedule.endsAt);
    expect(cinemaPromoNextTransition(ends, true)).toBeNull();
    expect(cinemaPromoNextTransition(advertise, false)).toBeNull();
    expect(cinemaPromoRefreshDelay(readCinemaPromoStatus(approvedFixture, ends - 1000))).toBe(1000);
    expect(cinemaPromoRefreshDelay(readCinemaPromoStatus(approvedFixture, ends - 1000), 400)).toBe(600);
    expect(cinemaPromoRefreshDelay(readCinemaPromoStatus(approvedFixture, starts))).toBe(60_000);
  });

  test("public surfaces mount only the gated banner, with no order CTA in teaser or ended state", () => {
    const source = (name: string) => readFileSync(new URL("../" + name, import.meta.url), "utf8");
    const banner = source("src/components/marketing/munchbox-cinema-banner.tsx");
    expect(source("src/routes/index.tsx")).toContain("<MunchboxCinemaBanner />");
    expect(source("src/routes/offers.tsx")).toContain("<MunchboxCinemaBanner showClosedTerms />");
    expect(banner).toContain('snapshot.phase === "hidden"');
    expect(banner).toContain('snapshot.phase === "ended"');
    expect(banner).toContain('{!teaser && <Link to="/menus"');
    expect(banner).toContain("Register before entries open");
    expect(banner).toContain("<MealDeckLogo");
    expect(source("src/lib/mealdeck-cinema-promotion.functions.ts")).toContain('setResponseHeader("Cache-Control", "no-store, max-age=0")');
    expect(source(".env.example")).toContain("MEALDECK_MUNCHBOX_CINEMA_PROMO_APPROVED=false");
  });
});

// Wiring regression: browser behavioural testing remains a separate release gate.
test("promotion refresh subscribes to and removes network and history lifecycle listeners", () => {
  const hook = readFileSync(new URL("../src/components/marketing/use-cinema-promotion.ts", import.meta.url), "utf8");
  for (const [event, handler] of [["offline", "invalidate"], ["online", "onVisible"], ["pagehide", "invalidate"], ["pageshow", "onVisible"]]) {
    expect(hook).toContain('window.addEventListener("' + event + '", ' + handler + ')');
    expect(hook).toContain('window.removeEventListener("' + event + '", ' + handler + ')');
  }
  expect(hook).toContain("clearTimeout(requestTimer)");
  expect(hook).toContain("request !== revision");
});
