/** Local entertainment only. Scores have no monetary or loyalty value. */
export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
}
export function dailySeed(date = new Date()): number {
  return Number(date.toISOString().slice(0, 10).replaceAll("-", ""));
}
export type Direction = "left" | "right" | "up" | "down";
export type MergeState = { board: number[]; score: number; moves: number };
export function mergeLine(line: readonly number[]): { line: number[]; score: number } {
  const values = line.filter(Boolean), result: number[] = [];
  let score = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === values[i + 1]) {
      const merged = values[i]! * 2;
      result.push(merged); score += merged; i++;
    } else result.push(values[i]!);
  }
  return { line: [...result, ...Array<number>(line.length - result.length).fill(0)], score };
}
export function slideMerge(board: readonly number[], direction: Direction) {
  const next = [...board]; let score = 0;
  for (let row = 0; row < 4; row++) {
    const indices = Array.from({ length: 4 }, (_, column) =>
      direction === "left" ? row * 4 + column : direction === "right" ? row * 4 + 3 - column :
      direction === "up" ? column * 4 + row : (3 - column) * 4 + row);
    const merged = mergeLine(indices.map(i => board[i]!)); score += merged.score;
    indices.forEach((index, column) => { next[index] = merged.line[column]!; });
  }
  return { board: next, score, changed: next.some((value, i) => value !== board[i]) };
}
function spawnTile(board: readonly number[], random: () => number): number[] {
  const empty = board.flatMap((value, index) => value === 0 ? [index] : []);
  if (!empty.length) return [...board];
  const next = [...board];
  next[empty[Math.floor(random() * empty.length)]!] = random() < 0.9 ? 2 : 4;
  return next;
}
export function startMerge(random: () => number = Math.random): MergeState {
  return { board: spawnTile(spawnTile(Array<number>(16).fill(0), random), random), score: 0, moves: 0 };
}
export function moveMerge(state: MergeState, direction: Direction, random: () => number = Math.random): MergeState {
  const moved = slideMerge(state.board, direction);
  return moved.changed ? { board: spawnTile(moved.board, random), score: state.score + moved.score, moves: state.moves + 1 } : state;
}
export function mergeOver(board: readonly number[]): boolean {
  return (["left", "right", "up", "down"] as const).every(direction => !slideMerge(board, direction).changed);
}

/** Feast 2048: a bounded local undo stack and explicit save slot. */
export const FEAST_SAVE_KEY = "mealdeck-feast-2048-save-v1";
export const FEAST_UNDO_LIMIT = 5;
export type FeastRound = { state: MergeState; history: MergeState[]; message: string };
export type FeastSave = { version: 1; state: MergeState; history: MergeState[] };

export function createFeastRound(state: MergeState): FeastRound {
  return { state, history: [], message: "Slide equal numbers together to build your feast." };
}

export function advanceFeastRound(round: FeastRound, direction: Direction, seed: number): FeastRound {
  if (mergeOver(round.state.board)) return round;
  const next = moveMerge(round.state, direction, seededRandom(seed));
  if (next === round.state) return { ...round, message: `No tiles can slide ${direction}. Try another direction.` };
  const gained = next.score - round.state.score;
  return {
    state: next,
    history: [...round.history, round.state].slice(-FEAST_UNDO_LIMIT),
    message: `Moved ${direction}. ${gained ? gained + " points added. " : ""}Score ${next.score}; move ${next.moves}.`,
  };
}

export function undoFeastRound(round: FeastRound): FeastRound {
  const state = round.history.at(-1);
  return state ? {
    state,
    history: round.history.slice(0, -1),
    message: "Last move undone. Try a different direction.",
  } : round;
}

function parseFeastState(value: unknown): MergeState | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (!Array.isArray(item.board) || item.board.length !== 16 ||
      typeof item.moves !== "number" || !Number.isSafeInteger(item.moves) || item.moves < 0 || item.moves > 1_000_000 ||
      typeof item.score !== "number" || !Number.isSafeInteger(item.score) || item.score < 0 || item.score % 4 !== 0 ||
      !item.board.every((tile: unknown) => typeof tile === "number" && Number.isSafeInteger(tile) &&
        (tile === 0 || (tile >= 2 && Number.isInteger(Math.log2(tile)))))) return null;
  const board: number[] = [...item.board];
  const total = board.reduce((sum, tile) => sum + tile, 0);
  if (board.filter(Boolean).length < 2 || total < 2 * (item.moves + 2) ||
      total > 4 * (item.moves + 2) ||
      (item.moves === 0 && (item.score !== 0 || board.filter(Boolean).length !== 2 || board.some(tile => tile > 4)))) return null;
  return { board, score: item.score, moves: item.moves };
}

/** A saved undo entry must lead to its successor by a legal slide and one 2/4 spawn. */
function validFeastTransition(before: MergeState, after: MergeState): boolean {
  if (after.moves !== before.moves + 1) return false;
  return (["left", "right", "up", "down"] as const).some(direction => {
    const slide = slideMerge(before.board, direction);
    if (!slide.changed || after.score !== before.score + slide.score) return false;
    const changed = slide.board.flatMap((value, i) => value !== after.board[i] ? [i] : []);
    const index = changed[0];
    return changed.length === 1 && index !== undefined && slide.board[index] === 0 &&
      (after.board[index] === 2 || after.board[index] === 4);
  });
}

export function parseFeastSave(raw: string | null): FeastSave | null {
  if (!raw || raw.length > 12_000) return null;
  try {
    const input = JSON.parse(raw) as Record<string, unknown> | null;
    if (!input || input.version !== 1 || !Array.isArray(input.history) ||
      input.history.length > FEAST_UNDO_LIMIT) return null;
    const state = parseFeastState(input.state);
    if (!state) return null;
    const history: MergeState[] = [];
    for (const value of input.history) {
      const entry = parseFeastState(value);
      if (!entry) return null;
      history.push(entry);
    }
    const chain = [...history, state];
    if (chain.some((entry, i) => i > 0 && !validFeastTransition(chain[i - 1]!, entry))) return null;
    return { version: 1, state, history };
  } catch {
    return null;
  }
}

export function createFeastSave(round: FeastRound): FeastSave | null {
  return parseFeastSave(JSON.stringify({ version: 1, state: round.state, history: round.history }));
}

export type Counter = 0 | 1 | 2;
export type FourBoard = Counter[];
export function dropFour(board: readonly Counter[], column: number, player: 1 | 2): FourBoard | null {
  if (!Number.isInteger(column) || column < 0 || column >= 7) return null;
  for (let row = 5; row >= 0; row--) if (board[row * 7 + column] === 0) {
    const next = [...board]; next[row * 7 + column] = player; return next;
  }
  return null;
}
export function fourWinningCells(board: readonly Counter[]): number[] {
  for (let row = 0; row < 6; row++) for (let column = 0; column < 7; column++) {
    const player = board[row * 7 + column]; if (!player) continue;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const lastRow = row + dr! * 3, lastColumn = column + dc! * 3;
      if (lastRow < 0 || lastRow >= 6 || lastColumn < 0 || lastColumn >= 7) continue;
      const cells = [0, 1, 2, 3].map(n => (row + dr! * n) * 7 + column + dc! * n);
      if (cells.every(index => board[index] === player)) return cells;
    }
  }
  return [];
}
export function fourResult(board: readonly Counter[]): Counter | "draw" | null {
  const first = fourWinningCells(board)[0];
  if (first !== undefined) return board[first] ?? null;
  return board.every(Boolean) ? "draw" : null;
}
const FOUR_ORDER = [3, 2, 4, 1, 5, 0, 6];
function fourValue(board: readonly Counter[]): number {
  let score = 0;
  for (let row = 0; row < 6; row++) {
    score += board[row * 7 + 3] === 2 ? 3 : board[row * 7 + 3] === 1 ? -3 : 0;
    for (let column = 0; column < 7; column++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      if (row + dr! * 3 >= 6 || column + dc! * 3 < 0 || column + dc! * 3 >= 7) continue;
      const window = [0, 1, 2, 3].map(n => board[(row + dr! * n) * 7 + column + dc! * n]);
      const chef = window.filter(v => v === 2).length, human = window.filter(v => v === 1).length;
      if (!human) score += [0, 1, 8, 60, 10000][chef]!;
      if (!chef) score -= [0, 1, 8, 70, 10000][human]!;
    }
  }
  return score;
}
function searchFour(board: FourBoard, depth: number, maximizing: boolean, alpha: number, beta: number): number {
  const result = fourResult(board);
  if (result === 2) return 100000 + depth;
  if (result === 1) return -100000 - depth;
  if (result === "draw") return 0;
  if (!depth) return fourValue(board);
  let best = maximizing ? -Infinity : Infinity;
  for (const column of FOUR_ORDER) {
    const next = dropFour(board, column, maximizing ? 2 : 1); if (!next) continue;
    const value = searchFour(next, depth - 1, !maximizing, alpha, beta);
    best = maximizing ? Math.max(best, value) : Math.min(best, value);
    if (maximizing) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}
export type FourDifficulty = 1 | 3 | 4 | 5;
export function chooseFourMove(board: FourBoard, depth: FourDifficulty = 3): number | null {
  if (fourResult(board) !== null) return null;
  let best = -Infinity, choice: number | null = null;
  // Always take a win or block an immediate loss, even at the easiest level.
  for (const player of [2, 1] as const) for (const column of FOUR_ORDER) {
    const next = dropFour(board, column, player);
    if (next && fourResult(next) === player) return column;
  }
  for (const column of FOUR_ORDER) {
    const next = dropFour(board, column, 2); if (!next) continue;
    const value = searchFour(next, depth - 1, false, best, Infinity);
    if (value > best) { best = value; choice = column; }
  }
  return choice;
}

export function puzzleMoves(board: readonly number[], size: number): number[] {
  const blank = board.indexOf(0), row = Math.floor(blank / size), column = blank % size;
  return [row > 0 ? blank - size : -1, row < size - 1 ? blank + size : -1,
    column > 0 ? blank - 1 : -1, column < size - 1 ? blank + 1 : -1].filter(i => i >= 0);
}
export function slidePuzzle(board: readonly number[], index: number, size: number): number[] {
  if (!puzzleMoves(board, size).includes(index)) return board as number[];
  const next = [...board], blank = board.indexOf(0);
  [next[blank], next[index]] = [next[index]!, 0]; return next;
}
export function puzzleSolved(board: readonly number[]): boolean {
  return board.every((value, index) => value === (index + 1) % board.length);
}
export function startPuzzle(size: 3 | 4, random: () => number = Math.random): number[] {
  let board = Array.from({ length: size * size }, (_, i) => (i + 1) % (size * size));
  let previousBlank = -1;
  // Legal moves from the solved position guarantee solvability.
  for (let step = 0; step < size * size * 30; step++) {
    const options = puzzleMoves(board, size).filter(i => i !== previousBlank);
    const index = options[Math.floor(random() * options.length)]!;
    previousBlank = board.indexOf(0); board = slidePuzzle(board, index, size);
  }
  return puzzleSolved(board) ? slidePuzzle(board, puzzleMoves(board, size)[0]!, size) : board;
}
export function sequencePrefix(sequence: readonly number[], entered: readonly number[]): boolean {
  return entered.length <= sequence.length && entered.every((value, index) => value === sequence[index]);
}
