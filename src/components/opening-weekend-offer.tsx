import { useEffect, useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CarFront, ShoppingBag } from "lucide-react";
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

function offerDates(offer: PublicOffer) {
  if (!offer.startsAt || !offer.endsAt) return "Opening dates announced soon";
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
  return `${formatter.format(new Date(offer.startsAt))}–${formatter.format(new Date(Date.parse(offer.endsAt) - 1))} · UK time`;
}

export function OpeningWeekendOffer({ compact = false }: { compact?: boolean }) {
  const [offer, setOffer] = useState<PublicOffer>(unscheduled);
  const headingId = useId();
  useEffect(() => {
    const abort = new AbortController();
    // The server supplies the promotion's clock and schedule. Browser time
    // cannot extend the offer or make an unscheduled campaign active.
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
            Keep your account ready for future offers. Marketing updates are always your choice.
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
          No minimum order. Registered customers with a verified email.
        </p>
        <div className="md-opening-methods" aria-label="Collection or kerbside pickup only">
          <span>
            <ShoppingBag size={16} aria-hidden="true" /> Collection
          </span>
          <span>
            <CarFront size={18} aria-hidden="true" /> Kerbside only
          </span>
        </div>
        <p className="md-opening-dates">
          {offer.status === "active" ? "Opening offer is on · " : ""}
          {offerDates(offer)}
        </p>
      </div>
      <div className="md-opening-actions">
        <Link to="/account" className="md-opening-cta">
          Register for launch <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <Link to="/opening-offer" className="md-opening-terms">
          Offer details
        </Link>
      </div>
    </section>
  );
}
