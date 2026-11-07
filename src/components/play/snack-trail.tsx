import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChefHat,
  Pause,
  Play,
  RotateCcw,
  StepForward,
  Trophy,
} from "lucide-react";
import { useArcadeProgress } from "@/components/play/arcade-progress";
import { gameFoodArtwork } from "@/lib/game-food-artwork";
import { createArcadeRoundId } from "@/lib/mealdeck-play-progress";
import {
  SNACK_TRAIL_MAX_STEPS,
  SNACK_TRAIL_SIZE,
  canSnackTick,
  createSnackTrail,
  oppositeSnackDirection,
  pauseSnackTrail,
  queueSnackDirection,
  resumeSnackTrail,
  scheduleSnackTick,
  snackDirectionForKey,
  snackTickDelay,
  stepSnackTrail,
  type SnackDirection,
  type SnackPace,
  type SnackPauseReason,
} from "@/lib/snack-trail";
import "@/styles.mealdeck-arcade-games.css";
import "@/styles.snack-trail.css";

const SNACKS = [
  { art: "burger", name: "burger" },
  { art: "fries", name: "fries" },
  { art: "cake", name: "cake" },
  { art: "chicken", name: "chicken" },
] as const;
const PAD = [
  { direction: "up", Icon: ArrowUp },
  { direction: "left", Icon: ArrowLeft },
  { direction: "down", Icon: ArrowDown },
  { direction: "right", Icon: ArrowRight },
] as const;
const PACE_LABEL: Record<SnackPace, string> = { slow: "Slow", standard: "Standard", step: "Step" };
function cellLabel(cell: number) {
  return `row ${Math.floor(cell / SNACK_TRAIL_SIZE) + 1}, column ${(cell % SNACK_TRAIL_SIZE) + 1}`;
}

export function SnackTrail({ suspended = false }: { suspended?: boolean | undefined }) {
  const id = useId();
  const { recordCompletion } = useArcadeProgress();
  const [pace, setPace] = useState<SnackPace>("slow");
  const [round, setRound] = useState(createSnackTrail);
  const [roundId, setRoundId] = useState<string | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const againButton = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<"board" | "start" | null>(null);
  const epoch = useRef(0);
  const recorded = useRef<string | null>(null);
  const ended = round.phase === "won" || round.phase === "lost";
  const snack = SNACKS[round.score % SNACKS.length]!;
  const head = round.snake[0] ?? 44;
  const blocked = round.phase !== "running" || suspended;
  const summary = `Head at ${cellLabel(head)}, facing ${round.direction}. Trail length ${round.snake.length}. ${round.food === null ? "The tray is full." : `Next ${snack.name} at ${cellLabel(round.food)}.`}`;
  const pause = useCallback((reason: SnackPauseReason = "player") => {
    epoch.current++;
    setRound((current) => pauseSnackTrail(current, reason));
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPace("step");
    const onHidden = () => {
      if (document.hidden) pause("hidden");
    };
    const onBlur = () => pause("blurred");
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", onBlur);
    };
  }, [pause]);

  useEffect(() => {
    if (suspended) pause("picker");
  }, [suspended, pause]);

  useEffect(() => {
    if (round.phase !== "running" || pace === "step" || suspended) return;
    const token = epoch.current;
    return scheduleSnackTick(
      () => {
        if (token !== epoch.current) return;
        if (document.hidden) {
          pause("hidden");
          return;
        }
        if (!document.hasFocus()) {
          pause("blurred");
          return;
        }
        const sample = Math.random();
        setRound((current) =>
          canSnackTick(current, pace, { suspended }) ? stepSnackTrail(current, sample) : current,
        );
      },
      snackTickDelay(pace),
      {
        schedule: (callback, delay) => window.setTimeout(callback, delay),
        cancel: (handle) => window.clearTimeout(handle as number),
      },
    );
  }, [roundId, round.phase, round.snake, pace, suspended, pause]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target === "start") startButton.current?.focus({ preventScroll: true });
    else {
      board.current?.scrollIntoView({ block: "start", behavior: "auto" });
      board.current?.focus({ preventScroll: true });
    }
  }, [roundId, round.phase]);

  useEffect(() => {
    if (!ended) return;
    const frame = requestAnimationFrame(() => {
      againButton.current?.focus({ preventScroll: true });
      againButton.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [ended]);

  useEffect(() => {
    if (!ended || !roundId || recorded.current === roundId) return;
    recorded.current = roundId;
    recordCompletion({
      id: roundId,
      game: "snack-trail",
      result: round.phase === "won" ? "win" : "loss",
      score: round.score,
      moves: round.steps,
      variant: pace,
    });
  }, [ended, roundId, round.phase, round.score, round.steps, pace, recordCompletion]);

  function start() {
    if (suspended || document.hidden) return;
    epoch.current++;
    setRound(createSnackTrail("running"));
    setRoundId(createArcadeRoundId());
    pendingFocus.current = "board";
  }
  function resume() {
    if (suspended || document.hidden || !document.hasFocus()) return;
    epoch.current++;
    pendingFocus.current = "board";
    setRound((current) =>
      resumeSnackTrail(current, {
        suspended,
        hidden: document.hidden,
        focused: document.hasFocus(),
      }),
    );
  }
  function steer(direction: SnackDirection) {
    if (suspended || document.hidden) return;
    const sample = Math.random();
    setRound((current) => {
      if (current.phase !== "running" || direction === oppositeSnackDirection(current.direction))
        return current;
      const turned = queueSnackDirection(current, direction);
      return pace === "step" ? stepSnackTrail(turned, sample) : turned;
    });
  }
  function stepForward() {
    if (pace !== "step" || suspended || document.hidden) return;
    const sample = Math.random();
    setRound((current) => stepSnackTrail(current, sample));
  }
  function boardKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = snackDirectionForKey(event.key);
    if (direction || event.key === " " || event.key.toLowerCase() === "p") event.preventDefault();
    if (event.repeat) return;
    if (direction) steer(direction);
    else if (event.key.toLowerCase() === "p" || event.key === " ") {
      if (round.phase === "paused") resume();
      else if (event.key === " " && pace === "step") stepForward();
      else pause();
    }
  }
  const message =
    round.phase === "won"
      ? `You filled the tray! ${round.score} snacks collected.`
      : round.phase === "lost"
        ? `${round.collision === "wall" ? "You reached the edge of the tray." : "Your trail crossed itself."} Round finished with ${round.score} ${round.score === 1 ? "snack" : "snacks"}.`
        : round.phase === "paused"
          ? `${round.pauseReason === "picker" ? "Paused while you choose a game." : round.pauseReason === "hidden" || round.pauseReason === "blurred" ? "Paused because you left the game." : "Trail paused."} Your position is kept. Press Resume when you're ready.`
          : pace === "step"
            ? "Your move. Choose a direction or step forward."
            : `${round.score ? `${round.score} ${round.score === 1 ? "snack" : "snacks"} collected. ` : ""}Follow the next snack and keep clear of your trail.`;

  return (
    <section
      className="md-arcade-game md-snack"
      aria-labelledby={`${id}-title`}
      onBlurCapture={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node))
          pause("blurred");
      }}
    >
      <div className="md-game-heading">
        <div>
          <p className="md-game-kicker">
            <ChefHat size={16} aria-hidden="true" /> A trail with good taste
          </p>
          <h2 id={`${id}-title`}>Snack Trail</h2>
          <p className="md-game-description">
            Follow the food, grow your trail and leave yourself room for the next bite.
          </p>
        </div>
      </div>
      <details className="md-game-guide">
        <summary>How to play Snack Trail</summary>
        <ol>
          <li>
            Your trail starts in the middle, moving right. Reach the food to grow by one square and
            collect a snack.
          </li>
          <li>
            Keep away from the tray's edges and your own trail. Fill all 100 squares to finish the
            tray.
          </li>
          <li>
            Use the direction pad or focus the board and press arrow keys. You cannot turn straight
            back into yourself. In timed modes, only the first turn before each step is kept.
          </li>
          <li>
            Step mode is untimed: each direction press moves one square. Step forward or Space
            continues straight. In timed modes, Space pauses; P pauses in every mode.
          </li>
          <li>
            Leaving the game or opening the game picker pauses your round. Choose Resume to
            continue. Changing pace sets up a fresh round.
          </li>
        </ol>
      </details>
      {round.phase === "ready" ? (
        <div className="md-game-start md-snack__setup">
          <div className="md-game-start-art">
            <img src={gameFoodArtwork.burger} alt="" draggable={false} />
          </div>
          <div>
            <h3>One more bite?</h3>
            <p>Choose a comfortable pace. Step mode waits for you after every move.</p>
            <fieldset className="md-snack__paces">
              <legend>Your pace</legend>
              {(["slow", "standard", "step"] as const).map((choice) => (
                <button
                  key={choice}
                  className="md-game-button"
                  type="button"
                  aria-pressed={pace === choice}
                  onClick={() => setPace(choice)}
                >
                  {PACE_LABEL[choice]}
                  {choice === "step" ? " · Untimed" : ""}
                </button>
              ))}
            </fieldset>
            <p className="md-snack__pace-note">
              {pace === "slow"
                ? "A step every 0.7 seconds, with time to line up your next turn."
                : pace === "standard"
                  ? "A step every 0.35 seconds for a quicker round."
                  : "No clock. Every move starts with your tap or key press."}
            </p>
            <button
              ref={startButton}
              className="md-game-button is-primary"
              type="button"
              disabled={suspended}
              onClick={start}
            >
              <Play size={17} aria-hidden="true" /> Start trail
            </button>
          </div>
        </div>
      ) : (
        <>
          <dl className="md-game-stats">
            <div>
              <dt>Snacks collected</dt>
              <dd>{round.score}</dd>
            </div>
            <div>
              <dt>Trail length</dt>
              <dd>
                {round.snake.length}
                <small> / 100</small>
              </dd>
            </div>
            <div>
              <dt>Pace</dt>
              <dd>{PACE_LABEL[pace]}</dd>
            </div>
          </dl>
          <div className="md-snack__play-layout">
            <div className="md-snack__board-area">
              <div className="md-snack__board-label">
                <strong>
                  {ended
                    ? "Round finished"
                    : round.phase === "paused"
                      ? "Paused"
                      : pace === "step"
                        ? "Your move"
                        : "Trail moving"}
                </strong>
                <span>
                  Heading {round.direction}
                  {round.queuedDirection ? ` · Next: ${round.queuedDirection}` : ""}
                </span>
              </div>
              <div
                ref={board}
                className="md-snack__board"
                tabIndex={0}
                role="application"
                aria-label="Snack Trail, ten by ten game board"
                aria-describedby={`${id}-keys ${id}-position`}
                onKeyDown={boardKeys}
              >
                <svg viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">
                  <defs>
                    <pattern
                      id={`${id}-grid`}
                      width="100"
                      height="100"
                      patternUnits="userSpaceOnUse"
                    >
                      <rect
                        width="100"
                        height="100"
                        fill="#fff8eb"
                        stroke="#dfd0ba"
                        strokeWidth="3"
                      />
                    </pattern>
                  </defs>
                  <rect width="1000" height="1000" fill={`url(#${id}-grid)`} />
                  {round.snake.map((cell, index) => (
                    <rect
                      key={cell}
                      x={(cell % 10) * 100 + 5}
                      y={Math.floor(cell / 10) * 100 + 5}
                      width="90"
                      height="90"
                      rx={index === 0 ? 24 : 16}
                      fill={index === 0 ? "#951018" : "#d5141d"}
                      stroke="#fff6e8"
                      strokeWidth="4"
                    />
                  ))}
                  <g
                    transform={`translate(${(head % 10) * 100 + 50} ${Math.floor(head / 10) * 100 + 50}) rotate(${{ right: 0, down: 90, left: 180, up: 270 }[round.direction]})`}
                  >
                    <path
                      d="M-12 -22 L18 0 L-12 22"
                      fill="none"
                      stroke="#fffdf7"
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                  {round.food !== null && (
                    <image
                      href={gameFoodArtwork[snack.art]}
                      x={(round.food % 10) * 100 + 5}
                      y={Math.floor(round.food / 10) * 100 + 5}
                      width="90"
                      height="90"
                    />
                  )}
                </svg>
                {round.phase === "paused" && (
                  <div className="md-snack__paused" aria-hidden="true">
                    <Pause size={30} />
                    <strong>Take a breather</strong>
                    <span>Choose Resume when you're ready</span>
                  </div>
                )}
              </div>
            </div>
            <div className="md-snack__controls">
              <div className="md-snack__pad" role="group" aria-label="Trail direction controls">
                {PAD.map(({ direction, Icon }) => (
                  <button
                    key={direction}
                    className={`md-snack__direction is-${direction}`}
                    type="button"
                    aria-label={`${pace === "step" ? "Move" : "Turn"} ${direction}${pace === "step" ? " one square" : ""}`}
                    disabled={blocked || oppositeSnackDirection(round.direction) === direction}
                    onClick={() => steer(direction)}
                  >
                    <Icon size={23} aria-hidden="true" />
                    <span>{direction}</span>
                  </button>
                ))}
              </div>
              {pace === "step" && (
                <button
                  className="md-game-button is-primary md-snack__forward"
                  type="button"
                  disabled={blocked}
                  onClick={stepForward}
                >
                  <StepForward size={18} aria-hidden="true" /> Step forward
                </button>
              )}
              <div className="md-snack__actions">
                {!ended && (
                  <button
                    className={`md-game-button${round.phase === "paused" ? " is-primary" : ""}`}
                    type="button"
                    disabled={suspended}
                    onClick={() => (round.phase === "paused" ? resume() : pause())}
                  >
                    {round.phase === "paused" ? (
                      <Play size={17} aria-hidden="true" />
                    ) : (
                      <Pause size={17} aria-hidden="true" />
                    )}
                    {round.phase === "paused" ? "Resume trail" : "Pause trail"}
                  </button>
                )}
                <button
                  ref={againButton}
                  className={`md-game-button${ended ? " is-primary" : ""}`}
                  type="button"
                  disabled={suspended}
                  onClick={start}
                >
                  <RotateCcw size={17} aria-hidden="true" />
                  {ended ? "Play again" : "Restart trail"}
                </button>
                <button
                  className="md-game-button"
                  type="button"
                  onClick={() => {
                    epoch.current++;
                    pendingFocus.current = "start";
                    setRound(createSnackTrail());
                    setRoundId(null);
                  }}
                >
                  Change pace
                </button>
              </div>
              <div
                className={`md-game-status${round.phase === "paused" ? " is-paused" : round.phase === "won" ? " is-success" : ""}`}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {round.phase === "won" && <Trophy size={22} aria-hidden="true" />}
                <p>
                  {message}
                  {pace === "step" && round.phase === "running" && (
                    <span className="md-snack__sr-only"> {summary}</span>
                  )}
                </p>
              </div>
              <p id={`${id}-position`} className="md-snack__position">
                {summary}
              </p>
              <p id={`${id}-keys`} className="md-snack__keys">
                {pace === "step"
                  ? "Arrow keys move one square. Space steps forward. P pauses."
                  : "Arrow keys steer. Space or P pauses."}{" "}
                Tab leaves the board.
              </p>
              <details className="md-snack__trail-map">
                <summary>Read the trail positions</summary>
                <p>Head to tail: {round.snake.map(cellLabel).join("; ")}.</p>
              </details>
              <p className="md-snack__note">
                {round.steps.toLocaleString()}
                {round.steps >= SNACK_TRAIL_MAX_STEPS ? "+" : ""} steps · Finished rounds appear in
                My playbook. Your current trail resets when you leave or reload.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
