import { useId } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Gift } from "lucide-react";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import "@/styles.mealdeck-offers.css";

/** Only verified, currently approved membership benefits are presented as active. */
export function MealDeckOfferCards({ detailed = false }: { detailed?: boolean }) {
  const Heading = detailed ? "h2" : "h3";
  return (
    <div className={`md-current-offer-grid${detailed ? " is-detailed" : ""}`}>
      <article className="md-current-offer-card" id={detailed ? "member-loyalty" : undefined}>
        <div className="md-current-offer-corner" aria-hidden="true">
          <Gift size={24} />
        </div>
        <MealDeckLogo className="md-current-offer-logo" decorative loading="lazy" />
        <p className="md-current-offer-date">MealDeck membership · From 9 November 2026</p>
        <p className="md-current-offer-value">1 pt / £1</p>
        <Heading>Earn with every eligible order.</Heading>
        <p className="md-current-offer-copy">
          Verified registered members earn one point per complete £1 paid after discounts.
          Guest orders do not earn points.
        </p>
        <p className="md-current-offer-audience">Verified registered members</p>
        {detailed ? (
          <ul className="md-current-offer-terms">
            <li>Points are issued only for eligible paid orders from 9 November 2026.</li>
            <li>Refunds, cancellations and disputes adjust earned points.</li>
            <li>Points cannot currently be spent or exchanged for cash.</li>
            <li>Marketing consent is optional and is not needed to earn points.</li>
          </ul>
        ) : (
          <Link to="/account" className="md-current-offer-link">
            See your points and benefits <ArrowRight size={17} aria-hidden="true" />
          </Link>
        )}
      </article>
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
            <p className="md-current-offers-kicker">Member benefits</p>
            <h2 id={titleId}>
              More reasons
              <br />
              to join the table.
            </h2>
            <p>
              The opening-weekend discounts and 99p milkcake promotion have finished.
              Verified members earn one point per complete £1 paid after discounts on
              eligible orders. <Link to="/account">Create your account</Link>.
            </p>
          </div>
          <Link to="/offers" className="md-btn md-btn-yellow">
            Explore member benefits <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <MealDeckOfferCards />
        <p className="md-current-offers-note">
          Points are based on eligible paid orders after discounts. Guest orders earn none;
          refunds and disputes are adjusted. Marketing preferences are optional.
        </p>
      </div>
    </section>
  );
}
