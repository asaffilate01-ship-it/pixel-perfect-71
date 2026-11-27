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
    const clearTimers = () => {
      clearTimeout(refreshTimer);
      clearTimeout(expiryTimer);
    };
    async function refresh() {
      const request = ++revision;
      clearTimeout(refreshTimer);
      const started = performance.now();
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
    function onVisible() {
      if (document.visibilityState === "visible") {
        setSnapshot(null);
        void refresh();
      }
    }
    void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      revision++;
      clearTimers();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return snapshot;
}
