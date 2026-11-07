import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChefHat,
  Lightbulb,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { seededRandom } from "@/lib/arcade-games";
import { useArcadeProgress } from "@/components/play/arcade-progress";
import {
  arcadeUtcDate,
  createArcadeRoundId,
  isArcadeDailyDate,
} from "@/lib/mealdeck-play-progress";
import { gameFoodArtwork } from "@/lib/game-food-artwork";
import {
  QUEST_SIZE,
  createQuestPuzzle,
  createSaucePuzzle,
  flipSauce,
  matchQuestSelection,
  puzzleFocusMove,
  questLine,
  sauceCleared,
  solveSauce,
  type QuestMatch,
  type QuestPuzzle,
  type QuestWord,
  type SauceSize,
} from "@/lib/mealdeck-puzzle-games";
import "@/styles.mealdeck-puzzle-games.css";

function usePuzzleFocus(size: number) {
  const [active, setActive] = useState(0);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const focus = useCallback((index: number) => {
    setActive(index);
    requestAnimationFrame(() => {
      const cell = cells.current[index];
      cell?.focus({ preventScroll: true });
      cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }, []);
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = puzzleFocusMove(index, event.key, size);
    if (next !== null) {
      event.preventDefault();
      focus(next);
    } else if (event.repeat && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
    }
  }
  return { active, setActive, cells, focus, onKeyDown };
}

function useCompletionFocus(complete: boolean, action: RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    if (!complete) return;
    const frame = requestAnimationFrame(() => action.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [complete, action]);
}

function PuzzleFrame({
  title,
  tag,
  description,
  rules,
  keyboard,
  started,
  onRestart,
  children,
}: {
  title: string;
  tag: string;
  description: string;
  rules: string[];
  keyboard: string;
  started: boolean;
  onRestart: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="md-arcade-game md-puzzle-game" aria-labelledby={`${id}-title`}>
      <header className="md-game-heading">
        <div>
          <p className="md-game-kicker">
            <ChefHat size={16} aria-hidden="true" /> {tag}
          </p>
          <h2 id={`${id}-title`}>{title}</h2>
          <p className="md-game-description">{description}</p>
        </div>
        {started && (
          <button type="button" className="md-game-button" onClick={onRestart}>
            <RotateCcw size={17} aria-hidden="true" /> Restart puzzle
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
        Free, untimed play. Finished rounds can be kept in My playbook on this browser; boards are
        not saved or resumed. Games never award food, money, discounts or loyalty points.
      </p>
    </section>
  );
}

function PuzzleStats({ items }: { items: { label: string; value: string | number }[] }) {
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

function PuzzleStatus({ complete, children }: { complete: boolean; children: ReactNode }) {
  return (
    <div
      className={`md-game-status${complete ? " is-success" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {complete && <Trophy size={21} aria-hidden="true" />}
      <p>{children}</p>
    </div>
  );
}

function PuzzleStart({
  art,
  title,
  children,
  daily,
  onStart,
}: {
  art: "sauce" | "fries";
  title: string;
  children: ReactNode;
  daily: boolean;
  onStart: () => void;
}) {
  return (
    <div className="md-game-start">
      <div className="md-game-start-art">
        <img src={gameFoodArtwork[art]} alt="" draggable={false} />
      </div>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
        <button type="button" className="md-game-button is-primary" onClick={onStart}>
          {daily ? (
            <CalendarDays size={18} aria-hidden="true" />
          ) : (
            <Play size={18} aria-hidden="true" />
          )}
          {daily ? "Start daily puzzle" : "Start puzzle"}
        </button>
      </div>
    </div>
  );
}

function DailyLabel({ date }: { date: string | null }) {
  return date ? (
    <p className="md-puzzle-daily">
      <CalendarDays size={16} aria-hidden="true" />
      Daily puzzle · {date} (UTC)
    </p>
  ) : null;
}

type SauceRound = {
  id: string;
  initial: boolean[];
  board: boolean[];
  history: boolean[][];
  date: string | null;
  message: string;
  hint: number | null;
  hints: number;
};

export function SauceSwitch({ dailyDate }: { dailyDate?: string | undefined }) {
  const requestedDate = isArcadeDailyDate(dailyDate) ? dailyDate : undefined;
  const lastRequestedDate = useRef(requestedDate);
  const { recordCompletion } = useArcadeProgress();
  const recordedRound = useRef<string | null>(null);
  const [size, setSize] = useState<SauceSize>(3);
  const [daily, setDaily] = useState(Boolean(requestedDate));
  const [selectedDailyDate, setSelectedDailyDate] = useState(requestedDate);
  const [round, setRound] = useState<SauceRound | null>(null);
  const grid = usePuzzleFocus(size);
  const setActiveCell = grid.setActive;
  const instructionsId = useId();
  const nextPuzzleRef = useRef<HTMLButtonElement>(null);
  const complete = round !== null && sauceCleared(round.board, size);
  useCompletionFocus(complete, nextPuzzleRef);

  useEffect(() => {
    if (lastRequestedDate.current === requestedDate) return;
    lastRequestedDate.current = requestedDate;
    setSelectedDailyDate(requestedDate);
    setDaily(Boolean(requestedDate));
    setRound(null);
    setActiveCell(0);
  }, [requestedDate, setActiveCell]);

  useEffect(() => {
    if (!complete || !round || recordedRound.current === round.id) return;
    recordedRound.current = round.id;
    recordCompletion({
      id: round.id,
      game: "sauce-switch",
      result: "completed",
      moves: round.history.length,
      hints: round.hints,
      variant: `${size}x${size}`,
      ...(round.date ? { dailyDate: round.date } : {}),
    });
  }, [complete, round, size, recordCompletion]);

  function start(asDaily = daily) {
    const date = asDaily ? (selectedDailyDate ?? arcadeUtcDate()) : null;
    const seed = date ? Number(date.replaceAll("-", "")) : 0;
    const board = createSaucePuzzle(
      size,
      asDaily ? seededRandom(seed + size * 101 + 7301) : Math.random,
    );
    setRound({
      id: createArcadeRoundId(),
      initial: [...board],
      board,
      history: [],
      date,
      hint: null,
      hints: 0,
      message:
        "Turn every sauce tile off. Each tap flips that tile and its neighbours above, below, left and right.",
    });
    grid.focus(0);
  }

  function restart() {
    const id = createArcadeRoundId();
    setRound((current) =>
      current
        ? {
            ...current,
            id,
            board: [...current.initial],
            history: [],
            hint: null,
            hints: 0,
            message: "Same puzzle, fresh start. Try a different combination of tiles.",
          }
        : current,
    );
    grid.focus(0);
  }

  function flip(index: number) {
    grid.setActive(index);
    setRound((current) => {
      if (!current || sauceCleared(current.board, size)) return current;
      const board = flipSauce(current.board, index, size);
      const remaining = board.filter(Boolean).length;
      return {
        ...current,
        board,
        history: [...current.history, current.board],
        hint: null,
        message: `Tile ${index + 1} flipped with its neighbours. ${remaining} sauce ${remaining === 1 ? "tile is" : "tiles are"} still on.`,
      };
    });
  }

  function undo() {
    setRound((current) => {
      const previous = current?.history.at(-1);
      if (!current || !previous) return current;
      return {
        ...current,
        board: previous,
        history: current.history.slice(0, -1),
        hint: null,
        message: "Last move undone. You can try a different tile.",
      };
    });
    grid.focus(grid.active);
  }

  function showHint() {
    if (!round || complete) return;
    const next = solveSauce(round.board, size)?.[0];
    if (next === undefined) return;
    setRound({
      ...round,
      hint: next,
      hints: round.hints + (round.hint === next ? 0 : 1),
      message: `Hint: try tile ${next + 1}, row ${Math.floor(next / size) + 1}, column ${(next % size) + 1}. It is one step in a solution.`,
    });
    grid.focus(next);
  }

  return (
    <PuzzleFrame
      title="Sauce Switch"
      tag="Logic · Fresh or daily"
      description="One tap changes the neighbours. Find the combination that clears the whole tray."
      started={round !== null}
      onRestart={restart}
      rules={[
        "Turn every sauce tile off. Tapping a tile flips it and the tiles directly above, below, left and right. Diagonals stay as they are.",
        "A tile can turn back on, so plan a few taps ahead. Every starting puzzle has a solution, and you can undo or ask for a hint.",
        "Restart keeps the same layout. Daily puzzles match for everyone on that UTC date and grid size; New puzzle starts a fresh layout.",
      ]}
      keyboard="Tab into the tray. Use arrow keys to move between tiles, Home or End to reach either end of a row, and Enter or Space to flip. Tab leaves the tray."
    >
      <div className="md-game-options">
        <label>
          Grid size
          <select
            value={size}
            onChange={(event) => {
              setSize(event.target.value === "4" ? 4 : 3);
              setRound(null);
              grid.setActive(0);
            }}
          >
            <option value={3}>3 × 3 · Small tray</option>
            <option value={4}>4 × 4 · Big tray</option>
          </select>
        </label>
        <label>
          Sauce Switch challenge
          <select
            value={daily ? "daily" : "fresh"}
            onChange={(event) => {
              setDaily(event.target.value === "daily");
              setSelectedDailyDate(undefined);
              setRound(null);
              grid.setActive(0);
            }}
          >
            <option value="fresh">Fresh puzzle</option>
            <option value="daily">Daily puzzle · UTC</option>
          </select>
        </label>
      </div>
      {!round && daily && selectedDailyDate && <DailyLabel date={selectedDailyDate} />}
      {!round ? (
        <PuzzleStart
          art="sauce"
          title="A little sauce. A lot to solve."
          daily={daily}
          onStart={() => start()}
        >
          Start with nine tiles or try the bigger tray. Take your time: there’s no countdown and
          every puzzle can be cleared.
        </PuzzleStart>
      ) : (
        <>
          <PuzzleStats
            items={[
              { label: "Moves", value: round.history.length },
              { label: "Sauce tiles on", value: round.board.filter(Boolean).length },
              { label: "Hints used", value: round.hints },
            ]}
          />
          <DailyLabel date={round.date} />
          <PuzzleStatus complete={complete}>
            {complete
              ? `Tray cleared in ${round.history.length} ${round.history.length === 1 ? "move" : "moves"}${round.hints ? ` with ${round.hints} ${round.hints === 1 ? "hint" : "hints"}` : ""}. Every sauce tile is off!`
              : round.message}
          </PuzzleStatus>
          <p id={instructionsId} className="md-puzzle-board-instruction">
            <span>
              <img src={gameFoodArtwork.sauce} alt="" /> On
            </span>
            <ArrowRight size={17} aria-hidden="true" />
            <span>
              <Check size={18} aria-hidden="true" /> Off
            </span>
            <strong>Clear every tile.</strong>
          </p>
          <div
            className="md-sauce-board"
            style={{ "--sauce-size": size } as CSSProperties}
            role="group"
            aria-label={`${size} by ${size} Sauce Switch tray`}
            aria-describedby={instructionsId}
          >
            {round.board.map((on, index) => (
              <button
                key={index}
                type="button"
                ref={(element) => {
                  grid.cells.current[index] = element;
                }}
                tabIndex={grid.active === index ? 0 : -1}
                className={`md-sauce-cell${on ? " is-on" : " is-off"}${round.hint === index ? " is-hint" : ""}`}
                aria-pressed={on}
                aria-disabled={complete}
                aria-label={`Tile ${index + 1}, row ${Math.floor(index / size) + 1}, column ${(index % size) + 1}, sauce ${on ? "on" : "off"}${round.hint === index ? ", suggested tile" : ""}${complete ? ", puzzle complete" : ""}`}
                onFocus={() => grid.setActive(index)}
                onKeyDown={(event) => grid.onKeyDown(event, index)}
                onClick={() => flip(index)}
              >
                <span className="md-sauce-number" aria-hidden="true">
                  {index + 1}
                </span>
                {on ? (
                  <img src={gameFoodArtwork.sauce} alt="" draggable={false} />
                ) : (
                  <Check className="md-sauce-clear" aria-hidden="true" />
                )}
                <strong aria-hidden="true">{on ? "On" : "Off"}</strong>
                {round.hint === index && (
                  <Lightbulb className="md-sauce-hint-icon" size={14} aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
          <div className="md-game-actions">
            <button
              type="button"
              className="md-game-button"
              disabled={!round.history.length}
              onClick={undo}
            >
              <Undo2 size={17} aria-hidden="true" /> Undo
            </button>
            <button type="button" className="md-game-button" disabled={complete} onClick={showHint}>
              <Lightbulb size={17} aria-hidden="true" /> Hint
            </button>
            <button
              ref={nextPuzzleRef}
              type="button"
              className={`md-game-button${complete ? " is-primary" : ""}`}
              onClick={() => {
                setDaily(false);
                setSelectedDailyDate(undefined);
                start(false);
              }}
            >
              <Sparkles size={17} aria-hidden="true" />{" "}
              {complete ? "Play another puzzle" : "New puzzle"}
            </button>
          </div>
          <p className="md-game-hint">Changing the grid size or challenge sets up a new round.</p>
        </>
      )}
    </PuzzleFrame>
  );
}

type QuestRound = {
  id: string;
  puzzle: QuestPuzzle;
  found: QuestMatch[];
  start: number | null;
  date: string | null;
  hint: QuestWord | null;
  hints: number;
  message: string;
};

export function MenuQuest({ dailyDate }: { dailyDate?: string | undefined }) {
  const requestedDate = isArcadeDailyDate(dailyDate) ? dailyDate : undefined;
  const lastRequestedDate = useRef(requestedDate);
  const { recordCompletion } = useArcadeProgress();
  const recordedRound = useRef<string | null>(null);
  const [daily, setDaily] = useState(Boolean(requestedDate));
  const [selectedDailyDate, setSelectedDailyDate] = useState(requestedDate);
  const [round, setRound] = useState<QuestRound | null>(null);
  const [largeLetters, setLargeLetters] = useState(false);
  const grid = usePuzzleFocus(QUEST_SIZE);
  const setActiveCell = grid.setActive;
  const instructionsId = useId();
  const nextPuzzleRef = useRef<HTMLButtonElement>(null);
  const complete = round !== null && round.found.length === round.puzzle.words.length;
  const foundCells = new Set(round?.found.flatMap((match) => match.cells) ?? []);
  const foundWords = round?.found.map((match) => match.word) ?? [];
  const hintCell = round?.puzzle.words.find((match) => match.word === round.hint)?.cells[0];
  useCompletionFocus(complete, nextPuzzleRef);

  useEffect(() => {
    if (lastRequestedDate.current === requestedDate) return;
    lastRequestedDate.current = requestedDate;
    setSelectedDailyDate(requestedDate);
    setDaily(Boolean(requestedDate));
    setRound(null);
    setActiveCell(0);
  }, [requestedDate, setActiveCell]);

  useEffect(() => {
    if (!complete || !round || recordedRound.current === round.id) return;
    recordedRound.current = round.id;
    recordCompletion({
      id: round.id,
      game: "menu-quest",
      result: "completed",
      hints: round.hints,
      variant: "8x8",
      ...(round.date ? { dailyDate: round.date } : {}),
    });
  }, [complete, round, recordCompletion]);

  function start(asDaily = daily) {
    const date = asDaily ? (selectedDailyDate ?? arcadeUtcDate()) : null;
    const seed = date ? Number(date.replaceAll("-", "")) : 0;
    const puzzle = createQuestPuzzle(asDaily ? seededRandom(seed + 8101) : Math.random);
    setRound({
      id: createArcadeRoundId(),
      puzzle,
      found: [],
      start: null,
      date,
      hint: null,
      hints: 0,
      message:
        "Find a listed food word. Tap its first letter, then its last letter. No dragging needed.",
    });
    grid.focus(0);
  }

  function restart() {
    const id = createArcadeRoundId();
    setRound((current) =>
      current
        ? {
            ...current,
            id,
            found: [],
            start: null,
            hint: null,
            hints: 0,
            message: "Same letters, fresh search. Choose a word and find its two ends.",
          }
        : current,
    );
    grid.focus(0);
  }

  function choose(index: number) {
    grid.setActive(index);
    setRound((current) => {
      if (!current || current.found.length === current.puzzle.words.length) return current;
      if (current.start === null)
        return {
          ...current,
          start: index,
          hint: null,
          message: `${current.puzzle.letters[index]} selected at row ${Math.floor(index / QUEST_SIZE) + 1}, column ${(index % QUEST_SIZE) + 1}. Now choose the last letter in the same straight line.`,
        };
      if (current.start === index)
        return {
          ...current,
          start: null,
          hint: null,
          message: "Selection cleared. Choose a new first letter.",
        };
      const line = questLine(current.start, index);
      if (!line)
        return {
          ...current,
          message:
            "Choose a straight line: across, down or diagonal. Your first letter is still selected.",
        };
      const selected = line.map((cell) => current.puzzle.letters[cell]).join("");
      const alreadyFound = current.found.some(
        ({ word }) => word === selected || word === [...selected].reverse().join(""),
      );
      const match = matchQuestSelection(
        current.puzzle,
        current.start,
        index,
        current.found.map(({ word }) => word),
      );
      if (!match)
        return {
          ...current,
          start: null,
          hint: null,
          message: alreadyFound
            ? "You’ve already found that word. Look for a word without a tick."
            : `That line spells ${selected}. Try another first and last letter for one of the listed words.`,
        };
      return {
        ...current,
        found: [...current.found, match],
        start: null,
        hint: null,
        message: `${match.word} found! ${current.found.length + 1} of ${current.puzzle.words.length} words complete.`,
      };
    });
  }

  function clearSelection() {
    setRound((current) =>
      current
        ? {
            ...current,
            start: null,
            hint: null,
            message: "Selection cleared. Choose a new first letter.",
          }
        : current,
    );
  }

  function showHint() {
    if (!round || complete) return;
    const target = round.puzzle.words.find(({ word }) => !foundWords.includes(word));
    const first = target?.cells[0];
    if (!target || first === undefined) return;
    setRound({
      ...round,
      start: first,
      hint: target.word,
      hints: round.hints + (round.hint === target.word ? 0 : 1),
      message: `Hint: ${target.word} starts at row ${Math.floor(first / QUEST_SIZE) + 1}, column ${(first % QUEST_SIZE) + 1}. Its first letter is selected; find the last letter in a straight line.`,
    });
    grid.focus(first);
  }

  return (
    <PuzzleFrame
      title="Menu Quest"
      tag="Word search · Fresh or daily"
      description="Six food words are hiding in the letters. Take a closer look and find every one."
      started={round !== null}
      onRestart={restart}
      rules={[
        "Find all six listed words. Words can run across, down or diagonally, forwards or backwards.",
        "Tap a word’s first letter and then its last. You can choose the ends in either order, and words may share letters. Tap the first letter again to cancel.",
        "Hint selects the beginning of an unfound word. Larger letters gives you bigger tap targets; scroll within the board to see them all.",
        "Restart keeps these letters. The daily puzzle is the same for everyone on that UTC date; New puzzle creates a fresh search.",
      ]}
      keyboard="Tab into the letters, then use arrow keys, Home or End to move. Enter or Space selects an endpoint. Escape clears an unfinished selection. Tab leaves the board."
    >
      <div className="md-game-options">
        <label>
          Menu Quest challenge
          <select
            value={daily ? "daily" : "fresh"}
            onChange={(event) => {
              setDaily(event.target.value === "daily");
              setSelectedDailyDate(undefined);
              setRound(null);
              grid.setActive(0);
            }}
          >
            <option value="fresh">Fresh puzzle</option>
            <option value="daily">Daily puzzle · UTC</option>
          </select>
        </label>
      </div>
      {!round && daily && selectedDailyDate && <DailyLabel date={selectedDailyDate} />}
      {!round ? (
        <PuzzleStart
          art="fries"
          title="A word search to savour."
          daily={daily}
          onStart={() => start()}
        >
          Look in every direction for familiar food words. There’s no timer, and a hint is always
          there when you need a hand.
        </PuzzleStart>
      ) : (
        <>
          <PuzzleStats
            items={[
              {
                label: "Words found",
                value: `${round.found.length} / ${round.puzzle.words.length}`,
              },
              { label: "Hints used", value: round.hints },
              { label: "Challenge", value: round.date ? "Daily" : "Fresh" },
            ]}
          />
          <DailyLabel date={round.date} />
          <PuzzleStatus complete={complete}>
            {complete
              ? `All six words found${round.hints ? ` with ${round.hints} ${round.hints === 1 ? "hint" : "hints"}` : " without a hint"}! A perfectly finished menu.`
              : round.message}
          </PuzzleStatus>
          <div className="md-quest-targets">
            <h3>Find these foods</h3>
            <ul aria-label="Words to find">
              {round.puzzle.words.map(({ word }) => (
                <li key={word} className={foundWords.includes(word) ? "is-found" : ""}>
                  {foundWords.includes(word) ? (
                    <Check size={16} aria-hidden="true" />
                  ) : (
                    <span className="md-quest-word-dot" aria-hidden="true" />
                  )}
                  <span>{word}</span>
                  <span className="md-game-sr-only">
                    {foundWords.includes(word) ? ", found" : ", not found"}
                  </span>
                </li>
              ))}
            </ul>
            <progress
              value={round.found.length}
              max={round.puzzle.words.length}
              aria-label="Food words found"
            />
          </div>
          <div className="md-quest-board-toolbar">
            <p id={instructionsId}>Tap the first letter, then the last.</p>
            <button
              type="button"
              className="md-game-button"
              aria-pressed={largeLetters}
              onClick={() => setLargeLetters((value) => !value)}
            >
              {largeLetters ? (
                <ZoomOut size={17} aria-hidden="true" />
              ) : (
                <ZoomIn size={17} aria-hidden="true" />
              )}
              {largeLetters ? "Fit letters" : "Larger letters"}
            </button>
          </div>
          {largeLetters && (
            <p className="md-puzzle-note">
              Bigger tap targets are on. Scroll sideways inside the board if needed.
            </p>
          )}
          <div className={`md-quest-board-scroll${largeLetters ? " is-large" : ""}`}>
            <div
              className="md-quest-board"
              role="group"
              aria-label="Eight by eight Menu Quest letter board"
              aria-describedby={instructionsId}
            >
              {round.puzzle.letters.map((letter, index) => (
                <button
                  key={index}
                  type="button"
                  ref={(element) => {
                    grid.cells.current[index] = element;
                  }}
                  tabIndex={grid.active === index ? 0 : -1}
                  className={`md-quest-cell${foundCells.has(index) ? " is-found" : ""}${round.start === index ? " is-start" : ""}${hintCell === index ? " is-hint" : ""}`}
                  aria-pressed={round.start === index}
                  aria-disabled={complete}
                  aria-label={`${letter}, row ${Math.floor(index / QUEST_SIZE) + 1}, column ${(index % QUEST_SIZE) + 1}${round.start === index ? ", selected first letter" : ""}${foundCells.has(index) ? ", part of a found word" : ""}${complete ? ", puzzle complete" : ""}`}
                  onFocus={() => grid.setActive(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && round.start !== null) {
                      event.preventDefault();
                      event.stopPropagation();
                      clearSelection();
                    } else grid.onKeyDown(event, index);
                  }}
                  onClick={() => choose(index)}
                >
                  {letter}
                </button>
              ))}
            </div>
          </div>
          <div className="md-game-actions">
            <button
              type="button"
              className="md-game-button"
              disabled={round.start === null || complete}
              onClick={clearSelection}
            >
              <X size={17} aria-hidden="true" /> Clear selection
            </button>
            <button type="button" className="md-game-button" disabled={complete} onClick={showHint}>
              <Lightbulb size={17} aria-hidden="true" /> Hint
            </button>
            <button
              ref={nextPuzzleRef}
              type="button"
              className={`md-game-button${complete ? " is-primary" : ""}`}
              onClick={() => {
                setDaily(false);
                setSelectedDailyDate(undefined);
                start(false);
              }}
            >
              <Sparkles size={17} aria-hidden="true" />{" "}
              {complete ? "Play another puzzle" : "New puzzle"}
            </button>
          </div>
          <p className="md-game-hint">
            Tip: spot an unusual letter, then look outwards in every direction.
          </p>
        </>
      )}
    </PuzzleFrame>
  );
}
