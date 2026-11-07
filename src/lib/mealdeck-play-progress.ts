/** Optional device history for finished games. Never an order, reward or account authority. */
export const ARCADE_PLAYBOOK_KEY = "mealdeck-playbook-v1";
export const MAX_ARCADE_ROUNDS = 100;
export const MAX_ARCADE_PLAYBOOK_BYTES = 64_000;
const MAX_INPUT_ROUNDS = 500;
const MAX_TIMESTAMP = 8_640_000_000_000_000 - 1;
const MAX_FUTURE_CLOCK_SKEW = 24 * 60 * 60 * 1_000;

export const ARCADE_TRACKED_GAMES = [
  { id: "sauce-switch", name: "Sauce Switch" },
  { id: "menu-quest", name: "Menu Quest" },
  { id: "tray-tactics", name: "Tray Tactics" },
  { id: "bento-sudoku", name: "Bento Sudoku" },
  { id: "tray-lines", name: "Tray Lines" },
] as const;
export type TrackedArcadeGame = (typeof ARCADE_TRACKED_GAMES)[number]["id"];

export const ARCADE_DAILY_GAMES = [
  { id: "sauce-switch", name: "Sauce Switch" },
  { id: "menu-quest", name: "Menu Quest" },
  { id: "bento-sudoku", name: "Bento Sudoku" },
] as const;
export type DailyArcadeGame = (typeof ARCADE_DAILY_GAMES)[number]["id"];
export type ArcadeResult = "completed" | "win" | "loss" | "draw";

export type ArcadeCompletion = {
  id: string;
  game: TrackedArcadeGame;
  result: ArcadeResult;
  moves?: number;
  hints?: number;
  /** The UTC puzzle date frozen when the player starts, not the completion date. */
  dailyDate?: string;
  variant?: string;
};
export type ArcadeRoundRecord = ArcadeCompletion & { completedAt: number };
export type ArcadeProgress = {
  version: 1;
  /** A persisted deletion watermark prevents stale tabs from restoring cleared rounds. */
  clearedAt: number;
  rounds: ArcadeRoundRecord[];
};
export type ArcadeProgressStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};
export type ArcadeStorageIssue = "unavailable" | "unreadable" | "write-failed";
export type ArcadeProgressSnapshot = {
  progress: ArcadeProgress;
  mode: "device" | "session";
  issue?: ArcadeStorageIssue;
};

export function emptyArcadeProgress(): ArcadeProgress {
  return { version: 1, clearedAt: 0, rounds: [] };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_TIMESTAMP
  );
}

export function isArcadeDailyDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function arcadeUtcDate(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Small extra delay makes the next refresh land after, rather than just before, midnight. */
export function millisecondsToNextArcadeDay(now = Date.now()): number {
  const day = new Date(now);
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1) - now + 50;
}

export function isTrackedArcadeGame(value: unknown): value is TrackedArcadeGame {
  return ARCADE_TRACKED_GAMES.some((game) => game.id === value);
}

function isDailyGame(value: TrackedArcadeGame): value is DailyArcadeGame {
  return ARCADE_DAILY_GAMES.some((game) => game.id === value);
}

/** Strip unknown fields; reject malformed metrics and unsupported game/mode combinations. */
export function parseArcadeCompletion(value: unknown): ArcadeCompletion | null {
  if (
    !isObject(value) ||
    typeof value["id"] !== "string" ||
    !/^[A-Za-z0-9_-]{8,80}$/.test(value["id"])
  )
    return null;
  if (!isTrackedArcadeGame(value["game"])) return null;
  if (
    typeof value["result"] !== "string" ||
    !["completed", "win", "loss", "draw"].includes(value["result"])
  )
    return null;
  if (isDailyGame(value["game"]) && value["result"] !== "completed") return null;
  for (const key of ["moves", "hints"] as const) {
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "number" ||
        !Number.isSafeInteger(value[key]) ||
        value[key] < 0 ||
        value[key] > 100_000)
    )
      return null;
  }
  if (
    value["dailyDate"] !== undefined &&
    (!isDailyGame(value["game"]) || !isArcadeDailyDate(value["dailyDate"]))
  )
    return null;
  if (
    value["variant"] !== undefined &&
    (typeof value["variant"] !== "string" || !/^[a-z0-9][a-z0-9-]{0,39}$/i.test(value["variant"]))
  )
    return null;
  return {
    id: value["id"],
    game: value["game"],
    result: value["result"] as ArcadeResult,
    ...(value["moves"] !== undefined ? { moves: value["moves"] as number } : {}),
    ...(value["hints"] !== undefined ? { hints: value["hints"] as number } : {}),
    ...(value["dailyDate"] !== undefined ? { dailyDate: value["dailyDate"] as string } : {}),
    ...(value["variant"] !== undefined ? { variant: value["variant"] as string } : {}),
  };
}

function compareRounds(a: ArcadeRoundRecord, b: ArcadeRoundRecord): number {
  return b.completedAt - a.completedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function mergeArcadeProgress(...states: readonly ArcadeProgress[]): ArcadeProgress {
  const clearedAt = Math.max(0, ...states.map((state) => state.clearedAt));
  const unique = new Map<string, ArcadeRoundRecord>();
  for (const state of states) {
    for (const round of state.rounds) {
      if (round.completedAt <= clearedAt) continue;
      const previous = unique.get(round.id);
      // First completion wins. A deterministic tie-break keeps cross-tab reconciliation stable.
      if (
        !previous ||
        round.completedAt < previous.completedAt ||
        (round.completedAt === previous.completedAt &&
          JSON.stringify(round) < JSON.stringify(previous))
      )
        unique.set(round.id, round);
    }
  }
  return {
    version: 1,
    clearedAt,
    rounds: [...unique.values()].sort(compareRounds).slice(0, MAX_ARCADE_ROUNDS),
  };
}

/** null means invalid saved data; a missing key means a valid empty playbook. */
export function parseArcadeProgress(raw: string | null, now = Date.now()): ArcadeProgress | null {
  if (raw === null) return emptyArcadeProgress();
  if (raw.length > MAX_ARCADE_PLAYBOOK_BYTES || !isTimestamp(now)) return null;
  const latestPlausibleTime = now + MAX_FUTURE_CLOCK_SKEW;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isObject(value) ||
      value["version"] !== 1 ||
      !(
        value["clearedAt"] === 0 ||
        (isTimestamp(value["clearedAt"]) && value["clearedAt"] <= latestPlausibleTime)
      ) ||
      !Array.isArray(value["rounds"]) ||
      value["rounds"].length > MAX_INPUT_ROUNDS
    )
      return null;
    const rounds: ArcadeRoundRecord[] = [];
    for (const entry of value["rounds"]) {
      const completion = parseArcadeCompletion(entry);
      if (
        !completion ||
        !isObject(entry) ||
        !isTimestamp(entry["completedAt"]) ||
        entry["completedAt"] > latestPlausibleTime
      )
        return null;
      rounds.push({ ...completion, completedAt: entry["completedAt"] });
    }
    return mergeArcadeProgress({ version: 1, clearedAt: value["clearedAt"] as number, rounds });
  } catch {
    return null;
  }
}

export function appendArcadeCompletion(
  current: ArcadeProgress,
  input: unknown,
  now = Date.now(),
): ArcadeProgress {
  const completion = parseArcadeCompletion(input);
  if (
    !completion ||
    !isTimestamp(now) ||
    current.rounds.some((round) => round.id === completion.id)
  )
    return current;
  const completedAt = Math.max(now, current.clearedAt + 1);
  if (!isTimestamp(completedAt)) return current;
  return mergeArcadeProgress(current, {
    version: 1,
    clearedAt: current.clearedAt,
    rounds: [{ ...completion, completedAt }],
  });
}

export function arcadeDailyStatus(progress: ArcadeProgress, date: string) {
  return ARCADE_DAILY_GAMES.map((game) => ({
    ...game,
    completed:
      isArcadeDailyDate(date) &&
      progress.rounds.some(
        (round) =>
          round.game === game.id && round.result === "completed" && round.dailyDate === date,
      ),
  }));
}

let fallbackRoundSequence = 0;
/** Uniqueness for local deduplication only; this ID is never an authentication capability. */
export function createArcadeRoundId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  } catch {
    /* Some private browsing contexts restrict crypto access. */
  }
  fallbackRoundSequence += 1;
  return `round-${Date.now().toString(36)}-${fallbackRoundSequence.toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/** Keep this object for the mounted provider's lifetime, including after Clear. */
export function createArcadeCompletionSession() {
  const observed = new Set<string>();
  function remember(ids: readonly string[]) {
    for (const id of ids) observed.add(id);
    while (observed.size > 1_000) {
      const oldest = observed.values().next().value;
      if (oldest === undefined) break;
      observed.delete(oldest);
    }
  }
  return {
    remember,
    accept(input: unknown): ArcadeCompletion | null {
      const completion = parseArcadeCompletion(input);
      if (!completion || observed.has(completion.id)) return null;
      remember([completion.id]);
      return completion;
    },
  };
}

export function readArcadeProgress(
  storage: ArcadeProgressStorage | null,
  now = Date.now(),
): ArcadeProgressSnapshot {
  if (!storage) return { progress: emptyArcadeProgress(), mode: "session", issue: "unavailable" };
  try {
    const parsed = parseArcadeProgress(storage.getItem(ARCADE_PLAYBOOK_KEY), now);
    return parsed
      ? { progress: parsed, mode: "device" }
      : { progress: emptyArcadeProgress(), mode: "session", issue: "unreadable" };
  } catch {
    return { progress: emptyArcadeProgress(), mode: "session", issue: "unavailable" };
  }
}

function writeSnapshot(
  storage: ArcadeProgressStorage,
  progress: ArcadeProgress,
): ArcadeProgressSnapshot {
  try {
    storage.setItem(ARCADE_PLAYBOOK_KEY, JSON.stringify(progress));
    return { progress, mode: "device" };
  } catch {
    return { progress, mode: "session", issue: "write-failed" };
  }
}

/** Re-read immediately before writing so a stale tab respects both additions and Clear. */
export function recordArcadeProgress(
  storage: ArcadeProgressStorage | null,
  current: ArcadeProgress,
  input: unknown,
  now = Date.now(),
): ArcadeProgressSnapshot {
  const saved = readArcadeProgress(storage, now);
  const base = mergeArcadeProgress(current, saved.progress);
  const progress = appendArcadeCompletion(base, input, now);
  if (!storage || saved.mode === "session") return { ...saved, progress };
  if (JSON.stringify(progress) === JSON.stringify(saved.progress))
    return { progress, mode: "device" };
  return writeSnapshot(storage, progress);
}

/** Reconcile storage events; writing only a changed union avoids cross-tab event loops. */
export function syncArcadeProgress(
  storage: ArcadeProgressStorage | null,
  current: ArcadeProgress,
  now = Date.now(),
): ArcadeProgressSnapshot {
  const saved = readArcadeProgress(storage, now);
  const progress = mergeArcadeProgress(current, saved.progress);
  if (!storage || saved.mode === "session") return { ...saved, progress };
  if (JSON.stringify(progress) === JSON.stringify(saved.progress))
    return { progress, mode: "device" };
  return writeSnapshot(storage, progress);
}

export function clearedArcadeProgress(current: ArcadeProgress, now = Date.now()): ArcadeProgress {
  const latest = Math.max(
    current.clearedAt,
    ...current.rounds.map((round) => round.completedAt),
    0,
  );
  return { version: 1, clearedAt: Math.min(MAX_TIMESTAMP, Math.max(now, latest) + 1), rounds: [] };
}

/** Explicit Clear may replace unreadable data, and never touches favourites or another key. */
export function clearArcadeProgress(
  storage: ArcadeProgressStorage | null,
  current: ArcadeProgress,
  now = Date.now(),
): ArcadeProgressSnapshot {
  const saved = readArcadeProgress(storage, now);
  const progress = clearedArcadeProgress(mergeArcadeProgress(current, saved.progress), now);
  return storage
    ? writeSnapshot(storage, progress)
    : { progress, mode: "session", issue: "unavailable" };
}
