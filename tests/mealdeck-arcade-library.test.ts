import { describe, expect, test } from "bun:test";
import {
  arcadeGameLink,
  findArcadeGames,
  parseArcadeFavourites,
} from "../src/lib/mealdeck-arcade-library";

describe("Arcade discovery and device preferences", () => {
  test("combines collection, category and all search words", () => {
    expect(findArcadeGames("", "All games", "new").map((game) => game.id)).toEqual([
      "sauce-switch",
      "menu-quest",
      "tray-tactics",
    ]);
    expect(findArcadeGames("chef friend", "Strategy", "two-player").map((game) => game.id)).toEqual(
      ["tray-tactics", "four-to-feast"],
    );
    expect(findArcadeGames("", "Puzzles", "daily").map((game) => game.id)).toEqual([
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
});
