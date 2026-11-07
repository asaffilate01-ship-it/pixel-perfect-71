import {
  ARCADE_GAMES,
  arcadeGameLink,
  isArcadeGameId,
  parseArcadeSearch,
  type ArcadeGameId,
} from "./mealdeck-arcade-library";
import { buildArcadeShareContent, type ArcadeShareContent } from "./mealdeck-arcade-sharing";

export const ARCADE_PROMOTION_DAILY_GAMES = ["sauce-switch", "menu-quest", "bento-sudoku"] as const;

export type ArcadePromotionSelection = {
  game: ArcadeGameId;
  daily: boolean;
  date: string;
  size: 3 | 4 | 6;
};

export function supportsDailyPromotion(game: ArcadeGameId): boolean {
  return ARCADE_PROMOTION_DAILY_GAMES.some((id) => id === game);
}

/** Changing games keeps only setup choices that the chosen game actually supports. */
export function selectPromotionGame(
  previous: ArcadePromotionSelection,
  value: unknown,
): ArcadePromotionSelection {
  const game = isArcadeGameId(value) ? value : "menu-quest";
  return {
    ...previous,
    game,
    daily: previous.daily && supportsDailyPromotion(game),
    size:
      game === "sauce-switch"
        ? previous.size === 4
          ? 4
          : 3
        : game === "bento-sudoku" && previous.size === 6
          ? 6
          : 4,
  };
}

/** Invitation-only copy. This kit never creates or implies a completed game result. */
export function buildArcadePromotionContent(
  selection: ArcadePromotionSelection,
): ArcadeShareContent {
  const { game, daily, date, size } = selectPromotionGame(selection, selection.game);
  const search = parseArcadeSearch({ game, ...(daily ? { daily: date } : {}), size });
  if (daily && !search.daily) throw new Error("Choose a real puzzle date in UTC.");
  const base = buildArcadeShareContent({ game, dailyDate: search.daily });
  const name = ARCADE_GAMES.find((entry) => entry.id === game)!.name;
  const sizeLabel =
    game === "menu-quest"
      ? "8 × 8 word search"
      : search.size
        ? `${search.size} × ${search.size} tray`
        : undefined;
  const context = [sizeLabel, search.daily ? `Daily · ${search.daily} UTC` : undefined]
    .filter(Boolean)
    .join(" · ");
  const prompt = search.daily
    ? `Try ${name}’s daily puzzle for ${search.daily} UTC${sizeLabel ? ` (${sizeLabel})` : ""}.`
    : `Your turn: try ${name} on MealDeck${sizeLabel ? ` (${sizeLabel})` : ""}.`;
  return {
    ...base,
    url: arcadeGameLink(game, undefined, { daily: search.daily, size: search.size }),
    headline: search.daily ? "Your daily challenge" : "Your turn",
    detail: "Free to play · No sign-in needed",
    context: context || "MealDeck Play",
    text: `${prompt} Free to play, with no sign-in. Pick a game and pass it on.`,
    filename: `mealdeck-${game}${search.daily ? `-${search.daily}` : ""}-invite.png`,
    isResult: false,
  };
}

/** Only verified, committed clips are listed here; no generated or user-supplied paths. */
export const ARCADE_PROMOTION_CLIPS: Partial<
  Record<ArcadeGameId, { video: string; poster: string }>
> = {
  "snack-trail": {
    video: "/game-promos/snack-trail.mp4",
    poster: "/game-promos/snack-trail.png",
  },
  "skewer-sort": {
    video: "/game-promos/skewer-sort.mp4",
    poster: "/game-promos/skewer-sort.png",
  },
  "pantry-sweep": {
    video: "/game-promos/pantry-sweep.mp4",
    poster: "/game-promos/pantry-sweep.png",
  },
};
