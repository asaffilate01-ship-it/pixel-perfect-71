import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgePoundSterling,
  Bike,
  Check,
  Clock3,
  Crown,
  MapPin,
  Package,
  Share2,
  ShoppingBasket,
  Sparkles,
  Star,
  Users,
  WalletCards,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BrandLogoGrid } from "@/components/marketing/brand-logo-grid";
import { RotatingBrandDeck } from "@/components/marketing/rotating-brand-deck";
import { ldScript, orgJsonLd, seo } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => ({
    ...seo({
      title: "MealDeck — One Order. Every Craving.",
      description:
        "Order direct from multiple MealDeck food brands in one basket. One delivery fee, group ordering, rewards and live tracking across Luton and St Albans.",
      path: "/",
      keywords:
        "MealDeck, food delivery Luton, takeaway Luton, food delivery St Albans, group food ordering, split payment food delivery, multi brand food delivery",
    }),
    scripts: [ldScript(orgJsonLd)],
  }),
  component: LandingPage,
});

const directBenefits = [
  { icon: ShoppingBasket, title: "One basket", copy: "Mix dishes from different MealDeck brands." },
  { icon: Bike, title: "One delivery fee", copy: "One MealDeck order, not separate restaurant baskets." },
  { icon: Users, title: "Group ordering", copy: "Invite everyone and build the order together." },
  { icon: WalletCards, title: "Split payments", copy: "Let friends pay their own share." },
  { icon: Star, title: "Loyalty rewards", copy: "Earn points and unlock direct-order offers." },
  { icon: MapPin, title: "Live tracking", copy: "Follow the complete MealDeck handoff." },
];

const offers = [
  { rank: "A", suit: "♥", label: "The Burger Ace", value: "FREE", copy: "Spend £21. Get an eligible burger on us." },
  { rank: "2", suit: "♦", label: "Perfect Pair", value: "½ PRICE", copy: "Buy two identical eligible items and get the second half price." },
  { rank: "S", suit: "♠", label: "Snap!", value: "2 FOR 1", copy: "Selected matching items. Pay for one." },
  { rank: "K", suit: "♣", label: "The Group Hand", value: "+ POINTS", copy: "Selected group orders earn extra loyalty points." },
  { rank: "F", suit: "♥", label: "Full House Feast", value: "£5 OFF", copy: "Order from three brands with a £30 minimum spend." },
  { rank: "10", suit: "♦", label: "The Loyalty Flush", value: "10× PTS", copy: "Your fifth direct order in a month earns 10× points." },
];

const steps = [
  { n: "01", title: "Choose how you want it", copy: "Delivery, pickup or kerbside. Select your area when ordering opens." },
  { n: "02", title: "Mix your cuisines", copy: "Build one basket from different MealDeck brands." },
  { n: "03", title: "Checkout once", copy: "One order, one payment flow and one delivery fee." },
  { n: "04", title: "Track it together", copy: "Follow kitchen progress, packing and delivery in one place." },
];

function LandingPage() {
  return (
    <div className="md-marketing-shell">
      <SiteHeader />
      <main>
        <section className="md-hero">
          <div className="md-hero-pattern" aria-hidden="true" />
          <div className="md-hero-inner">
            <div className="md-hero-copy">
              <p className="md-kicker">The full house of flavour</p>
              <h1>
                Play your<br />
                <span>cravings right.</span>
              </h1>
              <p className="md-hero-lead">
                Pick from different food brands, deal them into one basket and pay one delivery fee.
              </p>
              <p className="md-hero-tagline">One Order. Every Craving.</p>
              <div className="md-hero-actions">
                <Link to="/order" className="md-btn md-btn-yellow">Order direct <ArrowRight /></Link>
                <Link to="/" hash="brands" className="md-btn md-btn-outline-light">See all brands</Link>
              </div>
              <div className="md-hero-proof">
                <span><Check /> Mix brands</span>
                <span><Check /> Split payments</span>
                <span><Check /> Live tracking</span>
              </div>
            </div>
            <RotatingBrandDeck />
          </div>
        </section>

        <section className="md-direct-strip" aria-label="Why order direct">
          <div className="md-direct-strip-title">
            <span>ORDER DIRECT.</span>
            <strong>Same food. Same delivery. Better direct value.</strong>
          </div>
          <div className="md-direct-grid">
            {directBenefits.map(({ icon: Icon, title, copy }) => (
              <article key={title}>
                <Icon />
                <div>
                  <h2>{title}</h2>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="brands" className="md-section md-section-cream">
          <div className="md-section-heading md-section-heading-split">
            <div>
              <p className="md-kicker md-kicker-red">Our brands. Your cravings.</p>
              <h2>Multiple brands. One premium collection.</h2>
              <p>Every identity stays distinct. MealDeck brings them together in one ordering experience.</p>
            </div>
            <Link to="/order" className="md-btn md-btn-red">Start a mixed order <ArrowRight /></Link>
          </div>
          <BrandLogoGrid />
        </section>

        <section id="offers" className="md-section md-section-black">
          <div className="md-section-heading md-section-heading-light">
            <p className="md-kicker">MealDeck exclusive offers</p>
            <h2>Good deals. Clearly dealt.</h2>
            <p>Direct-order promotions presented in the same card language as MealDeck.</p>
          </div>
          <div className="md-offer-grid">
            {offers.map((offer) => {
              const red = offer.suit === "♥" || offer.suit === "♦";
              return (
                <article key={offer.label} className="md-offer-card">
                  <div className={`md-offer-corner ${red ? "md-offer-corner-red" : ""}`}>
                    <strong>{offer.rank}</strong><span>{offer.suit}</span>
                  </div>
                  <div className={`md-offer-corner md-offer-corner-br ${red ? "md-offer-corner-red" : ""}`} aria-hidden="true">
                    <strong>{offer.rank}</strong><span>{offer.suit}</span>
                  </div>
                  <span className="md-offer-pip" aria-hidden="true">{offer.suit}</span>
                  <p className="md-offer-label">{offer.label}</p>
                  <h3>{offer.value}</h3>
                  <p>{offer.copy}</p>
                </article>
              );
            })}
          </div>
          <p className="md-offer-terms">Selected items and brands. Offer limits apply. Current terms shown before ordering.</p>
        </section>

        <section id="how" className="md-section md-section-cream">
          <div className="md-section-heading">
            <p className="md-kicker md-kicker-red">How MealDeck works</p>
            <h2>Shuffle less. Eat better.</h2>
            <p>Keep the ordering journey simple even when everyone wants something different.</p>
          </div>
          <div className="md-step-grid">
            {steps.map((step) => (
              <article key={step.n} className="md-step-card">
                <span>{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="md-feature-split">
          <article className="md-feature-panel md-feature-panel-red">
            <div className="md-feature-icon"><Users /></div>
            <p className="md-kicker md-kicker-light">Ordering with friends?</p>
            <h2>Build one group order without chasing everyone.</h2>
            <ul>
              <li><Share2 /> Share an invite</li>
              <li><ShoppingBasket /> Everyone adds their own food</li>
              <li><WalletCards /> Choose one payer or split payments</li>
              <li><Clock3 /> Set a group cutoff time</li>
            </ul>
            <Link to="/order" className="md-btn md-btn-yellow">Start a group order <ArrowRight /></Link>
          </article>

          <article className="md-feature-panel md-feature-panel-cream">
            <div className="md-feature-icon md-feature-icon-dark"><BadgePoundSterling /></div>
            <p className="md-kicker md-kicker-red">Why order direct?</p>
            <h2>One MealDeck journey instead of separate aggregator baskets.</h2>
            <p>
              Keep brands, offers, loyalty, payments and tracking together. The food stays familiar; the journey becomes simpler.
            </p>
            <div className="md-mini-proof-grid">
              <span><Check /> MealDeck-only offers</span>
              <span><Check /> Loyalty points</span>
              <span><Check /> One checkout</span>
              <span><Check /> One delivery fee</span>
            </div>
          </article>
        </section>

        <section className="md-section md-section-black md-fulfilment-section">
          <div className="md-section-heading md-section-heading-light">
            <p className="md-kicker">Get MealDeck your way</p>
            <h2>Delivery. Pickup. Kerbside.</h2>
          </div>
          <div className="md-fulfilment-grid">
            <article><Bike /><h3>Delivery</h3><p>One MealDeck order delivered together where available.</p></article>
            <article><Package /><h3>Pickup</h3><p>Order ahead and collect using your order reference.</p></article>
            <article><MapPin /><h3>Kerbside collection</h3><p>Collect without leaving your vehicle where the service is offered.</p></article>
          </div>
          <div className="md-collection-band">
            <div>
              <p className="md-kicker md-kicker-light">Luton pickup / kerbside</p>
              <h3>314–318 Selbourne Road, Luton, LU4 8NU</h3>
              <p>Please bring your order reference.</p>
            </div>
            <Link to="/order" className="md-btn md-btn-yellow">Order for collection <ArrowRight /></Link>
          </div>
        </section>

        <section id="locations" className="md-section md-section-cream">
          <div className="md-section-heading">
            <p className="md-kicker md-kicker-red">Locations</p>
            <h2>Your local MealDeck.</h2>
          </div>
          <div className="md-location-grid">
            <Link to="/luton" className="md-location-card">
              <span>Luton</span>
              <h3>Evening cravings, dealt together.</h3>
              <p>Delivery · Pickup · Kerbside</p>
              <strong>Explore Luton <ArrowRight /></strong>
            </Link>
            <Link to="/st-albans" className="md-location-card">
              <span>St Albans</span>
              <h3>Weekday breakfast and lunch, one hand.</h3>
              <p>Delivery · Pickup · Kerbside · Dine in</p>
              <strong>Explore St Albans <ArrowRight /></strong>
            </Link>
          </div>
        </section>

        <section className="md-section md-soon">
          <div className="md-section-heading md-section-heading-light md-section-heading-split">
            <div>
              <p className="md-kicker md-kicker-light">Dealing new hands soon</p>
              <h2>The deck keeps growing.</h2>
            </div>
            <p>More cities are in the shuffle. MealDeck is stacking its next hands across the UK.</p>
          </div>
          <div className="md-soon-grid">
            <article className="md-soon-card"><span className="md-soon-suit">♠</span><h3>London</h3><p>The ace up London's sleeve.</p></article>
            <article className="md-soon-card"><span className="md-soon-suit">♥</span><h3>Manchester</h3><p>You're next up our sleeve.</p></article>
            <article className="md-soon-card"><span className="md-soon-suit">♦</span><h3>Birmingham</h3><p>The deck is stacked in your favour.</p></article>
            <article className="md-soon-card"><span className="md-soon-suit">♣</span><h3>Leicester</h3><p>We're shuffling your way.</p></article>
            <article className="md-soon-card"><span className="md-soon-suit">♦</span><h3>Bedford</h3><p>Consider yourself dealt in.</p></article>
            <article className="md-soon-card"><span className="md-soon-suit">♠</span><h3>Milton Keynes</h3><p>A winning hand is on the table.</p></article>
            <article className="md-soon-card"><span className="md-soon-suit">♥</span><h3>Cardiff</h3><p>Hold tight — the cards are warm.</p></article>
            <article className="md-soon-card md-soon-card-wild"><span className="md-soon-suit">★</span><h3>Your city</h3><p>Nominate it and we'll deal you in first.</p></article>
          </div>
        </section>

        <section className="md-final-cta">
          <Sparkles />
          <p className="md-kicker md-kicker-light">Different cuisines. Same table.</p>
          <h2>Ready to play your cravings right?</h2>
          <p>Mix your brands, build one basket and keep the whole order together.</p>
          <div>
            <Link to="/order" className="md-btn md-btn-yellow">Deal me in <Crown /></Link>
            <Link to="/track" className="md-btn md-btn-outline-light">Track an order</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
