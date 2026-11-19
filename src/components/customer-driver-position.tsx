import { useEffect, useState } from "react";
import { MapPin, RefreshCw, ShieldCheck } from "lucide-react";
import { customerRpc } from "@/lib/mealdeck-customer-browser";
import {
  parseCustomerDriverPosition,
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
    const refresh = async () => {
      if (reading || document.visibilityState !== "visible" || !navigator.onLine) {
        if (!navigator.onLine && active) setPosition(null);
        return;
      }
      reading = true;
      try {
        const raw = await customerRpc("mealdeck_customer_driver_position", { p_order: orderId });
        if (active) {
          const current = parseCustomerDriverPosition(raw);
          setPosition(current);
          setIssue("");
        }
      } catch {
        if (active) {
          setPosition(null);
          setIssue("Driver position is temporarily unavailable. Your confirmed order stages still update normally.");
        }
      } finally {
        reading = false;
        if (active) setChecking(false);
      }
    };
    void refresh();
    const tick = window.setInterval(() => void refresh(), 15_000);
    const visibility = () => {
      if (document.visibilityState === "visible") void refresh();
      else if (active) setPosition(null);
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", visibility);
    window.addEventListener("offline", visibility);
    return () => {
      active = false;
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", visibility);
      window.removeEventListener("offline", visibility);
    };
  }, [orderId, retry]);

  const mapUrl = position
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
      {!checking && position && (
        <div className="md-account-fine" role="status">
          <p>Position reported {new Date(position.observedAt).toLocaleTimeString("en-GB", {
            hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
          })} · GPS accuracy within {position.accuracyMetres} metres.</p>
          <a href={mapUrl ?? undefined} target="_blank" rel="noopener noreferrer"
            aria-label="View the driver's last shared position in Google Maps (opens a new tab)">
            View last shared position in Google Maps
          </a>
          <p>Opening Google Maps shares this position with Google. The map will not update automatically.</p>
        </div>
      )}
      {!checking && !position && (
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
