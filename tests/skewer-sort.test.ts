import { describe, expect, test } from "bun:test";
import {
  canMoveSkewer,
  countSortedSkewers,
  createSkewerPuzzle,
  createSkewerState,
  isSkewerComplete,
  moveSkewer,
  playSkewerMove,
  skewerDestinations,
  undoSkewerMove,
  type SkewerBoard,
  type SkewerFoodCount,
  type SkewerMove,
} from "../src/lib/skewer-sort";

const inventory = (board: SkewerBoard) => board.flat().sort((a, b) => a - b);

/** Independent bounded BFS: does not use production moves, completion or certificates. */
function independentlySolve(input: SkewerBoard): { path: SkewerMove[]; explored: number } | null {
  type Node = { board: number[][]; path: SkewerMove[] };
  const signature = (board: number[][]) =>
    board
      .map((stack) => stack.join(","))
      .sort()
      .join("|");
  const board = input.map((stack) => [...stack]);
  const queue: Node[] = [{ board, path: [] }];
  const seen = new Set([signature(board)]);
  const budget = 5_000;
  for (let cursor = 0; cursor < queue.length && seen.size < budget; cursor += 1) {
    const node = queue[cursor]!;
    if (
      node.board.every(
        (stack) => stack.length === 0 || (stack.length === 3 && new Set(stack).size === 1),
      )
    ) {
      return { path: node.path, explored: seen.size };
    }
    for (let from = 0; from < node.board.length; from += 1) {
      const source = node.board[from]!;
      if (!source.length) continue;
      for (let to = 0; to < node.board.length; to += 1) {
        const target = node.board[to]!;
        if (
          from === to ||
          target.length >= 3 ||
          (target.length > 0 && target[target.length - 1] !== source[source.length - 1])
        )
          continue;
        const next = node.board.map((stack) => [...stack]);
        next[to]!.push(next[from]!.pop()!);
        const key = signature(next);
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push({ board: next, path: [...node.path, { from, to }] });
      }
    }
  }
  return null;
}

describe("solvable seeded Skewer Sort puzzles", () => {
  for (const foodCount of [3, 4] as const) {
    test(`${foodCount} foods: 100 seeds preserve inventory, two empties and legal solution certificates`, () => {
      const layouts = new Set<string>();
      for (let seed = 0; seed < 100; seed += 1) {
        const puzzle = createSkewerPuzzle(foodCount, seed * 7919 + 137);
        const original = puzzle.skewers.map((stack) => [...stack]);
        expect(puzzle.skewers).toHaveLength(foodCount + 2);
        expect(puzzle.skewers.filter((stack) => stack.length === 0)).toHaveLength(2);
        expect(puzzle.skewers.filter((stack) => stack.length === 3)).toHaveLength(foodCount);
        expect(countSortedSkewers(puzzle.skewers)).toBe(0);
        expect(isSkewerComplete(puzzle.skewers, foodCount)).toBe(false);
        expect(inventory(puzzle.skewers)).toEqual(
          Array.from({ length: foodCount }, (_, food) => [food, food, food]).flat(),
        );
        expect(puzzle.solution.length).toBeGreaterThanOrEqual(6);
        expect(puzzle.solution.length).toBeLessThanOrEqual(11);
        let board: SkewerBoard = puzzle.skewers;
        for (const { from, to } of puzzle.solution) {
          const source = board[from]!;
          const target = board[to]!;
          // Verify the rules directly, rather than trusting canMoveSkewer.
          expect(source.length).toBeGreaterThan(0);
          expect(target.length).toBeLessThan(3);
          expect(target.length === 0 || target.at(-1) === source.at(-1)).toBe(true);
          const next = moveSkewer(board, from, to);
          expect(next).not.toBe(board);
          expect(next[from]).toEqual(source.slice(0, -1));
          expect(next[to]).toEqual([...target, source.at(-1)!]);
          expect(inventory(next)).toEqual(inventory(puzzle.skewers));
          expect(next.every((stack) => stack.length <= 3)).toBe(true);
          board = next;
        }
        expect(
          board.every(
            (stack) => stack.length === 0 || (stack.length === 3 && new Set(stack).size === 1),
          ),
        ).toBe(true);
        expect(countSortedSkewers(board)).toBe(foodCount);
        expect(isSkewerComplete(board, foodCount)).toBe(true);
        expect(puzzle.skewers).toEqual(original);
        layouts.add(JSON.stringify(puzzle.skewers));
      }
      expect(layouts.size).toBeGreaterThan(70);
    });

    test(`${foodCount} foods: an independent bounded solver finds solutions across seeds`, () => {
      for (let seed = 0; seed < 24; seed += 1) {
        const puzzle = createSkewerPuzzle(foodCount, seed * 104729 + 17);
        const independentlyFound = independentlySolve(puzzle.skewers);
        expect(independentlyFound).not.toBeNull();
        expect(independentlyFound!.explored).toBeLessThan(5_000);
        expect(independentlyFound!.path.length).toBeGreaterThanOrEqual(5);
        let board = puzzle.skewers;
        for (const move of independentlyFound!.path) {
          expect(canMoveSkewer(board, move.from, move.to)).toBe(true);
          board = moveSkewer(board, move.from, move.to);
        }
        expect(isSkewerComplete(board, foodCount)).toBe(true);
      }
    });

    test(`${foodCount} foods: seeds are reproducible and returned data is not shared`, () => {
      for (const seed of [0, -1, 42, 0xffffffff, Number.MAX_SAFE_INTEGER]) {
        const first = createSkewerPuzzle(foodCount, seed);
        const second = createSkewerPuzzle(foodCount, seed);
        expect(first).toEqual(second);
        expect(first.skewers).not.toBe(second.skewers);
        expect(first.skewers[0]).not.toBe(second.skewers[0]);
        expect(first.solution).not.toBe(second.solution);
      }
    });
  }

  test("invalid generator input fails immediately", () => {
    expect(() => createSkewerPuzzle(2 as SkewerFoodCount, 1)).toThrow(RangeError);
    expect(() => createSkewerPuzzle(5 as SkewerFoodCount, 1)).toThrow(RangeError);
    expect(() => createSkewerPuzzle(3, Number.NaN)).toThrow(RangeError);
    expect(() => createSkewerPuzzle(4, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("top-food move rules", () => {
  const board: SkewerBoard = [[0, 1, 1], [2, 1], [0, 2, 0], [], [2]];

  test("moves exactly one top food to an empty or matching skewer, without mutating the board", () => {
    const frozen = Object.freeze(board.map((stack) => Object.freeze([...stack])));
    const emptyMove = moveSkewer(frozen, 0, 3);
    expect(emptyMove).toEqual([[0, 1], [2, 1], [0, 2, 0], [1], [2]]);
    expect(frozen).toEqual(board);
    const matchMove = moveSkewer(frozen, 0, 1);
    expect(matchMove).toEqual([[0, 1], [2, 1, 1], [0, 2, 0], [], [2]]);
    expect(frozen).toEqual(board);
    expect(skewerDestinations(board, 0)).toEqual([1, 3]);
  });

  test("rejects empty sources, full targets, different tops, self-moves and invalid indices", () => {
    for (const [from, to] of [
      [3, 0],
      [1, 0],
      [1, 2],
      [0, 4],
      [0, 0],
      [-1, 3],
      [0, 5],
      [0.5, 3],
      [0, Number.NaN],
      [Number.POSITIVE_INFINITY, 3],
    ]) {
      expect(canMoveSkewer(board, from!, to!)).toBe(false);
      expect(moveSkewer(board, from!, to!)).toBe(board);
    }
    expect(skewerDestinations(board, 3)).toEqual([]);
    expect(skewerDestinations(board, -1)).toEqual([]);
  });

  test("a partially matching skewer is progress only when all three foods match", () => {
    expect(countSortedSkewers([[0, 0], [1, 1, 1], [2, 0, 2], [], []])).toBe(1);
    expect(isSkewerComplete([[0, 0], [1, 1, 1], [2, 2, 2], [0], []], 3)).toBe(false);
  });
});

describe("rounds, undo and completion", () => {
  test("state creation and restart copy the original puzzle", () => {
    const puzzle = createSkewerPuzzle(3, 717);
    const first = createSkewerState(puzzle);
    const move = puzzle.solution[0]!;
    const changed = playSkewerMove(first, move.from, move.to);
    const restarted = createSkewerState(puzzle);
    expect(first.skewers).not.toBe(puzzle.skewers);
    expect(first.skewers[0]).not.toBe(puzzle.skewers[0]);
    expect(restarted.skewers).toEqual(puzzle.skewers);
    expect(restarted.history).toEqual([]);
    expect(restarted.moves).toBe(0);
    expect(changed.skewers).not.toEqual(restarted.skewers);
    expect(undoSkewerMove(first)).toBe(first);
  });

  test("undo restores exact prior boards, retains move count and supports a different next move", () => {
    const puzzle = createSkewerPuzzle(4, 241);
    const start = createSkewerState(puzzle);
    const firstMove = puzzle.solution[0]!;
    const secondMove = puzzle.solution[1]!;
    const first = playSkewerMove(start, firstMove.from, firstMove.to);
    const second = playSkewerMove(first, secondMove.from, secondMove.to);
    const undone = undoSkewerMove(second);
    expect(undone.skewers).toEqual(first.skewers);
    expect(undone.moves).toBe(2);
    expect(undone.history).toHaveLength(1);
    const reset = undoSkewerMove(undone);
    expect(reset.skewers).toEqual(start.skewers);
    expect(reset.moves).toBe(2);
    expect(reset.history).toHaveLength(0);
    const replayed = playSkewerMove(reset, firstMove.from, firstMove.to);
    expect(replayed.moves).toBe(3);
    expect(replayed.skewers).toEqual(first.skewers);
    expect(start.history).toEqual([]);
    expect(first.moves).toBe(1);
    expect(second.moves).toBe(2);
  });

  test("rejected moves preserve state identity, history and counts", () => {
    const state = createSkewerState(createSkewerPuzzle(3, 14));
    for (const index of [-1, 0, 2, 5, Number.NaN])
      expect(playSkewerMove(state, index, index)).toBe(state);
    expect(state.moves).toBe(0);
    expect(state.history).toEqual([]);
  });

  test("a complete played round is locked against additional placements", () => {
    const puzzle = createSkewerPuzzle(4, 98);
    let state = createSkewerState(puzzle);
    for (const move of puzzle.solution) state = playSkewerMove(state, move.from, move.to);
    expect(isSkewerComplete(state.skewers, 4)).toBe(true);
    expect(state.moves).toBe(puzzle.solution.length);
    const full = state.skewers.findIndex((stack) => stack.length === 3);
    const empty = state.skewers.findIndex((stack) => stack.length === 0);
    expect(canMoveSkewer(state.skewers, full, empty)).toBe(true);
    expect(playSkewerMove(state, full, empty)).toBe(state);
  });

  test("completion requires each food exactly three times, not merely uniform stacks", () => {
    expect(isSkewerComplete([[0, 0, 0], [1, 1, 1], [2, 2, 2], [], []], 3)).toBe(true);
    expect(isSkewerComplete([[0, 0, 0], [1, 1, 1], [2, 2, 2], [3, 3, 3], [], []], 4)).toBe(true);
    expect(isSkewerComplete([[0, 0, 0], [0, 0, 0], [2, 2, 2], [], []], 3)).toBe(false);
    expect(isSkewerComplete([[0, 0, 0], [1, 1, 1], [2, 2, 2], []], 3)).toBe(false);
    expect(isSkewerComplete([[], [], [], [], []], 3)).toBe(false);
    expect(isSkewerComplete([[0, 0, 0], [1, 1, 1], [3, 3, 3], [], []], 3)).toBe(false);
  });
});
