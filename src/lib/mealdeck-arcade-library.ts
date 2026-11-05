import { GAME_CATALOGUE, type SuitArt } from "@/lib/dishbee-play";

export type ArcadeGameId = (typeof GAME_CATALOGUE)[number]["id"];
export const ARCADE_CATEGORIES = [
  "All games",
  "Strategy",
  "Memory",
  "Puzzles",
  "Card games",
] as const;
export type ArcadeFilter = (typeof ARCADE_CATEGORIES)[number];

const gameDetails: Record<
  ArcadeGameId,
  {
    category: Exclude<ArcadeFilter, "All games">;
    players: string;
    art: SuitArt;
  }
> = {
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

export function findArcadeGames(query: string, category: ArcadeFilter) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return ARCADE_GAMES.filter((game) => {
    const text = `${game.name} ${game.description} ${game.category} ${game.players}`.toLowerCase();
    return (
      (category === "All games" || game.category === category) &&
      words.every((word) => text.includes(word))
    );
  });
}
