import { describe, expect, test } from "bun:test";
import {
  arcadeGameLink,
  findArcadeGames,
  getArcadeSuggestions,
  ARCADE_HELP,
  findArcadeHelp,
  ARCADE_GAMES,
  parseArcadeFavourites,
  parseArcadeSearch,
  parseArcadeSetupSearch,
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
    expect(arcadeGameLink("menu-quest", "skorch")).toBe("https://mealdeck.co.uk/play/menu-quest");
    expect(arcadeGameLink("pairs", "skorch")).toBe(
      "https://mealdeck.co.uk/play/pairs?brand=skorch",
    );
    expect(arcadeGameLink("pairs", "evil&token=private")).toBe("https://mealdeck.co.uk/play/pairs");
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
    expect(arcadeGameLink("pairs")).toBe("https://mealdeck.co.uk/play/pairs?brand=mealdeck");
    expect(arcadeGameLink("pairs", "tavo", { daily: "2026-11-07", size: 4 })).toBe(
      "https://mealdeck.co.uk/play/pairs?brand=tavo",
    );
    expect(arcadeGameLink("bento-sudoku", "skorch", { daily: "2026-11-07", size: 6 })).toBe(
      "https://mealdeck.co.uk/play/bento-sudoku?daily=2026-11-07&size=6",
    );
    expect(arcadeGameLink("sauce-switch", undefined, { size: 3 })).toBe(
      "https://mealdeck.co.uk/play/sauce-switch?size=3",
    );
    expect(arcadeGameLink("menu-quest", undefined, { daily: "2026-11-07", size: 8 })).toBe(
      "https://mealdeck.co.uk/play/menu-quest?daily=2026-11-07",
    );
    expect(arcadeGameLink("snack-trail", "mealdeck", { daily: "2026-11-07", size: 4 })).toBe(
      "https://mealdeck.co.uk/play/snack-trail",
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
        "https://mealdeck.co.uk/play/bento-sudoku?size=6",
      );
    }
    expect(arcadeGameLink("sauce-switch", undefined, { daily: "2026-11-07", size: 6 })).toBe(
      "https://mealdeck.co.uk/play/sauce-switch?daily=2026-11-07",
    );
    expect(arcadeGameLink("private&token=secret" as never)).toBe("https://mealdeck.co.uk/play");
  });
});

describe("Canonical game pages and legacy incoming links", () => {
  test("the public path selects the game without accepting a query-string override", () => {
    const setup = parseArcadeSetupSearch({
      game: "snack-trail",
      daily: "2028-02-29",
      size: "6",
      token: "private",
    });
    expect(setup).toEqual({ daily: "2028-02-29", size: 6 });
    expect(parseArcadeSearch({ ...setup, game: "bento-sudoku" })).toEqual({
      game: "bento-sudoku",
      daily: "2028-02-29",
      size: 6,
    });
    expect(parseArcadeSearch({ ...setup, game: "sauce-switch" })).toEqual({
      game: "sauce-switch",
      daily: "2028-02-29",
    });
  });

  test("old game/date/size URLs resolve to the same public setup as canonical links", () => {
    for (const [game, size] of [
      ["sauce-switch", 3],
      ["sauce-switch", 4],
      ["bento-sudoku", 4],
      ["bento-sudoku", 6],
    ] as const) {
      const old = new URL(`https://mealdeck.co.uk/play?game=${game}&daily=2026-11-07&size=${size}`);
      const canonical = new URL(arcadeGameLink(game, undefined, { daily: "2026-11-07", size }));
      expect(parseArcadeSearch(Object.fromEntries(old.searchParams))).toEqual(
        parseArcadeSearch({
          ...Object.fromEntries(canonical.searchParams),
          game: canonical.pathname.split("/").at(-1),
        }),
      );
      expect(canonical.pathname).toBe(`/play/${game}`);
      expect(canonical.searchParams.has("game")).toBe(false);
    }
  });
});

describe("Responsive arcade quick picks", () => {
  test("offers varied first picks and respects device history without duplicate or unknown IDs", () => {
    expect(getArcadeSuggestions(null).map((game) => game.id)).toEqual(["snack-trail", "bento-sudoku", "four-to-feast"]);
    expect(getArcadeSuggestions(null, ["unknown", "pairs", "pairs"], ["pairs", "tray-lines"]).map((game) => game.id)).toEqual(["pairs", "tray-lines", "snack-trail"]);
  });

  test("prioritises related games and never recommends the active game", () => {
    const related = getArcadeSuggestions("four-to-feast");
    expect(related).toHaveLength(3);
    expect(related.every((game) => game.category === "Strategy" && game.id !== "four-to-feast")).toBe(true);
    expect(new Set(getArcadeSuggestions("snack-trail").map((game) => game.id)).size).toBe(3);
  });
});

describe("Reviewed arcade help", () => {
  test("all games have help and every question has a unique ID", () => {
    expect(ARCADE_HELP).toHaveLength(40);
    expect(new Set(ARCADE_HELP.map(entry => entry.id)).size).toBe(40);
    for (const game of ARCADE_GAMES) expect(ARCADE_HELP.some(entry => entry.game === game.id)).toBe(true);
  });
  test("search is case-insensitive, matches every term, and promotes the active game", () => {
    expect(findArcadeHelp("", "recipe")[0]?.game).toBe("recipe");
    expect(findArcadeHelp("  LOYALTY points ").some(entry => entry.id === "rewards")).toBe(true);
    expect(findArcadeHelp("unknownzzz")).toEqual([]);
    expect(findArcadeHelp("save board").length).toBeGreaterThan(0);
  });
});

test("new card-game guidance is searchable and prioritises the active game", () => {
  expect(findArcadeHelp("hidden cards", "kitchen-chaos")[0]?.id).toBe("chaos-difficulty");
  expect(findArcadeHelp("marathon", "snap")[0]?.id).toBe("snap-length");
  expect(findArcadeHelp("focus view").some(entry => entry.id === "focus")).toBe(true);
});

test("help accepts punctuated natural questions and ignores common filler words", () => {
  expect(findArcadeHelp("Can I play with a friend?").some(entry => entry.id === "friends")).toBe(true);
  expect(findArcadeHelp("Please, how do I save a board?").some(entry => entry.id === "save")).toBe(true);
  expect(findArcadeHelp("Kitchen-Chaos!", "kitchen-chaos").length).toBeGreaterThan(0);
  expect(findArcadeHelp("unknownzzz?!")).toEqual([]);
});

test("card strategy and saved-stack questions can be found", () => {
  expect(findArcadeHelp("public rank", "go-dish").some(entry=>entry.id==="go-difficulty")).toBe(true);
  expect(findArcadeHelp("save kitchen stacks", "solitaire").some(entry=>entry.id==="stacks-save")).toBe(true);
});

test("expert tray strategy help is discoverable", () => {
  expect(findArcadeHelp("expert tray tactics", "tray-tactics").some(entry=>entry.id==="tactics-expert")).toBe(true);
  expect(findArcadeHelp("expert tray lines", "tray-lines").some(entry=>entry.id==="lines-expert")).toBe(true);
});
