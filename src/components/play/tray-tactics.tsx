import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChefHat, RotateCcw, Trophy, Undo2, Users } from "lucide-react";

import { gameFoodArtwork } from "@/lib/game-food-artwork";
import { useArcadeProgress } from "@/components/play/arcade-progress";
import { createArcadeRoundId } from "@/lib/mealdeck-play-progress";
import {
  TRAY_SIZE,
  countTrayPieces,
  createTrayGame,
  legalTrayMoves,
  playTrayMove,
  playTraySoloRound,
  trayFlips,
  trayWinner,
  type TrayDifficulty,
  type TrayPlayer,
  type TrayState,
} from "@/lib/tray-tactics";
import "@/styles.mealdeck-arcade-games.css";
import "@/styles.tray-tactics.css";

type TrayMode = "solo" | "local";

function squareName(index: number): string {
  return `${String.fromCharCode(65 + (index % TRAY_SIZE))}${Math.floor(index / TRAY_SIZE) + 1}`;
}

function pieceName(player: TrayPlayer): string {
  return player === 1 ? "Burger" : "Cake";
}

export function TrayTactics() {
  const id = useId();
  const { recordCompletion } = useArcadeProgress();
  const [roundId, setRoundId] = useState<string | null>(null);
  const recordedRound = useRef<string | null>(null);
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<TrayMode>("solo");
  const [difficulty, setDifficulty] = useState<TrayDifficulty>("casual");
  const [game, setGame] = useState<TrayState>(createTrayGame);
  const [history, setHistory] = useState<TrayState[]>([]);
  const [notice, setNotice] = useState("Burger moves first. Choose a dotted square.");
  const [focusIndex, setFocusIndex] = useState(8);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const boardArea = useRef<HTMLDivElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const playAgainButton = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<number | "start" | null>(null);
  const counts = countTrayPieces(game.board);
  const moves = game.over ? [] : legalTrayMoves(game.board, game.turn);
  const winner = game.over ? trayWinner(game.board) : null;
  const turnName = mode === "solo" ? "Your turn · Burger" : `${pieceName(game.turn)}'s turn`;
  const result =
    winner === null
      ? "Even portions! It's a draw."
      : mode === "solo"
        ? winner === 1
          ? "You win the tray!"
          : "The chef wins this tray."
        : `${pieceName(winner)} wins the tray!`;

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    if (target === "start") startButton.current?.focus({ preventScroll: true });
    else {
      boardArea.current?.scrollIntoView({ block: "start", behavior: "auto" });
      cells.current[target]?.focus({ preventScroll: true });
    }
    pendingFocus.current = null;
  }, [started, game]);

  useEffect(() => {
    if (!started || !game.over) return;
    const frame = window.requestAnimationFrame(() => {
      playAgainButton.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [started, game.over]);

  useEffect(() => {
    if (!started || !game.over || !roundId || recordedRound.current === roundId) return;
    recordedRound.current = roundId;
    recordCompletion({
      id: roundId,
      game: "tray-tactics",
      result:
        mode === "local" ? "completed" : winner === null ? "draw" : winner === 1 ? "win" : "loss",
      moves: game.moveCount,
      variant: `${mode}-${difficulty}`,
    });
  }, [started, game.over, game.moveCount, roundId, mode, difficulty, winner, recordCompletion]);

  function startRound() {
    const next = createTrayGame();
    setRoundId(createArcadeRoundId());
    setGame(next);
    setHistory([]);
    setNotice("Burger moves first. Choose a dotted square.");
    setFocusIndex(8);
    pendingFocus.current = 8;
    setStarted(true);
  }

  function makeMove(index: number) {
    if (!started || game.over || !moves.includes(index)) return;
    const round = mode === "solo" ? playTraySoloRound(game, index, difficulty) : null;
    const next = round?.state ?? playTrayMove(game, index);
    if (next === game) return;
    setHistory((previous) => [...previous, game]);
    setGame(next);
    const passes = round?.passes ?? (next.passedPlayer ? [next.passedPlayer] : []);
    const passMessage = [...new Set(passes)]
      .map((player) => {
        const count = passes.filter((passed) => passed === player).length;
        return `${pieceName(player)} had no legal move and passed automatically${count > 1 ? ` ${count} times` : ""}.`;
      })
      .join(" ");
    const chefMessage =
      round && round.chefMoves.length > 0
        ? ` Chef played ${round.chefMoves.map(squareName).join(", ")}.`
        : "";
    setNotice(
      `${pieceName(game.turn)} played ${squareName(index)}.${chefMessage}${passMessage ? ` ${passMessage}` : ""}`,
    );
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setGame(previous);
    setHistory((entries) => entries.slice(0, -1));
    setNotice(
      mode === "solo"
        ? "Round undone, including the chef's reply. Choose your move again."
        : "Last move undone. Choose a move again.",
    );
    const nextFocus = legalTrayMoves(previous.board, previous.turn)[0] ?? 0;
    setFocusIndex(nextFocus);
    pendingFocus.current = nextFocus;
  }

  function navigateBoard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const row = Math.floor(index / TRAY_SIZE);
    const column = index % TRAY_SIZE;
    let next = index;
    switch (event.key) {
      case "ArrowLeft":
        next = row * TRAY_SIZE + Math.max(0, column - 1);
        break;
      case "ArrowRight":
        next = row * TRAY_SIZE + Math.min(TRAY_SIZE - 1, column + 1);
        break;
      case "ArrowUp":
        next = Math.max(0, row - 1) * TRAY_SIZE + column;
        break;
      case "ArrowDown":
        next = Math.min(TRAY_SIZE - 1, row + 1) * TRAY_SIZE + column;
        break;
      case "Home":
        next = row * TRAY_SIZE;
        break;
      case "End":
        next = row * TRAY_SIZE + TRAY_SIZE - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setFocusIndex(next);
    cells.current[next]?.focus({ preventScroll: true });
    cells.current[next]?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
  }

  return (
    <section className="md-arcade-game md-tray" aria-labelledby={`${id}-title`}>
      <div className="md-game-heading">
        <div>
          <p className="md-game-kicker">
            <ChefHat size={16} aria-hidden="true" /> A little food for thought
          </p>
          <h2 id={`${id}-title`}>Tray Tactics</h2>
          <p className="md-game-description">
            Claim the tray, one tasty flip at a time. Sandwich your rival's pieces between yours to
            turn them into your team.
          </p>
        </div>
      </div>
      <details className="md-game-guide">
        <summary>How to play Tray Tactics</summary>
        <ol>
          <li>
            Burger goes first. Place a piece on a dotted square so it traps one or more rival pieces
            between your new piece and another of your pieces.
          </li>
          <li>
            Every trapped line flips, horizontally, vertically or diagonally. Try taking corners:
            they cannot be flipped back.
          </li>
          <li>
            If a player has no legal move, they pass automatically. The game ends when neither
            player can move. The team with more pieces wins.
          </li>
          <li>
            On a keyboard, use arrow keys inside the tray and Enter or Space to place a piece. Undo
            reverses a full round against the chef, or one move with a friend.
          </li>
        </ol>
      </details>

      {!started ? (
        <div className="md-tray__setup">
          <div className="md-tray__intro-art" aria-hidden="true">
            <img src={gameFoodArtwork.burger} alt="" draggable={false} />
            <span>vs</span>
            <img src={gameFoodArtwork.cake} alt="" draggable={false} />
          </div>
          <div className="md-tray__setup-controls">
            <h3>A small tray. Plenty of possibilities.</h3>
            <p>A quick strategy game for you and the chef, or two people sharing a screen.</p>
            <fieldset className="md-tray__choices">
              <legend>Who's playing?</legend>
              <button
                className="md-game-button"
                type="button"
                aria-pressed={mode === "solo"}
                onClick={() => setMode("solo")}
              >
                <ChefHat size={17} aria-hidden="true" /> Play the chef
              </button>
              <button
                className="md-game-button"
                type="button"
                aria-pressed={mode === "local"}
                onClick={() => setMode("local")}
              >
                <Users size={17} aria-hidden="true" /> Two players
              </button>
            </fieldset>
            {mode === "solo" && (
              <fieldset className="md-tray__choices">
                <legend>Chef's skill</legend>
                <button
                  className="md-game-button"
                  type="button"
                  aria-pressed={difficulty === "casual"}
                  onClick={() => setDifficulty("casual")}
                >
                  Casual
                </button>
                <button
                  className="md-game-button"
                  type="button"
                  aria-pressed={difficulty === "clever"}
                  onClick={() => setDifficulty("clever")}
                >
                  Clever
                </button>
                <p>
                  {difficulty === "casual"
                    ? "A relaxed opponent who considers the next move."
                    : "A thoughtful opponent who plans three moves ahead."}
                </p>
              </fieldset>
            )}
            <button
              ref={startButton}
              className="md-game-button is-primary"
              type="button"
              onClick={startRound}
            >
              Set the tray
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="md-tray__scoreboard" aria-label="Tray score">
            <div className={`md-tray__score${!game.over && game.turn === 1 ? " is-current" : ""}`}>
              <img src={gameFoodArtwork.burger} alt="" draggable={false} />
              <div>
                <span>{mode === "solo" ? "You · Burger" : "Burger"}</span>
                <strong>
                  {counts.burger}
                  <span className="md-tray__sr-only"> pieces</span>
                </strong>
              </div>
            </div>
            <span className="md-tray__versus" aria-hidden="true">
              vs
            </span>
            <div className={`md-tray__score${!game.over && game.turn === 2 ? " is-current" : ""}`}>
              <img src={gameFoodArtwork.cake} alt="" draggable={false} />
              <div>
                <span>{mode === "solo" ? "Chef · Cake" : "Cake"}</span>
                <strong>
                  {counts.cake}
                  <span className="md-tray__sr-only"> pieces</span>
                </strong>
              </div>
            </div>
          </div>
          <div className="md-tray__play-layout">
            <div ref={boardArea} className="md-tray__board-area">
              <div className="md-tray__turn">
                <strong>{game.over ? "Tray complete" : turnName}</strong>
                <span>
                  {game.over
                    ? `${game.moveCount} moves played`
                    : `${moves.length} legal ${moves.length === 1 ? "move" : "moves"}`}
                </span>
              </div>
              <div
                className="md-tray__board"
                role="grid"
                aria-label="Tray Tactics, six by six board"
                aria-rowcount={TRAY_SIZE}
                aria-colcount={TRAY_SIZE}
                aria-describedby={`${id}-keyboard`}
              >
                {Array.from({ length: TRAY_SIZE }, (_, row) => (
                  <div className="md-tray__row" role="row" key={row}>
                    {Array.from({ length: TRAY_SIZE }, (_, column) => {
                      const index = row * TRAY_SIZE + column;
                      const piece = game.board[index] ?? 0;
                      const legal = moves.includes(index);
                      const flipCount = legal ? trayFlips(game.board, index, game.turn).length : 0;
                      const label = `${squareName(index)}, ${piece === 0 ? "empty" : pieceName(piece)}${legal ? `, legal move, flips ${flipCount} ${flipCount === 1 ? "piece" : "pieces"}` : ""}${game.lastMove === index ? ", last piece placed" : ""}`;
                      return (
                        <div role="gridcell" key={index}>
                          <button
                            ref={(element) => {
                              cells.current[index] = element;
                            }}
                            type="button"
                            className={`md-tray__cell${legal ? " is-legal" : ""}${game.lastMove === index ? " is-last" : ""}${piece ? ` is-player-${piece}` : ""}`}
                            aria-label={label}
                            aria-disabled={!legal}
                            tabIndex={focusIndex === index ? 0 : -1}
                            onFocus={() => setFocusIndex(index)}
                            onKeyDown={(event) => navigateBoard(event, index)}
                            onClick={() => makeMove(index)}
                          >
                            {piece !== 0 ? (
                              <img
                                src={gameFoodArtwork[piece === 1 ? "burger" : "cake"]}
                                alt=""
                                draggable={false}
                              />
                            ) : legal ? (
                              <span className="md-tray__legal-dot" aria-hidden="true" />
                            ) : null}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <p id={`${id}-keyboard`} className="md-tray__board-help">
                Dotted squares are legal moves. Arrow keys to explore; Enter or Space to play.
              </p>
            </div>
            <div className="md-tray__side">
              <div
                className={`md-game-status${game.over ? " md-game-status--success" : ""}`}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <div>
                  {game.over && (
                    <>
                      <Trophy size={22} aria-hidden="true" />
                      <h3>{result}</h3>
                      <p>
                        {counts.burger} burger pieces · {counts.cake} cake pieces.
                      </p>
                      <p>
                        {counts.empty === 0
                          ? "The tray is full."
                          : "Neither team has a legal move, so the tray is complete."}
                      </p>
                    </>
                  )}
                  <p>{notice}</p>
                  {!game.over && (
                    <p>
                      <strong>{turnName}.</strong> {moves.length} legal{" "}
                      {moves.length === 1 ? "move" : "moves"} available.
                    </p>
                  )}
                </div>
              </div>
              <div className="md-tray__actions">
                <button
                  className="md-game-button"
                  type="button"
                  disabled={history.length === 0}
                  onClick={undo}
                >
                  <Undo2 size={17} aria-hidden="true" />{" "}
                  {mode === "solo" ? "Undo round" : "Undo move"}
                </button>
                <button
                  ref={playAgainButton}
                  className={`md-game-button${game.over ? " is-primary" : ""}`}
                  type="button"
                  onClick={startRound}
                >
                  <RotateCcw size={17} aria-hidden="true" />{" "}
                  {game.over ? "Play again" : "Restart tray"}
                </button>
                <button
                  className="md-game-button"
                  type="button"
                  onClick={() => {
                    pendingFocus.current = "start";
                    setStarted(false);
                  }}
                >
                  Change players
                </button>
              </div>
              <div className="md-tray__tip">
                <strong>Chef's tip</strong>
                <p>
                  More pieces now does not always mean more pieces at the end. Keep your options
                  open and look for corners.
                </p>
              </div>
              <p className="md-tray__local-note">
                {mode === "solo"
                  ? `${difficulty === "clever" ? "Clever" : "Casual"} chef`
                  : "Two players, one screen"}{" "}
                · Finished rounds can be kept in My playbook on this browser. The board resets when
                you leave or reload.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
