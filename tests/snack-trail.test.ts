import { describe, expect, test } from "bun:test";
import {
  SNACK_TRAIL_CELLS,
  SNACK_TRAIL_MAX_STEPS,
  canSnackTick,
  createSnackTrail,
  isSnackDirection,
  oppositeSnackDirection,
  pauseSnackTrail,
  placeSnackFood,
  queueSnackDirection,
  resumeSnackTrail,
  scheduleSnackTick,
  snackDirectionForKey,
  snackTickDelay,
  stepSnackTrail,
  type SnackDirection,
  type SnackTrailState,
} from "../src/lib/snack-trail";

function position(
  snake: readonly number[],
  direction: SnackDirection,
  food: number | null = 99,
): SnackTrailState {
  return Object.freeze({
    ...createSnackTrail("running"),
    snake: Object.freeze([...snake]),
    direction,
    food,
    score: snake.length - 3,
  });
}

function fakeClock() {
  const callbacks: (() => void)[] = [];
  const cancelled: unknown[] = [];
  const delays: number[] = [];
  return {
    callbacks,
    cancelled,
    delays,
    schedule(callback: () => void, delay: number) {
      callbacks.push(callback);
      delays.push(delay);
      return callbacks.length - 1;
    },
    cancel(handle: unknown) {
      cancelled.push(handle);
    },
  };
}

describe("Snack Trail movement and food", () => {
  test("starts ready with a stable safe opening and requires an explicit running round", () => {
    const ready = createSnackTrail();
    expect(ready.phase).toBe("ready");
    expect(ready.snake).toEqual([44, 43, 42]);
    expect(ready.direction).toBe("right");
    expect(ready.food).toBe(47);
    expect(ready.score).toBe(0);
    expect(ready.steps).toBe(0);
    expect(stepSnackTrail(ready)).toBe(ready);
    expect(queueSnackDirection(ready, "up")).toBe(ready);
    expect(createSnackTrail("running").phase).toBe("running");
  });

  test("ordinary movement advances the head, vacates the tail and preserves input", () => {
    const initial = position([44, 43, 42], "right", 47);
    const original = JSON.stringify(initial);
    const next = stepSnackTrail(initial);
    expect(next.snake).toEqual([45, 44, 43]);
    expect(next.steps).toBe(1);
    expect(next.score).toBe(0);
    expect(next.food).toBe(47);
    expect(next.phase).toBe("running");
    expect(JSON.stringify(initial)).toBe(original);
  });

  test("food grows the trail by one, increments score and respawns on a free cell", () => {
    let state = createSnackTrail("running");
    state = stepSnackTrail(stepSnackTrail(state));
    const next = stepSnackTrail(state, 0.5);
    expect(next.snake).toEqual([47, 46, 45, 44]);
    expect(next.score).toBe(1);
    expect(next.steps).toBe(3);
    expect(next.food).not.toBeNull();
    expect(next.snake).not.toContain(next.food);
    expect(next.phase).toBe("running");
    expect(state.snake).toHaveLength(3);
    expect(state.food).toBe(47);
  });

  test("moving into the vacating tail is legal when not growing", () => {
    const initial = position([11, 12, 22, 21], "down");
    const next = stepSnackTrail(initial);
    expect(next.snake).toEqual([21, 11, 12, 22]);
    expect(next.phase).toBe("running");
    expect(new Set(next.snake).size).toBe(4);
    // If a supplied growth position keeps the tail occupied, it cannot be entered.
    expect(stepSnackTrail({ ...initial, food: 21 }).collision).toBe("body");
  });

  test("a non-tail body cell ends the round without moving or changing its food", () => {
    const initial = position([11, 12, 22, 21, 20], "down");
    const lost = stepSnackTrail(initial);
    expect(lost.phase).toBe("lost");
    expect(lost.collision).toBe("body");
    expect(lost.snake).toBe(initial.snake);
    expect(lost.food).toBe(initial.food);
    expect(lost.score).toBe(initial.score);
    expect(lost.steps).toBe(1);
    expect(stepSnackTrail(lost)).toBe(lost);
  });

  test("all four walls cause a loss and horizontal moves never wrap rows", () => {
    const cases: [number[], SnackDirection][] = [
      [[0, 1, 2], "left"],
      [[9, 8, 7], "right"],
      [[2, 12, 22], "up"],
      [[92, 82, 72], "down"],
    ];
    for (const [snake, direction] of cases) {
      const initial = position(snake, direction);
      const next = stepSnackTrail(initial);
      expect(next.phase).toBe("lost");
      expect(next.collision).toBe("wall");
      expect(next.snake).toBe(initial.snake);
      expect(next.queuedDirection).toBeNull();
      expect(queueSnackDirection(next, "up")).toBe(next);
    }
  });

  test("food placement is bounded, never occupies the trail, and handles a full tray", () => {
    const snake = [0, 1, 50, 98, 99];
    for (const sample of [0, 0.01, 0.5, 0.99999, 1, -1, 2, NaN, Infinity, -Infinity]) {
      const food = placeSnackFood(snake, sample);
      expect(food).not.toBeNull();
      expect(Number.isInteger(food)).toBe(true);
      expect(food!).toBeGreaterThanOrEqual(0);
      expect(food!).toBeLessThan(SNACK_TRAIL_CELLS);
      expect(snake).not.toContain(food);
    }
    const almostFull = Array.from({ length: 100 }, (_, cell) => cell).filter((cell) => cell !== 73);
    expect(placeSnackFood(almostFull, 0)).toBe(73);
    expect(placeSnackFood(almostFull, 1)).toBe(73);
    expect(placeSnackFood(Array.from({ length: 100 }, (_, cell) => cell))).toBeNull();
    for (const invalid of [-1, 100, 1.5, NaN, Infinity])
      expect(placeSnackFood([invalid])).toBeNull();
    expect(placeSnackFood([], 0)).toBe(0);
    expect(placeSnackFood([], 1)).toBe(99);
  });

  test("the final snack fills the tray and wins without attempting to place more food", () => {
    const path = Array.from({ length: 10 }, (_, row) =>
      Array.from({ length: 10 }, (_, offset) => row * 10 + (row % 2 === 0 ? offset : 9 - offset)),
    ).flat();
    const initial = position(path.slice(0, -1).reverse(), "left", 90);
    expect(initial.snake[0]).toBe(91);
    expect(initial.snake).toHaveLength(99);
    const won = stepSnackTrail(initial, 0.99);
    expect(won.phase).toBe("won");
    expect(won.score).toBe(97);
    expect(won.food).toBeNull();
    expect(new Set(won.snake).size).toBe(100);
    expect(stepSnackTrail(won)).toBe(won);
    expect(queueSnackDirection(won, "up")).toBe(won);
  });

  test("a complete playable circuit can collect every snack without any collision", () => {
    const circuit = Array.from({ length: 10 }, (_, column) => column);
    for (let row = 1; row < 10; row++) {
      for (let offset = 0; offset < 9; offset++)
        circuit.push(row * 10 + (row % 2 === 1 ? 9 - offset : 1 + offset));
    }
    for (let row = 9; row >= 1; row--) circuit.push(row * 10);
    expect(new Set(circuit).size).toBe(100);
    let state = createSnackTrail("running");
    for (let step = 0; step < 10_000 && state.phase === "running"; step++) {
      const head = state.snake[0]!;
      const nextCell = circuit[(circuit.indexOf(head) + 1) % circuit.length]!;
      const direction: SnackDirection =
        nextCell === head + 10
          ? "down"
          : nextCell === head - 10
            ? "up"
            : nextCell === head + 1
              ? "right"
              : "left";
      state = stepSnackTrail(queueSnackDirection(state, direction), 0.37);
      expect(state.phase).not.toBe("lost");
      expect(state.snake.length).toBe(state.score + 3);
      expect(new Set(state.snake).size).toBe(state.snake.length);
      if (state.food !== null) expect(state.snake).not.toContain(state.food);
    }
    expect(state.phase).toBe("won");
    expect(state.score).toBe(97);
  });

  test("the displayed step bound does not prevent subsequent movement", () => {
    const state = { ...createSnackTrail("running"), steps: SNACK_TRAIL_MAX_STEPS - 1 };
    const capped = stepSnackTrail(state);
    const following = stepSnackTrail(capped);
    expect(capped.steps).toBe(SNACK_TRAIL_MAX_STEPS);
    expect(following.steps).toBe(SNACK_TRAIL_MAX_STEPS);
    expect(following.snake[0]).toBe(46);
    expect(following.snake).not.toBe(capped.snake);
  });
});

describe("Snack Trail direction input", () => {
  test("rejects reversals and accepts only one valid turn between committed steps", () => {
    const initial = createSnackTrail("running");
    expect(queueSnackDirection(initial, "left")).toBe(initial);
    expect(queueSnackDirection(initial, "right")).toBe(initial);
    const up = queueSnackDirection(initial, "up");
    expect(up.direction).toBe("right");
    expect(up.queuedDirection).toBe("up");
    for (const second of ["left", "down", "right", "up"])
      expect(queueSnackDirection(up, second)).toBe(up);
    const moved = stepSnackTrail(up);
    expect(moved.snake[0]).toBe(34);
    expect(moved.direction).toBe("up");
    expect(moved.queuedDirection).toBeNull();
    expect(stepSnackTrail(queueSnackDirection(moved, "left")).snake[0]).toBe(33);
    for (const direction of ["up", "right", "down", "left"] as const) {
      const state = { ...initial, direction };
      expect(queueSnackDirection(state, oppositeSnackDirection(direction))).toBe(state);
    }
  });

  test("invalid directions, unrelated keys and malformed heads are harmless", () => {
    const state = createSnackTrail("running");
    for (const value of [undefined, null, {}, 1, "diagonal", "ArrowUp", "constructor", ""]) {
      expect(isSnackDirection(value)).toBe(false);
      expect(queueSnackDirection(state, value)).toBe(state);
    }
    for (const key of ["Enter", "Tab", " ", "Escape", "toString", "__proto__", "constructor"])
      expect(snackDirectionForKey(key)).toBeNull();
    expect(snackDirectionForKey("ArrowLeft")).toBe("left");
    expect(snackDirectionForKey("W")).toBe("up");
    expect(snackDirectionForKey("s")).toBe("down");
    for (const snake of [[], [NaN], [-1], [100]]) {
      const malformed = { ...state, snake };
      expect(stepSnackTrail(malformed)).toBe(malformed);
    }
  });
});

describe("Snack Trail interruption and clock lifecycle", () => {
  test("every interruption pauses movement and clears a queued turn", () => {
    for (const reason of ["player", "hidden", "blurred", "picker"] as const) {
      const active = queueSnackDirection(createSnackTrail("running"), "up");
      const paused = pauseSnackTrail(active, reason);
      expect(paused.phase).toBe("paused");
      expect(paused.pauseReason).toBe(reason);
      expect(paused.queuedDirection).toBeNull();
      expect(paused.snake).toBe(active.snake);
      expect(stepSnackTrail(paused)).toBe(paused);
      expect(queueSnackDirection(paused, "down")).toBe(paused);
      expect(canSnackTick(paused, "slow", { hidden: false, suspended: false, focused: true })).toBe(
        false,
      );
      const resumed = resumeSnackTrail(paused);
      expect(resumed.phase).toBe("running");
      expect(resumed.pauseReason).toBeNull();
      expect(resumed.steps).toBe(active.steps);
      expect(resumed.snake).toBe(active.snake);
    }
  });

  test("closing a picker or returning to the window does not itself resume play", () => {
    const paused = pauseSnackTrail(createSnackTrail("running"), "picker");
    expect(canSnackTick(paused, "standard", { suspended: false, focused: true })).toBe(false);
    for (const environment of [{ suspended: true }, { hidden: true }, { focused: false }]) {
      expect(resumeSnackTrail(paused, environment)).toBe(paused);
      expect(canSnackTick(createSnackTrail("running"), "slow", environment)).toBe(false);
    }
    expect(canSnackTick(resumeSnackTrail(paused), "standard")).toBe(true);
    expect(canSnackTick(createSnackTrail("running"), "step")).toBe(false);
    for (const phase of ["ready", "won", "lost"] as const) {
      const state = { ...createSnackTrail(), phase };
      expect(pauseSnackTrail(state)).toBe(state);
      expect(resumeSnackTrail(state)).toBe(state);
    }
  });

  test("one-shot timers never repeat or accumulate catch-up movement", () => {
    const clock = fakeClock();
    let steps = 0;
    const cancel = scheduleSnackTick(
      () => {
        steps++;
      },
      snackTickDelay("slow"),
      clock,
    );
    expect(clock.callbacks).toHaveLength(1);
    expect(clock.delays).toEqual([700]);
    clock.callbacks[0]!();
    clock.callbacks[0]!();
    expect(steps).toBe(1);
    expect(clock.callbacks).toHaveLength(1);
    cancel();
    expect(clock.cancelled).toEqual([0]);
    expect(snackTickDelay("standard")).toBe(350);
    expect(snackTickDelay("step")).toBeNull();
  });

  test("pause/unmount cancellation makes even an already queued callback inert", () => {
    const clock = fakeClock();
    let calls = 0;
    const cleanup = scheduleSnackTick(
      () => {
        calls++;
      },
      350,
      clock,
    );
    cleanup();
    clock.callbacks[0]!();
    expect(calls).toBe(0);
    expect(clock.cancelled).toEqual([0]);
    for (const invalidDelay of [null, 0, -1, NaN, Infinity]) {
      scheduleSnackTick(
        () => {
          calls++;
        },
        invalidDelay,
        clock,
      )();
    }
    expect(clock.callbacks).toHaveLength(1);
    expect(calls).toBe(0);
  });

  test("restart before the first tick cancels the old clock and a fresh clock advances", () => {
    const clock = fakeClock();
    let state = createSnackTrail("running");
    const oldClock = scheduleSnackTick(
      () => {
        state = stepSnackTrail(state);
      },
      700,
      clock,
    );
    oldClock();
    state = createSnackTrail("running");
    const newClock = scheduleSnackTick(
      () => {
        state = stepSnackTrail(state);
      },
      700,
      clock,
    );
    clock.callbacks[0]!();
    expect(state.steps).toBe(0);
    clock.callbacks[1]!();
    expect(state.steps).toBe(1);
    expect(state.snake[0]).toBe(45);
    newClock();
    expect(clock.cancelled).toEqual([0, 1]);
  });
});
