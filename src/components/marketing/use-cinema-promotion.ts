import { useEffect, useState } from "react";
import { getMealDeckCinemaPromotion } from "@/lib/mealdeck-cinema-promotion.functions";
import { cinemaPromoRefreshDelay, type CinemaPromoSnapshot } from "@/lib/mealdeck-cinema-promotion";

/** A fresh server answer opens the next phase. Expire cached visible copy at its
 * own boundary (or on loss of server confirmation), rather than using Date.now().
 */
export function useCinemaPromotion() {
  const [snapshot, setSnapshot] = useState<CinemaPromoSnapshot | null>(null);
  useEffect(() => {
    let disposed = false;
    let revision = 0;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
    const clearTimers = () => {
      clearTimeout(refreshTimer);
      clearTimeout(expiryTimer);
      clearTimeout(requestTimer);
    };
    async function refresh() {
      const request = ++revision;
      clearTimeout(refreshTimer);
      clearTimeout(requestTimer);
      if (navigator.onLine === false || document.visibilityState === "hidden") {
        clearTimers();
        setSnapshot(null);
        return;
      }
      const started = performance.now();
      // Invalidate a stalled request so recovery never depends on it settling.
      requestTimer = setTimeout(() => {
        if (disposed || request !== revision) return;
        revision++;
        clearTimers();
        setSnapshot(null);
        refreshTimer = setTimeout(() => void refresh(), 30_000);
      }, 15_000);
      try {
        const next = await getMealDeckCinemaPromotion();
        if (disposed || request !== revision) return;
        clearTimers();
        const elapsed = performance.now() - started;
        const remaining = next.nextTransitionAt === null ? Infinity :
          Date.parse(next.nextTransitionAt) - Date.parse(next.serverNow) - elapsed;
        // A response crossing a phase boundary is stale; request the new phase.
        if (remaining <= 0) {
          setSnapshot(null);
          refreshTimer = setTimeout(() => void refresh(), 250);
          return;
        }
        setSnapshot(next);
        expiryTimer = setTimeout(() => setSnapshot(null), Math.min(65_000, remaining));
        refreshTimer = setTimeout(() => void refresh(), cinemaPromoRefreshDelay(next, elapsed));
      } catch {
        if (disposed || request !== revision) return;
        clearTimers();
        setSnapshot(null);
        refreshTimer = setTimeout(() => void refresh(), 30_000);
      }
    }
    function invalidate() {
      revision++;
      clearTimers();
      setSnapshot(null);
    }
    function onVisible() {
      invalidate();
      if (document.visibilityState === "visible" && navigator.onLine !== false) void refresh();
    }
    // A restored back-forward-cache page may not emit a visibility change.
    void refresh();
    window.addEventListener("pagehide", invalidate);
    window.addEventListener("pageshow", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("offline", invalidate);
    window.addEventListener("online", onVisible);
    return () => {
      disposed = true;
      revision++;
      clearTimers();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", invalidate);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener("offline", invalidate);
      window.removeEventListener("online", onVisible);
    };
  }, []);
  return snapshot;
}
