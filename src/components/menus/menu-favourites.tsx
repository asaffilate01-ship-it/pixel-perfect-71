import { Heart, X } from "lucide-react";
import { formatLaunchMenuItemPrice } from "@/lib/launch-menu-display-prices";
import { favouriteCanBeOrdered, favouriteKey, resolveMenuFavourites } from "@/lib/mealdeck-menu-favourites";
import type { LaunchMenuBrand } from "@/lib/launch-menu-catalogue";
import type { LaunchMenuEntry } from "./launch-item-customiser";
import type { useMenuFavourites } from "./use-menu-favourites";

type Favourites = ReturnType<typeof useMenuFavourites>;

export function MenuFavouriteButton({ favourites, entry }: { favourites: Favourites; entry: LaunchMenuEntry }) {
  const saved = favourites.values.some((value) =>
    favouriteKey(value.brandId, value.itemId) === favouriteKey(entry.brand.id, entry.item.id),
  );
  return (
    <button
      type="button"
      className="lm-favourite-toggle"
      aria-label={saved ? "Remove " + entry.item.name + " from favourites" : "Save " + entry.item.name + " to favourites"}
      aria-pressed={saved}
      disabled={!favourites.ready}
      onClick={() => favourites.toggle(entry.brand.id, entry.item.id, entry.item.name)}
    >
      <Heart size={20} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}

export function MenuFavourites({ favourites, catalogue, liveReady, onChoose }: {
  favourites: Favourites;
  catalogue: readonly LaunchMenuBrand[];
  liveReady: boolean;
  onChoose: (entry: LaunchMenuEntry) => void;
}) {
  const entries = resolveMenuFavourites(favourites.values, catalogue);
  return (
    <section className="lm-favourites" aria-label="Your menu favourites">
      <p className="sr-only" role="status" aria-live="polite">{favourites.notice}</p>
      <details>
        <summary><Heart size={18} aria-hidden="true" /> Your favourites <span>{favourites.values.length}</span></summary>
        <div className="lm-favourites-body">
          <p>Save dishes you like using the heart beside each menu item. Saved on this browser only; prices and choices are checked again when ordering.</p>
          {favourites.sessionOnly && <p role="status">Device storage is unavailable. Changes may only last for this visit.</p>}
          {entries.length === 0 && <p>No saved dishes yet.</p>}
          {entries.length > 0 && (
            <ul>
              {entries.map((entry) => {
                const orderable = favouriteCanBeOrdered(entry.item, liveReady);
                return (
                  <li key={favouriteKey(entry.brand.id, entry.item.id)}>
                    <button type="button" className="lm-favourite-dish" disabled={!orderable} onClick={() => onChoose(entry)}>
                      <strong>{entry.item.name}</strong>
                      <small>{entry.brand.name} · {orderable
                        ? (entry.item.priceVariants?.length ? "From " : "") + formatLaunchMenuItemPrice(entry.item)
                        : liveReady ? "Currently unavailable" : "Checking menu"}</small>
                    </button>
                    <button type="button" className="lm-favourite-toggle" aria-label={"Remove " + entry.item.name + " from favourites"}
                      onClick={() => favourites.toggle(entry.brand.id, entry.item.id, entry.item.name)}>
                      <X size={19} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {favourites.values.length > 0 && (
            <button type="button" className="lm-favourites-clear" onClick={favourites.clear}>Clear all favourites</button>
          )}
        </div>
      </details>
    </section>
  );
}
