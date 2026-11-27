import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  RotateCcw,
  Share2,
  Trash2,
  Trophy,
} from "lucide-react";
import {
  ARCADE_PLAYBOOK_KEY,
  ARCADE_TRACKED_GAMES,
  MAX_ARCADE_ROUNDS,
  arcadeCompletionLabel,
  arcadeScoreLabel,
  summarizeArcadeProgress,
  createArcadeRoundId,
  isArcadeRoundId,
  isTrackedArcadeGame,
  type TrackedArcadeGame,
  arcadeDailyStatus,
  arcadeUtcDate,
  clearArcadeProgress,
  createArcadeCompletionSession,
  emptyArcadeProgress,
  millisecondsToNextArcadeDay,
  readArcadeProgress,
  recordArcadeProgress,
  syncArcadeProgress,
  type ArcadeCompletion,
  type ArcadeProgress,
  type ArcadeProgressSnapshot,
  type ArcadeProgressStorage,
  type ArcadeStorageIssue,
  type DailyArcadeGame,
} from "@/lib/mealdeck-play-progress";
import "@/styles.mealdeck-play-progress.css";
import type { ArcadeShareRequest } from "@/lib/mealdeck-arcade-sharing";

type ProgressContextValue = {
  progress: ArcadeProgress;
  storageMode: "loading" | "device" | "session";
  storageIssue?: ArcadeStorageIssue;
  today: string;
  recordCompletion: (completion: ArcadeCompletion) => void;
  clearPlaybook: () => boolean;
};

const ProgressContext = createContext<ProgressContextValue | null>(null);

function browserStorage(): ArcadeProgressStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function ArcadeProgressProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ArcadeProgressSnapshot | null>(null);
  const [today, setToday] = useState("");
  const current = useRef<ArcadeProgress>(emptyArcadeProgress());
  // Retain observed IDs across Clear: undoing a finished board must not recreate its entry.
  const completionSession = useRef(createArcadeCompletionSession());

  const apply = useCallback((next: ArcadeProgressSnapshot) => {
    current.current = next.progress;
    completionSession.current.remember(next.progress.rounds.map((round) => round.id));
    setSnapshot(next);
  }, []);

  useEffect(() => {
    apply(readArcadeProgress(browserStorage()));
    function onStorage(event: StorageEvent) {
      if (event.key !== ARCADE_PLAYBOOK_KEY && event.key !== null) return;
      const storage = browserStorage();
      if (event.storageArea && storage && event.storageArea !== storage) return;
      if (event.newValue === null) {
        // A queued removal may predate a newer saved round. Read what exists now;
        // only the explicit in-app Clear action creates a deletion watermark.
        apply(readArcadeProgress(storage));
      } else {
        apply(syncArcadeProgress(storage, current.current));
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [apply]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refreshDay() {
      clearTimeout(timer);
      const now = Date.now();
      setToday(arcadeUtcDate(now));
      timer = setTimeout(refreshDay, millisecondsToNextArcadeDay(now));
    }
    function onVisible() {
      if (!document.hidden) refreshDay();
    }
    refreshDay();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refreshDay);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refreshDay);
    };
  }, []);

  const recordCompletion = useCallback(
    (input: ArcadeCompletion) => {
      const completion = completionSession.current.accept(input);
      if (!completion) return;
      apply(recordArcadeProgress(browserStorage(), current.current, completion));
    },
    [apply],
  );

  const clearPlaybook = useCallback(() => {
    const next = clearArcadeProgress(browserStorage(), current.current);
    apply(next);
    return next.mode === "device";
  }, [apply]);

  const value = useMemo<ProgressContextValue>(
    () => ({
      progress: snapshot?.progress ?? current.current,
      storageMode: snapshot?.mode ?? "loading",
      ...(snapshot?.issue ? { storageIssue: snapshot.issue } : {}),
      today,
      recordCompletion,
      clearPlaybook,
    }),
    [snapshot, today, recordCompletion, clearPlaybook],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- This hook shares the provider's context.
export function useArcadeProgress(): ProgressContextValue {
  const context = useContext(ProgressContext);
  if (!context) throw new Error("Arcade games must be inside ArcadeProgressProvider.");
  return context;
}

/** One identity per started game; saved rounds may reuse their validated identity. */
// eslint-disable-next-line react-refresh/only-export-components -- shared local tracking hook.
export function useArcadeRoundTracker(completion: Omit<ArcadeCompletion, "id"> | null, startOnMount = false) {
  const { recordCompletion } = useArcadeProgress();
  const [roundId, setRoundId] = useState<string | null>(null);
  const beginRound = useCallback((savedId?: string) => {
    const next = isArcadeRoundId(savedId) ? savedId : createArcadeRoundId();
    setRoundId(next);
    return next;
  }, []);
  useEffect(() => {
    if (startOnMount) beginRound();
  }, [startOnMount, beginRound]);
  useEffect(() => {
    if (roundId && completion) recordCompletion({ ...completion, id: roundId });
  }, [roundId, completion, recordCompletion]);
  return { roundId, beginRound };
}

function roundTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(timestamp);
}

export function ArcadePlaybook({
  onDailyGame,
  onShare,
}: {
  onDailyGame: (game: DailyArcadeGame) => void;
  onShare: (request: ArcadeShareRequest, trigger: HTMLButtonElement) => void;
}) {
  const { progress, storageMode, storageIssue, today, clearPlaybook } = useArcadeProgress();
  const [confirming, setConfirming] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const clearButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const daily = arcadeDailyStatus(progress, today);
  const [filter, setFilter] = useState<TrackedArcadeGame | "all">("all");
  const [expandedHistory, setExpandedHistory] = useState(false);
  const statistics = useMemo(() => summarizeArcadeProgress(progress), [progress]);
  const filtered = progress.rounds.filter(round => filter === "all" || round.game === filter);
  const recent = expandedHistory ? filtered : filtered.slice(0, 5);
  const completedDaily = daily.filter((game) => game.completed).length;

  useEffect(() => {
    if (confirming) keepButton.current?.focus({ preventScroll: true });
  }, [confirming]);

  function finishConfirmation(clear: boolean) {
    if (clear) {
      const saved = clearPlaybook();
      setAnnouncement(
        saved
          ? "Playbook cleared on this browser. Your favourites are unchanged."
          : "Playbook cleared for this visit. Your browser could not update its saved history. Your favourites are unchanged.",
      );
    }
    setConfirming(false);
    requestAnimationFrame(() => clearButton.current?.focus({ preventScroll: true }));
  }

  return (
    <details className="md-playbook">
      <summary>
        <span className="md-playbook__heading">
          <BookOpen size={19} aria-hidden="true" /> My playbook
        </span>
        <span className="md-playbook__summary-count">
          {storageMode === "loading" ? "Device history" : `${progress.rounds.length} finished`}
        </span>
        <ChevronDown className="md-playbook__chevron" size={18} aria-hidden="true" />
      </summary>
      <div className="md-playbook__body">
        <p className="md-playbook__scope">
          Tracks finished rounds across all {ARCADE_TRACKED_GAMES.length} arcade games. Your
          playbook keeps the latest {MAX_ARCADE_ROUNDS} finished rounds; statistics describe that retained history, not lifetime totals. Snack Trail, Feast 2048, Kitchen Shuffle and Kitchen Stacks have separate local save slots for unfinished boards.
        </p>
        <p
          className={`md-playbook__storage${storageMode === "session" ? " is-session" : ""}`}
          role="status"
          aria-live="polite"
        >
          {storageMode === "loading"
            ? "Checking this browser's playbook…"
            : storageMode === "device"
              ? "Saved on this browser. No account or device sync."
              : storageIssue === "unreadable"
                ? "The saved playbook could not be read. New results stay here for this visit. Clear the playbook to start a new saved history."
                : "This browser could not save the playbook. Results stay here for this visit only."}
        </p>

        <section className="md-playbook__overview" aria-labelledby={`${id}-overview`}>
          <div className="md-playbook__section-heading">
            <h3 id={`${id}-overview`}>Your arcade statistics</h3>
            <span>On this device</span>
          </div>
          <dl className="md-playbook__metrics">
            <div><dt>Finished rounds</dt><dd>{statistics.finished}</dd></div>
            <div><dt>Games explored</dt><dd>{statistics.explored} / {ARCADE_TRACKED_GAMES.length}</dd></div>
            <div><dt>Wins recorded</dt><dd>{statistics.wins}</dd></div>
            <div><dt>Active UTC days</dt><dd>{statistics.activeDays}</dd></div>
          </dl>
          <details className="md-playbook__milestones">
            <summary><Trophy size={17} aria-hidden="true" /> Personal milestones · {statistics.milestones.filter(item => item.current >= item.target).length} / {statistics.milestones.length}</summary>
            <p>Just for fun. Milestones are recalculated from retained rounds, and never earn prizes, discounts or loyalty points.</p>
            <ul>
              {statistics.milestones.map(item => <li key={item.id}>
                <div><strong>{item.title}</strong><span>{item.current >= item.target ? "Reached" : `${item.current} / ${item.target}`}</span></div>
                <progress value={Math.min(item.current,item.target)} max={item.target} aria-label={item.title} />
                <small>{item.description}</small>
              </li>)}
            </ul>
          </details>
          <details className="md-playbook__game-stats">
            <summary>Activity by game</summary>
            <ul>{statistics.games.map(game => <li key={game.id}><strong>{game.name}</strong><span>{game.finished} finished{game.wins ? ` · ${game.wins} won` : ""}</span></li>)}</ul>
          </details>
        </section>

        <section className="md-playbook__daily" aria-labelledby={`${id}-daily`}>
          <div className="md-playbook__section-heading">
            <h3 id={`${id}-daily`}>
              <CalendarDays size={18} aria-hidden="true" /> Today's daily puzzles
            </h3>
            <span>
              {completedDaily} of {daily.length} completed
            </span>
          </div>
          <p className="md-playbook__date">
            {today ? <time dateTime={today}>{today}</time> : "Loading today's date"} · UTC
          </p>
          <ul>
            {daily.map((game) => (
              <li key={game.id}>
                <div className="md-playbook__daily-name">
                  {game.completed ? (
                    <Check size={19} aria-hidden="true" />
                  ) : (
                    <Circle size={17} aria-hidden="true" />
                  )}
                  <div>
                    <strong>{game.name}</strong>
                    <span>{game.completed ? "Completed today" : "Not completed today"}</span>
                  </div>
                </div>
                <div className="md-playbook__daily-actions">
                  <button
                    type="button"
                    disabled={!today || storageMode === "loading"}
                    onClick={() => onDailyGame(game.id)}
                    aria-label={`${game.completed ? "Play again" : "Play today's"} ${game.name} daily puzzle`}
                  >
                    {game.completed && <RotateCcw size={15} aria-hidden="true" />}
                    {game.completed ? "Play again" : "Play daily"}
                  </button>
                  <button
                    type="button"
                    disabled={!today}
                    onClick={(event) =>
                      onShare({ game: game.id, dailyDate: today }, event.currentTarget)
                    }
                    aria-label={`Share today's ${game.name} daily puzzle`}
                  >
                    <Share2 size={15} aria-hidden="true" /> Share
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="md-playbook__recent" aria-labelledby={`${id}-recent`}>
          <h3 id={`${id}-recent`}>Recent finished rounds</h3>
          <label className="md-playbook__filter">Filter by game <select value={filter} onChange={event => { const value = event.target.value; setFilter(isTrackedArcadeGame(value) ? value : "all"); setExpandedHistory(false); }}><option value="all">All games ({statistics.finished})</option>{statistics.games.map(game => <option key={game.id} value={game.id}>{game.name} ({game.finished})</option>)}</select></label>
          {recent.length ? (
            <ol>
              {recent.map((round) => (
                <li key={round.id}>
                  <div>
                    <strong>
                      {ARCADE_TRACKED_GAMES.find((game) => game.id === round.game)?.name}
                    </strong>
                    <span>
                      {arcadeCompletionLabel(round)}
                      {round.score !== undefined
                        ? ` · ${arcadeScoreLabel(round.game, round.score)}`
                        : ""}
                      {round.moves !== undefined
                        ? ` · ${round.moves} ${round.moves === 1 ? "move" : "moves"}`
                        : ""}
                      {round.checks !== undefined ? ` · ${round.checks} ${round.checks === 1 ? "check" : "checks"}` : ""}
                      {round.hints !== undefined
                        ? ` · ${round.hints} ${round.hints === 1 ? "hint" : "hints"}`
                        : ""}
                    </span>
                    {round.dailyDate && <span>Daily puzzle · {round.dailyDate}</span>}
                  </div>
                  <div className="md-playbook__round-actions">
                    <time dateTime={new Date(round.completedAt).toISOString()}>
                      {roundTime(round.completedAt)} UTC
                    </time>
                    <button
                      type="button"
                      onClick={(event) =>
                        onShare({ game: round.game, completion: round }, event.currentTarget)
                      }
                      aria-label={`Share ${ARCADE_TRACKED_GAMES.find((game) => game.id === round.game)?.name} result from ${roundTime(round.completedAt)} UTC`}
                    >
                      <Share2 size={15} aria-hidden="true" /> Share result
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="md-playbook__empty">
              {progress.rounds.length ? "No finished rounds match this filter." : `Finish one of the ${ARCADE_TRACKED_GAMES.length} tracked games to start your playbook.`}
            </p>
          )}
          {filtered.length > 5 && <button type="button" aria-expanded={expandedHistory} onClick={() => setExpandedHistory(value => !value)}>{expandedHistory ? "Show latest five" : `Show all ${filtered.length} matching rounds`}</button>}
        </section>

        <div className="md-playbook__clear">
          {confirming ? (
            <div className="md-playbook__confirm" role="group" aria-labelledby={`${id}-clear`}>
              <p id={`${id}-clear`}>
                Clear this browser's playbook? Finished-round history will be removed. Your
                favourites stay saved.
              </p>
              <div>
                <button ref={keepButton} type="button" onClick={() => finishConfirmation(false)}>
                  Keep playbook
                </button>
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => finishConfirmation(true)}
                >
                  Clear playbook
                </button>
              </div>
            </div>
          ) : (
            <button
              ref={clearButton}
              type="button"
              onClick={() => setConfirming(true)}
              disabled={storageMode === "loading"}
            >
              <Trash2 size={16} aria-hidden="true" /> Clear playbook
            </button>
          )}
          <p className="md-playbook__announcement" role="status" aria-live="polite">
            {announcement}
          </p>
        </div>
      </div>
    </details>
  );
}
