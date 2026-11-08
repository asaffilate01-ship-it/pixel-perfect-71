import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { OpeningWeekendOffer } from "@/components/opening-weekend-offer";
import { useOwnDriverAvailability, useOwnDriverPreopenNotice } from "@/components/own-driver-offer-banner";
import { MEALDECK_LAUNCH_HOURS_PROSE } from "@/lib/mealdeck-launch-schedule";
import { seo } from "@/lib/seo";
import "@/styles.launch-opening.css";

export const Route = createFileRoute("/opening-offer")({
  head: () =>
    seo({
      title: "Luton opening weekend — 30% off | MealDeck",
      description: `6–8 November 2026: 30% off everything, no minimum. ${MEALDECK_LAUNCH_HOURS_PROSE} Guests and members welcome. Luton pickup or eligible free local own-driver delivery.`,
      path: "/opening-offer",
    }),
  component: OpeningOfferPage,
});

function OpeningOfferPage() {
  const deliveryLive = useOwnDriverAvailability();
  const deliveryPreopen = useOwnDriverPreopenNotice();
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
            name and WhatsApp number to prepare and fulfil your order.
          </p>
          <p>
            Guest orders earn no loyalty points and do not sign you up for member offers,
            promotional emails or app alerts. Guest checkout also remains available for subsequent
            orders during kitchen opening hours; registration is optional.
          </p>
          <p>
            You do not need to agree to marketing emails, allow notifications or install the app to
            qualify.
          </p>
          <h2>What is included?</h2>
          <p>
            30% off all available menu items, drinks, add-ons and meal upgrades in an eligible
            order.{" "}
            {deliveryLive
              ? "Collection and kerbside have no minimum; free driver delivery within 3 km of LU4 8NU requires £15 payable after all discounts."
              : deliveryPreopen
                ? "Collection and kerbside have no minimum. Due to popular demand: FREE delivery from 3pm to 11pm today! Available within 3 km of LU4 8NU, with a £15 minimum payable after all discounts."
                : "Collection and kerbside pickup have no minimum order value."}{" "}
            The checkout shows your discount and final total before you pay.
          </p>
          <h2>Where and when?</h2>
          <p>
            MealDeck Luton opening weekend, 6–8 November 2026: {MEALDECK_LAUNCH_HOURS_PROSE} The
            opening offer applies during these hours and pauses when we close each night. Guest
            checkout continues whenever online ordering is open. The discount does not restart when
            you visit or register.
          </p>
          <p>
            Start secure payment while the offer is active, then complete payment before that
            checkout session expires. If the session expires, a new checkout uses the prices and
            offers available at that time.
          </p>
          <p>
            {deliveryLive
              ? "Due to popular demand, free delivery within 3 km of LU4 8NU for orders worth £15+ after discount, using our own driver. Collection and kerbside are also available at 314–318 Selbourne Road."
              : deliveryPreopen
                ? "Due to popular demand: FREE delivery from 3pm to 11pm today! Within 3 km of LU4 8NU for orders paying £15+ after discounts. Collection and kerbside pickup are available during Sunday's opening hours. Delivery T&Cs apply."
                : "Collection and kerbside pickup are available from 314–318 Selbourne Road, Luton, LU4 8NU."}{" "}
            St Albans and Bedford are coming in a future deck.
          </p>
          <h2>How does it work?</h2>
          <ul>
            <li>
              Choose your food from the available launch menus. During opening weekend, continue as
              a guest or sign in to your verified member account.
            </li>
            <li>
              {deliveryLive
                ? "Choose free local delivery, collection or kerbside. Delivery requires a postcode within 3 km, full street address, name and phone number; the minimum is £15 after discount."
                : "Choose collection or kerbside pickup."}{" "}
              For kerbside, enter your car make, colour and the last four characters of its
              registration so the team can find you.
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
            Register and spend £15 or more from Monday 9 to Friday 13 November 2026 inclusive for
            double loyalty points. Guest orders earn no loyalty points. Choosing not to receive
            marketing does not affect an eligible opening discount or member offer.
          </p>
          <h2>More on the table</h2>
          <p>
            Milk cake is 99p with every order on Sunday 8 November 2026. See
            <Link to="/offers"> all three MealDeck offers</Link> for the dates and details.
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
