import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChefHat,
  Lightbulb,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Undo2,
} from "lucide-react";
import { gameFoodArtwork } from "@/lib/game-food-artwork";
import {
  chooseFourMove,
  dailySeed,
  dropFour,
  fourResult,
  mergeOver,
  moveMerge,
  puzzleMoves,
  puzzleSolved,
  seededRandom,
  sequencePrefix,
  slidePuzzle,
  startMerge,
  startPuzzle,
  type Direction,
  type FourBoard,
  type MergeState,
} from "@/lib/arcade-games";
import "@/styles.mealdeck-arcade-games.css";

const FOODS = [
  { art: "burger", name: "Burger" },
  { art: "chicken", name: "Chicken" },
  { art: "french-taco", name: "French taco" },
  { art: "cake", name: "Cake" },
] as const;
const ARROWS: Record<string, Direction | undefined> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

function Food({ index }: { index: number }) {
  return <img src={gameFoodArtwork[FOODS[index % FOODS.length]!.art]} alt="" draggable={false} />;
}
function focusBoard(ref: RefObject<HTMLDivElement | null>) {
  requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
}
function boardDescription(board: readonly number[], size: number) {
  return Array.from(
    { length: size },
    (_, row) =>
      `Row ${row + 1}: ${board
        .slice(row * size, (row + 1) * size)
        .map((value) => value || "empty")
        .join(", ")}.`,
  ).join(" ");
}
function useBest(key: string, score: number) {
  const [best, setBest] = useState(0);
  useEffect(() => {
    let saved = 0;
    try {
      const value = Number(localStorage.getItem(`mealdeck-play-${key}`));
      saved = Number.isSafeInteger(value) && value >= 0 ? value : 0;
    } catch {
      /* Optional device storage must never block a game. */
    }
    const next = Math.max(saved, score);
    setBest((current) => Math.max(current, next));
    try {
      localStorage.setItem(`mealdeck-play-${key}`, String(next));
    } catch {
      /* Play without saving. */
    }
  }, [key, score]);
  return best;
}
function useHiddenPagePause(active: boolean, pause: () => void) {
  useEffect(() => {
    if (!active) return;
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active, pause]);
}
function Frame({
  title,
  tag,
  description,
  rules,
  keyboard,
  restart,
  resetLabel = "Start over",
  started,
  children,
}: {
  title: string;
  tag: string;
  description: string;
  rules: string[];
  keyboard: string;
  restart: () => void;
  resetLabel?: string;
  started: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="md-arcade-game" aria-labelledby={`${id}-title`}>
      <header className="md-game-heading">
        <div>
          <p className="md-game-kicker">
            <ChefHat size={16} aria-hidden="true" /> {tag}
          </p>
          <h2 id={`${id}-title`}>{title}</h2>
          <p className="md-game-description">{description}</p>
        </div>
        {started && (
          <button type="button" className="md-game-button" onClick={restart}>
            <RotateCcw size={17} aria-hidden="true" /> {resetLabel}
          </button>
        )}
      </header>
      <details className="md-game-guide">
        <summary>How to play &amp; keyboard controls</summary>
        <ol>
          {rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
        <p>
          <strong>Keyboard:</strong> {keyboard}
        </p>
      </details>
      {children}
      <p className="md-game-footnote">
        Just for fun. No account or purchase needed. Personal bests stay on this device when storage
        is available. Games never earn money, food, discounts or loyalty points.
      </p>
    </section>
  );
}
function Status({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "paused";
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`md-game-status is-${tone}`}
    >
      {tone === "success" && <Trophy size={21} aria-hidden="true" />}
      {tone === "paused" && <Pause size={19} aria-hidden="true" />}
      <p>{children}</p>
    </div>
  );
}
function Stats({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <dl className="md-game-stats">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
function Start({
  title,
  children,
  action,
  onStart,
  food = 0,
}: {
  title: string;
  children: ReactNode;
  action: string;
  onStart: () => void;
  food?: number;
}) {
  return (
    <div className="md-game-start">
      <div className="md-game-start-art">
        <Food index={food} />
      </div>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
        <button type="button" className="md-game-button is-primary" onClick={onStart}>
          <Play size={18} aria-hidden="true" /> {action}
        </button>
      </div>
    </div>
  );
}
function DirectionPad({
  move,
  canMove,
  label = "Slide",
}: {
  move: (direction: Direction) => void;
  canMove: (direction: Direction) => boolean;
  label?: string;
}) {
  return (
    <div className="md-game-direction-pad" role="group" aria-label={`${label} direction`}>
      {(
        [
          ["up", ArrowUp],
          ["left", ArrowLeft],
          ["down", ArrowDown],
          ["right", ArrowRight],
        ] as const
      ).map(([direction, Icon]) => (
        <button
          key={direction}
          type="button"
          className={`md-game-button direction-${direction}`}
          aria-label={`${label} ${direction}`}
          disabled={!canMove(direction)}
          onClick={() => move(direction)}
        >
          <Icon size={20} aria-hidden="true" />
          <span>{direction}</span>
        </button>
      ))}
    </div>
  );
}

export function Feast2048() {
  const [state, setState] = useState<MergeState | null>(null);
  const [previous, setPrevious] = useState<MergeState | null>(null);
  const [message, setMessage] = useState("Slide in any direction to make your first move.");
  const boardRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const descriptionId = useId();
  const best = useBest("2048", state?.score ?? 0);
  const over = state ? mergeOver(state.board) : false;
  const highest = state ? Math.max(...state.board) : 0;
  const won = highest >= 2048;
  function start() {
    pointerStart.current = null;
    setState(startMerge());
    setPrevious(null);
    setMessage("Two dishes on the board. Slide equal numbers together to begin.");
    focusBoard(boardRef);
  }
  function move(direction: Direction) {
    if (!state || over) return;
    const next = moveMerge(state, direction);
    if (next === state) {
      setMessage(`No tiles can slide ${direction}. Try another direction.`);
      return;
    }
    setPrevious(state);
    setState(next);
    const gained = next.score - state.score;
    setMessage(
      `Moved ${direction}. ${gained ? `${gained} points added. ` : ""}Score ${next.score}; move ${next.moves}.`,
    );
  }
  function undo() {
    if (!previous) return;
    setState(previous);
    setPrevious(null);
    setMessage("Last move undone. Try a different direction.");
    focusBoard(boardRef);
  }
  return (
    <Frame
      title="Feast 2048"
      tag="Merge · Solo strategy"
      started={state !== null}
      restart={start}
      description="A little planning. A bigger feast. Merge matching numbers all the way to 2048."
      rules={[
        "Slide the whole board up, down, left or right. Equal numbers combine once per move.",
        "Every valid move adds a new tile. Keep some empty spaces so you have room to merge.",
        "Reach 2048, then keep playing if you like. You can undo your most recent move.",
      ]}
      keyboard="Tab to the board and use the arrow keys. The labelled direction buttons work with Enter or Space. You can also swipe the board."
    >
      <Stats
        items={[
          { label: "Score", value: state?.score ?? 0 },
          { label: "Device best", value: best },
          { label: "Moves", value: state?.moves ?? 0 },
        ]}
      />
      {!state && (
        <Start title="Build your feast" action="Start merging" onStart={start}>
          Two matching 2s make a 4. Keep combining and see how far you can go. There’s no timer.
        </Start>
      )}
      {state && (
        <>
          <Status tone={won ? "success" : "neutral"}>
            {over
              ? `No moves left. Your score is ${state.score}. Undo or start a new feast.`
              : won
                ? `2048 served! ${message} Keep going for a bigger feast.`
                : message}
          </Status>
          <div className="md-game-play-layout">
            <div
              className="md-merge-board"
              ref={boardRef}
              tabIndex={0}
              role="group"
              aria-label="Feast 2048 board"
              aria-describedby={descriptionId}
              onPointerDown={(event) => {
                if (!event.isPrimary || event.button !== 0 || over) return;
                pointerStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                pointerStart.current = null;
              }}
              onLostPointerCapture={() => {
                pointerStart.current = null;
              }}
              onPointerUp={(event) => {
                const start = pointerStart.current;
                pointerStart.current = null;
                if (!start || start.id !== event.pointerId) return;
                const dx = event.clientX - start.x,
                  dy = event.clientY - start.y;
                if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
                move(
                  Math.abs(dx) > Math.abs(dy)
                    ? dx > 0
                      ? "right"
                      : "left"
                    : dy > 0
                      ? "down"
                      : "up",
                );
              }}
              onKeyDown={(event) => {
                const direction = ARROWS[event.key];
                if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
                event.preventDefault();
                if (!event.repeat) move(direction);
              }}
            >
              <p className="md-game-sr-only" id={descriptionId}>
                {boardDescription(state.board, 4)} Arrow keys slide the board.
              </p>
              {state.board.map((value, index) => (
                <div
                  key={index}
                  aria-hidden="true"
                  className={`md-merge-tile ${value ? "is-filled" : ""} ${value >= 128 ? "is-high" : ""} ${value >= 10000 ? "is-long" : ""}`}
                >
                  {value > 0 && (
                    <>
                      <Food index={Math.log2(value) - 1} />
                      <strong>{value}</strong>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="md-game-side-controls">
              <p className="md-game-control-label">Slide the board</p>
              <DirectionPad move={move} canMove={() => !over} />
              <button type="button" className="md-game-button" disabled={!previous} onClick={undo}>
                <Undo2 size={18} aria-hidden="true" /> Undo last move
              </button>
              <p className="md-game-hint">
                Highest tile <strong>{highest}</strong> · Goal <strong>2048</strong>
              </p>
              <p className="md-game-hint">
                Swipe, use the buttons, or focus the board for arrow keys.
              </p>
              {over && (
                <button type="button" className="md-game-button is-primary" onClick={start}>
                  Play again <ArrowRight size={18} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </Frame>
  );
}

type FourRound = {
  board: FourBoard;
  history: FourBoard[];
  started: boolean;
  message: string;
  last: number | null;
};
const emptyFour = (): FourRound => ({
  board: Array<0>(42).fill(0),
  history: [],
  started: false,
  message: "Burgers go first.",
  last: null,
});

export function FourToFeast() {
  const [round, setRound] = useState<FourRound>(emptyFour);
  const [mode, setMode] = useState<"chef" | "local">("chef");
  const [depth, setDepth] = useState<1 | 3 | 4>(3);
  const [selected, setSelected] = useState(3);
  const [paused, setPaused] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null),
    epoch = useRef(0);
  const descriptionId = useId();
  const { board, history, started } = round;
  const firstCount = board.filter((value) => value === 1).length;
  const secondCount = board.filter((value) => value === 2).length;
  const player = firstCount === secondCount ? 1 : 2;
  const result = fourResult(board);
  const thinking = started && mode === "chef" && player === 2 && result === null;
  const pause = useCallback(() => {
    epoch.current++;
    setPaused(true);
  }, []);
  useHiddenPagePause(started && result === null && !paused, pause);
  function reset() {
    epoch.current++;
    setRound(emptyFour());
    setPaused(false);
    setSelected(3);
  }
  function start() {
    epoch.current++;
    setRound({ ...emptyFour(), started: true });
    setPaused(false);
    setSelected(3);
    focusBoard(boardRef);
  }
  useEffect(() => {
    if (!thinking || paused) return;
    const currentEpoch = epoch.current;
    const timer = setTimeout(() => {
      if (currentEpoch !== epoch.current) return;
      if (document.hidden) {
        pause();
        return;
      }
      setRound((current) => {
        if (current.board !== board || !current.started) return current;
        const column = chooseFourMove(board, depth);
        const next = column === null ? null : dropFour(board, column, 2);
        if (!next || column === null) return current;
        return {
          ...current,
          board: next,
          last: next.findIndex((value, index) => value !== board[index]),
          message: `House chef placed a cake in column ${column + 1}.`,
        };
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [board, depth, thinking, paused, pause]);
  function play(column: number) {
    if (!started || paused || thinking || result !== null) return;
    setSelected(column);
    setRound((current) => {
      const nextPlayer =
        current.board.filter((value) => value === 1).length ===
        current.board.filter((value) => value === 2).length
          ? 1
          : 2;
      if (fourResult(current.board) !== null || (mode === "chef" && nextPlayer === 2))
        return current;
      const next = dropFour(current.board, column, nextPlayer);
      if (!next)
        return { ...current, message: `Column ${column + 1} is full. Choose another column.` };
      return {
        ...current,
        board: next,
        history: [...current.history, current.board],
        last: next.findIndex((value, index) => value !== current.board[index]),
        message: `${nextPlayer === 1 ? "Burger" : "Cake"} placed in column ${column + 1}.`,
      };
    });
    focusBoard(boardRef);
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    epoch.current++;
    setRound({
      ...round,
      board: previous,
      history: history.slice(0, -1),
      last: null,
      message: "Turn undone. Choose another column.",
    });
    focusBoard(boardRef);
  }
  const announcement =
    result === "draw"
      ? "A full-board draw. A very evenly matched table!"
      : result === 1
        ? "Burgers win — four in a row!"
        : result === 2
          ? `${mode === "chef" ? "House chef" : "Cakes"} wins — four in a row!`
          : paused
            ? "Game paused. Resume when you’re ready; no moves will play while paused."
            : thinking
              ? `${round.message} House chef is choosing a column…`
              : `${round.message} ${player === 1 ? "Burgers" : "Cakes"}, your turn. Selected column ${selected + 1}.`;
  return (
    <Frame
      title="Four to Feast"
      tag="Tactics · Solo or two players"
      started={started}
      restart={start}
      description="Burgers versus cakes. Be the first to connect four across, down or diagonally."
      rules={[
        "Choose a numbered column. Your counter drops into the lowest empty space.",
        "Make a line of four before your opponent. Burgers always play first.",
        "Play the house chef or pass one device between two people. Undo takes back your last turn, including the chef’s reply.",
      ]}
      keyboard="Focus the board. Left and Right choose a column; Enter or Space drops a counter. Number keys 1–7 drop directly into that column. Controls also work with Tab and Enter."
    >
      <div className="md-game-options">
        <label>
          Opponent
          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as "chef" | "local");
              reset();
            }}
          >
            <option value="chef">House chef</option>
            <option value="local">Two players · same device</option>
          </select>
        </label>
        {mode === "chef" && (
          <label>
            Difficulty
            <select
              value={depth}
              onChange={(event) => {
                setDepth(Number(event.target.value) as 1 | 3 | 4);
                reset();
              }}
            >
              <option value={1}>Easy · Commis</option>
              <option value={3}>Medium · Sous chef</option>
              <option value={4}>Hard · Head chef</option>
            </select>
          </label>
        )}
      </div>
      {!started ? (
        <Start
          title={mode === "chef" ? "Take on the house chef" : "Make room for two"}
          action="Start round"
          onStart={start}
          food={3}
        >
          {mode === "chef"
            ? "You’re burgers. The house chef plays cakes. Pick your difficulty, then make the opening move."
            : "Player one is burgers. Player two is cakes. Take turns on this device, with no timer."}
        </Start>
      ) : (
        <>
          <div className="md-four-players">
            <span>
              <Food index={0} /> <strong>{mode === "chef" ? "You" : "Player 1"}</strong> · Burgers
            </span>
            <span>
              <Food index={3} /> <strong>{mode === "chef" ? "House chef" : "Player 2"}</strong> ·
              Cakes
            </span>
          </div>
          <Status tone={result && result !== "draw" ? "success" : paused ? "paused" : "neutral"}>
            {announcement}
          </Status>
          <div className="md-four-area">
            <div
              ref={boardRef}
              className="md-four-board"
              tabIndex={0}
              role="group"
              aria-label="Four to Feast board"
              aria-describedby={descriptionId}
              onKeyDown={(event) => {
                if (event.altKey || event.ctrlKey || event.metaKey) return;
                if (
                  ["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key) ||
                  /^[1-7]$/.test(event.key)
                ) {
                  event.preventDefault();
                  if (event.repeat || paused || result !== null || thinking) return;
                  if (event.key === "ArrowLeft") setSelected((selected + 6) % 7);
                  else if (event.key === "ArrowRight") setSelected((selected + 1) % 7);
                  else play(/^[1-7]$/.test(event.key) ? Number(event.key) - 1 : selected);
                }
              }}
            >
              <p className="md-game-sr-only" id={descriptionId}>
                {Array.from(
                  { length: 6 },
                  (_, row) =>
                    `Row ${row + 1}: ${board
                      .slice(row * 7, row * 7 + 7)
                      .map((value) => (value === 1 ? "burger" : value === 2 ? "cake" : "empty"))
                      .join(", ")}.`,
                ).join(" ")}
              </p>
              {Array.from({ length: 7 }, (_, column) => (
                <span
                  className={`md-four-column ${selected === column ? "is-selected" : ""}`}
                  key={`column-${column}`}
                  aria-hidden="true"
                >
                  {column + 1}
                </span>
              ))}
              {board.map((value, index) => (
                <div
                  key={index}
                  aria-hidden="true"
                  className={`md-four-cell player-${value} ${selected === index % 7 ? "is-selected" : ""} ${round.last === index ? "is-last" : ""}`}
                >
                  {value !== 0 && (
                    <>
                      <Food index={value === 1 ? 0 : 3} />
                      <span>{value === 1 ? "B" : "C"}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="md-game-control-label">Choose a column to drop into</p>
            <div className="md-four-drops" role="group" aria-label="Drop a counter into a column">
              {Array.from({ length: 7 }, (_, column) => (
                <button
                  key={column}
                  type="button"
                  className="md-game-button"
                  aria-label={`Drop ${player === 1 ? "burger" : "cake"} into column ${column + 1}${board[column] ? ", column full" : ""}`}
                  disabled={paused || thinking || result !== null || board[column] !== 0}
                  onClick={() => play(column)}
                >
                  <ArrowDown size={17} aria-hidden="true" />
                  <span>{column + 1}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="md-game-actions">
            <button
              type="button"
              className="md-game-button"
              disabled={!history.length}
              onClick={undo}
            >
              <Undo2 size={18} aria-hidden="true" /> Undo turn
            </button>
            {result === null && (
              <button
                type="button"
                className="md-game-button"
                onClick={() => {
                  if (paused) {
                    setPaused(false);
                    focusBoard(boardRef);
                  } else pause();
                }}
              >
                {paused ? (
                  <Play size={18} aria-hidden="true" />
                ) : (
                  <Pause size={18} aria-hidden="true" />
                )}
                {paused ? "Resume round" : "Pause"}
              </button>
            )}
            {result !== null && (
              <button type="button" className="md-game-button is-primary" onClick={start}>
                Play another round <ArrowRight size={18} aria-hidden="true" />
              </button>
            )}
            <span className="md-game-hint">{firstCount + secondCount} / 42 spaces filled</span>
          </div>
          <p className="md-game-hint">
            Changing the opponent or difficulty starts a fresh round. Leaving this tab pauses play.
          </p>
        </>
      )}
    </Frame>
  );
}

type EchoPhase = "ready" | "show" | "input" | "over" | "won";
type EchoRound = {
  sequence: number[];
  entered: number[];
  phase: EchoPhase;
  tick: number;
  cleared: number;
};
type EchoPlayback = "steady" | "slow" | "step";
const emptyEcho = (): EchoRound => ({
  sequence: [],
  entered: [],
  phase: "ready",
  tick: -1,
  cleared: 0,
});

export function OrderEcho({ suspended = false }: { suspended?: boolean }) {
  const [target, setTarget] = useState(6);
  const [round, setRound] = useState<EchoRound>(emptyEcho);
  const [playback, setPlayback] = useState<EchoPlayback>("steady");
  const [paused, setPaused] = useState(false);
  const padRef = useRef<HTMLDivElement>(null),
    epoch = useRef(0);
  const { sequence, entered, phase, tick, cleared } = round;
  const best = useBest("echo", cleared);
  const inProgress = phase === "show" || phase === "input";
  const pause = useCallback(() => {
    epoch.current++;
    setPaused(true);
  }, []);
  useHiddenPagePause(inProgress && !paused, pause);
  useEffect(() => {
    if (suspended && inProgress) pause();
  }, [suspended, inProgress, pause]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlayback("step");
  }, []);
  function reset() {
    epoch.current++;
    setRound(emptyEcho());
    setPaused(false);
  }
  function start() {
    epoch.current++;
    setRound({
      sequence: [Math.floor(Math.random() * 4)],
      entered: [],
      phase: "show",
      tick: playback === "step" ? 0 : -1,
      cleared: 0,
    });
    setPaused(false);
    focusBoard(padRef);
  }
  function replay() {
    epoch.current++;
    setRound({ ...round, entered: [], phase: "show", tick: playback === "step" ? 0 : -1 });
    setPaused(false);
    focusBoard(padRef);
  }
  useEffect(() => {
    if (phase !== "show" || paused || suspended || playback === "step") return;
    const currentEpoch = epoch.current;
    const delay =
      tick < 0
        ? 700
        : tick % 2 === 0
          ? playback === "slow"
            ? 1600
            : 1000
          : playback === "slow"
            ? 650
            : 400;
    const timer = setTimeout(() => {
      if (currentEpoch !== epoch.current) return;
      if (document.hidden) {
        pause();
        return;
      }
      setRound((current) => {
        if (current.phase !== "show" || current.tick !== tick) return current;
        return tick >= sequence.length * 2 - 1
          ? { ...current, tick: -1, phase: "input" }
          : { ...current, tick: tick + 1 };
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [phase, tick, sequence, playback, paused, suspended, pause]);
  const shownStep = tick >= 0 ? Math.floor(tick / 2) : -1;
  const active =
    !paused && !suspended && phase === "show" && tick >= 0 && tick % 2 === 0
      ? sequence[shownStep]
      : undefined;
  function answer(index: number) {
    if (phase !== "input" || paused || suspended) return;
    const next = [...entered, index];
    if (!sequencePrefix(sequence, next)) {
      setRound({ ...round, entered: next, phase: "over" });
      focusBoard(padRef);
      return;
    }
    if (next.length === sequence.length) {
      if (sequence.length === target)
        setRound({ ...round, entered: next, cleared: sequence.length, phase: "won" });
      else
        setRound({
          sequence: [...sequence, Math.floor(Math.random() * 4)],
          entered: [],
          cleared: sequence.length,
          tick: playback === "step" ? 0 : -1,
          phase: "show",
        });
      focusBoard(padRef);
    } else setRound({ ...round, entered: next });
  }
  function nextStep() {
    if (phase !== "show" || paused || suspended || playback !== "step") return;
    if (shownStep + 1 >= sequence.length) {
      setRound({ ...round, phase: "input", tick: -1 });
      focusBoard(padRef);
    } else setRound({ ...round, tick: tick + 2 });
  }
  const announcement = paused
    ? `Paused. ${phase === "show" ? "Resume replays this round from its first dish." : "Your answers are saved for this round."}`
    : phase === "show"
      ? shownStep < 0
        ? `Round ${sequence.length}. Watch the order before you repeat it.`
        : `Dish ${shownStep + 1} of ${sequence.length}: ${FOODS[sequence[shownStep]!]!.name}.`
      : phase === "input"
        ? `${entered.length ? "Correct. " : "Your turn. "}${entered.length} of ${sequence.length} dishes entered. Repeat the order at your own pace.`
        : phase === "won"
          ? `Perfect service! You remembered all ${target} dishes.`
          : phase === "over"
            ? `That order got mixed up. You completed ${cleared} ${cleared === 1 ? "round" : "rounds"}. See the correct order below, then try again.`
            : "Choose a challenge and a pace. You’ll watch first, then repeat.";
  return (
    <Frame
      title="Order Echo"
      tag="Memory · Watch & repeat"
      started={phase !== "ready"}
      restart={start}
      description="Remember the kitchen’s order. One extra dish, one bigger challenge, every round."
      rules={[
        "Watch the highlighted dishes, then repeat them in the same order. Each cleared round adds one dish.",
        "Take as long as you like to answer. Replay the sequence if you need another look; this resets that round’s answers.",
        "Choose ‘At my pace’ to reveal each dish yourself. Pause at any time; leaving the tab pauses the game.",
      ]}
      keyboard="Focus the food pad and use 1 for Burger, 2 for Chicken, 3 for French taco and 4 for Cake. Or Tab to a food and press Enter or Space. In ‘At my pace’, use the Next dish button."
    >
      <div className="md-game-options">
        <label>
          Challenge
          <select
            value={target}
            onChange={(event) => {
              setTarget(Number(event.target.value));
              reset();
            }}
          >
            <option value={6}>6 dishes · Taster</option>
            <option value={10}>10 dishes · Chef</option>
            <option value={14}>14 dishes · Master</option>
          </select>
        </label>
        <label>
          Watch pace
          <select
            value={playback}
            onChange={(event) => {
              const next = event.target.value as EchoPlayback;
              epoch.current++;
              setPlayback(next);
              if (inProgress)
                setRound({ ...round, entered: [], phase: "show", tick: next === "step" ? 0 : -1 });
            }}
          >
            <option value="steady">Steady</option>
            <option value="slow">Slower</option>
            <option value="step">At my pace · no timer</option>
          </select>
        </label>
      </div>
      <Stats
        items={[
          { label: "Rounds cleared", value: `${cleared} / ${target}` },
          { label: "Device best", value: best },
          { label: "Answers", value: `${entered.length} / ${sequence.length}` },
        ]}
      />
      {phase === "ready" ? (
        <Start
          title="Can you remember the order?"
          action="Start challenge"
          onStart={start}
          food={1}
        >
          Watch the food and its written name. No sound is needed, and there’s no time limit on your
          answers.
        </Start>
      ) : (
        <>
          <Status tone={phase === "won" ? "success" : paused ? "paused" : "neutral"}>
            {announcement}
          </Status>
          <div className="md-echo-phase">
            <span>
              {paused
                ? "Paused"
                : phase === "show"
                  ? "Watch the order"
                  : phase === "input"
                    ? "Your turn"
                    : "Round complete"}
            </span>
            <span>
              Round {sequence.length} / {target}
            </span>
          </div>
          <div
            className="md-echo-pad"
            ref={padRef}
            tabIndex={0}
            role="group"
            aria-label="Order Echo food pad. Number keys one to four select a dish."
            onKeyDown={(event) => {
              if (/^[1-4]$/.test(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                if (!event.repeat) answer(Number(event.key) - 1);
              }
            }}
          >
            {FOODS.map((food, index) => (
              <button
                key={food.art}
                type="button"
                className={`md-echo-food ${active === index ? "is-lit" : ""}`}
                disabled={phase !== "input" || paused || suspended}
                onClick={() => answer(index)}
                aria-label={`${food.name}, key ${index + 1}`}
              >
                <kbd aria-hidden="true">{index + 1}</kbd>
                <Food index={index} />
                <strong>{food.name}</strong>
                <span className="md-echo-cue">
                  {active === index ? `Dish ${shownStep + 1}` : "\u00a0"}
                </span>
              </button>
            ))}
          </div>
          <div className="md-game-actions">
            {inProgress && (
              <button
                key="pause-toggle"
                type="button"
                className={`md-game-button ${paused ? "is-primary" : ""}`}
                onClick={() => {
                  if (!paused) pause();
                  else if (phase === "show") replay();
                  else {
                    setPaused(false);
                    focusBoard(padRef);
                  }
                }}
              >
                {paused ? (
                  <Play size={18} aria-hidden="true" />
                ) : (
                  <Pause size={18} aria-hidden="true" />
                )}
                {paused ? "Resume" : "Pause"}
              </button>
            )}
            {!paused && (
              <>
                {phase === "show" && playback === "step" && (
                  <button type="button" className="md-game-button is-primary" onClick={nextStep}>
                    {shownStep + 1 >= sequence.length ? "I’m ready to repeat" : "Next dish"}
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                )}
                {phase === "input" && (
                  <button type="button" className="md-game-button" onClick={replay}>
                    <RotateCcw size={17} aria-hidden="true" /> Replay sequence
                  </button>
                )}
              </>
            )}
            {(phase === "over" || phase === "won") && (
              <button type="button" className="md-game-button is-primary" onClick={start}>
                <RotateCcw size={18} aria-hidden="true" />{" "}
                {phase === "won" ? "Play again" : "Try again"}
              </button>
            )}
          </div>
          {phase === "over" && (
            <div className="md-echo-recap">
              <h3>The order to remember</h3>
              <ol>
                {sequence.map((food, index) => (
                  <li key={index}>
                    <span>{index + 1}.</span>
                    <Food index={food} />
                    {FOODS[food]!.name}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p className="md-game-hint">
            Changing the watch pace replays this round. A different challenge starts a new game.
          </p>
        </>
      )}
    </Frame>
  );
}

type ShuffleRound = {
  board: number[];
  moves: number;
  history: number[][];
  date: number;
  message: string;
};
const emptyShuffle = (): ShuffleRound => ({
  board: [],
  moves: 0,
  history: [],
  date: 0,
  message: "Slide a tile next to the empty space.",
});

export function KitchenShuffle() {
  const [size, setSize] = useState<3 | 4>(3);
  const [round, setRound] = useState<ShuffleRound>(emptyShuffle);
  const [hint, setHint] = useState(false);
  const [daily, setDaily] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null),
    descriptionId = useId();
  const { board, moves, history, date } = round;
  const started = board.length > 0;
  const won = started && puzzleSolved(board);
  const legal = started ? puzzleMoves(board, size) : [];
  const blank = board.indexOf(0);
  const directionIndex = (direction: Direction) =>
    direction === "left"
      ? blank - 1
      : direction === "right"
        ? blank + 1
        : direction === "up"
          ? blank - size
          : blank + size;
  function reset() {
    setRound(emptyShuffle());
    setHint(false);
  }
  function start() {
    const seed = daily && date ? date : dailySeed();
    setRound({
      board: startPuzzle(size, daily ? seededRandom(seed + size) : Math.random),
      moves: 0,
      history: [],
      date: seed,
      message: "Puzzle ready. Slide an adjacent tile into the empty space.",
    });
    setHint(false);
    focusBoard(boardRef);
  }
  function move(index: number) {
    if (won || !legal.includes(index)) return;
    setRound({
      ...round,
      board: slidePuzzle(board, index, size),
      history: [...history, board],
      moves: moves + 1,
      message: `Tile ${board[index]} moved. Empty space: row ${Math.floor(index / size) + 1}, column ${(index % size) + 1}. Move ${moves + 1}.`,
    });
    focusBoard(boardRef);
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setRound({
      ...round,
      board: previous,
      history: history.slice(0, -1),
      moves: Math.max(0, moves - 1),
      message: "Last slide undone. Try a different tile.",
    });
    focusBoard(boardRef);
  }
  const gridStyle = { "--shuffle-size": size } as CSSProperties;
  const dateLabel = date ? String(date).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3") : "";
  return (
    <Frame
      title="Kitchen Shuffle"
      tag="Puzzle · Fresh or daily"
      started={started}
      restart={start}
      resetLabel={daily ? "Restart daily puzzle" : "New puzzle"}
      description="A place for every dish. Slide the numbered tiles into order, one space at a time."
      rules={[
        "Tap a tile beside the empty space to slide it. Put the numbers in order from left to right, top to bottom.",
        "Finish with the empty space in the bottom-right corner. Every puzzle has a solution.",
        "Undo as often as you like. The daily puzzle is the same for everyone on that UTC date and board size.",
      ]}
      keyboard="Focus the board and use arrow keys to move the empty space. Or Tab to an available tile and press Enter or Space. The direction buttons move the space too."
    >
      <div className="md-game-options">
        <label>
          Board size
          <select
            value={size}
            onChange={(event) => {
              setSize(Number(event.target.value) as 3 | 4);
              reset();
            }}
          >
            <option value={3}>3 × 3 · Classic</option>
            <option value={4}>4 × 4 · Expert</option>
          </select>
        </label>
        <label>
          Challenge
          <select
            value={daily ? "daily" : "random"}
            onChange={(event) => {
              setDaily(event.target.value === "daily");
              reset();
            }}
          >
            <option value="random">Fresh puzzle</option>
            <option value="daily">Daily puzzle · UTC</option>
          </select>
        </label>
      </div>
      {!started ? (
        <Start
          title="Get the kitchen in order"
          action={daily ? "Start daily puzzle" : "Shuffle & play"}
          onStart={start}
          food={2}
        >
          Start with the classic board or take on sixteen spaces. No countdown, and undo is always
          there if you need it.
        </Start>
      ) : (
        <>
          <Stats
            items={[
              { label: "Moves", value: moves },
              { label: "Board", value: `${size} × ${size}` },
              { label: "Challenge", value: daily ? "Daily" : "Fresh" },
            ]}
          />
          {daily && (
            <p className="md-game-hint">
              Daily puzzle for <strong>{dateLabel} (UTC)</strong>. Start over replays this same
              layout.
            </p>
          )}
          <Status tone={won ? "success" : "neutral"}>
            {won ? `Kitchen sorted in ${moves} moves! Every dish is in its place.` : round.message}
          </Status>
          <div className="md-game-play-layout">
            <div
              className={`md-shuffle-board ${hint ? "show-moves" : ""}`}
              style={gridStyle}
              ref={boardRef}
              tabIndex={0}
              role="group"
              aria-label="Kitchen Shuffle board"
              aria-describedby={descriptionId}
              onKeyDown={(event) => {
                const direction = ARROWS[event.key];
                if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
                event.preventDefault();
                if (!event.repeat) move(directionIndex(direction));
              }}
            >
              <p className="md-game-sr-only" id={descriptionId}>
                {boardDescription(board, size)} Arrow keys move the empty space.
              </p>
              {board.map((value, index) =>
                value === 0 ? (
                  <div key={index} className="md-shuffle-empty" aria-hidden="true">
                    <span>Space</span>
                  </div>
                ) : (
                  <button
                    key={index}
                    type="button"
                    className={`md-shuffle-tile ${legal.includes(index) ? "can-move" : ""}`}
                    disabled={!legal.includes(index) || won}
                    aria-label={`Tile ${value}, row ${Math.floor(index / size) + 1}, column ${(index % size) + 1}${legal.includes(index) ? ", slide into space" : ", cannot slide"}`}
                    onClick={() => move(index)}
                  >
                    <Food index={value - 1} />
                    <strong>{value}</strong>
                  </button>
                ),
              )}
            </div>
            <div className="md-game-side-controls">
              <p className="md-game-control-label">Move the empty space</p>
              <DirectionPad
                move={(direction) => move(directionIndex(direction))}
                canMove={(direction) => !won && legal.includes(directionIndex(direction))}
                label="Move space"
              />
              <button
                type="button"
                className="md-game-button"
                disabled={!history.length}
                onClick={undo}
              >
                <Undo2 size={18} aria-hidden="true" /> Undo last slide
              </button>
              <button
                type="button"
                className="md-game-button"
                disabled={won}
                aria-pressed={hint}
                onClick={() => setHint(!hint)}
              >
                <Lightbulb size={18} aria-hidden="true" />{" "}
                {hint ? "Hide movable tiles" : "Show movable tiles"}
              </button>
              {hint && !won && (
                <p className="md-game-hint">
                  Outlined tiles can move into the space. The outline shows a legal move, not a
                  solution.
                </p>
              )}
              {won && (
                <button type="button" className="md-game-button is-primary" onClick={start}>
                  {daily ? "Replay daily puzzle" : "Play another puzzle"}
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
      <details className="md-game-goal">
        <summary>See the finished layout</summary>
        <div
          className="md-shuffle-goal"
          style={gridStyle}
          role="img"
          aria-label={`Numbers one to ${size * size - 1} in order, followed by the empty space.`}
        >
          {Array.from({ length: size * size }, (_, index) => (
            <span key={index} aria-hidden="true">
              {index + 1 === size * size ? "Space" : index + 1}
            </span>
          ))}
        </div>
      </details>
    </Frame>
  );
}
