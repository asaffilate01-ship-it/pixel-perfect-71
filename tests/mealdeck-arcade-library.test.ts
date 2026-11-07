import { describe, expect, test } from "bun:test";
import {
  arcadeGameLink,
  findArcadeGames,
  parseArcadeFavourites,
  parseArcadeSearch,
  pickArcadeGame,
} from "../src/lib/mealdeck-arcade-library";

describe("Arcade discovery and device preferences", () => {
  test("combines collection, category and all search words", () => {
    expect(findArcadeGames("", "All games", "new").map((game) => game.id)).toEqual([
      "snack-trail",
      "skewer-sort",
      "pantry-sweep",
    ]);
    expect(findArcadeGames("", "Quick play").map((game) => game.id)).toEqual(["snack-trail"]);
    expect(findArcadeGames("", "Puzzles", "new").map((game) => game.id)).toEqual([
      "skewer-sort",
      "pantry-sweep",
    ]);
    expect(findArcadeGames("chef friend", "Strategy", "two-player").map((game) => game.id)).toEqual(
      ["tray-lines", "tray-tactics", "four-to-feast"],
    );
    expect(findArcadeGames("", "Puzzles", "daily").map((game) => game.id)).toEqual([
      "bento-sudoku",
      "sauce-switch",
      "menu-quest",
      "kitchen-shuffle",
    ]);
    expect(findArcadeGames("  BURGER does-not-exist  ", "All games")).toEqual([]);
    expect(
      findArcadeGames("", "All games", "favourites", ["pairs", "tray-tactics"]).map(
        (game) => game.id,
      ),
    ).toEqual(["tray-tactics", "pairs"]);
  });

  test("ignores malformed, stale, duplicate and oversized optional local storage", () => {
    for (const raw of [null, "", "broken", "{}", "null", "42", "x".repeat(2049)])
      expect(parseArcadeFavourites(raw)).toEqual([]);
    expect(
      parseArcadeFavourites('["pairs", "not-a-game", "pairs", null, {"id":"snap"}, "menu-quest"]'),
    ).toEqual(["pairs", "menu-quest"]);
  });

  test("sharing includes only a public game ID and an allowlisted relevant deck", () => {
    expect(arcadeGameLink("menu-quest", "skorch")).toBe(
      "https://mealdeck.co.uk/play?game=menu-quest",
    );
    expect(arcadeGameLink("pairs", "skorch")).toBe(
      "https://mealdeck.co.uk/play?game=pairs&brand=skorch",
    );
    expect(arcadeGameLink("pairs", "evil&token=private")).toBe(
      "https://mealdeck.co.uk/play?game=pairs",
    );
  });

  test("daily launch accepts real calendar dates only for the supported puzzle games", () => {
    expect(
      parseArcadeSearch({ game: "bento-sudoku", daily: "2026-11-07", token: "private" }),
    ).toEqual({
      game: "bento-sudoku",
      daily: "2026-11-07",
    });
    expect(parseArcadeSearch({ game: "menu-quest", daily: "2028-02-29" })).toEqual({
      game: "menu-quest",
      daily: "2028-02-29",
    });
    for (const daily of [
      "2026-02-29",
      "2026-04-31",
      "2026-13-01",
      "2026-00-01",
      "2026-11-07T00:00:00Z",
      "2026-11-07&token=private",
      20261107,
      {},
      null,
    ]) {
      expect(parseArcadeSearch({ game: "sauce-switch", daily })).toEqual({ game: "sauce-switch" });
    }
    expect(parseArcadeSearch({ game: "tray-lines", daily: "2026-11-07" })).toEqual({
      game: "tray-lines",
    });
    expect(parseArcadeSearch({ game: "unknown", brand: "unknown", daily: "2026-11-07" })).toEqual(
      {},
    );
  });

  test("pick-for-me stays within the filtered collection and offers another game", () => {
    const games = findArcadeGames("", "All games", "new");
    expect(pickArcadeGame(games, "snack-trail", () => 0)).toBe("skewer-sort");
    expect(pickArcadeGame(games, "skewer-sort", () => 0.99)).toBe("pantry-sweep");
    expect(pickArcadeGame(games, "pairs", () => 0)).toBe("snack-trail");
    expect(pickArcadeGame(games, "pairs", () => 1)).toBe("pantry-sweep");
    expect(pickArcadeGame([], "pairs")).toBeNull();
    expect(pickArcadeGame([{ id: "pairs" }], "pairs")).toBe("pairs");
  });
});

describe("Safe puzzle-size and daily deep links", () => {
  test("accepts only supported numeric or exact string sizes for Sauce Switch and Bento Sudoku", () => {
    for (const [game, sizes] of [
      ["sauce-switch", [3, 4]],
      ["bento-sudoku", [4, 6]],
    ] as const) {
      for (const size of sizes) {
        for (const input of [size, String(size)]) {
          expect(parseArcadeSearch({ game, size: input })).toEqual({ game, size });
          expect(parseArcadeSearch({ game, daily: "2028-02-29", size: input })).toEqual({
            game,
            daily: "2028-02-29",
            size,
          });
        }
      }
    }
    expect(parseArcadeSearch({ game: "sauce-switch", size: 6 })).toEqual({ game: "sauce-switch" });
    expect(parseArcadeSearch({ game: "bento-sudoku", size: 3 })).toEqual({ game: "bento-sudoku" });
  });

  test("rejects malformed, coerced and unsupported sizes without reflecting extra data", () => {
    for (const size of [
      0,
      1,
      2,
      5,
      8,
      -4,
      4.5,
      Number.NaN,
      Infinity,
      null,
      {},
      [4],
      true,
      "04",
      "4.0",
      " 4 ",
      "4e0",
      "4&token=private",
    ]) {
      expect(parseArcadeSearch({ game: "bento-sudoku", size, seed: "private" })).toEqual({
        game: "bento-sudoku",
      });
    }
    for (const game of [
      "menu-quest",
      "snack-trail",
      "skewer-sort",
      "pantry-sweep",
      "pairs",
      "unknown",
    ]) {
      for (const size of [3, "4", 6]) {
        const parsed = parseArcadeSearch({ game, size });
        expect(parsed.size).toBeUndefined();
      }
    }
    expect(parseArcadeSearch({ size: 4, daily: "2026-11-07" })).toEqual({});
  });

  test("serializes only canonical setup parameters and preserves old calls", () => {
    expect(arcadeGameLink("pairs")).toBe("https://mealdeck.co.uk/play?game=pairs&brand=mealdeck");
    expect(arcadeGameLink("pairs", "tavo", { daily: "2026-11-07", size: 4 })).toBe(
      "https://mealdeck.co.uk/play?game=pairs&brand=tavo",
    );
    expect(arcadeGameLink("bento-sudoku", "skorch", { daily: "2026-11-07", size: 6 })).toBe(
      "https://mealdeck.co.uk/play?game=bento-sudoku&daily=2026-11-07&size=6",
    );
    expect(arcadeGameLink("sauce-switch", undefined, { size: 3 })).toBe(
      "https://mealdeck.co.uk/play?game=sauce-switch&size=3",
    );
    expect(arcadeGameLink("menu-quest", undefined, { daily: "2026-11-07", size: 8 })).toBe(
      "https://mealdeck.co.uk/play?game=menu-quest&daily=2026-11-07",
    );
    expect(arcadeGameLink("snack-trail", "mealdeck", { daily: "2026-11-07", size: 4 })).toBe(
      "https://mealdeck.co.uk/play?game=snack-trail",
    );
  });

  test("invalid dates never enter a link, while a valid independent size still works", () => {
    for (const daily of [
      "2026-02-29",
      "2026-04-31",
      "2026-11-07#private",
      "2026-11-07T00:00:00Z",
      "private-person",
    ]) {
      expect(arcadeGameLink("bento-sudoku", "mealdeck", { daily, size: 6 })).toBe(
        "https://mealdeck.co.uk/play?game=bento-sudoku&size=6",
      );
    }
    expect(arcadeGameLink("sauce-switch", undefined, { daily: "2026-11-07", size: 6 })).toBe(
      "https://mealdeck.co.uk/play?game=sauce-switch&daily=2026-11-07",
    );
    expect(arcadeGameLink("private&token=secret" as never)).toBe("https://mealdeck.co.uk/play");
  });
});
