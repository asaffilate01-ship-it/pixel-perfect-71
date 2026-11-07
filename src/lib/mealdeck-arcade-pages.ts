import {
  ARCADE_GAMES,
  isArcadeGameId,
  type ArcadeGameId,
  type ArcadeSearch,
} from "./mealdeck-arcade-library";
import { ARCADE_DAILY_GAMES, arcadeUtcDate, type DailyArcadeGame } from "./mealdeck-play-progress";
import { seo, SITE_URL } from "./seo";

export const ARCADE_DAILY_URL = `${SITE_URL}/play/daily`;
export const ARCADE_RECEIPT_URL = `${SITE_URL}/play/receipt`;
export const ARCADE_PROMOTE_URL = `${SITE_URL}/play/promote`;
export const ARCADE_PREVIEW_WIDTH = 1200;
export const ARCADE_PREVIEW_HEIGHT = 630;

/** Public, allowlisted page facts. No query, player, board or history data enters metadata. */
export const ARCADE_GAME_PAGES = ARCADE_GAMES.map((game) => ({
  id: game.id,
  name: game.name,
  art: game.art,
  category: game.category,
  players: game.players,
  title: `${game.name} — Play Free | MealDeck`,
  description: `Play ${game.name} free on MealDeck. ${game.description} No sign-in needed.`,
  path: `/play/${game.id}`,
  canonical: `${SITE_URL}/play/${game.id}`,
  image: `${SITE_URL}/game-previews/${game.id}.png`,
  imagePath: `/game-previews/${game.id}.png`,
  imageAlt: `${game.name} — free food-themed games on MealDeck`,
}));
export type ArcadeGamePage = (typeof ARCADE_GAME_PAGES)[number];

export function getArcadeGamePage(slug: unknown): ArcadeGamePage | null {
  if (!isArcadeGameId(slug)) return null;
  return ARCADE_GAME_PAGES.find((game) => game.id === slug) ?? null;
}

export function arcadeGameSeo(game: ArcadeGameId) {
  const page = getArcadeGamePage(game);
  if (!page) throw new RangeError("Choose a game from the MealDeck catalogue.");
  const base = seo({
    title: page.title,
    description: page.description,
    path: page.path,
    image: page.image,
    imageAlt: page.imageAlt,
  });
  return {
    ...base,
    meta: [
      ...base.meta,
      { property: "og:image:width", content: String(ARCADE_PREVIEW_WIDTH) },
      { property: "og:image:height", content: String(ARCADE_PREVIEW_HEIGHT) },
    ],
  };
}

export function arcadeLibrarySeo() {
  return seo({
    title: "MealDeck Play — Free Food Games",
    description: `Pick from ${ARCADE_GAMES.length} free food-themed games, including daily puzzles, word searches and strategy games. Play solo or with a friend. No sign-in needed.`,
    path: "/play",
  });
}

export type ArcadeDailySetup = ArcadeSearch & { game: DailyArcadeGame; daily: string };

/** Resolve once per visit in a route loader; the UI keeps this snapshot while playing. */
export function resolveArcadeDailyPage(now = Date.now()): ArcadeDailySetup {
  if (!Number.isFinite(now))
    throw new RangeError("A valid date is needed for the daily challenge.");
  const daily = arcadeUtcDate(now);
  const day = Math.floor(now / 86_400_000);
  const index =
    ((day % ARCADE_DAILY_GAMES.length) + ARCADE_DAILY_GAMES.length) % ARCADE_DAILY_GAMES.length;
  const game = ARCADE_DAILY_GAMES[index]?.id ?? "bento-sudoku";
  return {
    game,
    daily,
    ...(game === "sauce-switch"
      ? { size: 3 as const }
      : game === "bento-sudoku"
        ? { size: 4 as const }
        : {}),
  };
}

export function arcadeDailySeo() {
  return seo({
    title: "Today's Daily Food Puzzle | MealDeck Play",
    description:
      "A fresh daily food puzzle to share with a friend. Play Sauce Switch, Menu Quest or Bento Sudoku free on MealDeck. No sign-in needed.",
    path: "/play/daily",
  });
}

export function arcadeReceiptSeo() {
  return seo({
    title: "A Little Play with Your Meal | MealDeck Games",
    description:
      "Discover free MealDeck games from your receipt. Try today's daily puzzle, a quick food game or browse all 19 games. No sign-in needed.",
    path: "/play/receipt",
  });
}
