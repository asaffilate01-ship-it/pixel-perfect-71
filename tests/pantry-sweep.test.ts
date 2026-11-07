import { describe, expect, test } from "bun:test";
import {
  PANTRY_LEVELS,
  createPantryState,
  generatePantryBoard,
  pantryCellView,
  pantryFlagsLeft,
  pantryFocusMove,
  pantryIsOver,
  pantryNeighbours,
  pantrySafeOpened,
  revealPantryCell,
  togglePantryFlag,
  type PantryLevel,
  type PantrySize,
  type PantryState,
} from "../src/lib/pantry-sweep";

function independentCount(chillies: readonly boolean[], index: number, size: number): number {
  return chillies.reduce(
    (count, chilli, other) =>
      count +
      Number(
        chilli &&
          other !== index &&
          Math.abs(Math.floor(other / size) - Math.floor(index / size)) <= 1 &&
          Math.abs((other % size) - (index % size)) <= 1,
      ),
    0,
  );
}

/** Four chillies down the right edge; the bottom-right safe square needs its own reveal. */
function edgePantry(): PantryState {
  const state = createPantryState("gentle");
  const chillies = Array.from({ length: 25 }, (_, index) => [4, 9, 14, 19].includes(index));
  return {
    ...state,
    status: "playing",
    seed: 7,
    board: { chillies, adjacent: chillies.map((_, index) => independentCount(chillies, index, 5)) },
  };
}

function freeze(state: PantryState): PantryState {
  Object.freeze(state.opened);
  Object.freeze(state.flagged);
  if (state.board) {
    Object.freeze(state.board.chillies);
    Object.freeze(state.board.adjacent);
    Object.freeze(state.board);
  }
  return Object.freeze(state);
}

describe("Pantry Sweep generation and first-reveal safety", () => {
  test("Start has the correct size and no hidden board or seed yet", () => {
    for (const level of ["gentle", "bigger"] as const) {
      const state = createPantryState(level);
      const expected = PANTRY_LEVELS[level];
      expect(state.size).toBe(expected.size);
      expect(state.chilliCount).toBe(expected.chillies);
      expect(state.opened).toHaveLength(expected.size ** 2);
      expect(state.opened.every((value) => !value)).toBe(true);
      expect(state.flagged.every((value) => !value)).toBe(true);
      expect(state.board).toBeNull();
      expect(state.seed).toBeNull();
      expect(state.status).toBe("ready");
      expect(state.actions).toBe(0);
    }
    expect(() => createPantryState("unknown" as PantryLevel)).toThrow(RangeError);
  });

  test("neighbours include diagonals without wrapping between rows", () => {
    expect(pantryNeighbours(0, 5)).toEqual([1, 5, 6]);
    expect(pantryNeighbours(4, 5)).toEqual([3, 8, 9]);
    expect(pantryNeighbours(5, 5)).toEqual([0, 1, 6, 10, 11]);
    expect(pantryNeighbours(12, 5)).toEqual([6, 7, 8, 11, 13, 16, 17, 18]);
    expect(pantryNeighbours(24, 5)).toEqual([18, 19, 23]);
    for (const size of [5, 6] as const)
      for (let index = 0; index < size * size; index++) {
        const expected = Array.from({ length: size * size }, (_, other) => other).filter(
          (other) =>
            other !== index &&
            Math.abs(Math.floor(other / size) - Math.floor(index / size)) <= 1 &&
            Math.abs((other % size) - (index % size)) <= 1,
        );
        expect(pantryNeighbours(index, size)).toEqual(expected);
      }
    for (const index of [-1, 25, 0.5, NaN, Infinity])
      expect(pantryNeighbours(index, 5)).toEqual([]);
  });

  test("every possible first square and its neighbours are safe across deterministic seeds", () => {
    for (const level of ["gentle", "bigger"] as const) {
      const { size, chillies: count } = PANTRY_LEVELS[level];
      for (const seed of [0, 1, 2, 41, 20261107, 0xffff_ffff]) {
        for (let first = 0; first < size * size; first++) {
          const board = generatePantryBoard(size, count, first, seed);
          expect(board.chillies).toHaveLength(size * size);
          expect(board.chillies.filter(Boolean)).toHaveLength(count);
          for (const protectedSquare of [first, ...pantryNeighbours(first, size)])
            expect(board.chillies[protectedSquare]).toBe(false);
          expect(board.adjacent[first]).toBe(0);
          for (let index = 0; index < size * size; index++)
            expect(board.adjacent[index]).toBe(independentCount(board.chillies, index, size));
        }
      }
    }
  });

  test("generation is repeatable, varied and bounded even for a densely filled tray", () => {
    expect(generatePantryBoard(6, 6, 21, 918)).toEqual(generatePantryBoard(6, 6, 21, 918));
    const layouts = new Set(
      Array.from({ length: 24 }, (_, seed) => generatePantryBoard(6, 6, 21, seed).chillies.join()),
    );
    expect(layouts.size).toBeGreaterThan(18);
    const dense = generatePantryBoard(5, 24, 12, 1);
    expect(dense.chillies.filter(Boolean)).toHaveLength(24);
    expect(dense.chillies[12]).toBe(false);
    expect(dense.adjacent[12]).toBe(8);
    expect(generatePantryBoard(5, 0, 12, 1).adjacent.every((value) => value === 0)).toBe(true);
  });

  test("invalid first positions, dimensions, chilli counts and seeds are rejected", () => {
    for (const first of [-1, 25, 1.5, NaN, Infinity])
      expect(() => generatePantryBoard(5, 4, first, 1)).toThrow(RangeError);
    for (const count of [-1, 25, 1.5, NaN, Infinity])
      expect(() => generatePantryBoard(5, count, 0, 1)).toThrow(RangeError);
    for (const seed of [-1, 0x1_0000_0000, 1.5, NaN, Infinity])
      expect(() => generatePantryBoard(5, 4, 0, seed)).toThrow(RangeError);
    expect(() => generatePantryBoard(4 as PantrySize, 4, 0, 1)).toThrow(RangeError);
  });
});

describe("Pantry Sweep reveals, flags and exact outcomes", () => {
  test("invalid or flagged reveals do not generate a board or consume an action", () => {
    const start = freeze(createPantryState("gentle"));
    for (const index of [-1, 25, 0.5, NaN, Infinity]) {
      expect(revealPantryCell(start, index, 1)).toBe(start);
      expect(togglePantryFlag(start, index)).toBe(start);
    }
    for (const seed of [-1, NaN, Infinity, 0x1_0000_0000])
      expect(revealPantryCell(start, 0, seed)).toBe(start);
    const flagged = freeze(togglePantryFlag(start, 0));
    expect(flagged.actions).toBe(1);
    expect(flagged.board).toBeNull();
    expect(revealPantryCell(flagged, 0, 1)).toBe(flagged);
    const opened = revealPantryCell(togglePantryFlag(flagged, 0), 0, 918);
    expect(opened.seed).toBe(918);
    expect(opened.opened[0]).toBe(true);
    expect(opened.board?.adjacent[0]).toBe(0);
    expect(opened.actions).toBe(3);
  });

  test("zero flood reveals its clear region and numbered border, without revealing a distant number", () => {
    const before = freeze(edgePantry());
    const opened = revealPantryCell(before, 0);
    expect(opened.opened.filter(Boolean)).toHaveLength(20);
    expect(opened.opened[24]).toBe(false);
    for (const index of [3, 8, 13, 18, 23]) expect(opened.opened[index]).toBe(true);
    for (const index of [4, 9, 14, 19]) expect(opened.opened[index]).toBe(false);
    expect(opened.status).toBe("playing");
    expect(opened.actions).toBe(1);
    expect(opened.board).toBe(before.board);
    expect(before.opened.every((value) => !value)).toBe(true);
    expect(revealPantryCell(opened, 0)).toBe(opened);
  });

  test("a flag blocks flood opening until removed and flagging an open square is a no-op", () => {
    const flagged = freeze(togglePantryFlag(edgePantry(), 5));
    const flooded = revealPantryCell(flagged, 0);
    expect(flooded.opened[5]).toBe(false);
    expect(flooded.flagged[5]).toBe(true);
    expect(pantrySafeOpened(flooded)).toBe(19);
    expect(togglePantryFlag(flooded, 0)).toBe(flooded);
    const restored = revealPantryCell(togglePantryFlag(flooded, 5), 5);
    expect(restored.opened[5]).toBe(true);
    expect(pantrySafeOpened(restored)).toBe(20);
    expect(restored.actions).toBe(4);
    expect(revealPantryCell(restored, 24).status).toBe("won");
  });

  test("flag budgets cannot go negative and flags alone never win", () => {
    let state = edgePantry();
    for (const index of [4, 9, 14, 19]) state = togglePantryFlag(freeze(state), index);
    expect(pantryFlagsLeft(state)).toBe(0);
    expect(state.actions).toBe(4);
    expect(state.status).toBe("playing");
    expect(pantrySafeOpened(state)).toBe(0);
    expect(togglePantryFlag(state, 24)).toBe(state);
    const removed = togglePantryFlag(state, 4);
    expect(pantryFlagsLeft(removed)).toBe(1);
    expect(removed.actions).toBe(5);
    expect(pantryFlagsLeft(togglePantryFlag(removed, 24))).toBe(0);
    expect(pantryFlagsLeft({ ...state, flagged: Array<boolean>(25).fill(true) })).toBe(0);
  });

  test("the exact last safe reveal wins without requiring flags", () => {
    const nearly = revealPantryCell(edgePantry(), 0);
    expect(nearly.status).toBe("playing");
    expect(pantrySafeOpened(nearly)).toBe(20);
    const won = revealPantryCell(freeze(nearly), 24);
    expect(won.status).toBe("won");
    expect(pantrySafeOpened(won)).toBe(21);
    expect(won.flagged.filter(Boolean)).toHaveLength(0);
    expect(won.actions).toBe(2);
    expect(pantryIsOver(won)).toBe(true);
    expect(revealPantryCell(won, 4)).toBe(won);
    expect(togglePantryFlag(won, 4)).toBe(won);
    expect(nearly.opened[24]).toBe(false);
  });

  test("a revealed chilli loses immediately and terminal actions leave the state unchanged", () => {
    const before = freeze(edgePantry());
    const lost = revealPantryCell(before, 14);
    expect(lost.status).toBe("lost");
    expect(lost.hit).toBe(14);
    expect(lost.opened.filter(Boolean)).toHaveLength(1);
    expect(lost.actions).toBe(1);
    expect(pantrySafeOpened(lost)).toBe(0);
    expect(pantryIsOver(lost)).toBe(true);
    expect(before.status).toBe("playing");
    expect(before.opened[14]).toBe(false);
    expect(revealPantryCell(lost, 0)).toBe(lost);
    expect(togglePantryFlag(lost, 4)).toBe(lost);
  });

  test("complete safe play remains deterministic and never changes a generated hidden board", () => {
    for (const level of ["gentle", "bigger"] as const)
      for (let seed = 0; seed < 25; seed++) {
        const first = revealPantryCell(createPantryState(level), 0, seed);
        const hidden = first.board!;
        let state = freeze(first);
        for (let index = 0; index < state.size * state.size; index++) {
          if (!hidden.chillies[index]) state = freeze(revealPantryCell(state, index, seed + 1));
        }
        expect(state.status).toBe("won");
        expect(state.board).toBe(hidden);
        expect(state.seed).toBe(seed);
        expect(pantrySafeOpened(state)).toBe(state.size * state.size - state.chilliCount);
        expect(state.opened.every((opened, index) => !opened || !hidden.chillies[index])).toBe(
          true,
        );
      }
  });
});

describe("Pantry Sweep visible information and keyboard navigation", () => {
  test("covered and flagged projections disclose no hidden counts or chilli identities", () => {
    const state = edgePantry();
    expect(pantryCellView(state, 4)).toEqual({ kind: "covered" });
    expect(pantryCellView(state, 24)).toEqual({ kind: "covered" });
    const marked = togglePantryFlag(togglePantryFlag(state, 4), 24);
    expect(pantryCellView(marked, 4)).toEqual({ kind: "flagged" });
    expect(pantryCellView(marked, 24)).toEqual({ kind: "flagged" });
    const opened = revealPantryCell(marked, 0);
    expect(pantryCellView(opened, 0)).toEqual({ kind: "safe", adjacent: 0, misflagged: false });
    expect(pantryCellView(opened, 3)).toEqual({ kind: "safe", adjacent: 2, misflagged: false });
    expect(pantryCellView(opened, 14)).toEqual({ kind: "covered" });
    const lost = revealPantryCell(opened, 14);
    expect(pantryCellView(lost, 14)).toEqual({ kind: "chilli", hit: true, flagged: false });
    expect(pantryCellView(lost, 4)).toEqual({ kind: "chilli", hit: false, flagged: true });
    expect(pantryCellView(lost, 24)).toEqual({ kind: "safe", adjacent: 1, misflagged: true });
    expect(pantryCellView(lost, 25)).toBeNull();
  });

  test("roving focus clamps to the tray, keeps Home/End within a row and ignores action keys", () => {
    for (const size of [5, 6] as const) {
      expect(pantryFocusMove(0, "ArrowLeft", size)).toBe(0);
      expect(pantryFocusMove(0, "ArrowUp", size)).toBe(0);
      expect(pantryFocusMove(size - 1, "ArrowRight", size)).toBe(size - 1);
      expect(pantryFocusMove(size * size - 1, "ArrowDown", size)).toBe(size * size - 1);
      expect(pantryFocusMove(size + 2, "Home", size)).toBe(size);
      expect(pantryFocusMove(size + 2, "End", size)).toBe(size * 2 - 1);
      expect(pantryFocusMove(size + 2, "ArrowUp", size)).toBe(2);
      expect(pantryFocusMove(size + 2, "ArrowDown", size)).toBe(size * 2 + 2);
      for (const key of ["Enter", " ", "f", "Tab", "Escape"])
        expect(pantryFocusMove(0, key, size)).toBeNull();
      for (const index of [-1, size * size, 0.5, NaN])
        expect(pantryFocusMove(index, "ArrowRight", size)).toBeNull();
    }
  });
});
