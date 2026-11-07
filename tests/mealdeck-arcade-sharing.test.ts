import { describe, expect, test } from "bun:test";
import { GAME_CATALOGUE } from "../src/lib/dishbee-play";
import { parseArcadeSearch, type ArcadeGameId } from "../src/lib/mealdeck-arcade-library";
import { type ArcadeCompletion } from "../src/lib/mealdeck-play-progress";
import {
  arcadeShareMessage,
  arcadeWhatsAppLink,
  buildArcadeShareContent,
  type ArcadeShareRequest,
} from "../src/lib/mealdeck-arcade-sharing";

function finished(
  game: ArcadeCompletion["game"],
  overrides: Partial<ArcadeCompletion> = {},
): ArcadeCompletion {
  return { id: "private-round-identifier", game, result: "completed", ...overrides };
}

const resultFixtures = [
  {
    game: "sauce-switch",
    result: "completed",
    variant: "4x4",
    moves: 9,
    hints: 0,
    headline: "Tray cleared",
  },
  {
    game: "menu-quest",
    result: "completed",
    variant: "8x8",
    hints: 1,
    headline: "All words found",
  },
  { game: "tray-tactics", result: "win", variant: "solo-clever", moves: 18, headline: "Round won" },
  {
    game: "bento-sudoku",
    result: "completed",
    variant: "6x6",
    moves: 20,
    hints: 2,
    headline: "Puzzle solved",
  },
  {
    game: "tray-lines",
    result: "draw",
    variant: "solo-casual",
    moves: 24,
    headline: "Even portions",
  },
  {
    game: "snack-trail",
    result: "loss",
    variant: "step",
    moves: 12,
    score: 7,
    headline: "Trail finished",
  },
  {
    game: "skewer-sort",
    result: "completed",
    variant: "4-foods",
    moves: 8,
    headline: "Skewers sorted",
  },
  {
    game: "pantry-sweep",
    result: "win",
    variant: "bigger-6x6",
    moves: 15,
    headline: "Pantry cleared",
  },
] as const;

describe("Public game invites", () => {
  test("all 19 catalogue games have a truthful, bounded invite and a canonical link", () => {
    expect(GAME_CATALOGUE).toHaveLength(19);
    for (const game of GAME_CATALOGUE) {
      const content = buildArcadeShareContent({ game: game.id });
      const url = new URL(content.url);
      expect(content.game).toBe(game.id);
      expect(content.gameName).toBe(game.name);
      expect(content.isResult).toBe(false);
      expect(content.headline).toBe("Your turn");
      expect(content.text).toContain(game.name);
      expect(content.text).toContain("Free to play. No sign-in needed.");
      expect(content.text).not.toContain(content.url);
      expect(content.title).toContain(game.name);
      expect(content.detail.length).toBeLessThan(100);
      expect(content.context.length).toBeLessThan(90);
      expect(content.filename).toBe(`mealdeck-${game.id}-invite.png`);
      expect(url.origin).toBe("https://mealdeck.co.uk");
      expect(url.pathname).toBe("/play");
      expect(url.searchParams.get("game")).toBe(game.id);
      expect([...url.searchParams.keys()].every((key) => ["game", "brand"].includes(key))).toBe(
        true,
      );
      expect(url.hash).toBe("");
    }
  });

  test("brand data is allowlisted and only affects Food Pairs", () => {
    expect(
      new URL(buildArcadeShareContent({ game: "pairs", brand: "skorch" }).url).searchParams.get(
        "brand",
      ),
    ).toBe("skorch");
    expect(
      buildArcadeShareContent({ game: "pairs", brand: "person@example.com&token=private" }).url,
    ).toBe("https://mealdeck.co.uk/play?game=pairs");
    expect(buildArcadeShareContent({ game: "menu-quest", brand: "skorch" }).url).toBe(
      "https://mealdeck.co.uk/play?game=menu-quest",
    );
  });

  test("daily invites accept a real date only for supported games", () => {
    for (const game of ["sauce-switch", "menu-quest", "bento-sudoku"] as const) {
      const content = buildArcadeShareContent({ game, dailyDate: "2028-02-29" });
      expect(content.isResult).toBe(false);
      expect(content.context).toContain("Daily · 2028-02-29 UTC");
      expect(new URL(content.url).searchParams.get("daily")).toBe("2028-02-29");
      expect(new URL(content.url).searchParams.has("size")).toBe(false);
    }
    for (const dailyDate of [
      "2026-02-29",
      "2026-04-31",
      "2026-13-01",
      "2026-11-07T00:00:00Z",
      "private-date",
    ]) {
      const content = buildArcadeShareContent({ game: "bento-sudoku", dailyDate });
      expect(content.context).toBe("MealDeck Play");
      expect(new URL(content.url).searchParams.has("daily")).toBe(false);
    }
    expect(buildArcadeShareContent({ game: "snack-trail", dailyDate: "2026-11-07" }).context).toBe(
      "MealDeck Play",
    );
  });

  test("a runtime unknown game cannot become arbitrary public text or a link parameter", () => {
    const content = buildArcadeShareContent({
      game: "private-person&email=secret" as ArcadeGameId,
    });
    expect(content.game).toBe("feast-2048");
    expect(JSON.stringify(content)).not.toContain("private-person");
    expect(content.isResult).toBe(false);
  });
});

describe("Whitelisted finished-round summaries", () => {
  test("all eight tracked games get appropriate result labels and PNG names", () => {
    for (const fixture of resultFixtures) {
      const content = buildArcadeShareContent({
        game: fixture.game,
        completion: finished(fixture.game, fixture),
      });
      expect(content.isResult).toBe(true);
      expect(content.headline).toBe(fixture.headline);
      expect(content.headline.length).toBeLessThan(30);
      expect(content.filename).toBe(`mealdeck-${fixture.game}-result.png`);
      expect(content.text).toContain("Your turn: try the game.");
      expect(content.text).not.toContain("same daily puzzle");
      expect(content.text).toContain("No sign-in needed.");
    }
  });

  test("moves, hints and scores retain zero, singular/plural and bounded maximum values", () => {
    for (const value of [0, 1, 100_000]) {
      const content = buildArcadeShareContent({
        game: "snack-trail",
        completion: finished("snack-trail", {
          result: "loss",
          score: value,
          moves: value,
          hints: value,
          variant: "step",
        }),
      });
      const printed = value === 100_000 ? "100,000" : String(value);
      expect(content.detail).toContain(`${printed} snack${value === 1 ? "" : "s"}`);
      expect(content.detail).toContain(`${printed} move${value === 1 ? "" : "s"}`);
      expect(content.detail).toContain(`${printed} hint${value === 1 ? "" : "s"}`);
      expect(content.detail.length).toBeLessThan(100);
      expect(content.text.length).toBeLessThan(500);
    }
    const content = buildArcadeShareContent({
      game: "bento-sudoku",
      completion: finished("bento-sudoku", { moves: 12, hints: 0 }),
    });
    expect(content.detail).toBe("12 moves · 0 hints");
  });

  test("two-player rounds never imply that the chef was beaten", () => {
    for (const game of ["tray-tactics", "tray-lines"] as const) {
      for (const variant of ["local-casual", "local-clever"]) {
        for (const result of ["completed", "win", "loss", "draw"] as const) {
          const content = buildArcadeShareContent({
            game,
            completion: finished(game, { result, variant }),
          });
          expect(content.isResult).toBe(true);
          expect(content.context).toBe("Two players");
          expect(content.text.toLowerCase()).not.toContain("chef");
          expect(content.headline).toBe(result === "draw" ? "Even portions" : "Round complete");
        }
      }
    }
  });

  test("win/loss labels for the new games do not invent a victory or a reward", () => {
    expect(
      buildArcadeShareContent({
        game: "snack-trail",
        completion: finished("snack-trail", { result: "win" }),
      }).headline,
    ).toBe("Tray filled");
    expect(
      buildArcadeShareContent({
        game: "pantry-sweep",
        completion: finished("pantry-sweep", { result: "loss" }),
      }).headline,
    ).toBe("Chilli found");
    for (const fixture of resultFixtures) {
      const text = buildArcadeShareContent({
        game: fixture.game,
        completion: finished(fixture.game, fixture),
      }).text.toLowerCase();
      for (const claim of [
        "world record",
        "high score",
        "leaderboard",
        "voucher",
        "discount",
        "reward",
        "free food",
        "loyalty",
      ])
        expect(text).not.toContain(claim);
    }
  });

  test("validated variants provide sizes, pace and player context without echoing raw strings", () => {
    const variants = [
      ["sauce-switch", "3x3", "3 × 3 tray"],
      ["sauce-switch", "4x4", "4 × 4 tray"],
      ["bento-sudoku", "4x4", "4 × 4 tray"],
      ["bento-sudoku", "6x6", "6 × 6 tray"],
      ["menu-quest", "8x8", "8 × 8 word search"],
      ["snack-trail", "slow", "Slow pace"],
      ["snack-trail", "standard", "Standard pace"],
      ["snack-trail", "step", "Untimed step play"],
      ["skewer-sort", "3-foods", "3 foods · Small plate"],
      ["skewer-sort", "4-foods", "4 foods · Full plate"],
      ["pantry-sweep", "gentle-5x5", "5 × 5 · Gentle pantry"],
      ["pantry-sweep", "bigger-6x6", "6 × 6 · Bigger pantry"],
      ["tray-tactics", "solo-casual", "Solo · Casual chef"],
      ["tray-lines", "solo-clever", "Solo · Clever chef"],
    ] as const;
    for (const [game, variant, expected] of variants) {
      const result = game === "snack-trail" || game === "pantry-sweep" ? "win" : "completed";
      expect(
        buildArcadeShareContent({ game, completion: finished(game, { result, variant }) }).context,
      ).toBe(expected);
    }
    for (const variant of ["customer-private-name", "constructor", "6x6-secret"]) {
      const content = buildArcadeShareContent({
        game: "bento-sudoku",
        completion: finished("bento-sudoku", { variant }),
      });
      expect(content.isResult).toBe(true);
      expect(content.context).toBe("MealDeck Play");
      expect(JSON.stringify(content)).not.toContain(variant);
      expect(new URL(content.url).searchParams.has("size")).toBe(false);
    }
  });
});

describe("Result links reproduce only public daily setup", () => {
  test("daily Sauce and Bento links preserve the frozen date and verified size", () => {
    for (const [game, variant, size] of [
      ["sauce-switch", "3x3", 3],
      ["sauce-switch", "4x4", 4],
      ["bento-sudoku", "4x4", 4],
      ["bento-sudoku", "6x6", 6],
    ] as const) {
      const content = buildArcadeShareContent({
        game,
        dailyDate: "2026-11-09",
        completion: finished(game, { dailyDate: "2026-11-08", variant, moves: 15, hints: 0 }),
      });
      const url = new URL(content.url);
      expect(parseArcadeSearch(Object.fromEntries(url.searchParams))).toEqual({
        game,
        daily: "2026-11-08",
        size,
      });
      expect(content.context).toContain(`${size} × ${size}`);
      expect(content.context).toContain("2026-11-08 UTC");
      expect(JSON.stringify(content)).not.toContain("2026-11-09");
      expect(content.text).toContain("try the same daily puzzle");
    }
  });

  test("Menu Quest has a fixed 8×8 daily layout and no unsupported size parameter", () => {
    const content = buildArcadeShareContent({
      game: "menu-quest",
      completion: finished("menu-quest", { dailyDate: "2026-11-08", hints: 1 }),
    });
    expect(content.context).toContain("8 × 8");
    expect(content.url).toBe("https://mealdeck.co.uk/play?game=menu-quest&daily=2026-11-08");
    expect(content.text).toContain("try the same daily puzzle");
  });

  test("fresh results never inherit a page date or claim to reproduce the played board", () => {
    for (const fixture of resultFixtures) {
      const content = buildArcadeShareContent({
        game: fixture.game,
        dailyDate: "2026-11-08",
        completion: finished(fixture.game, fixture),
      });
      expect(new URL(content.url).searchParams.has("daily")).toBe(false);
      expect(content.text).toContain("Your turn: try the game.");
      expect(content.text).not.toContain("same");
      expect(content.context).not.toContain("Daily");
    }
  });

  test("a legacy daily result with missing or unknown size cannot promise the same puzzle", () => {
    for (const game of ["sauce-switch", "bento-sudoku"] as const) {
      for (const variant of [undefined, "private-variant", "8x8"]) {
        const completion = finished(game, {
          dailyDate: "2026-11-08",
          ...(variant ? { variant } : {}),
        });
        const content = buildArcadeShareContent({ game, completion });
        expect(content.isResult).toBe(true);
        expect(content.context).toContain("2026-11-08 UTC");
        expect(content.url).toBe(`https://mealdeck.co.uk/play?game=${game}`);
        expect(content.text).not.toContain("same daily puzzle");
      }
    }
  });
});

describe("Privacy and malformed inputs", () => {
  test("IDs, timestamps, personal data, board state and solutions never reach shared content", () => {
    const request = {
      game: "bento-sudoku",
      brand: "private-brand&email=secret@example.com",
      completion: {
        ...finished("bento-sudoku", {
          moves: 14,
          hints: 0,
          variant: "6x6",
          dailyDate: "2026-11-08",
        }),
        completedAt: 1723479999888,
        name: "SECRET_PERSON",
        email: "secret@example.com",
        phone: "SECRET_PHONE",
        board: "SECRET_BOARD",
        solution: "SECRET_SOLUTION",
        token: "SECRET_TOKEN",
        seed: "SECRET_SEED",
        orderId: "SECRET_ORDER",
      },
      currentBoard: "SECRET_CURRENT_BOARD",
    } as ArcadeShareRequest;
    const content = buildArcadeShareContent(request);
    expect(content.isResult).toBe(true);
    const all =
      JSON.stringify(content) +
      arcadeShareMessage(content) +
      decodeURIComponent(arcadeWhatsAppLink(content));
    for (const privateValue of [
      "private-round-identifier",
      "1723479999888",
      "SECRET_",
      "secret@example.com",
      "private-brand",
    ])
      expect(all).not.toContain(privateValue);
    expect(Object.keys(content).sort()).toEqual(
      [
        "game",
        "gameName",
        "title",
        "text",
        "url",
        "headline",
        "detail",
        "context",
        "filename",
        "isResult",
      ].sort(),
    );
    expect([...new URL(content.url).searchParams.keys()]).toEqual(["game", "daily", "size"]);
  });

  test("invalid, mismatched or unsupported completion records become game invites", () => {
    const invalid: unknown[] = [
      undefined,
      null,
      {},
      "private",
      [],
      finished("sauce-switch"),
      finished("bento-sudoku", { id: "short" }),
      finished("bento-sudoku", { result: "win" }),
      finished("bento-sudoku", { dailyDate: "2026-02-29" }),
      finished("bento-sudoku", { variant: "SECRET_INVALID_VARIANT" }),
      finished("bento-sudoku", { score: 1 }),
      { ...finished("bento-sudoku"), result: "private-result" },
      { ...finished("bento-sudoku"), game: "unknown-game" },
    ];
    for (const value of [-1, 0.5, Number.NaN, Infinity, 100_001, "14", {}, null]) {
      invalid.push({ ...finished("bento-sudoku"), moves: value });
      invalid.push({ ...finished("bento-sudoku"), hints: value });
    }
    for (const completion of invalid) {
      const content = buildArcadeShareContent({
        game: "bento-sudoku",
        completion: completion as ArcadeCompletion,
      });
      expect(content.isResult).toBe(false);
      expect(content.headline).toBe("Your turn");
      expect(content.detail).toBe("Free to play · No sign-in needed");
      expect(content.filename).toBe("mealdeck-bento-sudoku-invite.png");
      expect(content.url).toBe("https://mealdeck.co.uk/play?game=bento-sudoku");
    }
    expect(
      buildArcadeShareContent({
        game: "snack-trail",
        completion: finished("snack-trail", { result: "loss", score: 100_001 }),
      }).isResult,
    ).toBe(false);
  });
});

describe("Copy and WhatsApp messages", () => {
  test("native fields remain separate and the composed message includes one canonical URL", () => {
    const content = buildArcadeShareContent({
      game: "bento-sudoku",
      completion: finished("bento-sudoku", {
        variant: "6x6",
        dailyDate: "2026-11-08",
        moves: 20,
        hints: 0,
      }),
    });
    expect(content.text).not.toContain(content.url);
    expect(arcadeShareMessage(content)).toBe(`${content.text}\n${content.url}`);
    expect(arcadeShareMessage(content).split(content.url)).toHaveLength(2);
  });

  test("WhatsApp uses encoded text only, with no recipient or extra parameters", () => {
    const content = buildArcadeShareContent({
      game: "bento-sudoku",
      completion: finished("bento-sudoku", {
        variant: "6x6",
        dailyDate: "2026-11-08",
        moves: 20,
        hints: 0,
      }),
    });
    const message = arcadeShareMessage(content);
    const link = arcadeWhatsAppLink(content);
    const url = new URL(link);
    expect(link).toBe(`https://wa.me/?text=${encodeURIComponent(message)}`);
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/");
    expect([...url.searchParams.keys()]).toEqual(["text"]);
    expect(url.searchParams.get("text")).toBe(message);
    expect(link).toContain("%0Ahttps%3A%2F%2Fmealdeck.co.uk%2Fplay");
    expect(url.hash).toBe("");
  });
});
