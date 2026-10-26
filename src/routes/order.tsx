import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bike,
  Clock3,
  Crown,
  MapPin,
  MessageCircle,
  Phone,
  Share2,
  ShoppingBasket,
  Smartphone,
  Users,
  WalletCards,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ldScript, orgJsonLd, seo } from "@/lib/seo";

export const Route = createFileRoute("/order")({
  head: () => ({
    ...seo({
      title: "MealDeck — Coming Soon to a Table Near You",
      description:
        "MealDeck is coming soon to Luton, St Albans and Bedford. One basket across brands, one delivery fee, group ordering, offers and loyalty points from day one.",
      path: "/order",
      keywords:
        "MealDeck coming soon, food delivery Luton, food delivery St Albans, food delivery Bedford, multi brand food delivery",
    }),
    scripts: [ldScript(orgJsonLd)],
  }),
  component: ComingSoonPage,
});

const landingSpots = [
  {
    town: "Luton",
    to: "/luton" as const,
    status: "In the shuffle",
    copy: "5pm–11pm, Monday to Sunday. Delivery, pickup and kerbside.",
    cta: "Explore Luton",
  },
  {
    town: "St Albans",
    to: "/st-albans" as const,
    status: "In the shuffle",
    copy: "Monday to Friday, 09:00–16:00. Delivery, kerbside, pickup and dine in at Café 1.",
    cta: "Explore St Albans",
  },
  {
    town: "Bedford",
    to: "/bedford" as const,
    status: "Being dealt now",
    copy: "Launch details for Bedford are confirmed on its MealDeck page.",
    cta: "Explore Bedford",
  },
];

const hand = [
  { n: "01", title: "Mix your cuisines", copy: "Build one basket from different MealDeck brands." },
  { n: "02", title: "One delivery fee", copy: "Order from several brands and pay a single delivery fee." },
  { n: "03", title: "Group ordering", copy: "Invite everyone, let them add their own food and split payments." },
  { n: "04", title: "Track it together", copy: "Follow the whole handoff from preparation to your door." },
];

const channels = [
  { icon: MessageCircle, suit: "♣", title: "WhatsApp", copy: "Message, choose and order." },
  { icon: Share2, suit: "♦", title: "Website", copy: "The complete deck, no download." },
  { icon: Phone, suit: "♥", title: "Phone", copy: "Prefer a person? Call it in." },
  { icon: Smartphone, suit: "♠", title: "Mobile app", copy: "Fast reorders, points and tracking." },
];

function ComingSoonPage() {
  return (
    <div className="md-marketing-shell">
      <SiteHeader />
      <main>
        <section className="md-section md-section-black">
          <div className="md-section-heading md-section-heading-light">
            <p className="md-kicker">Coming soon</p>
            <h2>Coming soon to a table near you.</h2>
            <p>
              MealDeck is still being dealt. One basket across brands, one delivery fee and one checkout — with
              offers, loyalty points and live tracking from day one.
            </p>
          </div>
          <div className="md-location-grid md-order-locations">
            {landingSpots.map((spot) => (
              <Link key={spot.town} to={spot.to} className="md-location-card">
                <span>{spot.status}</span>
                <h3>{spot.town}</h3>
                <p>{spot.copy}</p>
                <strong>{spot.cta} <ArrowRight /></strong>
              </Link>
            ))}
          </div>
          <p className="md-offer-terms">Availability, hours and areas are confirmed on each MealDeck location page.</p>
        </section>

        <section className="md-section md-section-cream">
          <div className="md-section-heading">
            <p className="md-kicker md-kicker-red">What lands in your hand</p>
            <h2>One deck. One basket. One handoff.</h2>
            <p>Every brand keeps its own kitchen and cuisine. MealDeck simply keeps the order together.</p>
          </div>
          <div className="md-step-grid">
            {hand.map((step) => (
              <article key={step.n} className="md-step-card">
                <span>{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="md-section md-section-black">
          <div className="md-channels">
            <p className="md-kicker md-kicker-light">Order your way</p>
            <h3>Every route leads to a full deck.</h3>
            <div className="md-channels-grid">
              {channels.map(({ icon: Icon, suit, title, copy }) => (
                <article key={title}>
                  <span className="md-channels-suit">{suit}</span>
                  <Icon />
                  <h4>{title}</h4>
                  <p>{copy}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="md-direct-grid">
            <article>
              <ShoppingBasket />
              <div>
                <h2>Offers</h2>
                <p>Direct-order promotions, dealt with limits and clear terms.</p>
              </div>
            </article>
            <article>
              <WalletCards />
              <div>
                <h2>Loyalty points</h2>
                <p>Earn points on direct orders and unlock MealDeck-only rewards.</p>
              </div>
            </article>
            <article>
              <Users />
              <div>
                <h2>Group ordering</h2>
                <p>Everyone adds their own picks, then one payer or split payments.</p>
              </div>
            </article>
            <article>
              <Clock3 />
              <div>
                <h2>Live tracking</h2>
                <p>Follow every brand in your order from preparation to delivery.</p>
              </div>
            </article>
            <article>
              <Bike />
              <div>
                <h2>One delivery fee</h2>
                <p>Several brands, one handoff, one fee where delivery is offered.</p>
              </div>
            </article>
            <article>
              <MapPin />
              <div>
                <h2>Pickup &amp; kerbside</h2>
                <p>Collect in person or from your vehicle where the service is offered.</p>
              </div>
            </article>
          </div>
        </section>

        <section className="md-final-cta">
          <Crown />
          <p className="md-kicker md-kicker-light">Different cuisines. One checkout.</p>
          <h2>Coming soon to a table near you.</h2>
          <p>Keep your cravings close — the deck is being shuffled for Luton, St Albans and Bedford.</p>
          <div>
            <Link to="/" hash="brands" className="md-btn md-btn-yellow">See all brands <ArrowRight /></Link>
            <Link to="/franchise" className="md-btn md-btn-outline-light">Explore franchises</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
