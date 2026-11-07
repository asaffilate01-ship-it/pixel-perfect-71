import { describe, expect, test } from "bun:test";
import {
  ARCADE_SHARE_CARD_SIZE,
  arcadeShareCardDimensions,
  arcadeShareCardFilename,
  containArcadeShareArtwork,
  createArcadeShareCard,
  wrapArcadeShareText,
} from "../src/lib/mealdeck-arcade-share-card";
import type { ArcadeShareContent } from "../src/lib/mealdeck-arcade-sharing";

const measure = (text: string) => Array.from(text).length * 10;
const content: ArcadeShareContent = {
  game: "snack-trail",
  gameName: "Snack Trail",
  title: "Snack Trail on MealDeck Play",
  text: "I collected 12 snacks. Your turn.",
  url: "https://mealdeck.co.uk/play?game=snack-trail",
  headline: "12 snacks collected",
  detail: "80 moves · No hints",
  context: "Step mode",
  filename: "mealdeck-snack-trail.png",
  isResult: true,
};

describe("Arcade share-card bounded text", () => {
  test("wraps whole game-title words without clipping or unnecessary ellipses", () => {
    expect(wrapArcadeShareText("Four to Feast", 80, 2, measure)).toEqual({
      lines: ["Four to", "Feast"],
      truncated: false,
    });
    expect(wrapArcadeShareText("Kitchen Shuffle", 200, 2, measure)).toEqual({
      lines: ["Kitchen Shuffle"],
      truncated: false,
    });
    expect(wrapArcadeShareText("", 200, 2, measure)).toEqual({ lines: [], truncated: false });
  });

  test("splits unbroken long titles and visibly indicates omitted text", () => {
    const result = wrapArcadeShareText("ABCDEFGHIJKLMNOPQRST", 40, 3, measure);
    expect(result).toEqual({ lines: ["ABCD", "EFGH", "IJK…"], truncated: true });
    for (const line of result.lines) expect(measure(line)).toBeLessThanOrEqual(40);
    expect(result.lines).toHaveLength(3);
  });

  test("keeps metric and date context readable across the available lines", () => {
    const result = wrapArcadeShareText(
      "100,000 moves · 100,000 hints · Daily 2026-11-07",
      220,
      3,
      measure,
    );
    expect(result.truncated).toBe(false);
    const output = result.lines.join(" ");
    expect(output).toContain("100,000 hints");
    expect(output).toContain("Daily 2026-11-07");
    for (const line of result.lines) expect(measure(line)).toBeLessThanOrEqual(220);
  });

  test("normalises display controls and whitespace without interpreting markup", () => {
    expect(wrapArcadeShareText("  MealDeck\t\u202e\nPlay\u0000  ", 200, 2, measure).lines).toEqual([
      "MealDeck Play",
    ]);
    expect(wrapArcadeShareText("<b>Play</b>", 200, 2, measure).lines).toEqual(["<b>Play</b>"]);
    expect(wrapArcadeShareText("Cafe\u0301", 200, 2, measure).lines).toEqual(["Café"]);
  });

  test("does not split astral Unicode characters when wrapping or adding an ellipsis", () => {
    const result = wrapArcadeShareText("🍔🍟🍰🍗🍔🍟🍰", 30, 2, measure);
    expect(result.lines).toEqual(["🍔🍟🍰", "🍗🍔…"]);
    expect(result.truncated).toBe(true);
    for (const line of result.lines) {
      expect(measure(line)).toBeLessThanOrEqual(30);
      for (const character of Array.from(line)) {
        const code = character.codePointAt(0)!;
        expect(code >= 0xd800 && code <= 0xdfff).toBe(false);
      }
    }
  });

  test("bounds work even when handed an oversized string", () => {
    let measured = 0;
    const result = wrapArcadeShareText("A".repeat(100_000), 40, 2, (text) => {
      measured++;
      return measure(text);
    });
    expect(result.lines).toHaveLength(2);
    expect(result.truncated).toBe(true);
    expect(result.lines[1]?.endsWith("…")).toBe(true);
    expect(measured).toBeLessThan(1000);
    for (const line of result.lines) expect(measure(line)).toBeLessThanOrEqual(40);
  });

  test("never emits overflowing text for tiny, invalid or unmeasurable bounds", () => {
    for (const width of [0, -1, NaN, Infinity])
      expect(wrapArcadeShareText("Play", width, 2, measure).lines).toEqual([]);
    for (const lines of [0, -1, NaN, Infinity])
      expect(wrapArcadeShareText("Play", 100, lines, measure).lines).toEqual([]);
    expect(wrapArcadeShareText("W", 1, 1, measure)).toEqual({ lines: [], truncated: true });
    expect(wrapArcadeShareText("Play", 100, 2, () => NaN).lines).toEqual([]);
    expect(
      wrapArcadeShareText("A ".repeat(100), 10, 100, measure).lines.length,
    ).toBeLessThanOrEqual(8);
  });
});

describe("Arcade share-card artwork bounds", () => {
  test("square, Story and print exports have fixed bounded dimensions and distinct download names", () => {
    expect(arcadeShareCardDimensions()).toEqual({ width: 1200, height: 1200 });
    expect(arcadeShareCardDimensions("story")).toEqual({ width: 1080, height: 1920 });
    expect(arcadeShareCardDimensions("poster")).toEqual({ width: 1240, height: 1754 });
    expect(arcadeShareCardFilename(content)).toBe(content.filename);
    expect(arcadeShareCardFilename(content, "story")).toBe("mealdeck-snack-trail-story.png");
    expect(arcadeShareCardFilename(content, "poster")).toBe("mealdeck-snack-trail-poster.png");
    expect(() => arcadeShareCardDimensions("arbitrary" as "story")).toThrow(
      "supported picture format",
    );
  });

  test("uses a square post size and contains the full approved logo ratio", () => {
    expect(ARCADE_SHARE_CARD_SIZE).toBe(1200);
    const box = { x: 78, y: 64, width: 188, height: 190 };
    const fitted = containArcadeShareArtwork(1106, 1116, box)!;
    expect(fitted.width).toBeLessThanOrEqual(box.width);
    expect(fitted.height).toBeLessThanOrEqual(box.height);
    expect(fitted.width / fitted.height).toBeCloseTo(1106 / 1116, 10);
    expect(fitted.x + fitted.width / 2).toBeCloseTo(box.x + box.width / 2, 10);
    expect(fitted.y + fitted.height / 2).toBeCloseTo(box.y + box.height / 2, 10);
  });

  test("centres wide and tall art without cropping or stretching", () => {
    const box = { x: 0, y: 0, width: 200, height: 200 };
    expect(containArcadeShareArtwork(1000, 400, box)).toEqual({
      x: 0,
      y: 60,
      width: 200,
      height: 80,
    });
    expect(containArcadeShareArtwork(400, 1000, box)).toEqual({
      x: 60,
      y: 0,
      width: 80,
      height: 200,
    });
    for (const size of [0, -1, NaN, Infinity])
      expect(containArcadeShareArtwork(size, 100, box)).toBeNull();
    expect(containArcadeShareArtwork(100, 100, { ...box, x: NaN })).toBeNull();
    expect(containArcadeShareArtwork(100, 100, { ...box, height: 0 })).toBeNull();
  });

  test("fails cleanly outside a browser and honours already cancelled generation", async () => {
    await expect(createArcadeShareCard(content)).rejects.toThrow("only be created in a browser");
    const controller = new AbortController();
    controller.abort();
    await expect(
      createArcadeShareCard(content, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
