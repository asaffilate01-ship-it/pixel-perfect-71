import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Truck, Gift, Smartphone, X } from "lucide-react";
import { useCustomerEntryPolicy } from "@/components/use-customer-entry-policy";
import { isMealDeckSundayDeliveryPreopen, isMealDeckSundayDeliveryService } from "@/lib/mealdeck-launch-schedule";
import "@/styles.member-banner.css";

/**
 * A brief, dismissible notice replaces the permanent full-width yellow banner.
 * It appears once per browser tab, only on marketing pages, and never blocks
 * menu customisation, basket review, payment or customer account screens.
 */
const MEMBER_NOTICE_SESSION_KEY = "mealdeck-promo-notice-seen-20261114";

function TimedMarketingNotice({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [visible, setVisible] = useState(false);
  const showOnThisPage = pathname === "/" || pathname === "/luton" || pathname === "/offers";

  useEffect(() => {
    setVisible(false);
    if (!showOnThisPage) return;
    try {
      if (window.sessionStorage.getItem(MEMBER_NOTICE_SESSION_KEY)) return;
    } catch {
      // Storage can be blocked; the notice still closes automatically.
    }
    let hideTimer: number | undefined;
    const showTimer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(MEMBER_NOTICE_SESSION_KEY, "shown");
      } catch {
        // No persistent tracking or cookies are needed for a notice.
      }
      setVisible(true);
      hideTimer = window.setTimeout(() => setVisible(false), 8_000);
    }, 1_000);
    return () => {
      window.clearTimeout(showTimer);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    };
  }, [showOnThisPage]);

  if (!visible || !showOnThisPage) return null;
  return (
    <aside className="md-member-popup" role="status" aria-label="MealDeck member benefits and delivery">
      <button
        type="button"
        className="md-member-popup-close"
        aria-label="Close MealDeck announcement"
        onClick={() => {
          setVisible(false);
          try {
            window.sessionStorage.setItem(MEMBER_NOTICE_SESSION_KEY, "dismissed");
          } catch {
            // Closing must work when browser storage is unavailable.
          }
        }}
      >
        <X size={20} aria-hidden="true" />
      </button>
      {children}
    </aside>
  );
}

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

export function OwnDriverOfferBanner() {
  const available = useOwnDriverAvailability();
  const preopen = useOwnDriverPreopenNotice();
  const sundayHours = useOwnDriverSundayServiceNotice();
  const entry = useCustomerEntryPolicy();
  // Banner timing is informational. The server entry policy is authoritative.
  const monday = entry?.serverNow && Date.parse(entry.serverNow) >= Date.parse("2026-11-09T00:00:00Z");
  if (monday) {
    return (
      <TimedMarketingNotice>
        <section className="md-own-driver-offer md-member-banner" aria-label="MealDeck member registration and delivery">
        <div className="md-member-banner-inner">
          <div className="md-member-banner-copy">
            <Gift size={18} className="md-member-banner-icon" aria-hidden="true" />
            <p>
              <strong>{entry?.emailRegistrationDeferred ? "Member registration opens today at 1pm." : "Join MealDeck for member-only offers and loyalty benefits."}</strong>{" "}
              <span>Verify your email, add your phone number, install the app and enable optional order alerts. Free direct delivery within 4 km of LU4 8NU on £15+ after discounts, subject to checkout availability.</span>
            </p>
          </div>
          <nav className="md-member-banner-actions" aria-label="Membership links">
            <Link to="/account">{entry?.emailRegistrationDeferred ? "Explore membership" : "Register"}</Link>
            <Link to="/account"><Smartphone size={15} aria-hidden="true" /> Install app</Link>
            <Link to="/delivery-terms">Delivery terms</Link>
          </nav>
        </div>
        </section>
      </TimedMarketingNotice>
    );
  }
  if (!available && !preopen) return null;
  return (
    <TimedMarketingNotice>
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
          <Link to="/delivery-terms" className="md-own-driver-offer-link">
            Delivery T&amp;Cs apply
          </Link>
          <Link to="/menus" className="md-own-driver-offer-link">
            {available ? "Order delivery" : "Explore menus"}
          </Link>
        </>
      }
    />
    </TimedMarketingNotice>
  );
}
