import { useEffect, useState, type ReactNode } from "react";
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

type OfferBannerLayoutProps = {
  label: string;
  icon: ReactNode;
  title: string;
  details: ReactNode;
  actions: ReactNode;
};

/**
 * Stable two-zone banner layout: menu-width copy on the left and predictable,
 * baseline-aligned actions on the right. No promotional content decides layout.
 */
export function OfferBannerLayout({ label, icon, title, details, actions }: OfferBannerLayoutProps) {
  return (
    <div className="md-own-driver-offer" role="status" aria-label={label}>
      <div className="md-own-driver-offer-inner">
        <div className="md-own-driver-offer-message">
          <span className="md-own-driver-offer-icon" aria-hidden="true">{icon}</span>
          <div className="md-own-driver-offer-copy">
            <strong>{title}</strong>
            <span>{details}</span>
          </div>
        </div>
        <div className="md-own-driver-offer-actions">{actions}</div>
      </div>
    </div>
  );
}

export function OwnDriverOfferBanner() {
  const available = useOwnDriverAvailability();
  const preopen = useOwnDriverPreopenNotice();
  const sundayHours = useOwnDriverSundayServiceNotice();
  const entry = useCustomerEntryPolicy();

  // The server controls whether registration is available, not the browser clock.
  const monday = entry?.serverNow && Date.parse(entry.serverNow) >= Date.parse("2026-11-09T00:00:00Z");
  if (monday) {
    return (
      <OfferBannerLayout
        label="MealDeck member registration and delivery"
        icon={<Gift size={18} />}
        title={entry?.emailRegistrationDeferred
          ? "Member registration opens today at 1pm."
          : "Join MealDeck for member-only offers and loyalty benefits."}
        details={<>Verify your email, add your phone number, install the app and enable optional order alerts.
          {available ? " Free delivery within 4 km of LU4 8NU for orders £15+ after discounts." : ""}
        </>}
        actions={<>
          <Link to="/account" className="md-own-driver-offer-link">
            {entry?.emailRegistrationDeferred ? "Explore membership" : "Register"}
          </Link>
          <Link to="/account" className="md-own-driver-offer-link">
            <Smartphone size={15} aria-hidden="true" /> Install app
          </Link>
          {available && <Link to="/delivery-terms" className="md-own-driver-offer-link">Delivery terms</Link>}
        </>}
      />
    );
  }

  if (!available && !preopen) return null;
  return (
    <OfferBannerLayout
      label={available ? "Luton free delivery offer" : "Luton delivery launch announcement"}
      icon={<Truck size={18} />}
      title={available
        ? sundayHours
          ? "Due to popular demand: FREE delivery from 3pm to 11pm today!"
          : "Due to popular demand: FREE delivery is now available!"
        : "Due to popular demand: FREE delivery from 3pm to 11pm today!"}
      details={available
        ? <>
            {sundayHours
              ? "Available during Sunday's opening hours, 3pm–11pm, for Luton collection, kerbside pickup and delivery."
              : "Order for delivery, collection or kerbside pickup during Luton opening hours."}{" "}
            Free delivery within 4 km of LU4 8NU on orders paying £15+ after discounts.
          </>
        : <>
            Luton collection and kerbside pickup are also available during Sunday's opening hours.{" "}
            Free delivery within 4 km of LU4 8NU on orders paying £15+ after discounts.
          </>}
      actions={<>
        <Link to="/delivery-terms" className="md-own-driver-offer-link">Delivery T&amp;Cs apply</Link>
        <Link to="/menus" className="md-own-driver-offer-link">
          {available ? "Order delivery" : "Explore menus"}
        </Link>
      </>}
    />
  );
}
