import { useId } from "react";
import { ArrowRight, CalendarDays, Clock3, MapPin, Ticket } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import { useCinemaPromotion } from "./use-cinema-promotion";
import type { CinemaPromoSnapshot } from "@/lib/mealdeck-cinema-promotion";
import "@/styles.mealdeck-cinema-banner.css";

function CinemaTerms({ snapshot }: { snapshot: CinemaPromoSnapshot }) {
  if (!snapshot.terms || !snapshot.eligibleProducts.length) return null;
  return (
    <details className="md-cinema-promo__terms">
      <summary>Full promotion terms &amp; eligible products</summary>
      <p>Promoter: 313 Brands Ltd trading as MealDeck, 314–318 Selbourne Road, Luton, LU4 8NU.</p>
      <p>Qualifying purchases: midnight at the start of 3 December through the end of 6 December 2026, UK time. Purchases made during the teaser do not qualify.</p>
      <p><strong>Eligible products:</strong> {snapshot.eligibleProducts.join(", ")}.</p>
      <p className="md-cinema-promo__approved-terms">{snapshot.terms}</p>
      <p>See our <Link to="/privacy">privacy notice</Link>. Marketing consent is optional; any winner filming must be separately agreed.</p>
    </details>
  );
}

/** Public advertising only. Paid-order reconciliation and the draw are separate.
 * A fresh server response, reviewed catalogue IDs and explicit operator approval
 * are required before this component displays promotional content.
 */
export function MunchboxCinemaBanner({ showClosedTerms = false }: { showClosedTerms?: boolean }) {
  const snapshot = useCinemaPromotion();
  const titleId = useId();
  if (!snapshot?.approved || !snapshot.terms || !snapshot.eligibleProducts.length || snapshot.phase === "hidden") return null;
  if (snapshot.phase === "ended") {
    return showClosedTerms ? (
      <section className="md-cinema-promo-closed" aria-labelledby={titleId}>
        <h2 id={titleId}>Munchbox cinema draw — entries closed</h2>
        <p>Entries closed at midnight at the end of 6 December 2026. No further purchases qualify.</p>
        <CinemaTerms snapshot={snapshot} />
      </section>
    ) : null;
  }
  const teaser = snapshot.phase === "teaser";
  return (
    <section className="md-cinema-promo" aria-labelledby={titleId} data-promo-phase={snapshot.phase}>
      <div className="md-cinema-promo__inner">
        <div className="md-cinema-promo__brand">
          <MealDeckLogo className="md-cinema-promo__logo" />
          <span className="md-cinema-promo__eyebrow">MealDeck prize draw</span>
          <div className="md-cinema-promo__ticket" aria-hidden="true">
            <Ticket size={44} strokeWidth={1.7} />
            <span>1 cinema ticket</span>
          </div>
        </div>
        <div className="md-cinema-promo__copy">
          <p className="md-cinema-promo__dates"><CalendarDays size={18} aria-hidden="true" /> 3–6 December 2026 inclusive</p>
          <p className="md-cinema-promo__phase">{teaser ? "COMING SOON · ENTRIES OPEN AT MIDNIGHT" : "NOW OPEN · ENDS MIDNIGHT SUNDAY"}</p>
          <h2 id={titleId}>{teaser ? "Your Munchbox cinema giveaway starts at midnight." : "Buy a Munchbox for a chance to win!"}</h2>
          <p className="md-cinema-promo__prize">Win one cinema ticket to <strong>Avengers: Doomsday</strong></p>
          <div className="md-cinema-promo__screening">
            <span><MapPin size={17} aria-hidden="true" /> Cineworld Luton</span>
            <span><CalendarDays size={17} aria-hidden="true" /> 16 December 2026</span>
            <span><Clock3 size={17} aria-hidden="true" /> 7:20pm</span>
          </div>
          <p className="md-cinema-promo__entry">{teaser
            ? "Register or sign in now. Only qualifying paid website orders placed from 12:00am on 3 December until the end of 6 December enter the draw."
            : "Register or sign in and purchase a qualifying Munchbox through our website before midnight at the end of Sunday 6 December to enter the draw."}</p>
          <div className="md-cinema-promo__actions">
            <Link to="/account" className={teaser ? "md-cinema-promo__primary" : "md-cinema-promo__secondary"}>{teaser ? "Register before entries open" : "Register or sign in"}</Link>
            {!teaser && <Link to="/menus" className="md-cinema-promo__primary">Click Here to Order <ArrowRight size={18} aria-hidden="true" /></Link>}
          </div>
          <p className="md-cinema-promo__fine">One winner selected at random and contacted directly. Respond within 24 hours. Independent MealDeck promotion; not sponsored by or affiliated with Marvel, Disney or Cineworld.</p>
          <CinemaTerms snapshot={snapshot} />
        </div>
      </div>
    </section>
  );
}
