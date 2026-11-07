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
