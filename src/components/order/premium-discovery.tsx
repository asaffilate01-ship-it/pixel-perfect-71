import { ArrowLeft, ArrowRight, Heart, ShoppingBasket, Sparkles, UtensilsCrossed } from "lucide-react";
import type { Brand, MenuItem } from "@/lib/mealdeck";
import { formatPence } from "@/lib/mealdeck";
import { marketplaceItemPhoto } from "@/lib/marketplace-photos";

type GalleryProps = {
  brands: readonly Brand[];
  items: readonly MenuItem[];
  selectedBrandId: string | null;
  onSelectBrand: (id: string | null) => void;
  isOrderingOpen: boolean;
};
type FavouritesProps = {
  items: readonly MenuItem[];
  brands: readonly Brand[];
  favouriteIds: readonly string[];
  isOrderingOpen: boolean;
  onAdd: (item: MenuItem) => void;
  onRemoveFavourite: (id: string) => void;
};

export function BrandDiscoveryGallery({
  brands, items, selectedBrandId, onSelectBrand, isOrderingOpen,
}: GalleryProps) {
  const selected = selectedBrandId ? brands.find(brand=>brand.id===selectedBrandId) : null;
  if (selected) {
    return (
      <section className="md-premium-brand-feature" aria-label={`Explore ${selected.name}`}>
        <img src={selected.image} alt="" className="md-premium-brand-feature-photo" loading="lazy"/>
        <div className="md-premium-brand-feature-scrim"/>
        <div className="md-premium-brand-feature-info">
          <button type="button" className="md-premium-return" onClick={()=>onSelectBrand(null)}>
            <ArrowLeft size={17}/> All brands
          </button>
          {selected.logo ? <span className="md-premium-brand-feature-logo">
            <img src={selected.logo} alt={`${selected.name} official logo`} loading="lazy"/>
          </span> : null}
          <h3>{selected.name}</h3><p>{selected.strapline}</p>
          <span className="md-premium-count">{items.filter(item=>item.brandId===selected.id).length} available dishes</span>
        </div>
      </section>
    );
  }
  if (brands.length===0) return (
    <div className="md-premium-gallery-empty" role="status">
      No restaurants match these filters. Try a different category or search term.
    </div>
  );
  return (
    <section className="md-premium-gallery" aria-label="Discover MealDeck food brands">
      <div className="md-premium-gallery-title">
        <div><span className="md-premium-eyebrow"><Sparkles size={15}/> Pick your kitchen</span>
          <h3>Restaurants for your craving</h3>
          <p>Choose a brand, explore its menu and add items from any other brand to the same basket.</p>
        </div>
        <div className="md-premium-gallery-counter">{brands.length} brands</div>
      </div>
      <div className="md-premium-brand-grid">
        {brands.map(brand=>{
          const count=items.filter(item=>item.brandId===brand.id).length;
          return <button type="button" key={brand.id} onClick={()=>onSelectBrand(brand.id)}
            className="md-premium-brand-tile" aria-label={`Browse ${brand.name}, ${count} dishes`}>
            <img src={brand.image} alt="" className="md-premium-brand-cover" loading="lazy"/>
            <span className="md-premium-brand-cover-scrim"/>
            <span className="md-premium-logo-frame">
              {brand.logo
                ? <img src={brand.logo} alt="" loading="lazy"/>
                : <span className="md-premium-logo-fallback"><UtensilsCrossed size={25}/></span>}
            </span>
            <span className="md-premium-brand-text">
              <strong>{brand.name}</strong><small>{brand.category}</small>
              <span className="md-premium-brand-footer">
                <span>{count} dishes · {isOrderingOpen ? "Browse & order" : "Browse menu"}</span>
                <ArrowRight size={19}/>
              </span>
            </span>
          </button>;
        })}
      </div>
    </section>
  );
}

export function FavouriteDishRail({
  items, brands, favouriteIds, isOrderingOpen, onAdd, onRemoveFavourite,
}: FavouritesProps) {
  const available=items.filter(item=>favouriteIds.includes(item.id)).slice(0,12);
  if(favouriteIds.length===0 || available.length===0)return null;
  return <section className="md-premium-favourites" aria-label="Saved favourite dishes">
    <div className="md-premium-gallery-title">
      <div><span className="md-premium-eyebrow"><Heart size={14}/> Your favourites</span>
        <h3>Your saved dishes</h3><p>Saved on this browser, not tied to an account. Current availability and prices apply.</p>
      </div>
      <span className="md-premium-gallery-counter">{available.length} saved</span>
    </div>
    <div className="md-premium-fav-rail">
      {available.map(item=>{
        const brand=brands.find(b=>b.id===item.brandId);
        return <article key={item.id} className="md-premium-fav-tile">
          <img src={marketplaceItemPhoto(item, brand).src} alt="" loading="lazy"/>
          <div><small>{brand?.name||"MealDeck"}</small><strong>{item.name}</strong>
            <span>{formatPence(item.pricePence)}</span></div>
          <div className="md-premium-fav-actions">
            <button type="button" aria-label={`Remove ${item.name} from favourites`} className="md-premium-fav-remove"
              onClick={()=>onRemoveFavourite(item.id)}><Heart size={17} fill="currentColor"/></button>
            <button type="button" disabled={!isOrderingOpen} className="md-premium-fav-add"
              onClick={()=>onAdd(item)} aria-label={`Add ${item.name} to basket`}>
              <ShoppingBasket size={17}/> Add
            </button>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
