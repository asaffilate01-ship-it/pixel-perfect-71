import { describe, expect, test } from "bun:test";
import {
  groupChoiceSecondsRemaining,
  formatGroupChoiceCountdown,
} from "../src/lib/mealdeck-group-choice-clock";

describe("saved group food choices use only the server-aligned clock for display", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");

  test("a server deadline counts down without changing stored food", () => {
    expect(groupChoiceSecondsRemaining("2026-11-18T12:04:05Z", now)).toBe(245);
    expect(formatGroupChoiceCountdown(245)).toBe("4:05");
    expect(groupChoiceSecondsRemaining("2026-11-18T12:00:00.250Z", now)).toBe(1);
    expect(formatGroupChoiceCountdown(1)).toBe("0:01");
  });

  test("expired deadlines stay at zero and never become negative", () => {
    expect(groupChoiceSecondsRemaining("2026-11-18T11:59:00Z", now)).toBe(0);
    expect(formatGroupChoiceCountdown(0)).toBe("0:00");
  });

  test("missing, invalid, or uninitialised server time cannot invent a deadline", () => {
    for (const expiry of [null, undefined, "", "not a date"]) {
      expect(groupChoiceSecondsRemaining(expiry, now)).toBeNull();
    }
    for (const clock of [0, -1, NaN, Infinity]) {
      expect(groupChoiceSecondsRemaining("2026-11-18T12:04:05Z", clock)).toBeNull();
    }
    for (const seconds of [null, -1, NaN, Infinity, 0.5]) {
      expect(formatGroupChoiceCountdown(seconds)).toBeNull();
    }
  });
});
