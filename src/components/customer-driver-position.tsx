import { useEffect, useState } from "react";
import { MapPin, RefreshCw, ShieldCheck } from "lucide-react";
import { customerRpc } from "@/lib/mealdeck-customer-browser";
import {
  parseCustomerDriverPosition,
  customerDriverPositionRemainingMs,
  type CustomerDriverPosition as DriverPosition,
} from "@/lib/mealdeck-driver-live-location";

/**
 * Private member-order beta. No map service receives GPS without an explicit
 * customer click. No live route or ETA is fabricated from two coordinates.
 */
export function CustomerDriverPosition({ orderId }: { orderId: string }) {
  const [position, setPosition] = useState<DriverPosition | null>(null);
  const [checking, setChecking] = useState(true);
  const [issue, setIssue] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    let reading = false;
    let generation = 0;
    let expiry: number | undefined;
    const clear = () => {
      generation++;
      window.clearTimeout(expiry);
      setPosition(null);
    };
    const visibleOnline = () => document.visibilityState === "visible" && navigator.onLine;
    const refresh = async () => {
      if (!visibleOnline() || reading) return;
      reading = true;
      const request = ++generation;
      try {
        const raw = await customerRpc("mealdeck_customer_driver_position", { p_order: orderId });
        if (active && request === generation && visibleOnline()) {
          const current = parseCustomerDriverPosition(raw);
          const remaining = current ? customerDriverPositionRemainingMs(current) : 0;
          window.clearTimeout(expiry);
          setPosition(remaining > 0 ? current : null);
          setIssue("");
          if (remaining > 0) expiry = window.setTimeout(() => setPosition(null), remaining);
        }
      } catch {
        if (active && request === generation && visibleOnline()) {
          clear();
          setIssue("Driver position is temporarily unavailable. Your confirmed order stages still update normally.");
        }
      } finally {
        reading = false;
        if (active) setChecking(false);
      }
    };
    clear();
    setChecking(true);
    void refresh();
    const tick = window.setInterval(() => void refresh(), 15_000);
    const visibility = () => {
      if (!visibleOnline()) clear();
      else void refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", visibility);
    window.addEventListener("offline", visibility);
    return () => {
      active = false;
      generation++;
      window.clearTimeout(expiry);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", visibility);
      window.removeEventListener("offline", visibility);
    };
  }, [orderId, retry]);

  const mapUrl = position && customerDriverPositionRemainingMs(position) > 0
    ? "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(position.latitude + "," + position.longitude)
    : null;

  return (
    <section className="md-account-panel md-customer-driver-position"
      aria-label="Private driver location beta">
      <div className="md-account-section-heading">
        <MapPin size={21} aria-hidden="true" />
        <h3>Driver position</h3>
      </div>
      <p>Optional, consent-based location from your assigned MealDeck driver. This is the latest reported position, not a turn-by-turn route or promised arrival time.</p>
      {checking && <p role="status">Checking the latest verified driver location…</p>}
      {!checking && position && mapUrl && (
        <div className="md-account-fine" role="status">
          <p>Position reported {new Date(position.observedAt).toLocaleTimeString("en-GB", {
            hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
          })} · GPS accuracy within {position.accuracyMetres} metres.</p>
          <a href={mapUrl} target="_blank" rel="noopener noreferrer"
            onClick={(event) => {
              if (!position || customerDriverPositionRemainingMs(position) <= 0 ||
                  document.visibilityState !== "visible" || !navigator.onLine) {
                event.preventDefault();
                setPosition(null);
              }
            }}
            aria-label="View the driver's last shared position in Google Maps (opens a new tab)">
            View last shared position in Google Maps
          </a>
          <p>Opening Google Maps shares this position with Google. The map will not update automatically.</p>
        </div>
      )}
      {!checking && !mapUrl && (
        <p className="md-account-fine" role="status">
          {issue || "No recent location is available. The driver may not have chosen to share, may have left the app, or the latest fix has expired."}
        </p>
      )}
      <button type="button" onClick={() => setRetry(v => v + 1)}>
        <RefreshCw size={15} aria-hidden="true" /> Refresh driver position
      </button>
      <p className="md-account-fine">
        <ShieldCheck size={14} aria-hidden="true" /> Only a registered customer viewing their own paid order can access this preview. Collection codes do not unlock GPS.
      </p>
    </section>
  );
}
