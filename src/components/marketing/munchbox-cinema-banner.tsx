import { ArrowRight, CalendarDays, Clock3, MapPin, Ticket } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import "@/styles.mealdeck-cinema-banner.css";

/**
 * Review-only presentation component. Mount publicly only after the campaign's
 * eligibility, prize availability, entry audit and draw process are approved.
 * Use original MealDeck identity; film and venue names identify the prize only.
 */
export function MunchboxCinemaBanner() {
  return (
    <section className="md-cinema-promo" aria-labelledby="md-cinema-promo-title">
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
          <h2 id="md-cinema-promo-title">Buy a Munchbox for a chance to win.</h2>
          <p className="md-cinema-promo__prize">One cinema ticket to <strong>Avengers: Doomsday</strong></p>
          <div className="md-cinema-promo__screening">
            <span><MapPin size={17} aria-hidden="true" /> Cineworld Luton</span>
            <span><CalendarDays size={17} aria-hidden="true" /> 16 December 2026</span>
            <span><Clock3 size={17} aria-hidden="true" /> 7:20pm</span>
          </div>
          <p className="md-cinema-promo__entry">Register or sign in at mealdeck.co.uk and purchase a qualifying Munchbox through our website during the promotion period to enter the draw.</p>
          <div className="md-cinema-promo__actions">
            <Link to="/account" className="md-cinema-promo__secondary">Register or sign in</Link>
            <Link to="/menus" className="md-cinema-promo__primary">Browse Munchboxes <ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
          <p className="md-cinema-promo__fine">One winner selected at random and contacted directly. Respond within 24 hours. Independent MealDeck promotion; not sponsored by or affiliated with Marvel, Disney or Cineworld. Full terms to be finalised before launch.</p>
        </div>
      </div>
    </section>
  );
}
