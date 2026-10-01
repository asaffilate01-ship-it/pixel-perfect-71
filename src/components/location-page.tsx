import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { brands } from "@/lib/mealdeck";

type Props = {
  town: string;
  postcode: string;
  intro: string;
  hours: string;
  fulfilment: string;
  areas: string[];
  includeCafe1: boolean;
  faqs: { q: string; a: string }[];
};

const suits = ["♥", "♦", "♠", "♣"];

export function LocationPage({ town, postcode, intro, hours, fulfilment, areas, includeCafe1, faqs }: Props) {
  const list = brands.filter((b) => includeCafe1 || b.id !== "cafe1");
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-accent">♦ MealDeck {town}</p>
        <h1 className="mt-3 font-display text-4xl font-black sm:text-6xl">Food delivery in {town}.<br /><span className="text-accent">Every craving, one hand.</span></h1>
        <p className="mt-5 max-w-3xl text-lg text-muted-foreground">{intro}</p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full border border-accent/50 px-4 py-2">{hours}</span>
          <span className="rounded-full border border-accent/50 px-4 py-2">{fulfilment}</span>
          <span className="rounded-full border border-accent/50 px-4 py-2">{postcode} postcodes</span>
        </div>
        <Button asChild size="lg" className="mt-8"><Link to="/order">Order in {town}</Link></Button>

        <h2 className="mt-16 font-display text-3xl font-black">The {town} deck</h2>
        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((b, i) => {
            const s = suits[i % 4];
            const red = s === "♥" || s === "♦";
            return (
              <div key={b.id} className="relative rounded-xl border-4 border-accent/60 p-5 pt-9 shadow-lg" style={{ background: "#f6eedc", color: "#1a0d0d" }}>
                <span className={`absolute left-2 top-1 font-display font-black ${red ? "text-primary" : ""}`}>{s}</span>
                <span className={`absolute bottom-1 right-2 rotate-180 font-display font-black ${red ? "text-primary" : ""}`}>{s}</span>
                <h3 className="font-display text-lg font-black">{b.name}</h3>
                <p className="text-sm" style={{ color: "#4a3a33" }}>{b.category}</p>
              </div>
            );
          })}
        </div>

        <h2 className="mt-16 font-display text-3xl font-black">Areas we deliver to</h2>
        <p className="mt-3 text-muted-foreground">{areas.join(" · ")}</p>

        <h2 className="mt-16 font-display text-3xl font-black">Why order direct in {town}?</h2>
        <ul className="mt-4 grid gap-3 text-muted-foreground sm:grid-cols-2">
          <li>♥ Mix brands in one basket with one delivery fee</li>
          <li>♦ Group ordering and split payments</li>
          <li>♠ Loyalty points and limited offers</li>
          <li>♣ Order on web, app, WhatsApp or phone with live tracking</li>
        </ul>

        <h2 className="mt-16 font-display text-3xl font-black">{town} FAQs</h2>
        <div className="mt-4 space-y-4">
          {faqs.map((f) => (
            <details key={f.q} className="rounded-xl border border-border bg-card p-5">
              <summary className="cursor-pointer font-display font-bold">{f.q}</summary>
              <p className="mt-2 text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-12 text-muted-foreground">Hungry for ideas? <Link to="/blog" className="text-accent underline">Read the Deck Blog</Link>.</p>
      </main>
      <SiteFooter />
    </div>
  );
}
