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

/** Public setup fields for a path-based game route; its allowlisted slug is applied separately. */
export function parseArcadeSetupSearch(
  search: Record<string, unknown>,
): Omit<ArcadeSearch, "game"> {
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
  const validDate =
    typeof daily === "string" &&
    /^20\d{2}-\d{2}-\d{2}$/.test(daily) &&
    Number.isFinite(Date.parse(`${daily}T00:00:00Z`)) &&
    new Date(`${daily}T00:00:00Z`).toISOString().slice(0, 10) === daily;
  return {
    ...(isBrandTheme(search["brand"]) ? { brand: search["brand"] } : {}),
    ...(validDate ? { daily } : {}),
    ...(size !== undefined ? { size } : {}),
  };
}

/** Old query links and new page links use the same game-specific setup allowlist. */
export function parseArcadeSearch(search: Record<string, unknown>): ArcadeSearch {
  const game = isArcadeGameId(search["game"]) ? search["game"] : undefined;
  const setup = parseArcadeSetupSearch(search);
  const validSize =
    (game === "sauce-switch" && (setup.size === 3 || setup.size === 4)) ||
    (game === "bento-sudoku" && (setup.size === 4 || setup.size === 6));
  return {
    ...(setup.brand ? { brand: setup.brand } : {}),
    ...(game ? { game } : {}),
    ...(game && DAILY_LAUNCH_GAMES.includes(game) && setup.daily ? { daily: setup.daily } : {}),
    ...(validSize && setup.size !== undefined ? { size: setup.size } : {}),
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
  const params = new URLSearchParams();
  // Only Food Pairs uses a brand skin; puzzle links carry public setup choices only.
  if (search.game === "pairs" && search.brand) params.set("brand", search.brand);
  if (search.daily) params.set("daily", search.daily);
  if (search.size !== undefined) params.set("size", String(search.size));
  const query = params.toString();
  return `https://mealdeck.co.uk/play/${search.game}${query ? `?${query}` : ""}`;
}

/** Deterministic, device-local suggestions; never imply an unfinished board was saved. */
export function getArcadeSuggestions(
  current: ArcadeGameId | null,
  completed: readonly string[] = [],
  favourites: readonly ArcadeGameId[] = [],
) {
  const active = ARCADE_GAMES.find((item) => item.id === current);
  const related = active ? ARCADE_GAMES.filter((item) => item.category === active.category).map((item) => item.id) : [];
  const preferred = current
    ? [...related, ...favourites, ...NEW_ARCADE_GAMES]
    : [...completed, ...favourites, "snack-trail", "bento-sudoku", "four-to-feast"];
  const ids = [...new Set([...preferred, ...ARCADE_GAMES.map((item) => item.id)])]
    .filter((id): id is ArcadeGameId => isArcadeGameId(id) && id !== current)
    .slice(0, 3);
  return ids.map((id) => ARCADE_GAMES.find((item) => item.id === id)!);
}

export type ArcadeHelpEntry = { id: string; game?: ArcadeGameId; question: string; answer: string };
/** Reviewed, local help. No generative output or customer/account data is needed. */
export const ARCADE_HELP: readonly ArcadeHelpEntry[] = [
  { id: "free", question: "Are the games free? Do I need an account?", answer: "All MealDeck Play games are free entertainment. You can play without signing in or placing an order." },
  { id: "rewards", question: "Can games earn loyalty points, food or prizes?", answer: "No. Games never award food, money, discounts or loyalty points. Eligible paid orders have a separate loyalty system." },
  { id: "save", question: "Can I save a game and finish later?", answer: "Snack Trail, Feast 2048 and Kitchen Shuffle have explicit Save and exit controls. Saves stay in this browser and loading consumes the save slot. Other unfinished boards are not saved unless the game explicitly offers it." },
  { id: "friends", question: "Can I play with a friend?", answer: "Four to Feast, Tray Tactics and Tray Lines support two players on the same device. Share a game link to invite friends to try it on their own device; this is not online multiplayer." },
  { id: "daily", question: "Where are the daily puzzles?", answer: "Open Daily challenge or My playbook for supported daily puzzles. The puzzle date is based on UTC and stays fixed during your attempt." },
  { id: "keyboard", question: "Can I play with a keyboard or without sound?", answer: "Games provide labelled buttons and keyboard controls. Open the individual game guide for shortcuts. Order Echo also has a step-by-step pace and does not require sound." },
  { id: "privacy", question: "Where are favourites and scores stored?", answer: "Favourites and supported personal statistics are stored locally when browser storage is available. They are not synced to a customer account. My playbook records supported finished rounds." },
  { id: "pairs", game: "pairs", question: "How do I play Food Pairs?", answer: "Turn over two cards at a time and remember their positions. Match every pair in the fewest moves. Easy, Classic and Challenge use 4, 6 and 8 pairs." },
  { id: "recipe", game: "recipe", question: "How does Recipe Rush work?", answer: "Read the game clue and select exactly three ingredients. Check the answer, use the hint if needed, and move to the next question. These fictional recipes are not menu specifications or allergen advice." },
  { id: "snack", game: "snack-trail", question: "How do I control Snack Trail?", answer: "Use swipes, the direction pad or arrow keys. Collect food without hitting walls or your own trail. Choose step mode for untimed play, or save and exit to continue later." },
  { id: "skewer", game: "skewer-sort", question: "How do I solve Skewer Sort?", answer: "Move the top bite onto a matching bite or an empty skewer. Each skewer holds three. Use Undo or Hint when stuck; the hint searches for a legal solution route." },
  { id: "pantry", game: "pantry-sweep", question: "What do Pantry Sweep numbers mean?", answer: "A number counts chillies in the touching squares, including diagonals. Flag suspected chillies and reveal safe cells. Hints use visible clues and may report that a guess is needed." },
  { id: "bento", game: "bento-sudoku", question: "What is the Bento Sudoku goal?", answer: "Place each symbol once in every row, column and marked region. Choose the board size and a fresh difficulty or daily puzzle. Candidate marks and logic hints explain deductions from current entries; revealed hints fill one answer." },
  { id: "lines", game: "tray-lines", question: "How do I win Tray Lines?", answer: "Draw edges between neighbouring dots. Completing a box claims it; the player with more boxes wins. Play against the chef or a friend on the same device." },
  { id: "sauce", game: "sauce-switch", question: "How does Sauce Switch work?", answer: "Switching a tile changes it and its neighbouring tiles. Clear the tray using the puzzle rules. Plan ahead and try a new or daily puzzle." },
  { id: "quest", game: "menu-quest", question: "How do I select a word in Menu Quest?", answer: "Find a hidden food word and select its first and last letters. The game checks the line against the word list." },
  { id: "tactics", game: "tray-tactics", question: "How do I capture food in Tray Tactics?", answer: "Place a piece where it brackets opposing pieces so they flip to your side. Control the tray and use the game guide to understand legal moves." },
  { id: "2048", game: "feast-2048", question: "How do I reach 2048 in Feast 2048?", answer: "Slide matching numbered tiles together; each tile merges once per move. Keep empty spaces and build larger tiles. Undo up to five recent moves or save the board." },
  { id: "four", game: "four-to-feast", question: "What is Four to Feast?", answer: "Drop burgers or cakes into a column and connect four horizontally, vertically or diagonally. Choose a computer difficulty or play with a friend." },
  { id: "echo", game: "order-echo", question: "How do I improve my Order Echo score?", answer: "Watch the sequence and repeat it in order. Choose a slower or step-by-step pace, and replay a sequence when needed. Each completed round adds a dish." },
  { id: "shuffle", game: "kitchen-shuffle", question: "How do I move a Kitchen Shuffle tile?", answer: "Slide a tile next to the empty space. Arrange all tiles into the target order; only adjacent tiles can move. Solution hints use bounded search. Save and exit preserves the board and recent undo history in this browser." },
  { id: "chaos", game: "kitchen-chaos", question: "How do I play Kitchen Chaos?", answer: "Play food cards against the house chef using the matching and special-card rules shown in the game guide. Follow the legal-move controls." },
  { id: "snap", game: "snap", question: "What is Brand Snap?", answer: "Look for matching official MealDeck brand logos and follow the round prompts. It is a memory and matching challenge, not a reward draw." },
  { id: "go", game: "go-dish", question: "How do I collect sets in Go Dish?", answer: "Ask the chef for food-card ranks and collect matching sets. The guide explains when to ask or draw." },
  { id: "full", game: "full-house", question: "What makes a Full House?", answer: "Find five cards containing three of one food suit and two of another. No betting or stakes are involved." },
  { id: "stacks", game: "solitaire", question: "What is the Kitchen Stacks goal?", answer: "Sort each food suit in order from one to four, using the legal moves described in the guide." },
  {"id":"chaos-difficulty","game":"kitchen-chaos","question":"Does the expert chef see my hidden cards?","answer":"No. The local opponent chooses using its own hand, the public top card, active food and the number of cards in your hand. Relaxed, Classic and Expert use different strategies."},
  {"id":"chaos-draw","game":"kitchen-chaos","question":"What happens when Kitchen Chaos has no matching cards?","answer":"Draw and end your move. You can show only playable cards or request a legal suggestion when a match exists. An unfinished round ends in a draw after 120 player moves."},
  {"id":"snap-length","game":"snap","question":"Can I choose a shorter or longer Brand Snap quiz?","answer":"Yes. Quick has 6 pairs, Classic 12 and Marathon 24. There is no timer; each challenge contains an equal number of matching and different pairs."},
  {"id":"snap-review","game":"snap","question":"How can I review my Brand Snap mistakes?","answer":"Finish the quiz and open Review missed pairs. It shows your answer and the correct answer for each missed pair, plus your accuracy and longest streak."},
  {"id":"hints","question":"Are intelligent puzzle hints guaranteed to find a solution?","answer":"Skewer Sort and Kitchen Shuffle use bounded local search and may reach a limit. Pantry Sweep and Bento Sudoku use visible clues and can explain when no supported deduction is found."},
  {"id":"switch","question":"What happens if I switch games during a round?","answer":"Opening the game picker does not itself replace your board. Choosing a different game starts a fresh board unless you explicitly saved your previous game using a supported save slot."},
  {"id":"focus","question":"How do I make the game board larger on a phone?","answer":"Choose Focus view above the game to reduce surrounding content. Exit focus view to return to the full arcade. On desktop, Escape also exits focus view."},
  {"id":"recipe-master","game":"recipe","question":"How many Recipe Rush questions can I play?","answer":"Taster has 3, Chef has 6 and Master has 12 game recipes. Clues and hints help you choose three ingredients. The game recipes are not real product specifications."},
];

export function findArcadeHelp(query: string, game?: ArcadeGameId): ArcadeHelpEntry[] {
  const normalise = (text: string) => text.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const words = normalise(query.slice(0, 160)).split(/\s+/).filter(Boolean);
  const common = new Set(["a", "an", "the", "i", "my", "can", "do", "how", "does", "is", "are", "to", "for", "and", "or", "with", "please"]);
  const useful = words.filter(word => !common.has(word));
  const terms = useful.length ? useful : words;
  const matches = ARCADE_HELP.filter(entry => {
    const searchable = normalise(entry.question + " " + entry.answer + " " + (entry.game ?? ""));
    return terms.every(word => searchable.includes(word));
  });
  if (!game) return matches;
  return [...matches.filter(entry => entry.game === game), ...matches.filter(entry => entry.game !== game)];
}
