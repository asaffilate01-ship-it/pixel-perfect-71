import { describe, expect, test } from "bun:test";
import {
  CHAOS_SUITS, canPlayChaos, createChaosDeck, drawChaos,
  playChaos, startChaos, type ChaosCard,
} from "../src/lib/kitchen-chaos";
import {
  askGoDish, createBrandSnapRounds, evaluateSnap, isFullHouse,
  makeFullHousePuzzle, stackSolitaireCard, startGoDish, startSolitaire,
} from "../src/lib/mealdeck-collection-games";

describe("Kitchen Chaos: free original game", () => {
  test("creates four food suits, numbers, actions and wildcard with unique identities", () => {
    const cards=createChaosDeck();
    expect(cards).toHaveLength(36);
    expect(new Set(cards.map(card=>card.id)).size).toBe(cards.length);
    for(const suit of CHAOS_SUITS) expect(cards.filter(card=>card.suit===suit)).toHaveLength(8);
    expect(cards.filter(card=>card.suit==="wild")).toHaveLength(4);
  });
  test("deals correct card counts, active suit and handles legal turns", () => {
    const state=startChaos(()=>0.19);
    expect(state.player).toHaveLength(5);
    expect(state.chef).toHaveLength(5);
    expect(state.stock).toHaveLength(25);
    expect(state.played).toHaveLength(1);
    expect(CHAOS_SUITS).toContain(state.activeSuit);
    const playable=state.player.find(card=>canPlayChaos(card,state));
    const next=playable
      ? playChaos(state,playable.id,"burger")
      : drawChaos(state);
    expect(next.turns).toBe(1);
    expect(next.message.length).toBeGreaterThan(0);
    expect(next.winner===null||next.winner==="chef"||next.winner==="player").toBe(true);
  });
  test("cannot play unrelated colours and wild requires chosen colour", () => {
    const base=startChaos(()=>0.43);
    const wild:ChaosCard={id:"manual-wild",suit:"wild",value:"chef-choice",action:"chef-choice"};
    const state={...base,player:[wild,...base.player]};
    expect(playChaos(state,wild.id).turns).toBe(state.turns);
    expect(playChaos(state,wild.id,"cake").turns).toBe(state.turns+1);
  });
});
describe("Brand Snap: source brand pairs", () => {
  test("generates a balanced play sequence of matches and non-matches",()=>{
    const rounds=createBrandSnapRounds(["skorch","taconelle","paratique","vyta"],12,()=>0.4);
    expect(rounds).toHaveLength(12);
    expect(rounds.filter(round=>round.match)).toHaveLength(6);
    expect(rounds.filter(round=>!round.match)).toHaveLength(6);
    for(const round of rounds){
      expect(round.match).toBe(round.left===round.right);
      expect(evaluateSnap(round,round.match)).toBe(true);
      expect(evaluateSnap(round,!round.match)).toBe(false);
    }
  });
  test("requires distinct brands",()=>expect(()=>createBrandSnapRounds(["skorch","skorch"])).toThrow());
});
describe("Full House: guaranteed-solvable set puzzle",()=>{
  test("always includes a winning three-plus-two combination",()=>{
    for(let n=0;n<15;n++){
      const cards=makeFullHousePuzzle(()=>n/15);
      expect(cards).toHaveLength(9);
      expect(new Set(cards.map(card=>card.id)).size).toBe(9);
      const bySuit=CHAOS_SUITS.map(suit=>cards.filter(card=>card.suit===suit));
      const winner=[...bySuit[0]!.slice(0,3),...bySuit[1]!.slice(0,2)];
      expect(isFullHouse(winner)).toBe(true);
      expect(isFullHouse(winner.slice(0,4))).toBe(false);
      expect(isFullHouse([...winner.slice(0,4),winner[0]!])).toBe(false);
    }
  });
});
describe("Go Dish: food-set collecting",()=>{
  test("deals valid unique cards and accepts asking for a rank in hand",()=>{
    const state=startGoDish(()=>0.32);
    expect(state.player).toHaveLength(4);
    expect(state.chef).toHaveLength(4);
    expect(state.stock).toHaveLength(4);
    expect(new Set([...state.player,...state.chef,...state.stock].map(card=>card.id)).size).toBe(12);
    const rank=state.player[0]!.rank;
    const next=askGoDish(state,rank);
    expect(next.turns).toBe(1);
    expect(next.lastMessage.length).toBeGreaterThan(0);
  });
});
describe("Kitchen Stacks: solvable sorting",()=>{
  test("allows four food suits in rank order, rejects premature placement",()=>{
    let state=startSolitaire(()=>0.3);
    const first=state.cards.find(c=>c.rank===4)!;
    state=stackSolitaireCard(state,first.id);
    expect(state.mistakes).toBe(1);
    expect(state.cards).toHaveLength(16);
    for(const suit of CHAOS_SUITS) for(let rank=1;rank<=4;rank++){
      const card=state.cards.find(c=>c.suit===suit&&c.rank===rank)!;
      state=stackSolitaireCard(state,card.id);
    }
    expect(state.cards).toHaveLength(0);
    expect(state.moves).toBe(17);
    expect(state.mistakes).toBe(1);
    expect(Object.values(state.progress)).toEqual([4,4,4,4]);
  });
});
