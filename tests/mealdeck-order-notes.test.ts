import { describe, expect, test } from "bun:test";
import {
  MAX_ORDER_NOTES_LENGTH,
  ORDER_NOTES_ERROR_MESSAGE,
  normaliseOrderNotes,
  orderNotesMatch,
} from "../src/lib/mealdeck-order-notes";

describe("plain order-level special requests", () => {
  test("missing or blank requests retain legacy null semantics", () => {
    for (const value of [undefined, null, "", " \n\t\r\n ", "\u00a0"])
      expect(normaliseOrderNotes(value)).toBeNull();
  });

  test("normalises line endings and outside whitespace without dropping instructions", () => {
    expect(normaliseOrderNotes("  No onions\r\nSauce separately\rKeep\ttogether  ")).toBe(
      "No onions\nSauce separately\nKeep\ttogether",
    );
    expect(normaliseOrderNotes("No onions; sauce separately")).toBe("No onions; sauce separately");
    expect(normaliseOrderNotes("Keep <sauce> & chips separate")).toBe(
      "Keep <sauce> & chips separate",
    );
  });

  test("limits Unicode code points, rather than UTF-16 units", () => {
    expect(MAX_ORDER_NOTES_LENGTH).toBe(1000);
    expect(normaliseOrderNotes("😀".repeat(1000))).toBe("😀".repeat(1000));
    expect(normaliseOrderNotes("é".repeat(1000))).toBe("é".repeat(1000));
    expect(() => normaliseOrderNotes("😀".repeat(1001))).toThrow(ORDER_NOTES_ERROR_MESSAGE);
    expect(() => normaliseOrderNotes("a".repeat(1001))).toThrow(ORDER_NOTES_ERROR_MESSAGE);
  });

  test("rejects unprintable controls and hidden format characters even outside visible text", () => {
    for (const character of [
      "\u0000",
      "\u0007",
      "\u000b",
      "\u000c",
      "\u001b",
      "\u001f",
      "\u007f",
      "\u0085",
      "\u009f",
      "\u00ad",
      "\u061c",
      "\u200b",
      "\u200d",
      "\u200f",
      "\u202e",
      "\u2066",
      "\u2069",
      "\ufeff",
    ]) {
      expect(() => normaliseOrderNotes(`${character}No onions`)).toThrow(ORDER_NOTES_ERROR_MESSAGE);
      expect(() => normaliseOrderNotes(`No onions${character}`)).toThrow(ORDER_NOTES_ERROR_MESSAGE);
    }
  });

  test("rejects malformed Unicode and non-string input with a fixed message", () => {
    for (const value of ["\ud800", "\udfff", "No \udc00 onions", 1, true, [], { notes: "x" }])
      expect(() => normaliseOrderNotes(value)).toThrow(ORDER_NOTES_ERROR_MESSAGE);
  });

  test("payment review requires the canonical note echo, with legacy empty compatibility", () => {
    expect(orderNotesMatch(" No onions\r\nSauce separately ", "No onions\nSauce separately")).toBe(
      true,
    );
    expect(orderNotesMatch("", undefined)).toBe(true);
    expect(orderNotesMatch(undefined, null)).toBe(true);
    expect(orderNotesMatch("No onions", undefined)).toBe(false);
    expect(orderNotesMatch("No onions", null)).toBe(false);
    expect(orderNotesMatch("No onions", "Extra onions")).toBe(false);
    expect(orderNotesMatch("No onions", { notes: "No onions" })).toBe(false);
    expect(orderNotesMatch("\u0000", "\u0000")).toBe(false);
  });
});
