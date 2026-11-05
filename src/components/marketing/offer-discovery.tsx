import { useId } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays } from "lucide-react";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import { suitArtwork } from "@/lib/food-suit-artwork";
import { MEALDECK_OFFERS } from "@/lib/mealdeck-offers";
import "@/styles.mealdeck-offers.css";

export function MealDeckOfferCards({ detailed = false }: { detailed?: boolean }) {
  const Heading = detailed ? "h2" : "h3";
  return (
    <div className={`md-current-offer-grid${detailed ? " is-detailed" : ""}`}>
      {MEALDECK_OFFERS.map((offer) => (
        <article
          id={detailed ? offer.id : undefined}
          key={offer.id}
          className="md-current-offer-card"
        >
          <div className="md-current-offer-corner" aria-hidden="true">
            <strong>{offer.rank}</strong>
            <img src={suitArtwork[offer.suit]} alt="" />
          </div>
          <MealDeckLogo className="md-current-offer-logo" decorative loading="lazy" />
          <p className="md-current-offer-date">
            <CalendarDays size={16} aria-hidden="true" />
            {offer.dateLabel}
          </p>
          <p className="md-current-offer-value">{offer.value}</p>
          <Heading>{offer.title}</Heading>
          <p className="md-current-offer-copy">{offer.description}</p>
          <p className="md-current-offer-audience">{offer.audience}</p>
          {detailed ? (
            <ul className="md-current-offer-terms">
              {offer.terms.map((term) => (
                <li key={term}>{term}</li>
              ))}
            </ul>
          ) : (
            <Link
              to="/offers"
              hash={offer.id}
              className="md-current-offer-link"
              aria-label={`${offer.title}: offer details`}
            >
              Offer details <ArrowRight size={17} aria-hidden="true" />
            </Link>
          )}
        </article>
      ))}
    </div>
  );
}

export function OfferDiscovery() {
  const titleId = useId();
  return (
    <section id="offers" className="md-current-offers" aria-labelledby={titleId}>
      <div className="md-current-offers-inner">
        <div className="md-current-offers-heading">
          <div>
            <p className="md-current-offers-kicker">The opening-week offers</p>
            <h2 id={titleId}>
              Three good reasons
              <br />
              to join the table.
            </h2>
            <p>Your MealDeck offers for November. Luton collection or kerbside pickup.</p>
          </div>
          <Link to="/offers" className="md-btn md-btn-yellow">
            See all offer details <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <MealDeckOfferCards />
        <p className="md-current-offers-note">
          The 30% opening offer and Sunday’s 99p milk cake welcome guests and members. Register for
          double loyalty points; marketing updates are always optional.
        </p>
      </div>
    </section>
  );
}
