import { describe, expect, test } from "bun:test";
import {
  CHAOS_SUITS, canPlayChaos, createChaosDeck, drawChaos,
  playChaos, startChaos, chooseChaosMove, CHAOS_DIFFICULTIES, CHAOS_TURN_LIMIT, type ChaosCard,
} from "../src/lib/kitchen-chaos";
import {
  askGoDish, drawGoDishIfEmpty, createBrandSnapRounds, evaluateSnap, isFullHouse,
  makeFullHousePuzzle, stackSolitaireCard, startGoDish, startSolitaire,
  createSnapSession, answerSnap, advanceSnap, snapStatistics, SNAP_LENGTHS,
  chooseGoDishRank, GO_DISH_DIFFICULTIES, suggestFullHouseCard, toggleFullHouseSelection,
  createStacksSave, parseStacksSave,
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
      const three=bySuit.find(group=>group.length===3)!;
      const two=bySuit.find(group=>group.length===2)!;
      const winner=[...three,...two.slice(0,2)];
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

describe("Go Dish round completion", () => {
  test("a repeated exchange cannot exceed the 60-turn round limit", () => {
    for (let seed = 1; seed <= 100; seed++) {
      let value = seed;
      const random = () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
      let state = startGoDish(random);
      for (let turn = 0; turn < 65 && !state.winner; turn++) {
        state = state.player.length
          ? askGoDish(state, state.player[turn % state.player.length]!.rank)
          : drawGoDishIfEmpty(state);
      }
      expect(state.winner).not.toBeNull();
      expect(state.turns).toBeLessThanOrEqual(60);
      expect(new Set([...state.player, ...state.chef, ...state.stock].map(c => c.id)).size +
        4 * (state.playerSets.length + state.chefSets.length)).toBe(12);
    }
  });
});


describe("Kitchen Chaos tactical opponent and finite rounds", () => {
  test("all difficulty policies choose legal cards and do not mutate the hand", () => {
    for (const difficulty of CHAOS_DIFFICULTIES) {
      const state = startChaos(() => 0.19, difficulty);
      const before = JSON.stringify(state.chef);
      const advice = chooseChaosMove(state.chef, state.played.at(-1), state.activeSuit, difficulty, state.player.length);
      if (advice) {
        const card = state.chef.find(item => item.id === advice.cardId)!;
        expect(canPlayChaos(card, state)).toBe(true);
        expect(CHAOS_SUITS).toContain(advice.declaredSuit);
      } else expect(state.chef.some(card => canPlayChaos(card, state))).toBe(false);
      expect(JSON.stringify(state.chef)).toBe(before);
    }
  });
  test("expert prioritises a rush against an opponent with one card", () => {
    const hand = createChaosDeck().filter(card => ["burger-1", "burger-rush", "cake-2"].includes(card.id));
    const top = createChaosDeck().find(card => card.id === "burger-2")!;
    expect(chooseChaosMove(hand, top, "burger", "expert", 1)?.cardId).toBe("burger-rush");
    expect(chooseChaosMove(hand, top, "burger", "relaxed", 1)?.cardId).toBe("burger-1");
  });
  test("120 seeded rounds conserve every card and respect the turn bound", () => {
    for (const difficulty of CHAOS_DIFFICULTIES) for (let seed = 1; seed <= 40; seed++) {
      let value = seed;
      const random = () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
      let state = startChaos(random, difficulty);
      for (let i = 0; i < CHAOS_TURN_LIMIT && !state.winner; i++) {
        const hint = chooseChaosMove(state.player, state.played.at(-1), state.activeSuit, "expert", state.chef.length);
        const previous = state;
        state = hint ? playChaos(state, hint.cardId, hint.declaredSuit) : drawChaos(state);
        expect(state.turns).toBe(previous.turns + 1);
        const all = [...state.player, ...state.chef, ...state.stock, ...state.played];
        expect(all.length).toBe(36);
        expect(new Set(all.map(card => card.id)).size).toBe(36);
      }
      expect(state.winner).not.toBeNull();
      expect(state.turns).toBeLessThanOrEqual(CHAOS_TURN_LIMIT);
      expect(drawChaos(state)).toBe(state);
    }
  });
});

describe("Brand Snap quiz and answer integrity", () => {
  test("every supported length is balanced and uses only known brands", () => {
    for (const length of SNAP_LENGTHS) {
      const rounds = createBrandSnapRounds(["a", "b", "c"], length, () => 0.4);
      expect(rounds.length).toBe(length);
      expect(rounds.filter(round => round.match).length).toBe(length / 2);
      expect(rounds.every(round => ["a", "b", "c"].includes(round.left) && ["a", "b", "c"].includes(round.right))).toBe(true);
    }
    expect(() => createBrandSnapRounds(["a", "b"], Infinity)).toThrow();
    expect(createBrandSnapRounds(["a", "b"], 6, () => Number.NaN).length).toBe(6);
  });
  test("repeated and stale events cannot score twice or skip questions", () => {
    const rounds = [{ left: "a", right: "a", match: true }, { left: "a", right: "b", match: false }, { left: "b", right: "b", match: true }];
    let session = createSnapSession(rounds);
    expect(advanceSnap(session, 0)).toBe(session);
    session = answerSnap(session, 0, true);
    expect(answerSnap(session, 0, true)).toBe(session);
    session = advanceSnap(session, 0);
    expect(advanceSnap(session, 0)).toBe(session);
    expect(answerSnap(session, 0, true)).toBe(session);
    session = advanceSnap(answerSnap(session, 1, false), 1);
    session = advanceSnap(answerSnap(session, 2, false), 2);
    expect(session.index).toBe(3);
    expect(snapStatistics(session)).toEqual({ answered: 3, correct: 2, streak: 0, bestStreak: 2, accuracy: 67 });
    expect(advanceSnap(session, 3)).toBe(session);
  });
});


describe("Full House selection guidance", () => {
  test("following a hint always yields a valid hand while avoiding needless changes", () => {
    for (let seed = 0; seed < 20; seed++) {
      const cards = makeFullHousePuzzle(() => seed / 20);
      let selected = cards.slice(0,5).map(card => card.id);
      for (let step=0; step<10 && !isFullHouse(cards.filter(card=>selected.includes(card.id))); step++) {
        const hint=suggestFullHouseCard(cards,selected);
        expect(hint).not.toBeNull();
        selected=toggleFullHouseSelection(cards,selected,hint!.cardId);
        expect(selected.length).toBeLessThanOrEqual(5);
      }
      expect(isFullHouse(cards.filter(card=>selected.includes(card.id)))).toBe(true);
      expect(suggestFullHouseCard(cards,selected)).toBeNull();
      expect(toggleFullHouseSelection(cards,selected,"unknown")).toBe(selected);
      expect(toggleFullHouseSelection(cards,selected,cards.find(card=>!selected.includes(card.id))!.id)).toBe(selected);
    }
  });
  test("invalid selections cannot yield an invented card", () => {
    const cards=makeFullHousePuzzle(()=>0.5);
    expect(suggestFullHouseCard(cards,["unknown"])).toBeNull();
    expect(suggestFullHouseCard([],[])).toBeNull();
  });
});

describe("Go Dish public-information strategy", () => {
  test("expert favours a known public request and otherwise chooses the biggest group", () => {
    const hand=[{id:"burger-1",suit:"burger" as const,rank:1 as const},{id:"cake-2",suit:"cake" as const,rank:2 as const},{id:"chicken-2",suit:"chicken" as const,rank:2 as const}];
    expect(chooseGoDishRank(hand,"relaxed")).toBe(1);
    expect(chooseGoDishRank(hand,"classic")).toBe(2);
    expect(chooseGoDishRank(hand,"expert",1)).toBe(1);
    expect(chooseGoDishRank(hand,"expert",3)).toBe(2);
    expect(chooseGoDishRank([],"expert",1)).toBeNull();
  });
  test("all strategies preserve the deck and end seeded rounds within 60 turns", () => {
    for (const level of GO_DISH_DIFFICULTIES) for(let seed=1;seed<=30;seed++) {
      let value=seed;
      const random=()=>((value=(value*1664525+1013904223)>>>0)/4294967296);
      let state=startGoDish(random,level);
      for(let i=0;i<65&&!state.winner;i++){
        const rank=chooseGoDishRank(state.player,"expert",state.lastChefRequest??null);
        state=rank===null?drawGoDishIfEmpty(state):askGoDish(state,rank);
        const cards=[...state.player,...state.chef,...state.stock];
        expect(new Set(cards.map(card=>card.id)).size).toBe(cards.length);
        expect(cards.length+4*(state.playerSets.length+state.chefSets.length)).toBe(12);
      }
      expect(state.winner).not.toBeNull();
      expect(state.turns).toBeLessThanOrEqual(60);
    }
  });
});

describe("Kitchen Stacks validated local snapshot", () => {
  test("preserves all remaining cards, progress, mistakes, hints and marker preference", () => {
    let state=startSolitaire(()=>0.3);
    state=stackSolitaireCard(state,"burger-3");
    state=stackSolitaireCard(state,"burger-1");
    state=stackSolitaireCard(state,"burger-2");
    state={...state,hints:2};
    const saved=createStacksSave(state,false)!;
    expect(saved.moves).toBe(3);
    expect(saved.mistakes).toBe(1);
    expect(saved.cards.length).toBe(14);
    expect(saved.progress.burger).toBe(2);
    expect(saved.hints).toBe(2);
    expect(saved.showReady).toBe(false);
    expect(parseStacksSave(JSON.stringify(saved))).toEqual(saved);
    for(const patch of [
      {moves:2},{mistakes:-1},{hints:-1},{cards:saved.cards.slice(1)},
      {cards:[...saved.cards,saved.cards[0]]},{progress:{...saved.progress,burger:4}},
      {cards:saved.cards.map((card,i)=>i===0?{...card,rank:99}:card)},
    ]) expect(parseStacksSave(JSON.stringify({...saved,...patch}))).toBeNull();
    expect(parseStacksSave("invalid")).toBeNull();
  });
});

test("reusable Kitchen Stacks snapshot carries a validated local round identity",()=>{
  const state=startSolitaire(()=>0.3);
  const snapshot=createStacksSave(state,true,"round-stacks-test")!;
  expect(parseStacksSave(JSON.stringify(snapshot))?.roundId).toBe("round-stacks-test");
  expect(createStacksSave(state,true,"bad")).toBeNull();
  expect(createStacksSave(state,true)?.roundId).toBeUndefined();
});
