import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChefHat, Eraser, Lightbulb, LockKeyhole, RotateCcw, Undo2 } from "lucide-react";
import { useArcadeProgress } from "@/components/play/arcade-progress";
import { gameFoodArtwork } from "@/lib/game-food-artwork";
import { createArcadeRoundId } from "@/lib/mealdeck-play-progress";
import {
  applyBentoHint,
  bentoConflicts,
  bentoFocusMove,
  createBentoPuzzle,
  createBentoState,
  createDailyBentoPuzzle,
  enterBentoValue,
  isBentoComplete,
  undoBentoMove,
  validBentoDate,
  type BentoPuzzle,
  type BentoSize,
  type BentoState,
} from "@/lib/bento-sudoku";
import "@/styles.bento-sudoku.css";

type Challenge = "fresh" | "daily";
type Round = {
  id: string;
  puzzle: BentoPuzzle;
  state: BentoState;
  dailyDate?: string;
};
const foods = [
  { image: gameFoodArtwork.burger, name: "Burger" },
  { image: gameFoodArtwork.fries, name: "Fries" },
  { image: gameFoodArtwork.chicken, name: "Chicken" },
  { image: gameFoodArtwork.cake, name: "Cake" },
  { image: gameFoodArtwork.drink, name: "Drink" },
  { image: gameFoodArtwork.paratha, name: "Paratha" },
];

export function BentoSudoku({ dailyDate }: { dailyDate?: string | undefined }) {
  const date = dailyDate && validBentoDate(dailyDate) ? dailyDate : undefined;
  return <BentoSudokuSession key={date ?? "fresh-setup"} {...(date ? { dailyDate: date } : {})} />;
}

function BentoSudokuSession({ dailyDate }: { dailyDate?: string }) {
  const { recordCompletion, today } = useArcadeProgress();
  const [size, setSize] = useState<BentoSize>(4);
  const [challenge, setChallenge] = useState<Challenge>(dailyDate ? "daily" : "fresh");
  const [round, setRound] = useState<Round | null>(null);
  const [selected, setSelected] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const cells = useRef<Array<HTMLButtonElement | null>>([]);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const sizeSelect = useRef<HTMLSelectElement>(null);
  const previouslyStarted = useRef(false);
  const day = dailyDate ?? today;
  const boardSize = round?.puzzle.size ?? size;
  const complete = round ? isBentoComplete(round.puzzle, round.state.board) : false;
  const conflicts = round ? bentoConflicts(round.state.board, boardSize) : new Set<number>();
  const editable = !!round && !complete && round.puzzle.givens[selected] === 0;
  const filled = round?.state.board.filter((value) => value !== 0).length ?? 0;
  const roundId = round?.id;
  const firstEditable = Math.max(0, round?.puzzle.givens.findIndex((value) => value === 0) ?? 0);

  useEffect(() => {
    if (!roundId) return;
    const frame = requestAnimationFrame(() => cells.current[firstEditable]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [roundId, firstEditable]);

  useEffect(() => {
    if (!round || !complete) return;
    recordCompletion({
      id: round.id,
      game: "bento-sudoku",
      result: "completed",
      moves: round.state.moves,
      hints: round.state.hints,
      variant: round.puzzle.size === 4 ? "4x4" : "6x6",
      ...(round.dailyDate ? { dailyDate: round.dailyDate } : {}),
    });
    const frame = requestAnimationFrame(() => resultHeading.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [round, complete, recordCompletion]);

  useEffect(() => {
    if (round) {
      previouslyStarted.current = true;
      return;
    }
    if (!previouslyStarted.current) return;
    const frame = requestAnimationFrame(() => sizeSelect.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [round]);

  function startRound() {
    if (challenge === "daily" && !validBentoDate(day)) return;
    const puzzle =
      challenge === "daily"
        ? createDailyBentoPuzzle(size, day)
        : createBentoPuzzle(size, Math.floor(Math.random() * 0x1_0000_0000));
    const next: Round = {
      id: createArcadeRoundId(),
      puzzle,
      state: createBentoState(puzzle),
      ...(challenge === "daily" ? { dailyDate: day } : {}),
    };
    setSelected(
      Math.max(
        0,
        puzzle.givens.findIndex((value) => value === 0),
      ),
    );
    setAnnouncement("Puzzle started. Select an empty square, then choose a number.");
    setRound(next);
  }

  function restartRound() {
    if (!round) return;
    const next = { ...round, id: createArcadeRoundId(), state: createBentoState(round.puzzle) };
    setSelected(
      Math.max(
        0,
        round.puzzle.givens.findIndex((value) => value === 0),
      ),
    );
    setAnnouncement("Same puzzle restarted. Your entries have been cleared.");
    setRound(next);
  }

  function focusCell(index: number) {
    setSelected(index);
    const cell = cells.current[index];
    cell?.focus();
    cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function enterValue(value: number) {
    if (!round || complete || !editable) return;
    const state = enterBentoValue(round.puzzle, round.state, selected, value);
    if (state === round.state) return;
    setRound({ ...round, state });
    const row = Math.floor(selected / boardSize) + 1;
    const column = (selected % boardSize) + 1;
    const conflicting = bentoConflicts(state.board, boardSize).has(selected);
    setAnnouncement(
      value === 0
        ? `Row ${row}, column ${column} erased.`
        : `${value} entered in row ${row}, column ${column}.${conflicting ? " This number repeats in its row, column or box." : ""}`,
    );
  }

  function hint() {
    if (!round || complete) return;
    const state = applyBentoHint(round.puzzle, round.state, selected);
    if (state === round.state) return;
    const index = state.board.findIndex((value, position) => value !== round.state.board[position]);
    setRound({ ...round, state });
    if (index >= 0) {
      focusCell(index);
      setAnnouncement(
        `Hint: row ${Math.floor(index / boardSize) + 1}, column ${(index % boardSize) + 1} is ${state.board[index]}. Hint counted for this round.`,
      );
    }
  }

  function undo() {
    if (!round || complete) return;
    const state = undoBentoMove(round.state);
    if (state === round.state) return;
    const index = state.board.findIndex((value, position) => value !== round.state.board[position]);
    setRound({ ...round, state });
    if (index >= 0) focusCell(index);
    setAnnouncement("Last entry undone. Move and hint totals are kept.");
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = bentoFocusMove(index, event.key, boardSize);
    if (next !== null) {
      event.preventDefault();
      focusCell(next);
    } else if (/^[1-6]$/.test(event.key) && Number(event.key) <= boardSize) {
      event.preventDefault();
      enterValue(Number(event.key));
    } else if (["Backspace", "Delete", "0"].includes(event.key)) {
      event.preventDefault();
      enterValue(0);
    }
  }

  return (
    <section className="md-arcade-game md-bento-game" aria-labelledby="bento-title">
      <header className="md-game-heading">
        <div>
          <p className="md-game-kicker">
            <ChefHat size={16} aria-hidden="true" /> A little order on your plate
          </p>
          <h2 id="bento-title">Bento Sudoku</h2>
          <p className="md-game-description">
            One of each number in every row, column and outlined box. Take your time and fill the
            tray.
          </p>
        </div>
        {round && (
          <button
            type="button"
            className="md-game-button"
            onClick={() => {
              setRound(null);
              setAnnouncement("");
            }}
          >
            Choose puzzle
          </button>
        )}
      </header>

      <details className="md-game-guide">
        <summary>How to play &amp; keyboard controls</summary>
        <ol>
          <li>Choose a 4 × 4 or 6 × 6 tray. Every puzzle has one solution.</li>
          <li>
            Select an empty square, then choose a number. Use each number once in every row, column
            and outlined box.
          </li>
          <li>
            Squares with a lock are fixed clues. A × marks a repeated number. Erase or undo to try
            another entry.
          </li>
          <li>
            A hint reveals the selected unfinished square, or the next unfinished square. Moves and
            hints stay counted after undo.
          </li>
        </ol>
        <p>
          <strong>Keyboard:</strong> Tab into the tray; arrow keys move between squares, Home and
          End move within a row. Type a number to fill a square; Delete, Backspace or 0 erases it.
          Tab reaches the keypad and actions.
        </p>
        <p>Food pictures are visual companions to the numbers. There is no timer.</p>
      </details>

      {!round ? (
        <>
          <div className="md-game-options md-bento-options">
            <label>
              Tray size
              <select
                ref={sizeSelect}
                value={size}
                onChange={(event) => setSize(Number(event.target.value) as BentoSize)}
              >
                <option value={4}>4 × 4 · a small bite</option>
                <option value={6}>6 × 6 · a fuller tray</option>
              </select>
            </label>
            <label>
              Puzzle
              <select
                value={challenge}
                onChange={(event) => setChallenge(event.target.value as Challenge)}
              >
                <option value="fresh">Fresh puzzle</option>
                <option value="daily" disabled={!validBentoDate(day)}>
                  Daily puzzle · UTC
                </option>
              </select>
            </label>
          </div>
          {challenge === "daily" && (
            <p className="md-game-footnote">
              Daily puzzle for <time dateTime={day}>{day}</time> (UTC). Each tray size has its own
              puzzle.
            </p>
          )}
          <div className="md-game-start md-bento-start">
            <img src={gameFoodArtwork.paratha} alt="" width={180} height={180} />
            <div>
              <p className="md-bento-eyebrow">
                {size} × {size} tray · {size === 4 ? "2 × 2" : "2 × 3"} boxes
              </p>
              <h3>A satisfying little puzzle.</h3>
              <p>
                Fill the empty squares with numbers 1–{size}. Follow the fixed clues, spot what is
                missing and finish your bento.
              </p>
              <button
                type="button"
                className="md-game-button is-primary"
                onClick={startRound}
                disabled={challenge === "daily" && !validBentoDate(day)}
              >
                Start {challenge === "daily" ? "daily puzzle" : "puzzle"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="md-bento-round-label">
            {boardSize} × {boardSize} tray <span aria-hidden="true">·</span>{" "}
            {round.dailyDate ? (
              <>
                Daily · <time dateTime={round.dailyDate}>{round.dailyDate}</time> UTC
              </>
            ) : (
              "Fresh puzzle"
            )}
          </p>
          <dl className="md-game-stats">
            <div>
              <dt>Squares filled</dt>
              <dd>
                {filled}
                <span className="md-bento-stat-total"> / {boardSize * boardSize}</span>
              </dd>
            </div>
            <div>
              <dt>Moves</dt>
              <dd>{round.state.moves}</dd>
            </div>
            <div>
              <dt>Hints</dt>
              <dd>{round.state.hints}</dd>
            </div>
          </dl>
          <div className="md-bento-play-area">
            <div className="md-bento-tray-wrap">
              <p id="bento-board-help" className="md-bento-board-help">
                {complete
                  ? "Every row, column and box is complete."
                  : "Select a square, then choose its number."}
              </p>
              <div className="md-bento-board-scroll">
                <div
                  className={`md-bento-board is-size-${boardSize}`}
                  role="grid"
                  aria-label={`${boardSize} by ${boardSize} Sudoku tray`}
                  aria-describedby="bento-board-help"
                  aria-rowcount={boardSize}
                  aria-colcount={boardSize}
                >
                  {Array.from({ length: boardSize }, (_, row) => (
                    <div role="row" className="md-bento-row" key={row}>
                      {Array.from({ length: boardSize }, (_, column) => {
                        const index = row * boardSize + column;
                        const value = round.state.board[index] ?? 0;
                        const given = round.puzzle.givens[index] !== 0;
                        const conflict = conflicts.has(index);
                        const related =
                          row === Math.floor(selected / boardSize) ||
                          column === selected % boardSize;
                        const food = value > 0 ? foods[value - 1] : undefined;
                        const label = `Row ${row + 1}, column ${column + 1}: ${value || "empty"}${given ? ", fixed clue" : ""}${conflict ? ", repeated number" : ""}`;
                        return (
                          <div
                            role="gridcell"
                            key={index}
                            aria-selected={selected === index}
                            aria-readonly={given || complete}
                            aria-rowindex={row + 1}
                            aria-colindex={column + 1}
                          >
                            <button
                              ref={(element) => {
                                cells.current[index] = element;
                              }}
                              type="button"
                              tabIndex={selected === index ? 0 : -1}
                              className={`md-bento-cell${given ? " is-given" : ""}${selected === index ? " is-selected" : ""}${related ? " is-related" : ""}${conflict ? " is-conflict" : ""}${column === boardSize / 2 - 1 ? " is-box-right" : ""}${row % 2 === 1 && row < boardSize - 1 ? " is-box-bottom" : ""}`}
                              aria-label={label}
                              onFocus={() => setSelected(index)}
                              onClick={() => setSelected(index)}
                              onKeyDown={(event) => handleKey(event, index)}
                            >
                              {food && <img src={food.image} alt="" draggable={false} />}
                              <span className="md-bento-digit" aria-hidden="true">
                                {value || "·"}
                              </span>
                              {given && (
                                <LockKeyhole
                                  className="md-bento-lock"
                                  size={10}
                                  aria-hidden="true"
                                />
                              )}
                              {conflict && (
                                <span className="md-bento-conflict-mark" aria-hidden="true">
                                  ×
                                </span>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <p className="md-bento-legend">
                <LockKeyhole size={13} aria-hidden="true" /> Locked squares are fixed clues.{" "}
                <span>× = repeated number</span>
              </p>
            </div>
            <div className="md-bento-controls">
              {!complete && (
                <>
                  <p className="md-bento-selection">
                    Row {Math.floor(selected / boardSize) + 1}, column {(selected % boardSize) + 1}
                    <span>
                      {editable ? "Choose a number" : "Fixed clue · choose an empty square"}
                    </span>
                  </p>
                  <div
                    className="md-bento-keypad"
                    role="group"
                    aria-label="Choose a number for the selected square"
                  >
                    {foods.slice(0, boardSize).map((food, index) => (
                      <button
                        type="button"
                        className="md-bento-number"
                        key={food.name}
                        disabled={!editable}
                        aria-label={`Enter ${index + 1}`}
                        onClick={() => enterValue(index + 1)}
                      >
                        <img src={food.image} alt="" width={34} height={34} />
                        <span>{index + 1}</span>
                      </button>
                    ))}
                  </div>
                  <div className="md-bento-tools">
                    <button
                      type="button"
                      className="md-game-button"
                      disabled={!editable || round.state.board[selected] === 0}
                      onClick={() => enterValue(0)}
                    >
                      <Eraser size={17} aria-hidden="true" /> Erase
                    </button>
                    <button
                      type="button"
                      className="md-game-button"
                      disabled={!round.state.history.length}
                      onClick={undo}
                    >
                      <Undo2 size={17} aria-hidden="true" /> Undo
                    </button>
                    <button
                      type="button"
                      className="md-game-button md-bento-hint-button"
                      onClick={hint}
                    >
                      <Lightbulb size={17} aria-hidden="true" /> Reveal a hint
                    </button>
                  </div>
                  <p className="md-game-footnote">
                    Hints reveal one answer and count towards this round.
                  </p>
                </>
              )}
              {complete && (
                <div className="md-bento-result">
                  <p className="md-bento-eyebrow">Tray complete</p>
                  <h3 ref={resultHeading} tabIndex={-1}>
                    Everything in its place.
                  </h3>
                  <p>
                    You solved this {boardSize} × {boardSize} puzzle in {round.state.moves} moves
                    with{" "}
                    {round.state.hints === 0
                      ? "no hints"
                      : `${round.state.hints} ${round.state.hints === 1 ? "hint" : "hints"}`}
                    .
                  </p>
                  <button
                    type="button"
                    className="md-game-button is-primary"
                    onClick={() => setRound(null)}
                  >
                    Choose another puzzle
                  </button>
                </div>
              )}
            </div>
          </div>
          {!complete && conflicts.size > 0 && (
            <p className="md-game-status md-bento-conflict-status">
              <span aria-hidden="true">×</span> A number repeats in a row, column or box. Check the
              marked squares.
            </p>
          )}
          <div className="md-game-actions">
            <button type="button" className="md-game-button" onClick={restartRound}>
              <RotateCcw size={17} aria-hidden="true" />{" "}
              {complete ? "Replay same puzzle" : "Restart puzzle"}
            </button>
          </div>
        </>
      )}
      <p className="md-game-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
