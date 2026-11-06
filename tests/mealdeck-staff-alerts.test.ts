import { describe, expect, test } from "bun:test";
import {
  createStaffAlertLedger,
  staffAlertTones,
  staffAlertAudio,
  staffAlertDurationMs,
} from "../src/lib/mealdeck-staff-alerts";
describe("staff audio alerts", () => {
  test("initial hydration seeds existing orders without replaying a sound", () => {
    const l = createStaffAlertLedger();
    expect(l.observe(["old"], true)).toEqual([]);
    expect(l.observe(["old", "new"], true)).toEqual(["new"]);
    expect(l.observe(["old", "new"], true)).toEqual([]);
  });
  test("stale or unpaid data cannot seed or produce an alert", () => {
    const l = createStaffAlertLedger();
    expect(l.observe(["unverified"], false)).toEqual([]);
    expect(l.observe(["paid"], true)).toEqual([]);
    expect(l.observe(["paid", "new"], false)).toEqual([]);
    expect(l.observe(["paid", "new"], true)).toEqual(["new"]);
  });
  test("polls, reconnects, other windows and duplicate IDs do not replay", () => {
    const l = createStaffAlertLedger();
    l.observe([], true);
    l.remember(["heard-in-other-window"]);
    expect(l.observe(["heard-in-other-window", "new", "new"], true)).toEqual(["new"]);
    expect(l.observe([], true)).toEqual([]);
    expect(l.observe(["new"], true)).toEqual([]);
  });
  test("scope ledgers are independent and tones distinguish kitchen from printer", () => {
    const a = createStaffAlertLedger(),
      b = createStaffAlertLedger();
    a.observe([], true);
    expect(a.observe(["id"], true)).toEqual(["id"]);
    expect(b.observe(["id"], true)).toEqual([]);
    expect(staffAlertTones.kds).toHaveLength(4);
    expect(staffAlertTones.printer).toHaveLength(3);
    expect(staffAlertTones.printer[0].frequency).toBeGreaterThan(staffAlertTones.kds[1].frequency);
  });
  test("kitchen alert is sustained and louder without clipping or changing the printer cue", () => {
    expect(staffAlertAudio.kds.defaultVolume).toBeGreaterThan(
      staffAlertAudio.printer.defaultVolume,
    );
    expect(staffAlertAudio.kds.peakGain).toBeGreaterThan(staffAlertAudio.printer.peakGain);
    expect(staffAlertAudio.kds.peakGain).toBeLessThanOrEqual(1);
    expect(staffAlertAudio.printer.peakGain).toBe(0.25);
    for (const kind of ["kds", "printer"] as const) {
      const notes = staffAlertTones[kind];
      for (let i = 1; i < notes.length; i++)
        expect(notes[i]!.at).toBeGreaterThan(notes[i - 1]!.at + notes[i - 1]!.duration);
      expect(staffAlertDurationMs(kind)).toBeGreaterThan(
        Math.max(...notes.map((note) => note.at + note.duration)) * 1000,
      );
    }
  });
});
