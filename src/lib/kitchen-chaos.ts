/**
 * MealDeck Kitchen Chaos — original, prize-free card game rules.
 * No entry fee, stakes, loyalty points, voucher issuance or monetary prizes.
 * Fully local: no customer data or game outcomes are sent to payment APIs.
 */
export type FoodSuit = "burger" | "chicken" | "french-taco" | "cake";
export const CHAOS_SUITS: readonly FoodSuit[] = ["burger", "chicken", "french-taco", "cake"];
export const CHAOS_SUIT_NAMES: Record<FoodSuit, string> = {
  burger: "Burger", chicken: "Chicken", "french-taco": "French Taco", cake: "Cake",
};
export const CHAOS_COLOURS: Record<FoodSuit, string> = {
  burger: "#A76537", chicken: "#C8202E", "french-taco": "#EE831C", cake: "#78368E",
};
export type ChaosAction = "number" | "rush" | "pause" | "chef-choice";
export type ChaosCard = {
  id: string;
  suit: FoodSuit | "wild";
  value: number | "rush" | "pause" | "chef-choice";
  action: ChaosAction;
};
export const CHAOS_DIFFICULTIES = ["relaxed", "classic", "expert"] as const;
export type ChaosDifficulty = (typeof CHAOS_DIFFICULTIES)[number];
export const CHAOS_TURN_LIMIT = 120;
export type ChaosWinner = "player" | "chef" | "draw" | null;
export type ChaosState = {
  player: ChaosCard[];
  chef: ChaosCard[];
  stock: ChaosCard[];
  played: ChaosCard[];
  activeSuit: FoodSuit;
  winner: ChaosWinner;
  turns: number;
  difficulty?: ChaosDifficulty;
  message: string;
};

export function shuffleDeck<T>(input: readonly T[], random: () => number = Math.random): T[] {
  const cards = [...input];
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const sample = random();
    const j = Math.min(i, Math.max(0, Math.floor((Number.isFinite(sample) ? sample : 0) * (i + 1))));
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  return cards;
}

export function createChaosDeck(): ChaosCard[] {
  const cards: ChaosCard[] = [];
  for (const suit of CHAOS_SUITS) {
    for (let value = 1; value <= 6; value += 1)
      cards.push({ id: `${suit}-${value}`, suit, value, action: "number" });
    for (const action of ["rush", "pause"] as const)
      cards.push({ id: `${suit}-${action}`, suit, value: action, action });
  }
  for (let n = 0; n < 4; n += 1)
    cards.push({ id: `wild-${n}`, suit: "wild", value: "chef-choice", action: "chef-choice" });
  return cards;
}
export function startChaos(random: () => number = Math.random, difficulty: ChaosDifficulty = "classic"): ChaosState {
  const deck = shuffleDeck(createChaosDeck(), random);
  const player = deck.splice(0, 5);
  const chef = deck.splice(0, 5);
  const first = deck.findIndex(card => card.action === "number");
  const [starter] = deck.splice(first, 1);
  if (!starter || starter.suit === "wild") throw new Error("No valid starter");
  return {
    player, chef, stock: deck, played: [starter],
    activeSuit: starter.suit, winner: null, turns: 0,
    difficulty: CHAOS_DIFFICULTIES.includes(difficulty) ? difficulty : "classic",
    message: "Match the colour or number. Chef's Choice can change the food suit.",
  };
}
export function canPlayChaos(card: ChaosCard, state: ChaosState): boolean {
  if (state.winner !== null) return false;
  const top = state.played[state.played.length - 1];
  return matchesChaosCard(card, top, state.activeSuit);
}
function matchesChaosCard(card: ChaosCard, top: ChaosCard | undefined, activeSuit: FoodSuit): boolean {
  return card.suit === "wild" || card.suit === activeSuit || (top !== undefined && card.value === top.value);
}

export type ChaosAdvice = { cardId: string; declaredSuit: FoodSuit; reason: string };
/** Only the acting hand, public top/food and opponent hand count are used. */
export function chooseChaosMove(
  hand: readonly ChaosCard[],
  top: ChaosCard | undefined,
  activeSuit: FoodSuit,
  difficulty: ChaosDifficulty = "classic",
  opponentCount = 5,
): ChaosAdvice | null {
  const legal = hand.filter(card => matchesChaosCard(card, top, activeSuit));
  let best: ChaosAdvice | null = null;
  let bestScore = -Infinity;
  for (const card of legal) {
    const remaining = hand.filter(item => item.id !== card.id);
    const suit = card.suit === "wild" ? preferredSuit(remaining, activeSuit) : card.suit;
    const follow = remaining.filter(item => matchesChaosCard(item, card, suit)).length;
    const same = remaining.filter(item => item.suit === suit).length;
    const action = card.action === "rush" ? 14 : card.action === "pause" ? 10 : 0;
    const score = difficulty === "relaxed" ? 0 : remaining.length === 0 ? 1000 :
      difficulty === "classic" ? action + same * 2 + follow - (card.suit === "wild" ? 6 : 0) :
      action + same * 4 + follow * 3 + (opponentCount <= 2 && card.action === "rush" ? 24 : 0) +
      (card.action === "pause" && follow > 0 ? 10 : 0) - (card.suit === "wild" && remaining.length > 2 ? 7 : 0);
    if (score <= bestScore) continue;
    bestScore = score;
    best = { cardId: card.id, declaredSuit: suit, reason: remaining.length === 0 ? "This card empties your hand." :
      card.action === "rush" ? "Rush can add cards to the other hand and keeps your move." :
      card.action === "pause" ? "Prep Delay gives you another move." :
      card.suit === "wild" ? "Chef's Choice sets a food that suits your remaining cards." :
      follow > 0 ? "This match leaves another compatible card in your hand." : "This card legally matches the active food or top card." };
  }
  return best;
}

function finishChaosTurn(state: ChaosState): ChaosState {
  return !state.winner && state.turns >= CHAOS_TURN_LIMIT
    ? { ...state, winner: "draw", message: "Round limit reached. Neither hand was cleared; the game is a draw." }
    : state;
}

function withStock(state: ChaosState, count: number): [ChaosCard[], ChaosCard[], ChaosCard[]] {
  let stock = [...state.stock];
  let played = [...state.played];
  const collected: ChaosCard[] = [];
  for (let n = 0; n < count; n += 1) {
    if (stock.length === 0 && played.length > 1) {
      const top = played[played.length - 1]!;
      stock = played.slice(0, -1).reverse(); // stable recycling; no paid chance
      played = [top];
    }
    const card = stock.pop();
    if (card) collected.push(card);
  }
  return [collected, stock, played];
}
export function preferredSuit(hand: readonly ChaosCard[], fallback: FoodSuit = "burger"): FoodSuit {
  const counts: Record<FoodSuit, number> = { burger: 0, chicken: 0, "french-taco": 0, cake: 0 };
  for (const card of hand) if (card.suit !== "wild") counts[card.suit] += 1;
  return CHAOS_SUITS.reduce((best, suit) => counts[suit] > counts[best] ? suit : best, fallback);
}
function chefReply(state: ChaosState): ChaosState {
  if (state.winner) return state;
  let s = { ...state, player: [...state.player], chef: [...state.chef] };
  const advice = chooseChaosMove(s.chef, s.played.at(-1), s.activeSuit, s.difficulty ?? "classic", s.player.length);
  let cardIndex = advice ? s.chef.findIndex(card => card.id === advice.cardId) : -1;
  if (cardIndex < 0) {
    const [drawn, stock, played] = withStock(s, 1);
    s = { ...s, chef: [...s.chef, ...drawn], stock, played };
    cardIndex = drawn.length ? s.chef.length - 1 : -1;
    if (cardIndex < 0 || !canPlayChaos(s.chef[cardIndex]!, s))
      return { ...s, message: "The house chef took a card. Your turn!" };
  }
  const [playedCard] = s.chef.splice(cardIndex, 1);
  if (!playedCard) return s;
  s.played = [...s.played, playedCard];
  s.activeSuit = playedCard.suit === "wild" ? preferredSuit(s.chef, s.activeSuit) : playedCard.suit;
  if (s.chef.length === 0) return { ...s, winner: "chef", message: "House chef finished their cards. Try another round!" };
  if (playedCard.action === "rush") {
    const [drawn, stock, played] = withStock(s, 2);
    s = { ...s, player: [...s.player, ...drawn], stock, played };
    return { ...s, message: `Rush Order! The house chef added ${drawn.length} ${drawn.length === 1 ? "card" : "cards"} to your hand.` };
  }
  if (playedCard.action === "pause") {
    const [drawn, stock, played] = withStock(s, 1);
    s = { ...s, player: [...s.player, ...drawn], stock, played };
    return { ...s, message: `Prep Delay! You received ${drawn.length} extra ${drawn.length === 1 ? "card" : "cards"}.` };
  }
  return { ...s, message: `House chef played ${playedCard.suit === "wild" ? "Chef's Choice" : CHAOS_SUIT_NAMES[s.activeSuit]}. Your move!` };
}
export function playChaos(state: ChaosState, cardId: string, declaredSuit?: FoodSuit): ChaosState {
  if (state.winner) return state;
  const index = state.player.findIndex(card => card.id === cardId);
  const card = state.player[index];
  if (!card || !canPlayChaos(card, state)) return { ...state, message: "Match the active food suit or number to play that card." };
  if (card.suit === "wild" && (!declaredSuit || !CHAOS_SUITS.includes(declaredSuit)))
    return { ...state, message: "Choose a food suit for Chef's Choice first." };
  const player = state.player.filter(c => c.id !== cardId);
  const next: ChaosState = {
    ...state, player,
    played: [...state.played, card],
    activeSuit: card.suit === "wild" ? declaredSuit! : card.suit,
    turns: state.turns + 1,
    message: "",
  };
  if (player.length === 0) return { ...next, winner: "player", message: "Kitchen complete! You finished your cards." };
  if (card.action === "rush") {
    const [drawn, stock, played] = withStock(next, 2);
    return finishChaosTurn({ ...next, chef: [...next.chef, ...drawn], stock, played, message: `Rush Order! House chef takes ${drawn.length} ${drawn.length === 1 ? "card" : "cards"}. Play again.` });
  }
  if (card.action === "pause") return finishChaosTurn({ ...next, message: "Prep Delay! You earned another move." });
  return finishChaosTurn(chefReply(next));
}
export function drawChaos(state: ChaosState): ChaosState {
  if (state.winner) return state;
  const [drawn, stock, played] = withStock(state, 1);
  const next: ChaosState = {
    ...state, player: [...state.player, ...drawn], stock, played,
    turns: state.turns + 1, message: "",
  };
  return finishChaosTurn(chefReply(next));
}
