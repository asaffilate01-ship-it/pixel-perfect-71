import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { readPublicDeliveryAvailability } from "@/lib/mealdeck-public-delivery-status";
import { Gift, Smartphone, X } from "lucide-react";
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
  const query = useQuery({
    queryKey: ["mealdeck-public-delivery-availability", "luton"],
    queryFn: ({ signal }) => readPublicDeliveryAvailability(signal),
    enabled: typeof window !== "undefined",
    staleTime: 10_000,
    gcTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    networkMode: "always",
    retry: false,
  });
  return query.isSuccess && query.data === true;
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Do not mount the polling/entry-policy hooks on menus, checkout, or account
  // merely because the shared header renders there.
  if (pathname !== "/" && pathname !== "/luton" && pathname !== "/offers") return null;
  return <MembershipNotice />;
}

function MembershipNotice() {
  const entry = useCustomerEntryPolicy();
  // Preserve the original server-owned registration gate; never advertise
  // deferred registration or fall back to launch-weekend copy.
  if (!entry || entry.emailRegistrationDeferred) return null;
  return (
    <TimedMarketingNotice>
      <section className="md-own-driver-offer md-member-banner" aria-label="MealDeck membership and delivery">
        <div className="md-member-banner-inner">
          <div className="md-member-banner-copy">
            <Gift size={18} className="md-member-banner-icon" aria-hidden="true" />
            <p>
              <strong>Join MealDeck for member-only offers and loyalty benefits.</strong>{" "}
              <span>Verified members earn points on eligible paid orders. Guest checkout remains available. App installation and order alerts are optional. Check local delivery availability at checkout.</span>
            </p>
          </div>
          <nav className="md-member-banner-actions" aria-label="Membership links">
            <Link to="/account">Register or sign in</Link>
            <Link to="/account"><Smartphone size={15} aria-hidden="true" /> Install app</Link>
            <Link to="/delivery-terms">Delivery terms</Link>
          </nav>
        </div>
      </section>
    </TimedMarketingNotice>
  );
}
