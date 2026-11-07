import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChefHat, Eye, Flag, Flame, Play, RotateCcw, Trophy, X } from "lucide-react";
import { useArcadeProgress } from "@/components/play/arcade-progress";
import { gameFoodArtwork } from "@/lib/game-food-artwork";
import { createArcadeRoundId } from "@/lib/mealdeck-play-progress";
import {
  PANTRY_LEVELS,
  createPantryState,
  pantryCellView,
  pantryFlagsLeft,
  pantryFocusMove,
  pantryIsOver,
  pantrySafeOpened,
  revealPantryCell,
  togglePantryFlag,
  type PantryCellView,
  type PantryLevel,
  type PantryState,
} from "@/lib/pantry-sweep";
import "@/styles.mealdeck-arcade-games.css";
import "@/styles.pantry-sweep.css";

type PantryMode = "reveal" | "flag";
type Round = { id: string; state: PantryState };
const safeFood = [
  gameFoodArtwork.fries,
  gameFoodArtwork.burger,
  gameFoodArtwork.chicken,
  gameFoodArtwork.cake,
];

function squareLabel(index: number, size: number, view: PantryCellView): string {
  const position = `Row ${Math.floor(index / size) + 1}, column ${(index % size) + 1}`;
  if (view.kind === "covered") return `${position}, covered`;
  if (view.kind === "flagged") return `${position}, flagged, still covered`;
  if (view.kind === "chilli")
    return `${position}, chilli${view.hit ? ", the square that ended the round" : view.flagged ? ", correctly flagged" : ""}`;
  return `${position}, safe, ${view.adjacent} nearby ${view.adjacent === 1 ? "chilli" : "chillies"}${view.misflagged ? ", incorrectly flagged" : ""}`;
}

export function PantrySweep() {
  const id = useId();
  const { recordCompletion } = useArcadeProgress();
  const [level, setLevel] = useState<PantryLevel>("gentle");
  const [round, setRound] = useState<Round | null>(null);
  const [mode, setMode] = useState<PantryMode>("reveal");
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState("");
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const boardArea = useRef<HTMLDivElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const replayButton = useRef<HTMLButtonElement>(null);
  const recordedRound = useRef<string | null>(null);
  const pendingFocus = useRef<"board" | "setup" | null>(null);
  const state = round?.state;
  const over = state ? pantryIsOver(state) : false;
  const safeCount = state ? state.size * state.size - state.chilliCount : 0;
  const safeOpened = state ? pantrySafeOpened(state) : 0;

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const frame = requestAnimationFrame(() => {
      if (target === "setup") startButton.current?.focus({ preventScroll: true });
      else {
        boardArea.current?.scrollIntoView({ block: "start", behavior: "auto" });
        cells.current[0]?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [round?.id]);

  useEffect(() => {
    if (!round || !pantryIsOver(round.state) || recordedRound.current === round.id) return;
    recordedRound.current = round.id;
    recordCompletion({
      id: round.id,
      game: "pantry-sweep",
      result: round.state.status === "won" ? "win" : "loss",
      moves: round.state.actions,
      variant: `${round.state.level}-${round.state.size}x${round.state.size}`,
    });
  }, [round, recordCompletion]);

  useEffect(() => {
    if (!over) return;
    const frame = requestAnimationFrame(() => {
      replayButton.current?.focus({ preventScroll: true });
      replayButton.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [over]);

  function startRound() {
    setRound({ id: createArcadeRoundId(), state: createPantryState(level) });
    setMode("reveal");
    setActive(0);
    setNotice("Choose any covered square. Your first reveal and its touching neighbours are safe.");
    pendingFocus.current = "board";
  }

  function act(index: number, action = mode) {
    if (!round || pantryIsOver(round.state)) return;
    const previous = round.state;
    setActive(index);
    if (action === "reveal" && previous.flagged[index]) {
      setNotice(
        "This square has a flag. Remove it in Flag mode, or press F on the square, before revealing it.",
      );
      return;
    }
    if (previous.opened[index]) {
      setNotice("That safe square is already open. Choose a covered square.");
      return;
    }
    if (action === "flag" && !previous.flagged[index] && pantryFlagsLeft(previous) === 0) {
      setNotice(
        `All ${previous.chilliCount} flags are in use. Remove a flag before placing another.`,
      );
      return;
    }
    const next =
      action === "flag"
        ? togglePantryFlag(previous, index)
        : revealPantryCell(
            previous,
            index,
            previous.board ? 0 : Math.floor(Math.random() * 0x1_0000_0000),
          );
    if (next === previous) return;
    setRound({ ...round, state: next });
    const position = `Row ${Math.floor(index / next.size) + 1}, column ${(index % next.size) + 1}`;
    if (action === "flag") {
      setNotice(
        `${position}: flag ${next.flagged[index] ? "placed" : "removed"}. ${pantryFlagsLeft(next)} flags left. Flags are your notes, not confirmed chillies.`,
      );
    } else if (next.status === "lost") {
      setNotice(
        `${position} held a chilli. The pantry is now revealed so you can check the clues.`,
      );
    } else if (next.status === "won") {
      setNotice("Every safe square is open. You cleared the pantry!");
    } else {
      const opened = pantrySafeOpened(next) - pantrySafeOpened(previous);
      const nearby = next.board?.adjacent[index] ?? 0;
      setNotice(
        `${position}: ${nearby} nearby ${nearby === 1 ? "chilli" : "chillies"}. ${opened} safe ${opened === 1 ? "square opened" : "squares opened"}.`,
      );
    }
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!state || event.altKey || event.ctrlKey || event.metaKey) return;
    const next = pantryFocusMove(index, event.key, state.size);
    if (next !== null) {
      event.preventDefault();
      setActive(next);
      cells.current[next]?.focus({ preventScroll: true });
      cells.current[next]?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "auto",
      });
    } else if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      if (!event.repeat) act(index, "flag");
    } else if (event.repeat && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
    }
  }

  return (
    <section className="md-arcade-game md-pantry" aria-labelledby={`${id}-title`}>
      <header className="md-game-heading">
        <div>
          <p className="md-game-kicker">
            <ChefHat size={16} aria-hidden="true" /> A little kitchen detective work
          </p>
          <h2 id={`${id}-title`}>Pantry Sweep</h2>
          <p className="md-game-description">
            Find every safe bite. Read the numbers and mark where you think the chillies are hiding.
          </p>
        </div>
      </header>
      <details className="md-game-guide">
        <summary>How to play &amp; keyboard controls</summary>
        <ol>
          <li>
            Open every safe square to win. Revealing a chilli ends the round. There is no timer.
          </li>
          <li>
            A number counts chillies in the eight touching squares, including diagonals. A zero
            opens the connected clear patch and its numbered border.
          </li>
          <li>
            Choose Flag mode to mark or unmark covered squares. Flags are optional notes: they do
            not prove a square holds a chilli, and flagged squares stay closed.
          </li>
          <li>
            Your first reveal and all its touching neighbours are safe. Later moves may need a
            careful guess.
          </li>
        </ol>
        <p>
          <strong>Keyboard:</strong> Tab into the tray; use arrow keys, Home and End to move. Enter
          or Space uses the selected mode. F places or removes a flag on the focused square. Tab
          leaves the tray.
        </p>
      </details>

      {!state ? (
        <div className="md-pantry__setup">
          <img src={gameFoodArtwork.fries} alt="" draggable={false} />
          <div>
            <h3>Safe bites. Hidden heat.</h3>
            <p>
              Start gently or give yourself a bigger pantry. The first square opens a safe patch to
              help you begin.
            </p>
            <label>
              Pantry size
              <select
                value={level}
                onChange={(event) =>
                  setLevel(event.target.value === "bigger" ? "bigger" : "gentle")
                }
              >
                <option value="gentle">5 × 5 · Gentle · 4 chillies</option>
                <option value="bigger">6 × 6 · Bigger · 6 chillies</option>
              </select>
            </label>
            <button
              ref={startButton}
              type="button"
              className="md-game-button is-primary"
              onClick={startRound}
            >
              <Play size={18} aria-hidden="true" /> Start pantry
            </button>
          </div>
        </div>
      ) : (
        <>
          <dl className="md-game-stats">
            <div>
              <dt>Safe squares</dt>
              <dd>
                {safeOpened}
                <span className="md-pantry__stat-total"> / {safeCount}</span>
              </dd>
            </div>
            <div>
              <dt>Flags left</dt>
              <dd>
                {pantryFlagsLeft(state)}
                <span className="md-pantry__stat-total"> / {state.chilliCount}</span>
              </dd>
            </div>
            <div>
              <dt>Actions</dt>
              <dd>{state.actions}</dd>
            </div>
          </dl>
          <div className="md-pantry__layout">
            <div ref={boardArea} className="md-pantry__board-area">
              <div className="md-pantry__board-heading">
                <strong>{PANTRY_LEVELS[state.level].label}</strong>
                <span>
                  <Flame size={15} aria-hidden="true" /> {state.chilliCount} hidden chillies
                </span>
              </div>
              {!over && (
                <div
                  className="md-pantry__mode"
                  role="group"
                  aria-label="Action when you tap a square"
                >
                  <button
                    type="button"
                    className="md-game-button"
                    aria-pressed={mode === "reveal"}
                    onClick={() => {
                      setMode("reveal");
                      setNotice("Reveal mode. Tap a covered square to open it.");
                    }}
                  >
                    <Eye size={17} aria-hidden="true" /> Reveal
                  </button>
                  <button
                    type="button"
                    className="md-game-button"
                    aria-pressed={mode === "flag"}
                    onClick={() => {
                      setMode("flag");
                      setNotice("Flag mode. Tap a covered square to add or remove your flag.");
                    }}
                  >
                    <Flag size={17} aria-hidden="true" /> Flag
                  </button>
                </div>
              )}
              <p id={`${id}-board-help`} className="md-pantry__board-help">
                {over
                  ? "Round finished. All squares are now shown."
                  : mode === "flag"
                    ? "Flag mode: tap to mark or unmark. Flags do not reveal a square."
                    : "Reveal mode: tap to uncover. Numbers count all touching chillies."}
              </p>
              <div className="md-pantry__board-scroll">
                <div
                  className="md-pantry__board"
                  style={{ "--pantry-size": state.size } as CSSProperties}
                  role="grid"
                  aria-label={`${state.size} by ${state.size} Pantry Sweep tray`}
                  aria-describedby={`${id}-board-help`}
                  aria-rowcount={state.size}
                  aria-colcount={state.size}
                >
                  {Array.from({ length: state.size }, (_, row) => (
                    <div className="md-pantry__row" role="row" key={row}>
                      {Array.from({ length: state.size }, (_, column) => {
                        const index = row * state.size + column;
                        const view = pantryCellView(state, index)!;
                        return (
                          <div
                            role="gridcell"
                            aria-rowindex={row + 1}
                            aria-colindex={column + 1}
                            aria-selected={active === index}
                            key={index}
                          >
                            <button
                              type="button"
                              ref={(element) => {
                                cells.current[index] = element;
                              }}
                              tabIndex={active === index ? 0 : -1}
                              className={`md-pantry__cell is-${view.kind}${view.kind === "chilli" && view.hit ? " is-hit" : ""}${view.kind === "safe" && view.misflagged ? " is-misflagged" : ""}`}
                              aria-label={squareLabel(index, state.size, view)}
                              aria-disabled={over || view.kind === "safe"}
                              onFocus={() => setActive(index)}
                              onKeyDown={(event) => navigate(event, index)}
                              onClick={() => act(index)}
                            >
                              {view.kind === "covered" && (
                                <span className="md-pantry__covered-mark" aria-hidden="true">
                                  ?
                                </span>
                              )}
                              {view.kind === "flagged" && <Flag size={22} aria-hidden="true" />}
                              {view.kind === "safe" && (
                                <>
                                  <img
                                    src={safeFood[index % safeFood.length]}
                                    alt=""
                                    draggable={false}
                                  />
                                  <strong aria-hidden="true">{view.adjacent}</strong>
                                  {view.misflagged && (
                                    <X
                                      className="md-pantry__wrong-flag"
                                      size={13}
                                      aria-hidden="true"
                                    />
                                  )}
                                </>
                              )}
                              {view.kind === "chilli" && (
                                <>
                                  <Flame size={25} aria-hidden="true" />
                                  {view.flagged && (
                                    <Flag
                                      className="md-pantry__correct-flag"
                                      size={12}
                                      aria-hidden="true"
                                    />
                                  )}
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <div className="md-pantry__legend">
                <span>
                  <strong>0</strong> No touching chillies
                </span>
                <span>
                  <Flag size={14} aria-hidden="true" /> Your flag
                </span>
                <span>
                  <Flame size={15} aria-hidden="true" /> Chilli
                </span>
                {over && (
                  <span>
                    <X size={14} aria-hidden="true" /> Flag on a safe square
                  </span>
                )}
              </div>
            </div>
            <div className="md-pantry__side">
              <div
                className={`md-game-status md-pantry__status${state.status === "won" ? " is-won" : state.status === "lost" ? " is-lost" : ""}`}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <div>
                  {over && (
                    <>
                      <div className="md-pantry__result-icon">
                        {state.status === "won" ? (
                          <Trophy size={27} aria-hidden="true" />
                        ) : (
                          <Flame size={27} aria-hidden="true" />
                        )}
                      </div>
                      <h3>
                        {state.status === "won" ? "Pantry cleared!" : "A little too much heat."}
                      </h3>
                      <p>
                        {state.status === "won"
                          ? `All ${safeCount} safe squares found in ${state.actions} actions.`
                          : `${safeOpened} of ${safeCount} safe squares found before the chilli.`}
                      </p>
                    </>
                  )}
                  <p>{notice}</p>
                </div>
              </div>
              <div className="md-pantry__tip">
                <strong>Read the neighbours</strong>
                <p>
                  A <b>1</b> means exactly one of the touching squares holds a chilli. Check nearby
                  numbers together before you reveal. Flags help you remember your guesses.
                </p>
              </div>
              <div className="md-pantry__actions">
                <button
                  ref={replayButton}
                  type="button"
                  className={`md-game-button${over ? " is-primary" : ""}`}
                  onClick={startRound}
                >
                  <RotateCcw size={17} aria-hidden="true" /> {over ? "Play again" : "New round"}
                </button>
                <button
                  type="button"
                  className="md-game-button"
                  onClick={() => {
                    pendingFocus.current = "setup";
                    setRound(null);
                    setNotice("");
                  }}
                >
                  Choose size
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      <p className="md-game-footnote">
        Free, untimed play. Reveals and flag changes count as actions. Finished rounds can be kept
        in My playbook on this browser; the board is not saved.
      </p>
    </section>
  );
}
