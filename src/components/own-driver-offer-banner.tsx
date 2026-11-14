import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Truck, Gift, X } from "lucide-react";
import { useCustomerEntryPolicy } from "@/components/use-customer-entry-policy";
import { isMealDeckSundayDeliveryPreopen, isMealDeckSundayDeliveryService } from "@/lib/mealdeck-launch-schedule";
import "@/styles.member-banner.css";

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

/** Shared responsive two-column banner for delivery notices and aligned menu CTAs. */
export function OfferBannerLayout({
  label,
  icon,
  title,
  details,
  actions,
}: {
  label: string;
  icon: ReactNode;
  title: ReactNode;
  details: ReactNode;
  actions: ReactNode;
}) {
  return (
    <section className="md-own-driver-offer" role="status" aria-label={label}>
      <div className="md-own-driver-offer-inner">
        <div className="md-own-driver-offer-message">
          <span className="md-own-driver-offer-icon">{icon}</span>
          <div className="md-own-driver-offer-copy">
            <strong>{title}</strong>
            <span>{details}</span>
          </div>
        </div>
        <nav className="md-own-driver-offer-actions" aria-label="Delivery information and ordering links">
          {actions}
        </nav>
      </div>
    </section>
  );
}

const MEALDECK_ANNOUNCEMENT_SESSION_KEY = "mealdeck-announcement-seen-20261114";

/** Non-modal, short update displayed once per browsing session outside ordering. */
export function OwnDriverOfferBanner() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const available = useOwnDriverAvailability();
  const preopen = useOwnDriverPreopenNotice();
  const sundayHours = useOwnDriverSundayServiceNotice();
  const entry = useCustomerEntryPolicy();
  const memberActive =
    !!entry?.serverNow && Date.parse(entry.serverNow) >= Date.parse("2026-11-09T00:00:00Z");
  const eligiblePage = pathname === "/" || pathname === "/luton";
  const hasAnnouncement = memberActive || available || preopen;
  const [visible, setVisible] = useState(false);
  const seenDuringMount = useRef(false);

  useEffect(() => {
    if (!eligiblePage || !hasAnnouncement) {
      setVisible(false);
      return;
    }
    if (seenDuringMount.current) return;
    try {
      if (window.sessionStorage.getItem(MEALDECK_ANNOUNCEMENT_SESSION_KEY) === "1") return;
    } catch {
      // Session storage is optional for viewing and dismissing the notice.
    }
    const showTimer = window.setTimeout(() => {
      if (document.visibilityState === "hidden") return;
      seenDuringMount.current = true;
      try {
        window.sessionStorage.setItem(MEALDECK_ANNOUNCEMENT_SESSION_KEY, "1");
      } catch {
        // In-memory guard prevents repeating within the mounted page.
      }
      setVisible(true);
    }, 650);
    return () => window.clearTimeout(showTimer);
  }, [eligiblePage, hasAnnouncement]);

  useEffect(() => {
    if (!visible) return;
    const hideTimer = window.setTimeout(() => setVisible(false), 8_000);
    return () => window.clearTimeout(hideTimer);
  }, [visible]);

  if (!visible || !eligiblePage || !hasAnnouncement) return null;

  return (
    <aside className="md-announcement-popover" aria-label="MealDeck update">
      <button
        type="button"
        className="md-announcement-close"
        aria-label="Close MealDeck update"
        onClick={() => setVisible(false)}
      >
        <X size={18} aria-hidden="true" />
      </button>
      {memberActive ? (
        <section className="md-own-driver-offer md-member-banner" role="status" aria-label="MealDeck member registration and delivery">
          <div className="md-member-banner-inner">
            <div className="md-member-banner-copy">
              <Gift size={18} className="md-member-banner-icon" aria-hidden="true" />
              <p>
                <strong>
                  {entry?.emailRegistrationDeferred
                    ? "Member registration opens today at 1pm."
                    : "Join MealDeck for member-only offers and loyalty points."}
                </strong>{" "}
                <span>
                  Register with your email and WhatsApp number. Free local delivery within 4 km
                  on £15+ after discounts, subject to availability at checkout.
                </span>
              </p>
            </div>
            <nav className="md-member-banner-actions" aria-label="MealDeck update links">
              <Link to="/account" onClick={() => setVisible(false)}>
                {entry?.emailRegistrationDeferred ? "Explore membership" : "Register"}
              </Link>
              <Link to="/menus" onClick={() => setVisible(false)}>Order now</Link>
              <Link to="/delivery-terms" onClick={() => setVisible(false)}>Delivery terms</Link>
            </nav>
          </div>
        </section>
      ) : (
        <OfferBannerLayout
          label={available ? "Luton free delivery offer" : "Luton delivery launch announcement"}
          icon={<Truck size={18} aria-hidden="true" />}
          title={
            available
              ? sundayHours
                ? "Due to popular demand: FREE delivery from 3pm to 11pm today!"
                : "Due to popular demand: FREE delivery is now available!"
              : "Due to popular demand: FREE delivery from 3pm to 11pm today!"
          }
          details={
            "Within 4 km of LU4 8NU on orders paying £15+ after discounts. " +
            "Current kitchen and driver availability is always confirmed at checkout."
          }
          actions={
            <>
              <Link to="/delivery-terms" className="md-own-driver-offer-link" onClick={() => setVisible(false)}>
                Delivery T&amp;Cs apply
              </Link>
              <Link to="/menus" className="md-own-driver-offer-link" onClick={() => setVisible(false)}>
                {available ? "Order delivery" : "Explore menus"}
              </Link>
            </>
          }
        />
      )}
    </aside>
  );
}
