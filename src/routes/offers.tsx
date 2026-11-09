import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CarFront, Gift, MapPin, ShoppingBag } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useOwnDriverAvailability } from "@/components/own-driver-offer-banner";
import { seo } from "@/lib/seo";
import "@/styles.mealdeck-offers.css";

export const Route = createFileRoute("/offers")({
  head: () =>
    seo({
      title: "MealDeck member benefits & loyalty | Offers",
      description:
        "Opening-weekend discounts have ended. Verified MealDeck members earn one loyalty point per complete £1 paid after discounts on eligible orders. Browse current menus and member benefits.",
      path: "/offers",
    }),
  component: OffersPage,
});

function OffersPage() {
  const deliveryAvailable = useOwnDriverAvailability();
  return (
    <div className="md-marketing-shell">
      <SiteHeader />
      <main className="md-offers-page">
        <div className="md-offers-page-inner">
          <header className="md-offers-page-heading">
            <p className="md-current-offers-kicker">MealDeck · Member benefits</p>
            <h1>
              More to enjoy.
              <br />
              <span>Every order counts.</span>
            </h1>
            <p>
              Our opening-weekend 30% discount and Sunday 99p milkcake promotion have ended.
              Browse current menus, register for points and check this page for future offers
              when they are officially available.
            </p>
            <div className="md-offers-page-actions">
              <Link to="/account" className="md-btn md-btn-red">
                Register or view your points <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/menus" className="md-offers-text-link">
                Order from the menus <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </header>
          <div className="md-offers-details-grid">
            <section className="md-offers-detail" aria-labelledby="offers-loyalty-title">
              <p className="md-current-offers-kicker"><Gift size={16} aria-hidden="true" /> MealDeck membership</p>
              <h2 id="offers-loyalty-title">£1 paid = 1 loyalty point.</h2>
              <p>
                From 9 November 2026, registered members with a verified email earn one point
                for each complete £1 actually paid after discounts on eligible orders.
                You can view your balance in your account.
              </p>
              <p>
                Guest orders earn no points. Refunds, cancellations and disputes can remove
                points. Points cannot currently be redeemed for cash or purchases.
              </p>
              <p>
                Marketing messages are optional. Joining and earning points never require
                permission for promotional emails, WhatsApp, SMS or app alerts.
              </p>
              <Link to="/account" className="md-offers-text-link">
                My membership &amp; preferences <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </section>
            <section className="md-offers-detail" aria-labelledby="offers-luton-title">
              <p className="md-current-offers-kicker"><MapPin size={16} aria-hidden="true" /> Luton</p>
              <h2 id="offers-luton-title">Order your favourites.</h2>
              <p>314–318 Selbourne Road, Luton, LU4 8NU.</p>
              <div className="md-offers-fulfilments">
                <span><ShoppingBag size={17} aria-hidden="true" /> Collection</span>
                <span><CarFront size={19} aria-hidden="true" /> Kerbside</span>
              </div>
              <p className="md-offers-detail-small">
                {deliveryAvailable
                  ? "Free own-driver delivery may be available within 4 km of LU4 8NU for orders of £15 or more after discounts."
                  : "Delivery may be unavailable at present."}
                {" "}Kitchen opening, menu availability and eligible fulfilment are confirmed at checkout.
                See the{" "}
                <Link to="/delivery-terms" className="md-offers-text-link">
                  delivery terms
                </Link>.
              </p>
              <Link to="/menus" className="md-offers-text-link">
                Browse current menus <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </section>
          </div>
          <p className="md-offers-page-note">
            The 6–8 November opening promotion is no longer redeemable. Its historical terms
            remain available on the{" "}
            <Link to="/opening-offer" className="md-offers-text-link">
              opening offer information page
            </Link>. Any future limited-time deal will have its own published dates and conditions.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
