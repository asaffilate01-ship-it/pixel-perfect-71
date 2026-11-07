import { seededRandom } from "./arcade-games";

export const PANTRY_LEVELS = {
  gentle: { size: 5, chillies: 4, label: "Gentle pantry" },
  bigger: { size: 6, chillies: 6, label: "Bigger pantry" },
} as const;
export type PantryLevel = keyof typeof PANTRY_LEVELS;
export type PantrySize = 5 | 6;
export type PantryBoard = {
  chillies: readonly boolean[];
  adjacent: readonly number[];
};
export type PantryState = {
  level: PantryLevel;
  size: PantrySize;
  chilliCount: number;
  seed: number | null;
  board: PantryBoard | null;
  opened: readonly boolean[];
  flagged: readonly boolean[];
  status: "ready" | "playing" | "won" | "lost";
  hit: number | null;
  actions: number;
};
export type PantryCellView =
  | { kind: "covered" }
  | { kind: "flagged" }
  | { kind: "safe"; adjacent: number; misflagged: boolean }
  | { kind: "chilli"; hit: boolean; flagged: boolean };

function validSize(size: number): size is PantrySize {
  return size === 5 || size === 6;
}

function validIndex(index: number, size: PantrySize): boolean {
  return Number.isInteger(index) && index >= 0 && index < size * size;
}

function validSeed(seed: number): boolean {
  return Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff;
}

export function pantryNeighbours(index: number, size: PantrySize): number[] {
  if (!validSize(size) || !validIndex(index, size)) return [];
  const row = Math.floor(index / size);
  const column = index % size;
  const neighbours: number[] = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nextRow = row + dr;
      const nextColumn = column + dc;
      if (nextRow >= 0 && nextRow < size && nextColumn >= 0 && nextColumn < size)
        neighbours.push(nextRow * size + nextColumn);
    }
  }
  return neighbours;
}

/** Finite seeded shuffle. The first reveal and its neighbours are protected when space allows. */
export function generatePantryBoard(
  size: PantrySize,
  chilliCount: number,
  firstReveal: number,
  seed: number,
): PantryBoard {
  if (
    !validSize(size) ||
    !validIndex(firstReveal, size) ||
    !validSeed(seed) ||
    !Number.isInteger(chilliCount) ||
    chilliCount < 0 ||
    chilliCount >= size * size
  )
    throw new RangeError("Choose a valid pantry, first square, chilli count and integer seed.");
  const safePatch = [firstReveal, ...pantryNeighbours(firstReveal, size)];
  const excluded = new Set(
    size * size - safePatch.length >= chilliCount ? safePatch : [firstReveal],
  );
  const choices = Array.from({ length: size * size }, (_, index) => index).filter(
    (index) => !excluded.has(index),
  );
  const random = seededRandom(seed);
  for (let index = choices.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const saved = choices[index]!;
    choices[index] = choices[other]!;
    choices[other] = saved;
  }
  const chillies = Array<boolean>(size * size).fill(false);
  for (const index of choices.slice(0, chilliCount)) chillies[index] = true;
  const adjacent = chillies.map((_, index) =>
    pantryNeighbours(index, size).reduce(
      (count, neighbour) => count + Number(chillies[neighbour]),
      0,
    ),
  );
  return { chillies, adjacent };
}

/** Start sets up a covered tray. No hidden board or random seed exists until the first reveal. */
export function createPantryState(level: PantryLevel): PantryState {
  if (level !== "gentle" && level !== "bigger")
    throw new RangeError("Choose a supported pantry size.");
  const config = PANTRY_LEVELS[level];
  return {
    level,
    size: config.size,
    chilliCount: config.chillies,
    seed: null,
    board: null,
    opened: Array<boolean>(config.size * config.size).fill(false),
    flagged: Array<boolean>(config.size * config.size).fill(false),
    status: "ready",
    hit: null,
    actions: 0,
  };
}

export function pantryIsOver(state: PantryState): boolean {
  return state.status === "won" || state.status === "lost";
}

export function pantryFlagsLeft(state: PantryState): number {
  return Math.max(0, state.chilliCount - state.flagged.filter(Boolean).length);
}

export function pantrySafeOpened(state: PantryState): number {
  return state.opened.reduce(
    (count, opened, index) => count + Number(opened && state.board?.chillies[index] === false),
    0,
  );
}

export function togglePantryFlag(state: PantryState, index: number): PantryState {
  if (!validIndex(index, state.size) || pantryIsOver(state) || state.opened[index]) return state;
  if (!state.flagged[index] && pantryFlagsLeft(state) === 0) return state;
  const flagged = [...state.flagged];
  flagged[index] = !flagged[index];
  return { ...state, flagged, actions: state.actions + 1 };
}

/** A seed is used only for a valid first reveal; later reveals reuse the immutable board. */
export function revealPantryCell(state: PantryState, index: number, seed = 0): PantryState {
  if (
    !validIndex(index, state.size) ||
    pantryIsOver(state) ||
    state.opened[index] ||
    state.flagged[index]
  )
    return state;
  if (!state.board && !validSeed(seed)) return state;
  const board = state.board ?? generatePantryBoard(state.size, state.chilliCount, index, seed);
  const opened = [...state.opened];
  if (board.chillies[index]) {
    opened[index] = true;
    return {
      ...state,
      board,
      seed: state.seed ?? seed,
      opened,
      status: "lost",
      hit: index,
      actions: state.actions + 1,
    };
  }
  const pending = [index];
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const current = pending[cursor]!;
    if (opened[current] || state.flagged[current] || board.chillies[current]) continue;
    opened[current] = true;
    if (board.adjacent[current] === 0) {
      for (const neighbour of pantryNeighbours(current, state.size)) {
        if (!opened[neighbour] && !state.flagged[neighbour] && !board.chillies[neighbour])
          pending.push(neighbour);
      }
    }
  }
  const won = board.chillies.every((chilli, position) => chilli || opened[position]);
  return {
    ...state,
    board,
    seed: state.seed ?? seed,
    opened,
    status: won ? "won" : "playing",
    actions: state.actions + 1,
  };
}

/** The UI reads this projection so covered squares never expose hidden counts or chillies. */
export function pantryCellView(state: PantryState, index: number): PantryCellView | null {
  if (!validIndex(index, state.size)) return null;
  const ended = pantryIsOver(state);
  if (!state.board || (!state.opened[index] && !ended))
    return { kind: state.flagged[index] ? "flagged" : "covered" };
  if (state.board.chillies[index])
    return { kind: "chilli", hit: state.hit === index, flagged: !!state.flagged[index] };
  return {
    kind: "safe",
    adjacent: state.board.adjacent[index] ?? 0,
    misflagged: ended && !!state.flagged[index],
  };
}

export function pantryFocusMove(index: number, key: string, size: PantrySize): number | null {
  if (!validSize(size) || !validIndex(index, size)) return null;
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
