/** Deterministic promotional frames from the shipped game engines, never invented scores. */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { ARCADE_GAMES } from "../../src/lib/mealdeck-arcade-library";
import {
  createSnackTrail,
  queueSnackDirection,
  stepSnackTrail,
  type SnackDirection,
} from "../../src/lib/snack-trail";
import {
  createSkewerPuzzle,
  createSkewerState,
  playSkewerMove,
  isSkewerComplete,
} from "../../src/lib/skewer-sort";
import {
  createPantryState,
  pantryCellView,
  pantryNeighbours,
  revealPantryCell,
  togglePantryFlag,
} from "../../src/lib/pantry-sweep";

const snakeFrames = [];
let snake = createSnackTrail("running");
const nextFoods = [17, 12, 72, 77, 47, 11];
snakeFrames.push(snake);
for (const [direction, steps] of [
  ["right", 3],
  ["up", 3],
  ["left", 5],
  ["down", 6],
  ["right", 5],
  ["up", 3],
] as const) {
  for (let index = 0; index < steps; index += 1) {
    snake = queueSnackDirection(snake, direction as SnackDirection);
    const head = snake.snake[0]!;
    const offset =
      direction === "right" ? 1 : direction === "left" ? -1 : direction === "down" ? 10 : -10;
    const nextHead = head + offset;
    const grown = [nextHead, ...snake.snake];
    const free = Array.from({ length: 100 }, (_, cell) => cell).filter(
      (cell) => !grown.includes(cell),
    );
    const target = nextFoods[snake.score] ?? 11;
    const slot = free.indexOf(target);
    if (nextHead === snake.food && slot < 0)
      throw new Error("Preview food must be on a free cell.");
    snake = stepSnackTrail(snake, (Math.max(0, slot) + 0.5) / free.length);
    if (snake.phase !== "running")
      throw new Error("Snack preview must remain a legal ongoing game.");
    snakeFrames.push(snake);
  }
}

const puzzle = createSkewerPuzzle(3, 17);
let skewer = createSkewerState(puzzle);
const skewerFrames = [skewer];
for (const move of puzzle.solution) {
  const next = playSkewerMove(skewer, move.from, move.to);
  if (next === skewer) throw new Error("Skewer preview rejected a move.");
  skewer = next;
  skewerFrames.push(skewer);
}
if (!isSkewerComplete(skewer.skewers, 3))
  throw new Error("Skewer preview did not solve its board.");

// Deductions use the same visible cell projection as the UI. Hidden chillies are
// never used to choose a move, and no claim of a human player's result is made.
function pantryPreview(seed: number) {
  let state = revealPantryCell(createPantryState("gentle"), 12, seed);
  const frames = [createPantryState("gentle"), state];
  for (let turn = 0; turn < 50 && state.status === "playing"; turn += 1) {
    let changed = false;
    for (let cell = 0; cell < 25 && !changed; cell += 1) {
      const view = pantryCellView(state, cell);
      if (view?.kind !== "safe") continue;
      const neighbours = pantryNeighbours(cell, state.size);
      const covered = neighbours.filter(
        (index) => pantryCellView(state, index)?.kind === "covered",
      );
      const flags = neighbours.filter(
        (index) => pantryCellView(state, index)?.kind === "flagged",
      ).length;
      const nextCell = covered[0];
      if (nextCell === undefined) continue;
      const next =
        view.adjacent === flags
          ? revealPantryCell(state, nextCell)
          : view.adjacent - flags === covered.length
            ? togglePantryFlag(state, nextCell)
            : state;
      if (next !== state) {
        state = next;
        frames.push(state);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { frames, won: state.status === "won" };
}
const pantry = Array.from({ length: 100 }, (_, seed) => pantryPreview(seed)).find(
  (preview) => preview.won && preview.frames.length >= 7,
);
if (!pantry) throw new Error("No bounded, clue-only pantry preview was found.");

const games = ARCADE_GAMES.map(({ id, name, description, art, category }) => ({
  id,
  name,
  description,
  art,
  category,
}));
const clips = ["snack-trail", "skewer-sort", "pantry-sweep"].map((id) => {
  const matrix = QRCode.create(`https://mealdeck.co.uk/play/${id}`, {
    errorCorrectionLevel: "Q",
  }).modules;
  return { id, qrSize: matrix.size, qr: Array.from(matrix.data) };
});
const manifest = {
  schema: 1,
  games,
  clips,
  snack: snakeFrames,
  skewer: skewerFrames.map(({ skewers, moves }) => ({ skewers, moves })),
  pantry: pantry.frames.map((state) => ({
    size: state.size,
    status: state.status,
    opened: state.opened.filter(Boolean).length,
    cells: Array.from({ length: 25 }, (_, index) => pantryCellView(state, index)),
  })),
};
writeFileSync(
  fileURLToPath(new URL("./manifest.json", import.meta.url)),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Prepared ${games.length} social previews and 3 verified game sequences.`);
