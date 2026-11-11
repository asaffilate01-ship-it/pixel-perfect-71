import { useCallback, useEffect, useRef, useState } from "react";
import { LocateFixed, ShieldCheck, StopCircle } from "lucide-react";
import { driverRpc } from "@/lib/mealdeck-driver-browser";
import { validatedDriverLiveFix } from "@/lib/mealdeck-driver-live-location";

/**
 * Explicit per-order GPS consent, foreground only. This is deliberately not a
 * background navigation service. The user may stop at any time.
 * The feature remains hidden until the owner enables the beta after testing.
 */
export function DriverLiveLocation({
  orderId,
  userId,
  onShift,
  online,
}: {
  orderId: string;
  userId: string;
  onShift: boolean;
  online: boolean;
}) {
  const [state, setState] = useState<"off" | "starting" | "sharing">("off");
  const [message, setMessage] = useState(
    "Location sharing is off. No coordinates are sent until you choose Start.",
  );
  const watch = useRef<number | null>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const lastSent = useRef(0);
  const sending = useRef(false);
  const canShare = !!userId && onShift && online;

  const clearWatch = useCallback(() => {
    if (watch.current !== null && typeof navigator !== "undefined" &&
      navigator.geolocation) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    active.current = false;
    generation.current++;
  }, []);

  const stop = useCallback(async () => {
    const wasActive = active.current || watch.current !== null;
    clearWatch();
    setState("off");
    setMessage(online
      ? "Stopped sending GPS. Removing this order's latest shared position."
      : "Stopped sending GPS on this phone. The last server position expires within 30 seconds.");
    if (wasActive && online) {
      try {
        const result = await driverRpc<{ sharing: boolean }>(
          "mealdeck_driver_location_consent",
          { p_order: orderId, p_enabled: false },
        );
        if (result?.sharing !== false) throw new Error("Stop was not confirmed");
        setMessage("Location sharing is off. Your last shared position was cleared.");
      } catch {
        // The browser stopped immediately; the server hides stale fixes after
        // 30 seconds and the private retention sweep clears them.
        setMessage("GPS stopped on this phone. We could not confirm server withdrawal; the last position expires within 30 seconds.");
      }
    }
  }, [clearWatch, online, orderId]);

  useEffect(() => {
    if (!canShare && (active.current || watch.current !== null)) void stop();
  }, [canShare, stop]);

  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState === "hidden" && (active.current || watch.current !== null))
        void stop();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      const wasActive = active.current;
      clearWatch();
      // A page switch/navigation may interrupt the request; server TTL is
      // authoritative even if this best-effort revocation cannot be delivered.
      if (wasActive && online)
        void driverRpc("mealdeck_driver_location_consent", {
          p_order: orderId, p_enabled: false,
        }).catch(() => {});
    };
  }, [clearWatch, online, orderId, stop]);

  async function start() {
    if (!canShare || state !== "off" || active.current ||
      document.visibilityState !== "visible") return;
    if (!window.isSecureContext || !navigator.geolocation) {
      setMessage("Location services require a secure, supported phone browser.");
      return;
    }
    const request = ++generation.current;
    setState("starting");
    setMessage("Enabling location for this delivery only…");
    try {
      const consent = await driverRpc<{ sharing: boolean }>(
        "mealdeck_driver_location_consent",
        { p_order: orderId, p_enabled: true },
      );
      if (consent?.sharing !== true) throw new Error("Consent was not confirmed");
      if (request !== generation.current || !canShare ||
        document.visibilityState !== "visible") {
        void driverRpc("mealdeck_driver_location_consent", {
          p_order: orderId, p_enabled: false,
        }).catch(() => {});
        setState("off");
        return;
      }
      active.current = true;
      lastSent.current = 0;
      setState("sharing");
      setMessage("Sharing while this driver app stays visible. Waiting for an accurate GPS fix…");
      watch.current = navigator.geolocation.watchPosition(
        (position) => {
          if (!active.current || request !== generation.current ||
            document.visibilityState !== "visible" || !navigator.onLine) return;
          const fix = validatedDriverLiveFix(position);
          if (!fix) {
            setMessage("GPS fix is too old or inaccurate. Move to an open area; no position was sent.");
            return;
          }
          if (sending.current || Date.now() - lastSent.current < 10_000) return;
          sending.current = true;
          lastSent.current = Date.now();
          void driverRpc<{ saved: boolean; reason?: string }>(
            "mealdeck_driver_location_point",
            {
              p_order: orderId,
              p_latitude: fix.latitude,
              p_longitude: fix.longitude,
              p_accuracy_metres: fix.accuracyMetres,
              p_fixed_at: fix.fixedAt,
            },
          ).then((result) => {
            if (active.current && request === generation.current) {
              setMessage(result?.saved
                ? "Latest GPS fix accepted. Your customer may view this recent position if their account is eligible."
                : "Waiting to send the next verified location fix.");
            }
          }).catch(() => {
            if (active.current && request === generation.current)
              setMessage("Location update could not be verified. Check your connection or Stop sharing.");
          }).finally(() => { sending.current = false; });
        },
        (error) => {
          if (request !== generation.current) return;
          clearWatch();
          setState("off");
          setMessage(error.code === 1
            ? "Location permission denied. No GPS is being sent. Change phone settings to try again."
            : "GPS timed out or became unavailable. Location sharing stopped.");
          if (online) void driverRpc("mealdeck_driver_location_consent", {
            p_order: orderId, p_enabled: false,
          }).catch(() => {});
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
      );
    } catch {
      if (request !== generation.current) return;
      clearWatch();
      setState("off");
      setMessage("Location sharing could not be authorised for this delivery. Ask the kitchen to check the assignment.");
    }
  }

  return (
    <section className="md-driver-live-location" aria-label="Driver location sharing beta">
      <div className="md-driver-live-location-heading">
        <LocateFixed size={18} aria-hidden="true" />
        <strong>Share location for this delivery</strong>
      </div>
      <p>Optional and only while MealDeck Driver is visible. Stops on leaving this screen, going offline or ending the job. Not background turn-by-turn tracking.</p>
      <div className="md-driver-job-actions">
        {state === "off" ? (
          <button type="button" className="md-driver-primary" disabled={!canShare}
            onClick={() => void start()}>
            <LocateFixed size={17} aria-hidden="true" /> Start sharing
          </button>
        ) : (
          <button type="button" className="md-driver-secondary" onClick={() => void stop()}>
            <StopCircle size={17} aria-hidden="true" /> Stop sharing
          </button>
        )}
      </div>
      <p className="md-driver-gps-result" role="status" aria-live="polite">{message}</p>
      <p className="md-driver-gps-privacy"><ShieldCheck size={17} aria-hidden="true" />
        Only the verified owner of this paid order can view a recent position. No route history is retained.
      </p>
    </section>
  );
}
