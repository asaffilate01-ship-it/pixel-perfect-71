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
import { PwaInstallCard } from "@/components/pwa-install-card";
import { approvedBrandLogos } from "@/lib/brand-logos";
import { MEALDECK_LUTON_WEEKLY_HOURS } from "@/lib/mealdeck-launch-schedule";
import { seo } from "@/lib/seo";
import "@/styles.first-order.css";

export const Route = createFileRoute("/meta-ad")({
  head: () =>
    seo({
      title: "Your first MealDeck order — how it works",
      description: "Order from five MealDeck brands in one basket. Guests welcome; collection, kerbside or eligible free local delivery in Luton.",
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
const collectionMilestones = ["Order placed", "Accepted", "Preparing", "Ready", "Completed"];
const deliveryMilestones = ["Order placed", "Accepted", "Preparing", "Packed", "With driver", "Delivered"];

function FirstOrderExplainer() {
  const [method, setMethod] = useState<"pickup" | "curbside" | "delivery">("pickup");
  const kerbside = method === "curbside";
  const delivery = method === "delivery";
  const milestones = delivery ? deliveryMilestones : collectionMilestones;
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
            Five brands, one basket. Here’s how your first MealDeck order works.
          </p>
          <div className="md-first-brands" aria-label="The five MealDeck brands">
            {brands.map(([name, logo]) => (
              <img key={name} src={logo} alt={name} width={140} height={90} />
            ))}
          </div>
          <p className="md-first-location">MealDeck Luton · 314–318 Selbourne Road, LU4 8NU</p>
          <div className="md-first-confirmed-launch">
            <p>Opening hours · UK time</p>
            <dl aria-label="Luton weekly opening hours">
              {MEALDECK_LUTON_WEEKLY_HOURS.map((row) => (
                <div key={row.shortDays}>
                  <dt>{row.shortDays}</dt>
                  <dd>{row.hoursLabel}</dd>
                </div>
              ))}
            </dl>
            <p className="md-first-launch-note">
              Guests and members welcome. Free local delivery within 4 km on £15+ after
              discounts, subject to live availability at checkout.
            </p>
          </div>
          <Link to="/menus" className="md-btn md-btn-red">
            Start with the menus <ArrowRight size={19} aria-hidden="true" />
          </Link>
        </section>

        <section className="md-first-how" aria-labelledby="first-order-title">
          <div className="md-first-section-heading">
            <p className="md-first-eyebrow">A quick guide to your first order</p>
            <h2 id="first-order-title">Browse. Build. Enjoy.</h2>
            <p>
              Use mealdeck.co.uk in your browser, or add the MealDeck app to your home screen. You
              can order as a guest during opening hours, or sign in as a member.
            </p>
          </div>
          <div className="md-first-methods" role="group" aria-label="Choose an order method guide">
            <button
              type="button"
              aria-pressed={method === "pickup"}
              onClick={() => setMethod("pickup")}
            >
              <ShoppingBag size={22} aria-hidden="true" />
              <span>
                <strong>Collection</strong>
                <small>Pop in and pick up</small>
              </span>
              {method === "pickup" && <Check size={19} aria-hidden="true" />}
            </button>
            <button
              type="button"
              aria-pressed={kerbside}
              onClick={() => setMethod("curbside")}
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
              aria-pressed={delivery}
              onClick={() => setMethod("delivery")}
            >
              <Truck size={23} aria-hidden="true" />
              <span>
                <strong>Delivery</strong>
                <small>Check eligibility</small>
              </span>
              {delivery && <Check size={19} aria-hidden="true" />}
            </button>
          </div>
          {delivery && (
            <p className="md-first-delivery-notice" role="status">
              Free local delivery is offered within 4 km of LU4 8NU on £15+ after discounts.
              Enter your postcode at checkout to confirm live kitchen and driver availability.{" "}
              <Link to="/menus">Browse menus</Link>.
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
                {delivery ? <Truck aria-hidden="true" /> : kerbside ? <CarFront aria-hidden="true" /> : <ShoppingBag aria-hidden="true" />}
              </div>
              <h3>Choose {delivery ? "delivery." : kerbside ? "kerbside." : "collection."}</h3>
              <p>
                Choose how you want to receive your order at checkout.{" "}
                {delivery
                  ? "Enter your postcode and delivery address. Free local delivery is subject to the 4 km area, £15 minimum after discounts and live kitchen and driver availability."
                  : kerbside
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
                When guest checkout is available, enter your <strong>name and WhatsApp number</strong>.
                No email registration is required for a guest order, and guests earn no loyalty
                points. To become a member, create an account and verify your email. Already a member? Sign in.
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
                After payment is confirmed, your <strong>order number</strong> and confirmed progress
                appear on the private order page. {delivery
                  ? "Follow kitchen preparation and the driver's verified handover stages. Live GPS is not available."
                  : "Follow kitchen preparation and collection updates."} Guests should keep the receipt page
                available on the same device.
              </p>
            </li>
            <li>
              <span className="md-first-step-number" aria-hidden="true">
                06
              </span>
              <div className="md-first-step-icon">
                <PackageCheck aria-hidden="true" />
              </div>
              <h3>{delivery ? "Receive your delivery." : kerbside ? "Stay comfy. We’ll bring it." : "Pick up. Tuck in."}</h3>
              <p>
                {delivery
                  ? "Keep your phone available and use the confirmation code shown on your order when receiving your food."
                  : kerbside
                    ? "When your order is ready, arrive at the pickup location in the car you registered. Confirm your collection code with the team at handoff."
                    : "Come to the collection point when your order is ready. Give the team your collection code to collect your food."}{" "}
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
              ready and the team has packed it for your chosen order method.
            </p>
          </div>
          <div
            className="md-first-progress-example"
            aria-label="Illustration of order stages, not a live order"
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
              Example stages · Your actual order page shows confirmed kitchen and handover updates.
            </small>
          </div>
        </section>

        <section className="md-first-account">
          <div>
            <p className="md-first-eyebrow">Make yourself at home</p>
            <h2>One account. More to look forward to.</h2>
            <p>
              Verified members earn one loyalty point per complete £1 paid after discounts on
              eligible orders. Guest orders earn no points. Offer emails and promotional app
              alerts are separate, optional choices.
            </p>
            <Link to="/account" className="md-btn md-btn-red">
              Create your account <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <p className="md-first-small">
              <Link to="/offers">See member benefits</Link> ·{" "}
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
