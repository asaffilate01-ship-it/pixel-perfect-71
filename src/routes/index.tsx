import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Bike,
  BrainCircuit,
  CarFront,
  CheckCircle2,
  ChefHat,
  CreditCard,
  Gift,
  LayoutGrid,
  MapPin,
  MessageCircleMore,
  PackageSearch,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Store,
  Utensils,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import {
  addonBrandIds,
  brandById,
  brands,
  locationByKey,
  lutonPrimaryBrandIds,
} from "@/lib/mealdeck";
import heroFeast from "@/assets/hero-feast.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MealDeck — One Order. Every Craving." },
      {
        name: "description",
        content:
          "MealDeck brings multiple food brands into one basket, one checkout and one fulfilment experience, powered operationally by Dishbee.",
      },
      { property: "og:title", content: "MealDeck — One Order. Every Craving." },
      {
        property: "og:description",
        content:
          "Enter your postcode, choose your MealDeck brands, checkout once and get one pickup, kerbside or delivery experience where available.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const heroHighlights = [
  { icon: Utensils, title: "Multiple Brands", sub: "One Basket" },
  { icon: Bike, title: "Smart Fulfilment", sub: "One Handoff" },
  { icon: Gift, title: "Offers & Loyalty", sub: "Across MealDeck" },
];

const steps = [
  { n: "1", icon: MapPin, title: "Enter Postcode", copy: "We resolve the MealDeck kitchen serving your area." },
  { n: "2", icon: LayoutGrid, title: "Choose Brands", copy: "Move between brands without losing your basket." },
  { n: "3", icon: CreditCard, title: "Checkout Once", copy: "One payment flow for the whole multi-brand order." },
  { n: "4", icon: Bike, title: "One Handoff", copy: "Pickup, kerbside or delivery where that location supports it." },
];

const whyItems = [
  { icon: ShoppingBasket, title: "One Basket Across Brands", copy: "Mix favourites from multiple concepts without restarting your order." },
  { icon: Zap, title: "Fast Brand Switching", copy: "Powerful navigation on desktop and mobile keeps the journey frictionless." },
  { icon: Store, title: "Pickup, Kerbside or Delivery", copy: "The postcode engine shows only fulfilment available at your serving kitchen." },
  { icon: MapPin, title: "Location-Aware Menus", copy: "Brands, menus, prices and hours can differ by MealDeck kitchen." },
  { icon: Gift, title: "Icova & Moktl Add-ons", copy: "Cross-sell coffee and zero-proof drinks across the other menus." },
  { icon: ShieldCheck, title: "Paid-Only Kitchen Release", copy: "Dishbee releases the order to KDS only after payment confirmation." },
];

const ecosystem = [
  {
    name: "Dishbee",
    kicker: "Operations engine",
    icon: ChefHat,
    tone: "text-amber-300",
    bullets: [
      "Menus, modifiers and channel pricing",
      "EPOS, KDS, stock and restaurant operations",
      "Checkout, payments and paid-only kitchen release",
      "Pickup, kerbside and delivery orchestration",
    ],
  },
  {
    name: "Haccora",
    kicker: "Compliance layer",
    icon: ShieldCheck,
    tone: "text-cyan-300",
    bullets: [
      "Food-safety and HACCP workflows",
      "Operational compliance records and evidence",
      "Supplier/compliance controls and assurance",
      "Location-level compliance visibility",
    ],
  },
  {
    name: "Omniqora",
    kicker: "Intelligence & growth",
    icon: BrainCircuit,
    tone: "text-violet-300",
    bullets: [
      "AI assistants, CRM and customer intelligence",
      "WhatsApp, voice and communications",
      "Automation, marketing and loyalty",
      "Analytics and agentic operational workflows",
    ],
  },
];

function Landing() {
  const addonBrands = addonBrandIds.map((id) => brandById(id)).filter(Boolean);
  const primaryPreview = lutonPrimaryBrandIds
    .slice(0, 6)
    .map((id) => brandById(id))
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="relative overflow-hidden border-b border-border/60">
        <img
          src={heroFeast}
          alt="A premium spread of MealDeck food"
          width={1536}
          height={1024}
          className="absolute inset-0 size-full object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--color-background)_8%,rgba(9,9,9,.86)_42%,rgba(9,9,9,.25)_100%)]" />

        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-24">
          <div>
            <p className="eyebrow">Multi-brand food ordering</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-extrabold leading-[0.92] sm:text-6xl lg:text-7xl">
              One Order.
              <br />
              <span className="text-gold">Every Craving.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Enter your postcode, see the brands your local MealDeck kitchen can fulfil,
              mix them in one basket and checkout once.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="hero" size="xl" asChild>
                <Link to="/order" search={{ fulfilment: "delivery" }}>
                  Start Ordering
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

            <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
              {heroHighlights.map(({ icon: Icon, title, sub }) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                  <Icon className="size-5 text-accent" />
                  <p className="mt-3 font-display text-sm font-bold">{title}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-8 rounded-full bg-accent/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-black/65 p-4 shadow-2xl backdrop-blur-xl sm:p-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-accent">MealDeck app</p>
                  <p className="font-display text-xl font-bold">Multiple brands. One basket.</p>
                </div>
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300">
                  Luton live
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {primaryPreview.map((brand) =>
                  brand ? (
                    <div key={brand.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                      <img src={brand.image} alt={brand.name} className="h-20 w-full object-cover" />
                      <div className="p-2">
                        <p className="truncate font-display text-xs font-bold">{brand.name}</p>
                      </div>
                    </div>
                  ) : null,
                )}
              </div>

              <div className="mt-3 flex gap-2">
                {addonBrands.map((brand) =>
                  brand ? (
                    <div key={brand.id} className="flex flex-1 items-center gap-2 rounded-2xl border border-accent/20 bg-accent/5 p-2">
                      <img src={brand.image} alt="" className="size-9 rounded-lg object-cover" />
                      <span>
                        <span className="block text-[10px] uppercase tracking-[0.12em] text-accent">Add-on</span>
                        <span className="block font-display text-xs font-bold">{brand.name}</span>
                      </span>
                    </div>
                  ) : null,
                )}
              </div>

              <div className="mt-4 rounded-2xl bg-card/80 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">3 brands in basket</span>
                  <span className="font-display font-bold">One checkout</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="hero" className="flex-1 rounded-full" asChild>
                    <Link to="/order">Build Basket</Link>
                  </Button>
                  <Button variant="glass" className="rounded-full" asChild>
                    <Link to="/order" search={{ fulfilment: "pickup" }}>
                      <Store />
                    </Link>
                  </Button>
                  <Button variant="glass" className="rounded-full" asChild>
                    <Link to="/order" search={{ fulfilment: "curbside" }}>
                      <CarFront />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
            <p className="script mt-4 text-center text-3xl text-accent">
              Different flavours. One table.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-border/60 bg-card/30">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-8 sm:px-6 lg:grid-cols-2">
          <div className="card-elevated flex items-center gap-4 p-5">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10">
              <MapPin className="size-6 text-primary" />
            </div>
            <div>
              <p className="font-display text-lg font-bold">MealDeck Luton</p>
              <p className="text-sm text-muted-foreground">
                9 primary food brands · Icova + Moktl available as cross-menu add-ons.
              </p>
              <p className="mt-1 text-xs text-accent">Delivery · Pickup · Kerbside</p>
            </div>
          </div>

          <div className="card-elevated flex items-center gap-4 p-5">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent/10">
              <Store className="size-6 text-accent" />
            </div>
            <div>
              <p className="font-display text-lg font-bold">MealDeck St Albans</p>
              <p className="text-sm text-muted-foreground">
                The same 9 brands + Café1 as the 10th primary brand · Icova + Moktl add-ons.
              </p>
              <p className="mt-1 text-xs text-accent">
                Delivery only · Mon–Fri 09:00–16:00
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="ember-surface">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow">Mix. Match. Enjoy.</p>
            <h2 className="mt-4 text-4xl font-extrabold leading-tight sm:text-5xl">
              Mix Brands
              <br />
              <span className="text-gold">In One Basket.</span>
            </h2>
            <p className="mt-5 max-w-md text-muted-foreground">
              Burgers, chicken, parathas, French tacos, bowls, grills, coffee and drinks —
              all in a single customer journey.
            </p>
            <Button variant="gold" size="xl" className="mt-8" asChild>
              <Link to="/order">
                Build Your Basket
                <ArrowRight />
              </Link>
            </Button>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              "Switch brands instantly",
              "Keep one basket",
              "One simple checkout",
              "One fulfilment handoff",
            ].map((text) => (
              <li key={text} className="card-elevated flex items-center gap-3 p-5">
                <CheckCircle2 className="size-6 shrink-0 text-primary" />
                <span className="font-medium">{text}</span>
              </li>
            ))}
            <li className="script col-span-full text-center text-3xl text-accent">
              Cravings belong together
            </li>
          </ul>
        </div>
      </section>

      <section id="brands" className="scroll-mt-24 border-t border-border/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p className="eyebrow">Our brands</p>
          <h2 className="mt-3 text-4xl font-extrabold sm:text-5xl">
            A World of Flavour Under One Deck.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Each location activates the brands it can fulfil. Icova and Moktl can also sit
            across the other menus as premium add-ons.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {brands.slice(0, 11).map((brand) => (
              <Link
                key={brand.id}
                to="/order"
                search={{ brand: brand.id }}
                className="card-elevated group overflow-hidden transition-transform hover:-translate-y-1"
              >
                <img
                  src={brand.image}
                  alt={brand.name}
                  width={816}
                  height={816}
                  loading="lazy"
                  className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="p-5">
                  <p className="font-display text-xl font-bold">{brand.name}</p>
                  <p className="text-xs uppercase tracking-[0.16em] text-accent">
                    {brand.strapline}
                  </p>
                  <p className="mt-3 text-sm text-muted-foreground">{brand.tagline}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-24 ember-surface border-t border-border/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 text-4xl font-extrabold sm:text-5xl">Ordering is Easy.</h2>
          <p className="mt-3 text-muted-foreground">
            The postcode decides the kitchen. The kitchen decides the brands, hours and fulfilment.
          </p>

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

      <section className="border-t border-border/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p className="eyebrow">Why MealDeck</p>
          <h2 className="mt-3 text-4xl font-extrabold sm:text-5xl">
            Easy for customers. Powerful underneath.
          </h2>
          <p className="mt-3 text-muted-foreground">
            The UI stays simple while Dishbee handles the operational complexity.
          </p>

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

      <section className="ember-surface border-y border-border/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr] lg:items-end">
            <div>
              <p className="eyebrow">The platform underneath</p>
              <h2 className="mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">
                Powered by
                <br />
                <span className="text-gold">Dishbee, Haccora & Omniqora.</span>
              </h2>
              <p className="mt-4 max-w-md text-muted-foreground">
                MealDeck is the customer-facing aggregator. The connected platforms power
                operations, compliance and intelligence without making the customer journey complicated.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {ecosystem.map(({ name, kicker, icon: Icon, tone, bullets }) => (
                <article key={name} className="card-elevated p-5">
                  <Icon className={`size-7 ${tone}`} />
                  <p className="mt-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {kicker}
                  </p>
                  <h3 className="mt-1 font-display text-2xl font-bold">{name}</h3>
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                    {bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/50 p-4">
              <PackageSearch className="size-5 text-accent" />
              <span className="text-sm">
                Dishbee routes menus and kitchen work by brand and station.
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/50 p-4">
              <MessageCircleMore className="size-5 text-accent" />
              <span className="text-sm">
                Omniqora can power WhatsApp, voice and automated customer journeys.
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/50 p-4">
              <BarChart3 className="size-5 text-accent" />
              <span className="text-sm">
                Group analytics can compare brand, location and fulfilment performance.
              </span>
            </div>
          </div>
        </div>
      </section>

      <section
        id="offers"
        className="scroll-mt-24 bg-[image:var(--gradient-gold)] py-12 text-accent-foreground"
      >
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 text-center sm:px-6 lg:flex-row lg:justify-between lg:text-left">
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-[0.2em]">
              One platform. More choice.
            </p>
            <h2 className="mt-2 text-3xl font-extrabold">
              Ready to build your MealDeck?
            </h2>
            <p className="mt-1 text-sm font-medium opacity-80">
              Enter your postcode and see exactly what your nearest MealDeck kitchen can serve.
            </p>
          </div>
          <Button variant="hero" size="xl" asChild>
            <Link to="/order">
              Start Ordering
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
