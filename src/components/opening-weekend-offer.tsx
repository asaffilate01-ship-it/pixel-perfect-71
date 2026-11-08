import { useEffect, useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CarFront, ShoppingBag } from "lucide-react";
import { MEALDECK_LAUNCH_DAYS } from "@/lib/mealdeck-launch-schedule";
import { useOwnDriverAvailability, useOwnDriverPreopenNotice } from "@/components/own-driver-offer-banner";
import "@/styles.launch-opening.css";

type PublicOffer = {
  status: "unscheduled" | "upcoming" | "active" | "ended";
  startsAt: string | null;
  endsAt: string | null;
  timezone: "Europe/London";
};

const unscheduled: PublicOffer = {
  status: "unscheduled",
  startsAt: null,
  endsAt: null,
  timezone: "Europe/London",
};

function validOffer(value: unknown): value is PublicOffer {
  if (!value || typeof value !== "object") return false;
  const offer = value as Partial<PublicOffer>;
  if (
    !(["unscheduled", "upcoming", "active", "ended"] as const).includes(
      offer.status as PublicOffer["status"],
    )
  )
    return false;
  if (offer.timezone !== "Europe/London") return false;
  if (offer.status === "unscheduled") return offer.startsAt === null && offer.endsAt === null;
  return (
    typeof offer.startsAt === "string" &&
    Number.isFinite(Date.parse(offer.startsAt)) &&
    typeof offer.endsAt === "string" &&
    Number.isFinite(Date.parse(offer.endsAt)) &&
    Date.parse(offer.endsAt) > Date.parse(offer.startsAt)
  );
}

export function LaunchOpeningHours({ className = "" }: { className?: string }) {
  return (
    <dl
      className={`md-launch-opening-hours ${className}`.trim()}
      aria-label="Luton opening hours, UK time"
    >
      {MEALDECK_LAUNCH_DAYS.map((day) => (
        <div key={day.date}>
          <dt>
            <time dateTime={day.date}>{day.label}</time>
          </dt>
          <dd>{day.hoursLabel}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OpeningWeekendOffer({ compact = false }: { compact?: boolean }) {
  const deliveryLive = useOwnDriverAvailability();
  const deliveryPreopen = useOwnDriverPreopenNotice();
  const [offer, setOffer] = useState<PublicOffer>(unscheduled);
  const headingId = useId();
  useEffect(() => {
    const abort = new AbortController();
    // Confirmed opening hours are public information. Only the server can say
    // whether the promotion has finished; browser time never grants a discount.
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void fetch("/api/checkout", { signal: abort.signal, cache: "no-store" })
        .then(async (response) => (response.ok ? (response.json() as Promise<unknown>) : null))
        .then((value) => {
          const next =
            value && typeof value === "object" && "openingOffer" in value
              ? value.openingOffer
              : null;
          if (validOffer(next)) setOffer(next);
        })
        .catch(() => {
          /* Checkout rechecks eligibility against the server clock. */
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      abort.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, []);

  if (offer.status === "ended") {
    return (
      <section
        className={`md-opening-offer md-opening-offer-ended${compact ? " is-compact" : ""}`}
        aria-labelledby={headingId}
      >
        <div>
          <p className="md-opening-kicker">Thanks for joining the first deck</p>
          <h2 id={headingId}>Opening weekend has finished.</h2>
          <p>
            Register for member offers and choose which offer alerts you receive. Guest orders earn
            no loyalty points. Marketing updates are always your choice.
          </p>
        </div>
        <Link to="/account" className="md-opening-cta">
          My account <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    );
  }

  return (
    <section
      className={`md-opening-offer${compact ? " is-compact" : ""}`}
      aria-labelledby={headingId}
    >
      <div className="md-opening-value" aria-hidden="true">
        <b>
          30<span>%</span>
        </b>
        <strong>OFF EVERYTHING</strong>
      </div>
      <div className="md-opening-body">
        <p className="md-opening-kicker">Luton opening weekend · 3 days only</p>
        <h2 id={headingId}>
          {compact ? "30% off everything." : "Opening weekend. 30% off everything."}
        </h2>
        <p className="md-opening-condition">
          {deliveryLive
            ? "No minimum for collection or kerbside. Free local delivery within 4 km requires £15 payable after discounts."
            : deliveryPreopen
              ? "Due to popular demand: FREE delivery from 3pm to 11pm today! Within 4 km of LU4 8NU, with £15 minimum after discounts. Collection and kerbside have no minimum."
              : "No minimum order for collection or kerbside. Guests and members welcome."}
        </p>
        <div className="md-opening-methods" aria-label="Available fulfilment methods">
          <span>
            <ShoppingBag size={16} aria-hidden="true" /> Collection
          </span>
          <span>
            <CarFront size={18} aria-hidden="true" /> Kerbside
          </span>
          {deliveryLive && <span>Free delivery · within 4 km · £15 after discount</span>}
        </div>
        <p className="md-opening-dates">6–8 November 2026 · UK time</p>
        <LaunchOpeningHours />
        <p className="md-opening-guest-note">
          Order without registering. Guest orders earn no loyalty points.
        </p>
      </div>
      <div className="md-opening-actions">
        <Link to="/menus" className="md-opening-cta">
          Explore menus <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <Link to="/opening-offer" className="md-opening-terms">
          Offer details
        </Link>
        <Link to="/offers" className="md-opening-terms">
          All three offers
        </Link>
      </div>
    </section>
  );
}
