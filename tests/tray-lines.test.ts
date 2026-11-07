import { describe, expect, test } from "bun:test";
import {
  TRAY_LINE_EDGES,
  TRAY_LINES_BOX_COUNT,
  TRAY_LINES_EDGE_COUNT,
  chooseTrayLine,
  countTrayBoxes,
  createTrayLinesGame,
  createTrayLinesSession,
  legalTrayLinesMoves,
  playTrayLine,
  playTrayLinesSessionMove,
  trayBoxEdges,
  trayLinesWinner,
  undoTrayLinesSession,
  type TrayLinesOwner,
  type TrayLinesPlayer,
  type TrayLinesSession,
  type TrayLinesState,
} from "../src/lib/tray-lines";

/** Prepare a legal arrangement without prescribing the sequence that led to it. */
function position(drawn: readonly number[], turn: TrayLinesPlayer = 1): TrayLinesState {
  const edges = Array<TrayLinesOwner>(TRAY_LINES_EDGE_COUNT).fill(0);
  for (const edge of drawn) edges[edge] = 2;
  const boxes = Array.from({ length: TRAY_LINES_BOX_COUNT }, (_, box): TrayLinesOwner =>
    trayBoxEdges(box).every((edge) => edges[edge] !== 0) ? 2 : 0,
  );
  return Object.freeze({
    edges: Object.freeze(edges),
    boxes: Object.freeze(boxes),
    turn,
    lastEdge: null,
    captured: [],
    moveCount: drawn.length,
    over: drawn.length === TRAY_LINES_EDGE_COUNT,
  });
}

function sessionAt(state: TrayLinesState): TrayLinesSession {
  return { state, history: [], humanTurnInProgress: false, lastActions: [] };
}

/** Small independent minimax oracle evaluates final scores using actual game states. */
function bestFinalScore(state: TrayLinesState, player: TrayLinesPlayer): number {
  if (state.over) {
    const scores = countTrayBoxes(state);
    return player === 1 ? scores.burger - scores.cake : scores.cake - scores.burger;
  }
  const scores = legalTrayLinesMoves(state).map((edge) =>
    bestFinalScore(playTrayLine(state, edge), player),
  );
  return state.turn === player ? Math.max(...scores) : Math.min(...scores);
}

describe("Tray Lines board and scoring", () => {
  test("has exactly 24 distinct edges around nine boxes without wrapping borders", () => {
    const state = createTrayLinesGame();
    expect(state.edges).toHaveLength(24);
    expect(state.boxes).toHaveLength(9);
    expect(state.turn).toBe(1);
    expect(state.moveCount).toBe(0);
    expect(state.over).toBe(false);
    expect(countTrayBoxes(state)).toEqual({ burger: 0, cake: 0, empty: 9 });
    expect(legalTrayLinesMoves(state)).toHaveLength(24);
    expect(new Set(TRAY_LINE_EDGES.map((edge) => edge.id)).size).toBe(24);
    expect(TRAY_LINE_EDGES.filter((edge) => edge.boxes.length === 1)).toHaveLength(12);
    expect(TRAY_LINE_EDGES.filter((edge) => edge.boxes.length === 2)).toHaveLength(12);
    expect(trayBoxEdges(0)).toEqual([0, 3, 12, 13]);
    expect(trayBoxEdges(8)).toEqual([8, 11, 22, 23]);
    expect(TRAY_LINE_EDGES[2]?.boxes).toEqual([2]);
    expect(TRAY_LINE_EDGES[12]?.boxes).toEqual([0]);
    expect(TRAY_LINE_EDGES[15]?.boxes).toEqual([2]);
    expect(TRAY_LINE_EDGES[23]?.boxes).toEqual([8]);
    for (const box of [-1, 9, 1.5, NaN]) expect(trayBoxEdges(box)).toEqual([]);
  });

  test("an ordinary line changes the turn without claiming an incomplete box", () => {
    const start = createTrayLinesGame();
    const first = playTrayLine(start, 0);
    expect(first.turn).toBe(2);
    expect(first.edges[0]).toBe(1);
    expect(first.captured).toEqual([]);
    expect(first.boxes).toEqual(start.boxes);
    expect(first.lastEdge).toBe(0);
    expect(first.moveCount).toBe(1);
    const second = playTrayLine(first, 12);
    expect(second.turn).toBe(1);
    expect(second.edges[12]).toBe(2);
    expect(second.captured).toEqual([]);
    expect(countTrayBoxes(second).empty).toBe(9);
    expect(start.edges.every((owner) => owner === 0)).toBe(true);
  });

  test("closing the fourth side claims a box and gives the scorer another move", () => {
    for (const player of [1, 2] as const) {
      const start = position([0, 3, 12], player);
      const next = playTrayLine(start, 13);
      expect(next.captured).toEqual([0]);
      expect(next.boxes[0]).toBe(player);
      expect(next.turn).toBe(player);
      expect(next.edges[13]).toBe(player);
      expect(next.over).toBe(false);
      expect(next.boxes.slice(1).every((owner) => owner === 0)).toBe(true);
      expect(start.boxes[0]).toBe(0);
      expect(playTrayLine(next, 1).turn).toBe(player === 1 ? 2 : 1);
    }
  });

  test("a shared vertical edge can claim two boxes at once", () => {
    const start = position([0, 1, 3, 4, 12, 14]);
    const next = playTrayLine(start, 13);
    expect(next.captured).toEqual([0, 1]);
    expect(countTrayBoxes(next)).toEqual({ burger: 2, cake: 0, empty: 7 });
    expect(next.turn).toBe(1);
    expect(next.moveCount).toBe(7);
    expect(start.boxes.every((owner) => owner === 0)).toBe(true);
  });

  test("a shared horizontal edge claims both boxes above and below it", () => {
    const start = position([0, 6, 12, 13, 16, 17], 2);
    const next = playTrayLine(start, 3);
    expect(next.captured).toEqual([0, 3]);
    expect(countTrayBoxes(next)).toEqual({ burger: 0, cake: 2, empty: 7 });
    expect(next.turn).toBe(2);
  });

  test("invalid and already drawn edges are immutable no-ops", () => {
    const start = position([0, 3, 12]);
    const original = JSON.stringify(start);
    for (const edge of [-1, 24, 2.5, NaN, Infinity, 0, 3, 12]) {
      expect(playTrayLine(start, edge)).toBe(start);
      const session = sessionAt(start);
      expect(playTrayLinesSessionMove(session, edge, "solo")).toBe(session);
    }
    playTrayLine(start, 13);
    expect(JSON.stringify(start)).toBe(original);
    const malformed = { ...start, edges: [] };
    expect(playTrayLine(malformed, 13)).toBe(malformed);
    expect(legalTrayLinesMoves(malformed)).toEqual([]);
  });

  test("the last line completes the tray and prevents further moves", () => {
    const start = position(
      Array.from({ length: 23 }, (_, edge) => edge),
      1,
    );
    const next = playTrayLine(start, 23);
    expect(next.over).toBe(true);
    expect(next.captured).toEqual([8]);
    expect(next.moveCount).toBe(24);
    expect(countTrayBoxes(next)).toEqual({ burger: 1, cake: 8, empty: 0 });
    expect(trayLinesWinner(next)).toBe(2);
    expect(legalTrayLinesMoves(next)).toEqual([]);
    expect(playTrayLine(next, 0)).toBe(next);
    expect(chooseTrayLine(next, "casual")).toBeNull();
    expect(chooseTrayLine(next, "clever")).toBeNull();
    // Equal counts have no leader; a finished nine-box tray necessarily has a winner.
    expect(trayLinesWinner(createTrayLinesGame())).toBeNull();
  });
});

describe("Tray Lines chef", () => {
  test("both chefs take available boxes and Clever avoids handing over a third side", () => {
    const double = position([0, 1, 3, 4, 12, 14], 2);
    expect(chooseTrayLine(double, "casual")).toBe(13);
    expect(chooseTrayLine(double, "clever")).toBe(13);
    const risk = position([3, 12], 2);
    expect(chooseTrayLine(risk, "casual")).toBe(0);
    const careful = chooseTrayLine(risk, "clever");
    expect(careful).not.toBe(0);
    expect(careful).not.toBe(13);
    expect(legalTrayLinesMoves(risk)).toContain(careful);
  });

  test("Clever matches an independent full-score minimax in a six-edge endgame", () => {
    let state = createTrayLinesGame();
    for (let edge = 0; edge < 18; edge++) state = playTrayLine(state, edge);
    const expected = bestFinalScore(state, state.turn);
    const chosen = chooseTrayLine(state, "clever");
    expect(chosen).not.toBeNull();
    expect(bestFinalScore(playTrayLine(state, chosen!), state.turn)).toBe(expected);
  });

  test("both difficulties play deterministic legal games to completion", () => {
    for (const difficulty of ["casual", "clever"] as const) {
      let state = createTrayLinesGame();
      const used = new Set<number>();
      for (let move = 0; move < 24; move++) {
        const original = JSON.stringify(state);
        const edge = chooseTrayLine(state, difficulty);
        expect(edge).not.toBeNull();
        expect(legalTrayLinesMoves(state)).toContain(edge);
        expect(chooseTrayLine(state, difficulty)).toBe(edge);
        expect(used.has(edge!)).toBe(false);
        expect(JSON.stringify(state)).toBe(original);
        used.add(edge!);
        const next = playTrayLine(state, edge!);
        expect(next.moveCount).toBe(move + 1);
        expect(next.edges.filter(Boolean)).toHaveLength(move + 1);
        expect(next.turn).toBe(next.captured.length > 0 ? state.turn : state.turn === 1 ? 2 : 1);
        expect(countTrayBoxes(next).empty).toBe(countTrayBoxes(state).empty - next.captured.length);
        state = next;
      }
      expect(state.over).toBe(true);
      expect(countTrayBoxes(state).empty).toBe(0);
      expect(countTrayBoxes(state).burger + countTrayBoxes(state).cake).toBe(9);
      expect(trayLinesWinner(state)).not.toBeNull();
      expect(chooseTrayLine(state, difficulty)).toBeNull();
    }
  });
});

describe("Tray Lines sessions and full-turn Undo", () => {
  test("solo Undo restores the human turn's exact snapshot after the chef replies", () => {
    const start = createTrayLinesSession();
    expect(undoTrayLinesSession(start)).toBe(start);
    const next = playTrayLinesSessionMove(start, 0, "solo", "casual");
    expect(next.lastActions.map((action) => action.player)).toEqual([1, 2]);
    expect(next.state.turn).toBe(1);
    expect(next.state.moveCount).toBe(2);
    expect(next.history).toEqual([start.state]);
    const undone = undoTrayLinesSession(next);
    expect(undone.state).toBe(start.state);
    expect(undone.history).toEqual([]);
    expect(undone.humanTurnInProgress).toBe(false);
    expect(undone.lastActions).toEqual([]);
  });

  test("all consecutive human scoring moves belong to one Undo, including the later chef reply", () => {
    const start = sessionAt(position([0, 12, 13, 8, 22, 23]));
    const firstBox = playTrayLinesSessionMove(start, 3, "solo", "casual");
    expect(firstBox.state.captured).toEqual([0]);
    expect(firstBox.humanTurnInProgress).toBe(true);
    expect(firstBox.history).toHaveLength(1);
    const secondBox = playTrayLinesSessionMove(firstBox, 11, "solo", "casual");
    expect(secondBox.state.captured).toEqual([8]);
    expect(secondBox.humanTurnInProgress).toBe(true);
    expect(secondBox.history).toHaveLength(1);
    expect(undoTrayLinesSession(secondBox).state).toBe(start.state);
    const finishedTurn = playTrayLinesSessionMove(secondBox, 1, "solo", "casual");
    expect(finishedTurn.lastActions.some((action) => action.player === 2)).toBe(true);
    expect(finishedTurn.humanTurnInProgress).toBe(false);
    expect(finishedTurn.history).toHaveLength(1);
    expect(undoTrayLinesSession(finishedTurn).state).toBe(start.state);
    expect(start.state.edges[3]).toBe(0);
    expect(start.state.edges[11]).toBe(0);
    const nextTurn = playTrayLinesSessionMove(
      finishedTurn,
      legalTrayLinesMoves(finishedTurn.state)[0]!,
      "solo",
      "casual",
    );
    expect(nextTurn.history).toHaveLength(2);
    expect(undoTrayLinesSession(nextTurn).state).toBe(finishedTurn.state);
  });

  test("a chef captures two boxes, takes another move and returns control before Undo", () => {
    const start = sessionAt(position([0, 1, 3, 4, 14]));
    const next = playTrayLinesSessionMove(start, 12, "solo", "casual");
    expect(next.lastActions.map((action) => action.edge)).toEqual([12, 13, 2]);
    expect(next.lastActions[1]?.captured).toEqual([0, 1]);
    expect(next.lastActions[2]?.player).toBe(2);
    expect(next.state.turn).toBe(1);
    expect(countTrayBoxes(next.state).cake).toBe(2);
    expect(next.state.moveCount).toBe(start.state.moveCount + 3);
    expect(next.history).toHaveLength(1);
    expect(undoTrayLinesSession(next).state).toBe(start.state);
  });

  test("local Undo reverses one line even after a scoring extra turn", () => {
    const start = sessionAt(position([0, 3, 12]));
    const closed = playTrayLinesSessionMove(start, 13, "local");
    expect(closed.state.turn).toBe(1);
    expect(closed.lastActions).toHaveLength(1);
    const following = playTrayLinesSessionMove(closed, 1, "local");
    expect(following.history).toHaveLength(2);
    expect(undoTrayLinesSession(following).state).toBe(closed.state);
    expect(undoTrayLinesSession(closed).state).toBe(start.state);
  });

  test("varied solo choices always finish and never leave the human waiting on the chef", () => {
    for (const difficulty of ["casual", "clever"] as const) {
      let session = createTrayLinesSession();
      for (let turn = 0; turn < 24 && !session.state.over; turn++) {
        expect(session.state.turn).toBe(1);
        const legal = legalTrayLinesMoves(session.state);
        const edge = legal[(turn * 5) % legal.length]!;
        const previous = session;
        session = playTrayLinesSessionMove(session, edge, "solo", difficulty);
        expect(session).not.toBe(previous);
        expect(session.state.moveCount).toBe(previous.state.moveCount + session.lastActions.length);
        expect(session.state.over || session.state.turn === 1).toBe(true);
      }
      expect(session.state.over).toBe(true);
      expect(session.state.moveCount).toBe(24);
      expect(countTrayBoxes(session.state).empty).toBe(0);
      expect(playTrayLinesSessionMove(session, 0, "solo", difficulty)).toBe(session);
      expect(undoTrayLinesSession(session).state.over).toBe(false);
    }
  });
});
