import { describe, expect, test } from "bun:test";
import {
  createStaffAudioController,
  readStaffSoundPreferences,
  type StaffSoundState,
} from "../src/lib/mealdeck-staff-audio";

describe("default-on staff sound", () => {
  test("new devices default to on at full volume; saved mute and volume are preserved", () => {
    for (const kind of ["kds", "printer"] as const) {
      for (const saved of [null, "", "bad json", "[]", "null", '{"volume":2}'])
        expect(readStaffSoundPreferences(kind, saved)).toEqual({ enabled: true, volume: 1 });
      expect(readStaffSoundPreferences(kind, '{"enabled":false,"volume":0.35}')).toEqual({
        enabled: false,
        volume: 0.35,
      });
      expect(readStaffSoundPreferences(kind, '{"enabled":true,"volume":0}')).toEqual({
        enabled: true,
        volume: 0,
      });
    }
  });

  test("a blocked browser stays honestly waiting and only a trusted gesture requests resume", async () => {
    const f = fixture();
    f.controller.start();
    expect(f.controller.state()).toMatchObject({ enabled: false, waitingForGesture: true });
    expect(f.audio.resumeCount()).toBe(0);
    expect(await f.controller.unlockFromGesture(false)).toBe(false);
    expect(f.audio.resumeCount()).toBe(0);
    expect(await f.controller.unlockFromGesture(true)).toBe(true);
    expect(f.controller.state()).toMatchObject({ enabled: true, waitingForGesture: false });
    expect(f.audio.starts()).toBe(0); // Unlocking is not a new order or queue replay.
    expect(f.controller.play()).toBe(true);
    expect(f.audio.starts()).toBe(4);
    f.controller.dispose();
  });

  test("an already allowed context becomes ready without an unsolicited test sound", () => {
    const f = fixture({ initial: "running", kind: "printer" });
    f.controller.start();
    expect(f.controller.state().enabled).toBe(true);
    expect(f.audio.resumeCount()).toBe(0);
    expect(f.audio.starts()).toBe(0);
    expect(f.controller.play()).toBe(true);
    expect(f.audio.starts()).toBe(6);
    f.controller.dispose();
  });

  test("a saved mute cannot be undone by ordinary page interactions", async () => {
    const f = fixture({ preferences: { enabled: false, volume: 0.25 } });
    f.controller.start();
    expect(f.creates()).toBe(0);
    expect(f.controller.state()).toMatchObject({ enabled: false, waitingForGesture: false });
    expect(await f.controller.unlockFromGesture(true)).toBe(false);
    expect(f.creates()).toBe(0);
    f.controller.setEnabled(true);
    expect(await f.controller.unlockFromGesture(true)).toBe(true);
    expect(f.controller.preferences()).toEqual({ enabled: true, volume: 0.25 });
    f.controller.dispose();
  });

  test("muting while resume is pending prevents a late enabled state or sound", async () => {
    const f = fixture({ resumeMode: "pending" });
    f.controller.start();
    const unlocking = f.controller.unlockFromGesture(true);
    f.controller.setEnabled(false);
    f.audio.completeResume();
    expect(await unlocking).toBe(false);
    expect(f.controller.state()).toMatchObject({ enabled: false, waitingForGesture: false });
    expect(f.controller.play()).toBe(false);
    expect(f.audio.starts()).toBe(0);
    f.controller.dispose();
  });

  test("browser suspension stops the active cue and unlocking does not replay it", async () => {
    const f = fixture({ initial: "running" });
    f.controller.start();
    f.controller.play();
    f.audio.setState("suspended");
    expect(f.audio.disconnections()).toBe(4);
    expect(f.controller.state()).toMatchObject({ enabled: false, waitingForGesture: true });
    expect(await f.controller.unlockFromGesture(true)).toBe(true);
    expect(f.audio.starts()).toBe(4);
    f.controller.setVolume(0);
    expect(f.controller.play()).toBe(false);
    expect(f.controller.preferences().volume).toBe(0);
    f.controller.dispose();
  });

  test("failed resume never reports ready and a disposed controller cannot revive", async () => {
    const rejected = fixture({ resumeMode: "reject" });
    rejected.controller.start();
    expect(await rejected.controller.unlockFromGesture(true)).toBe(false);
    expect(rejected.controller.state()).toMatchObject({ enabled: false, waitingForGesture: true });
    rejected.controller.dispose();
    const pending = fixture({ resumeMode: "pending" });
    pending.controller.start();
    const unlocking = pending.controller.unlockFromGesture(true);
    pending.controller.dispose();
    const updates = pending.changes.length;
    pending.audio.completeResume();
    expect(await unlocking).toBe(false);
    expect(pending.changes).toHaveLength(updates);
    expect(pending.controller.play()).toBe(false);
    expect(pending.audio.starts()).toBe(0);
  });

  test("missing Web Audio shows an unavailable state without claiming sound is on", () => {
    const changes: StaffSoundState[] = [];
    const controller = createStaffAudioController({
      kind: "printer",
      preferences: { enabled: true, volume: 1 },
      createContext: () => {
        throw new Error("unsupported");
      },
      onChange: (state) => changes.push(state),
    });
    controller.start();
    expect(changes.at(-1)).toMatchObject({ enabled: false, unavailable: true });
    expect(controller.play()).toBe(false);
    controller.dispose();
  });
});

function fixture(
  options: {
    initial?: AudioContextState;
    kind?: "kds" | "printer";
    resumeMode?: "running" | "reject" | "pending";
    preferences?: { enabled: boolean; volume: number };
  } = {},
) {
  const audio = fakeAudio(options.initial, options.resumeMode);
  const changes: StaffSoundState[] = [];
  let created = 0;
  const controller = createStaffAudioController({
    kind: options.kind ?? "kds",
    preferences: options.preferences ?? { enabled: true, volume: 1 },
    createContext: () => {
      created++;
      return audio.context;
    },
    onChange: (state) => changes.push(state),
  });
  return { controller, audio, changes, creates: () => created };
}

function fakeAudio(initial: AudioContextState = "suspended", resumeMode = "running") {
  let state = initial;
  let resumeCount = 0;
  let starts = 0;
  let disconnections = 0;
  let finish: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const setState = (next: AudioContextState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const context = {
    get state() {
      return state;
    },
    currentTime: 0,
    destination: {},
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    resume: () => {
      resumeCount++;
      if (resumeMode === "reject") return Promise.reject(new Error("blocked"));
      if (resumeMode === "pending")
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      setState("running");
      return Promise.resolve();
    },
    close: () => {
      setState("closed");
      return Promise.resolve();
    },
    createOscillator: () => ({
      type: "sine",
      frequency: { value: 0 },
      connect: () => {},
      disconnect: () => {},
      start: () => {
        starts++;
      },
      stop: () => {},
      onended: null,
    }),
    createGain: () => ({
      gain: {
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
      disconnect: () => {
        disconnections++;
      },
    }),
  };
  return {
    context: context as unknown as AudioContext,
    setState,
    completeResume: () => {
      setState("running");
      finish?.();
    },
    resumeCount: () => resumeCount,
    starts: () => starts,
    disconnections: () => disconnections,
  };
}
