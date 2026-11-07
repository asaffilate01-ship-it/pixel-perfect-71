import { GAME_CATALOGUE, isBrandTheme, type BrandTheme, type SuitArt } from "@/lib/dishbee-play";

export type ArcadeGameId = (typeof GAME_CATALOGUE)[number]["id"];
export const ARCADE_CATEGORIES = [
  "All games",
  "Quick play",
  "Strategy",
  "Memory",
  "Puzzles",
  "Card games",
] as const;
export type ArcadeFilter = (typeof ARCADE_CATEGORIES)[number];

export const ARCADE_COLLECTIONS = [
  { id: "all", label: "All games" },
  { id: "new", label: "New on the menu" },
  { id: "favourites", label: "My favourites" },
  { id: "two-player", label: "Play with a friend" },
  { id: "daily", label: "Daily puzzles" },
] as const;
export type ArcadeCollection = (typeof ARCADE_COLLECTIONS)[number]["id"];
export const NEW_ARCADE_GAMES: readonly ArcadeGameId[] = [
  "snack-trail",
  "skewer-sort",
  "pantry-sweep",
];
const TWO_PLAYER_GAMES: readonly ArcadeGameId[] = ["four-to-feast", "tray-tactics", "tray-lines"];
const DAILY_GAMES: readonly ArcadeGameId[] = [
  "kitchen-shuffle",
  "sauce-switch",
  "menu-quest",
  "bento-sudoku",
];
const DAILY_LAUNCH_GAMES: readonly ArcadeGameId[] = ["sauce-switch", "menu-quest", "bento-sudoku"];

const gameDetails: Record<
  ArcadeGameId,
  {
    category: Exclude<ArcadeFilter, "All games">;
    players: string;
    art: SuitArt;
  }
> = {
  "snack-trail": { category: "Quick play", players: "Solo", art: "burger" },
  "skewer-sort": { category: "Puzzles", players: "Solo", art: "chicken" },
  "pantry-sweep": { category: "Puzzles", players: "Solo", art: "fries" },
  "bento-sudoku": { category: "Puzzles", players: "Solo", art: "chicken" },
  "tray-lines": { category: "Strategy", players: "1–2 players", art: "burger" },
  "sauce-switch": { category: "Puzzles", players: "Solo", art: "fries" },
  "menu-quest": { category: "Puzzles", players: "Solo", art: "french-taco" },
  "tray-tactics": { category: "Strategy", players: "1–2 players", art: "cake" },
  "feast-2048": { category: "Strategy", players: "Solo", art: "burger" },
  "four-to-feast": { category: "Strategy", players: "1–2 players", art: "cake" },
  "order-echo": { category: "Memory", players: "Solo", art: "chicken" },
  "kitchen-shuffle": { category: "Puzzles", players: "Solo", art: "french-taco" },
  pairs: { category: "Memory", players: "Solo", art: "burger" },
  recipe: { category: "Puzzles", players: "Solo", art: "french-taco" },
  "kitchen-chaos": { category: "Card games", players: "Vs the chef", art: "chicken" },
  snap: { category: "Memory", players: "Solo", art: "cake" },
  "go-dish": { category: "Card games", players: "Vs the chef", art: "french-taco" },
  "full-house": { category: "Puzzles", players: "Solo", art: "cake" },
  solitaire: { category: "Puzzles", players: "Solo", art: "burger" },
};

export const ARCADE_GAMES = GAME_CATALOGUE.map((game) => ({ ...game, ...gameDetails[game.id] }));

export function isArcadeGameId(value: unknown): value is ArcadeGameId {
  return typeof value === "string" && GAME_CATALOGUE.some((game) => game.id === value);
}

export type ArcadeSearch = {
  brand?: BrandTheme;
  game?: ArcadeGameId;
  daily?: string;
  size?: 3 | 4 | 6;
};

/** A public daily link carries a calendar date, never a board or personal history. */
export function parseArcadeSearch(search: Record<string, unknown>): ArcadeSearch {
  const game = isArcadeGameId(search["game"]) ? search["game"] : undefined;
  const daily = search["daily"];
  const rawSize = search["size"];
  const size =
    rawSize === 3 || rawSize === "3"
      ? 3
      : rawSize === 4 || rawSize === "4"
        ? 4
        : rawSize === 6 || rawSize === "6"
          ? 6
          : undefined;
  const validSize =
    (game === "sauce-switch" && (size === 3 || size === 4)) ||
    (game === "bento-sudoku" && (size === 4 || size === 6));
  const validDate =
    typeof daily === "string" &&
    /^20\d{2}-\d{2}-\d{2}$/.test(daily) &&
    Number.isFinite(Date.parse(`${daily}T00:00:00Z`)) &&
    new Date(`${daily}T00:00:00Z`).toISOString().slice(0, 10) === daily;
  return {
    ...(isBrandTheme(search["brand"]) ? { brand: search["brand"] } : {}),
    ...(game ? { game } : {}),
    ...(game && DAILY_LAUNCH_GAMES.includes(game) && validDate ? { daily } : {}),
    ...(validSize && size !== undefined ? { size } : {}),
  };
}

/** A suggestion uses the visible results and avoids the current game when possible. */
export function pickArcadeGame(
  games: readonly { id: ArcadeGameId }[],
  current: ArcadeGameId,
  random: () => number = Math.random,
): ArcadeGameId | null {
  if (!games.length) return null;
  const alternatives = games.filter((item) => item.id !== current);
  const choices = alternatives.length ? alternatives : games;
  const sample = random();
  const fraction = Number.isFinite(sample) ? Math.max(0, Math.min(1, sample)) : 0;
  return choices[Math.min(choices.length - 1, Math.floor(fraction * choices.length))]!.id;
}

export function findArcadeGames(
  query: string,
  category: ArcadeFilter,
  collection: ArcadeCollection = "all",
  favourites: readonly ArcadeGameId[] = [],
) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return ARCADE_GAMES.filter((game) => {
    const text = `${game.name} ${game.description} ${game.category} ${game.players}`.toLowerCase();
    return (
      (category === "All games" || game.category === category) &&
      (collection !== "new" || NEW_ARCADE_GAMES.includes(game.id)) &&
      (collection !== "favourites" || favourites.includes(game.id)) &&
      (collection !== "two-player" || TWO_PLAYER_GAMES.includes(game.id)) &&
      (collection !== "daily" || DAILY_GAMES.includes(game.id)) &&
      words.every((word) => text.includes(word))
    );
  });
}

/** Device preferences are optional, untrusted and never contain customer/order data. */
export function parseArcadeFavourites(raw: string | null): ArcadeGameId[] {
  if (!raw || raw.length > 2048) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(isArcadeGameId))].slice(0, ARCADE_GAMES.length);
  } catch {
    return [];
  }
}

export function arcadeGameLink(
  game: ArcadeGameId,
  brand = "mealdeck",
  options: { daily?: string | undefined; size?: number | undefined } = {},
) {
  const search = parseArcadeSearch({ game, brand, daily: options.daily, size: options.size });
  if (!search.game) return "https://mealdeck.co.uk/play";
  const params = new URLSearchParams({ game: search.game });
  // Only Food Pairs uses a brand skin; puzzle links carry public setup choices only.
  if (search.game === "pairs" && search.brand) params.set("brand", search.brand);
  if (search.daily) params.set("daily", search.daily);
  if (search.size !== undefined) params.set("size", String(search.size));
  return `https://mealdeck.co.uk/play?${params.toString()}`;
}
