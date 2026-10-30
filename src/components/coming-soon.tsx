import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { BROWSE_CATEGORIES, browseMenu, refineMenuPrice, type BrowseCategory, type MenuPriceSort } from "@/lib/marketplace-discovery";
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
  const [category, setCategory] = useState<BrowseCategory>("all");
  const [budget, setBudget] = useState("all");
  const [priceSort, setPriceSort] = useState<MenuPriceSort>("menu");
  const menu = sampleMenu(location);
  const items = refineMenuPrice(browseMenu(menu, null, category, search, brands), budget === "all" ? null : Number(budget), priceSort);
  const categories = BROWSE_CATEGORIES.filter(entry => entry.id === "all" || browseMenu(menu, null, entry.id, "", brands).length > 0);
  function resetFilters() { setSearch(""); setCategory("all"); setBudget("all"); setPriceSort("menu"); }
  return <div className="md-marketing-shell"><SiteHeader />
    <main className="mx-auto max-w-6xl px-5 py-12">
      <p className="font-bold uppercase tracking-widest text-accent">MealDeck · Coming soon</p>
      <h1 className="mt-3 text-4xl font-bold">Every craving. Coming soon.</h1>
      <p className="mt-4 text-muted-foreground">Explore our preview menu. Registration, baskets, checkout and payments are closed until launch. Menu items and prices may change.</p>
      <div className="my-8 flex flex-wrap gap-3">
        {locations.map(place => <button key={place.key} type="button" aria-pressed={location === place.key}
          className="rounded-xl border border-primary/40 px-5 py-3" onClick={() => { setLocation(place.key); setCategory("all"); }}>{place.town}</button>)}
        <label className="grow"> <span className="sr-only">Search preview menu</span>
          <input type="search" className="w-full rounded-xl border border-border bg-card px-4 py-3" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search dishes or brands" />
        </label>
      </div>
      <div role="group" aria-label="Food categories" className="mb-5 flex flex-wrap gap-2">
        {categories.map(entry => <button key={entry.id} type="button" aria-pressed={category === entry.id}
          onClick={() => setCategory(entry.id)}
          className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${category === entry.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}`}>
          <span aria-hidden="true">{entry.emoji} </span>{entry.label}
        </button>)}
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">Maximum dish price
          <select value={budget} onChange={event => setBudget(event.target.value)}
            className="block min-h-11 w-full rounded-xl border border-border bg-card px-3 text-foreground">
            <option value="all">Any price</option><option value="500">Up to £5</option>
            <option value="1000">Up to £10</option><option value="1500">Up to £15</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold">Sort dishes
          <select value={priceSort} onChange={event => setPriceSort(event.target.value as MenuPriceSort)}
            className="block min-h-11 w-full rounded-xl border border-border bg-card px-3 text-foreground">
            <option value="menu">Menu order</option><option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
          </select>
        </label>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Prices shown are preview base prices. Options and delivery may cost extra.</p>
      {category === "vegetarian" ? <p className="mb-4 text-sm text-muted-foreground">Dishes explicitly labelled vegetarian, vegan or plant-based in the menu. Check ingredients and allergens with the kitchen before ordering.</p> : null}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "dish" : "dishes"} · {locations.find(place => place.key === location)?.town} preview
        </p>
        {search || category !== "all" || budget !== "all" || priceSort !== "menu" ? <button type="button" onClick={resetFilters}
          className="min-h-11 rounded-lg px-3 font-semibold text-primary underline underline-offset-4">Clear filters</button> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(item => <article key={item.id} data-price-pence={item.pricePence} className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-accent">{brands.find(b => b.id === item.brandId)?.name}</p>
          <h2 className="mt-2 text-xl font-bold">{item.name}</h2>
          {item.description && <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>}
          <p className="mt-4 font-bold">{item.hasModifiers ? "From " : ""}{formatPence(item.pricePence)} <span className="text-xs font-normal text-muted-foreground">Preview price</span></p>
          <p className="mt-3 text-sm text-accent">Coming soon</p>
        </article>)}
      </div>
      {!items.length && <p role="status" className="rounded-2xl border border-border bg-card p-6">No dishes match. Clear your filters or try another search or location.</p>}
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

