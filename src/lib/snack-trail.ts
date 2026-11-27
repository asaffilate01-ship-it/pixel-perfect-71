/** Original, local Snake rules. Cells are zero-based, row-major indexes. */
export const SNACK_TRAIL_SIZE = 10;
export const SNACK_TRAIL_CELLS = 100;
export const SNACK_TRAIL_MAX_STEPS = 100_000;
export type SnackDirection = "up" | "right" | "down" | "left";
export type SnackPace = "slow" | "standard" | "step";
export type SnackPhase = "ready" | "running" | "paused" | "won" | "lost";
export type SnackPauseReason = "player" | "hidden" | "blurred" | "picker";
export type SnackCollision = "wall" | "body";
export interface SnackTrailState {
  readonly snake: readonly number[];
  readonly direction: SnackDirection;
  readonly queuedDirection: SnackDirection | null;
  readonly food: number | null;
  readonly score: number;
  readonly steps: number;
  readonly phase: SnackPhase;
  readonly pauseReason: SnackPauseReason | null;
  readonly collision: SnackCollision | null;
}
export interface SnackEnvironment {
  readonly hidden?: boolean;
  readonly suspended?: boolean;
  readonly focused?: boolean;
}
const OPPOSITE: Record<SnackDirection, SnackDirection> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};
const DIRECTIONS = ["up", "right", "down", "left"] as const;

export function isSnackDirection(value: unknown): value is SnackDirection {
  return DIRECTIONS.some((direction) => direction === value);
}
export function oppositeSnackDirection(direction: SnackDirection): SnackDirection {
  return OPPOSITE[direction];
}
export function snackDirectionForKey(key: string): SnackDirection | null {
  const keys: Record<string, SnackDirection> = {
    ArrowUp: "up",
    ArrowRight: "right",
    ArrowDown: "down",
    ArrowLeft: "left",
    w: "up",
    d: "right",
    s: "down",
    a: "left",
  };
  const direction = keys[key] ?? keys[key.toLowerCase()];
  return isSnackDirection(direction) ? direction : null;
}

export function createSnackTrail(phase: "ready" | "running" = "ready"): SnackTrailState {
  return {
    snake: [44, 43, 42],
    direction: "right",
    queuedDirection: null,
    food: 47,
    score: 0,
    steps: 0,
    phase,
    pauseReason: null,
    collision: null,
  };
}

/** Select from free cells directly; a full tray has no food, without any retry loop. */
export function placeSnackFood(snake: readonly number[], sample = 0): number | null {
  if (snake.some((cell) => !Number.isInteger(cell) || cell < 0 || cell >= SNACK_TRAIL_CELLS))
    return null;
  const occupied = new Set(snake);
  const free = Array.from({ length: SNACK_TRAIL_CELLS }, (_, cell) => cell).filter(
    (cell) => !occupied.has(cell),
  );
  if (!free.length) return null;
  const fraction = Number.isFinite(sample) ? Math.max(0, Math.min(1, sample)) : 0;
  return free[Math.min(free.length - 1, Math.floor(fraction * free.length))] ?? null;
}

/** Only the first valid turn between steps is accepted; rapid input cannot reverse the trail. */
export function queueSnackDirection(state: SnackTrailState, input: unknown): SnackTrailState {
  if (
    state.phase !== "running" ||
    state.queuedDirection !== null ||
    !isSnackDirection(input) ||
    input === state.direction ||
    input === OPPOSITE[state.direction]
  )
    return state;
  return { ...state, queuedDirection: input };
}

export function stepSnackTrail(state: SnackTrailState, sample = 0): SnackTrailState {
  if (state.phase !== "running") return state;
  const head = state.snake[0];
  if (head === undefined || !Number.isInteger(head) || head < 0 || head >= SNACK_TRAIL_CELLS)
    return state;
  const direction = state.queuedDirection ?? state.direction;
  const row =
    Math.floor(head / SNACK_TRAIL_SIZE) + (direction === "down" ? 1 : direction === "up" ? -1 : 0);
  const column =
    (head % SNACK_TRAIL_SIZE) + (direction === "right" ? 1 : direction === "left" ? -1 : 0);
  const steps = Math.min(SNACK_TRAIL_MAX_STEPS, state.steps + 1);
  if (row < 0 || row >= SNACK_TRAIL_SIZE || column < 0 || column >= SNACK_TRAIL_SIZE)
    return { ...state, direction, queuedDirection: null, steps, phase: "lost", collision: "wall" };
  const nextHead = row * SNACK_TRAIL_SIZE + column;
  const grows = nextHead === state.food;
  // The last cell vacates on an ordinary step, so moving into it is legal.
  const occupied = grows ? state.snake : state.snake.slice(0, -1);
  if (occupied.includes(nextHead))
    return { ...state, direction, queuedDirection: null, steps, phase: "lost", collision: "body" };
  const snake = [nextHead, ...state.snake];
  if (!grows) snake.pop();
  const food = grows ? placeSnackFood(snake, sample) : state.food;
  return {
    ...state,
    snake,
    direction,
    queuedDirection: null,
    food,
    steps,
    score: state.score + (grows ? 1 : 0),
    phase: snake.length === SNACK_TRAIL_CELLS ? "won" : "running",
    collision: null,
  };
}

export function pauseSnackTrail(
  state: SnackTrailState,
  reason: SnackPauseReason = "player",
): SnackTrailState {
  return state.phase === "running"
    ? { ...state, phase: "paused", pauseReason: reason, queuedDirection: null }
    : state;
}
export function resumeSnackTrail(
  state: SnackTrailState,
  environment: SnackEnvironment = {},
): SnackTrailState {
  if (
    state.phase !== "paused" ||
    environment.hidden ||
    environment.suspended ||
    environment.focused === false
  )
    return state;
  return { ...state, phase: "running", pauseReason: null, queuedDirection: null };
}
export function snackTickDelay(pace: SnackPace): number | null {
  return pace === "step" ? null : pace === "slow" ? 700 : 350;
}
export function canSnackTick(
  state: SnackTrailState,
  pace: SnackPace,
  environment: SnackEnvironment = {},
): boolean {
  return (
    state.phase === "running" &&
    pace !== "step" &&
    !environment.hidden &&
    !environment.suspended &&
    environment.focused !== false
  );
}

/** One cancellable tick, never an interval or accumulated catch-up loop. */
export function scheduleSnackTick(
  callback: () => void,
  delay: number | null,
  clock: {
    schedule: (callback: () => void, delay: number) => unknown;
    cancel: (handle: unknown) => void;
  },
): () => void {
  if (delay === null || !Number.isFinite(delay) || delay <= 0) return () => {};
  let active = true;
  const handle = clock.schedule(() => {
    if (!active) return;
    active = false;
    callback();
  }, delay);
  return () => {
    active = false;
    clock.cancel(handle);
  };
}

/** Explicit local-only save slot. Restored boards never start a moving clock. */
export const SNACK_TRAIL_SAVE_KEY = "mealdeck-snack-trail-save-v1";
export type SnackTrailSave = {
  version: 1;
  roundId: string;
  pace: SnackPace;
  round: SnackTrailState;
};

function isSnackPace(value: unknown): value is SnackPace {
  return value === "slow" || value === "standard" || value === "step";
}
function validCell(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < SNACK_TRAIL_CELLS;
}
function adjacentCells(a: number, b: number): boolean {
  return Math.abs(Math.floor(a / SNACK_TRAIL_SIZE) - Math.floor(b / SNACK_TRAIL_SIZE)) +
    Math.abs(a % SNACK_TRAIL_SIZE - b % SNACK_TRAIL_SIZE) === 1;
}

/** Untrusted storage is validated for geometry, score, direction and bounded fields. */
export function parseSnackTrailSave(raw: string | null): SnackTrailSave | null {
  if (!raw || raw.length > 8_000) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || typeof value.roundId !== "string" ||
        !/^[A-Za-z0-9_-]{8,80}$/.test(value.roundId) || !isSnackPace(value.pace)) return null;
    const r = value.round;
    if (!r || r.phase !== "paused" || !Array.isArray(r.snake) ||
        r.snake.length < 3 || r.snake.length >= SNACK_TRAIL_CELLS ||
        !r.snake.every(validCell) || new Set(r.snake).size !== r.snake.length ||
        !isSnackDirection(r.direction) || !validCell(r.food) || r.snake.includes(r.food) ||
        !Number.isSafeInteger(r.score) || r.score !== r.snake.length - 3 ||
        !Number.isSafeInteger(r.steps) || r.steps < r.score || r.steps > SNACK_TRAIL_MAX_STEPS)
      return null;
    const snake: number[] = [...r.snake];
    if (snake.some((cell, i) => i > 0 && !adjacentCells(cell, snake[i - 1]!))) return null;
    const head = snake[0]!;
    const neck = snake[1]!;
    const expected = head === neck + 1 ? "right" : head === neck - 1 ? "left" : head === neck + SNACK_TRAIL_SIZE ? "down" : "up";
    if (r.direction !== expected) return null;
    return {
      version: 1,
      roundId: value.roundId,
      pace: value.pace,
      round: {
        snake, direction: r.direction, food: r.food, score: r.score, steps: r.steps,
        phase: "paused", queuedDirection: null, pauseReason: "player", collision: null,
      },
    };
  } catch {
    return null;
  }
}

export function createSnackTrailSave(round: SnackTrailState, pace: SnackPace, roundId: string): SnackTrailSave | null {
  if (round.phase !== "running" && round.phase !== "paused") return null;
  return parseSnackTrailSave(JSON.stringify({
    version: 1,
    roundId,
    pace,
    round: { ...round, phase: "paused", queuedDirection: null, pauseReason: "player", collision: null },
  }));
}

/** Ignore taps, short drags and diagonal ambiguity. */
export function snackSwipeDirection(dx: number, dy: number, threshold = 24): SnackDirection | null {
  if (![dx, dy, threshold].every(Number.isFinite) || threshold <= 0) return null;
  const x = Math.abs(dx), y = Math.abs(dy);
  if (Math.max(x, y) < threshold || Math.max(x, y) < Math.min(x, y) * 1.3) return null;
  return x > y ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
}
