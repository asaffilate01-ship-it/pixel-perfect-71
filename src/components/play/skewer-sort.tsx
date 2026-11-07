import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChefHat, RotateCcw, Shuffle, Undo2, X } from "lucide-react";
import { useArcadeProgress } from "@/components/play/arcade-progress";
import { gameFoodArtwork } from "@/lib/game-food-artwork";
import { createArcadeRoundId } from "@/lib/mealdeck-play-progress";
import {
  canMoveSkewer,
  countSortedSkewers,
  createSkewerPuzzle,
  createSkewerState,
  isSkewerComplete,
  playSkewerMove,
  skewerDestinations,
  undoSkewerMove,
  type SkewerFoodCount,
  type SkewerPuzzle,
  type SkewerState,
} from "@/lib/skewer-sort";
import "@/styles.skewer-sort.css";

const FOODS = [
  { name: "Burger", image: gameFoodArtwork.burger },
  { name: "Fries", image: gameFoodArtwork.fries },
  { name: "Chicken", image: gameFoodArtwork.chicken },
  { name: "Cake", image: gameFoodArtwork.cake },
];
type Round = { id: string; puzzle: SkewerPuzzle; state: SkewerState };

export function SkewerSort() {
  const { recordCompletion } = useArcadeProgress();
  const [foodCount, setFoodCount] = useState<SkewerFoodCount>(3);
  const [round, setRound] = useState<Round | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [focused, setFocused] = useState(0);
  const [message, setMessage] = useState("Select a skewer, then choose where its top food goes.");
  const skewerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const sizeRef = useRef<HTMLSelectElement>(null);
  const recordedRound = useRef<string | null>(null);
  const hasStarted = useRef(false);
  const roundId = round?.id;
  const firstSource = round?.puzzle.skewers.findIndex((skewer) => skewer.length > 0) ?? 0;
  const activeCount = round?.puzzle.foodCount ?? foodCount;
  const complete = round ? isSkewerComplete(round.state.skewers, activeCount) : false;
  const destinations =
    round && selected !== null ? skewerDestinations(round.state.skewers, selected) : [];
  const hasMoves =
    !round ||
    round.state.skewers.some(
      (_, index) => skewerDestinations(round.state.skewers, index).length > 0,
    );

  useEffect(() => {
    if (roundId) {
      hasStarted.current = true;
      const frame = requestAnimationFrame(() => skewerRefs.current[firstSource]?.focus());
      return () => cancelAnimationFrame(frame);
    }
    if (!hasStarted.current) return;
    const frame = requestAnimationFrame(() => sizeRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [roundId, firstSource]);

  useEffect(() => {
    if (!round || !complete) return;
    if (recordedRound.current !== round.id) {
      recordedRound.current = round.id;
      recordCompletion({
        id: round.id,
        game: "skewer-sort",
        result: "completed",
        moves: round.state.moves,
        variant: `${round.puzzle.foodCount}-foods`,
      });
    }
    const frame = requestAnimationFrame(() => resultRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [round, complete, recordCompletion]);

  function begin(puzzle?: SkewerPuzzle) {
    const nextPuzzle =
      puzzle ?? createSkewerPuzzle(foodCount, Math.floor(Math.random() * 0x1_0000_0000));
    const next: Round = {
      id: createArcadeRoundId(),
      puzzle: nextPuzzle,
      state: createSkewerState(nextPuzzle),
    };
    setRound(next);
    setSelected(null);
    setFocused(
      Math.max(
        0,
        nextPuzzle.skewers.findIndex((skewer) => skewer.length > 0),
      ),
    );
    setMessage(
      puzzle
        ? "Same puzzle restarted. Select a skewer to begin again."
        : "Select a skewer, then choose where its top food goes.",
    );
  }

  function focusSkewer(index: number) {
    setFocused(index);
    skewerRefs.current[index]?.focus();
  }

  function cancel() {
    setSelected(null);
    setMessage("Selection cleared. Choose a skewer with food.");
  }

  function chooseSkewer(index: number) {
    if (!round || complete) return;
    const target = round.state.skewers[index];
    if (!target) return;
    if (selected === index) {
      cancel();
      return;
    }
    if (selected === null) {
      const food = target.at(-1);
      if (food === undefined) {
        setMessage(`Skewer ${index + 1} is empty. Select a skewer with food first.`);
        return;
      }
      setSelected(index);
      const choices = skewerDestinations(round.state.skewers, index);
      setMessage(
        choices.length
          ? `${FOODS[food]?.name} selected from skewer ${index + 1}. Choose a “Move here” skewer, or tap this skewer again to cancel.`
          : `There is no space for the ${FOODS[food]?.name.toLowerCase()} on top. Cancel this selection or undo a move.`,
      );
      return;
    }
    if (!canMoveSkewer(round.state.skewers, selected, index)) {
      setMessage(
        target.length === 3
          ? `Skewer ${index + 1} is full. Choose a skewer with space, or cancel the selection.`
          : `The top foods must match. Choose a matching or empty skewer, or cancel the selection.`,
      );
      return;
    }
    const food = round.state.skewers[selected]?.at(-1);
    const state = playSkewerMove(round.state, selected, index);
    setRound({ ...round, state });
    setSelected(null);
    setMessage(
      `${food === undefined ? "Food" : FOODS[food]?.name} moved from skewer ${selected + 1} to ${index + 1}. Choose your next skewer.`,
    );
    focusSkewer(index);
  }

  function undo() {
    if (!round || complete) return;
    const previous = round.state.history.at(-1);
    if (!previous) return;
    setRound({ ...round, state: undoSkewerMove(round.state) });
    setSelected(null);
    setMessage("Last move undone. The move total is kept.");
    focusSkewer(previous.move.from);
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const last = activeCount + 1;
    const next =
      event.key === "ArrowLeft"
        ? Math.max(0, index - 1)
        : event.key === "ArrowRight"
          ? Math.min(last, index + 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next !== null) {
      event.preventDefault();
      focusSkewer(next);
    } else if (event.key === "Escape" && selected !== null) {
      event.preventDefault();
      cancel();
    }
  }

  return (
    <section className="md-arcade-game md-skewer-game" aria-labelledby="skewer-title">
      <header className="md-game-heading">
        <div>
          <p className="md-game-kicker">
            <ChefHat size={16} aria-hidden="true" /> A little order, one bite at a time
          </p>
          <h2 id="skewer-title">Skewer Sort</h2>
          <p className="md-game-description">
            Untangle the mixed bites. Fill each skewer with three of the same food, using the empty
            skewers to make room.
          </p>
        </div>
        {round && (
          <button
            type="button"
            className="md-game-button"
            onClick={() => {
              setRound(null);
              setSelected(null);
            }}
          >
            Change size
          </button>
        )}
      </header>
      <details className="md-game-guide">
        <summary>How to play &amp; keyboard controls</summary>
        <ol>
          <li>Select a skewer, then a destination. Only one food moves: the food on top.</li>
          <li>
            You can move onto the same food or an empty skewer. Each skewer holds three bites.
          </li>
          <li>
            Fill one skewer with all three of each food to finish. Keep some space free to uncover
            buried bites.
          </li>
          <li>
            Tap the selected skewer again to cancel. Undo a move, restart this puzzle or choose a
            fresh one whenever you like.
          </li>
        </ol>
        <p>
          <strong>Keyboard:</strong> Tab into the skewers. Left and Right move focus; Home and End
          jump to the first or last. Enter or Space selects a source or destination. Escape cancels
          a selection.
        </p>
        <p>
          Moves count accepted placements, including placements later undone. There is no timer.
        </p>
      </details>
      {!round ? (
        <>
          <div className="md-game-options md-skewer-options">
            <label>
              Puzzle size
              <select
                ref={sizeRef}
                value={foodCount}
                onChange={(event) => setFoodCount(Number(event.target.value) as SkewerFoodCount)}
              >
                <option value={3}>Small plate · 3 foods</option>
                <option value={4}>Full plate · 4 foods</option>
              </select>
            </label>
          </div>
          <div className="md-game-start">
            <div className="md-game-start-art">
              <img src={gameFoodArtwork.chicken} alt="" width={180} height={180} />
            </div>
            <div>
              <h3>A place for every bite.</h3>
              <p>
                {foodCount} foods, {foodCount + 2} skewers and two empty spaces to get you started.
                Sort at your own pace. Every starting puzzle can be solved.
              </p>
              <button type="button" className="md-game-button is-primary" onClick={() => begin()}>
                Start sorting
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <dl className="md-game-stats md-skewer-stats">
            <div>
              <dt>Sorted skewers</dt>
              <dd>
                {countSortedSkewers(round.state.skewers)} <span>/ {activeCount}</span>
              </dd>
            </div>
            <div>
              <dt>Moves</dt>
              <dd>{round.state.moves}</dd>
            </div>
            <div>
              <dt>Plate</dt>
              <dd>{activeCount === 3 ? "Small" : "Full"}</dd>
            </div>
          </dl>
          <ul className="md-skewer-food-key" aria-label="Food symbols">
            {FOODS.slice(0, activeCount).map((food, index) => (
              <li key={food.name}>
                <span>{index + 1}</span>
                <img src={food.image} alt="" width={24} height={24} />
                {food.name}
              </li>
            ))}
          </ul>
          <div
            className={`md-skewer-board is-foods-${activeCount}`}
            role="group"
            aria-label="Skewers, numbered from left to right"
            aria-describedby={complete ? undefined : "skewer-current-instruction"}
          >
            {round.state.skewers.map((skewer, index) => {
              const sorted = skewer.length === 3 && skewer.every((food) => food === skewer[0]);
              const isSelected = selected === index;
              const canPlace = destinations.includes(index);
              const contents = [...skewer]
                .reverse()
                .map((food) => FOODS[food]?.name.toLowerCase())
                .join(", ");
              const stateLabel = isSelected
                ? "Selected"
                : canPlace
                  ? "Move here"
                  : sorted
                    ? "Sorted"
                    : skewer.length === 0
                      ? "Empty"
                      : skewer.length === 3
                        ? "Full"
                        : `${3 - skewer.length} free`;
              return (
                <button
                  type="button"
                  key={index}
                  ref={(element) => {
                    skewerRefs.current[index] = element;
                  }}
                  className={`md-skewer-column${isSelected ? " is-selected" : ""}${canPlace ? " is-target" : ""}${sorted ? " is-sorted" : ""}`}
                  tabIndex={focused === index ? 0 : -1}
                  disabled={complete}
                  aria-label={`Skewer ${index + 1}. ${contents ? `From top to bottom: ${contents}.` : "Empty."} ${stateLabel}.`}
                  aria-pressed={isSelected}
                  onFocus={() => setFocused(index)}
                  onClick={() => chooseSkewer(index)}
                  onKeyDown={(event) => handleKey(event, index)}
                >
                  <span className="md-skewer-number">{index + 1}</span>
                  <span className="md-skewer-stack" aria-hidden="true">
                    {[2, 1, 0].map((slot) => {
                      const food = skewer[slot];
                      const artwork = food === undefined ? undefined : FOODS[food];
                      return (
                        <span
                          key={slot}
                          className={`md-skewer-slot${artwork ? " is-filled" : ""}${slot === skewer.length - 1 ? " is-top" : ""}`}
                        >
                          {artwork && (
                            <>
                              <img src={artwork.image} alt="" draggable={false} />
                              <span className="md-skewer-food-number">{(food ?? 0) + 1}</span>
                              {slot === skewer.length - 1 && (
                                <span className="md-skewer-top-label">Top</span>
                              )}
                            </>
                          )}
                        </span>
                      );
                    })}
                  </span>
                  <span className="md-skewer-state">
                    {sorted && !isSelected && !canPlace && <Check size={12} aria-hidden="true" />}
                    {stateLabel}
                  </span>
                </button>
              );
            })}
          </div>
          {!complete && (
            <>
              <p
                id="skewer-current-instruction"
                className="md-skewer-instruction"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {hasMoves
                  ? message
                  : "No moves are available. Undo your last move or restart the puzzle to try another route."}
              </p>
              <div className="md-game-actions md-skewer-actions">
                <button
                  type="button"
                  className="md-game-button"
                  disabled={!round.state.history.length}
                  onClick={undo}
                >
                  <Undo2 size={17} aria-hidden="true" />
                  Undo
                </button>
                <button
                  type="button"
                  className="md-game-button"
                  disabled={selected === null}
                  onClick={cancel}
                >
                  <X size={17} aria-hidden="true" />
                  Cancel selection
                </button>
                <button
                  type="button"
                  className="md-game-button"
                  onClick={() => begin(round.puzzle)}
                >
                  <RotateCcw size={17} aria-hidden="true" />
                  Restart
                </button>
                <button type="button" className="md-game-button" onClick={() => begin()}>
                  <Shuffle size={17} aria-hidden="true" />
                  New puzzle
                </button>
              </div>
            </>
          )}
          {complete && (
            <div className="md-skewer-result">
              <p className="md-skewer-eyebrow">Sorted and ready</p>
              <h3 ref={resultRef} tabIndex={-1}>
                Every bite in its place.
              </h3>
              <p>
                You sorted all {activeCount} foods in {round.state.moves} moves.
              </p>
              <div className="md-game-actions">
                <button type="button" className="md-game-button is-primary" onClick={() => begin()}>
                  <Shuffle size={17} aria-hidden="true" />
                  New puzzle
                </button>
                <button
                  type="button"
                  className="md-game-button"
                  onClick={() => begin(round.puzzle)}
                >
                  <RotateCcw size={17} aria-hidden="true" />
                  Replay this puzzle
                </button>
              </div>
            </div>
          )}
          <p className="md-game-footnote">
            One top bite per move. Match the food or use an empty skewer. Undo keeps the move total.
          </p>
        </>
      )}
    </section>
  );
}
