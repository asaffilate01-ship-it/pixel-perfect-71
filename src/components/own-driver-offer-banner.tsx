import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Truck, Gift, Smartphone } from "lucide-react";
import { useCustomerEntryPolicy } from "@/components/use-customer-entry-policy";
import { isMealDeckSundayDeliveryPreopen, isMealDeckSundayDeliveryService } from "@/lib/mealdeck-launch-schedule";

/** Public marketing appears only after the server confirms the driver checkout gate. */
export function useOwnDriverAvailability() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const update = async () => {
      try {
        const response = await fetch("/api/checkout", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Status unavailable");
        const status: unknown = await response.json();
        const result =
          status && typeof status === "object" && !Array.isArray(status)
            ? (status as Record<string, unknown>)
            : {};
        if (!controller.signal.aborted)
          setAvailable(
            result["available"] === true &&
              Array.isArray(result["fulfilments"]) &&
              result["fulfilments"].includes("delivery"),
          );
      } catch {
        if (!controller.signal.aborted) setAvailable(false);
      }
    };
    void update();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void update();
    }, 60_000);
    window.addEventListener("online", update);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("online", update);
    };
  }, []);
  return available;
}

/** Informational countdown only: production delivery remains gated by /api/checkout. */
export function useOwnDriverPreopenNotice() {
  const [preopen, setPreopen] = useState(false);
  useEffect(() => {
    const update = () => setPreopen(isMealDeckSundayDeliveryPreopen(Date.now()));
    update();
    const timer = window.setInterval(update, 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return preopen;
}

/** Sunday-specific marketing copy is displayed only during the actual service date. */
export function useOwnDriverSundayServiceNotice() {
  const [sundayHours, setSundayHours] = useState(false);
  useEffect(() => {
    const update = () => setSundayHours(isMealDeckSundayDeliveryService(Date.now()));
    update();
    const timer = window.setInterval(update, 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return sundayHours;
}

export function OwnDriverOfferBanner() {
  const available = useOwnDriverAvailability();
  const preopen = useOwnDriverPreopenNotice();
  const sundayHours = useOwnDriverSundayServiceNotice();
  const entry = useCustomerEntryPolicy();
  // Banner timing is informational. The server entry policy is authoritative.
  const monday = entry?.serverNow && Date.parse(entry.serverNow) >= Date.parse("2026-11-09T00:00:00Z");
  if (monday) {
    return (
      <div className="md-own-driver-offer flex flex-wrap items-center justify-center gap-2 bg-amber-300 px-4 py-3 text-center text-sm text-zinc-950" role="status" aria-label="MealDeck member registration and delivery">
        <Gift size={18} aria-hidden="true" />
        <strong>{entry?.emailRegistrationDeferred === true ? "Registration is reopening shortly." : "Register for MealDeck membership, offers and loyalty."}</strong>{" "}
        <span>Verify your email, add your phone number, install the app and enable optional order alerts.{available ? " Free delivery within 4 km of LU4 8NU for orders £15+ after discounts." : ""}</span>{" "}
        <Link to="/account" className="font-bold underline underline-offset-4">{entry?.emailRegistrationDeferred === true ? "Explore membership" : "Register now"}</Link>
        <Link to="/account" hash="install-mealdeck-app" className="font-bold underline underline-offset-4"><Smartphone size={15} className="inline" aria-hidden="true" /> Install app</Link>
        {available && <Link to="/delivery-terms" className="font-bold underline underline-offset-4">Delivery terms</Link>}
      </div>
    );
  }
  if (!available && !preopen) return null;
  return (
    <div
      className="md-own-driver-offer flex flex-wrap items-center justify-center gap-2 bg-amber-300 px-4 py-3 text-center text-sm text-zinc-950 sm:gap-4"
      role="status"
      aria-label={available ? "Luton free delivery offer" : "Luton delivery launch announcement"}
    >
      <Truck size={18} aria-hidden="true" />
      <span>
        {available ? (
          <>
            <strong>
              {sundayHours
                ? "Due to popular demand: FREE delivery from 3pm to 11pm today!"
                : "Due to popular demand: FREE delivery is now available!"}
            </strong>{" "}
            {sundayHours
              ? "Available during Sunday's opening hours, 3pm–11pm, for Luton collection, kerbside pickup and delivery."
              : "Order for delivery, collection or kerbside pickup during Luton opening hours."}{" "}
            Free delivery within 4 km of LU4 8NU on orders paying £15+ after discounts.
          </>
        ) : (
          <>
            <strong>Due to popular demand: FREE delivery from 3pm to 11pm today!</strong>{" "}
            Luton collection and kerbside pickup are also available during Sunday's opening hours.
            Free delivery within 4 km of LU4 8NU on orders paying £15+ after discounts.
          </>
        )}
        {" "}
        <Link to="/delivery-terms" className="font-bold underline underline-offset-4">
          Delivery T&amp;Cs apply
        </Link>
      </span>
      <Link to="/menus" className="font-bold underline underline-offset-4">
        {available ? "Order delivery" : "Explore menus"}
      </Link>
    </div>
  );
}
