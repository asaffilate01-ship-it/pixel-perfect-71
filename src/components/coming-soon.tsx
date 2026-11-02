import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { marketplaceItemPhoto } from "@/lib/marketplace-photos";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { brands, locations, sampleMenu, formatPence, type LocationKey } from "@/lib/mealdeck";

export function ComingSoonBanner() {
  return <aside role="status" className="md-launch-banner">
    <strong className="text-accent">Coming soon</strong><span>Browse only — registration, ordering and payments are closed.</span><Link to="/play">Play free games →</Link>
  </aside>;
}

export function OrderingPreview() {
  const [location, setLocation] = useState<LocationKey>("luton");
  const [search, setSearch] = useState("");
  const items = sampleMenu(location).filter(item =>
    (item.name + " " + (brands.find(b => b.id === item.brandId)?.name ?? "")).toLowerCase().includes(search.toLowerCase()));
  return <div className="md-marketing-shell"><SiteHeader />
    <main className="mx-auto max-w-6xl px-5 py-12">
      <p className="font-bold uppercase tracking-widest text-accent">MealDeck · Coming soon</p>
      <h1 className="mt-3 text-4xl font-bold">Every craving. Coming soon.</h1>
      <p className="mt-4 text-muted-foreground">Explore our preview menu. Registration, baskets, checkout and payments are closed until launch. Menu items and prices may change.</p>
      <div className="my-8 flex flex-wrap gap-3">
        {locations.map(place => <button key={place.key} type="button" aria-pressed={location === place.key}
          className="rounded-xl border border-primary/40 px-5 py-3" onClick={() => setLocation(place.key)}>{place.town}</button>)}
        <label className="grow"> <span className="sr-only">Search preview menu</span>
          <input type="search" className="w-full rounded-xl border border-[var(--md-line)] bg-[var(--md-paper)] px-4 py-3 text-[var(--md-black)] placeholder:text-[var(--md-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-red)]" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search dishes or brands" />
        </label>
      </div>
      <section aria-label="WhatsApp ordering launch preview" className="mb-7 flex flex-col gap-4 rounded-xl bg-[var(--md-black)] p-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <MessageCircle className="size-6 shrink-0 text-[var(--md-yellow)]" aria-hidden="true" />
            <h2 className="font-display text-xl font-bold sm:text-2xl">One basket. A conversation away.</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-white/85">
            WhatsApp ordering assistance is being prepared with Dishbee and Omniqora.
            When available, you will be able to discuss dishes across our brands,
            confirm the current menu and complete payment securely. A chat alone is not an order.
          </p>
        </div>
        <span className="inline-flex shrink-0 self-start rounded-full border border-white/50 px-3 py-2 text-xs font-semibold text-white">
          Coming soon
        </span>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(item => {
          const brand = brands.find(b => b.id === item.brandId);
          const photo = marketplaceItemPhoto(item, brand);
          return <article key={item.id} className="overflow-hidden rounded-xl bg-[var(--md-paper)] text-[var(--md-black)] shadow-sm">
            {photo.src ? <div className="relative aspect-[16/9] overflow-hidden bg-[var(--md-line)]">
              <img src={photo.src} alt="" loading="lazy" className="h-full w-full object-cover" />
              {photo.illustrative ? <span className="absolute bottom-2 right-2 rounded bg-black/85 px-2 py-1 text-[11px] font-semibold text-white">Illustrative image</span> : null}
            </div> : null}
            <div className="p-5">
              <p className="text-sm font-bold text-[var(--md-red-deep)]">{brand?.name ?? "MealDeck"}</p>
              <h2 className="mt-2 font-display text-xl font-bold">{item.name}</h2>
              {item.description && <p className="mt-2 text-sm leading-relaxed text-[var(--md-muted)]">{item.description}</p>}
              <p className="mt-4 font-bold">{formatPence(item.pricePence)} <span className="text-xs font-normal text-[var(--md-muted)]">Illustrative preview price</span></p>
              <p className="mt-3 text-sm font-semibold text-[var(--md-red-deep)]">Ordering not yet open</p>
            </div>
          </article>;
        })}
      </div>
      {!items.length && <p role="status">No dishes match. Try another search or location.</p>}
      <div className="mt-10 flex flex-wrap gap-4"><Link to="/" className="md-btn md-btn-yellow">Explore our brands</Link><Link to="/play" className="md-btn">Try the free games</Link></div>
    </main><SiteFooter /></div>;
}


export function ComingSoonPage({ title = "Coming soon" }: { title?: string }) {
  return <div className="md-marketing-shell"><SiteHeader /><main className="mx-auto max-w-3xl px-6 py-20 text-center">
    <p className="font-bold uppercase tracking-widest text-accent">MealDeck · Preview only</p><h1 className="my-5 text-4xl font-bold">{title}</h1>
    <p className="text-muted-foreground">Registration, ordering, payments and order tracking are not open yet. Browse our brands or enjoy the free arcade while we prepare to launch.</p>
    <div className="mt-8 flex flex-wrap justify-center gap-4"><Link to="/order" className="md-btn md-btn-yellow">Preview our menus</Link><Link to="/play" className="md-btn">Play free games</Link></div>
  </main><SiteFooter /></div>;
}
