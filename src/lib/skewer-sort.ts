import { seededRandom } from "./arcade-games";

export const SKEWER_CAPACITY = 3;
export type SkewerFood = 0 | 1 | 2 | 3;
export type SkewerFoodCount = 3 | 4;
/** Foods are stored from the bottom of a skewer to its top. */
export type SkewerBoard = readonly (readonly SkewerFood[])[];
export type SkewerMove = { from: number; to: number };
export type SkewerPuzzle = {
  foodCount: SkewerFoodCount;
  skewers: SkewerBoard;
  /** A legal solution certificate, transformed with the starting layout. */
  solution: readonly SkewerMove[];
};
export type SkewerState = {
  foodCount: SkewerFoodCount;
  skewers: SkewerBoard;
  history: readonly { skewers: SkewerBoard; move: SkewerMove }[];
  moves: number;
};

type Template = { skewers: SkewerBoard; solution: readonly (readonly [number, number])[] };

// Original finite layouts. Their certificates are independently replayed and
// solved in tests. Permuting food labels and skewer positions preserves legality;
// generation never searches or retries and always leaves exactly two empties.
const TEMPLATES: Record<SkewerFoodCount, readonly Template[]> = {
  3: [
    {
      skewers: [[1, 0, 2], [0, 2, 1], [1, 2, 0], [], []],
      solution: [
        [0, 3],
        [0, 4],
        [1, 0],
        [1, 3],
        [1, 4],
        [2, 4],
        [2, 3],
        [2, 0],
      ],
    },
    {
      skewers: [[1, 2, 1], [2, 0, 0], [0, 1, 2], [], []],
      solution: [
        [0, 3],
        [0, 4],
        [0, 3],
        [2, 4],
        [2, 3],
        [1, 2],
        [1, 2],
        [1, 4],
      ],
    },
    {
      skewers: [[1, 1, 0], [0, 2, 1], [2, 0, 2], [], []],
      solution: [
        [0, 3],
        [1, 0],
        [1, 4],
        [1, 3],
        [2, 4],
        [2, 3],
        [2, 4],
      ],
    },
    {
      skewers: [[1, 0, 1], [2, 2, 0], [1, 0, 2], [], []],
      solution: [
        [1, 3],
        [2, 1],
        [2, 3],
        [0, 2],
        [0, 3],
        [0, 2],
      ],
    },
  ],
  4: [
    {
      skewers: [[0, 1, 0], [2, 3, 1], [0, 1, 3], [3, 2, 2], [], []],
      solution: [
        [1, 4],
        [1, 5],
        [2, 5],
        [2, 4],
        [0, 2],
        [0, 4],
        [0, 2],
        [3, 1],
        [3, 1],
        [3, 5],
      ],
    },
    {
      skewers: [[2, 3, 0], [1, 2, 1], [3, 1, 3], [2, 0, 0], [], []],
      solution: [
        [0, 4],
        [0, 5],
        [2, 5],
        [1, 2],
        [1, 0],
        [2, 1],
        [2, 1],
        [2, 5],
        [3, 4],
        [3, 4],
        [3, 0],
      ],
    },
    {
      skewers: [[1, 1, 3], [2, 0, 3], [0, 0, 3], [2, 2, 1], [], []],
      solution: [
        [0, 4],
        [1, 4],
        [2, 4],
        [1, 2],
        [3, 0],
        [1, 3],
      ],
    },
    {
      skewers: [[2, 0, 1], [3, 2, 1], [3, 2, 1], [0, 0, 3], [], []],
      solution: [
        [0, 4],
        [0, 5],
        [1, 4],
        [1, 0],
        [2, 4],
        [2, 0],
        [1, 2],
        [3, 2],
        [5, 3],
      ],
    },
  ],
};

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const saved = result[index];
    const replacement = result[other];
    if (saved !== undefined && replacement !== undefined) {
      result[index] = replacement;
      result[other] = saved;
    }
  }
  return result;
}

export function createSkewerPuzzle(foodCount: SkewerFoodCount, seed: number): SkewerPuzzle {
  if ((foodCount !== 3 && foodCount !== 4) || !Number.isFinite(seed)) {
    throw new RangeError("Choose three or four foods and a finite seed.");
  }
  const random = seededRandom(seed);
  const options = TEMPLATES[foodCount];
  const template = options[Math.floor(random() * options.length)] ?? options[0];
  if (!template) throw new Error("Missing skewer layout.");
  const foods = shuffled(
    Array.from({ length: foodCount }, (_, index) => index as SkewerFood),
    random,
  );
  const order = shuffled(
    Array.from({ length: foodCount + 2 }, (_, index) => index),
    random,
  );
  const skewers = order.map((oldIndex) =>
    (template.skewers[oldIndex] ?? []).map((food) => foods[food] ?? food),
  );
  const solution = template.solution.map(([from, to]) => ({
    from: order.indexOf(from),
    to: order.indexOf(to),
  }));
  return { foodCount, skewers, solution };
}

export function canMoveSkewer(skewers: SkewerBoard, from: number, to: number): boolean {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from === to)
    return false;
  const source = skewers[from];
  const target = skewers[to];
  if (
    !source ||
    !target ||
    source.length === 0 ||
    source.length > SKEWER_CAPACITY ||
    target.length >= SKEWER_CAPACITY
  )
    return false;
  const food = source.at(-1);
  return food !== undefined && (target.length === 0 || target.at(-1) === food);
}

export function moveSkewer(skewers: SkewerBoard, from: number, to: number): SkewerBoard {
  if (!canMoveSkewer(skewers, from, to)) return skewers;
  const food = skewers[from]?.at(-1);
  if (food === undefined) return skewers;
  return skewers.map((skewer, index) =>
    index === from ? skewer.slice(0, -1) : index === to ? [...skewer, food] : skewer,
  );
}

export function skewerDestinations(skewers: SkewerBoard, from: number): number[] {
  return skewers.flatMap((_, to) => (canMoveSkewer(skewers, from, to) ? [to] : []));
}

export function countSortedSkewers(skewers: SkewerBoard): number {
  return skewers.filter(
    (skewer) => skewer.length === SKEWER_CAPACITY && skewer.every((food) => food === skewer[0]),
  ).length;
}

export function isSkewerComplete(skewers: SkewerBoard, foodCount: SkewerFoodCount): boolean {
  if ((foodCount !== 3 && foodCount !== 4) || skewers.length !== foodCount + 2) return false;
  const counts = Array<number>(foodCount).fill(0);
  for (const skewer of skewers) {
    if (!skewer.length) continue;
    if (
      skewer.length !== SKEWER_CAPACITY ||
      skewer.some(
        (food) => !Number.isInteger(food) || food < 0 || food >= foodCount || food !== skewer[0],
      )
    )
      return false;
    for (const food of skewer) counts[food] = (counts[food] ?? 0) + 1;
  }
  return counts.every((count) => count === SKEWER_CAPACITY);
}

export function createSkewerState(puzzle: SkewerPuzzle): SkewerState {
  return {
    foodCount: puzzle.foodCount,
    skewers: puzzle.skewers.map((skewer) => [...skewer]),
    history: [],
    moves: 0,
  };
}

export function playSkewerMove(state: SkewerState, from: number, to: number): SkewerState {
  if (isSkewerComplete(state.skewers, state.foodCount)) return state;
  const skewers = moveSkewer(state.skewers, from, to);
  if (skewers === state.skewers) return state;
  return {
    ...state,
    skewers,
    history: [...state.history, { skewers: state.skewers, move: { from, to } }],
    moves: state.moves + 1,
  };
}

/** Undo restores the board while retaining the count of accepted moves. */
export function undoSkewerMove(state: SkewerState): SkewerState {
  const previous = state.history.at(-1);
  return previous
    ? { ...state, skewers: previous.skewers, history: state.history.slice(0, -1) }
    : state;
}
