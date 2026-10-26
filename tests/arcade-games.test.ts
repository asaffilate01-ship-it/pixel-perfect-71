import { describe, expect, test } from "bun:test";
import {
  chooseFourMove, dailySeed, dropFour, fourResult, mergeLine, mergeOver, moveMerge,
  puzzleMoves, puzzleSolved, seededRandom, sequencePrefix, slideMerge, slidePuzzle, startMerge, startPuzzle,
  type FourBoard,
} from "../src/lib/arcade-games";

describe("Feast 2048", () => {
  test("merges each tile once, packs gaps and scores the resulting tiles", () => {
    expect(mergeLine([2, 2, 2, 2])).toEqual({ line: [4, 4, 0, 0], score: 8 });
    expect(mergeLine([2, 0, 2, 4])).toEqual({ line: [4, 4, 0, 0], score: 4 });
    expect(mergeLine([4, 4, 8, 0])).toEqual({ line: [8, 8, 0, 0], score: 8 });
  });
  test("slides in every direction, adds one tile only after a valid move, preserves input", () => {
    const board = [2, 2, 0, 0, ...Array<number>(12).fill(0)];
    expect(slideMerge(board, "left").board.slice(0, 4)).toEqual([4, 0, 0, 0]);
    expect(slideMerge(board, "right").board.slice(0, 4)).toEqual([0, 0, 0, 4]);
    expect(slideMerge(board, "down").board.slice(12)).toEqual([2, 2, 0, 0]);
    expect(slideMerge(board, "up").changed).toBe(false);
    const state = { board, score: 0, moves: 0 };
    expect(moveMerge(state, "up")).toBe(state);
    const next = moveMerge(state, "left", () => 0);
    expect(next.score).toBe(4); expect(next.moves).toBe(1);
    expect(next.board.reduce((a, b) => a + b, 0)).toBe(6);
    expect(board.slice(0, 4)).toEqual([2, 2, 0, 0]);
  });
  test("distinguishes full boards with a legal merge from dead boards", () => {
    const dead = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
    expect(mergeOver(dead)).toBe(true);
    expect(mergeOver([2, 2, ...dead.slice(2)])).toBe(false);
    expect(startMerge(seededRandom(1)).board.filter(Boolean)).toHaveLength(2);
  });
});
describe("Four to Feast", () => {
  const empty = () => Array<0>(42).fill(0) as FourBoard;
  test("gravity, full columns and invalid moves", () => {
    let board = empty(); const original = [...board];
    for (let row = 5; row >= 0; row--) { board = dropFour(board, 3, 1)!; expect(board[row * 7 + 3]).toBe(1); }
    expect(dropFour(board, 3, 2)).toBeNull(); expect(dropFour(board, -1, 1)).toBeNull();
    expect(dropFour(board, 1.5, 1)).toBeNull(); expect(original.every(v => v === 0)).toBe(true);
  });
  test("all win directions and no row wraparound", () => {
    for (const indices of [[35, 36, 37, 38], [0, 7, 14, 21], [0, 8, 16, 24], [6, 12, 18, 24]]) {
      const board = empty(); for (const index of indices) board[index] = 2;
      expect(fourResult(board)).toBe(2);
    }
    const board = empty(); for (const index of [5, 6, 7, 8]) board[index] = 1;
    expect(fourResult(board)).toBeNull();
    expect(fourResult(Array.from({length: 42}, (_, i) => ((Math.floor(i / 7) + Math.floor(i % 7 / 2)) % 2 + 1) as 1 | 2))).toBe("draw");
  });
  test("chef wins when possible and blocks an immediate loss at every difficulty", () => {
    for (const depth of [1, 3, 4] as const) {
      let board = empty(); for (const column of [0, 1, 2]) board = dropFour(board, column, 1)!;
      expect(chooseFourMove(board, depth)).toBe(3);
      board = empty(); for (const column of [2, 3, 4]) board = dropFour(board, column, 2)!;
      const move = chooseFourMove(board, depth)!;
      expect(fourResult(dropFour(board, move, 2)!)).toBe(2);
      expect(board.filter(Boolean)).toHaveLength(3);
    }
  });
  test("a complete legal computer game terminates without overwriting counters", () => {
    let board = empty();
    for (let turn = 0; turn < 42 && fourResult(board) === null; turn++) {
      const column = turn % 2 ? chooseFourMove(board, 3)! : [3, 2, 4, 1, 5, 0, 6].find(c => board[c] === 0)!;
      board = dropFour(board, column, turn % 2 ? 2 : 1)!;
      expect(board.filter(Boolean)).toHaveLength(turn + 1);
    }
    expect(fourResult(board)).not.toBeNull(); expect(chooseFourMove(board)).toBeNull();
  });
});
describe("Kitchen Shuffle", () => {
  test("100 seeded boards for each size are unique-tile, unsolved, solvable positions", () => {
    for (const size of [3, 4] as const) for (let seed = 0; seed < 100; seed++) {
      const board = startPuzzle(size, seededRandom(seed));
      expect([...board].sort((a, b) => a - b)).toEqual(Array.from({ length: size * size }, (_, i) => i));
      expect(puzzleSolved(board)).toBe(false);
      const tiles = board.filter(Boolean);
      let inversions = 0; tiles.forEach((a, i) => tiles.slice(i + 1).forEach(b => { if (a > b) inversions++; }));
      const rowFromBottom = size - Math.floor(board.indexOf(0) / size);
      expect(size % 2 ? inversions % 2 : (inversions + rowFromBottom) % 2).toBe(size % 2 ? 0 : 1);
    }
  });
  test("only adjacent tiles move and one last move completes a puzzle", () => {
    const board = [1, 2, 3, 4, 5, 6, 7, 0, 8];
    expect(puzzleMoves(board, 3).sort()).toEqual([4, 6, 8]);
    expect(slidePuzzle(board, 0, 3)).toBe(board);
    expect(puzzleSolved(slidePuzzle(board, 8, 3))).toBe(true);
    expect(board[7]).toBe(0);
  });
  test("daily challenges are reproducible across devices and time zones", () => {
    const seed = dailySeed(new Date("2026-10-26T23:30:00-04:00"));
    expect(seed).toBe(20261027);
    expect(startPuzzle(4, seededRandom(seed + 4))).toEqual(startPuzzle(4, seededRandom(seed + 4)));
  });
});
describe("Order Echo", () => {
  test("checks exact prefixes, wrong order and oversized input", () => {
    expect(sequencePrefix([0, 2, 3], [])).toBe(true);
    expect(sequencePrefix([0, 2, 3], [0, 2])).toBe(true);
    expect(sequencePrefix([0, 2, 3], [0, 2, 3])).toBe(true);
    expect(sequencePrefix([0, 2, 3], [0, 3])).toBe(false);
    expect(sequencePrefix([0], [0, 1])).toBe(false);
  });
});
