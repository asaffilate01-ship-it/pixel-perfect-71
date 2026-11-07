import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { ARCADE_GAMES, parseArcadeSearch } from "../src/lib/mealdeck-arcade-library";
import {
  ARCADE_PROMOTION_CLIPS,
  buildArcadePromotionContent,
  selectPromotionGame,
  supportsDailyPromotion,
  type ArcadePromotionSelection,
} from "../src/lib/mealdeck-arcade-promotion";
import { isPublicArcadeQrUrl } from "../src/lib/mealdeck-arcade-qr";

const selection: ArcadePromotionSelection = {
  game: "menu-quest",
  daily: false,
  date: "2026-11-07",
  size: 4,
};

describe("Public game promotion kit", () => {
  test("all catalogue games create invitations without implying a result or reward", () => {
    for (const game of ARCADE_GAMES) {
      const content = buildArcadePromotionContent({ ...selection, game: game.id });
      expect(content.gameName).toBe(game.name);
      expect(content.isResult).toBe(false);
      expect(content.headline).toBe("Your turn");
      expect(content.text).toContain(game.name);
      expect(content.text).toContain("no sign-in");
      expect(content.filename).toMatch(/^mealdeck-[a-z0-9-]+-invite\.png$/);
      expect(isPublicArcadeQrUrl(content.url)).toBe(true);
      expect(new URL(content.url).searchParams.has("daily")).toBe(false);
      for (const claim of ["won", "reward", "discount", "points", "world record", "high score"])
        expect(content.text.toLowerCase()).not.toContain(claim);
    }
  });

  test("only the three supported daily games can carry a daily invitation", () => {
    for (const game of ARCADE_GAMES) {
      const content = buildArcadePromotionContent({ ...selection, game: game.id, daily: true });
      const params = new URL(content.url).searchParams;
      expect(params.has("daily")).toBe(supportsDailyPromotion(game.id));
      if (supportsDailyPromotion(game.id)) {
        expect(params.get("daily")).toBe(selection.date);
        expect(content.context).toContain(`${selection.date} UTC`);
        expect(content.text).toContain(`${selection.date} UTC`);
        expect(content.headline).toBe("Your daily challenge");
      }
      expect(content.isResult).toBe(false);
    }
  });

  test("daily Sauce and Bento captions and QR links preserve the selected size and exact frozen date", () => {
    for (const [game, sizes] of [
      ["sauce-switch", [3, 4]],
      ["bento-sudoku", [4, 6]],
    ] as const) {
      for (const size of sizes) {
        const content = buildArcadePromotionContent({
          game,
          daily: true,
          date: "2028-02-29",
          size,
        });
        const parsed = parseArcadeSearch({
          ...Object.fromEntries(new URL(content.url).searchParams),
          game,
        });
        expect(parsed).toEqual({ game, daily: "2028-02-29", size });
        expect(content.context).toContain(`${size} × ${size}`);
        expect(content.text).toContain(`${size} × ${size}`);
        expect(content.filename).toContain("2028-02-29");
      }
    }
    const quest = buildArcadePromotionContent({ ...selection, daily: true });
    expect(new URL(quest.url).searchParams.has("size")).toBe(false);
    expect(quest.context).toContain("8 × 8 word search");
  });

  test("malformed dates never become a mismatched daily invitation", () => {
    for (const date of [
      "",
      "2026-02-29",
      "2026-13-01",
      "2026-11-07#private",
      "1999-12-31",
      "2100-01-01",
      "private",
    ])
      expect(() => buildArcadePromotionContent({ ...selection, daily: true, date })).toThrow(
        "real puzzle date",
      );
    expect(
      buildArcadePromotionContent({ ...selection, date: "ignored-private-value" }).text,
    ).not.toContain("private");
  });

  test("switching game preserves only supported controls", () => {
    expect(
      selectPromotionGame(
        { ...selection, game: "bento-sudoku", size: 6, daily: true },
        "sauce-switch",
      ),
    ).toMatchObject({ game: "sauce-switch", size: 3, daily: true });
    expect(
      selectPromotionGame(
        { ...selection, game: "sauce-switch", size: 3, daily: true },
        "bento-sudoku",
      ),
    ).toMatchObject({ game: "bento-sudoku", size: 4, daily: true });
    expect(selectPromotionGame({ ...selection, daily: true }, "pantry-sweep")).toMatchObject({
      game: "pantry-sweep",
      daily: false,
    });
    expect(selectPromotionGame(selection, "unknown-private-game").game).toBe("menu-quest");
  });

  test("clip links name exactly the three committed preview videos and covers", () => {
    expect(Object.keys(ARCADE_PROMOTION_CLIPS)).toEqual([
      "snack-trail",
      "skewer-sort",
      "pantry-sweep",
    ]);
    for (const [game, clip] of Object.entries(ARCADE_PROMOTION_CLIPS)) {
      expect(clip!.video).toBe(`/game-promos/${game}.mp4`);
      expect(clip!.poster).toBe(`/game-promos/${game}.png`);
      expect(existsSync(new URL(`../public${clip!.video}`, import.meta.url))).toBe(true);
      expect(existsSync(new URL(`../public${clip!.poster}`, import.meta.url))).toBe(true);
    }
  });
});
