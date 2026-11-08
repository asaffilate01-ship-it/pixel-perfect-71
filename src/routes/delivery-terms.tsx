import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { seo } from "@/lib/seo";
import "@/styles.launch-opening.css";

export const Route = createFileRoute("/delivery-terms")({
  head: () =>
    seo({
      title: "Free Luton Delivery — Terms & Conditions | MealDeck",
      description:
        "MealDeck Luton free own-driver delivery terms: available postcodes within 4 km of LU4 8NU, £15 minimum after discounts, delivery times and address requirements.",
      path: "/delivery-terms",
    }),
  component: DeliveryTermsPage,
});

function DeliveryTermsPage() {
  return (
    <div className="md-marketing-shell">
      <SiteHeader />
      <main className="md-info-page">
        <div className="md-info-inner">
          <p className="lm-eyebrow">MealDeck Luton · Own-driver delivery</p>
          <h1>Free local delivery — terms &amp; conditions.</h1>
          <p>
            Due to popular demand, free delivery is offered from the MealDeck Luton kitchen at
            314–318 Selbourne Road, Luton, LU4 8NU, when delivery is shown as available at checkout.
          </p>

          <h2>Where do we deliver?</h2>
          <p>
            Eligible destination postcodes must be within a 4 km straight-line radius of LU4 8NU.
            We check the postcode area using postcode coordinates, not driving distance. Enter your
            full postcode at checkout to check whether your address qualifies. If it is outside our
            current area, you can choose collection or kerbside pickup instead.
          </p>

          <h2>Minimum order and delivery fee</h2>
          <p>
            Delivery is free (£0 delivery charge) with a minimum payable order total of £15.00
            <strong> after all discounts and offers</strong>. For example, when the 30% opening
            discount applies, the total after that discount must still be at least £15.00.
            If your final total is lower, add more items or choose collection or kerbside pickup,
            which have no delivery minimum.
          </p>

          <h2>Opening hours and availability</h2>
          <p>
            On Sunday 8 November 2026, the Luton kitchen's opening hours are
            <strong> 3pm–11pm UK time</strong>. Collection, kerbside pickup and eligible delivery
            are offered during applicable opening hours only when the corresponding method is
            available at checkout. Kitchen availability may change during service.
          </p>

          <h2>Address and contact details</h2>
          <p>
            You may check out as a guest. For delivery, provide your name, contact number,
            postcode, house or door number, road name and any relevant flat or building
            information. We use these details to prepare and hand over your order.
          </p>

          <h2>Delivery estimate</h2>
          <p>
            The checkout provides an estimated delivery time of up to 60 minutes from verified
            payment. This is a service estimate, not live GPS courier tracking. You can follow
            the order's preparation and handover status using your order confirmation.
          </p>

          <h2>Checkout and alternatives</h2>
          <p>
            The website checks eligibility, discounts and final payable amount before payment.
            If delivery is not offered for your postcode or order, collection and kerbside pickup
            remain available when the kitchen is accepting orders. Please check every item,
            address and contact detail before confirming payment.
          </p>
          <p>
            MealDeck is a trading name of 313 Brands Ltd. For details about how your order and
            address information are handled, read our <Link to="/privacy">privacy notice</Link>.
          </p>
          <Link to="/menus" className="md-btn md-btn-red">
            Explore menus
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
