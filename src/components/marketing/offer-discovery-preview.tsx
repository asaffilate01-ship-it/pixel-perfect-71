import {useState} from "react";
import {MealDeckLogo} from "@/components/mealdeck-logo";
import {suitArtwork} from "@/lib/food-suit-artwork";
import {
  PREVIEW_OFFER_FILTERS,PREVIEW_OFFERS,selectPreviewOffers,
  type PreviewOfferFilter,
} from "@/lib/mealdeck-preview-offers";

/** Interactive marketing preview only. No offers/discounts reach checkout. */
export function OfferDiscoveryPreview(){
  const [filter,setFilter]=useState<PreviewOfferFilter>("all");
  const visible=selectPreviewOffers(PREVIEW_OFFERS,filter);
  return <section id="offers" className="md-section md-section-black">
    <div className="md-section-heading md-section-heading-light">
      <p className="md-kicker">MealDeck exclusive offers</p>
      <h2>Good deals. Clearly dealt.</h2>
      <p>Explore possible offer types. These are concept previews, not active or redeemable discounts. Ordering and registration are coming soon.</p>
    </div>
    <div className="mx-auto mb-7 flex max-w-4xl flex-wrap justify-center gap-2" role="group" aria-label="Filter planned offer previews">
      {PREVIEW_OFFER_FILTERS.map(option=><button
        type="button"
        key={option.id}
        aria-pressed={filter===option.id}
        onClick={()=>setFilter(option.id)}
        className={`min-h-11 rounded-full border px-5 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-300 ${filter===option.id?"border-yellow-300 bg-yellow-300 text-black":"border-white/50 bg-transparent text-white hover:bg-white/10"}`}
      >{option.label}</button>)}
    </div>
    <div className="sr-only" role="status" aria-live="polite">{visible.length} preview offers shown for {PREVIEW_OFFER_FILTERS.find(x=>x.id===filter)?.label}.</div>
    <div className="md-offer-grid" aria-label="Planned offers preview">
      {visible.map(offer=><article key={offer.id} className="md-offer-card">
        <div className="md-offer-corner" aria-hidden="true">
          <strong>{offer.rank}</strong><img src={suitArtwork[offer.suit]} alt="" />
        </div>
        <div className="md-offer-corner md-offer-corner-br" aria-hidden="true">
          <strong>{offer.rank}</strong><img src={suitArtwork[offer.suit]} alt="" />
        </div>
        <MealDeckLogo className="md-offer-pip" decorative loading="lazy" />
        <p className="md-offer-label">{offer.label}</p>
        <h3>{offer.value}</h3>
        <p>{offer.copy}</p>
        <strong className="md-preview-label">Concept preview · Not redeemable</strong>
      </article>)}
    </div>
    <p className="md-offer-terms">Illustrative promotions only. Availability, eligibility and final terms will be announced separately. No promo codes, rewards or checkout are active.</p>
  </section>;
}
