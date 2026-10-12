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
export type ChaosWinner = "player" | "chef" | null;
export type ChaosState = {
  player: ChaosCard[];
  chef: ChaosCard[];
  stock: ChaosCard[];
  played: ChaosCard[];
  activeSuit: FoodSuit;
  winner: ChaosWinner;
  turns: number;
  message: string;
};

export function shuffleDeck<T>(input: readonly T[], random: () => number = Math.random): T[] {
  const cards = [...input];
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
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
export function startChaos(random: () => number = Math.random): ChaosState {
  const deck = shuffleDeck(createChaosDeck(), random);
  const player = deck.splice(0, 5);
  const chef = deck.splice(0, 5);
  const first = deck.findIndex(card => card.action === "number");
  const [starter] = deck.splice(first, 1);
  if (!starter || starter.suit === "wild") throw new Error("No valid starter");
  return {
    player, chef, stock: deck, played: [starter],
    activeSuit: starter.suit, winner: null, turns: 0,
    message: "Match the colour or number. Chef's Choice can change the food suit.",
  };
}
export function canPlayChaos(card: ChaosCard, state: ChaosState): boolean {
  if (state.winner !== null) return false;
  const top = state.played[state.played.length - 1];
  return card.suit === "wild" || card.suit === state.activeSuit || (top !== undefined && card.value === top.value);
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
  let cardIndex = s.chef.findIndex(card => canPlayChaos(card, s));
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
    return { ...s, message: "Rush Order! The house chef added two cards to your hand." };
  }
  if (playedCard.action === "pause") {
    const [drawn, stock, played] = withStock(s, 1);
    s = { ...s, player: [...s.player, ...drawn], stock, played };
    return { ...s, message: "Prep Delay! You've received one extra card." };
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
    return { ...next, chef: [...next.chef, ...drawn], stock, played, message: "Rush Order! House chef takes two cards. Play again." };
  }
  if (card.action === "pause") return { ...next, message: "Prep Delay! You earned another move." };
  return chefReply(next);
}
export function drawChaos(state: ChaosState): ChaosState {
  if (state.winner) return state;
  const [drawn, stock, played] = withStock(state, 1);
  const next: ChaosState = {
    ...state, player: [...state.player, ...drawn], stock, played,
    turns: state.turns + 1, message: "",
  };
  return chefReply(next);
}
