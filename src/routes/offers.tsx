import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CarFront, MapPin, ShoppingBag } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MealDeckOfferCards } from "@/components/marketing/offer-discovery";
import { LaunchOpeningHours } from "@/components/opening-weekend-offer";
import {
  useOwnDriverAvailability,
  useOwnDriverPreopenNotice,
  useOwnDriverSundayServiceNotice,
} from "@/components/own-driver-offer-banner";
import { seo } from "@/lib/seo";
import "@/styles.mealdeck-offers.css";

export const Route = createFileRoute("/offers")({
  head: () =>
    seo({
      title: "MealDeck Offers — 30% Off, 99p Milk Cake & Double Points",
      description:
        "30% off the entire menu, 6–8 November 2026. Milk cake 99p with every order on 8 November. Register and spend £15 or more from 9–13 November inclusive for double loyalty points.",
      path: "/offers",
    }),
  component: OffersPage,
});

function OffersPage() {
  const deliveryLive = useOwnDriverAvailability();
  const deliveryPreopen = useOwnDriverPreopenNotice();
  const sundayHours = useOwnDriverSundayServiceNotice();
  return (
    <div className="md-marketing-shell">
      <SiteHeader />
      <main className="md-offers-page">
        <div className="md-offers-page-inner">
          <header className="md-offers-page-heading">
            <p className="md-current-offers-kicker">MealDeck · November 2026</p>
            <h1>
              A little more
              <br />
              <span>on the table.</span>
            </h1>
            <p>
              30% off your opening-weekend order. A 99p Sunday treat. Double points for registered
              members spending £15 or more from Monday 9 to Friday 13 November inclusive.
            </p>
            <div className="md-offers-page-actions">
              <Link to="/menus" className="md-btn md-btn-red">
                Explore the menus <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/account" className="md-offers-text-link">
                Register for member offers <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </header>
          <MealDeckOfferCards detailed />
          <div className="md-offers-details-grid">
            <section className="md-offers-detail" aria-labelledby="offers-pickup-title">
              <p className="md-current-offers-kicker">
                <MapPin size={16} aria-hidden="true" /> Luton launches first
              </p>
              <h2 id="offers-pickup-title">Your Luton opening-weekend order</h2>
              <p>314–318 Selbourne Road, Luton, LU4 8NU.</p>
              <div className="md-offers-fulfilments">
                <span>
                  <ShoppingBag size={17} aria-hidden="true" /> Collection
                </span>
                <span>
                  <CarFront size={19} aria-hidden="true" /> Kerbside pickup
                </span>
              </div>
              <LaunchOpeningHours />
              <p className="md-offers-detail-small">
                {deliveryLive && sundayHours
                  ? "Available during Sunday's opening hours, 3pm–11pm, for Luton collection, kerbside pickup and delivery."
                  : deliveryPreopen
                    ? "Due to popular demand: FREE delivery from 3pm to 11pm today! Luton collection and kerbside pickup are also available during Sunday's opening hours."
                    : sundayHours
                      ? "Sunday's opening hours are 3pm–11pm. Collection and kerbside are available; delivery is subject to availability at checkout."
                      : "All opening times are UK local time (Europe/London). Collection, kerbside and eligible delivery depend on checkout availability."}{" "}
                Delivery is subject to the{" "}
                <Link to="/delivery-terms" className="md-offers-text-link">
                  delivery T&amp;Cs
                </Link>
                . St Albans and Bedford are coming soon.
              </p>
              <Link to="/opening-offer" className="md-offers-text-link">
                More about the 30% opening offer <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </section>
            <section className="md-offers-detail" aria-labelledby="offers-account-title">
              <p className="md-current-offers-kicker">Your account, your choice</p>
              <h2 id="offers-account-title">Join for double points.</h2>
              <p>
                You can order as a guest during the opening hours on 6–8 November. An account is not
                required for the 30% offer or Sunday’s 99p milk cake.
              </p>
              <p>
                For double loyalty points, register and spend £15 or more from Monday 9 to Friday 13
                November 2026 inclusive. Verify your email and use your MealDeck member account.
                Guest orders earn no loyalty points.
              </p>
              <p>
                Registration does not sign you up for marketing. Choose promotional emails and app
                alerts separately in your account; both are optional.
              </p>
              <Link to="/account" className="md-offers-text-link">
                My account &amp; preferences <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </section>
          </div>
          <p className="md-offers-page-note">
            Check your order and its final total before paying. The kitchen’s current ordering
            availability is shown at checkout.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
