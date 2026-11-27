/** Standalone, free-to-play MealDeck card puzzles. No payments, prizes or redeemable points. */
import { CHAOS_SUITS, shuffleDeck, type FoodSuit } from "./kitchen-chaos";

export type BrandSnapRound = { left: string; right: string; match: boolean };
export const SNAP_LENGTHS = [6, 12, 24] as const;
export type SnapLength = (typeof SNAP_LENGTHS)[number];
export function createBrandSnapRounds(
  brandIds: readonly string[], count = 12, random: () => number = Math.random,
): BrandSnapRound[] {
  if (new Set(brandIds).size < 2) throw new Error("Brand Snap requires two distinct brands");
  if (!Number.isInteger(count) || count < 1 || count > 48) throw new RangeError("Choose a quiz length from 1 to 48.");
  const ids = [...new Set(brandIds)];
  const sampleIndex = (length: number) => {
    const sample = random();
    return Math.max(0, Math.min(length - 1, Math.floor((Number.isFinite(sample) ? sample : 0) * length)));
  };
  const rounds: BrandSnapRound[] = [];
  for (let n = 0; n < count; n += 1) {
    const leftIndex = sampleIndex(ids.length);
    const left = ids[leftIndex]!;
    const match = n % 2 === 0;
    const otherIndex = (leftIndex + 1 + sampleIndex(ids.length - 1)) % ids.length;
    rounds.push({ left, right: match ? left : ids[otherIndex]!, match });
  }
  return shuffleDeck(rounds, random);
}
export function evaluateSnap(round: BrandSnapRound, calledSnap: boolean): boolean {
  return round.match === calledSnap;
}

export type SnapAnswer = { index: number; calledSnap: boolean; correct: boolean };
export type SnapSession = { rounds: BrandSnapRound[]; index: number; answers: SnapAnswer[] };
export function createSnapSession(rounds: readonly BrandSnapRound[]): SnapSession {
  return { rounds: [...rounds], index: 0, answers: [] };
}
/** Reject repeated or stale clicks so every displayed question scores at most once. */
export function answerSnap(session: SnapSession, index: number, calledSnap: boolean): SnapSession {
  const round = session.rounds[index];
  if (session.index !== index || !round || session.answers.length !== index) return session;
  return { ...session, answers: [...session.answers, { index, calledSnap, correct: evaluateSnap(round, calledSnap) }] };
}
export function advanceSnap(session: SnapSession, index: number): SnapSession {
  if (session.index !== index || !session.rounds[index] || session.answers.length !== index + 1) return session;
  return { ...session, index: index + 1 };
}
export function snapStatistics(session: SnapSession) {
  let correct = 0, streak = 0, bestStreak = 0;
  for (const answer of session.answers) {
    if (answer.correct) { correct++; streak++; bestStreak = Math.max(bestStreak, streak); }
    else streak = 0;
  }
  return { answered: session.answers.length, correct, streak, bestStreak,
    accuracy: session.answers.length ? Math.round(correct / session.answers.length * 100) : 0 };
}

export type FullHouseCard = { id: string; suit: FoodSuit; rank: number };
export function isFullHouse(cards: readonly FullHouseCard[]): boolean {
  if (cards.length !== 5 || new Set(cards.map(card => card.id)).size !== 5) return false;
  const count: Record<FoodSuit, number> = { burger: 0, chicken: 0, "french-taco": 0, cake: 0 };
  for (const card of cards) count[card.suit] += 1;
  return Object.values(count).filter(c => c > 0).sort().join(",") === "2,3";
}
export function makeFullHousePuzzle(random: () => number = Math.random): FullHouseCard[] {
  const suits = shuffleDeck(CHAOS_SUITS, random);
  const three = suits[0]!;
  const two = suits[1]!;
  const cards: FullHouseCard[] = [
    ...[1, 2, 3].map(rank => ({ id: `${three}-${rank}`, suit: three, rank })),
    ...[1, 2].map(rank => ({ id: `${two}-${rank}`, suit: two, rank })),
    ...[1, 2].map(rank => ({ id: `${suits[2]!}-${rank}`, suit: suits[2]!, rank })),
    ...[1, 2].map(rank => ({ id: `${suits[3]!}-${rank}`, suit: suits[3]!, rank })),
  ];
  return shuffleDeck(cards, random);
}

/** Select a legal five-card hand that preserves as many current selections as possible. */
export function suggestFullHouseCard(cards: readonly FullHouseCard[], selected: readonly string[]): { cardId: string; action: "add" | "remove" } | null {
  if (cards.length > 24 || new Set(cards.map(card => card.id)).size !== cards.length) return null;
  const chosen = new Set(selected);
  if (chosen.size !== selected.length || selected.length > 5 || selected.some(id => !cards.some(card => card.id === id))) return null;
  let target: string[] = [];
  let overlap = -1;
  for (const three of CHAOS_SUITS) for (const two of CHAOS_SUITS) {
    if (three === two) continue;
    const pick = (suit: FoodSuit, count: number) => cards.filter(card => card.suit === suit)
      .sort((a,b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id))).slice(0,count);
    const group = [...pick(three,3), ...pick(two,2)];
    if (!isFullHouse(group)) continue;
    const kept = group.filter(card => chosen.has(card.id)).length;
    if (kept > overlap) { target = group.map(card => card.id); overlap = kept; }
  }
  if (overlap < 0) return null;
  const remove = selected.find(id => !target.includes(id));
  if (remove) return { cardId: remove, action: "remove" };
  const add = target.find(id => !chosen.has(id));
  return add ? { cardId: add, action: "add" } : null;
}
export function toggleFullHouseSelection(cards: readonly FullHouseCard[], selected: string[], id: string): string[] {
  if (!cards.some(card => card.id === id)) return selected;
  if (selected.includes(id)) return selected.filter(value => value !== id);
  return selected.length >= 5 ? selected : [...selected, id];
}

export type GoDishRank = 1 | 2 | 3;
export const GO_DISH_DIFFICULTIES = ["relaxed", "classic", "expert"] as const;
export type GoDishDifficulty = (typeof GO_DISH_DIFFICULTIES)[number];
export type GoDishCard = { id: string; suit: FoodSuit; rank: GoDishRank };
export type GoDishWinner = "player" | "chef" | "draw" | null;
export type GoDishState = {
  player: GoDishCard[];
  chef: GoDishCard[];
  stock: GoDishCard[];
  playerSets: GoDishRank[];
  chefSets: GoDishRank[];
  lastMessage: string;
  turns: number;
  winner: GoDishWinner;
  difficulty?: GoDishDifficulty;
  lastChefRequest?: GoDishRank | null;
};
const RANKS: readonly GoDishRank[] = [1, 2, 3];
export function startGoDish(random: () => number = Math.random, difficulty: GoDishDifficulty = "classic"): GoDishState {
  const cards = shuffleDeck(CHAOS_SUITS.flatMap(suit => RANKS.map(rank => ({
    id: `${suit}-${rank}`, suit, rank,
  }))), random);
  return collectSets({
    player: cards.splice(0, 4), chef: cards.splice(0, 4), stock: cards,
    playerSets: [], chefSets: [], lastMessage: "Ask the house chef for a number shown in your hand.",
    turns: 0, winner: null,
    difficulty: GO_DISH_DIFFICULTIES.includes(difficulty) ? difficulty : "classic", lastChefRequest: null,
  });
}
function collectSets(state: GoDishState): GoDishState {
  let { player, chef } = state;
  const playerSets = [...state.playerSets];
  const chefSets = [...state.chefSets];
  for (const rank of RANKS) {
    if (player.filter(card => card.rank === rank).length === 4) {
      playerSets.push(rank); player = player.filter(card => card.rank !== rank);
    }
    if (chef.filter(card => card.rank === rank).length === 4) {
      chefSets.push(rank); chef = chef.filter(card => card.rank !== rank);
    }
  }
  const done = playerSets.length + chefSets.length === RANKS.length;
  const winner = !done ? null :
    playerSets.length > chefSets.length ? "player" :
    chefSets.length > playerSets.length ? "chef" : "draw";
  return { ...state, player, chef, playerSets, chefSets, winner };
}
function takeStock(hand: GoDishCard[], stock: GoDishCard[]): boolean {
  const card = stock.pop();
  if (!card) return false;
  hand.push(card);
  return true;
}
/** A rank strategy reads its own hand and a publicly requested rank, never hidden opponent cards. */
export function chooseGoDishRank(
  hand: readonly GoDishCard[],
  difficulty: GoDishDifficulty = "classic",
  observedRank: GoDishRank | null = null,
): GoDishRank | null {
  if (!hand.length) return null;
  const available = RANKS.filter(rank => hand.some(card => card.rank === rank));
  if (!available.length) return null;
  if (difficulty === "relaxed") return hand[0]?.rank ?? null;
  if (difficulty === "expert" && observedRank !== null && available.includes(observedRank)) return observedRank;
  return [...available].sort((a,b) => hand.filter(card => card.rank === b).length - hand.filter(card => card.rank === a).length || a-b)[0] ?? null;
}
export function askGoDish(state: GoDishState, rank: GoDishRank): GoDishState {
  if (state.winner) return state;
  if (!state.player.some(card => card.rank === rank))
    return { ...state, lastMessage: "Choose a number already in your hand." };
  const player = [...state.player];
  const chef = [...state.chef];
  const stock = [...state.stock];
  const received = chef.filter(card => card.rank === rank);
  for (const card of received) player.push(card);
  const other = chef.filter(card => card.rank !== rank);
  const didDraw = received.length === 0 && takeStock(player, stock);
  let s = collectSets({
    ...state, player, chef: other, stock, turns: state.turns + 1,
    lastChefRequest: null,
    lastMessage: received.length
      ? `House chef handed over ${received.length} matching ${received.length === 1 ? "card" : "cards"}.`
      : didDraw ? "Go Dish! You drew a card." : "No match, and the deck is empty.",
  });
  if (s.winner) return s;
  const chefHand = [...s.chef], playerHand = [...s.player], stockNow = [...s.stock];
  if (chefHand.length === 0) takeStock(chefHand, stockNow);
  if (playerHand.length === 0) takeStock(playerHand, stockNow);
  if (chefHand.length > 0) {
    const desired = chooseGoDishRank(chefHand, s.difficulty ?? "classic", s.playerSets.includes(rank) ? null : rank)!;
    const chefGain = playerHand.filter(card => card.rank === desired);
    const playerAfter = playerHand.filter(card => card.rank !== desired);
    for (const card of chefGain) chefHand.push(card);
    const chefDrew = chefGain.length === 0 && takeStock(chefHand, stockNow);
    s = collectSets({
      ...s, player: playerAfter, chef: chefHand, stock: stockNow, lastChefRequest: desired,
      lastMessage: s.lastMessage + (chefGain.length
        ? ` The house chef asked for ${desired} and took ${chefGain.length} ${chefGain.length === 1 ? "card" : "cards"}.`
        : chefDrew ? ` The house chef asked for ${desired} and drew a card.` : ` The house chef asked for ${desired}; no match and no cards remained to draw.`),
    });
  } else {
    s = collectSets({ ...s, player: playerHand, chef: chefHand, stock: stockNow });
  }
  if (!s.winner && s.player.length === 0 && s.stock.length > 0) {
    const hand: GoDishCard[] = [];
    const remaining = [...s.stock];
    takeStock(hand, remaining);
    s = { ...s, player: hand, stock: remaining };
  }
  if (!s.winner && s.stock.length === 0 && (s.player.length === 0 || s.chef.length === 0)) {
    const winner: GoDishWinner = s.playerSets.length === s.chefSets.length ? "draw" :
      s.playerSets.length > s.chefSets.length ? "player" : "chef";
    s = { ...s, winner, lastMessage: "The draw pile is empty; round over." };
  }
  // A bounded round prevents repeated exchanges from trapping the player.
  if (!s.winner && s.turns >= 60) s = { ...s, winner: s.playerSets.length === s.chefSets.length ? "draw" : s.playerSets.length > s.chefSets.length ? "player" : "chef", lastMessage: "60-turn round complete. Collected sets decide the result." };
  return s;
}
export function drawGoDishIfEmpty(state: GoDishState): GoDishState {
  if (state.winner || state.player.length > 0) return state;
  const stock = [...state.stock], player: GoDishCard[] = [];
  if (!takeStock(player, stock)) return { ...state, winner: state.playerSets.length === state.chefSets.length ? "draw" : state.playerSets.length > state.chefSets.length ? "player" : "chef", lastMessage: "No cards left. Collected sets decide the result." };
  return { ...state, stock, player, lastMessage: "A new food card is ready for your next turn." };
}

export type SolitaireState = {
  cards: FullHouseCard[];
  progress: Record<FoodSuit, number>;
  mistakes: number;
  moves: number;
  hints?: number;
  message: string;
};
export function startSolitaire(random: () => number = Math.random): SolitaireState {
  const cards = shuffleDeck(CHAOS_SUITS.flatMap(suit =>
    [1, 2, 3, 4].map(rank => ({ id: `${suit}-${rank}`, suit, rank }))), random);
  return {
    cards,
    progress: { burger: 0, chicken: 0, "french-taco": 0, cake: 0 },
    mistakes: 0, moves: 0, hints: 0, message: "Build each suit from 1 to 4. Select a card to place it.",
  };
}
export function stackSolitaireCard(state: SolitaireState, cardId: string): SolitaireState {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return state;
  if (card.rank !== state.progress[card.suit] + 1) {
    return {
      ...state, moves: state.moves + 1, mistakes: state.mistakes + 1,
      message: `Place ${card.suit} number ${state.progress[card.suit] + 1} first.`,
    };
  }
  return {
    ...state, moves: state.moves + 1,
    cards: state.cards.filter(c => c.id !== cardId),
    progress: { ...state.progress, [card.suit]: card.rank },
    message: `Good stack! ${card.suit} is now at ${card.rank}.`,
  };
}


/** Kitchen Stacks saves contain only local puzzle state, never an account or reward. */
export const STACKS_SAVE_KEY = "mealdeck-kitchen-stacks-save-v1";
export type StacksSave = {
  version: 1;
  showReady: boolean;
  cards: FullHouseCard[];
  progress: Record<FoodSuit, number>;
  moves: number;
  mistakes: number;
  hints: number;
};
function validStackMetric(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 100_000;
}
export function parseStacksSave(raw: string | null): StacksSave | null {
  if (!raw || raw.length > 8_000) return null;
  try {
    const input = JSON.parse(raw) as Record<string, unknown> | null;
    if (!input || input["version"] !== 1 || typeof input["showReady"] !== "boolean" ||
        !validStackMetric(input["moves"]) || !validStackMetric(input["mistakes"]) || !validStackMetric(input["hints"]) ||
        !Array.isArray(input["cards"]) || !input["cards"].length || input["cards"].length > 16 ||
        !input["progress"] || typeof input["progress"] !== "object" || Array.isArray(input["progress"])) return null;
    const values = input["progress"] as Record<string, unknown>;
    const progress: Record<FoodSuit, number> = { burger: 0, chicken: 0, "french-taco": 0, cake: 0 };
    for (const suit of CHAOS_SUITS) {
      const value = values[suit];
      if (!validStackMetric(value) || value > 4) return null;
      progress[suit] = value;
    }
    const remaining = new Map<string, FullHouseCard>();
    for (const suit of CHAOS_SUITS) for (let rank = progress[suit] + 1; rank <= 4; rank++) {
      const id = `${suit}-${rank}`;
      remaining.set(id, { id, suit, rank });
    }
    const cards: FullHouseCard[] = [];
    for (const rawCard of input["cards"]) {
      if (!rawCard || typeof rawCard !== "object") return null;
      const value = rawCard as Record<string, unknown>;
      const id = value["id"];
      if (typeof id !== "string") return null;
      const card = remaining.get(id);
      if (!card || card.suit !== value["suit"] || card.rank !== value["rank"]) return null;
      cards.push(card);
      remaining.delete(id);
    }
    if (remaining.size || input["moves"] !== 16 - cards.length + input["mistakes"]) return null;
    return { version: 1, showReady: input["showReady"], cards, progress, moves: input["moves"],
      mistakes: input["mistakes"], hints: input["hints"] };
  } catch {
    return null;
  }
}
export function createStacksSave(state: SolitaireState, showReady: boolean): StacksSave | null {
  return parseStacksSave(JSON.stringify({
    version: 1, showReady, cards: state.cards, progress: state.progress,
    moves: state.moves, mistakes: state.mistakes, hints: state.hints ?? 0,
  }));
}
