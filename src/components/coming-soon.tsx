import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { MessageCircle,MapPin,Layers3,ShieldCheck,Users,CarFront,Truck,PackageCheck } from "lucide-react";
import {recommendCrossBrandOffers,handoffRequirements,previewFulfilments} from "@/lib/multibrand-offers";
import {planEqualGroupSplit} from "@/lib/mealdeck-group-allocation";
import {adjustSampleBasket,summariseSampleBasket,SAMPLE_MAX_ITEMS,SAMPLE_MAX_PER_DISH,type SampleBasketLine} from "@/lib/mealdeck-preview-basket";
import {BROWSE_CATEGORIES,matchesBrowseCategory,type BrowseCategory} from "@/lib/marketplace-discovery";
import { marketplaceItemPhoto } from "@/lib/marketplace-photos";
import { SiteHeader } from "./site-header";
import { MobileSampleBasketBar } from "./order/mobile-sample-basket-bar";
import { SiteFooter } from "./site-footer";
import { brands, locations, sampleMenu, formatPence, type LocationKey, type FulfilmentType } from "@/lib/mealdeck";

export function ComingSoonBanner() {
  return <aside role="status" className="md-launch-banner">
    <strong className="text-accent">Coming soon</strong><span>Browse only — registration, ordering and payments are closed.</span><Link to="/play">Play free games →</Link>
  </aside>;
}

export function OrderingPreview() {
  const [location,setLocation]=useState<LocationKey>("luton");
  const [search,setSearch]=useState("");
  const [activeBrand,setActiveBrand]=useState<string>("all");
  const [activeCategory,setActiveCategory]=useState<BrowseCategory>("all");
  const [previewLines,setPreviewLines]=useState<SampleBasketLine[]>([]);
  const [fulfilment,setFulfilment]=useState<FulfilmentType>("delivery");
  const [postcode,setPostcode]=useState("");
  const [groupEnabled,setGroupEnabled]=useState(false);
  const [participants,setParticipants]=useState(3);

  const menu=sampleMenu(location);
  const allowed=previewFulfilments(location);
  const allBrandIds=[...new Set(menu.map(x=>x.brandId))];
  const brandsHere=allBrandIds.map(id=>brands.find(b=>b.id===id)).filter((b):b is (typeof brands)[number]=>!!b);
  const filtered=menu.filter(item=>
    (activeBrand==="all"||item.brandId===activeBrand)&&
    matchesBrowseCategory(item,activeCategory,brands.find(b=>b.id===item.brandId))&&
    (item.name+" "+(brands.find(b=>b.id===item.brandId)?.name??"")+" "+item.category)
      .toLowerCase().includes(search.trim().toLowerCase()));
  const previewItems=previewLines.map(line=>line.item);
  const summary=summariseSampleBasket(previewLines);
  const offers=recommendCrossBrandOffers({menu,cart:previewItems});
  const estimate=summary.subtotalPence;
  const split=planEqualGroupSplit({
    participantIds:Array.from({length:participants},(_,index)=>"guest_"+(index+1)),
    goodsPence:estimate,deliveryPence:0,deliveryPayer:"shared",
  });
  function switchLocation(key:LocationKey){
    setLocation(key);
    setActiveBrand("all");
    setActiveCategory("all");
    setSearch("");
    setPostcode("");
    setPreviewLines([]);
    setFulfilment("delivery");
  }
  return <div className="md-marketing-shell"><SiteHeader/>
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <p className="font-bold uppercase tracking-widest text-[var(--md-red-deep)]">MealDeck · Multibrand preview</p>
      <h1 className="mt-3 font-display text-4xl font-black sm:text-5xl">Every craving. One deck.</h1>
      <p className="mt-4 max-w-3xl text-[var(--md-muted)]">Explore individual brand menus, discover cross-brand pairings and plan a group basket. This is a non-transactional preview; prices are illustrative and orders, payments and delivery bookings remain closed.</p>

      <section aria-label="Location and fulfilment preview" className="mt-7 grid gap-4 rounded-3xl border border-[var(--md-line)] bg-[var(--md-paper)] p-5 text-[var(--md-black)] shadow-sm lg:grid-cols-[1fr_1fr_1.4fr]">
        <div>
          <label className="block text-xs font-black uppercase tracking-wide text-[var(--md-muted)]" htmlFor="preview-location">Choose a kitchen to preview</label>
          <select id="preview-location" value={location} onChange={e=>switchLocation(e.target.value as LocationKey)}
            className="mt-2 min-h-12 w-full rounded-xl border border-[var(--md-line)] bg-white px-3 font-semibold">
            {locations.map(place=><option key={place.key} value={place.key}>{place.town} · preview</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="preview-postcode" className="block text-xs font-black uppercase tracking-wide text-[var(--md-muted)]">Your postcode</label>
          <div className="relative mt-2"><MapPin className="absolute left-3 top-3.5 size-5 text-[var(--md-muted)]"/>
            <input id="preview-postcode" type="text" autoComplete="postal-code" value={postcode}
              onChange={e=>setPostcode(e.target.value.toUpperCase().slice(0,10))}
              placeholder="e.g. LU1 2AB" className="min-h-12 w-full rounded-xl border border-[var(--md-line)] bg-white pl-10 pr-3"/>
          </div>
          <p className="mt-2 text-xs text-[var(--md-muted)]">Postcode availability will be checked live through Dishbee at launch. Entering it here does not confirm serviceability.</p>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-[var(--md-muted)]">Choose how you would order</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {allowed.map(method=><button key={method} type="button" aria-pressed={fulfilment===method}
              onClick={()=>setFulfilment(method)}
              className={fulfilment===method?"min-h-11 rounded-xl bg-[var(--md-black)] px-4 text-sm font-bold text-white":"min-h-11 rounded-xl border border-[var(--md-line)] bg-white px-4 text-sm font-semibold"}>
              {method==="curbside"?"Kerbside":method==="pickup"?"Pickup":"Delivery"}
            </button>)}
          </div>
          <p className="mt-2 text-xs text-[var(--md-muted)]">{location==="stalbans"?"MealDeck St Albans preview is delivery only. Café1 has separate ordering rules.":"Luton fulfilment choices are illustrative until the kitchen approves them."}</p>
        </div>
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="font-display text-2xl font-black">Explore brand menus</h2>
          <p className="mt-1 text-sm text-[var(--md-muted)]">Switch brands or view every cuisine together.</p>
        </div>
        <label className="w-full sm:max-w-sm"><span className="sr-only">Search dishes and brands</span>
          <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search burgers, tacos, drinks…" className="min-h-12 w-full rounded-xl border border-[var(--md-line)] bg-[var(--md-paper)] px-4 text-[var(--md-black)]"/>
        </label>
      </div>
      <nav aria-label="Filter preview dishes by category" className="mt-5 flex gap-2 overflow-x-auto pb-3">
        {BROWSE_CATEGORIES.map(category=><button key={category.id} type="button"
          aria-pressed={activeCategory===category.id}
          onClick={()=>{setActiveCategory(category.id);setActiveBrand("all");}}
          className={activeCategory===category.id?"min-h-11 shrink-0 rounded-full bg-[var(--md-red-deep)] px-4 py-2 text-sm font-bold text-white":"min-h-11 shrink-0 rounded-full border border-[var(--md-line)] bg-[var(--md-paper)] px-4 py-2 text-sm font-bold text-[var(--md-black)]"}>
          <span aria-hidden="true">{category.emoji} </span>{category.label}
        </button>)}
      </nav>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-sm text-[var(--md-muted)]">{filtered.length} illustrative dishes match your filters.</p>
        {(search.trim()||activeBrand!=="all"||activeCategory!=="all")&&<button type="button"
          onClick={()=>{setSearch("");setActiveBrand("all");setActiveCategory("all");}}
          className="min-h-11 rounded-xl border border-[var(--md-line)] bg-[var(--md-paper)] px-4 text-sm font-semibold text-[var(--md-black)] focus-visible:outline-2 focus-visible:outline-offset-2">
          Clear filters
        </button>}
      </div>
      <nav aria-label="Preview brands" className="mt-3 flex gap-2 overflow-x-auto pb-3">
        <button type="button" aria-pressed={activeBrand==="all"} onClick={()=>setActiveBrand("all")}
          className={activeBrand==="all"?"shrink-0 rounded-full bg-[var(--md-black)] px-5 py-3 text-sm font-bold text-white":"shrink-0 rounded-full border border-[var(--md-line)] bg-[var(--md-paper)] px-5 py-3 text-sm font-bold text-[var(--md-black)]"}>All brands</button>
        {brandsHere.map(brand=><button type="button" key={brand.id} aria-pressed={activeBrand===brand.id}
          onClick={()=>setActiveBrand(brand.id)}
          className={activeBrand===brand.id?"shrink-0 rounded-full bg-[var(--md-black)] px-5 py-3 text-sm font-bold text-white":"shrink-0 rounded-full border border-[var(--md-line)] bg-[var(--md-paper)] px-5 py-3 text-sm font-bold text-[var(--md-black)]"}>{brand.name}</button>)}
      </nav>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--md-line)] bg-[var(--md-paper)] p-4 text-[var(--md-black)]" aria-label="Sample basket summary">
        <div><strong className="block font-display text-lg">{summary.dishes} {summary.dishes===1?"dish":"dishes"} in your deck</strong>
          <span className="text-sm text-[var(--md-muted)]">{summary.brands} {summary.brands===1?"brand":"brands"} · {formatPence(estimate)} illustrative · delivery not included</span>
        </div>
        <a href="#sample-deck" className="min-h-11 rounded-xl bg-[var(--md-black)] px-5 py-3 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2">Review sample deck</a>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(item=>{
          const brand=brands.find(b=>b.id===item.brandId);
          const photo=marketplaceItemPhoto(item,brand);
          const quantity=previewLines.find(line=>line.item.id===item.id)?.quantity??0;
          return <article key={item.id} className="overflow-hidden rounded-2xl border border-[var(--md-line)] bg-[var(--md-paper)] text-[var(--md-black)] shadow-sm">
            {photo.src&&<div className="relative aspect-[16/9] overflow-hidden bg-[var(--md-line)]">
              <img src={photo.src} alt="" loading="lazy" className="h-full w-full object-cover"/>
              {photo.illustrative&&<span className="absolute bottom-2 right-2 rounded bg-black/85 px-2 py-1 text-[11px] font-semibold text-white">Illustration</span>}
            </div>}
            <div className="p-5">
              <p className="text-xs font-black uppercase tracking-wide text-[var(--md-red-deep)]">{brand?.name??"MealDeck"} · {item.category}</p>
              <h3 className="mt-2 font-display text-xl font-bold">{item.name}</h3>
              {item.description&&<p className="mt-2 text-sm leading-6 text-[var(--md-muted)]">{item.description}</p>}
              <p className="mt-4 font-black">{formatPence(item.pricePence)} <span className="text-xs font-normal text-[var(--md-muted)]">illustrative</span></p>
              <div role="group" className="mt-4 flex min-h-11 items-center gap-2" aria-label={`Sample basket quantity for ${item.name}`}>
                <button type="button" onClick={()=>setPreviewLines(lines=>adjustSampleBasket(lines,item,-1))}
                  disabled={quantity===0} aria-label={`Remove one ${item.name}`}
                  className="min-h-11 min-w-11 rounded-xl border border-[var(--md-line)] text-lg font-black transition-colors hover:bg-[var(--md-black)] hover:text-white disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2">−</button>
                <span className="min-w-0 flex-1 text-center text-sm font-bold" aria-live="polite">{quantity} in deck</span>
                <button type="button" onClick={()=>setPreviewLines(lines=>adjustSampleBasket(lines,item,1))}
                  disabled={quantity>=SAMPLE_MAX_PER_DISH||summary.dishes>=SAMPLE_MAX_ITEMS}
                  aria-label={`Add one ${item.name} to sample basket`}
                  className="min-h-11 rounded-xl bg-[var(--md-black)] px-4 font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2">+ Add</button>
              </div>
            </div>
          </article>;
        })}
      </div>
      {!filtered.length&&<div role="status" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--md-paper)] p-5 text-[var(--md-black)]">
        <p>No illustrative dishes match these filters.</p>
        <button type="button" onClick={()=>{setSearch("");setActiveBrand("all");setActiveCategory("all");}}
          className="min-h-11 rounded-xl border border-[var(--md-line)] px-4 font-bold">Clear filters</button>
      </div>}

      <div className="mt-9 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <section aria-label="Suggested cross-brand pairings" className="rounded-2xl border border-[var(--md-line)] bg-[var(--md-paper)] p-5 text-[var(--md-black)]">
          <h2 className="font-display text-xl font-black">Made for your cravings</h2>
          <p className="mt-2 text-sm text-[var(--md-muted)]">Try cross-brand combinations. Actual upgrades and discounts will be confirmed from the live menu.</p>
          {offers.length?<div className="mt-4 grid gap-3">
            {offers.map(offer=><div key={offer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--md-line)] p-4">
              <div><p className="text-xs font-black text-[var(--md-red-deep)]">{brands.find(x=>x.id===offer.target.brandId)?.name}</p>
                <p className="mt-1 font-bold">{offer.label}</p>
                <p className="text-sm text-[var(--md-muted)]">{offer.target.name} · {formatPence(offer.indicativePricePence)} illustrative</p>
              </div>
              <button type="button" onClick={()=>setPreviewLines(lines=>adjustSampleBasket(lines,offer.target,1))}
                disabled={(previewLines.find(line=>line.item.id===offer.target.id)?.quantity??0)>=SAMPLE_MAX_PER_DISH||summary.dishes>=SAMPLE_MAX_ITEMS}
                aria-label={`Add one ${offer.target.name} to sample basket`}
                className="min-h-11 rounded-xl bg-[var(--md-black)] px-4 text-sm font-bold text-white disabled:opacity-40">+ Add to deck</button>
            </div>)}
          </div>:<p className="mt-5 text-sm text-[var(--md-muted)]">Add a sample dish to see cross-brand pairing ideas.</p>}
          <p className="mt-4 text-xs text-[var(--md-muted)]">Only eligible live products will be offered when ordering opens. Suggested upgrades do not automatically replace a side or apply a discount.</p>
        </section>
        <section id="sample-deck" aria-label="Sample shared basket" className="scroll-mt-28 rounded-2xl border border-[var(--md-line)] bg-[var(--md-paper)] p-5 text-[var(--md-black)]">
          <h2 className="font-display text-xl font-black">Your sample deck</h2>
          <p className="mt-2 text-sm text-[var(--md-muted)]">{summary.dishes} dishes from {summary.brands} {summary.brands===1?"brand":"brands"} · illustrative subtotal {formatPence(estimate)}</p>
          {previewLines.length?<ul className="mt-4 space-y-3">{previewLines.map(({item,quantity})=><li key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--md-line)] pb-3 text-sm">
            <div className="min-w-0 flex-1"><strong className="block">{item.name}</strong>
              <span className="text-xs text-[var(--md-muted)]">{brands.find(brand=>brand.id===item.brandId)?.name??"MealDeck"} · {quantity} × {formatPence(item.pricePence)}</span></div>
            <strong>{formatPence(quantity*item.pricePence)}</strong>
            <div className="flex items-center gap-2">
              <button type="button" onClick={()=>setPreviewLines(lines=>adjustSampleBasket(lines,item,-1))}
                aria-label={`Remove one ${item.name}`}
                className="min-h-11 min-w-11 rounded-lg border border-[var(--md-line)] text-lg font-black">−</button>
              <span aria-label={`Quantity ${quantity}`} className="w-5 text-center font-bold">{quantity}</span>
              <button type="button" onClick={()=>setPreviewLines(lines=>adjustSampleBasket(lines,item,1))}
                disabled={quantity>=SAMPLE_MAX_PER_DISH||summary.dishes>=SAMPLE_MAX_ITEMS}
                aria-label={`Add one ${item.name}`}
                className="min-h-11 min-w-11 rounded-lg border border-[var(--md-line)] text-lg font-black disabled:opacity-40">+</button>
            </div>
          </li>)}</ul>:<p className="mt-4 text-sm text-[var(--md-muted)]">Choose dishes from different brands to preview a combined basket.</p>}
          <label className="mt-5 flex items-center gap-3 rounded-xl border border-[var(--md-line)] p-3 text-sm font-semibold">
            <input type="checkbox" checked={groupEnabled} onChange={e=>setGroupEnabled(e.target.checked)} className="size-5"/>
            Invite friends and split the order (preview)
          </label>
          {groupEnabled&&<div className="mt-3 space-y-2">
            <label htmlFor="sample-participants" className="text-sm font-semibold">People sharing (including host)</label>
            <select id="sample-participants" value={participants} onChange={e=>setParticipants(Number(e.target.value))}
              className="min-h-11 w-full rounded-xl border border-[var(--md-line)] px-3">
              {[2,3,4,5,6,8,10].map(n=><option key={n} value={n}>{n} people</option>)}
            </select>
            <p className="text-sm text-[var(--md-muted)]">Exact-penny goods-only illustration. A single delivery charge is calculated at live checkout; no invitation or payment is sent here.</p>
            {split.valid&&summary.dishes>0&&<div role="status" className="rounded-xl bg-white p-3">
              <p className="mb-2 text-xs font-black uppercase tracking-wide">Illustrative equal-share breakdown</p>
              <ul className="space-y-2">{split.shares.map((share,index)=><li key={share.participantId} className="flex justify-between gap-3 text-sm">
                <span>{index===0?"Host":"Guest "+(index+1)}</span><strong>{formatPence(share.duePence)}</strong>
              </li>)}</ul>
              <p className="mt-2 text-xs text-[var(--md-muted)]">Total {formatPence(split.totalPence)}; the penny remainder is assigned deterministically. Delivery excluded.</p>
            </div>}
            <p className="text-xs text-[var(--md-muted)]">Sample basket value: {formatPence(estimate)}. Only Dishbee's captured payment confirmation can release kitchen tickets.</p>
          </div>}
          <div className="mt-5 rounded-xl border border-[var(--md-line)] p-4 text-sm">
            <p className="font-black">Handoff checklist · {fulfilment==="curbside"?"kerbside":fulfilment}</p>
            <ul className="mt-3 space-y-2">{handoffRequirements(fulfilment).map(req=><li key={req} className="flex items-start gap-2">
              {fulfilment==="delivery"?<Truck className="mt-0.5 size-4 shrink-0"/>:fulfilment==="curbside"?<CarFront className="mt-0.5 size-4 shrink-0"/>:<PackageCheck className="mt-0.5 size-4 shrink-0"/>}{req}
            </li>)}</ul>
          </div>
          <p className="mt-4 text-sm font-bold text-[var(--md-red-deep)]">Preview only. No checkout, payment, delivery booking or KDS ticket is created.</p>
        </section>
      </div>
      {/* Secondary feature story follows the actual food and sample basket. */}
      <section aria-label="Future ordering capabilities" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {Icon:Layers3,title:"Every brand",desc:"One basket across eligible menus"},
          {Icon:Users,title:"Invite the table",desc:"Host pays or invitees split their share"},
          {Icon:Truck,title:"One delivery",desc:"One master order, delivery quoted once"},
          {Icon:ShieldCheck,title:"Payment-gated KDS",desc:"No kitchen release before verified payment"},
        ].map(({Icon,title,desc})=><article key={title} className="rounded-2xl border border-[var(--md-line)] bg-[var(--md-paper)] p-4 text-[var(--md-black)]">
          <Icon className="size-6 text-[var(--md-red-deep)]" aria-hidden="true"/>
          <h2 className="mt-2 font-display font-bold">{title}</h2>
          <p className="mt-1 text-sm text-[var(--md-muted)]">{desc}</p>
        </article>)}
      </section>

      <section aria-label="WhatsApp coming soon" className="mt-6 rounded-2xl bg-[var(--md-black)] p-5 text-white">
        <div className="flex items-start gap-3">
          <MessageCircle className="mt-1 size-6 shrink-0 text-[var(--md-yellow)]"/>
          <div><h2 className="font-display text-xl font-bold">Website, app and WhatsApp — one kitchen system</h2>
            <p className="mt-2 text-sm leading-6 text-white/80">We are preparing one Dishbee-powered order journey across all channels. Verified payment, brand-specific KDS, invitation payments, handoff codes and courier tracking are required before launch. A WhatsApp conversation alone will never be a paid order.</p>
          </div>
        </div>
      </section>

      <div className="mt-10 flex flex-wrap gap-4"><Link to="/" className="md-btn md-btn-yellow">Explore the brands</Link><Link to="/play" className="md-btn">Play free games</Link></div>
      <MobileSampleBasketBar summary={summary}/>
    </main><SiteFooter/></div>;
}


export function ComingSoonPage({ title = "Coming soon" }: { title?: string }) {
  return <div className="md-marketing-shell"><SiteHeader /><main className="mx-auto max-w-3xl px-6 py-20 text-center">
    <p className="font-bold uppercase tracking-widest text-accent">MealDeck · Preview only</p><h1 className="my-5 text-4xl font-bold">{title}</h1>
    <p className="text-muted-foreground">Registration, ordering, payments and order tracking are not open yet. Browse our brands or enjoy the free arcade while we prepare to launch.</p>
    <div className="mt-8 flex flex-wrap justify-center gap-4"><Link to="/order" className="md-btn md-btn-yellow">Preview our menus</Link><Link to="/play" className="md-btn">Play free games</Link></div>
  </main><SiteFooter /></div>;
}
