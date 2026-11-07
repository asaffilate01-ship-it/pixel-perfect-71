/** Small, deterministic Reversi rules for the local Tray Tactics game. */
export const TRAY_SIZE = 6;
export const TRAY_CELL_COUNT = TRAY_SIZE * TRAY_SIZE;
export type TrayPlayer = 1 | 2;
export type TrayCell = 0 | TrayPlayer;
export type TrayDifficulty = "casual" | "clever";
export type TrayBoard = readonly TrayCell[];

export interface TrayState {
  readonly board: TrayBoard;
  readonly turn: TrayPlayer;
  readonly lastMove: number | null;
  readonly flipped: readonly number[];
  readonly passedPlayer: TrayPlayer | null;
  readonly over: boolean;
  readonly moveCount: number;
}

export interface TrayRound {
  readonly state: TrayState;
  readonly passes: readonly TrayPlayer[];
  readonly chefMoves: readonly number[];
}

const DIRECTIONS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const;
const CORNERS = [0, 5, 30, 35] as const;

export function otherTrayPlayer(player: TrayPlayer): TrayPlayer {
  return player === 1 ? 2 : 1;
}

export function createTrayGame(): TrayState {
  const board: TrayCell[] = Array.from({ length: TRAY_CELL_COUNT }, () => 0);
  board[14] = 2;
  board[15] = 1;
  board[20] = 1;
  board[21] = 2;
  return {
    board,
    turn: 1,
    lastMove: null,
    flipped: [],
    passedPlayer: null,
    over: false,
    moveCount: 0,
  };
}

/** Return every bracketed opponent piece, without modifying the board. */
export function trayFlips(board: TrayBoard, index: number, player: TrayPlayer): number[] {
  if (
    board.length !== TRAY_CELL_COUNT ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= TRAY_CELL_COUNT ||
    board[index] !== 0
  )
    return [];
  const row = Math.floor(index / TRAY_SIZE);
  const column = index % TRAY_SIZE;
  const opponent = otherTrayPlayer(player);
  const flipped: number[] = [];
  for (const [dr, dc] of DIRECTIONS) {
    let nextRow = row + dr;
    let nextColumn = column + dc;
    const line: number[] = [];
    while (nextRow >= 0 && nextRow < TRAY_SIZE && nextColumn >= 0 && nextColumn < TRAY_SIZE) {
      const next = nextRow * TRAY_SIZE + nextColumn;
      const cell = board[next];
      if (cell === opponent) line.push(next);
      else {
        if (cell === player && line.length > 0) flipped.push(...line);
        break;
      }
      nextRow += dr;
      nextColumn += dc;
    }
  }
  return flipped;
}

export function legalTrayMoves(board: TrayBoard, player: TrayPlayer): number[] {
  if (board.length !== TRAY_CELL_COUNT) return [];
  return Array.from({ length: TRAY_CELL_COUNT }, (_, index) => index).filter(
    (index) => trayFlips(board, index, player).length > 0,
  );
}

export function countTrayPieces(board: TrayBoard): { burger: number; cake: number; empty: number } {
  return board.reduce(
    (counts, cell) => ({
      burger: counts.burger + (cell === 1 ? 1 : 0),
      cake: counts.cake + (cell === 2 ? 1 : 0),
      empty: counts.empty + (cell === 0 ? 1 : 0),
    }),
    { burger: 0, cake: 0, empty: 0 },
  );
}

/** A tied count has no winner. Only display this result once state.over is true. */
export function trayWinner(board: TrayBoard): TrayPlayer | null {
  const counts = countTrayPieces(board);
  return counts.burger === counts.cake ? null : counts.burger > counts.cake ? 1 : 2;
}

/** Illegal moves return the same state. A forced pass happens as part of a legal move. */
export function playTrayMove(state: TrayState, index: number): TrayState {
  if (state.over) return state;
  const flipped = trayFlips(state.board, index, state.turn);
  if (flipped.length === 0) return state;
  const board = [...state.board];
  board[index] = state.turn;
  for (const piece of flipped) board[piece] = state.turn;
  const opponent = otherTrayPlayer(state.turn);
  const opponentCanMove = legalTrayMoves(board, opponent).length > 0;
  const currentCanMove = opponentCanMove ? false : legalTrayMoves(board, state.turn).length > 0;
  return {
    board,
    turn: opponentCanMove ? opponent : state.turn,
    lastMove: index,
    flipped,
    passedPlayer: !opponentCanMove && currentCanMove ? opponent : null,
    over: !opponentCanMove && !currentCanMove,
    moveCount: state.moveCount + 1,
  };
}

function evaluateTrayBoard(state: TrayState, player: TrayPlayer): number {
  const opponent = otherTrayPlayer(player);
  const counts = countTrayPieces(state.board);
  const difference = player === 1 ? counts.burger - counts.cake : counts.cake - counts.burger;
  if (state.over) return difference === 0 ? 0 : Math.sign(difference) * 10_000 + difference;
  let score = difference * (counts.empty < 10 ? 5 : 1);
  score +=
    (legalTrayMoves(state.board, player).length - legalTrayMoves(state.board, opponent).length) * 9;
  for (const corner of CORNERS) {
    if (state.board[corner] === player) score += 90;
    if (state.board[corner] === opponent) score -= 90;
    if (state.board[corner] !== 0) continue;
    const row = Math.floor(corner / TRAY_SIZE);
    const column = corner % TRAY_SIZE;
    const dr = row === 0 ? 1 : -1;
    const dc = column === 0 ? 1 : -1;
    const neighbours = [
      (row + dr) * TRAY_SIZE + column,
      row * TRAY_SIZE + column + dc,
      (row + dr) * TRAY_SIZE + column + dc,
    ];
    for (const neighbour of neighbours) {
      if (state.board[neighbour] === player) score -= 24;
      if (state.board[neighbour] === opponent) score += 24;
    }
  }
  return score;
}

function traySearch(
  state: TrayState,
  player: TrayPlayer,
  depth: number,
  alpha: number,
  beta: number,
): number {
  if (depth === 0 || state.over) return evaluateTrayBoard(state, player);
  const moves = legalTrayMoves(state.board, state.turn);
  if (moves.length === 0) return evaluateTrayBoard(state, player);
  const maximizing = state.turn === player;
  let best = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    const score = traySearch(playTrayMove(state, move), player, depth - 1, alpha, beta);
    best = maximizing ? Math.max(best, score) : Math.min(best, score);
    if (maximizing) alpha = Math.max(alpha, best);
    else beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

/** Stable move ordering makes a chef turn reproducible. Clever searches three moves ahead. */
export function chooseTrayMove(
  state: TrayState,
  difficulty: TrayDifficulty = "clever",
): number | null {
  if (state.over) return null;
  const moves = legalTrayMoves(state.board, state.turn);
  const depth = difficulty === "clever" ? 3 : 1;
  let chosen: number | null = null;
  let best = -Infinity;
  for (const move of moves) {
    const score = traySearch(playTrayMove(state, move), state.turn, depth - 1, -Infinity, Infinity);
    if (score > best) {
      best = score;
      chosen = move;
    }
  }
  return chosen;
}

/** Resolve one human move and any consecutive chef turns as one undoable round. */
export function playTraySoloRound(
  state: TrayState,
  index: number,
  difficulty: TrayDifficulty = "clever",
): TrayRound {
  if (state.turn !== 1 || state.over) return { state, passes: [], chefMoves: [] };
  let next = playTrayMove(state, index);
  if (next === state) return { state, passes: [], chefMoves: [] };
  const passes: TrayPlayer[] = next.passedPlayer ? [next.passedPlayer] : [];
  const chefMoves: number[] = [];
  while (!next.over && next.turn === 2) {
    const move = chooseTrayMove(next, difficulty);
    if (move === null) break;
    chefMoves.push(move);
    next = playTrayMove(next, move);
    if (next.passedPlayer) passes.push(next.passedPlayer);
  }
  return { state: next, passes, chefMoves };
}
