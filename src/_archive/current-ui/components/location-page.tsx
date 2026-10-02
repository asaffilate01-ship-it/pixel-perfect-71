import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { brands } from "@/lib/mealdeck";

type Props = {
  town: string;
  intro: string;
  hours: string;
  fulfilment: string;
  areas: string[];
  includeCafe1: boolean;
  faqs: { q: string; a: string }[];
};

const suits = ["♥", "♦", "♠", "♣"];
const ranks = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];

export function LocationPage({ town, intro, hours, fulfilment, areas, includeCafe1, faqs }: Props) {
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
          <span className="rounded-full border border-accent/50 px-4 py-2">Selected areas in &amp; around {town}</span>
        </div>
        <Button asChild size="lg" className="mt-8"><Link to="/order">Order in {town}</Link></Button>

        <h2 className="mt-16 font-display text-3xl font-black">The {town} deck</h2>
        <div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-5 sm:gap-3 lg:grid-cols-8">
          {list.map((b, i) => {
            const s = suits[i % 4];
            const rank = ranks[i % ranks.length];
            const red = s === "♥" || s === "♦";
            return (
              <div key={b.id} className="relative flex aspect-[2.5/3.5] flex-col items-center justify-center gap-1 rounded-lg border-2 border-accent/60 bg-paper p-2 text-center text-ink shadow-lg">
                <span className={`absolute left-1 top-0.5 font-display text-[0.65rem] font-black leading-none ${red ? "text-primary" : ""}`}>{rank}<br />{s}</span>
                <span className={`absolute bottom-0.5 right-1 rotate-180 font-display text-[0.65rem] font-black leading-none ${red ? "text-primary" : ""}`}>{rank}<br />{s}</span>
                {"logo" in b && b.logo ? (
                  <img src={b.logo} alt={b.name} className="h-[62%] w-[84%] object-contain" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                ) : null}
                <h3 className="font-display text-[0.6rem] font-black leading-tight sm:text-xs">{b.name}</h3>
              </div>
            );
          })}
        </div>

        <h2 className="mt-16 font-display text-3xl font-black">Areas we serve</h2>
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
