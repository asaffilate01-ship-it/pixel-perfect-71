import { describe, expect, test } from "bun:test";
import {
  applyBentoHint,
  bentoConflicts,
  bentoFocusMove,
  countBentoSolutions,
  createBentoPuzzle,
  createBentoState,
  createDailyBentoPuzzle,
  enterBentoValue,
  isBentoComplete,
  undoBentoMove,
  validBentoDate,
  type BentoPuzzle,
  type BentoSize,
} from "../src/lib/bento-sudoku";

const small: BentoPuzzle = {
  size: 4,
  givens: [0, 2, 0, 4, 3, 0, 1, 0, 0, 1, 0, 3, 4, 0, 2, 0],
  solution: [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1],
};

function checkSolvedGroups(board: readonly number[], size: BentoSize) {
  const digits = Array.from({ length: size }, (_, index) => index + 1);
  const check = (values: number[]) => expect(values.sort((a, b) => a - b)).toEqual(digits);
  for (let row = 0; row < size; row += 1) {
    check(board.slice(row * size, row * size + size));
    check(Array.from({ length: size }, (_, column) => board[column * size + row]!));
  }
  for (let row = 0; row < size; row += 2) {
    for (let column = 0; column < size; column += size / 2) {
      check(
        Array.from(
          { length: size },
          (_, offset) =>
            board[(row + Math.floor(offset / (size / 2))) * size + column + (offset % (size / 2))]!,
        ),
      );
    }
  }
}

describe("Bento puzzle generation", () => {
  for (const size of [4, 6] as const) {
    test(`${size}×${size}: 100 seeds produce valid, uniquely solvable playable trays`, () => {
      const layouts = new Set<string>();
      for (let seed = 0; seed < 100; seed += 1) {
        const puzzle = createBentoPuzzle(size, seed * 7919 + 17);
        checkSolvedGroups(puzzle.solution, size);
        expect(puzzle.givens).toHaveLength(size * size);
        expect(puzzle.givens.filter((value) => value === 0).length).toBeGreaterThanOrEqual(
          size === 4 ? 6 : 14,
        );
        expect(puzzle.givens.filter((value) => value === 0).length).toBeLessThanOrEqual(
          size === 4 ? 8 : 20,
        );
        expect(
          puzzle.givens.every((value, index) => value === 0 || value === puzzle.solution[index]),
        ).toBe(true);
        expect(countBentoSolutions(puzzle.givens, size)).toEqual({ count: 1, exhausted: false });
        expect(isBentoComplete(puzzle, puzzle.solution)).toBe(true);
        expect(isBentoComplete(puzzle, puzzle.givens)).toBe(false);
        layouts.add(puzzle.givens.join());
      }
      expect(layouts.size).toBeGreaterThan(80);
    });

    test(`${size}×${size}: seed and UTC date reproduce exactly`, () => {
      expect(createBentoPuzzle(size, 123456)).toEqual(createBentoPuzzle(size, 123456));
      expect(createDailyBentoPuzzle(size, "2026-11-07")).toEqual(
        createDailyBentoPuzzle(size, "2026-11-07"),
      );
      expect(createDailyBentoPuzzle(size, "2026-11-07").givens).not.toEqual(
        createDailyBentoPuzzle(size, "2026-11-08").givens,
      );
    });
  }

  test("accepts real UTC calendar dates and rejects rollover or ambiguous input", () => {
    for (const date of ["2024-02-29", "2026-11-07", "2026-12-31"])
      expect(validBentoDate(date)).toBe(true);
    for (const date of [
      "2026-02-29",
      "2026-04-31",
      "2026-13-01",
      "2026-1-01",
      "07/11/2026",
      "2026-11-07T00:00:00Z",
      "",
    ]) {
      expect(validBentoDate(date)).toBe(false);
      expect(() => createDailyBentoPuzzle(4, date)).toThrow(RangeError);
    }
    expect(() => createBentoPuzzle(5 as BentoSize, 1)).toThrow(RangeError);
    expect(() => createBentoPuzzle(4, Number.NaN)).toThrow(RangeError);
  });
});

describe("bounded solution counter", () => {
  test("counts a known unique puzzle without mutating it", () => {
    const frozen = Object.freeze([...small.givens]);
    expect(countBentoSolutions(frozen, 4)).toEqual({ count: 1, exhausted: false });
    expect(frozen).toEqual(small.givens);
    expect(countBentoSolutions(small.solution, 4)).toEqual({ count: 1, exhausted: false });
  });

  test("stops after finding two solutions, including on an empty six-square tray", () => {
    for (const size of [4, 6] as const) {
      expect(countBentoSolutions(Array<number>(size * size).fill(0), size)).toEqual({
        count: 2,
        exhausted: false,
      });
    }
  });

  test("never mistakes an exhausted search for a unique puzzle", () => {
    expect(countBentoSolutions(small.givens, 4, { nodeBudget: 1 })).toEqual({
      count: 0,
      exhausted: true,
    });
    expect(countBentoSolutions(small.solution, 4, { nodeBudget: 0 })).toEqual({
      count: 0,
      exhausted: true,
    });
    expect(countBentoSolutions(small.givens, 4, { nodeBudget: Number.NaN })).toEqual({
      count: 0,
      exhausted: true,
    });
  });

  test("rejects row, column and box contradictions and malformed values", () => {
    for (const second of [3, 12, 5]) {
      const board = Array<number>(16).fill(0);
      board[0] = 1;
      board[second] = 1;
      expect(countBentoSolutions(board, 4)).toEqual({ count: 0, exhausted: false });
    }
    for (const value of [-1, 5, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const board = [...small.givens];
      board[0] = value;
      expect(countBentoSolutions(board, 4)).toEqual({ count: 0, exhausted: false });
    }
    expect(countBentoSolutions([0], 4)).toEqual({ count: 0, exhausted: false });
  });
});

describe("Bento entries, hints and completion", () => {
  test("copies clues and makes immutable, undoable entries and erasures", () => {
    const state = createBentoState(small);
    expect(state.board).not.toBe(small.givens);
    const entered = enterBentoValue(small, state, 0, 1);
    expect(entered.board[0]).toBe(1);
    expect(state.board[0]).toBe(0);
    expect(entered.moves).toBe(1);
    expect(entered.history).toEqual([state.board]);
    const erased = enterBentoValue(small, entered, 0, 0);
    expect(erased.board[0]).toBe(0);
    expect(entered.board[0]).toBe(1);
    expect(erased.moves).toBe(2);
    const undone = undoBentoMove(erased);
    expect(undone.board).toEqual(entered.board);
    expect(undone.moves).toBe(2);
    expect(undoBentoMove(undone).board).toEqual(small.givens);
    expect(undoBentoMove(state)).toBe(state);
  });

  test("fixed clues, no-op entries and invalid positions or numbers never change state", () => {
    const state = createBentoState(small);
    for (const [index, value] of [
      [1, 1],
      [1, 0],
      [0, 0],
      [-1, 1],
      [16, 1],
      [0.5, 1],
      [Number.NaN, 1],
      [0, -1],
      [0, 5],
      [0, 1.5],
      [0, Number.NaN],
    ]) {
      expect(enterBentoValue(small, state, index!, value!)).toBe(state);
    }
  });

  test("allows mistakes to be edited and marks all participating repeated numbers", () => {
    const state = enterBentoValue(small, createBentoState(small), 0, 2);
    expect(state.board[0]).toBe(2);
    expect(bentoConflicts(state.board, 4)).toEqual(new Set([0, 1]));
    expect(isBentoComplete(small, state.board)).toBe(false);
    expect(bentoConflicts(enterBentoValue(small, state, 0, 1).board, 4).size).toBe(0);
    for (const second of [3, 12, 5]) {
      const board = Array<number>(16).fill(0);
      board[0] = 1;
      board[second] = 1;
      expect(bentoConflicts(board, 4)).toEqual(new Set([0, second]));
    }
  });

  test("a hint fixes a selected mistake, remains counted after Undo and never edits a clue", () => {
    const mistaken = enterBentoValue(small, createBentoState(small), 0, 2);
    const hinted = applyBentoHint(small, mistaken, 0);
    expect(hinted.board[0]).toBe(1);
    expect(hinted.moves).toBe(2);
    expect(hinted.hints).toBe(1);
    expect(mistaken.board[0]).toBe(2);
    const undone = undoBentoMove(hinted);
    expect(undone.board[0]).toBe(2);
    expect(undone.hints).toBe(1);
    expect(undone.moves).toBe(2);
    const fixedSelected = applyBentoHint(small, createBentoState(small), 1);
    expect(fixedSelected.board[1]).toBe(2);
    expect(fixedSelected.board[0]).toBe(1);
    expect(fixedSelected.hints).toBe(1);
  });

  test("completion requires all groups and all original clues; solved hints are no-ops", () => {
    let state = createBentoState(small);
    for (let index = 0; index < 16; index += 1) {
      state = enterBentoValue(small, state, index, small.solution[index]!);
    }
    expect(isBentoComplete(small, state.board)).toBe(true);
    expect(state.moves).toBe(8);
    expect(applyBentoHint(small, state, 0)).toBe(state);
    expect(isBentoComplete(small, state.board.slice(1))).toBe(false);
    expect(
      isBentoComplete(
        small,
        state.board.map((value) => (value === 1 ? 2 : value === 2 ? 1 : value)),
      ),
    ).toBe(false);
    expect(isBentoComplete(small, Array<number>(16).fill(1))).toBe(false);
    expect(isBentoComplete(small, undoBentoMove(state).board)).toBe(false);
  });

  test("hints can finish either tray without retries or changing the puzzle", () => {
    for (const size of [4, 6] as const) {
      const puzzle = createBentoPuzzle(size, 20261107);
      const original = [...puzzle.givens];
      let state = createBentoState(puzzle);
      const blanks = state.board.filter((value) => value === 0).length;
      for (let turn = 0; turn < blanks; turn += 1) state = applyBentoHint(puzzle, state, -1);
      expect(isBentoComplete(puzzle, state.board)).toBe(true);
      expect(state.hints).toBe(blanks);
      expect(state.moves).toBe(blanks);
      expect(puzzle.givens).toEqual(original);
      expect(applyBentoHint(puzzle, state, -1)).toBe(state);
    }
  });
});

describe("keyboard grid navigation", () => {
  test("arrows clamp to the tray and never wrap across rows", () => {
    for (const size of [4, 6] as const) {
      expect(bentoFocusMove(0, "ArrowLeft", size)).toBe(0);
      expect(bentoFocusMove(0, "ArrowUp", size)).toBe(0);
      expect(bentoFocusMove(size - 1, "ArrowRight", size)).toBe(size - 1);
      expect(bentoFocusMove(size * size - 1, "ArrowDown", size)).toBe(size * size - 1);
      expect(bentoFocusMove(0, "ArrowDown", size)).toBe(size);
      expect(bentoFocusMove(size + 1, "Home", size)).toBe(size);
      expect(bentoFocusMove(size + 1, "End", size)).toBe(size * 2 - 1);
      expect(bentoFocusMove(0, "Enter", size)).toBeNull();
    }
  });
});
