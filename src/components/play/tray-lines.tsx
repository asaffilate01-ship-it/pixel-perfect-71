import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChefHat, Plus, RotateCcw, Trophy, Undo2, Users } from "lucide-react";

import { useArcadeProgress } from "@/components/play/arcade-progress";
import { gameFoodArtwork } from "@/lib/game-food-artwork";
import { createArcadeRoundId } from "@/lib/mealdeck-play-progress";
import {
  TRAY_LINE_EDGES,
  TRAY_LINES_DOTS,
  TRAY_LINES_SIZE,
  countTrayBoxes,
  createTrayLinesSession,
  legalTrayLinesMoves,
  playTrayLinesSessionMove,
  trayBoxEdges,
  trayLinesWinner,
  undoTrayLinesSession,
  type TrayLineEdge,
  type TrayLinesDifficulty,
  type TrayLinesMode,
  type TrayLinesPlayer,
} from "@/lib/tray-lines";
import "@/styles.mealdeck-arcade-games.css";
import "@/styles.tray-lines.css";

function playerName(player: TrayLinesPlayer): string {
  return player === 1 ? "Burger" : "Cake";
}

function lineLabel(edge: TrayLineEdge): string {
  return `${edge.orientation === "horizontal" ? "Horizontal" : "Vertical"} edge, row ${edge.row + 1}, column ${edge.column + 1}`;
}

function edgePosition(edge: TrayLineEdge): { x: number; y: number } {
  return {
    x: edge.column + (edge.orientation === "horizontal" ? 0.5 : 0),
    y: edge.row + (edge.orientation === "vertical" ? 0.5 : 0),
  };
}

/** Keep all circular edge targets inside the tray, including the outer edges. */
function positionStyle(x: number, y: number): CSSProperties {
  return {
    left: `calc(${(x / TRAY_LINES_SIZE) * 100}% + ${22 - (x / TRAY_LINES_SIZE) * 44}px)`,
    top: `calc(${(y / TRAY_LINES_SIZE) * 100}% + ${22 - (y / TRAY_LINES_SIZE) * 44}px)`,
  };
}

export function TrayLines() {
  const id = useId();
  const { recordCompletion } = useArcadeProgress();
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<TrayLinesMode>("solo");
  const [difficulty, setDifficulty] = useState<TrayLinesDifficulty>("casual");
  const [session, setSession] = useState(createTrayLinesSession);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [focusEdge, setFocusEdge] = useState(0);
  const [notice, setNotice] = useState("Burger starts. Choose any dotted edge to join two dots.");
  const edgeButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const boardArea = useRef<HTMLDivElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const playAgainButton = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<number | "start" | null>(null);
  const game = session.state;
  const scores = countTrayBoxes(game);
  const winner = game.over ? trayLinesWinner(game) : null;
  const turnName = mode === "solo" ? "Your turn · Burger" : `${playerName(game.turn)}'s turn`;
  const selectedEdge = TRAY_LINE_EDGES[focusEdge];
  const result =
    winner === null
      ? "An even tray. It's a draw!"
      : mode === "solo"
        ? winner === 1
          ? "You claimed the tray!"
          : "The chef claimed this tray."
        : `${playerName(winner)} claims the tray!`;

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    if (target === "start") startButton.current?.focus({ preventScroll: true });
    else {
      boardArea.current?.scrollIntoView({ block: "start", behavior: "auto" });
      edgeButtons.current[target]?.focus({ preventScroll: true });
    }
    pendingFocus.current = null;
  }, [started, game]);

  useEffect(() => {
    if (!started || !game.over) return;
    const frame = window.requestAnimationFrame(() => {
      playAgainButton.current?.focus({ preventScroll: true });
      playAgainButton.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [started, game.over]);

  useEffect(() => {
    if (!started || !game.over || !roundId) return;
    recordCompletion({
      id: roundId,
      game: "tray-lines",
      result:
        mode === "local" ? "completed" : winner === null ? "draw" : winner === 1 ? "win" : "loss",
      moves: game.moveCount,
      variant: `${mode}-${difficulty}`,
    });
  }, [started, game.over, game.moveCount, roundId, mode, difficulty, winner, recordCompletion]);

  function startRound() {
    setSession(createTrayLinesSession());
    setRoundId(createArcadeRoundId());
    setNotice("Burger starts. Choose any dotted edge to join two dots.");
    setFocusEdge(0);
    pendingFocus.current = 0;
    setStarted(true);
  }

  function makeMove(edgeId: number) {
    if (!started) return;
    const next = playTrayLinesSessionMove(session, edgeId, mode, difficulty);
    if (next === session) return;
    setFocusEdge(edgeId);
    setSession(next);
    const human = next.lastActions[0];
    if (!human) return;
    const chefActions = mode === "solo" ? next.lastActions.slice(1) : [];
    const chefBoxes = chefActions.reduce((total, action) => total + action.captured.length, 0);
    const subject = mode === "solo" ? "You" : playerName(human.player);
    const scoreMessage =
      human.captured.length > 0
        ? `${subject} closed ${human.captured.length === 1 ? "a box" : `${human.captured.length} boxes`}${next.state.over ? "." : " and earned another move."}`
        : `${subject} drew a line.`;
    const chefMessage =
      chefActions.length > 0
        ? ` Chef drew ${chefActions.length} ${chefActions.length === 1 ? "line" : "lines"}${chefBoxes > 0 ? ` and claimed ${chefBoxes} ${chefBoxes === 1 ? "box" : "boxes"}` : ""}.`
        : "";
    setNotice(`${scoreMessage}${chefMessage}`);
  }

  function undo() {
    const previous = undoTrayLinesSession(session);
    if (previous === session) return;
    setSession(previous);
    setNotice(
      mode === "solo"
        ? "Your whole turn is undone, including extra moves and the chef's reply. Try another line."
        : "Last line undone. Choose your move again.",
    );
    const nextFocus = legalTrayLinesMoves(previous.state)[0] ?? 0;
    setFocusEdge(nextFocus);
    pendingFocus.current = nextFocus;
  }

  function navigateEdges(event: KeyboardEvent<HTMLButtonElement>, edge: TrayLineEdge) {
    let next: number | undefined;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TRAY_LINE_EDGES.length - 1;
    else {
      const directions: Record<string, readonly [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const direction = directions[event.key];
      if (!direction) return;
      const [dx = 0, dy = 0] = direction;
      const origin = edgePosition(edge);
      let closest = Infinity;
      for (const candidate of TRAY_LINE_EDGES) {
        const point = edgePosition(candidate);
        const x = point.x - origin.x;
        const y = point.y - origin.y;
        if (x * dx + y * dy <= 0) continue;
        const distance = x * x + y * y + Math.abs(dx ? y : x) * 0.1;
        if (distance < closest) {
          closest = distance;
          next = candidate.id;
        }
      }
    }
    event.preventDefault();
    if (next === undefined) return;
    setFocusEdge(next);
    edgeButtons.current[next]?.focus({ preventScroll: true });
    edgeButtons.current[next]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
  }

  return (
    <section className="md-arcade-game md-lines" aria-labelledby={`${id}-title`}>
      <div className="md-game-heading">
        <div>
          <p className="md-game-kicker">
            <ChefHat size={16} aria-hidden="true" /> Join the dots. Claim a bite.
          </p>
          <h2 id={`${id}-title`}>Tray Lines</h2>
          <p className="md-game-description">
            Draw the last side of a box to fill it with your food. Every box earns a point and
            another move.
          </p>
        </div>
      </div>
      <details className="md-game-guide">
        <summary>How to play Tray Lines</summary>
        <ol>
          <li>
            Burger starts. Tap a plus on any dotted edge to connect two neighbouring dots. Draw one
            line per turn.
          </li>
          <li>
            Complete the fourth side of a box to claim it. You can close two boxes with one line.
            Each completed box is worth one point.
          </li>
          <li>
            Closing a box earns another move. Keep going until you draw a line that does not
            complete a box.
          </li>
          <li>
            When all nine boxes are filled, the team with the most boxes wins. No timer: take a
            moment to think.
          </li>
          <li>
            Use arrow keys to explore the edges, then Enter or Space to draw. Undo restores your
            full turn against the chef, including extra moves, or one line with a friend.
          </li>
        </ol>
      </details>
      {!started ? (
        <div className="md-lines__setup">
          <div className="md-lines__intro-art" aria-hidden="true">
            <img src={gameFoodArtwork.burger} alt="" draggable={false} />
            <span>vs</span>
            <img src={gameFoodArtwork.cake} alt="" draggable={false} />
          </div>
          <div>
            <h3>Nine boxes. One tasty contest.</h3>
            <p>
              Keep your lines close and your next move closer. Play the chef or pass the screen to a
              friend.
            </p>
            <fieldset className="md-lines__choices">
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
              <fieldset className="md-lines__choices">
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
                    ? "A friendly chef who snaps up open boxes."
                    : "A careful chef who avoids giveaways and plans the endgame."}
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
          <div className="md-lines__scoreboard" aria-label="Boxes claimed">
            <div className={`md-lines__score${!game.over && game.turn === 1 ? " is-current" : ""}`}>
              <img src={gameFoodArtwork.burger} alt="" draggable={false} />
              <div>
                <span>{mode === "solo" ? "You · Burger" : "Burger"}</span>
                <strong>
                  {scores.burger}
                  <span className="md-lines__sr-only"> boxes</span>
                </strong>
              </div>
            </div>
            <span className="md-lines__versus" aria-hidden="true">
              vs
            </span>
            <div className={`md-lines__score${!game.over && game.turn === 2 ? " is-current" : ""}`}>
              <img src={gameFoodArtwork.cake} alt="" draggable={false} />
              <div>
                <span>{mode === "solo" ? "Chef · Cake" : "Cake"}</span>
                <strong>
                  {scores.cake}
                  <span className="md-lines__sr-only"> boxes</span>
                </strong>
              </div>
            </div>
          </div>
          <div className="md-lines__play-layout">
            <div ref={boardArea} className="md-lines__board-area">
              <div className="md-lines__turn">
                <strong>{game.over ? "All boxes served" : turnName}</strong>
                <span>
                  {scores.empty} {scores.empty === 1 ? "box" : "boxes"} left
                </span>
              </div>
              <div
                className="md-lines__board"
                role="group"
                aria-label="Tray Lines board, four rows and four columns of dots"
                aria-describedby={`${id}-keyboard`}
              >
                <svg className="md-lines__drawing" viewBox="0 0 300 300" aria-hidden="true">
                  {game.boxes.map(
                    (owner, box) =>
                      owner !== 0 && (
                        <rect
                          key={box}
                          x={(box % TRAY_LINES_SIZE) * 100 + 8}
                          y={Math.floor(box / TRAY_LINES_SIZE) * 100 + 8}
                          width="84"
                          height="84"
                          rx="12"
                          className={
                            owner === 1 ? "md-lines__box is-burger" : "md-lines__box is-cake"
                          }
                        />
                      ),
                  )}
                  {TRAY_LINE_EDGES.map((edge) => (
                    <line
                      key={edge.id}
                      x1={edge.column * 100}
                      y1={edge.row * 100}
                      x2={(edge.column + (edge.orientation === "horizontal" ? 1 : 0)) * 100}
                      y2={(edge.row + (edge.orientation === "vertical" ? 1 : 0)) * 100}
                      className={`md-lines__line${game.edges[edge.id] === 1 ? " is-burger" : game.edges[edge.id] === 2 ? " is-cake" : " is-open"}${game.lastEdge === edge.id ? " is-last" : ""}`}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {Array.from({ length: TRAY_LINES_DOTS * TRAY_LINES_DOTS }, (_, dot) => (
                    <circle
                      key={dot}
                      cx={(dot % TRAY_LINES_DOTS) * 100}
                      cy={Math.floor(dot / TRAY_LINES_DOTS) * 100}
                      r="5"
                      className="md-lines__dot"
                    />
                  ))}
                </svg>
                {Array.from({ length: TRAY_LINES_DOTS }, (_, index) => (
                  <span
                    key={`column-${index}`}
                    className="md-lines__coordinate is-column"
                    style={{ left: positionStyle(index, 0).left }}
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                ))}
                {Array.from({ length: TRAY_LINES_DOTS }, (_, index) => (
                  <span
                    key={`row-${index}`}
                    className="md-lines__coordinate is-row"
                    style={{ top: positionStyle(0, index).top }}
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                ))}
                {game.boxes.map(
                  (owner, box) =>
                    owner !== 0 && (
                      <img
                        key={box}
                        className="md-lines__food"
                        style={positionStyle(
                          (box % TRAY_LINES_SIZE) + 0.5,
                          Math.floor(box / TRAY_LINES_SIZE) + 0.5,
                        )}
                        src={gameFoodArtwork[owner === 1 ? "burger" : "cake"]}
                        alt={`Box row ${Math.floor(box / TRAY_LINES_SIZE) + 1}, column ${(box % TRAY_LINES_SIZE) + 1}: ${playerName(owner)}`}
                        draggable={false}
                      />
                    ),
                )}
                {TRAY_LINE_EDGES.map((edge) => {
                  const owner = game.edges[edge.id] ?? 0;
                  const point = edgePosition(edge);
                  const closes =
                    owner === 0
                      ? edge.boxes.filter(
                          (box) =>
                            game.boxes[box] === 0 &&
                            trayBoxEdges(box).every(
                              (side) => side === edge.id || game.edges[side] !== 0,
                            ),
                        ).length
                      : 0;
                  const label = `${lineLabel(edge)}, ${owner === 0 ? `available${closes > 0 ? `, closes ${closes} ${closes === 1 ? "box" : "boxes"}` : ""}` : `drawn by ${playerName(owner)}`}${game.lastEdge === edge.id ? ", last line drawn" : ""}`;
                  return (
                    <button
                      ref={(element) => {
                        edgeButtons.current[edge.id] = element;
                      }}
                      key={edge.id}
                      type="button"
                      className={`md-lines__edge${owner === 0 ? " is-open" : " is-drawn"}${game.lastEdge === edge.id ? " is-last" : ""}`}
                      style={positionStyle(point.x, point.y)}
                      aria-label={label}
                      aria-disabled={owner !== 0 || game.over}
                      tabIndex={focusEdge === edge.id ? 0 : -1}
                      onFocus={() => setFocusEdge(edge.id)}
                      onKeyDown={(event) => navigateEdges(event, edge)}
                      onClick={() => makeMove(edge.id)}
                    >
                      {owner === 0 && <Plus size={17} aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
              <p className="md-lines__selection">
                {selectedEdge ? lineLabel(selectedEdge) : "Choose an edge"}
                {selectedEdge && game.edges[selectedEdge.id] !== 0 ? " · drawn" : " · available"}
              </p>
              <p id={`${id}-keyboard`} className="md-lines__board-help">
                Tap a plus to draw a line. Arrow keys to explore; Enter or Space to play.
              </p>
            </div>
            <div className="md-lines__side">
              <div
                className={`md-game-status${game.over ? " is-success" : ""}`}
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
                        Burger {scores.burger} · Cake {scores.cake}. All nine boxes are filled.
                      </p>
                    </>
                  )}
                  <p>{notice}</p>
                  {!game.over && (
                    <p>
                      <strong>{turnName}.</strong>{" "}
                      {session.humanTurnInProgress
                        ? "You closed a box, so draw again."
                        : `${24 - game.moveCount} lines available.`}
                    </p>
                  )}
                </div>
              </div>
              <div className="md-lines__actions">
                <button
                  className="md-game-button"
                  type="button"
                  disabled={session.history.length === 0}
                  onClick={undo}
                >
                  <Undo2 size={17} aria-hidden="true" />{" "}
                  {mode === "solo" ? "Undo turn" : "Undo line"}
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
              <div className="md-lines__tip">
                <strong>Chef's tip</strong>
                <p>
                  A third side can be an invitation. Leave yourself choices before handing your
                  rival a chain of boxes.
                </p>
              </div>
              <p className="md-lines__local-note">
                {mode === "solo"
                  ? `${difficulty === "clever" ? "Clever" : "Casual"} chef`
                  : "Two players, one screen"}{" "}
                · Your round resets when you leave or reload. Completed games appear in your local
                play history.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
