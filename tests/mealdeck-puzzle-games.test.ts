import { describe, expect, test } from "bun:test";
import { dailySeed, seededRandom } from "../src/lib/arcade-games";
import {
  QUEST_SIZE,
  QUEST_WORDS,
  createQuestPuzzle,
  createSaucePuzzle,
  flipSauce,
  matchQuestSelection,
  puzzleFocusMove,
  questLine,
  sauceCleared,
  sauceNeighbours,
  solveSauce,
  type QuestPuzzle,
  type QuestWord,
} from "../src/lib/mealdeck-puzzle-games";

describe("Sauce Switch", () => {
  test("flips only the selected tile and its orthogonal neighbours, without row wrapping", () => {
    const original = Array<boolean>(9).fill(false);
    expect(sauceNeighbours(4, 3).sort()).toEqual([1, 3, 4, 5, 7]);
    expect(sauceNeighbours(0, 3).sort()).toEqual([0, 1, 3]);
    expect(sauceNeighbours(3, 3).sort()).toEqual([0, 3, 4, 6]);
    expect(flipSauce(original, 4, 3)).toEqual([
      false,
      true,
      false,
      true,
      true,
      true,
      false,
      true,
      false,
    ]);
    expect(original.every((value) => value === false)).toBe(true);
    for (const badIndex of [-1, 9, 0.5, NaN, Infinity])
      expect(flipSauce(original, badIndex, 3)).toEqual(original);
    expect(flipSauce([false], 0, 3)).toEqual([false]);
  });

  test("flips are reversible, commute, and do not mutate the given board", () => {
    for (const size of [3, 4] as const) {
      const board = Object.freeze(createSaucePuzzle(size, seededRandom(91)));
      for (let index = 0; index < size * size; index++) {
        expect(flipSauce(flipSauce(board, index, size), index, size)).toEqual(board);
        const second = (index + 3) % (size * size);
        expect(flipSauce(flipSauce(board, index, size), second, size)).toEqual(
          flipSauce(flipSauce(board, second, size), index, size),
        );
      }
    }
  });

  test("all generated fresh/daily boards have a working bounded solution", () => {
    for (const size of [3, 4] as const) {
      const seen = new Set<string>();
      for (let seed = 0; seed < 160; seed++) {
        const board = createSaucePuzzle(size, seededRandom(seed));
        expect(board).toHaveLength(size * size);
        expect(board.every((value) => typeof value === "boolean")).toBe(true);
        expect(sauceCleared(board, size)).toBe(false);
        const solution = solveSauce(board, size);
        expect(solution).not.toBeNull();
        expect(new Set(solution).size).toBe(solution!.length);
        expect(solution!.length).toBeLessThanOrEqual(size * size);
        const result = solution!.reduce((current, cell) => flipSauce(current, cell, size), board);
        expect(sauceCleared(result, size)).toBe(true);
        seen.add(board.map(Number).join(""));
      }
      expect(seen.size).toBeGreaterThan(20);
      for (const fixed of [0, 0.999999]) {
        const board = createSaucePuzzle(size, () => fixed);
        expect(sauceCleared(board, size)).toBe(false);
        expect(solveSauce(board, size)).not.toBeNull();
      }
    }
  });

  test("the hint solver returns a shortest solution, checked against exhaustive small-board states", () => {
    // Independent parity model: every pressed cell affects itself and Manhattan-distance-one cells.
    const minimum = new Map<string, number>();
    for (let presses = 0; presses < 512; presses++) {
      const board = Array.from({ length: 9 }, (_, target) => {
        let flips = 0;
        for (let source = 0; source < 9; source++) {
          const distance =
            Math.abs(Math.floor(source / 3) - Math.floor(target / 3)) +
            Math.abs((source % 3) - (target % 3));
          if (presses & (1 << source) && distance <= 1) flips++;
        }
        return flips % 2 === 1;
      });
      const key = board.map(Number).join("");
      const count = presses.toString(2).replaceAll("0", "").length;
      minimum.set(key, Math.min(minimum.get(key) ?? Infinity, count));
    }
    for (const [key, count] of minimum) {
      expect(
        solveSauce(
          [...key].map((cell) => cell === "1"),
          3,
        )?.length,
      ).toBe(count);
    }
    expect(solveSauce(Array<boolean>(16).fill(false), 4)).toEqual([]);
    expect(solveSauce([], 3)).toBeNull();
    expect(sauceCleared([], 3)).toBe(false);
    expect(sauceCleared(Array<boolean>(8).fill(false), 3)).toBe(false);
  });
});

describe("Menu Quest", () => {
  test("generation places all six unique words, fills the board, and supports complete play", () => {
    const seenDirections = new Set<string>();
    for (let seed = 0; seed < 120; seed++) {
      const puzzle = createQuestPuzzle(seededRandom(seed));
      expect(puzzle.size).toBe(QUEST_SIZE);
      expect(puzzle.letters).toHaveLength(64);
      expect(puzzle.letters.every((letter) => /^[A-Z]$/.test(letter))).toBe(true);
      expect(puzzle.words).toHaveLength(6);
      expect(new Set(puzzle.words.map(({ word }) => word)).size).toBe(6);
      const found: QuestWord[] = [];
      for (const { word, cells } of puzzle.words) {
        expect(QUEST_WORDS).toContain(word);
        expect(cells).toHaveLength(word.length);
        expect(new Set(cells).size).toBe(cells.length);
        expect(cells.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < 64)).toBe(true);
        expect(cells.map((cell) => puzzle.letters[cell]).join("")).toBe(word);
        expect(questLine(cells[0]!, cells.at(-1)!)).toEqual(cells);
        const rowStep = Math.sign(Math.floor(cells[1]! / 8) - Math.floor(cells[0]! / 8));
        const columnStep = Math.sign((cells[1]! % 8) - (cells[0]! % 8));
        seenDirections.add(`${rowStep},${columnStep}`);
        const result = matchQuestSelection(puzzle, cells[0]!, cells.at(-1)!, found);
        expect(result?.word).toBe(word);
        found.push(result!.word);
        expect(matchQuestSelection(puzzle, cells.at(-1)!, cells[0]!, found)).toBeNull();
      }
      expect(found).toHaveLength(6);
    }
    expect(seenDirections.size).toBe(8);
  });

  test("constant random streams still finish with every word in the puzzle", () => {
    for (const value of [0, 0.25, 0.5, 0.999999]) {
      const puzzle = createQuestPuzzle(() => value);
      expect(puzzle.words).toHaveLength(6);
      for (const target of puzzle.words) {
        expect(target.cells.map((cell) => puzzle.letters[cell]).join("")).toBe(target.word);
      }
    }
  });

  test("all eight directions and either endpoint order are accepted", () => {
    for (const [rowStep, columnStep] of [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, -1],
      [-1, 1],
    ]) {
      const start = 27;
      const cells = Array.from(
        { length: 4 },
        (_, step) => start + (rowStep! * 8 + columnStep!) * step,
      );
      const letters = Array<string>(64).fill("X");
      cells.forEach((cell, index) => {
        letters[cell] = "CAKE"[index]!;
      });
      const puzzle: QuestPuzzle = { size: 8, letters, words: [{ word: "CAKE", cells }] };
      expect(matchQuestSelection(puzzle, start, cells[3]!, [])).toEqual({ word: "CAKE", cells });
      expect(matchQuestSelection(puzzle, cells[3]!, start, [])?.word).toBe("CAKE");
      expect(matchQuestSelection(puzzle, start, cells[2]!, [])).toBeNull();
      expect(matchQuestSelection(puzzle, start, cells[3]!, ["CAKE"])).toBeNull();
    }
  });

  test("rejects bent lines, row wrapping, invalid cells and lowercase or partial matches", () => {
    expect(questLine(7, 8)).toBeNull();
    expect(questLine(0, 10)).toBeNull();
    for (const cell of [-1, 64, 2.5, NaN, Infinity]) {
      expect(questLine(cell, 0)).toBeNull();
      expect(questLine(0, cell)).toBeNull();
    }
    expect(questLine(0, 0)).toEqual([0]);
    const puzzle: QuestPuzzle = {
      size: 8,
      letters: [..."cake", ...Array<string>(60).fill("X")],
      words: [{ word: "CAKE", cells: [0, 1, 2, 3] }],
    };
    expect(matchQuestSelection(puzzle, 0, 3, [])).toBeNull();
    expect(matchQuestSelection(puzzle, 0, 0, [])).toBeNull();
  });

  test("shared letters remain available and a second visible occurrence counts only once", () => {
    const letters = Array<string>(64).fill("X");
    const cake = [0, 1, 2, 3],
      cheese = [0, 8, 16, 24, 32, 40],
      anotherCake = [52, 53, 54, 55];
    cake.forEach((cell, index) => {
      letters[cell] = "CAKE"[index]!;
    });
    cheese.forEach((cell, index) => {
      letters[cell] = "CHEESE"[index]!;
    });
    anotherCake.forEach((cell, index) => {
      letters[cell] = "CAKE"[index]!;
    });
    const puzzle: QuestPuzzle = {
      size: 8,
      letters,
      words: [
        { word: "CAKE", cells: cake },
        { word: "CHEESE", cells: cheese },
      ],
    };
    expect(matchQuestSelection(puzzle, 52, 55, [])?.word).toBe("CAKE");
    expect(matchQuestSelection(puzzle, 0, 3, ["CAKE"])).toBeNull();
    expect(matchQuestSelection(puzzle, 0, 40, ["CAKE"])?.word).toBe("CHEESE");
    expect(letters[0]).toBe("C");
  });
});

describe("Puzzle navigation and daily reproducibility", () => {
  test("keyboard focus stays inside board edges and Home/End stay in the current row", () => {
    expect(puzzleFocusMove(0, "ArrowLeft", 8)).toBe(0);
    expect(puzzleFocusMove(7, "ArrowRight", 8)).toBe(7);
    expect(puzzleFocusMove(2, "ArrowUp", 8)).toBe(2);
    expect(puzzleFocusMove(60, "ArrowDown", 8)).toBe(60);
    expect(puzzleFocusMove(27, "Home", 8)).toBe(24);
    expect(puzzleFocusMove(27, "End", 8)).toBe(31);
    expect(puzzleFocusMove(27, "ArrowUp", 8)).toBe(19);
    expect(puzzleFocusMove(27, "Enter", 8)).toBeNull();
    expect(puzzleFocusMove(-1, "ArrowRight", 8)).toBeNull();
    expect(puzzleFocusMove(0, "ArrowLeft", 0)).toBeNull();
  });

  test("the same UTC day produces identical boards across local time zones", () => {
    const utc = dailySeed(new Date("2026-11-07T01:30:00Z"));
    const elsewhere = dailySeed(new Date("2026-11-06T20:30:00-05:00"));
    expect(utc).toBe(elsewhere);
    expect(createQuestPuzzle(seededRandom(utc + 8101))).toEqual(
      createQuestPuzzle(seededRandom(elsewhere + 8101)),
    );
    for (const size of [3, 4] as const) {
      expect(createSaucePuzzle(size, seededRandom(utc + size * 101 + 7301))).toEqual(
        createSaucePuzzle(size, seededRandom(elsewhere + size * 101 + 7301)),
      );
    }
  });
});
