import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgePoundSterling,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Crown,
  Gift,
  Globe2,
  MapPin,
  MessageCircle,
  Phone,
  Share2,
  Smartphone,
  Star,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import mealdeckDeck from "@/assets/mealdeck-card-deck.png.asset.json";
import mdWatermark from "@/assets/mealdeck-md-watermark.png.asset.json";
import mdEmblem from "@/assets/mealdeck-emblem.png.asset.json";
import heroBurger from "@/assets/hero-burger.png";
import heroTacos from "@/assets/hero-tacos.png";
import icova from "@/assets/premium-logos/icova-premium.png.asset.json";
import loadd from "@/assets/premium-logos/loadd-premium.png.asset.json";
import moktl from "@/assets/premium-logos/moktl-premium.png.asset.json";
import nusara from "@/assets/premium-logos/nusara-premium.png.asset.json";
import paratique from "@/assets/premium-logos/paratique-premium.png.asset.json";
import pastarivo from "@/assets/premium-logos/pastarivo-premium.png.asset.json";
import riseAndGriddle from "@/assets/premium-logos/rise-and-griddle-premium.png.asset.json";
import sabzora from "@/assets/premium-logos/sabzora-premium.png.asset.json";
import skorch from "@/assets/premium-logos/skorch-premium.png.asset.json";
import souvano from "@/assets/premium-logos/souvano-premium.png.asset.json";
import taconelle from "@/assets/premium-logos/taconelle-premium.png.asset.json";
import tarkaBox from "@/assets/premium-logos/tarka-box-premium.png.asset.json";
import tavoChicken from "@/assets/premium-logos/tavo-chicken-premium.png.asset.json";
import vyta from "@/assets/premium-logos/vyta-premium.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MealDeck — Play Your Cravings Right" },
      {
        name: "description",
        content:
          "Mix food from multiple brands in one basket, split the bill, earn loyalty points and track one delivery from kitchen to door.",
      },
      { property: "og:title", content: "MealDeck — One Order. Every Craving." },
      {
        property: "og:description",
        content: "Pick your brands, build one order and pay one delivery fee. The full house of flavour is yours.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const premiumBrands = [
  { name: "Taconelle", category: "French tacos", logo: taconelle.url, rank: "A", suit: "♥" },
  { name: "Tavo Chicken", category: "Fried chicken", logo: tavoChicken.url, rank: "K", suit: "♦" },
  { name: "Skorch", category: "Smash burgers", logo: skorch.url, rank: "Q", suit: "♠" },
  { name: "Load'd", category: "Loaded fries", logo: loadd.url, rank: "J", suit: "♣" },
  { name: "Tarka Box", category: "Indian street food", logo: tarkaBox.url, rank: "10", suit: "♥" },
  { name: "Paratique", category: "Signature parathas", logo: paratique.url, rank: "9", suit: "♦" },
  { name: "Sabzora", category: "Vegetarian Indian", logo: sabzora.url, rank: "8", suit: "♠" },
  { name: "Vyta", category: "Natural nutrition", logo: vyta.url, rank: "7", suit: "♣" },
  { name: "Icova", category: "Iced coffee & matcha", logo: icova.url, rank: "6", suit: "♥" },
  { name: "Moktl", category: "Zero-alcohol drinks", logo: moktl.url, rank: "5", suit: "♦" },
  { name: "Souvano", category: "Mediterranean plates", logo: souvano.url, rank: "4", suit: "♠" },
  { name: "Nusara", category: "South Asian kitchen", logo: nusara.url, rank: "3", suit: "♣" },
  { name: "Pastarivo", category: "Fresh pasta", logo: pastarivo.url, rank: "2", suit: "♥" },
  { name: "Rise & Griddle", category: "Breakfast & brunch", logo: riseAndGriddle.url, rank: "A", suit: "♦" },
] as const;

const benefits = [
  { icon: WalletCards, kicker: "Mix your hand", title: "One basket. Every craving.", copy: "Burgers for one, pasta for another, mocktails for the table — all dealt into one order.", suit: "♦" },
  { icon: Truck, kicker: "One clean deal", title: "Just one delivery fee.", copy: "Mix across participating brands without stacking separate delivery charges.", suit: "♥" },
  { icon: Users, kicker: "Bring the table", title: "Group ordering built in.", copy: "Share an invite, let everyone add their pick, then lock the order when the table is ready.", suit: "♠" },
  { icon: CircleDollarSign, kicker: "Split the pot", title: "Simple split payments.", copy: "Friends pay their share without one person chasing the whole table afterwards.", suit: "♣" },
  { icon: Star, kicker: "Stack the deck", title: "Points on every order.", copy: "Earn MealDeck loyalty points across brands and play them back on future favourites.", suit: "♦" },
  { icon: MapPin, kicker: "Follow every move", title: "Full live tracking.", copy: "See confirmation, kitchen progress, driver updates and arrival — all in one place.", suit: "♥" },
];

const channels = [
  { icon: MessageCircle, title: "WhatsApp", copy: "Message, choose and order.", suit: "♣" },
  { icon: Globe2, title: "Web", copy: "The complete deck, no download.", suit: "♦" },
  { icon: Phone, title: "Phone", copy: "Prefer a person? Call your order in.", suit: "♥" },
  { icon: Smartphone, title: "App", copy: "Fast reorders, points and tracking.", suit: "♠" },
];

const offers = [
  { label: "The Burger Ace", value: "FREE", title: "Spend £21. Get a burger on us.", copy: "Choose one eligible burger from the offer hand.", terms: "One free burger per order · Participating brands · While available", rank: "A", suit: "♥" },
  { label: "Perfect Pair", value: "½ PRICE", title: "Buy one. Deal the second for half.", copy: "Pick two of the same eligible item and the second drops to half price.", terms: "Cheapest identical item discounted · One pair per order", rank: "2", suit: "♦" },
  { label: "Snap!", value: "2 FOR 1", title: "Match two of the same. Pay for one.", copy: "When identical eligible items snap together in your basket, the second is on the house.", terms: "Selected items only · One snap per order · While available", rank: "S", suit: "♠" },
  { label: "The Group Hand", value: "+ POINTS", title: "More people. More points.", copy: "Bring the group together and build your loyalty balance faster.", terms: "Selected group orders · Account required · Offer limits apply", rank: "K", suit: "♣" },
  { label: "Full House Feast", value: "£5 OFF", title: "Three brands. One basket. One saving.", copy: "Fill your hand with dishes from three different brands and we knock £5 off.", terms: "Min. spend £30 · One per order · Delivery orders", rank: "F", suit: "♥" },
  { label: "The Loyalty Flush", value: "10× PTS", title: "Five orders. One flush of points.", copy: "Your fifth direct order in a month earns ten times the loyalty points.", terms: "Account required · Monthly reset · Points caps apply", rank: "10", suit: "♦" },
];

const ticker = ["One order", "One delivery fee", "A growing brand deck", "Split payments", "Loyalty points", "Live tracking", "Direct-order value"];

function BrandCard({ brand, index }: { brand: (typeof premiumBrands)[number]; index: number }) {
  const redSuit = brand.suit === "♥" || brand.suit === "♦";
  return (
    <Link
      to="/order"
      className="brand-playing-card group"
      aria-label={`Order from ${brand.name}`}
    >
      <span className={redSuit ? "card-corner text-primary" : "card-corner text-ink"}>
        {brand.rank}<small>{brand.suit}</small>
      </span>
      <div className="flex h-full flex-col items-center justify-center gap-1.5 px-3 text-center sm:gap-3">
        <div className="flex h-14 w-full items-center justify-center sm:h-28">
          <img src={brand.logo} alt={`${brand.name} logo`} className="max-h-full max-w-full object-contain" loading="lazy" />
        </div>
        <p className="text-[0.5rem] font-bold uppercase leading-tight text-ink/65 sm:text-[0.68rem]">{brand.category}</p>
      </div>
      <span className={redSuit ? "card-corner card-corner-bottom text-primary" : "card-corner card-corner-bottom text-ink"} aria-hidden="true">
        {brand.rank}<small>{brand.suit}</small>
      </span>
    </Link>
  );
}

function DeckReveal() {
  return (
    <section className="border-b border-border bg-card/30 py-20 sm:py-24" aria-label="Meet the MealDeck brands">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="eyebrow">Watch the deck unfold</p>
          <h2 className="mt-3 text-4xl font-black sm:text-5xl">A growing deck of flavours. One unmistakable hand.</h2>
          <p className="mt-5 max-w-lg leading-7 text-muted-foreground">
            Every card brings its own character. Flip through the full collection, then bring your favourites back together with MealDeck.
          </p>
          <p className="mt-7 font-display text-sm font-black uppercase text-accent">The choice is yours. The order stays one.</p>
        </div>
        <div className="brand-reveal-stage" aria-hidden="true">
          <div className="brand-reveal-shadow brand-reveal-shadow-one">
            <img src={mdEmblem.url} alt="" className="card-back-emblem" />
          </div>
          <div className="brand-reveal-shadow brand-reveal-shadow-two">
            <img src={mdEmblem.url} alt="" className="card-back-emblem" />
          </div>
          <div className="brand-reveal-card brand-reveal-card-start">
            <div className="brand-reveal-flip">
              <div className="brand-reveal-face brand-reveal-face-front">
                <span className="reveal-frame" />
                <span className="reveal-corner">M<small>♦</small></span>
                <span className="reveal-corner reveal-corner-bottom">M<small>♦</small></span>
                <img src={mdWatermark.url} alt="" className="max-h-[46%] max-w-[72%] object-contain" />
                <span className="font-display text-[0.65rem] font-black uppercase tracking-[0.18em] text-ink/60">One order. Every craving.</span>
              </div>
              <div className="brand-reveal-face brand-reveal-face-back">
                <img src={mdEmblem.url} alt="" className="card-back-emblem" />
              </div>
            </div>
          </div>
          {premiumBrands.map((brand) => (
            <div key={brand.name} className="brand-reveal-card">
              <span className="reveal-frame" />
              <span className={`reveal-corner ${brand.suit === "♠" || brand.suit === "♣" ? "reveal-black" : ""}`}>{brand.rank}<small>{brand.suit}</small></span>
              <span className={`reveal-corner reveal-corner-bottom ${brand.suit === "♠" || brand.suit === "♣" ? "reveal-black" : ""}`}>{brand.rank}<small>{brand.suit}</small></span>
              <img src={brand.logo} alt="" className="max-h-40 max-w-[72%] object-contain" />
              <span className="font-display text-xs font-black uppercase text-ink/60">{brand.name}</span>
            </div>
          ))}
          <div className="brand-reveal-card">
            <span className="reveal-frame" />
            <span className="reveal-corner">M<small>♦</small></span>
            <span className="reveal-corner reveal-corner-bottom">M<small>♦</small></span>
            <img src={mdWatermark.url} alt="" className="max-h-40 max-w-[72%] object-contain" />
            <span className="font-display text-xs font-black uppercase text-ink/60">MealDeck</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Landing() {
  return (
    <div className="min-h-screen overflow-hidden bg-background">
      <SiteHeader />

      <main>
        <section className="hero-felt relative border-b border-border/70">
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 lg:min-h-[44rem] lg:grid-cols-[0.92fr_1.08fr] lg:py-14">
            <div className="relative z-10 order-2 pb-6 lg:order-1 lg:pb-0">
              <p className="eyebrow">The full house of flavour</p>
              <h1 className="mt-4 max-w-3xl text-5xl font-black leading-[0.94] sm:text-6xl lg:text-7xl">
                Play your
                <br />
                <span className="text-gold">cravings right.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                Pick from different food brands, deal them into one basket and pay one delivery fee. One order. Every craving.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button variant="hero" size="xl" asChild>
                  <Link to="/order">Deal me in <ArrowRight /></Link>
                </Button>
                <Button variant="glass" size="xl" asChild>
                  <Link to="/" hash="brands">See the full deck <ChevronRight /></Link>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
                {["Mix brands", "Split the bill", "Track it live"].map((item) => (
                  <span key={item} className="flex items-center gap-2"><Check className="size-4 text-accent" />{item}</span>
                ))}
              </div>
            </div>

            <div className="relative order-1 flex min-h-[22rem] items-center justify-center lg:order-2 lg:min-h-[38rem]">
              <div className="deal-glow" />
              <img
                src={heroBurger}
                alt=""
                aria-hidden="true"
                width={816}
                height={816}
                className="hero-food hero-food-left pointer-events-none absolute -left-6 bottom-0 z-0 w-36 opacity-95 sm:-left-10 sm:w-48 lg:w-56"
              />
              <img
                src={heroTacos}
                alt=""
                aria-hidden="true"
                width={816}
                height={816}
                className="hero-food hero-food-right pointer-events-none absolute -right-6 top-2 z-0 w-32 opacity-95 sm:-right-10 sm:w-44 lg:w-52"
              />
              <div className="hero-card-reveal relative z-10 w-[min(82vw,34rem)] opacity-90">
                <img
                  src={mealdeckDeck.url}
                  alt="MealDeck playing cards — One Order. Every Craving."
                  className="h-auto w-full drop-shadow-[0_32px_30px_var(--card-drop)]"
                  fetchPriority="high"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="ticker border-b border-border bg-card py-4" aria-label="MealDeck benefits">
          <div className="ticker-track">
            {[...ticker, ...ticker].map((item, index) => (
              <span key={`${item}-${index}`} className="flex items-center gap-8 font-display text-xs font-black uppercase text-muted-foreground">
                {item}<span className="text-primary">♦</span>
              </span>
            ))}
          </div>
        </div>

        <DeckReveal />

        <section id="brands" className="scroll-mt-24 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow">Pick your play</p>
                <h2 className="mt-3 text-4xl font-black sm:text-5xl">The complete flavour deck.</h2>
                <p className="mt-3 max-w-xl text-muted-foreground">A growing deck of kitchens, drinks and daytime favourites — aligned as one premium collection.</p>
              </div>
              <Button variant="gold" size="lg" asChild><Link to="/order">Start a mixed order <ArrowRight /></Link></Button>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-2 sm:mt-12 sm:gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
              {premiumBrands.map((brand, index) => <BrandCard key={brand.name} brand={brand} index={index} />)}
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">Brand availability depends on your delivery area and service time.</p>
          </div>
        </section>

        <section className="border-y border-border bg-card/35 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr]">
              <div>
                <p className="eyebrow">A winning hand</p>
                <h2 className="mt-3 text-4xl font-black sm:text-5xl">All the choice. None of the shuffle.</h2>
                <p className="mt-5 max-w-md leading-7 text-muted-foreground">Order direct for MealDeck-only offers, loyalty rewards and a smoother journey than juggling separate aggregator baskets.</p>
                <div className="mt-8 flex items-center gap-4 border-l-2 border-accent pl-5">
                  <BadgePoundSterling className="size-8 text-accent" />
                  <div><p className="font-display font-bold">Direct-order value</p><p className="text-sm text-muted-foreground">More of your money goes into the meal.</p></div>
                </div>
              </div>
              <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
                {benefits.map(({ icon: Icon, kicker, title, copy, suit }) => (
                  <article key={title} className="relative bg-background p-6 sm:p-7">
                    <div className="flex items-center justify-between">
                      <Icon className="size-7 text-primary" />
                      <span className="text-xs font-bold uppercase text-accent">{kicker}</span>
                    </div>
                    <h3 className="mt-7 text-xl font-bold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
                    <span className="benefit-suit" aria-hidden="true">{suit}</span>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="offers" className="scroll-mt-24 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="text-center">
              <p className="eyebrow">Offers on the table</p>
              <h2 className="mt-3 text-4xl font-black sm:text-5xl">Good deals. Clearly dealt.</h2>
              <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">No mystery cards. Every promotion shows its limit before you order.</p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 [perspective:1200px]">
              {offers.map((offer) => (
                <article key={offer.label} className="offer-card">
                  <span className={`offer-corner ${offer.suit === "♠" || offer.suit === "♣" ? "text-ink" : ""}`}>{offer.rank}<small>{offer.suit}</small></span>
                  <span className={`offer-corner offer-corner-bottom ${offer.suit === "♠" || offer.suit === "♣" ? "text-ink" : ""}`}>{offer.rank}<small>{offer.suit}</small></span>
                  <div className="relative flex h-full flex-col items-center px-7 py-9 text-center">
                    <p className="text-xs font-black uppercase text-primary">{offer.label}</p>
                    <p className="mt-7 font-display text-4xl font-black text-accent">{offer.value}</p>
                    <h3 className="mt-3 text-2xl font-bold text-ink">{offer.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-ink/65">{offer.copy}</p>
                    <div className="mt-auto w-full border-t border-ink/10 pt-4 text-[0.68rem] font-bold uppercase text-ink/50">{offer.terms}</div>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-7 text-center"><Button variant="hero" size="xl" asChild><Link to="/order">Play the current offers <Gift /></Link></Button></div>
          </div>
        </section>

        <section className="border-y border-border bg-card/35 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
              <div>
                <p className="eyebrow">Order your way</p>
                <h2 className="mt-3 text-4xl font-black sm:text-5xl">Every route leads to a full deck.</h2>
                <p className="mt-4 max-w-lg leading-7 text-muted-foreground">Start on web, order by phone or WhatsApp, or keep favourites close in the app. Your delivery stays together from checkout to doorstep.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {channels.map(({ icon: Icon, title, copy, suit }) => (
                  <div key={title} className="channel-tile">
                    <span className="channel-chip"><Icon className="size-6" strokeWidth={2.25} /></span>
                    <h3 className="mt-5 font-display text-lg font-bold">{title}</h3>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{copy}</p>
                    <span className="suit-mark" aria-hidden="true">{suit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-24 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div className="relative mx-auto w-full max-w-xl">
                <div className="tracking-panel">
                  <div className="flex items-center justify-between border-b border-border pb-5">
                    <div><p className="text-xs font-bold uppercase text-accent">Order MD-2187</p><p className="mt-1 font-display text-xl font-bold">Your hand is on the move</p></div>
                    <span className="flex size-11 items-center justify-center rounded-full bg-primary/15"><Truck className="size-5 text-primary" /></span>
                  </div>
                  <div className="mt-7 space-y-0">
                    {["Order confirmed", "Kitchens preparing", "Picked up together", "Arriving at your door"].map((step, index) => (
                      <div key={step} className="flex gap-4">
                        <div className="flex flex-col items-center"><span className={`flex size-7 items-center justify-center rounded-full ${index < 3 ? "bg-primary text-primary-foreground" : "border border-accent bg-background text-accent"}`}>{index < 3 ? <Check className="size-4" /> : <Clock3 className="size-4" />}</span>{index < 3 ? <span className="h-10 w-px bg-primary/45" /> : null}</div>
                        <div className="pb-6"><p className="text-sm font-bold">{step}</p><p className="text-xs text-muted-foreground">{index === 3 ? "Estimated 8:12 pm" : "Complete"}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <p className="eyebrow">No bluffing. Full tracking.</p>
                <h2 className="mt-3 text-4xl font-black sm:text-5xl">Know where your order stands.</h2>
                <p className="mt-5 max-w-lg leading-7 text-muted-foreground">Different kitchens, one coordinated delivery. Follow every stage from confirmation to arrival without switching screens.</p>
                <div className="mt-7 flex flex-wrap gap-3 text-sm">
                  <span className="feature-chip"><Share2 /> Share tracking</span>
                  <span className="feature-chip"><Clock3 /> Live timings</span>
                  <span className="feature-chip"><MapPin /> Driver progress</span>
                </div>
                <Button variant="gold" size="xl" className="mt-8" asChild><Link to="/track">Track an order <ArrowRight /></Link></Button>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-primary py-14 text-primary-foreground">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-8 px-4 text-center sm:px-6 lg:flex-row lg:justify-between lg:text-left">
            <div><p className="text-xs font-black uppercase">Ready to play your best hand?</p><h2 className="mt-2 text-3xl font-black sm:text-4xl">Shuffle less. Eat better.</h2><p className="mt-2 text-sm text-primary-foreground/75">Mix the brands you want and let MealDeck handle the rest.</p></div>
            <Button variant="gold" size="xl" asChild><Link to="/order">Start your order <Crown /></Link></Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}