export type StaffVibrationPreferences = { enabled: boolean };
export type StaffVibrationState = {
  supported: boolean;
  enabled: boolean;
  waitingForGesture: boolean;
  unavailable: boolean;
};

export const KDS_VIBRATION_PATTERN = [800, 250, 800, 250, 800] as const;
export const KDS_VIBRATION_DURATION_MS = KDS_VIBRATION_PATTERN.reduce(
  (total, part) => total + part,
  0,
);

/** Device preference only. No order identifiers or customer data are stored. */
export function readStaffVibrationPreferences(saved: string | null): StaffVibrationPreferences {
  try {
    const parsed: unknown = JSON.parse(saved ?? "null");
    return {
      enabled:
        !!parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        (parsed as Record<string, unknown>)["enabled"] === true,
    };
  } catch {
    return { enabled: false };
  }
}

/** Optional foreground feedback. API acceptance does not prove physical vibration. */
export function createStaffVibrationController({
  preferences,
  vibrate,
  isVisible,
  hasBeenActive = () => undefined,
  now = () => Date.now(),
  onChange = () => {},
}: {
  preferences: StaffVibrationPreferences;
  vibrate: ((pattern: number | number[]) => boolean) | null;
  isVisible: () => boolean;
  hasBeenActive?: () => boolean | undefined;
  now?: () => number;
  onChange?: (state: StaffVibrationState) => void;
}) {
  let prefs = { ...preferences };
  let trustedInteraction = false;
  let unavailable = false;
  let disposed = false;
  let active = false;
  let playingUntil = 0;
  let generation = 0;
  const activated = () => hasBeenActive() ?? trustedInteraction;
  let reportedActivation = activated();
  const canPlay = () => !disposed && !!vibrate && prefs.enabled && isVisible() && activated();
  const state = (): StaffVibrationState => ({
    supported: vibrate !== null,
    enabled: !disposed && prefs.enabled,
    waitingForGesture: !disposed && !!vibrate && prefs.enabled && !activated(),
    unavailable,
  });
  const emit = () => {
    if (!disposed) {
      reportedActivation = activated();
      onChange(state());
    }
  };
  const stop = () => {
    if (active) {
      try {
        vibrate?.(0);
      } catch {
        // Vibration failure must never interfere with an order or another alert.
      }
    }
    active = false;
    playingUntil = 0;
  };
  const activateFromGesture = (trusted: boolean) => {
    if (!trusted || disposed) return;
    trustedInteraction = true;
    // Activation only unlocks future arrivals; it never replays an older alert.
    // On touch, pointerup may grant activation after a trusted pointerdown.
    if (activated() !== reportedActivation) emit();
  };
  const play = () => {
    if (!vibrate || !canPlay()) return false;
    const current = now();
    if (current < playingUntil) return false;
    let accepted = false;
    try {
      accepted = vibrate([...KDS_VIBRATION_PATTERN]) === true;
    } catch {
      accepted = false;
    }
    if (accepted) {
      active = true;
      playingUntil = current + KDS_VIBRATION_DURATION_MS;
    }
    const nextUnavailable = !accepted;
    if (unavailable !== nextUnavailable) {
      unavailable = nextUnavailable;
      emit();
    }
    return accepted;
  };
  return {
    state,
    preferences: () => ({ ...prefs }),
    activateFromGesture,
    setEnabled: (enabled: boolean) => {
      if (disposed) return;
      generation++;
      prefs = { enabled };
      unavailable = false;
      if (!enabled) stop();
      emit();
    },
    play,
    prepareAlert: () => {
      const eligibleAtArrival = canPlay() && now() >= playingUntil;
      const expectedGeneration = generation;
      // A Web Lock may deliver its callback later. Enabling, unlocking or
      // returning to this page or waiting out an active cue must not turn an
      // old arrival into a new pulse.
      return () => eligibleAtArrival && expectedGeneration === generation && play();
    },
    test: (trusted: boolean) => {
      if (!trusted || disposed) return false;
      activateFromGesture(trusted);
      return play();
    },
    visibilityChanged: () => {
      if (!isVisible()) {
        generation++;
        stop();
      }
    },
    dispose: () => {
      if (disposed) return;
      generation++;
      stop();
      disposed = true;
    },
  };
}
