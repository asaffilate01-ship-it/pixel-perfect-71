/** Pure, local puzzle rules. These games have no order, account or reward authority. */
export type SauceSize = 3 | 4;
export const SAUCE_LEVELS = ["guided", "classic", "expert"] as const;
export type SauceLevel = (typeof SAUCE_LEVELS)[number];

function isCell(index: number, size: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < size * size;
}

/** Roving focus stays inside a row/column instead of wrapping at the board edge. */
export function puzzleFocusMove(index: number, key: string, size: number): number | null {
  if (!Number.isInteger(size) || size < 1 || !isCell(index, size)) return null;
  const row = Math.floor(index / size),
    column = index % size;
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

export function sauceNeighbours(index: number, size: SauceSize): number[] {
  if (!isCell(index, size)) return [];
  const row = Math.floor(index / size),
    column = index % size;
  return [
    index,
    row > 0 ? index - size : -1,
    row < size - 1 ? index + size : -1,
    column > 0 ? index - 1 : -1,
    column < size - 1 ? index + 1 : -1,
  ].filter((cell) => cell >= 0);
}

export function flipSauce(board: readonly boolean[], index: number, size: SauceSize): boolean[] {
  const next = [...board];
  if (board.length !== size * size) return next;
  for (const cell of sauceNeighbours(index, size)) next[cell] = !next[cell];
  return next;
}

export function sauceCleared(board: readonly boolean[], size: SauceSize): boolean {
  return board.length === size * size && board.every((cell) => cell === false);
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

/** Legal flips from an empty board guarantee a solution; generation is bounded. */
export function createSaucePuzzle(size: SauceSize, random: () => number = Math.random): boolean[] {
  const cells = shuffle(
    Array.from({ length: size * size }, (_, index) => index),
    random,
  );
  const count = size === 3 ? 3 + Math.floor(random() * 4) : 5 + Math.floor(random() * 6);
  let board = Array<boolean>(size * size).fill(false);
  for (const cell of cells.slice(0, count)) board = flipSauce(board, cell, size);
  // A valid combination can cancel itself. One extra legal flip keeps the puzzle unsolved.
  return sauceCleared(board, size) ? flipSauce(board, cells[0]!, size) : board;
}

/**
 * Try each first-row choice, then clear each row by pressing the row below it.
 * At most 16 first-row choices are needed; the shortest valid result is a real hint.
 */
export function solveSauce(board: readonly boolean[], size: SauceSize): number[] | null {
  if ((size !== 3 && size !== 4) || board.length !== size * size || board.some((cell) => typeof cell !== "boolean")) return null;
  let best: number[] | null = null;
  for (let mask = 0; mask < 2 ** size; mask++) {
    let working = [...board];
    const moves: number[] = [];
    const press = (index: number) => {
      moves.push(index);
      working = flipSauce(working, index, size);
    };
    for (let column = 0; column < size; column++) if (mask & (1 << column)) press(column);
    for (let row = 1; row < size; row++) {
      for (let column = 0; column < size; column++) {
        if (working[(row - 1) * size + column]) press(row * size + column);
      }
    }
    if (sauceCleared(working, size) && (best === null || moves.length < best.length)) best = moves;
  }
  return best;
}

/** Preserve classic and daily generation. Fresh modes select a solvable layout by shortest route length. */
export function createSauceChallenge(size: SauceSize, level: SauceLevel, random: () => number = Math.random): boolean[] {
  if (level === "classic") return createSaucePuzzle(size, random);
  const wanted = level === "guided" ? (size === 3 ? 3 : 4) : (size === 3 ? 6 : 8);
  let best: boolean[] | null = null;
  let distance = Infinity;
  for (let attempt = 0; attempt < 24; attempt++) {
    const board = createSaucePuzzle(size, random);
    const solution = solveSauce(board, size);
    if (!solution?.length) continue;
    const gap = Math.abs(solution.length - wanted);
    if (gap < distance) { best = board; distance = gap; }
    if (gap === 0) break;
  }
  return best ?? createSaucePuzzle(size, random);
}
export function sauceMoveAdvice(board: readonly boolean[], size: SauceSize) {
  const solution = solveSauce(board, size);
  if (!solution?.length) return null;
  const index = solution[0]!;
  const next = flipSauce(board, index, size);
  return { index, affected: sauceNeighbours(index, size), remaining: solution.length,
    litAfter: next.filter(Boolean).length };
}

export const QUEST_SIZE = 8;
export const QUEST_COUNTS = [4, 6, 8] as const;
export type QuestCount = (typeof QUEST_COUNTS)[number];
export const QUEST_WORDS = [
  "BURGER",
  "CHICKEN",
  "FRIES",
  "CAKE",
  "SAUCE",
  "WRAP",
  "JUICE",
  "PARATHA",
  "NOODLES",
  "PASTA",
  "CHEESE",
  "MINT",
] as const;
export type QuestWord = (typeof QUEST_WORDS)[number];
export type QuestMatch = { word: QuestWord; cells: number[] };
export type QuestPuzzle = { size: typeof QUEST_SIZE; letters: string[]; words: QuestMatch[] };
const QUEST_DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, -1],
  [-1, 1],
] as const;

/** The selected endpoints must form one straight, bounded line, in either direction. */
export function questLine(start: number, end: number, size: number = QUEST_SIZE): number[] | null {
  if (!Number.isInteger(size) || size < 1 || !isCell(start, size) || !isCell(end, size))
    return null;
  const firstRow = Math.floor(start / size),
    firstColumn = start % size;
  const rowDelta = Math.floor(end / size) - firstRow,
    columnDelta = (end % size) - firstColumn;
  if (rowDelta !== 0 && columnDelta !== 0 && Math.abs(rowDelta) !== Math.abs(columnDelta))
    return null;
  const length = Math.max(Math.abs(rowDelta), Math.abs(columnDelta)) + 1;
  return Array.from(
    { length },
    (_, step) =>
      (firstRow + Math.sign(rowDelta) * step) * size + firstColumn + Math.sign(columnDelta) * step,
  );
}

function questPlacements(word: QuestWord, letters: readonly string[]): number[][] {
  const options: number[][] = [];
  for (let start = 0; start < QUEST_SIZE * QUEST_SIZE; start++) {
    const row = Math.floor(start / QUEST_SIZE),
      column = start % QUEST_SIZE;
    for (const [down, across] of QUEST_DIRECTIONS) {
      const lastRow = row + down * (word.length - 1),
        lastColumn = column + across * (word.length - 1);
      if (lastRow < 0 || lastRow >= QUEST_SIZE || lastColumn < 0 || lastColumn >= QUEST_SIZE)
        continue;
      const cells = questLine(start, lastRow * QUEST_SIZE + lastColumn)!;
      if (cells.every((cell, index) => !letters[cell] || letters[cell] === word[index]))
        options.push(cells);
    }
  }
  return options;
}

/** Every chosen word is placed. A row-per-word fallback prevents unlucky placement failures. */
export function createQuestPuzzle(random: () => number = Math.random, count: QuestCount = 6): QuestPuzzle {
  const targets = shuffle(QUEST_WORDS, random)
    .slice(0, QUEST_COUNTS.includes(count) ? count : 6)
    .sort((a, b) => b.length - a.length);
  let letters = Array<string>(QUEST_SIZE * QUEST_SIZE).fill("");
  let words: QuestMatch[] = [];
  for (const word of targets) {
    const options = questPlacements(word, letters);
    const cells = options[Math.floor(random() * options.length)];
    if (!cells) break;
    cells.forEach((cell, index) => {
      letters[cell] = word[index]!;
    });
    words.push({ word, cells });
  }
  if (words.length !== targets.length) {
    letters = Array<string>(QUEST_SIZE * QUEST_SIZE).fill("");
    words = [];
    const rows = shuffle(
      Array.from({ length: QUEST_SIZE }, (_, index) => index),
      random,
    );
    for (const [index, word] of targets.entries()) {
      const offset = Math.floor(random() * (QUEST_SIZE - word.length + 1));
      const start = rows[index]! * QUEST_SIZE + offset;
      const line = questLine(start, start + word.length - 1)!;
      const cells = random() < 0.5 ? line : line.reverse();
      cells.forEach((cell, letter) => {
        letters[cell] = word[letter]!;
      });
      words.push({ word, cells });
    }
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  letters = letters.map((letter) => letter || alphabet[Math.floor(random() * alphabet.length)]!);
  return { size: QUEST_SIZE, letters, words: words.sort((a, b) => a.word.localeCompare(b.word)) };
}

/** Accept visible target words, including an accidental second occurrence, once only. */
export function matchQuestSelection(
  puzzle: QuestPuzzle,
  start: number,
  end: number,
  found: readonly QuestWord[],
): QuestMatch | null {
  const cells = questLine(start, end, puzzle.size);
  if (!cells || cells.length < 2 || puzzle.letters.length !== puzzle.size * puzzle.size)
    return null;
  const selected = cells.map((cell) => puzzle.letters[cell]).join("");
  const reverse = [...selected].reverse().join("");
  const target = puzzle.words.find(({ word }) => word === selected || word === reverse);
  if (!target || found.includes(target.word)) return null;
  return { word: target.word, cells };
}


/** Reveal a start or a full direction for a selected, still-unfound word. No board mutation. */
export function questHint(puzzle: QuestPuzzle, found: readonly QuestWord[], preferred?: QuestWord | null, showDirection = false) {
  const remaining = puzzle.words.filter(match => !found.includes(match.word));
  const target = remaining.find(match => match.word === preferred) ?? remaining[0];
  if (!target?.cells.length) return null;
  const first = target.cells[0]!;
  const last = target.cells.at(-1)!;
  const rowDelta = Math.sign(Math.floor(last / puzzle.size) - Math.floor(first / puzzle.size));
  const columnDelta = Math.sign(last % puzzle.size - first % puzzle.size);
  const direction = [rowDelta < 0 ? "up" : rowDelta > 0 ? "down" : "", columnDelta < 0 ? "left" : columnDelta > 0 ? "right" : ""].filter(Boolean).join(" and ");
  return { word: target.word, first, last: showDirection ? last : null, direction: showDirection ? direction : null };
}
