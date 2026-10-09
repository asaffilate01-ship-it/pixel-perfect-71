import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgePoundSterling,
  Bike,
  Check,
  Clock3,
  Crown,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Share2,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Star,
  Users,
  WalletCards,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BrandLogoGrid } from "@/components/marketing/brand-logo-grid";
import { RotatingBrandDeck } from "@/components/marketing/rotating-brand-deck";
import backEmblem from "@/assets/mealdeck-back-emblem.png";
import { ldScript, orgJsonLd, seo } from "@/lib/seo";
import { suitArtwork } from "@/lib/food-suit-artwork";

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
  { icon: Bike, title: "One delivery fee", copy: "Order from your favourite brands in one go and pay a single delivery fee." },
  { icon: Users, title: "Group ordering", copy: "Invite everyone and build the order together." },
  { icon: WalletCards, title: "Split payments", copy: "Let friends pay their own share." },
  { icon: Star, title: "Loyalty rewards", copy: "Earn points and unlock direct-order offers." },
  { icon: MapPin, title: "Live tracking", copy: "Follow the complete MealDeck handoff." },
];

const offers = [
  { rank: "A", suit: "burger", label: "The Burger Ace", value: "FREE", copy: "Spend £21. Get an eligible burger on us." },
  { rank: "2", suit: "french-taco", label: "Perfect Pair", value: "½ PRICE", copy: "Buy two identical eligible items and get the second half price." },
  { rank: "C", suit: "chicken", label: "Snap!", value: "2 FOR 1", copy: "Selected matching items. Pay for one." },
  { rank: "M", suit: "cake", label: "The Group Hand", value: "+ POINTS", copy: "Selected group orders earn extra loyalty points." },
  { rank: "H", suit: "burger", label: "Full House Feast", value: "£5 OFF", copy: "Order from three brands with a £30 minimum spend." },
  { rank: "10", suit: "french-taco", label: "The Loyalty Flush", value: "10× PTS", copy: "Your fifth direct order in a month earns 10× points." },
] as const;

const steps = [
  { n: "01", title: "Choose how you want it", copy: "Delivery, pickup or kerbside. Select your area when ordering opens." },
  { n: "02", title: "Mix your cuisines", copy: "Build one basket from different MealDeck brands." },
  { n: "03", title: "Checkout once", copy: "One order, one payment flow and one delivery fee." },
  { n: "04", title: "Track it together", copy: "Follow progress across every brand in your order, from preparation to delivery." },
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
              <p className="md-kicker">Different restaurants. One easy order.</p>
              <h1>
                Food for every<br />
                <span>craving.</span>
              </h1>
              <p className="md-hero-lead">
                Choose restaurant favourites across artisan pizza, French tacos, grilled chicken, smash burgers, pasta, Indian food, desserts and drinks — all in one basket.
              </p>
              <p className="md-hero-foods">Artisan pizza · French tacos · Parathas · Burgers · Pasta · Fresh juices · Chai · Desserts</p>
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
              return (
                <article key={offer.label} className="md-offer-card">
                  <div className="md-offer-corner" aria-hidden="true">
                    <strong>{offer.rank}</strong><img src={suitArtwork[offer.suit]} alt="" />
                  </div>
                  <div className="md-offer-corner md-offer-corner-br" aria-hidden="true">
                    <strong>{offer.rank}</strong><img src={suitArtwork[offer.suit]} alt="" />
                  </div>
                  <img className="md-offer-pip" src={suitArtwork[offer.suit]} alt="" aria-hidden="true" />
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
          <div className="md-channels">
            <p className="md-kicker md-kicker-light">Order your way</p>
            <h3>Every route leads to a full deck.</h3>
            <div className="md-channels-grid">
              <article><span className="md-channels-suit">♣</span><MessageCircle /><h4>WhatsApp</h4><p>Message, choose and order.</p></article>
              <article><span className="md-channels-suit">♦</span><Share2 /><h4>Website</h4><p>The complete deck, no download.</p></article>
              <article><span className="md-channels-suit">♥</span><Phone /><h4>Phone</h4><p>Prefer a person? Call it in.</p></article>
              <article><span className="md-channels-suit">♠</span><Smartphone /><h4>Mobile app</h4><p>Fast reorders, points and tracking.</p></article>
            </div>
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
            {([
              { city: "London", rank: "A", suit: "burger", copy: "The ace up London's sleeve." },
              { city: "Manchester", rank: "2", suit: "french-taco", copy: "You're next up our sleeve." },
              { city: "Birmingham", rank: "C", suit: "chicken", copy: "The deck is stacked in your favour." },
              { city: "Leicester", rank: "H", suit: "cake", copy: "We're shuffling your way." },
              { city: "Bedford", rank: "3", suit: "burger", copy: "Consider yourself dealt in." },
              { city: "Milton Keynes", rank: "4", suit: "french-taco", copy: "A winning hand is on the table." },
              { city: "Cardiff", rank: "5", suit: "chicken", copy: "Hold tight — the cards are warm." },
              { city: "Your city", rank: "M", suit: "cake", copy: "Nominate it and we'll deal you in first." },
            ] as const).map(({ city, rank, suit, copy }) => (
              <article key={city} className={`md-soon-card${city === "Your city" ? " md-soon-card-wild" : ""}`}>
                <span className="md-soon-corner md-soon-corner-tl" aria-hidden="true"><b>{rank}</b><img src={suitArtwork[suit]} alt="" /></span>
                <span className="md-soon-corner md-soon-corner-br" aria-hidden="true"><b>{rank}</b><img src={suitArtwork[suit]} alt="" /></span>
                <img src={backEmblem} alt="" className="md-soon-emblem" />
                <h3>{city}</h3><p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="md-section md-section-cream md-franchise-home-promo" aria-labelledby="home-franchise-title">
          <div>
            <p className="md-kicker md-kicker-red">Make it your business</p>
            <h2 id="home-franchise-title">One brand.<br />A few favourites.<br />The whole MealDeck.</h2>
            <p>Explore individual food franchises or the full MealDeck concept. Choose your brands and discuss a package for your existing kitchen or a new food business.</p>
            <Link to="/franchise" className="md-btn md-btn-red">Explore franchise options <ArrowRight aria-hidden="true" /></Link>
          </div>
          <div className="md-franchise-home-routes">
            <Link to="/franchise" search={{ package: "full" }}><span>THE FULL CONCEPT</span><strong>MealDeck, in full.</strong><p>The shared portfolio, setup and support.</p><ArrowRight aria-hidden="true" /></Link>
            <Link to="/franchise" search={{ package: "brands" }} hash="brands"><span>YOUR OWN COMBINATION</span><strong>1, 2, 3… your choice.</strong><p>Explore each brand. Add your favourites.</p><ArrowRight aria-hidden="true" /></Link>
          </div>
        </section>

        <section className="md-final-cta">
          <Sparkles />
          <p className="md-kicker md-kicker-light">Different cuisines. One checkout.</p>
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
