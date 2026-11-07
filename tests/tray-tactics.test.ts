import { describe, expect, test } from "bun:test";
import {
  TRAY_CELL_COUNT,
  chooseTrayMove,
  countTrayPieces,
  createTrayGame,
  legalTrayMoves,
  otherTrayPlayer,
  playTrayMove,
  playTraySoloRound,
  trayFlips,
  trayWinner,
  type TrayBoard,
  type TrayCell,
  type TrayPlayer,
  type TrayState,
} from "../src/lib/tray-tactics";

function position(board: TrayBoard, turn: TrayPlayer = 1): TrayState {
  return {
    board,
    turn,
    lastMove: null,
    flipped: [],
    passedPlayer: null,
    over: false,
    moveCount: board.filter(Boolean).length - 4,
  };
}

describe("Tray Tactics captures and legal moves", () => {
  test("starts with four central counters and the correct opening moves", () => {
    const state = createTrayGame();
    expect(state.board).toHaveLength(TRAY_CELL_COUNT);
    expect(countTrayPieces(state.board)).toEqual({ burger: 2, cake: 2, empty: 32 });
    expect(legalTrayMoves(state.board, 1)).toEqual([8, 13, 22, 27]);
    expect(legalTrayMoves(state.board, 2)).toEqual([9, 16, 19, 26]);
    expect(state.turn).toBe(1);
    expect(state.over).toBe(false);
  });

  test("captures all eight directions for either player", () => {
    const directions = [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ] as const;
    for (const player of [1, 2] as const) {
      const board = Array<TrayCell>(36).fill(0);
      const captured: number[] = [];
      for (const [row, column] of directions) {
        const adjacent = (2 + row) * 6 + 2 + column;
        board[adjacent] = otherTrayPlayer(player);
        board[(2 + row * 2) * 6 + 2 + column * 2] = player;
        captured.push(adjacent);
      }
      expect(trayFlips(board, 14, player).sort((a, b) => a - b)).toEqual(
        captured.sort((a, b) => a - b),
      );
      const next = playTrayMove(position(board, player), 14);
      expect(captured.every((index) => next.board[index] === player)).toBe(true);
      expect(next.board[14]).toBe(player);
      expect(board[14]).toBe(0);
    }
  });

  test("captures whole bracketed runs but never crosses gaps or wraps row edges", () => {
    const run = Array<TrayCell>(36).fill(0);
    run[1] = run[2] = run[3] = 2;
    run[4] = 1;
    expect(trayFlips(run, 0, 1)).toEqual([1, 2, 3]);
    run[2] = 0;
    expect(trayFlips(run, 0, 1)).toEqual([]);
    run[2] = 2;
    run[4] = 0;
    expect(trayFlips(run, 0, 1)).toEqual([]);
    for (const [start, opponent, own] of [
      [5, 6, 7],
      [6, 5, 4],
      [5, 12, 19],
      [30, 23, 16],
    ]) {
      const board = Array<TrayCell>(36).fill(0);
      board[opponent!] = 2;
      board[own!] = 1;
      expect(trayFlips(board, start!, 1)).toEqual([]);
    }
  });

  test("illegal moves are no-ops and valid moves preserve every unrelated cell", () => {
    const original = createTrayGame();
    const state = Object.freeze({ ...original, board: Object.freeze([...original.board]) });
    for (const move of [-1, 36, 0.5, NaN, Infinity, 0, 14]) {
      expect(playTrayMove(state, move)).toBe(state);
      expect(playTraySoloRound(state, move).state).toBe(state);
    }
    const next = playTrayMove(state, 8);
    expect(next.flipped).toEqual([14]);
    expect(next.lastMove).toBe(8);
    expect(next.moveCount).toBe(1);
    expect(next.turn).toBe(2);
    expect(countTrayPieces(next.board)).toEqual({ burger: 4, cake: 1, empty: 31 });
    for (let index = 0; index < 36; index++) {
      if (index !== 8 && index !== 14) expect(next.board[index]).toBe(state.board[index]);
    }
    expect(countTrayPieces(state.board)).toEqual({ burger: 2, cake: 2, empty: 32 });
    expect(legalTrayMoves([], 1)).toEqual([]);
    expect(trayFlips([], 0, 1)).toEqual([]);
  });
});

describe("Tray Tactics passing and completion", () => {
  test("automatically passes a blocked opponent while retaining the current player's move", () => {
    const board = Array<TrayCell>(36).fill(1);
    board[0] = board[5] = 0;
    board[1] = board[4] = 2;
    const next = playTrayMove(position(board), 0);
    expect(next.passedPlayer).toBe(2);
    expect(next.turn).toBe(1);
    expect(next.over).toBe(false);
    expect(legalTrayMoves(next.board, 2)).toEqual([]);
    expect(legalTrayMoves(next.board, 1)).toEqual([5]);
    const finished = playTrayMove(next, 5);
    expect(finished.over).toBe(true);
    expect(trayWinner(finished.board)).toBe(1);
    expect(playTrayMove(finished, 0)).toBe(finished);
    expect(chooseTrayMove(finished)).toBeNull();
  });

  test("ends when both players are blocked even though the board has empty spaces", () => {
    const board = Array<TrayCell>(36).fill(1);
    board[0] = board[35] = 0;
    board[1] = 2;
    const next = playTrayMove(position(board), 0);
    expect(next.over).toBe(true);
    expect(countTrayPieces(next.board).empty).toBe(1);
    expect(legalTrayMoves(next.board, 1)).toEqual([]);
    expect(legalTrayMoves(next.board, 2)).toEqual([]);
    expect(next.passedPlayer).toBeNull();
    expect(trayWinner(next.board)).toBe(1);
  });

  test("a final legal move can fill the board in a tie", () => {
    const board = Array<TrayCell>(36).fill(2);
    board[0] = 0;
    for (let index = 2; index <= 17; index++) board[index] = 1;
    expect(countTrayPieces(board)).toEqual({ burger: 16, cake: 19, empty: 1 });
    const next = playTrayMove(position(board), 0);
    expect(next.over).toBe(true);
    expect(countTrayPieces(next.board)).toEqual({ burger: 18, cake: 18, empty: 0 });
    expect(trayWinner(next.board)).toBeNull();
    expect(chooseTrayMove(next, "casual")).toBeNull();
    expect(trayWinner(Array<TrayCell>(36).fill(2))).toBe(2);
  });
});

describe("Tray Tactics chef and whole-turn recovery", () => {
  test("both difficulties choose repeatable legal moves throughout a complete game", () => {
    for (const difficulty of ["casual", "clever"] as const) {
      let state = createTrayGame();
      for (let moveCount = 0; moveCount < 32 && !state.over; moveCount++) {
        const before = JSON.stringify(state);
        const legal = legalTrayMoves(state.board, state.turn);
        const chosen = chooseTrayMove(state, difficulty);
        expect(chosen).not.toBeNull();
        expect(legal).toContain(chosen);
        expect(chooseTrayMove(state, difficulty)).toBe(chosen);
        expect(JSON.stringify(state)).toBe(before);
        const next = playTrayMove(state, chosen!);
        expect(countTrayPieces(next.board).empty).toBe(countTrayPieces(state.board).empty - 1);
        state = next;
      }
      expect(state.over).toBe(true);
      expect(legalTrayMoves(state.board, 1)).toEqual([]);
      expect(legalTrayMoves(state.board, 2)).toEqual([]);
    }
  });

  test("a solo turn resolves consecutive chef moves after a human pass and retains an undo snapshot", () => {
    const board: TrayBoard = Object.freeze([
      0, 2, 2, 2, 2, 2, 0, 1, 2, 2, 2, 2, 0, 0, 2, 2, 2, 2, 1, 2, 1, 1, 0, 0, 2, 0, 0, 1, 0, 0, 0,
      0, 0, 0, 0, 0,
    ]);
    const saved = Object.freeze(position(board));
    const before = JSON.stringify(saved);
    const result = playTraySoloRound(saved, 30, "casual");
    expect(result.chefMoves.length).toBeGreaterThan(1);
    expect(result.passes).toContain(1);
    expect(result.state.turn === 1 || result.state.over).toBe(true);
    expect(result.state.moveCount).toBe(saved.moveCount + 1 + result.chefMoves.length);
    let replay = playTrayMove(saved, 30);
    for (const move of result.chefMoves) {
      expect(replay.turn).toBe(2);
      expect(legalTrayMoves(replay.board, 2)).toContain(move);
      replay = playTrayMove(replay, move);
    }
    expect(result.state).toEqual(replay);
    expect(JSON.stringify(saved)).toBe(before);
    // The UI can undo one whole human/chef exchange by restoring this exact snapshot.
    expect(playTraySoloRound(saved, 30, "casual")).toEqual(result);
  });

  test("complete solo games finish without leaving the human stuck on a chef turn", () => {
    for (const difficulty of ["casual", "clever"] as const) {
      let state = createTrayGame();
      for (let round = 0; round < 32 && !state.over; round++) {
        expect(state.turn).toBe(1);
        const legal = legalTrayMoves(state.board, 1);
        expect(legal.length).toBeGreaterThan(0);
        const prior = state;
        const result = playTraySoloRound(state, legal[(round * 7) % legal.length]!, difficulty);
        expect(countTrayPieces(result.state.board).empty).toBe(
          countTrayPieces(prior.board).empty - 1 - result.chefMoves.length,
        );
        state = result.state;
      }
      expect(state.over).toBe(true);
      expect(chooseTrayMove(state, difficulty)).toBeNull();
      expect(playTraySoloRound(state, 0, difficulty).state).toBe(state);
    }
    const chefTurn = playTrayMove(createTrayGame(), 8);
    expect(playTraySoloRound(chefTurn, 9).state).toBe(chefTurn);
  });
});
