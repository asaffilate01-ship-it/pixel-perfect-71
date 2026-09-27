import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bike,
  CheckCircle2,
  CreditCard,
  Gift,
  LayoutGrid,
  MapPin,
  ShoppingBasket,
  Sparkles,
  Timer,
  Utensils,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { brands } from "@/lib/mealdeck";
import heroFeast from "@/assets/hero-feast.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MealDeck — One Order. Every Craving." },
      {
        name: "description",
        content:
          "Order from Taconelle, Tavo Chicken, Skorch Burgers, Load'd, Fyrra, Tarka Box, Vyta and more in one basket. One delivery fee, one checkout, delivered to your door.",
      },
      { property: "og:title", content: "MealDeck — One Order. Every Craving." },
      {
        property: "og:description",
        content:
          "Multi-brand food ordering. Mix burgers, tacos, grills and desserts in a single basket with one delivery fee.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const heroHighlights = [
  { icon: Utensils, title: "Multiple Brands", sub: "One Order" },
  { icon: Bike, title: "Fast Delivery", sub: "& Collection" },
  { icon: Gift, title: "Amazing Offers", sub: "& Rewards" },
];

const steps = [
  { n: "1", icon: LayoutGrid, title: "Choose Brands", copy: "Browse our range of amazing food brands." },
  { n: "2", icon: ShoppingBasket, title: "Add to Basket", copy: "Pick your favourites from any brand." },
  { n: "3", icon: CreditCard, title: "Checkout Once", copy: "One order. One payment." },
  { n: "4", icon: Bike, title: "Fast Delivery", copy: "Get your food fresh and on time." },
];

const whyItems = [
  { icon: ShoppingBasket, title: "One Basket Across Brands", copy: "Mix your favourites from multiple brands." },
  { icon: Zap, title: "Fast & Reliable Delivery", copy: "Fresh food, on time, every time." },
  { icon: Timer, title: "Delivery Windows", copy: "Order when it suits you." },
  { icon: MapPin, title: "Live Order Tracking", copy: "From kitchen to your door." },
  { icon: Gift, title: "Exclusive Offers & Loyalty", copy: "More rewards, more moments." },
  { icon: Sparkles, title: "Multi-Location Kitchens", copy: "Great food, nearer to you." },
];

// Café1 is St Albans-only, so it only appears once a St Albans postcode is entered on the order page.
const homeBrands = brands.filter((b) => b.id !== "cafe1");

const pick = (id: string) => brands.find((b) => b.id === id)!;
const basketDemo = [
  { id: "a", brand: "Skorch Burgers", dish: "Double Smash Burger", price: "£9.99", image: pick("skorch-burgers").image },
  { id: "b", brand: "Taconelle", dish: "Classic French Taco", price: "£8.49", image: pick("taconelle").image },
  { id: "c", brand: "Icova", dish: "Iced Spanish Latte", price: "£4.50", image: pick("icova").image },
];

// Some logo files carry lots of empty margin; zoom them so all logos look the same size.
const logoZoom: Record<string, string> = { "Tavo Chicken": "scale-[1.9]", Taconelle: "scale-[2.4]", "Skorch Burgers": "scale-[1.6]", Fyrra: "scale-125", Sabzora: "scale-125" };

function LogoTile({ src, name, className = "" }: { src?: string | undefined; name: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-xl bg-foreground p-2 ${className}`}>
      {src ? (
        <img src={src} alt={`${name} logo`} loading="lazy" className={`max-h-full max-w-full object-contain ${logoZoom[name] ?? ""}`} />
      ) : (
        <span className="font-display text-sm font-bold text-background">{name}</span>
      )}
    </div>
  );
}


function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <img
          src={heroFeast}
          alt="A spread of burgers, loaded fries, tacos, grilled wings and ice cream"
          width={1536}
          height={1024}
          className="absolute inset-0 size-full object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--color-background)_18%,transparent_75%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
          <p className="eyebrow">Multi-brand food ordering</p>
          <h1 className="mt-4 max-w-2xl text-5xl font-extrabold leading-[0.95] sm:text-6xl lg:text-7xl">
            One Order.
            <br />
            <span className="text-gold">Every Craving.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground">
            Your favourite food brands. One basket. More choice. Less hassle. A tastier you.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="hero" size="xl" asChild>
              <Link to="/order">
                Order Now
                <ArrowRight />
              </Link>
            </Button>
            <Button variant="glass" size="xl" asChild>
              <Link to="/" hash="brands">
                <LayoutGrid />
                Explore Brands
              </Link>
            </Button>
          </div>

          <div className="mt-12 flex flex-wrap gap-8">
            {heroHighlights.map(({ icon: Icon, title, sub }) => (
              <div key={title} className="flex items-center gap-3">
                <Icon className="size-6 text-accent" />
                <div className="text-sm leading-tight">
                  <p className="font-semibold">{title}</p>
                  <p className="text-muted-foreground">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Brand strip */}
      <div className="border-y border-border/60 bg-card/50">
        <div className="mx-auto grid max-w-7xl grid-cols-3 gap-3 px-4 py-6 sm:grid-cols-4 sm:px-6 lg:grid-cols-11">
          {homeBrands.map((brand) => (
            <div key={brand.id} className="flex flex-col items-center gap-2 text-center">
              <LogoTile src={brand.logo} name={brand.name} className="h-16 w-full" />
              <p className="line-clamp-1 text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">
                {brand.category}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Mix brands */}
      <section className="ember-surface">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.1fr_0.7fr] lg:items-center">
          <div>
            <p className="eyebrow">Mix. Match. Enjoy.</p>
            <h2 className="mt-4 text-4xl font-extrabold leading-tight sm:text-5xl">
              Mix Brands
              <br />
              <span className="text-gold">In One Basket.</span>
            </h2>
            <p className="mt-5 max-w-md text-muted-foreground">
              Burgers, tacos, curries and more — from different brands, all in one order. Because
              one craving is never enough.
            </p>
            <Button variant="gold" size="xl" className="mt-8" asChild>
              <Link to="/" hash="how">
                See How It Works
                <ArrowRight />
              </Link>
            </Button>
          </div>

          <div className="rounded-2xl bg-foreground p-5 text-background shadow-2xl">
            <div className="flex items-baseline justify-between">
              <p className="font-display text-lg font-bold">Your Basket</p>
              <p className="text-xs opacity-60">3 items from 3 brands</p>
            </div>
            <ul className="mt-4 divide-y divide-background/10">
              {basketDemo.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <img src={item.image} alt="" width={816} height={816} loading="lazy" className="size-14 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wide text-primary">{item.brand}</p>
                    <p className="truncate text-sm font-medium">{item.dish}</p>
                  </div>
                  <p className="font-semibold">{item.price}</p>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-background/10 pt-4">
              <p className="font-display text-lg font-bold">Total £25.97</p>
              <Button variant="hero" asChild>
                <Link to="/order">Checkout Once <ArrowRight /></Link>
              </Button>
            </div>
          </div>

          <ul className="space-y-3">
            {["Different brands", "One delivery fee", "One simple checkout", "One amazing meal"].map((text) => (
              <li key={text} className="flex items-center gap-3">
                <CheckCircle2 className="size-5 shrink-0 text-primary" />
                <span className="font-medium">{text}</span>
              </li>
            ))}
            <li className="script pt-2 text-3xl text-accent">Cravings belong together</li>
          </ul>
        </div>
      </section>

      {/* Brands */}
      <section id="brands" className="scroll-mt-24 border-t border-border/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p className="eyebrow">Our brands</p>
          <h2 className="mt-3 text-4xl font-extrabold sm:text-5xl">
            A World of Flavour Under One Deck.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Unique brands. Distinct flavours. One seamless ordering experience.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {homeBrands.map((brand) => (
              <Link
                key={brand.id}
                to="/order"
                search={{ brand: brand.id }}
                className="card-elevated group flex flex-col overflow-hidden transition-transform hover:-translate-y-1"
              >
                <div className="p-3 pb-0">
                  <LogoTile src={brand.logo} name={brand.name} className="h-16 w-full" />
                </div>
                <div className="aspect-square overflow-hidden p-3">
                  <img
                    src={brand.image}
                    alt={`${brand.name} — ${brand.category}`}
                    width={816}
                    height={816}
                    loading="lazy"
                    className="size-full rounded-lg object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="mt-auto px-3 pb-4 text-center">
                  <p className="text-sm text-muted-foreground">{brand.tagline}</p>
                  {brand.id === "icova" || brand.id === "moktl" ? (
                    <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-gold">Add-on drinks</p>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-24 ember-surface border-t border-border/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 text-4xl font-extrabold sm:text-5xl">Ordering is Easy.</h2>
          <p className="mt-3 text-muted-foreground">Great food, simpler than ever.</p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ n, icon: Icon, title, copy }) => (
              <div key={n} className="card-elevated relative p-6">
                <span className="absolute -top-3 left-6 flex size-8 items-center justify-center rounded-full bg-[image:var(--gradient-flame)] font-display text-sm font-bold text-primary-foreground">
                  {n}
                </span>
                <Icon className="mt-2 size-8 text-accent" />
                <p className="mt-4 font-display text-lg font-bold">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why MealDeck */}
      <section className="border-t border-border/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p className="eyebrow">Why MealDeck</p>
          <h2 className="mt-3 text-4xl font-extrabold sm:text-5xl">More Than a Food Order.</h2>
          <p className="mt-3 text-muted-foreground">A better way to enjoy the food you love.</p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {whyItems.map(({ icon: Icon, title, copy }) => (
              <div key={title} className="card-elevated flex gap-4 p-6">
                <Icon className="size-6 shrink-0 text-primary" />
                <div>
                  <p className="font-display font-bold">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Offers */}
      <section
        id="offers"
        className="scroll-mt-24 bg-[image:var(--gradient-gold)] py-12 text-accent-foreground"
      >
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 text-center sm:px-6 lg:flex-row lg:justify-between lg:text-left">
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-[0.2em]">
              Special offers
            </p>
            <h2 className="mt-2 text-3xl font-extrabold">Good Food Rewards You.</h2>
            <p className="mt-1 text-sm font-medium opacity-80">
              Exclusive offers, loyalty rewards and more — only on MealDeck.
            </p>
          </div>
          <Button variant="hero" size="xl" asChild>
            <Link to="/order">
              View Offers
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
