export type StaffAlertKind = "kds" | "printer";
export const staffAlertTones = {
  kds: [
    { frequency: 660, at: 0, duration: 0.32 },
    { frequency: 880, at: 0.38, duration: 0.4 },
    { frequency: 660, at: 1, duration: 0.32 },
    { frequency: 880, at: 1.38, duration: 0.44 },
  ],
  printer: [
    { frequency: 1100, at: 0, duration: 0.2 },
    { frequency: 1320, at: 0.26, duration: 0.2 },
    { frequency: 1568, at: 0.52, duration: 0.3 },
    { frequency: 1100, at: 1.05, duration: 0.2 },
    { frequency: 1320, at: 1.31, duration: 0.2 },
    { frequency: 1568, at: 1.57, duration: 0.3 },
  ],
} as const;
export const staffAlertAudio = {
  kds: { defaultVolume: 1, peakGain: 0.98, sustainSeconds: 0.16 },
  printer: { defaultVolume: 1, peakGain: 0.98, sustainSeconds: 0.16 },
} as const;

export function staffAlertDurationMs(kind: StaffAlertKind) {
  return (
    Math.ceil(Math.max(...staffAlertTones[kind].map((note) => note.at + note.duration)) * 1000) +
    100
  );
}

/** Requires an already running, gesture-enabled context. The active cue can be
 * stopped immediately, and its end time prevents test/arrival sounds stacking. */
export function playStaffAlert(
  context: AudioContext,
  kind: StaffAlertKind,
  volume: number,
  playingUntil: number,
): { endsAt: number; stop: () => void } | null {
  const now = context.currentTime;
  if (context.state !== "running" || !Number.isFinite(volume) || volume <= 0 || now < playingUntil)
    return null;
  const peak = Math.min(1, volume) * staffAlertAudio[kind].peakGain;
  const nodes: { oscillator: OscillatorNode; gain: GainNode }[] = [];
  for (const note of staffAlertTones[kind]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    nodes.push({ oscillator, gain });
    const at = now + note.at;
    oscillator.type = "sine";
    oscillator.frequency.value = note.frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + 0.012);
    gain.gain.setValueAtTime(peak, at + staffAlertAudio[kind].sustainSeconds);
    gain.gain.exponentialRampToValueAtTime(0.001, at + note.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + note.duration + 0.02);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  let stopped = false;
  return {
    endsAt: now + staffAlertDurationMs(kind) / 1000,
    stop: () => {
      if (stopped) return;
      stopped = true;
      for (const { oscillator, gain } of nodes) {
        // Disconnect the output immediately, including tones scheduled for later.
        gain.disconnect();
        try {
          oscillator.stop();
        } catch {
          /* The audio context or oscillator may already have ended. */
        }
      }
    },
  };
}
/** In-memory only: no private order IDs or jobs are written to browser storage. */
export function createStaffAlertLedger(limit = 1500) {
  let seeded = false;
  const seen = new Set<string>();
  function remember(ids: readonly string[]) {
    for (const id of ids) seen.add(id);
    while (seen.size > limit) seen.delete(seen.values().next().value!);
  }
  return {
    observe(ids: readonly string[], fresh: boolean): string[] {
      if (!fresh) return [];
      const next = seeded ? [...new Set(ids)].filter((id) => !seen.has(id)) : [];
      remember(ids);
      seeded = true;
      return next;
    },
    remember,
  };
}
