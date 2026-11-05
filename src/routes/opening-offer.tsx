import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { OpeningWeekendOffer } from "@/components/opening-weekend-offer";
import { seo } from "@/lib/seo";
import "@/styles.launch-opening.css";

export const Route = createFileRoute("/opening-offer")({
  head: () =>
    seo({
      title: "Luton opening weekend — 30% off | MealDeck",
      description:
        "Three days only: 30% off everything, with no minimum order, for registered customers with a verified email. Luton collection or kerbside pickup only. Opening dates to be announced.",
      path: "/opening-offer",
    }),
  component: OpeningOfferPage,
});

function OpeningOfferPage() {
  return (
    <div className="md-marketing-shell">
      <SiteHeader />
      <main className="md-info-page">
        <div className="md-info-inner">
          <p className="lm-eyebrow">The Luton opening deck</p>
          <h1>Three days. Every craving. 30% off.</h1>
          <OpeningWeekendOffer compact />
          <h2>Who gets the offer?</h2>
          <p>
            Registered MealDeck customers with a verified email address. Create an account with your
            name, email and mobile number, then follow the verification link in your email. Sign in
            to that account when you order.
          </p>
          <p>
            You do not need to agree to marketing emails, allow notifications or install the app to
            qualify.
          </p>
          <h2>What is included?</h2>
          <p>
            30% off all available menu items, drinks, add-ons and meal upgrades in an eligible
            order. There is no minimum order value. The checkout shows your discount and final total
            before you pay.
          </p>
          <h2>Where and when?</h2>
          <p>
            The offer runs for three consecutive opening days at MealDeck Luton, using UK local
            time. The confirmed dates will appear above before the offer starts. It does not begin
            when you register and it does not restart for each visitor.
          </p>
          <p>
            Start secure payment while the offer is active, then complete payment before that
            checkout session expires. If the session expires, a new checkout uses the prices and
            offers available at that time.
          </p>
          <p>
            Collection and kerbside pickup only, from 314–318 Selbourne Road, Luton, LU4 8NU.
            Delivery is not included in this offer. St Albans and Bedford are coming in a future
            deck.
          </p>
          <h2>How does it work?</h2>
          <ul>
            <li>
              Choose your food from the available launch menus and sign in to your verified account.
            </li>
            <li>
              Choose collection or kerbside pickup. For kerbside, enter your car make, colour and
              the last four characters of its registration so the team can find you.
            </li>
            <li>
              During the offer dates, the eligible discount is calculated automatically at checkout.
              No code is needed.
            </li>
            <li>
              Please check your order before confirming and paying. Review every item, flavour,
              extra and quantity, and choose cutlery or numbered bags if needed.
            </li>
          </ul>
          <p>
            Mix available dishes from Skorch, Tavo, Souvano, Load’d and Moktl. Menu availability is
            confirmed at checkout.
          </p>
          <h2>Your account, your choice</h2>
          <p>
            Your account keeps your details and communication preferences together. Loyalty points
            will be available when the rewards programme and its earning rules launch. Promotional
            emails and app alerts are optional and can be switched off in{" "}
            <Link to="/account">your account</Link>.
          </p>
          <p>
            See the <Link to="/privacy">privacy notice</Link> for how MealDeck uses your details.
            MealDeck is a trading name of 313 Brands Ltd.
          </p>
          <Link to="/menus" className="md-btn md-btn-red">
            Explore the menus
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
