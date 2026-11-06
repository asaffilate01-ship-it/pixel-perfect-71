import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Volume2, VolumeX } from "lucide-react";
import {
  createStaffAlertLedger,
  staffAlertAudio,
  staffAlertDurationMs,
  type StaffAlertKind,
} from "@/lib/mealdeck-staff-alerts";
import { createStaffAudioController, readStaffSoundPreferences } from "@/lib/mealdeck-staff-audio";
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
  const controller = useRef<ReturnType<typeof createStaffAudioController> | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolumeState] = useState<number>(staffAlertAudio[kind].defaultVolume);
  const [notice, setNotice] = useState(0);
  const [audioError, setAudioError] = useState("");
  const [waitingForGesture, setWaitingForGesture] = useState(false);
  const preferencesKey = `mealdeck-${kind}-sound`;
  const claimed = useRef(new Set<string>());
  const hydrated = useRef(false);

  useEffect(() => {
    setEnabled(false);
    setNotice(0);
    setAudioError("");
    claimed.current.clear();
    hydrated.current = false;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(preferencesKey);
    } catch {
      /* Preferences are optional. */
    }
    const audio = createStaffAudioController({
      kind,
      preferences: readStaffSoundPreferences(kind, saved),
      createContext: () => new AudioContext(),
      onChange: (state) => {
        setEnabled(state.enabled);
        setVolumeState(state.volume);
        setWaitingForGesture(state.waitingForGesture);
        setAudioError(
          state.unavailable
            ? "Sound is unavailable. New orders will still show a visual alert."
            : "",
        );
      },
    });
    controller.current = audio;
    const unlock = (event: Event) => {
      if (!event.isTrusted || !audio.state().waitingForGesture) return;
      // These controls manage their own explicit gesture. Avoid a pointer-down
      // changing Enable into Mute before the same button's click is handled.
      if (event.target instanceof Element && event.target.closest("[data-staff-sound-control]"))
        return;
      void audio.unlockFromGesture(true);
    };
    const gestureEvents = ["pointerdown", "pointerup", "click", "keydown"] as const;
    for (const event of gestureEvents) window.addEventListener(event, unlock);
    audio.start();
    let c: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined")
        c = new BroadcastChannel(`mealdeck-staff-alert:${key}`);
    } catch {
      /* Cross-window coordination is optional in restricted browser contexts. */
    }
    channel.current = c;
    if (c)
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
      for (const event of gestureEvents) window.removeEventListener(event, unlock);
      c?.close();
      channel.current = null;
      audio.dispose();
      if (controller.current === audio) controller.current = null;
    };
  }, [kind, key, preferencesKey, ledger]);

  const play = useCallback(async () => controller.current?.play() ?? false, []);
  const persist = useCallback(() => {
    const preferences = controller.current?.preferences();
    if (!preferences) return;
    try {
      localStorage.setItem(preferencesKey, JSON.stringify(preferences));
    } catch {
      /* No order data is persisted. */
    }
  }, [preferencesKey]);
  const toggle = useCallback(
    async (trusted: boolean) => {
      const audio = controller.current;
      if (!audio || !trusted) return;
      if (audio.state().enabled) {
        audio.setEnabled(false);
        persist();
        return;
      }
      audio.setEnabled(true);
      persist();
      if (await audio.unlockFromGesture(trusted)) {
        if (controller.current === audio) audio.play();
      }
    },
    [persist],
  );
  const setVolume = useCallback(
    (value: number) => {
      controller.current?.setVolume(value);
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
        if (!(await play())) return;
        for (const id of unheard) claimed.current.add(id);
        channel.current?.postMessage({ type: "heard", ids: unheard });
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
    waitingForGesture,
    toggle,
    setVolume,
    observe,
    clearNotice: () => setNotice(0),
    test: play,
  };
}

export function StaffSoundUnlock({
  alerts,
}: {
  alerts: Pick<ReturnType<typeof useStaffAlerts>, "waitingForGesture" | "toggle">;
}) {
  if (!alerts.waitingForGesture) return null;
  return (
    <div
      data-staff-sound-control
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border md-ops-border md-ops-paper px-3 py-1 text-xs md-ops-muted"
    >
      <span>Sound is waiting for your first interaction.</span>
      <button
        type="button"
        className="min-h-11 font-bold underline"
        onClick={(event) => void alerts.toggle(event.isTrusted)}
      >
        Enable sound
      </button>
    </div>
  );
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
    <div
      data-staff-sound-control
      className="flex flex-wrap items-center gap-3 rounded-xl border md-ops-border md-ops-paper p-3"
    >
      <button
        type="button"
        onClick={(event) => void alerts.toggle(event.isTrusted)}
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
      {alerts.volume < 1 && (
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
      <span className="text-xs md-ops-muted">
        {kind === "kds"
          ? "Two strong chimes when new paid orders arrive."
          : "Two rising chimes when new orders or receipts arrive."}{" "}
        Turn up the device volume too.
      </span>
      {alerts.waitingForGesture && (
        <p role="status" className="basis-full text-xs font-semibold md-ops-muted">
          Sound is waiting for your first interaction. Tap Enable sound to activate it now.
        </p>
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
