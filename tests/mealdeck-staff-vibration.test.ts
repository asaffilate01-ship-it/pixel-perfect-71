import { describe, expect, test } from "bun:test";
import {
  createStaffVibrationController,
  KDS_VIBRATION_PATTERN,
  readStaffVibrationPreferences,
  type StaffVibrationState,
} from "../src/lib/mealdeck-staff-vibration";

describe("optional foreground KDS vibration", () => {
  test("new and malformed preferences stay off; only an explicit saved boolean enables vibration", () => {
    for (const saved of [
      null,
      "",
      "bad json",
      "null",
      "[]",
      "true",
      "1",
      "{}",
      '{"enabled":false}',
      '{"enabled":"true"}',
      '{"enabled":1}',
    ]) {
      expect(readStaffVibrationPreferences(saved)).toEqual({ enabled: false });
    }
    expect(readStaffVibrationPreferences('{"enabled":true}')).toEqual({ enabled: true });
  });

  test("saved-on remains waiting for a trusted interaction without replaying a missed arrival", () => {
    const f = fixture();
    expect(f.controller.preferences()).toEqual({ enabled: true });
    expect(f.controller.state()).toMatchObject({ supported: true, waitingForGesture: true });
    expect(f.controller.play()).toBe(false);
    f.controller.activateFromGesture(false);
    expect(f.controller.state().waitingForGesture).toBe(true);
    expect(f.calls).toEqual([]);

    f.controller.activateFromGesture(true);
    expect(f.controller.state().waitingForGesture).toBe(false);
    expect(f.calls).toEqual([]);
    expect(f.controller.play()).toBe(true);
    expect(f.calls).toEqual([[800, 250, 800, 250, 800]]);
    f.controller.dispose();
  });

  test("a browser's sticky activation is sufficient and its explicit false is authoritative", () => {
    const allowed = fixture({ browserActive: true });
    expect(allowed.controller.state().waitingForGesture).toBe(false);
    expect(allowed.calls).toEqual([]);
    expect(allowed.controller.play()).toBe(true);
    allowed.controller.dispose();

    const blocked = fixture({ browserActive: false });
    blocked.controller.activateFromGesture(true);
    expect(blocked.controller.state().waitingForGesture).toBe(true);
    expect(blocked.controller.play()).toBe(false);
    expect(blocked.controller.test(true)).toBe(false);
    expect(blocked.calls).toEqual([]);
    blocked.setBrowserActive(true);
    expect(blocked.calls).toEqual([]);
    expect(blocked.controller.play()).toBe(true);
    blocked.controller.dispose();
  });

  test("ordinary interactions and the Test button never override a saved disabled preference", () => {
    const f = fixture({ enabled: false });
    f.controller.activateFromGesture(true);
    expect(f.controller.play()).toBe(false);
    expect(f.controller.test(true)).toBe(false);
    expect(f.controller.preferences()).toEqual({ enabled: false });
    expect(f.calls).toEqual([]);

    f.controller.setEnabled(true);
    expect(f.calls).toEqual([]);
    expect(f.controller.play()).toBe(true);
    f.controller.dispose();
  });

  test("a later trusted touch event refreshes waiting status when native activation becomes available", () => {
    const f = fixture({ browserActive: false });
    f.controller.activateFromGesture(true);
    expect(f.controller.state().waitingForGesture).toBe(true);
    expect(f.calls).toEqual([]);

    f.setBrowserActive(true);
    f.controller.activateFromGesture(true);
    expect(f.changes.at(-1)?.waitingForGesture).toBe(false);
    expect(f.calls).toEqual([]);
    expect(f.controller.prepareAlert()()).toBe(true);
    expect(f.calls).toEqual([[800, 250, 800, 250, 800]]);
    f.controller.dispose();
  });

  test("Test requires its own trusted event even after earlier browser activation", () => {
    const f = fixture({ browserActive: true });
    expect(f.controller.test(false)).toBe(false);
    expect(f.calls).toEqual([]);
    expect(f.controller.test(true)).toBe(true);
    expect(f.calls).toEqual([[800, 250, 800, 250, 800]]);
    f.controller.dispose();
  });

  test("unsupported devices retain the preference without attempting or claiming a vibration", () => {
    const f = fixture({ supported: false, browserActive: true });
    expect(f.controller.state()).toMatchObject({ supported: false, waitingForGesture: false });
    expect(f.controller.preferences()).toEqual({ enabled: true });
    expect(f.controller.play()).toBe(false);
    expect(f.controller.test(true)).toBe(false);
    expect(f.controller.prepareAlert()()).toBe(false);
    expect(f.calls).toEqual([]);
    f.controller.dispose();
  });

  test("hidden pages cannot play or test, and becoming visible does not replay", () => {
    const f = fixture({ visible: false, browserActive: true });
    expect(f.controller.play()).toBe(false);
    expect(f.controller.test(true)).toBe(false);
    expect(f.calls).toEqual([]);
    f.setVisible(true);
    f.controller.visibilityChanged();
    expect(f.calls).toEqual([]);
    expect(f.controller.play()).toBe(true);
    f.controller.dispose();
  });

  test("the bounded 2,900 ms cue cannot overlap or queue another arrival or Test request", () => {
    const f = fixture({ browserActive: true });
    expect(KDS_VIBRATION_PATTERN).toEqual([800, 250, 800, 250, 800]);
    expect(f.controller.play()).toBe(true);
    expect(f.controller.play()).toBe(false);
    expect(f.controller.test(true)).toBe(false);
    const arrivalDuringCue = f.controller.prepareAlert();
    f.advance(2_899);
    expect(f.controller.play()).toBe(false);
    expect(f.calls).toEqual([[800, 250, 800, 250, 800]]);

    f.advance(1);
    expect(f.calls).toHaveLength(1); // Expiry never dispatches a pending queue.
    expect(arrivalDuringCue()).toBe(false); // A delayed lock cannot revive it.
    expect(f.calls).toHaveLength(1);
    expect(f.controller.play()).toBe(true);
    expect(f.calls).toEqual([
      [800, 250, 800, 250, 800],
      [800, 250, 800, 250, 800],
    ]);
    f.controller.dispose();
  });

  for (const response of ["reject", "throw"] as const) {
    test(`${response === "reject" ? "false-returning" : "throwing"} APIs report failure and allow a later explicit successful test`, () => {
      const f = fixture({ browserActive: true, response });
      expect(f.controller.play()).toBe(false);
      expect(f.controller.state().unavailable).toBe(true);
      expect(f.changes.at(-1)?.unavailable).toBe(true);
      f.respondWith("accept");
      expect(f.controller.test(true)).toBe(true);
      expect(f.controller.state().unavailable).toBe(false);
      expect(f.changes.at(-1)?.unavailable).toBe(false);
      f.controller.dispose();
    });
  }

  test("hiding or disabling cancels the active cue with zero and neither restoration replays it", () => {
    const f = fixture({ browserActive: true });
    expect(f.controller.play()).toBe(true);
    f.setVisible(false);
    f.controller.visibilityChanged();
    expect(f.calls).toEqual([[800, 250, 800, 250, 800], 0]);
    expect(f.controller.play()).toBe(false);
    f.setVisible(true);
    f.controller.visibilityChanged();
    expect(f.calls).toHaveLength(2);
    expect(f.controller.play()).toBe(true);

    f.controller.setEnabled(false);
    expect(f.calls).toEqual([[800, 250, 800, 250, 800], 0, [800, 250, 800, 250, 800], 0]);
    expect(f.controller.play()).toBe(false);
    f.controller.setEnabled(true);
    expect(f.calls).toHaveLength(4);
    expect(f.controller.play()).toBe(true);
    f.controller.dispose();
  });

  test("cancellation failures cannot escape visibility, disabling or disposal handlers", () => {
    for (const stop of ["hide", "disable", "dispose"] as const) {
      const f = fixture({ browserActive: true, cancelThrows: true });
      expect(f.controller.play()).toBe(true);
      expect(() => {
        if (stop === "hide") {
          f.setVisible(false);
          f.controller.visibilityChanged();
        } else if (stop === "disable") f.controller.setEnabled(false);
        else f.controller.dispose();
      }).not.toThrow();
      expect(f.calls).toEqual([[800, 250, 800, 250, 800], 0]);
      expect(f.controller.play()).toBe(false);
      f.controller.dispose();
    }
  });

  test("disposal cancels once and prevents future events, tests and pending deliveries from reviving it", () => {
    const f = fixture({ browserActive: true });
    const pending = f.controller.prepareAlert();
    expect(f.controller.play()).toBe(true);
    f.controller.dispose();
    expect(f.calls).toEqual([[800, 250, 800, 250, 800], 0]);
    const changesAtDisposal = f.changes.length;
    f.advance(3_000);
    f.controller.setEnabled(true);
    f.controller.activateFromGesture(true);
    f.controller.visibilityChanged();
    expect(f.controller.test(true)).toBe(false);
    expect(f.controller.play()).toBe(false);
    expect(pending()).toBe(false);
    expect(f.controller.prepareAlert()()).toBe(false);
    f.controller.dispose();
    expect(f.calls).toEqual([[800, 250, 800, 250, 800], 0]);
    expect(f.changes).toHaveLength(changesAtDisposal);
  });

  for (const initially of ["disabled", "waiting", "hidden"] as const) {
    test(`an arrival received while ${initially} cannot become a delayed vibration after eligibility changes`, () => {
      const f = fixture({
        enabled: initially !== "disabled",
        visible: initially !== "hidden",
        browserActive: initially === "waiting" ? undefined : true,
      });
      const pending = f.controller.prepareAlert();
      if (initially === "disabled") f.controller.setEnabled(true);
      else if (initially === "waiting") f.controller.activateFromGesture(true);
      else {
        f.setVisible(true);
        f.controller.visibilityChanged();
      }
      expect(f.calls).toEqual([]);
      expect(pending()).toBe(false);
      expect(f.calls).toEqual([]);
      expect(f.controller.prepareAlert()()).toBe(true);
      expect(f.calls).toEqual([[800, 250, 800, 250, 800]]);
      f.controller.dispose();
    });
  }

  for (const interruption of ["disable", "hide"] as const) {
    test(`an eligible arrival is invalidated by ${interruption} and restoration, while a fresh arrival still plays`, () => {
      const f = fixture({ browserActive: true });
      const pending = f.controller.prepareAlert();
      if (interruption === "disable") {
        f.controller.setEnabled(false);
        f.controller.setEnabled(true);
      } else {
        f.setVisible(false);
        f.controller.visibilityChanged();
        f.setVisible(true);
        f.controller.visibilityChanged();
      }
      expect(pending()).toBe(false);
      expect(f.calls).toEqual([]);
      expect(f.controller.prepareAlert()()).toBe(true);
      f.controller.dispose();
    });
  }

  test("a delayed eligible arrival rechecks current visibility before calling the API", () => {
    const f = fixture({ browserActive: true });
    const pending = f.controller.prepareAlert();
    f.setVisible(false);
    expect(pending()).toBe(false);
    expect(f.calls).toEqual([]);
    f.controller.dispose();
  });
});

type Response = "accept" | "reject" | "throw";

function fixture(
  options: {
    enabled?: boolean;
    supported?: boolean;
    visible?: boolean;
    browserActive?: boolean;
    response?: Response;
    cancelThrows?: boolean;
  } = {},
) {
  const calls: Array<number | number[]> = [];
  const changes: StaffVibrationState[] = [];
  let visible = options.visible ?? true;
  let browserActive = options.browserActive;
  let response = options.response ?? "accept";
  let current = 1_000;
  const controller = createStaffVibrationController({
    preferences: { enabled: options.enabled ?? true },
    vibrate:
      options.supported === false
        ? null
        : (pattern) => {
            calls.push(Array.isArray(pattern) ? [...pattern] : pattern);
            if (pattern === 0) {
              if (options.cancelThrows) throw new Error("cancellation unavailable");
              return true;
            }
            if (response === "throw") throw new Error("device rejected vibration");
            return response === "accept";
          },
    isVisible: () => visible,
    hasBeenActive: () => browserActive,
    now: () => current,
    onChange: (state) => changes.push(state),
  });
  return {
    controller,
    calls,
    changes,
    advance: (milliseconds: number) => {
      current += milliseconds;
    },
    setVisible: (next: boolean) => {
      visible = next;
    },
    setBrowserActive: (next: boolean | undefined) => {
      browserActive = next;
    },
    respondWith: (next: Response) => {
      response = next;
    },
  };
}
