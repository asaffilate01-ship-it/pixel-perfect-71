import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  CarFront,
  Check,
  Clock3,
  UserRound,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Truck,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LaunchOpeningHours, OpeningWeekendOffer } from "@/components/opening-weekend-offer";
import { PwaInstallCard } from "@/components/pwa-install-card";
import { approvedBrandLogos } from "@/lib/brand-logos";
import { seo } from "@/lib/seo";
import "@/styles.first-order.css";

export const Route = createFileRoute("/meta-ad")({
  head: () =>
    seo({
      title: "Your first MealDeck order — how it works",
      description:
        "MealDeck Luton opens 6–8 November 2026: Friday 3pm–11pm, Saturday and Sunday 1pm–11pm. 30% off, no minimum. Guests welcome; collection or kerbside only.",
      path: "/meta-ad",
    }),
  component: FirstOrderExplainer,
});

const brands = [
  ["Skorch", approvedBrandLogos.skorch],
  ["Tavo", approvedBrandLogos["tavo-chicken"]],
  ["Souvano", approvedBrandLogos.souvano],
  ["Load’d", approvedBrandLogos.loadd],
  ["Moktl", approvedBrandLogos.moktl],
] as const;
const milestones = ["Order placed", "Accepted", "Preparing", "Ready", "Completed"];

function FirstOrderExplainer() {
  const [method, setMethod] = useState<"pickup" | "curbside">("pickup");
  const [deliveryNotice, setDeliveryNotice] = useState(false);
  const kerbside = method === "curbside";
  return (
    <div className="md-marketing-shell md-first-order-shell">
      <SiteHeader
        nav={false}
        context={
          <Link to="/menus" className="md-btn md-btn-yellow">
            Explore menus <ArrowRight size={18} aria-hidden="true" />
          </Link>
        }
      />
      <main>
        <section className="md-first-hero">
          <p className="md-first-eyebrow">New to MealDeck? You’re in the right place.</p>
          <h1>
            Your cravings.
            <br />
            <em>One winning hand.</em>
          </h1>
          <p className="md-first-lead">
            Five brands, one basket and one pickup. Here’s how your first MealDeck order works.
          </p>
          <div className="md-first-brands" aria-label="The five launch brands">
            {brands.map(([name, logo]) => (
              <img key={name} src={logo} alt={name} width={140} height={90} />
            ))}
          </div>
          <p className="md-first-location">Launching in Luton · 314–318 Selbourne Road, LU4 8NU</p>
          <div className="md-first-confirmed-launch">
            <p>Opening weekend · 6–8 November 2026 · UK time</p>
            <LaunchOpeningHours />
            <p className="md-first-launch-note">
              30% off everything. No minimum order. Guest checkout for our first three days.
            </p>
          </div>
          <Link to="/menus" className="md-btn md-btn-red">
            Start with the menus <ArrowRight size={19} aria-hidden="true" />
          </Link>
        </section>

        <section className="md-first-how" aria-labelledby="first-order-title">
          <div className="md-first-section-heading">
            <p className="md-first-eyebrow">A quick guide to your first order</p>
            <h2 id="first-order-title">Browse. Build. Pick up.</h2>
            <p>
              Use mealdeck.co.uk in your browser, or add the MealDeck app to your home screen. You
              can order as a guest during our opening hours on 6–8 November, or sign in as a member.
            </p>
          </div>
          <div className="md-first-methods" aria-label="Choose which pickup guide to see">
            <button
              type="button"
              aria-pressed={!kerbside}
              onClick={() => {
                setMethod("pickup");
                setDeliveryNotice(false);
              }}
            >
              <ShoppingBag size={22} aria-hidden="true" />
              <span>
                <strong>Collection</strong>
                <small>Pop in and pick up</small>
              </span>
              {!kerbside && <Check size={19} aria-hidden="true" />}
            </button>
            <button
              type="button"
              aria-pressed={kerbside}
              onClick={() => {
                setMethod("curbside");
                setDeliveryNotice(false);
              }}
            >
              <CarFront size={23} aria-hidden="true" />
              <span>
                <strong>Kerbside</strong>
                <small>We bring it to your car</small>
              </span>
              {kerbside && <Check size={19} aria-hidden="true" />}
            </button>
            <button
              type="button"
              aria-disabled="true"
              onClick={() => setDeliveryNotice(true)}
              className="is-unavailable"
            >
              <Truck size={23} aria-hidden="true" />
              <span>
                <strong>Delivery</strong>
                <small>Not available yet</small>
              </span>
            </button>
          </div>
          {deliveryNotice && (
            <p className="md-first-delivery-notice" role="status">
              Delivery is not available at the moment. Please select collection or kerbside.
            </p>
          )}

          <ol className="md-first-steps">
            <li>
              <span className="md-first-step-number" aria-hidden="true">
                01
              </span>
              <div className="md-first-step-icon">
                <Smartphone aria-hidden="true" />
              </div>
              <h3>Browse the deck.</h3>
              <p>
                Open the website or app, tap <strong>Menus</strong> and explore the live brands. Mix
                burgers, chicken, grill, loaded sides and mocktails in one basket.
              </p>
            </li>
            <li>
              <span className="md-first-step-number" aria-hidden="true">
                02
              </span>
              <div className="md-first-step-icon">
                {kerbside ? <CarFront aria-hidden="true" /> : <ShoppingBag aria-hidden="true" />}
              </div>
              <h3>Choose {kerbside ? "kerbside." : "collection."}</h3>
              <p>
                When you’re ready to order, choose your pickup method.{" "}
                {kerbside
                  ? "Tell us the car make, colour and last four characters of its registration so we can find you."
                  : "Choose collection from our Luton kitchen. You won’t be asked for a delivery address."}
              </p>
            </li>
            <li>
              <span className="md-first-step-number" aria-hidden="true">
                03
              </span>
              <div className="md-first-step-icon">
                <UserRound aria-hidden="true" />
              </div>
              <h3>Guest or member? You choose.</h3>
              <p>
                On 6–8 November, enter your <strong>name, email and mobile number</strong> to order
                as a guest without registering. Guest orders earn no loyalty points. To become a
                member, create an account and verify your email. Already a member? Sign in.
              </p>
            </li>
            <li>
              <span className="md-first-step-number" aria-hidden="true">
                04
              </span>
              <div className="md-first-step-icon">
                <ShieldCheck aria-hidden="true" />
              </div>
              <h3>Check your order. Pay securely.</h3>
              <p>
                Review every item, flavour, extra and the total before paying. Choose cutlery or
                separate numbered bags if you need them. Stripe’s secure checkout offers Apple Pay
                and Google Pay on eligible devices; your bank may ask you to approve payment.
              </p>
            </li>
            <li>
              <span className="md-first-step-number" aria-hidden="true">
                05
              </span>
              <div className="md-first-step-icon">
                <Clock3 aria-hidden="true" />
              </div>
              <h3>Follow your order.</h3>
              <p>
                After payment is confirmed, you’ll see your <strong>order number</strong> and the
                kitchen’s estimated pickup time. Follow progress as the team accepts, prepares and
                finishes your food. If ordering as a guest, keep your receipt page open on this
                device so you can return to your order.
              </p>
            </li>
            <li>
              <span className="md-first-step-number" aria-hidden="true">
                06
              </span>
              <div className="md-first-step-icon">
                <PackageCheck aria-hidden="true" />
              </div>
              <h3>{kerbside ? "Stay comfy. We’ll bring it." : "Pick up. Tuck in."}</h3>
              <p>
                {kerbside
                  ? "When your order is ready, arrive at the pickup location in the car you registered. Confirm your order number with the team at handoff."
                  : "Come to the collection point when your order is ready. Give the team your order number to collect your food."}{" "}
                Your receipt comes with your order.
              </p>
            </li>
          </ol>
        </section>

        <section className="md-first-tracking" aria-labelledby="first-tracking-title">
          <div>
            <p className="md-first-eyebrow">From our kitchen to your hands</p>
            <h2 id="first-tracking-title">Your whole order, together.</h2>
            <p>
              The progress bar follows the kitchen. Your order is only ready when every item is
              ready and the team has packed it for pickup.
            </p>
          </div>
          <div
            className="md-first-progress-example"
            aria-label="Illustration of the five order stages, not a live order"
          >
            <p>How your order progress will look</p>
            <ol>
              {milestones.map((stage, index) => (
                <li key={stage}>
                  <span aria-hidden="true">{index + 1}</span>
                  <strong>{stage}</strong>
                </li>
              ))}
            </ol>
            <small>
              Example stages · Your actual order page shows confirmed updates and your pickup
              estimate.
            </small>
          </div>
        </section>

        <div className="md-launch-story">
          <OpeningWeekendOffer />
        </div>
        <section className="md-first-account">
          <div>
            <p className="md-first-eyebrow">Make yourself at home</p>
            <h2>One account. More to look forward to.</h2>
            <p>
              Register as a member for member offers and get ready for loyalty points when the
              rewards programme launches. Offer emails and promotional app alerts are for members
              who opt in. Choose each separately — saying no does not affect the opening offer.
            </p>
            <Link to="/account" className="md-btn md-btn-red">
              Create your account <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <p className="md-first-small">
              <Link to="/privacy">Privacy and your choices</Link> · St Albans and Bedford are coming
              in a future deck.
            </p>
          </div>
          <PwaInstallCard />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
