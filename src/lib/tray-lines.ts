/** Local Dots and Boxes rules. Rows and columns in this module are zero-based. */
export const TRAY_LINES_SIZE = 3;
export const TRAY_LINES_DOTS = TRAY_LINES_SIZE + 1;
export const TRAY_LINES_EDGE_COUNT = 24;
export const TRAY_LINES_BOX_COUNT = 9;
export type TrayLinesPlayer = 1 | 2;
export type TrayLinesOwner = 0 | TrayLinesPlayer;
export type TrayLinesMode = "solo" | "local";
export type TrayLinesDifficulty = "casual" | "clever";

export interface TrayLineEdge {
  readonly id: number;
  readonly orientation: "horizontal" | "vertical";
  readonly row: number;
  readonly column: number;
  readonly boxes: readonly number[];
}

export interface TrayLinesState {
  readonly edges: readonly TrayLinesOwner[];
  readonly boxes: readonly TrayLinesOwner[];
  readonly turn: TrayLinesPlayer;
  readonly lastEdge: number | null;
  readonly captured: readonly number[];
  readonly moveCount: number;
  readonly over: boolean;
}

export interface TrayLinesAction {
  readonly edge: number;
  readonly player: TrayLinesPlayer;
  readonly captured: readonly number[];
}

export interface TrayLinesSession {
  readonly state: TrayLinesState;
  readonly history: readonly TrayLinesState[];
  readonly humanTurnInProgress: boolean;
  readonly lastActions: readonly TrayLinesAction[];
}

/** Horizontal edges first (4 rows × 3), then vertical edges (3 rows × 4). */
export const TRAY_LINE_EDGES: readonly TrayLineEdge[] = Array.from(
  { length: TRAY_LINES_EDGE_COUNT },
  (_, id): TrayLineEdge => {
    if (id < 12) {
      const row = Math.floor(id / TRAY_LINES_SIZE);
      const column = id % TRAY_LINES_SIZE;
      return {
        id,
        orientation: "horizontal",
        row,
        column,
        boxes: [
          ...(row > 0 ? [(row - 1) * TRAY_LINES_SIZE + column] : []),
          ...(row < TRAY_LINES_SIZE ? [row * TRAY_LINES_SIZE + column] : []),
        ],
      };
    }
    const row = Math.floor((id - 12) / TRAY_LINES_DOTS);
    const column = (id - 12) % TRAY_LINES_DOTS;
    return {
      id,
      orientation: "vertical",
      row,
      column,
      boxes: [
        ...(column > 0 ? [row * TRAY_LINES_SIZE + column - 1] : []),
        ...(column < TRAY_LINES_SIZE ? [row * TRAY_LINES_SIZE + column] : []),
      ],
    };
  },
);

const BOX_EDGES: readonly (readonly number[])[] = Array.from(
  { length: TRAY_LINES_BOX_COUNT },
  (_, box) => {
    const row = Math.floor(box / TRAY_LINES_SIZE);
    const column = box % TRAY_LINES_SIZE;
    return [
      row * TRAY_LINES_SIZE + column,
      (row + 1) * TRAY_LINES_SIZE + column,
      12 + row * TRAY_LINES_DOTS + column,
      12 + row * TRAY_LINES_DOTS + column + 1,
    ];
  },
);

export function trayBoxEdges(box: number): readonly number[] {
  return Number.isInteger(box) ? (BOX_EDGES[box] ?? []) : [];
}

export function createTrayLinesGame(): TrayLinesState {
  return {
    edges: Array<TrayLinesOwner>(TRAY_LINES_EDGE_COUNT).fill(0),
    boxes: Array<TrayLinesOwner>(TRAY_LINES_BOX_COUNT).fill(0),
    turn: 1,
    lastEdge: null,
    captured: [],
    moveCount: 0,
    over: false,
  };
}

export function createTrayLinesSession(): TrayLinesSession {
  return {
    state: createTrayLinesGame(),
    history: [],
    humanTurnInProgress: false,
    lastActions: [],
  };
}

export function legalTrayLinesMoves(state: TrayLinesState): number[] {
  if (state.over || state.edges.length !== TRAY_LINES_EDGE_COUNT) return [];
  return TRAY_LINE_EDGES.filter((edge) => state.edges[edge.id] === 0).map((edge) => edge.id);
}

export function countTrayBoxes(state: TrayLinesState): {
  burger: number;
  cake: number;
  empty: number;
} {
  return state.boxes.reduce(
    (scores, owner) => ({
      burger: scores.burger + (owner === 1 ? 1 : 0),
      cake: scores.cake + (owner === 2 ? 1 : 0),
      empty: scores.empty + (owner === 0 ? 1 : 0),
    }),
    { burger: 0, cake: 0, empty: 0 },
  );
}

/** Only announce a winner after the tray is complete. */
export function trayLinesWinner(state: TrayLinesState): TrayLinesPlayer | null {
  const { burger, cake } = countTrayBoxes(state);
  return burger === cake ? null : burger > cake ? 1 : 2;
}

/** Claim an empty edge, score every newly closed box and retain scoring players' turn. */
export function playTrayLine(state: TrayLinesState, edgeId: number): TrayLinesState {
  const edge = Number.isInteger(edgeId) ? TRAY_LINE_EDGES[edgeId] : undefined;
  if (
    !edge ||
    state.over ||
    state.edges.length !== TRAY_LINES_EDGE_COUNT ||
    state.boxes.length !== TRAY_LINES_BOX_COUNT ||
    state.edges[edgeId] !== 0
  )
    return state;
  const edges = [...state.edges];
  const boxes = [...state.boxes];
  edges[edgeId] = state.turn;
  const captured = edge.boxes.filter(
    (box) => boxes[box] === 0 && trayBoxEdges(box).every((side) => edges[side] !== 0),
  );
  for (const box of captured) boxes[box] = state.turn;
  return {
    edges,
    boxes,
    turn: captured.length > 0 ? state.turn : state.turn === 1 ? 2 : 1,
    lastEdge: edgeId,
    captured,
    moveCount: state.moveCount + 1,
    over: edges.every((owner) => owner !== 0),
  };
}

function edgeMask(state: TrayLinesState): number {
  return state.edges.reduce<number>(
    (mask, owner, index) => (owner === 0 ? mask : mask | (1 << index)),
    0,
  );
}

function capturesFromMask(mask: number, edge: TrayLineEdge): number {
  const next = mask | (1 << edge.id);
  return edge.boxes.filter((box) => trayBoxEdges(box).every((side) => (next & (1 << side)) !== 0))
    .length;
}

/** Future score advantage for the player to move, including all earned extra turns. */
function solveEndgame(mask: number, memo: Map<number, number>): number {
  if (mask === (1 << TRAY_LINES_EDGE_COUNT) - 1) return 0;
  const cached = memo.get(mask);
  if (cached !== undefined) return cached;
  let best = -TRAY_LINES_BOX_COUNT;
  for (const edge of TRAY_LINE_EDGES) {
    if ((mask & (1 << edge.id)) !== 0) continue;
    const captured = capturesFromMask(mask, edge);
    const future = solveEndgame(mask | (1 << edge.id), memo);
    best = Math.max(best, captured > 0 ? captured + future : -future);
  }
  memo.set(mask, best);
  return best;
}

/** Number of boxes an opponent can immediately collect from a newly opened chain. */
function offeredChain(mask: number): number {
  let capturedTotal = 0;
  for (let step = 0; step < TRAY_LINES_EDGE_COUNT; step++) {
    let chosen: TrayLineEdge | null = null;
    let most = 0;
    for (const edge of TRAY_LINE_EDGES) {
      if ((mask & (1 << edge.id)) !== 0) continue;
      const captured = capturesFromMask(mask, edge);
      if (captured > most) {
        most = captured;
        chosen = edge;
      }
    }
    if (!chosen) break;
    mask |= 1 << chosen.id;
    capturedTotal += most;
  }
  return capturedTotal;
}

/** Deterministic chef: Casual takes boxes; Clever avoids chains and solves the last nine edges. */
export function chooseTrayLine(
  state: TrayLinesState,
  difficulty: TrayLinesDifficulty = "clever",
): number | null {
  const legal = legalTrayLinesMoves(state);
  if (legal.length === 0) return null;
  const mask = edgeMask(state);
  const memo = new Map<number, number>();
  let chosen: number | null = null;
  let best = -Infinity;
  for (const edgeId of legal) {
    const edge = TRAY_LINE_EDGES[edgeId];
    if (!edge) continue;
    const captured = capturesFromMask(mask, edge);
    let score = captured * 100;
    if (difficulty === "clever" && legal.length <= 9) {
      const future = solveEndgame(mask | (1 << edgeId), memo);
      score = captured > 0 ? captured + future : -future;
    } else if (difficulty === "clever" && captured === 0) {
      // Safe edges offer no boxes. With none left, prefer the smallest forced giveaway.
      const next = mask | (1 << edgeId);
      score = -offeredChain(next) * 20;
      score -= edge.boxes.reduce(
        (total, box) =>
          total + trayBoxEdges(box).filter((side) => (mask & (1 << side)) !== 0).length,
        0,
      );
    }
    if (score > best) {
      best = score;
      chosen = edgeId;
    }
  }
  return chosen;
}

/** Resolve a click and all chef extra turns, retaining one snapshot per full human turn. */
export function playTrayLinesSessionMove(
  session: TrayLinesSession,
  edgeId: number,
  mode: TrayLinesMode,
  difficulty: TrayLinesDifficulty = "clever",
): TrayLinesSession {
  const before = session.state;
  if (mode === "solo" && before.turn !== 1) return session;
  let next = playTrayLine(before, edgeId);
  if (next === before) return session;
  const actions: TrayLinesAction[] = [
    { edge: edgeId, player: before.turn, captured: next.captured },
  ];
  while (mode === "solo" && !next.over && next.turn === 2) {
    const chefEdge = chooseTrayLine(next, difficulty);
    if (chefEdge === null) break;
    next = playTrayLine(next, chefEdge);
    actions.push({ edge: chefEdge, player: 2, captured: next.captured });
  }
  const continueTurn = mode === "solo" && session.humanTurnInProgress;
  return {
    state: next,
    history: continueTurn ? session.history : [...session.history, before],
    humanTurnInProgress: mode === "solo" && !next.over && next.turn === 1 && actions.length === 1,
    lastActions: actions,
  };
}

/** Solo undo includes every human scoring move and chef reply in the last full turn. */
export function undoTrayLinesSession(session: TrayLinesSession): TrayLinesSession {
  const previous = session.history.at(-1);
  if (!previous) return session;
  return {
    state: previous,
    history: session.history.slice(0, -1),
    humanTurnInProgress: false,
    lastActions: [],
  };
}
