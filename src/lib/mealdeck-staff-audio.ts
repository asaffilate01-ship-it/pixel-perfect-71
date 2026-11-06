import { playStaffAlert, staffAlertAudio, type StaffAlertKind } from "./mealdeck-staff-alerts";

export type StaffSoundPreferences = { enabled: boolean; volume: number };
export type StaffSoundState = {
  enabled: boolean;
  waitingForGesture: boolean;
  unavailable: boolean;
  volume: number;
};

export function readStaffSoundPreferences(
  kind: StaffAlertKind,
  saved: string | null,
): StaffSoundPreferences {
  const defaults = { enabled: true, volume: staffAlertAudio[kind].defaultVolume as number };
  try {
    const parsed: unknown = JSON.parse(saved ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaults;
    const value = parsed as Record<string, unknown>;
    return {
      enabled: typeof value["enabled"] === "boolean" ? value["enabled"] : defaults.enabled,
      volume:
        typeof value["volume"] === "number" &&
        Number.isFinite(value["volume"]) &&
        value["volume"] >= 0 &&
        value["volume"] <= 1
          ? value["volume"]
          : defaults.volume,
    };
  } catch {
    return defaults;
  }
}

/** The preference can be on while the browser still requires a gesture. Only a
 * running context is reported as enabled; unlocking never replays old arrivals. */
export function createStaffAudioController({
  kind,
  preferences,
  createContext,
  onChange,
}: {
  kind: StaffAlertKind;
  preferences: StaffSoundPreferences;
  createContext: () => AudioContext;
  onChange: (state: StaffSoundState) => void;
}) {
  let prefs = { ...preferences };
  let context: AudioContext | null = null;
  let active: ReturnType<typeof playStaffAlert> = null;
  let unavailable = false;
  let disposed = false;
  let generation = 0;
  const state = (): StaffSoundState => {
    const enabled = !disposed && prefs.enabled && !unavailable && context?.state === "running";
    return {
      enabled,
      waitingForGesture: !disposed && prefs.enabled && !enabled && !unavailable,
      unavailable,
      volume: prefs.volume,
    };
  };
  const emit = () => {
    if (!disposed) onChange(state());
  };
  const stop = () => {
    active?.stop();
    active = null;
  };
  const changed = () => {
    if (context?.state !== "running") stop();
    emit();
  };
  const ensureContext = () => {
    if (disposed || !prefs.enabled) return null;
    try {
      if (!context) {
        context = createContext();
        context.addEventListener("statechange", changed);
      }
      unavailable = false;
      return context;
    } catch {
      unavailable = true;
      return null;
    }
  };
  return {
    state,
    preferences: () => ({ ...prefs }),
    start: () => {
      // Some browsers already permit a running context. Do not call resume or
      // emit a test sound from mount when that permission has not been granted.
      ensureContext();
      emit();
    },
    unlockFromGesture: async (trusted: boolean) => {
      if (!trusted || disposed || !prefs.enabled) return false;
      const current = ensureContext();
      const expected = generation;
      if (!current) {
        emit();
        return false;
      }
      try {
        if (current.state !== "running") await current.resume();
      } catch {
        if (!disposed && expected === generation) emit();
        return false;
      }
      if (disposed || expected !== generation || !prefs.enabled) return false;
      emit();
      return state().enabled;
    },
    setEnabled: (enabled: boolean) => {
      if (disposed) return;
      generation++;
      prefs = { ...prefs, enabled };
      if (!enabled) stop();
      else unavailable = false;
      emit();
    },
    setVolume: (volume: number) => {
      if (disposed || !Number.isFinite(volume)) return;
      prefs = { ...prefs, volume: Math.min(1, Math.max(0, volume)) };
      if (prefs.volume === 0) stop();
      emit();
    },
    play: () => {
      if (!state().enabled || !context) return false;
      try {
        const next = playStaffAlert(context, kind, prefs.volume, active?.endsAt ?? 0);
        if (!next) return false;
        active = next;
        return true;
      } catch {
        stop();
        unavailable = true;
        emit();
        return false;
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      generation++;
      stop();
      context?.removeEventListener("statechange", changed);
      void context?.close().catch(() => {});
      context = null;
    },
  };
}
