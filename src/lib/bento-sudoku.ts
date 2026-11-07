import { seededRandom } from "./arcade-games";

export type BentoSize = 4 | 6;
export type BentoPuzzle = {
  size: BentoSize;
  givens: readonly number[];
  solution: readonly number[];
};
export type BentoState = {
  board: readonly number[];
  history: readonly (readonly number[])[];
  moves: number;
  hints: number;
};

const boxIndex = (index: number, size: BentoSize) =>
  Math.floor(Math.floor(index / size) / 2) * 2 + Math.floor((index % size) / (size / 2));

export function bentoConflicts(board: readonly number[], size: BentoSize): Set<number> {
  const conflicts = new Set<number>();
  for (let first = 0; first < board.length; first += 1) {
    const value = board[first];
    if (!value) continue;
    for (let second = first + 1; second < board.length; second += 1) {
      if (
        value === board[second] &&
        (Math.floor(first / size) === Math.floor(second / size) ||
          first % size === second % size ||
          boxIndex(first, size) === boxIndex(second, size))
      ) {
        conflicts.add(first);
        conflicts.add(second);
      }
    }
  }
  return conflicts;
}

/** Counts solutions with an explicit work budget; exhausted searches never prove uniqueness. */
export function countBentoSolutions(
  board: readonly number[],
  size: BentoSize,
  options: { limit?: number; nodeBudget?: number } = {},
): { count: number; exhausted: boolean } {
  if (
    (size !== 4 && size !== 6) ||
    board.length !== size * size ||
    board.some((value) => !Number.isInteger(value) || value < 0 || value > size)
  ) {
    return { count: 0, exhausted: false };
  }
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 2)));
  const budget = Math.max(0, Math.min(100_000, Math.floor(options.nodeBudget ?? 50_000)));
  if (!Number.isFinite(limit) || !Number.isFinite(budget)) {
    return { count: 0, exhausted: true };
  }
  const cells = [...board];
  const rows = Array<number>(size).fill(0);
  const columns = Array<number>(size).fill(0);
  const boxes = Array<number>(size).fill(0);
  const all = (1 << size) - 1;
  for (let index = 0; index < cells.length; index += 1) {
    const value = cells[index] ?? 0;
    if (!value) continue;
    const row = Math.floor(index / size);
    const column = index % size;
    const box = boxIndex(index, size);
    const bit = 1 << (value - 1);
    if (((rows[row] ?? 0) | (columns[column] ?? 0) | (boxes[box] ?? 0)) & bit) {
      return { count: 0, exhausted: false };
    }
    rows[row] = (rows[row] ?? 0) | bit;
    columns[column] = (columns[column] ?? 0) | bit;
    boxes[box] = (boxes[box] ?? 0) | bit;
  }
  let count = 0;
  let nodes = 0;
  let exhausted = false;
  const search = (): void => {
    if (count >= limit || exhausted) return;
    if (nodes >= budget) {
      exhausted = true;
      return;
    }
    nodes += 1;
    let target = -1;
    let candidates = 0;
    let smallest = size + 1;
    for (let index = 0; index < cells.length; index += 1) {
      if (cells[index] !== 0) continue;
      const row = Math.floor(index / size);
      const column = index % size;
      const mask =
        all & ~((rows[row] ?? 0) | (columns[column] ?? 0) | (boxes[boxIndex(index, size)] ?? 0));
      if (!mask) return;
      let total = 0;
      for (let bits = mask; bits; bits &= bits - 1) total += 1;
      if (total < smallest) {
        target = index;
        candidates = mask;
        smallest = total;
        if (total === 1) break;
      }
    }
    if (target < 0) {
      count += 1;
      return;
    }
    const row = Math.floor(target / size);
    const column = target % size;
    const box = boxIndex(target, size);
    for (let value = 1; value <= size && count < limit && !exhausted; value += 1) {
      const bit = 1 << (value - 1);
      if (!(candidates & bit)) continue;
      cells[target] = value;
      rows[row] = (rows[row] ?? 0) | bit;
      columns[column] = (columns[column] ?? 0) | bit;
      boxes[box] = (boxes[box] ?? 0) | bit;
      search();
      cells[target] = 0;
      rows[row] = (rows[row] ?? 0) & ~bit;
      columns[column] = (columns[column] ?? 0) & ~bit;
      boxes[box] = (boxes[box] ?? 0) & ~bit;
    }
  };
  search();
  return { count, exhausted };
}

function shuffle(values: readonly number[], random: () => number): number[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const saved = result[index] ?? 0;
    result[index] = result[other] ?? 0;
    result[other] = saved;
  }
  return result;
}

/** One finite removal pass from a valid grid, accepting only proven unique boards. */
export function createBentoPuzzle(size: BentoSize, seed: number): BentoPuzzle {
  if ((size !== 4 && size !== 6) || !Number.isFinite(seed)) {
    throw new RangeError("Choose a 4×4 or 6×6 board and a finite seed.");
  }
  const random = seededRandom(seed);
  const range = (length: number) => Array.from({ length }, (_, index) => index);
  const digits = shuffle(
    range(size).map((value) => value + 1),
    random,
  );
  const rows = shuffle(range(size / 2), random).flatMap((band) =>
    shuffle([0, 1], random).map((row) => band * 2 + row),
  );
  const columns = shuffle([0, 1], random).flatMap((stack) =>
    shuffle(range(size / 2), random).map((column) => stack * (size / 2) + column),
  );
  const solution = rows.flatMap((row) =>
    columns.map(
      (column) => digits[((row % 2) * (size / 2) + Math.floor(row / 2) + column) % size] ?? 1,
    ),
  );
  const givens = [...solution];
  const targetBlanks = size === 4 ? 8 : 20;
  let blanks = 0;
  for (const index of shuffle(range(size * size), random)) {
    if (blanks >= targetBlanks) break;
    const saved = givens[index] ?? 0;
    givens[index] = 0;
    const result = countBentoSolutions(givens, size);
    if (result.count === 1 && !result.exhausted) blanks += 1;
    else givens[index] = saved;
  }
  return { size, givens, solution };
}

export function validBentoDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function createDailyBentoPuzzle(size: BentoSize, date: string): BentoPuzzle {
  if (!validBentoDate(date)) throw new RangeError("Use a valid UTC date in YYYY-MM-DD format.");
  return createBentoPuzzle(size, Number(date.replaceAll("-", "")) * 17 + size * 101);
}

export function createBentoState(puzzle: BentoPuzzle): BentoState {
  return { board: [...puzzle.givens], history: [], moves: 0, hints: 0 };
}

export function enterBentoValue(
  puzzle: BentoPuzzle,
  state: BentoState,
  index: number,
  value: number,
): BentoState {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= puzzle.size * puzzle.size ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > puzzle.size ||
    puzzle.givens[index] !== 0 ||
    state.board[index] === value
  )
    return state;
  const board = [...state.board];
  board[index] = value;
  return { ...state, board, history: [...state.history, state.board], moves: state.moves + 1 };
}

export function undoBentoMove(state: BentoState): BentoState {
  const previous = state.history.at(-1);
  return previous ? { ...state, board: [...previous], history: state.history.slice(0, -1) } : state;
}

/** Reveals the selected unfinished cell, otherwise the first unfinished cell. */
export function applyBentoHint(
  puzzle: BentoPuzzle,
  state: BentoState,
  selected: number,
): BentoState {
  const needsHint = (index: number) =>
    puzzle.givens[index] === 0 && state.board[index] !== puzzle.solution[index];
  const index =
    Number.isInteger(selected) &&
    selected >= 0 &&
    selected < state.board.length &&
    needsHint(selected)
      ? selected
      : state.board.findIndex((_, position) => needsHint(position));
  if (index < 0) return state;
  const next = enterBentoValue(puzzle, state, index, puzzle.solution[index] ?? 0);
  return next === state ? state : { ...next, hints: state.hints + 1 };
}

export function isBentoComplete(puzzle: BentoPuzzle, board: readonly number[]): boolean {
  return (
    board.length === puzzle.size * puzzle.size &&
    board.every(
      (value, index) =>
        Number.isInteger(value) &&
        value >= 1 &&
        value <= puzzle.size &&
        (puzzle.givens[index] === 0 || puzzle.givens[index] === value),
    ) &&
    bentoConflicts(board, puzzle.size).size === 0
  );
}

export function bentoFocusMove(index: number, key: string, size: BentoSize): number | null {
  const row = Math.floor(index / size);
  const column = index % size;
  switch (key) {
    case "ArrowLeft":
      return row * size + Math.max(0, column - 1);
    case "ArrowRight":
      return row * size + Math.min(size - 1, column + 1);
    case "ArrowUp":
      return Math.max(0, row - 1) * size + column;
    case "ArrowDown":
      return Math.min(size - 1, row + 1) * size + column;
    case "Home":
      return row * size;
    case "End":
      return row * size + size - 1;
    default:
      return null;
  }
}
