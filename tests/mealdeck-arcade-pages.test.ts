import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { GAME_CATALOGUE } from "../src/lib/dishbee-play";
import { arcadeGameLink, parseArcadeSearch } from "../src/lib/mealdeck-arcade-library";
import {
  ARCADE_DAILY_URL,
  ARCADE_GAME_PAGES,
  ARCADE_PREVIEW_HEIGHT,
  ARCADE_PREVIEW_WIDTH,
  ARCADE_PROMOTE_URL,
  ARCADE_RECEIPT_URL,
  arcadeDailySeo,
  arcadeGameSeo,
  arcadeReceiptSeo,
  getArcadeGamePage,
  resolveArcadeDailyPage,
} from "../src/lib/mealdeck-arcade-pages";
import { mealDeckSitemap } from "../src/lib/mealdeck-sitemap";

function metaValue(meta: readonly unknown[], key: string): string | undefined {
  const found = meta.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      (("property" in item && item.property === key) || ("name" in item && item.name === key)),
  );
  return found && typeof found === "object" && "content" in found
    ? String(found.content)
    : undefined;
}

describe("Genuine public game pages", () => {
  test("every game has a unique allowlisted page, title, description and canonical", () => {
    expect(ARCADE_GAME_PAGES).toHaveLength(19);
    expect(new Set(ARCADE_GAME_PAGES.map((page) => page.id)).size).toBe(GAME_CATALOGUE.length);
    for (const key of ["title", "description", "path", "canonical", "image"] as const)
      expect(new Set(ARCADE_GAME_PAGES.map((page) => page[key])).size).toBe(19);
    for (const game of GAME_CATALOGUE) {
      const page = getArcadeGamePage(game.id)!;
      expect(page.id).toBe(game.id);
      expect(page.path).toBe(`/play/${game.id}`);
      expect(page.canonical).toBe(`https://mealdeck.co.uk/play/${game.id}`);
      expect(page.title).toContain(game.name);
      expect(page.description).toContain(game.name);
      expect(page.description).toContain("No sign-in needed.");
      expect(new URL(arcadeGameLink(game.id)).pathname).toBe(page.path);
    }
  });

  test("unknown, encoded and private slugs are rejected without reflection", () => {
    for (const slug of [
      undefined,
      null,
      4,
      {},
      [],
      "",
      "unknown",
      "constructor",
      "__proto__",
      "Bento-Sudoku",
      "../account",
      "bento-sudoku?token=private",
      "%62ento-sudoku",
      "receipt",
      "daily",
      "promote",
    ]) {
      expect(getArcadeGamePage(slug)).toBeNull();
    }
    expect(() => arcadeGameSeo("private-token" as never)).toThrow(RangeError);
  });

  test("server head data has game-specific canonical and 1200×630 large social previews", () => {
    for (const page of ARCADE_GAME_PAGES) {
      const head = arcadeGameSeo(page.id);
      expect(head.links).toEqual([{ rel: "canonical", href: page.canonical }]);
      expect(head.meta).toContainEqual({ title: page.title });
      expect(metaValue(head.meta, "description")).toBe(page.description);
      expect(metaValue(head.meta, "og:title")).toBe(page.title);
      expect(metaValue(head.meta, "og:description")).toBe(page.description);
      expect(metaValue(head.meta, "og:url")).toBe(page.canonical);
      expect(metaValue(head.meta, "og:image")).toBe(
        `https://mealdeck.co.uk/game-previews/${page.id}.png`,
      );
      expect(metaValue(head.meta, "og:image:width")).toBe("1200");
      expect(metaValue(head.meta, "og:image:height")).toBe("630");
      expect(metaValue(head.meta, "twitter:card")).toBe("summary_large_image");
      expect(metaValue(head.meta, "robots")).toBeUndefined();
      const png = readFileSync(new URL(`../public${page.imagePath}`, import.meta.url));
      expect(png.readUInt32BE(16)).toBe(ARCADE_PREVIEW_WIDTH);
      expect(png.readUInt32BE(20)).toBe(ARCADE_PREVIEW_HEIGHT);
    }
  });

  test("public discovery lists all games and entry routes without query, identity or board data", () => {
    const sitemap = mealDeckSitemap();
    for (const page of ARCADE_GAME_PAGES) expect(sitemap).toContain(`<loc>${page.canonical}</loc>`);
    for (const url of [ARCADE_DAILY_URL, ARCADE_RECEIPT_URL, ARCADE_PROMOTE_URL])
      expect(sitemap).toContain(`<loc>${url}</loc>`);
    expect(ARCADE_RECEIPT_URL).toBe("https://mealdeck.co.uk/play/receipt");
    expect(ARCADE_DAILY_URL).toBe("https://mealdeck.co.uk/play/daily");
    for (const url of [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => new URL(match[1]!),
    )) {
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
    }
  });
});

describe("Stable daily and receipt entries", () => {
  test("the UTC day chooses one challenge consistently, independent of time within the day", () => {
    const first = resolveArcadeDailyPage(Date.parse("2026-11-07T00:00:00.000Z"));
    const last = resolveArcadeDailyPage(Date.parse("2026-11-07T23:59:59.999Z"));
    expect(first).toEqual(last);
    expect(first.daily).toBe("2026-11-07");
    expect(parseArcadeSearch(first)).toEqual(first);
    const midnight = resolveArcadeDailyPage(Date.parse("2026-11-08T00:00:00.000Z"));
    expect(midnight.daily).toBe("2026-11-08");
    expect(midnight.game).not.toBe(first.game);
    expect(first.daily).toBe("2026-11-07");
  });

  test("three consecutive days cover the existing daily games and their supported default sizes", () => {
    const seen = new Set<string>();
    for (let day = 7; day <= 9; day += 1) {
      const setup = resolveArcadeDailyPage(Date.UTC(2026, 10, day));
      seen.add(setup.game);
      expect(setup.size).toBe(
        setup.game === "sauce-switch" ? 3 : setup.game === "bento-sudoku" ? 4 : undefined,
      );
      const url = new URL(
        arcadeGameLink(setup.game, undefined, { daily: setup.daily, size: setup.size }),
      );
      expect(
        parseArcadeSearch({
          ...Object.fromEntries(url.searchParams),
          game: url.pathname.split("/").at(-1),
        }),
      ).toEqual(setup);
    }
    expect([...seen].sort()).toEqual(["bento-sudoku", "menu-quest", "sauce-switch"]);
    expect(() => resolveArcadeDailyPage(Number.NaN)).toThrow();
    expect(() => resolveArcadeDailyPage(Infinity)).toThrow();
  });

  test("entry metadata has stable public canonicals and no reward claims", () => {
    for (const [head, url] of [
      [arcadeDailySeo(), ARCADE_DAILY_URL],
      [arcadeReceiptSeo(), ARCADE_RECEIPT_URL],
    ] as const) {
      expect(head.links).toEqual([{ rel: "canonical", href: url }]);
      expect(metaValue(head.meta, "og:url")).toBe(url);
      expect(metaValue(head.meta, "robots")).toBeUndefined();
      const description = metaValue(head.meta, "description")!.toLowerCase();
      expect(description).toContain("no sign-in");
      for (const claim of ["earn points", "free food", "win prizes", "discount code"])
        expect(description).not.toContain(claim);
    }
  });
});
