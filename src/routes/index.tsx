import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgePoundSterling,
  Bike,
  Check,
  Clock3,
  Crown,
  Gamepad2,
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
import { LocalMenuDiscovery } from "@/components/marketing/local-menu-discovery";
import { RotatingBrandDeck } from "@/components/marketing/rotating-brand-deck";
import { OfferDiscovery } from "@/components/marketing/offer-discovery";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import { OpeningWeekendOffer } from "@/components/opening-weekend-offer";
import { useOwnDriverAvailability, useOwnDriverPreopenNotice } from "@/components/own-driver-offer-banner";
import { useCustomerEntryPolicy } from "@/components/use-customer-entry-policy";
import { suitArtwork } from "@/lib/food-suit-artwork";
import { ldScript, orgJsonLd, seo, SITE_DESCRIPTION } from "@/lib/seo";
import { MEALDECK_BUSINESS } from "@/lib/business-identity";
import { GAME_CATALOGUE } from "@/lib/dishbee-play";

export const Route = createFileRoute("/")({
  head: () => ({
    ...seo({
      title: "MealDeck Luton | Smash Burgers, Wings & Loaded Fries",
      description: SITE_DESCRIPTION,
      path: "/",
    }),
    scripts: [ldScript(orgJsonLd)],
  }),
  component: LandingPage,
});

const directBenefits = [
  { icon: ShoppingBasket, title: "One basket", copy: "Mix dishes from different MealDeck brands." },
  {
    icon: Package,
    title: "One collection",
    copy: "Collect your favourites together from our Luton kitchen.",
  },
  {
    icon: Users,
    title: "Packed your way",
    copy: "Food grouped by name so everyone gets their own choices.",
  },
  {
    icon: WalletCards,
    title: "Group ordering · 9 November",
    copy: "Starting 9 November. Pay for your own food, or let the organiser pay for everyone.",
  },
  {
    icon: Star,
    title: "Double points offer",
    copy: "Register and spend £15 or more from Monday 9 to Friday 13 November 2026 inclusive.",
  },
  {
    icon: MapPin,
    title: "Order status updates",
    copy: "Follow kitchen progress and delivery handover. No live GPS tracking.",
  },
];

const steps = [
  {
    n: "01",
    title: "Choose your order method",
    copy: "Collect at our Luton kitchen, choose kerbside, or check free local delivery when enabled.",
  },
  { n: "02", title: "Mix your cuisines", copy: "Build one basket from different MealDeck brands." },
  {
    n: "03",
    title: "Check it. Make it yours.",
    copy: "Review every item and extra, choose cutlery or numbered bags, then pay securely.",
  },
  {
    n: "04",
    title: "Follow your order",
    copy: "See when it is accepted, preparing and ready. Give your collection code to the team at handover.",
  },
];

function LandingPage() {
  const entryPolicy = useCustomerEntryPolicy();
  const deliveryLive = useOwnDriverAvailability();
  const deliveryPreopen = useOwnDriverPreopenNotice();
  const groupOrderingOpen =
    !!entryPolicy &&
    Date.parse(entryPolicy.serverNow) >= Date.parse(entryPolicy.registrationResumesAt);
  return (
    <div className="md-marketing-shell">
      <SiteHeader />
      <main>
        <section className="md-hero">
          <div className="md-hero-pattern" aria-hidden="true" />
          <div className="md-hero-inner">
            <div className="md-hero-copy">
              <p className="md-kicker">
                MealDeck · Luton{" "}
                {deliveryLive
                  ? "free local delivery, collection & kerbside"
                  : "collection & kerbside"}
              </p>
              <h1>
                Food in Luton.
                <br />
                <span>Every craving.</span>
              </h1>
              <p className="md-hero-lead">
                Skorch smash burgers, Tavo chicken wings and tenders, Souvano Greek and Turkish
                food, Load’d loaded fries and mac and cheese, and Moktl mocktails. Five menus, one
                basket for{" "}
                {deliveryLive ? "free delivery, collection or kerbside" : "collection or kerbside"}.
              </p>
              <p className="md-hero-foods">
                Smash burgers · Chicken wings · Loaded fries · Doner · Mocktails · Milk cake
              </p>
              <p className="md-hero-tagline">{MEALDECK_BUSINESS.tagline}</p>
              <div className="md-hero-actions">
                <Link to="/menus" className="md-btn md-btn-yellow">
                  Order from our menus <ArrowRight />
                </Link>
                <Link to="/" hash="brands" className="md-btn md-btn-outline-light">
                  See all brands
                </Link>
              </div>
              <p className="md-hero-soon">
                {deliveryLive
                  ? "Due to popular demand: FREE delivery now available within 3 km of LU4 8NU on orders paying £15+ after discounts."
                  : deliveryPreopen
                    ? "Due to popular demand: FREE delivery planned from 3pm today within 3 km of LU4 8NU on orders paying £15+ after discounts."
                    : "Luton collection and kerbside, from our kitchen to you."}
              </p>
              <div className="md-hero-proof">
                <span>
                  <Check /> Mix brands
                </span>
                <span>
                  <Clock3 /> Order during opening hours
                </span>
                <span>
                  <Gamepad2 /> Free games open
                </span>
              </div>
            </div>
            <RotatingBrandDeck />
          </div>
        </section>

        <div className="md-launch-story">
          <OpeningWeekendOffer />
        </div>

        <section className="md-direct-strip" aria-label="Why order direct">
          <div className="md-direct-strip-title">
            <span>ORDER DIRECT.</span>
            <strong>
              Five menus. One order.{" "}
              {deliveryLive
                ? "Free Luton local delivery, collection and kerbside."
                : "Luton collection and kerbside."}
            </strong>
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
              <h2>Your first five menus are here.</h2>
              <p>
                Find your Luton takeaway favourites, from beef smash burgers and chicken wings to
                loaded fries, doner and mocktails. Mix your picks and order for{" "}
                {deliveryLive
                  ? "free local delivery, collection or kerbside"
                  : "collection or kerbside"}
                .
              </p>
            </div>
            <Link to="/menus" className="md-btn md-btn-red">
              Explore our menus <ArrowRight />
            </Link>
          </div>
          <LocalMenuDiscovery />
          <BrandLogoGrid />
        </section>

        <OfferDiscovery />

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
            <div className="md-feature-icon">
              <Users />
            </div>
            <p className="md-kicker md-kicker-light">Ordering with friends?</p>
            <h2>One room. Everyone’s favourites.</h2>
            {!groupOrderingOpen && (
              <p>
                <strong>Group ordering · Starting 9 November</strong>
              </p>
            )}
            <ul>
              <li>
                <Share2 /> Create a room and invite your group
              </li>
              <li>
                <ShoppingBasket /> Everyone joins and chooses their food
              </li>
              <li>
                <WalletCards /> Pay for your own items, or one person pays
              </li>
              <li>
                <Package /> One kitchen order, packed by name
              </li>
            </ul>
            <p>
              Invitations have a 3-minute joining window. Once everyone in the room is ready, the
              organiser locks the choices. The fully paid order goes to the kitchen together, with
              an itemised bill for each person.
            </p>
            <Link to="/group-order" className="md-btn md-btn-yellow">
              {groupOrderingOpen ? "Start a group order" : "Group ordering · Starting 9 November"}{" "}
              <ArrowRight />
            </Link>
          </article>

          <article className="md-feature-panel md-feature-panel-cream">
            <div className="md-feature-icon md-feature-icon-dark">
              <BadgePoundSterling />
            </div>
            <p className="md-kicker md-kicker-red">Why order direct?</p>
            <h2>One MealDeck journey instead of separate aggregator baskets.</h2>
            <p>
              Keep brands, offers, loyalty, payments and tracking together. The food stays familiar;
              the journey becomes simpler.
            </p>
            <div className="md-mini-proof-grid">
              <span>
                <Check /> MealDeck-only offers
              </span>
              <span>
                <Check /> Optional offer updates
              </span>
              <span>
                <Check /> One checkout
              </span>
              <span>
                <Check /> One collection
              </span>
            </div>
          </article>
        </section>

        <section className="md-section md-section-black md-fulfilment-section">
          <div className="md-section-heading md-section-heading-light">
            <p className="md-kicker">
              MealDeck ordering ·{" "}
              {deliveryLive ? "Delivery, collection & kerbside" : "Collection & kerbside"}
            </p>
            <h2>
              {deliveryLive
                ? "Free delivery, collection or kerbside. Your choice."
                : "Collection or kerbside. Your choice."}
            </h2>
          </div>
          <div className="md-fulfilment-grid">
            <article>
              <Bike />
              <h3>{deliveryLive ? "Free local delivery · Live" : deliveryPreopen ? "Free delivery · Planned from 3pm today" : "Delivery · Coming soon"}</h3>
              <p>
                {deliveryLive
                  ? "Due to popular demand: free own-driver delivery within 3 km of LU4 8NU for £15+ after discounts. Estimated within one hour, without GPS tracking."
                  : deliveryPreopen
                    ? "Due to popular demand: FREE delivery planned from 3pm Sunday 8 November within 3 km of LU4 8NU on orders paying at least £15 after discounts."
                    : "Delivery is not available at the moment. Please select collection or kerbside."}
              </p>
            </article>
            <article>
              <Package />
              <h3>Pickup</h3>
              <p>Order ahead and collect using your order reference.</p>
            </article>
            <article>
              <MapPin />
              <h3>Kerbside collection</h3>
              <p>Collect without leaving your vehicle where the service is offered.</p>
            </article>
          </div>
          <div className="md-channels">
            <p className="md-kicker md-kicker-light">Order your way</p>
            <h3>Every route leads to a full deck.</h3>
            <div className="md-channels-grid">
              <article>
                <span className="md-channels-suit">♣</span>
                <MessageCircle />
                <h4>WhatsApp ordering</h4>
                <p>Coming soon.</p>
              </article>
              <article>
                <span className="md-channels-suit">♦</span>
                <Share2 />
                <h4>Website</h4>
                <p>The complete deck, no download.</p>
              </article>
              <article>
                <span className="md-channels-suit">♥</span>
                <Phone />
                <h4>Phone</h4>
                <p>Phone ordering coming soon.</p>
              </article>
              <article>
                <span className="md-channels-suit">♠</span>
                <Smartphone />
                <h4>On your phone</h4>
                <p>Order on mobile. Add MealDeck to your home screen.</p>
              </article>
            </div>
          </div>
          <div className="md-collection-band">
            <div>
              <p className="md-kicker md-kicker-light">
                {deliveryLive
                  ? "Luton pickup / kerbside / free delivery"
                  : "Luton pickup / kerbside"}
              </p>
              <h3>314–318 Selbourne Road, Luton, LU4 8NU</h3>
              <p>
                Order online during kitchen opening hours.{" "}
                {deliveryLive &&
                  "Free delivery is available to eligible postcodes within 3 km with £15 payable after discounts."}
              </p>
            </div>
            <Link to="/menus" className="md-btn md-btn-yellow">
              {deliveryLive ? "Order for delivery" : "Order for collection"} <ArrowRight />
            </Link>
          </div>
        </section>

        <section id="locations" className="md-section md-section-cream">
          <div className="md-section-heading">
            <p className="md-kicker md-kicker-red">Locations</p>
            <h2>Your local MealDeck.</h2>
          </div>
          <div className="md-location-grid md-order-locations">
            <Link to="/luton" className="md-location-card">
              <span>Luton</span>
              <h3>Evening cravings, dealt together.</h3>
              <p>Order online · Collection and kerbside</p>
              <strong>
                Explore Luton <ArrowRight />
              </strong>
            </Link>
            <Link to="/st-albans" className="md-location-card">
              <span>St Albans</span>
              <h3>Weekday breakfast and lunch, one hand.</h3>
              <p>Coming in a future deck · Luton launches first</p>
              <strong>
                Explore St Albans <ArrowRight />
              </strong>
            </Link>
            <Link to="/bedford" className="md-location-card">
              <span>Bedford</span>
              <h3>Coming soon to a table near you.</h3>
              <p>Coming in a future deck · Launch date to follow</p>
              <strong>
                Explore Bedford <ArrowRight />
              </strong>
            </Link>
          </div>
        </section>

        <section className="md-section md-soon">
          <div className="md-section-heading md-section-heading-light md-section-heading-split">
            <div>
              <p className="md-kicker md-kicker-light">Dealing new hands soon</p>
              <h2>The deck keeps growing.</h2>
            </div>
            <p>
              More cities are in the shuffle. MealDeck is stacking its next hands across the UK.
            </p>
          </div>
          <div className="md-soon-grid">
            {(
              [
                { city: "London", rank: "A", suit: "burger", copy: "The ace up London's sleeve." },
                {
                  city: "Manchester",
                  rank: "2",
                  suit: "french-taco",
                  copy: "You're next up our sleeve.",
                },
                {
                  city: "Birmingham",
                  rank: "C",
                  suit: "chicken",
                  copy: "The deck is stacked in your favour.",
                },
                { city: "Leicester", rank: "H", suit: "cake", copy: "We're shuffling your way." },
                { city: "Bedford", rank: "3", suit: "burger", copy: "Consider yourself dealt in." },
                {
                  city: "Milton Keynes",
                  rank: "4",
                  suit: "french-taco",
                  copy: "A winning hand is on the table.",
                },
                {
                  city: "Cardiff",
                  rank: "5",
                  suit: "chicken",
                  copy: "Hold tight — the cards are warm.",
                },
                {
                  city: "Your city",
                  rank: "M",
                  suit: "cake",
                  copy: "Nominate it and we'll deal you in first.",
                },
              ] as const
            ).map(({ city, rank, suit, copy }) => (
              <article
                key={city}
                className={`md-soon-card${city === "Your city" ? " md-soon-card-wild" : ""}`}
              >
                <span className="md-soon-corner md-soon-corner-tl" aria-hidden="true">
                  <b>{rank}</b>
                  <img src={suitArtwork[suit]} alt="" />
                </span>
                <span className="md-soon-corner md-soon-corner-br" aria-hidden="true">
                  <b>{rank}</b>
                  <img src={suitArtwork[suit]} alt="" />
                </span>
                {city === "Your city" ? (
                  <MealDeckLogo decorative loading="lazy" className="md-soon-emblem" />
                ) : (
                  <img
                    src={suitArtwork[suit]}
                    alt=""
                    className="md-soon-emblem md-soon-emblem-food"
                    aria-hidden="true"
                  />
                )}
                <h3>{city}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="md-section md-section-cream md-franchise-home-promo"
          aria-labelledby="home-franchise-title"
        >
          <div>
            <p className="md-kicker md-kicker-red">Make it your business</p>
            <h2 id="home-franchise-title">
              One brand.
              <br />A few favourites.
              <br />
              The whole MealDeck.
            </h2>
            <p>
              Explore individual food franchises or the full MealDeck concept. Choose your brands
              and discuss a package for your existing kitchen or a new food business.
            </p>
            <Link to="/franchise" className="md-btn md-btn-red">
              Explore franchise options <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          <div className="md-franchise-home-routes">
            <Link to="/franchise" search={{ package: "full" }}>
              <span>THE FULL CONCEPT</span>
              <strong>MealDeck, in full.</strong>
              <p>The shared portfolio, setup and support.</p>
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link to="/franchise" search={{ package: "brands" }} hash="brands">
              <span>YOUR OWN COMBINATION</span>
              <strong>1, 2, 3… your choice.</strong>
              <p>Explore each brand. Add your favourites.</p>
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="md-final-cta">
          <Sparkles />
          <p className="md-kicker md-kicker-light">Different cuisines. One checkout.</p>
          <h2>Ready to play your cravings right?</h2>
          <p>
            Guests and members get 30% off the entire menu during our 6–8 November opening hours.
            Register and spend £15 or more from Monday 9 to Friday 13 November inclusive for double
            loyalty points. Marketing updates are optional.
          </p>
          <div>
            <Link to="/account" className="md-btn md-btn-yellow">
              Get your account ready <Crown />
            </Link>
            <Link to="/play/daily" className="md-btn md-btn-outline-light">
              Try today’s free puzzle <Gamepad2 aria-hidden="true" />
            </Link>
          </div>
          <p>
            A fresh challenge every day.{" "}
            <Link to="/play">Explore all {GAME_CATALOGUE.length} free food games</Link>.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
