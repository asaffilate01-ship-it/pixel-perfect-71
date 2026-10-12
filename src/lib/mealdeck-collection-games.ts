/** Standalone, free-to-play MealDeck card puzzles. No payments, prizes or redeemable points. */
import { CHAOS_SUITS, shuffleDeck, type FoodSuit } from "./kitchen-chaos";

export type BrandSnapRound = { left: string; right: string; match: boolean };
export function createBrandSnapRounds(
  brandIds: readonly string[], count = 12, random: () => number = Math.random,
): BrandSnapRound[] {
  if (new Set(brandIds).size < 2) throw new Error("Brand Snap requires two distinct brands");
  const ids = [...new Set(brandIds)];
  const rounds: BrandSnapRound[] = [];
  for (let n = 0; n < count; n += 1) {
    const leftIndex = Math.floor(random() * ids.length) % ids.length;
    const left = ids[leftIndex]!;
    const match = n % 2 === 0;
    const otherIndex = (leftIndex + 1 + (Math.floor(random() * (ids.length - 1)) % (ids.length - 1))) % ids.length;
    rounds.push({ left, right: match ? left : ids[otherIndex]!, match });
  }
  return shuffleDeck(rounds, random);
}
export function evaluateSnap(round: BrandSnapRound, calledSnap: boolean): boolean {
  return round.match === calledSnap;
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

export type GoDishRank = 1 | 2 | 3;
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
};
const RANKS: readonly GoDishRank[] = [1, 2, 3];
export function startGoDish(random: () => number = Math.random): GoDishState {
  const cards = shuffleDeck(CHAOS_SUITS.flatMap(suit => RANKS.map(rank => ({
    id: `${suit}-${rank}`, suit, rank,
  }))), random);
  return {
    player: cards.splice(0, 4), chef: cards.splice(0, 4), stock: cards,
    playerSets: [], chefSets: [], lastMessage: "Ask the house chef for a number shown in your hand.",
    turns: 0, winner: null,
  };
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
    lastMessage: received.length
      ? `House chef handed over ${received.length} matching card(s).`
      : didDraw ? "Go Dish! You drew a card." : "No match, and the deck is empty.",
  });
  if (s.winner) return s;
  const chefHand = [...s.chef], playerHand = [...s.player], stockNow = [...s.stock];
  if (chefHand.length === 0) takeStock(chefHand, stockNow);
  if (playerHand.length === 0) takeStock(playerHand, stockNow);
  if (chefHand.length > 0) {
    const desired = chefHand[0]!.rank;
    const chefGain = playerHand.filter(card => card.rank === desired);
    const playerAfter = playerHand.filter(card => card.rank !== desired);
    for (const card of chefGain) chefHand.push(card);
    if (chefGain.length === 0) takeStock(chefHand, stockNow);
    s = collectSets({
      ...s, player: playerAfter, chef: chefHand, stock: stockNow,
      lastMessage: s.lastMessage + (chefGain.length
        ? ` The house chef asked for ${desired} and took ${chefGain.length} card(s).`
        : ` The house chef asked for ${desired} and drew a card.`),
    });
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
  return s;
}
export function drawGoDishIfEmpty(state: GoDishState): GoDishState {
  if (state.winner || state.player.length > 0) return state;
  const stock = [...state.stock], player: GoDishCard[] = [];
  if (!takeStock(player, stock)) return { ...state, lastMessage: "No cards left to draw." };
  return { ...state, stock, player, lastMessage: "A new food card is ready for your next turn." };
}

export type SolitaireState = {
  cards: FullHouseCard[];
  progress: Record<FoodSuit, number>;
  mistakes: number;
  moves: number;
  message: string;
};
export function startSolitaire(random: () => number = Math.random): SolitaireState {
  const cards = shuffleDeck(CHAOS_SUITS.flatMap(suit =>
    [1, 2, 3, 4].map(rank => ({ id: `${suit}-${rank}`, suit, rank }))), random);
  return {
    cards,
    progress: { burger: 0, chicken: 0, "french-taco": 0, cake: 0 },
    mistakes: 0, moves: 0, message: "Build each suit from 1 to 4. Select a card to place it.",
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
