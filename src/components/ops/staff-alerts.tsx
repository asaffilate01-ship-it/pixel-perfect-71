import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Volume2, VolumeX } from "lucide-react";
import {
  createStaffAlertLedger,
  staffAlertTones,
  staffAlertAudio,
  staffAlertDurationMs,
  type StaffAlertKind,
} from "@/lib/mealdeck-staff-alerts";
const ledgers = new Map<string, ReturnType<typeof createStaffAlertLedger>>();

export function useStaffAlerts(kind: StaffAlertKind, scope: string) {
  const key = `${kind}:${scope}`;
  const ledger = useMemo(() => {
    const existing = ledgers.get(key);
    if (existing) return existing;
    const next = createStaffAlertLedger();
    ledgers.set(key, next);
    return next;
  }, [key]);
  const context = useRef<AudioContext | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolumeState] = useState<number>(staffAlertAudio[kind].defaultVolume);
  const [notice, setNotice] = useState(0);
  const [audioError, setAudioError] = useState("");
  const preferencesKey = `mealdeck-${kind}-sound`;
  const prefs = useRef({ enabled: false, volume: staffAlertAudio[kind].defaultVolume as number });
  const claimed = useRef(new Set<string>());
  const hydrated = useRef(false);

  useEffect(() => {
    setEnabled(false);
    setNotice(0);
    setAudioError("");
    claimed.current.clear();
    hydrated.current = false;
    try {
      const p = JSON.parse(localStorage.getItem(preferencesKey) ?? "{}");
      if (typeof p.volume === "number" && p.volume >= 0 && p.volume <= 1) {
        setVolumeState(p.volume);
        prefs.current.volume = p.volume;
      }
      prefs.current.enabled = p.enabled === true;
    } catch {
      /* Preferences are optional. */
    }
    if (typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel(`mealdeck-staff-alert:${key}`);
    channel.current = c;
    c.onmessage = (event) => {
      const data = event.data as { type?: unknown; ids?: unknown };
      if (
        data.type !== "heard" ||
        !Array.isArray(data.ids) ||
        data.ids.length > 250 ||
        data.ids.some((x) => typeof x !== "string" || x.length > 100)
      )
        return;
      for (const id of data.ids as string[]) claimed.current.add(id);
      ledger.remember(data.ids as string[]);
      if (claimed.current.size > 1500) claimed.current.clear();
    };
    return () => {
      c.close();
      channel.current = null;
      void context.current?.close().catch(() => {});
      context.current = null;
    };
  }, [key, preferencesKey, ledger]);

  const play = useCallback(async () => {
    if (!context.current || context.current.state !== "running") return false;
    const ctx = context.current;
    for (const note of staffAlertTones[kind]) {
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      const at = ctx.currentTime + note.at;
      oscillator.type = "sine";
      oscillator.frequency.value = note.frequency;
      gain.gain.setValueAtTime(0, at);
      const peak = prefs.current.volume * staffAlertAudio[kind].peakGain;
      gain.gain.linearRampToValueAtTime(peak, at + 0.012);
      if (staffAlertAudio[kind].sustainSeconds)
        gain.gain.setValueAtTime(peak, at + staffAlertAudio[kind].sustainSeconds);
      gain.gain.exponentialRampToValueAtTime(0.001, at + note.duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + note.duration + 0.02);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }
    return true;
  }, [kind]);
  const persist = useCallback(() => {
    try {
      localStorage.setItem(preferencesKey, JSON.stringify(prefs.current));
    } catch {
      /* No order data is persisted. */
    }
  }, [preferencesKey]);
  const toggle = useCallback(async () => {
    if (enabled) {
      setEnabled(false);
      prefs.current.enabled = false;
      persist();
      return;
    }
    try {
      context.current ??= new AudioContext();
      await context.current.resume();
      if (context.current.state !== "running") throw new Error("audio suspended");
      setEnabled(true);
      prefs.current.enabled = true;
      persist();
      setAudioError("");
      await play();
    } catch {
      setAudioError("Sound is unavailable. New orders will still show a visual alert.");
    }
  }, [enabled, persist, play]);
  const setVolume = useCallback(
    (value: number) => {
      const next = Math.min(1, Math.max(0, value));
      setVolumeState(next);
      prefs.current.volume = next;
      persist();
    },
    [persist],
  );
  const observe = useCallback(
    (ids: readonly string[], fresh: boolean) => {
      if (!fresh) return;
      if (!hydrated.current) {
        ledger.observe(ids, true);
        hydrated.current = true;
        return;
      }
      const next = ledger.observe(ids, true);
      if (!next.length) return;
      setNotice((n) => n + next.length);
      if (!enabled) return;
      const announce = async () => {
        const unheard = next.filter((id) => !claimed.current.has(id));
        if (!unheard.length) return;
        for (const id of unheard) claimed.current.add(id);
        channel.current?.postMessage({ type: "heard", ids: unheard });
        await play();
        // Keep the optional cross-window lock through the chime, so simultaneous
        // polls cannot produce overlapping copies before the broadcast arrives.
        await new Promise<void>((resolve) => setTimeout(resolve, staffAlertDurationMs(kind)));
      };
      if (navigator.locks)
        void navigator.locks.request(`mealdeck-chime:${key}`, { ifAvailable: true }, (lock) =>
          lock ? announce() : Promise.resolve(),
        );
      else if (document.visibilityState === "visible" && document.hasFocus()) void announce();
    },
    [enabled, key, kind, play, ledger],
  );
  return {
    enabled,
    volume,
    notice,
    audioError,
    toggle,
    setVolume,
    observe,
    clearNotice: () => setNotice(0),
    test: play,
  };
}

export function StaffAlertControls({
  alerts,
  kind,
  noticeLabels,
}: {
  alerts: ReturnType<typeof useStaffAlerts>;
  kind: StaffAlertKind;
  noticeLabels?: { singular: string; plural: string };
}) {
  const labels =
    noticeLabels ??
    (kind === "kds"
      ? { singular: "order", plural: "orders" }
      : { singular: "receipt", plural: "receipts" });
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border md-ops-border md-ops-paper p-3">
      <button
        type="button"
        onClick={() => void alerts.toggle()}
        className="md-ops-button md-ops-secondary"
        aria-pressed={alerts.enabled}
      >
        {alerts.enabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        {alerts.enabled ? "Mute sound" : "Enable sound"}
      </button>
      <label className="flex min-h-11 items-center gap-2 text-xs font-semibold md-ops-muted">
        Volume {Math.round(alerts.volume * 100)}%
        <input
          aria-label={`${kind === "kds" ? "Kitchen" : "Printer"} alert volume`}
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={alerts.volume}
          onChange={(e) => alerts.setVolume(Number(e.target.value))}
          className="w-24 accent-red-600"
        />
      </label>
      {kind === "kds" && alerts.volume < 1 && (
        <button
          type="button"
          className="md-ops-button md-ops-secondary"
          onClick={() => alerts.setVolume(1)}
        >
          Set to loudest
        </button>
      )}
      {alerts.enabled && (
        <button
          type="button"
          onClick={() => void alerts.test()}
          className="min-h-11 px-2 text-xs font-semibold underline"
        >
          Test {kind === "kds" ? "kitchen" : "printer"} sound
        </button>
      )}
      {kind === "kds" && (
        <span className="text-xs md-ops-muted">
          Two strong chimes for each new paid order. Turn up the device volume too.
        </span>
      )}
      {alerts.notice > 0 && (
        <button
          type="button"
          onClick={alerts.clearNotice}
          role="status"
          className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-100 px-3 text-sm font-bold text-amber-950"
        >
          <Bell className="size-4" />
          {alerts.notice} new {alerts.notice === 1 ? labels.singular : labels.plural} · dismiss
        </button>
      )}
      {alerts.audioError && (
        <p role="status" className="w-full text-xs md-ops-muted">
          {alerts.audioError}
        </p>
      )}
    </div>
  );
}
