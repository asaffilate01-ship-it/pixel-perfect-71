import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { launchMenuBrands } from "../src/lib/launch-menu-catalogue";
import {
  MUNCHBOX_CINEMA_SCHEDULE as schedule,
  cinemaPromoPhase,
  cinemaPromoNextTransition,
  cinemaPromoRefreshDelay,
} from "../src/lib/mealdeck-cinema-promotion";
import { readCinemaPromoConfig, readCinemaPromoStatus, readLiveCinemaPromoStatus } from "../src/lib/mealdeck-cinema-promotion.server";

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
        ["phase", "serverNow", "nextTransitionAt", "approved", "catalogueState", "terms", "eligibleProducts"].sort(),
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
    expect(banner).toContain('{canBrowseEligibleProducts && <Link to="/menus"');
    expect(banner).toContain('snapshot.catalogueState === "available"');
    expect(banner).toContain("existing entries and the closing date are unchanged");
    expect(banner).toContain("Register before entries open");
    expect(banner).toContain("<MealDeckLogo");
    expect(source("src/lib/mealdeck-cinema-promotion.functions.ts")).toContain('setResponseHeader("Cache-Control", "no-store, max-age=0")');
    expect(source(".env.example")).toContain("MEALDECK_MUNCHBOX_CINEMA_PROMO_APPROVED=false");
  });
});


describe("live catalogue availability guard for the cinema banner", () => {
  const testBrand = launchMenuBrands.find(brand => brand.sections.some(section =>
    section.items.some(item => item.optionGroupIds.length === 0 && !item.priceVariants && (item.pricePence ?? 0) > 0)))!;
  const testItem = testBrand.sections.flatMap(section => section.items).find(item =>
    item.optionGroupIds.length === 0 && !item.priceVariants && (item.pricePence ?? 0) > 0)!;
  const env = {
    ...approvedFixture,
    MEALDECK_MUNCHBOX_CINEMA_PROMO_SKUS: JSON.stringify([testItem.id]),
    MEALDECK_SUPABASE_URL: "https://menufixture.supabase.co",
    MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_menu_fixture_public",
  };
  const now = starts + 10_000;
  const row = {
    sku: testItem.id, name: testItem.name, description: null, pricePence: 500,
    options: {}, replacementPricePence: null,
  };
  function mock(items: unknown[], checkedAt = new Date(now).toISOString()) {
    let calls = 0;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      expect(String(input)).toBe("https://menufixture.supabase.co/rest/v1/rpc/mealdeck_public_menu");
      const headers = new Headers(init?.headers);
      expect(headers.get("apikey")).toBe(env.MEALDECK_SUPABASE_PUBLISHABLE_KEY);
      expect(headers.has("Cookie")).toBe(false);
      return Response.json({available: true, checkedAt, items});
    }) as typeof fetch;
    return {fetcher, calls: () => calls};
  }
  test("disabled, teaser, hidden and closed phases do not contact the catalogue", async () => {
    const request = mock([row]);
    for (const time of [advertise - 1, advertise, starts - 1, ends]) {
      const result = await readLiveCinemaPromoStatus(env, () => time, request.fetcher);
      expect(result.catalogueState).toBe("not-checked");
    }
    expect((await readLiveCinemaPromoStatus({}, () => now, request.fetcher)).approved).toBe(false);
    expect(request.calls()).toBe(0);
  });
  test("a current orderable reviewed item permits the menu link but does not grant a prize entry", async () => {
    const request = mock([row]);
    const result = await readLiveCinemaPromoStatus(env, () => now, request.fetcher);
    expect(result.phase).toBe("active");
    expect(result.catalogueState).toBe("available");
    expect(result.eligibleProducts).toEqual([testItem.name]);
    expect(result.terms).toBe(env.MEALDECK_MUNCHBOX_CINEMA_PROMO_TERMS);
    expect(request.calls()).toBe(1);
    expect(JSON.stringify(result)).not.toContain("sb_publishable");
  });
  test("missing, zero-priced or unrelated items withhold the link without removing approved terms", async () => {
    for (const items of [[], [{...row, pricePence: 0}], [{...row, sku: "unreviewed-synthetic-sku"}]]) {
      const result = await readLiveCinemaPromoStatus(env, () => now, mock(items).fetcher);
      expect(result.phase).toBe("active");
      expect(result.catalogueState).toBe("unavailable");
      expect(result.terms).toBe(env.MEALDECK_MUNCHBOX_CINEMA_PROMO_TERMS);
      expect(result.eligibleProducts).toEqual([testItem.name]);
    }
  });
  test("stale, future, invalid and failed catalogue responses cannot show an order CTA", async () => {
    for (const checkedAt of [new Date(now - 60_001).toISOString(), new Date(now + 5_001).toISOString(), "invalid"]) {
      expect((await readLiveCinemaPromoStatus(env, () => now, mock([row], checkedAt).fetcher)).catalogueState).toBe("unverified");
    }
    const failed = (async () => Response.json({error:"private-provider-error"}, {status:503})) as typeof fetch;
    expect((await readLiveCinemaPromoStatus(env, () => now, failed)).catalogueState).toBe("unverified");
    const duplicate = await readLiveCinemaPromoStatus(env, () => now, mock([row,row]).fetcher);
    expect(duplicate.catalogueState).toBe("unverified");
  });
  test("a slow menu response cannot reopen an ended promotion", async () => {
    let time = ends - 1;
    const req = mock([row], new Date(time).toISOString());
    const slow = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await req.fetcher(input, init);
      time = ends;
      return response;
    }) as typeof fetch;
    const status = await readLiveCinemaPromoStatus(env, () => time, slow);
    expect(status.phase).toBe("ended");
    expect(status.catalogueState).toBe("not-checked");
    expect(status.terms).not.toBeNull();
  });
});
