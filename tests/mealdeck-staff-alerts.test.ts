import { describe, expect, test } from "bun:test";
import {
  createStaffAlertLedger,
  staffAlertTones,
  staffAlertAudio,
  staffAlertDurationMs,
  playStaffAlert,
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
    expect(staffAlertTones.printer).toHaveLength(6);
    expect(staffAlertTones.printer[0].frequency).toBeGreaterThan(staffAlertTones.kds[1].frequency);
  });
  test("both alerts are sustained, repeat clearly and keep non-overlapping peaks below one", () => {
    for (const kind of ["kds", "printer"] as const) {
      expect(staffAlertAudio[kind].defaultVolume).toBe(0.9);
      expect(staffAlertAudio[kind].peakGain).toBeGreaterThan(0.5);
      expect(staffAlertAudio[kind].peakGain).toBeLessThan(1);
      expect(staffAlertAudio[kind].sustainSeconds).toBeGreaterThanOrEqual(0.1);
      const notes = staffAlertTones[kind];
      for (const note of notes)
        expect(note.duration).toBeGreaterThan(staffAlertAudio[kind].sustainSeconds);
      for (let i = 1; i < notes.length; i++)
        expect(notes[i]!.at).toBeGreaterThan(notes[i - 1]!.at + notes[i - 1]!.duration);
      expect(staffAlertDurationMs(kind)).toBeGreaterThan(1500);
      expect(staffAlertDurationMs(kind)).toBeGreaterThan(
        Math.max(...notes.map((note) => note.at + note.duration)) * 1000,
      );
    }
  });

  test("zero, invalid volume and a gesture-suspended context schedule no audio", () => {
    for (const volume of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const audio = fakeAudio();
      expect(playStaffAlert(audio.context, "printer", volume, 0)).toBeNull();
      expect(audio.starts).toEqual([]);
    }
    const suspended = fakeAudio("suspended");
    expect(playStaffAlert(suspended.context, "kds", 1, 0)).toBeNull();
    expect(suspended.starts).toEqual([]);
  });

  test("a test click and arrival cannot stack the active waveform; later arrivals can play", () => {
    for (const kind of ["kds", "printer"] as const) {
      const audio = fakeAudio();
      const sound = playStaffAlert(audio.context, kind, 5, 0)!;
      const end = sound.endsAt;
      expect(end).toBeGreaterThan(audio.context.currentTime);
      expect(audio.starts).toHaveLength(staffAlertTones[kind].length);
      expect(Math.max(...audio.gains)).toBe(staffAlertAudio[kind].peakGain);
      expect(playStaffAlert(audio.context, kind, 1, end)).toBeNull();
      expect(audio.starts).toHaveLength(staffAlertTones[kind].length);
      audio.advanceTo(end);
      expect(playStaffAlert(audio.context, kind, 0.5, end)!.endsAt).toBeGreaterThan(end);
      expect(audio.starts).toHaveLength(staffAlertTones[kind].length * 2);
    }
  });

  test("muting a cue immediately disconnects every current and future tone without replay", () => {
    for (const kind of ["kds", "printer"] as const) {
      const audio = fakeAudio();
      const sound = playStaffAlert(audio.context, kind, 1, 0)!;
      expect(audio.disconnections()).toBe(0);
      sound.stop();
      expect(audio.disconnections()).toBe(staffAlertTones[kind].length);
      expect(audio.stops.filter((at) => at === undefined)).toHaveLength(
        staffAlertTones[kind].length,
      );
      sound.stop();
      expect(audio.disconnections()).toBe(staffAlertTones[kind].length);
      expect(audio.starts).toHaveLength(staffAlertTones[kind].length);
    }
  });
});

function fakeAudio(state: AudioContextState = "running") {
  const starts: number[] = [];
  const gains: number[] = [];
  const stops: (number | undefined)[] = [];
  let disconnected = 0;
  const context = {
    state,
    currentTime: 4,
    destination: {},
    createOscillator: () => ({
      type: "sine",
      frequency: { value: 0 },
      connect: () => {},
      disconnect: () => {},
      start: (at: number) => starts.push(at),
      stop: (at?: number) => stops.push(at),
      onended: null,
    }),
    createGain: () => ({
      gain: {
        setValueAtTime: (value: number) => gains.push(value),
        linearRampToValueAtTime: (value: number) => gains.push(value),
        exponentialRampToValueAtTime: (value: number) => gains.push(value),
      },
      connect: () => {},
      disconnect: () => {
        disconnected++;
      },
    }),
  };
  return {
    context: context as unknown as AudioContext,
    starts,
    gains,
    stops,
    disconnections: () => disconnected,
    advanceTo: (time: number) => {
      context.currentTime = time;
    },
  };
}
