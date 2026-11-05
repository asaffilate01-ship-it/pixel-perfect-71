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
        "6–8 November 2026: 30% off everything, no minimum. Friday 3pm–11pm, Saturday and Sunday 1pm–11pm. Guests and members welcome. Luton collection or kerbside only.",
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
            Guests and registered MealDeck members can use the opening offer during the hours shown
            above. On 6–8 November, you can order without creating an account. We still ask for your
            name, email and mobile number to prepare and fulfil your order.
          </p>
          <p>
            Guest orders earn no loyalty points and do not sign you up for member offers,
            promotional emails or app alerts. After the opening weekend, sign in to a verified
            member account to place a new order.
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
            MealDeck Luton opens on Friday 6 November 2026 from 3pm to 11pm, Saturday 7 November
            from 1pm to 11pm, and Sunday 8 November from 1pm to 11pm. All times are UK local time.
            The opening offer and guest checkout apply during these hours; both pause when we close
            each night. The offer does not restart when you visit or register.
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
              Choose your food from the available launch menus. During opening weekend, continue as
              a guest or sign in to your verified member account.
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
            Register and verify your email to access member offers. To receive offer emails or
            promotional app alerts, members must opt in to each channel separately. These choices
            are optional and can be switched off in <Link to="/account">your account</Link>.
          </p>
          <p>
            Loyalty points will be available to registered members when the rewards programme and
            its earning rules launch. Guest orders earn no loyalty points. Choosing not to receive
            marketing does not affect an eligible opening discount or loyalty membership.
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
