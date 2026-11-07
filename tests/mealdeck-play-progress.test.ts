import { describe, expect, test } from "bun:test";
import {
  ARCADE_PLAYBOOK_KEY,
  MAX_ARCADE_PLAYBOOK_BYTES,
  MAX_ARCADE_ROUNDS,
  appendArcadeCompletion,
  arcadeCompletionLabel,
  arcadeDailyStatus,
  arcadeUtcDate,
  clearArcadeProgress,
  createArcadeCompletionSession,
  createArcadeRoundId,
  emptyArcadeProgress,
  isArcadeDailyDate,
  mergeArcadeProgress,
  millisecondsToNextArcadeDay,
  parseArcadeCompletion,
  parseArcadeProgress,
  readArcadeProgress,
  recordArcadeProgress,
  syncArcadeProgress,
  type ArcadeCompletion,
  type ArcadeProgress,
  type ArcadeProgressStorage,
} from "../src/lib/mealdeck-play-progress";

const NOW = Date.UTC(2026, 10, 7, 12);
const DAY = 24 * 60 * 60 * 1_000;

function completion(id = "round-0001", fields: Partial<ArcadeCompletion> = {}): ArcadeCompletion {
  return { id, game: "sauce-switch", result: "completed", ...fields };
}

function finished(id = "round-0001", at = NOW, fields: Partial<ArcadeCompletion> = {}) {
  return { ...completion(id, fields), completedAt: at };
}

class MemoryStorage implements ArcadeProgressStorage {
  values = new Map<string, string>();
  writes = 0;
  failRead = false;
  failWrite = false;
  getItem(key: string) {
    if (this.failRead) throw new Error("Storage access blocked");
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrite) throw new Error("QuotaExceededError");
    this.writes += 1;
    this.values.set(key, value);
  }
}

describe("playbook validation and bounded history", () => {
  test("distinguishes an empty browser from malformed or unsupported saved data", () => {
    expect(parseArcadeProgress(null, NOW)).toEqual(emptyArcadeProgress());
    expect(parseArcadeProgress(JSON.stringify(emptyArcadeProgress()), NOW)).toEqual(
      emptyArcadeProgress(),
    );
    for (const raw of [
      "",
      "broken",
      "null",
      "[]",
      "{}",
      '{"version":2,"clearedAt":0,"rounds":[]}',
      '{"version":1,"clearedAt":-1,"rounds":[]}',
      " ".repeat(MAX_ARCADE_PLAYBOOK_BYTES + 1),
    ]) {
      expect(parseArcadeProgress(raw, NOW)).toBeNull();
    }
  });

  test("allows exactly the supported completion modes and strips unrelated fields", () => {
    expect(
      parseArcadeCompletion({ ...completion(), customer: "ignored", url: "https://example.com" }),
    ).toEqual(completion());
    for (const game of ["sauce-switch", "menu-quest", "bento-sudoku"] as const) {
      expect(
        parseArcadeCompletion(completion("round-puzzle", { game, dailyDate: "2026-11-07" })),
      ).not.toBeNull();
      expect(parseArcadeCompletion(completion("round-puzzle", { game, result: "win" }))).toBeNull();
    }
    for (const game of ["tray-tactics", "tray-lines"] as const) {
      for (const result of ["completed", "win", "loss", "draw"] as const) {
        expect(
          parseArcadeCompletion(
            completion("round-strategy", { game, result, variant: "solo-casual" }),
          ),
        ).not.toBeNull();
      }
      expect(
        parseArcadeCompletion(completion("round-strategy", { game, dailyDate: "2026-11-07" })),
      ).toBeNull();
    }
    for (const invalid of [
      { game: "feast-2048" },
      { game: "pairs" },
      { game: "unknown" },
      { result: "started" },
      { result: ["completed"] },
      { id: "short" },
      { id: "x".repeat(81) },
      { id: "javascript:alert(1)" },
      { moves: -1 },
      { moves: 1.5 },
      { moves: Infinity },
      { hints: 100_001 },
      { hints: "1" },
      { dailyDate: "2026-02-30" },
      { variant: "https://example.com" },
      { variant: "x".repeat(41) },
    ]) {
      expect(parseArcadeCompletion({ ...completion(), ...invalid })).toBeNull();
    }
  });

  test("stores new game results alongside existing history with accurate result labels", () => {
    let progress = appendArcadeCompletion(emptyArcadeProgress(), completion(), NOW);
    const rounds: ArcadeCompletion[] = [
      {
        id: "round-snack",
        game: "snack-trail",
        result: "loss",
        score: 0,
        moves: 5,
        variant: "step",
      },
      { id: "round-sort", game: "skewer-sort", result: "completed", moves: 17, variant: "small" },
      { id: "round-pantry", game: "pantry-sweep", result: "win", moves: 8, variant: "small" },
    ];
    for (const [index, round] of rounds.entries()) {
      expect(parseArcadeCompletion(round)).toEqual(round);
      progress = appendArcadeCompletion(progress, round, NOW + index + 1);
      expect(parseArcadeCompletion({ ...round, dailyDate: "2026-11-07" })).toBeNull();
    }
    expect(progress.rounds).toHaveLength(4);
    expect(parseArcadeProgress(JSON.stringify(progress), NOW + 3)).toEqual(progress);
    expect(progress.rounds.some((round) => round.game === "sauce-switch")).toBe(true);
    expect(arcadeCompletionLabel(rounds[0]!)).toBe("Round finished");
    expect(arcadeCompletionLabel(rounds[1]!)).toBe("Skewers sorted");
    expect(arcadeCompletionLabel(rounds[2]!)).toBe("Pantry cleared");
    expect(arcadeCompletionLabel({ game: "pantry-sweep", result: "loss" })).toBe("Chilli found");
    expect(arcadeCompletionLabel({ game: "snack-trail", result: "win" })).toBe("Tray filled");
    expect(arcadeCompletionLabel({ game: "tray-lines", result: "loss" })).toBe("Chef won");
    for (const score of [-1, 0.5, Infinity, NaN, 100_001, "4", null]) {
      expect(parseArcadeCompletion({ ...rounds[0], score })).toBeNull();
    }
    expect(parseArcadeCompletion({ ...rounds[1], score: 12 })).toBeNull();
    expect(parseArcadeCompletion({ ...rounds[1], result: "loss" })).toBeNull();
    expect(parseArcadeCompletion({ ...rounds[0], result: "draw" })).toBeNull();
    expect(parseArcadeCompletion({ ...rounds[2], result: "completed" })).toBeNull();
  });

  test("retains the latest 100 distinct finished rounds in a deterministic order", () => {
    const entries = Array.from({ length: MAX_ARCADE_ROUNDS + 25 }, (_, index) =>
      finished(`round-${String(index).padStart(4, "0")}`, NOW - index),
    );
    const parsed = parseArcadeProgress(
      JSON.stringify({ version: 1, clearedAt: 0, rounds: [...entries].reverse() }),
      NOW,
    )!;
    expect(parsed.rounds).toHaveLength(MAX_ARCADE_ROUNDS);
    expect(parsed.rounds[0]!.id).toBe("round-0000");
    expect(parsed.rounds.at(-1)!.id).toBe("round-0099");
    expect(JSON.stringify(parsed).length).toBeLessThan(MAX_ARCADE_PLAYBOOK_BYTES);
    expect(
      parseArcadeProgress(
        JSON.stringify({ version: 1, clearedAt: 0, rounds: Array(501).fill(null) }),
        NOW,
      ),
    ).toBeNull();
  });

  test("counts a round ID once and preserves the first completion after Undo or repeated effects", () => {
    const first = appendArcadeCompletion(
      emptyArcadeProgress(),
      completion("round-first", { moves: 8, hints: 1 }),
      NOW,
    );
    expect(
      appendArcadeCompletion(first, completion("round-first", { moves: 2, hints: 0 }), NOW + 1),
    ).toBe(first);
    expect(first.rounds[0]).toMatchObject({ moves: 8, hints: 1 });
    expect(appendArcadeCompletion(first, { ...completion(), game: "not-tracked" }, NOW + 1)).toBe(
      first,
    );
    const duplicate: ArcadeProgress = {
      version: 1,
      clearedAt: 0,
      rounds: [finished("round-first", NOW + 2, { moves: 2 })],
    };
    expect(mergeArcadeProgress(first, duplicate).rounds).toEqual(first.rounds);
    expect(mergeArcadeProgress(duplicate, first)).toEqual(mergeArcadeProgress(first, duplicate));
  });

  test("rejects corrupt future deletion markers and completion dates", () => {
    for (const timestamp of [
      NOW + DAY + 1,
      8_640_000_000_000_000 - 1,
      Number.MAX_SAFE_INTEGER,
      Infinity,
    ]) {
      expect(
        parseArcadeProgress(JSON.stringify({ version: 1, clearedAt: timestamp, rounds: [] }), NOW),
      ).toBeNull();
      expect(
        parseArcadeProgress(
          JSON.stringify({
            version: 1,
            clearedAt: 0,
            rounds: [finished("round-future", timestamp)],
          }),
          NOW,
        ),
      ).toBeNull();
    }
    expect(
      parseArcadeProgress(
        JSON.stringify({ version: 1, clearedAt: 0, rounds: [finished("round-skewed", NOW + DAY)] }),
        NOW,
      ),
    ).not.toBeNull();
  });

  test("creates valid distinct IDs only when requested", () => {
    const ids = Array.from({ length: 150 }, createArcadeRoundId);
    expect(new Set(ids).size).toBe(150);
    for (const id of ids) expect(parseArcadeCompletion(completion(id))).not.toBeNull();
  });
});

describe("UTC daily checklist", () => {
  test("validates calendar dates and rolls over at UTC midnight", () => {
    expect(isArcadeDailyDate("2028-02-29")).toBe(true);
    for (const date of [
      "2026-02-29",
      "2026-13-01",
      "2026-00-01",
      "2026-1-01",
      "2026-11-07T00:00:00Z",
      "2026-04-31",
    ])
      expect(isArcadeDailyDate(date)).toBe(false);
    const before = Date.UTC(2026, 10, 7, 23, 59, 59, 999);
    expect(arcadeUtcDate(before)).toBe("2026-11-07");
    expect(arcadeUtcDate(before + 1)).toBe("2026-11-08");
    expect(millisecondsToNextArcadeDay(before)).toBe(51);
    expect(millisecondsToNextArcadeDay(Date.UTC(2028, 1, 28))).toBe(DAY + 50);
    expect(arcadeUtcDate(Date.parse("2026-11-07T23:30:00-02:00"))).toBe("2026-11-08");
  });

  test("uses the frozen puzzle date, excludes fresh rounds and reports only three daily games", () => {
    let progress = appendArcadeCompletion(emptyArcadeProgress(), completion("round-fresh"), NOW);
    progress = appendArcadeCompletion(
      progress,
      completion("round-yesterday", { game: "menu-quest", dailyDate: "2026-11-06" }),
      NOW,
    );
    progress = appendArcadeCompletion(
      progress,
      completion("round-midnight", { dailyDate: "2026-11-07" }),
      Date.UTC(2026, 10, 8, 0, 1),
    );
    progress = appendArcadeCompletion(
      progress,
      completion("round-bento", { game: "bento-sudoku", dailyDate: "2026-11-07", hints: 2 }),
      NOW,
    );
    progress = appendArcadeCompletion(
      progress,
      completion("round-tray", { game: "tray-tactics", result: "win" }),
      NOW,
    );
    expect(
      arcadeDailyStatus(progress, "2026-11-07").map(({ id, completed }) => ({ id, completed })),
    ).toEqual([
      { id: "sauce-switch", completed: true },
      { id: "menu-quest", completed: false },
      { id: "bento-sudoku", completed: true },
    ]);
    expect(arcadeDailyStatus(progress, "2026-11-08").every((game) => !game.completed)).toBe(true);
    expect(arcadeDailyStatus(progress, "not-a-date").every((game) => !game.completed)).toBe(true);
  });
});

describe("optional device storage and cross-tab changes", () => {
  test("falls back honestly for unavailable, unreadable and full storage", () => {
    expect(readArcadeProgress(null, NOW)).toMatchObject({ mode: "session", issue: "unavailable" });
    const storage = new MemoryStorage();
    storage.failRead = true;
    expect(readArcadeProgress(storage, NOW)).toMatchObject({
      mode: "session",
      issue: "unavailable",
    });
    storage.failRead = false;
    storage.values.set(ARCADE_PLAYBOOK_KEY, "broken");
    const unreadable = recordArcadeProgress(storage, emptyArcadeProgress(), completion(), NOW);
    expect(unreadable).toMatchObject({ mode: "session", issue: "unreadable" });
    expect(unreadable.progress.rounds).toHaveLength(1);
    expect(storage.values.get(ARCADE_PLAYBOOK_KEY)).toBe("broken");
    storage.values.delete(ARCADE_PLAYBOOK_KEY);
    storage.failWrite = true;
    const full = recordArcadeProgress(storage, emptyArcadeProgress(), completion(), NOW);
    expect(full).toMatchObject({ mode: "session", issue: "write-failed" });
    expect(full.progress.rounds).toHaveLength(1);
    expect(storage.values.has(ARCADE_PLAYBOOK_KEY)).toBe(false);
    storage.failWrite = false;
    const recovered = recordArcadeProgress(
      storage,
      full.progress,
      completion("round-after"),
      NOW + 10,
    );
    expect(recovered.mode).toBe("device");
    expect(recovered.progress.rounds).toHaveLength(2);
  });

  test("reads the latest saved history before recording from another stale tab", () => {
    const storage = new MemoryStorage();
    recordArcadeProgress(storage, emptyArcadeProgress(), completion("round-tab-a"), NOW);
    const second = recordArcadeProgress(
      storage,
      emptyArcadeProgress(),
      completion("round-tab-b"),
      NOW + 10,
    );
    expect(second.progress.rounds.map((round) => round.id)).toEqual(["round-tab-b", "round-tab-a"]);
    expect(readArcadeProgress(storage, NOW + 10).progress).toEqual(second.progress);
  });

  test("Clear survives stale-tab writes and never touches favourites", () => {
    const storage = new MemoryStorage();
    const favouritesKey = "mealdeck-play-favourites-v1";
    storage.values.set(favouritesKey, '["sauce-switch"]');
    const stale = recordArcadeProgress(
      storage,
      emptyArcadeProgress(),
      completion("round-before"),
      NOW,
    ).progress;
    const cleared = clearArcadeProgress(storage, stale, NOW + 10);
    expect(cleared.mode).toBe("device");
    expect(cleared.progress.rounds).toEqual([]);
    expect(syncArcadeProgress(storage, stale, NOW + 20).progress.rounds).toEqual([]);
    const next = recordArcadeProgress(storage, stale, completion("round-after"), NOW + 30);
    expect(next.progress.rounds.map((round) => round.id)).toEqual(["round-after"]);
    expect(next.progress.clearedAt).toBe(cleared.progress.clearedAt);
    expect(storage.values.get(favouritesKey)).toBe('["sauce-switch"]');
  });

  test("reconciles separate additions without an endless storage event write loop", () => {
    const storage = new MemoryStorage();
    const a = appendArcadeCompletion(emptyArcadeProgress(), completion("round-event-a"), NOW);
    const b = appendArcadeCompletion(emptyArcadeProgress(), completion("round-event-b"), NOW + 10);
    storage.values.set(ARCADE_PLAYBOOK_KEY, JSON.stringify(b));
    const union = syncArcadeProgress(storage, a, NOW + 20);
    expect(union.progress.rounds).toHaveLength(2);
    const writes = storage.writes;
    expect(syncArcadeProgress(storage, union.progress, NOW + 30).progress).toEqual(union.progress);
    expect(storage.writes).toBe(writes);
  });

  test("a delayed external-removal notification reloads newer saved rounds without a new deletion watermark", () => {
    const storage = new MemoryStorage();
    recordArcadeProgress(storage, emptyArcadeProgress(), completion("round-before-delete"), NOW);
    storage.values.delete(ARCADE_PLAYBOOK_KEY);
    recordArcadeProgress(
      storage,
      emptyArcadeProgress(),
      completion("round-after-delete"),
      NOW + 10,
    );
    // A background tab handles the queued null storage event by reading this snapshot.
    const latest = readArcadeProgress(storage, NOW + 20);
    expect(latest.progress.rounds.map((round) => round.id)).toEqual(["round-after-delete"]);
    expect(latest.progress.clearedAt).toBe(0);
    const writes = storage.writes;
    expect(syncArcadeProgress(storage, latest.progress, NOW + 30).progress).toEqual(
      latest.progress,
    );
    expect(storage.writes).toBe(writes);
  });

  test("explicit Clear recovers a corrupt future watermark and permits new results", () => {
    const storage = new MemoryStorage();
    storage.values.set(
      ARCADE_PLAYBOOK_KEY,
      JSON.stringify({ version: 1, clearedAt: 8_640_000_000_000_000 - 1, rounds: [] }),
    );
    const unreadable = readArcadeProgress(storage, NOW);
    expect(unreadable).toMatchObject({ mode: "session", issue: "unreadable" });
    const cleared = clearArcadeProgress(storage, unreadable.progress, NOW);
    expect(cleared.progress.clearedAt).toBe(NOW + 1);
    expect(cleared.mode).toBe("device");
    const newRound = recordArcadeProgress(storage, cleared.progress, completion(), NOW + 2);
    expect(newRound.progress.rounds).toHaveLength(1);
    expect(newRound.mode).toBe("device");
  });

  test("failed Clear is session-only and does not resurrect history when storage recovers", () => {
    const storage = new MemoryStorage();
    const before = recordArcadeProgress(
      storage,
      emptyArcadeProgress(),
      completion("round-before"),
      NOW,
    ).progress;
    storage.failWrite = true;
    const cleared = clearArcadeProgress(storage, before, NOW + 10);
    expect(cleared).toMatchObject({ mode: "session", issue: "write-failed" });
    expect(cleared.progress.rounds).toEqual([]);
    expect(readArcadeProgress(storage, NOW + 10).progress.rounds).toHaveLength(1);
    storage.failWrite = false;
    const after = recordArcadeProgress(
      storage,
      cleared.progress,
      completion("round-after"),
      NOW + 20,
    );
    expect(after.progress.rounds.map((round) => round.id)).toEqual(["round-after"]);
  });

  test("a mounted completion session cannot refill Clear by repeating the completed board", () => {
    const session = createArcadeCompletionSession();
    const storage = new MemoryStorage();
    const input = completion("round-mounted", { moves: 7 });
    const first = session.accept(input)!;
    const saved = recordArcadeProgress(storage, emptyArcadeProgress(), first, NOW);
    clearArcadeProgress(storage, saved.progress, NOW + 10);
    // The provider retains this guard when the user clears without unmounting the game.
    expect(session.accept(input)).toBeNull();
    expect(session.accept({ ...input, moves: 6 })).toBeNull();
    expect(readArcadeProgress(storage, NOW + 20).progress.rounds).toEqual([]);
    expect(session.accept(completion("round-restarted"))).not.toBeNull();
    const hydrated = createArcadeCompletionSession();
    hydrated.remember(["round-from-storage"]);
    expect(hydrated.accept(completion("round-from-storage"))).toBeNull();
  });
});
