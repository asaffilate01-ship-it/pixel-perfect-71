import { useEffect, useRef, useState } from "react";
import { LocateFixed, ShieldCheck } from "lucide-react";
import { assessDriverGpsReadiness } from "@/lib/mealdeck-driver-gps-readiness";

type GpsCheckState =
  | "idle"
  | "checking"
  | "ready"
  | "inaccurate"
  | "stale"
  | "invalid"
  | "denied"
  | "timeout"
  | "unavailable";

const gpsMessages: Record<GpsCheckState, string> = {
  idle: "Use this check to test location permission on your phone before a delivery.",
  checking: "Checking your phone’s location once…",
  ready: "GPS is ready on this phone. No location was sent or saved.",
  inaccurate: "GPS accuracy is low. Try again outdoors, with location services enabled.",
  stale: "Your phone returned an old location. Try again in a clear area.",
  invalid: "The location response could not be verified. Try again.",
  denied: "Location permission was denied. Check your browser or phone settings.",
  timeout: "GPS did not respond in time. Try again with a clear view of the sky.",
  unavailable: "GPS is unavailable in this app or browser. Use a supported secure connection.",
};

/**
 * Driver-only device preflight. Never calls watchPosition, starts background
 * tracking, persists a fix or sends coordinates to the MealDeck backend.
 * Customer-visible tracking is a separate, disabled service until commissioned.
 */
export function DriverGpsReadiness({
  userId,
  onShift,
  online,
}: {
  userId: string;
  onShift: boolean;
  online: boolean;
}) {
  const [state, setState] = useState<GpsCheckState>("idle");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const generation = useRef(0);
  const busy = state === "checking";
  const canCheck = Boolean(userId && onShift && online);

  useEffect(() => {
    generation.current += 1;
    setState("idle");
    setAccuracy(null);
    const generationRef = generation;
    const hide = () => {
      if (document.visibilityState === "hidden") {
        generationRef.current += 1;
        setState("idle");
        setAccuracy(null);
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      generationRef.current += 1;
      document.removeEventListener("visibilitychange", hide);
    };
  }, [userId, onShift, online]);

  function checkGps() {
    if (!canCheck || busy || document.visibilityState !== "visible") return;
    if (
      window.isSecureContext !== true ||
      !("geolocation" in navigator) ||
      !navigator.geolocation
    ) {
      setState("unavailable");
      return;
    }
    const requestId = ++generation.current;
    setState("checking");
    setAccuracy(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== generation.current || document.visibilityState !== "visible") return;
        const result = assessDriverGpsReadiness(position);
        setState(result.status);
        setAccuracy("accuracyMetres" in result ? result.accuracyMetres : null);
      },
      (error) => {
        if (requestId !== generation.current || document.visibilityState !== "visible") return;
        setAccuracy(null);
        setState(error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12_000 },
    );
  }

  return (
    <section className="md-driver-panel md-driver-gps-panel" aria-labelledby="driver-gps-heading">
      <span className="md-driver-small-label">Delivery navigation</span>
      <h2 id="driver-gps-heading">
        <LocateFixed size={20} aria-hidden="true" /> Check phone GPS
      </h2>
      <p>
        Test your phone’s location accuracy before a delivery. This is a one-time
        readiness check, not live driver tracking.
      </p>
      <button
        type="button"
        className="md-driver-secondary"
        onClick={checkGps}
        disabled={!canCheck || busy}
      >
        <LocateFixed size={17} aria-hidden="true" />
        {busy ? "Checking GPS…" : "Check GPS readiness"}
      </button>
      {!onShift && <p className="md-driver-gps-note">Start your shift to check GPS readiness.</p>}
      <p className="md-driver-gps-result" role="status" aria-live="polite">
        {gpsMessages[state]}
        {accuracy !== null && state === "ready" && ` Approximate accuracy: ${accuracy} metres.`}
      </p>
      <p className="md-driver-gps-privacy">
        <ShieldCheck size={17} aria-hidden="true" />
        Your exact location stays on your phone. Customer map tracking is not yet active.
      </p>
    </section>
  );
}
