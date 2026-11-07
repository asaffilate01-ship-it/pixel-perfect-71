import { GAME_CATALOGUE, isBrandTheme, type BrandTheme, type SuitArt } from "@/lib/dishbee-play";

export type ArcadeGameId = (typeof GAME_CATALOGUE)[number]["id"];
export const ARCADE_CATEGORIES = [
  "All games",
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
export const NEW_ARCADE_GAMES: readonly ArcadeGameId[] = ["bento-sudoku", "tray-lines"];
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

export type ArcadeSearch = { brand?: BrandTheme; game?: ArcadeGameId; daily?: string };

/** A public daily link carries a calendar date, never a board or personal history. */
export function parseArcadeSearch(search: Record<string, unknown>): ArcadeSearch {
  const game = isArcadeGameId(search["game"]) ? search["game"] : undefined;
  const daily = search["daily"];
  const validDate =
    typeof daily === "string" &&
    /^20\d{2}-\d{2}-\d{2}$/.test(daily) &&
    Number.isFinite(Date.parse(`${daily}T00:00:00Z`)) &&
    new Date(`${daily}T00:00:00Z`).toISOString().slice(0, 10) === daily;
  return {
    ...(isBrandTheme(search["brand"]) ? { brand: search["brand"] } : {}),
    ...(game ? { game } : {}),
    ...(game && DAILY_LAUNCH_GAMES.includes(game) && validDate ? { daily } : {}),
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

export function arcadeGameLink(game: ArcadeGameId, brand = "mealdeck") {
  const params = new URLSearchParams({ game });
  // Only the selected Food Pairs skin affects the shared round's starting options.
  if (game === "pairs" && isBrandTheme(brand)) params.set("brand", brand);
  return `https://mealdeck.co.uk/play?${params.toString()}`;
}
