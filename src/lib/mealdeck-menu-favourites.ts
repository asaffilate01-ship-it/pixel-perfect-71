import { launchMenuBrands, type LaunchMenuBrand, type LaunchMenuItem, type LaunchMenuSection } from "./launch-menu-catalogue";

export const FAVOURITES_STORAGE_KEY = "mealdeck-menu-favourites-v1";
export const MAX_MENU_FAVOURITES = 40;

export type MenuFavourite = { brandId: string; itemId: string };
export type FavouriteMenuEntry = { brand: LaunchMenuBrand; section: LaunchMenuSection; item: LaunchMenuItem };

const known = new Set(launchMenuBrands.flatMap((brand) =>
  brand.sections.flatMap((section) => section.items.map((item) => brand.id + ":" + item.id)),
));

export function favouriteKey(brandId: string, itemId: string): string {
  return brandId + ":" + itemId;
}

/** Only explicit, known catalogue identities. Never retain prices, choices or personal data. */
export function decodeMenuFavourites(raw: string | null): MenuFavourite[] {
  if (!raw || raw.length > 16_000) return [];
  try {
    const input: unknown = JSON.parse(raw);
    if (!Array.isArray(input)) return [];
    const result: MenuFavourite[] = [];
    const seen = new Set<string>();
    for (const value of input) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const row = value as Record<string, unknown>;
      const brandId = row["brandId"];
      const itemId = row["itemId"];
      if (typeof brandId !== "string" || typeof itemId !== "string") continue;
      const key = favouriteKey(brandId, itemId);
      if (!known.has(key) || seen.has(key)) continue;
      seen.add(key);
      result.push({ brandId, itemId });
      if (result.length === MAX_MENU_FAVOURITES) break;
    }
    return result;
  } catch {
    return [];
  }
}

export function encodeMenuFavourites(values: readonly MenuFavourite[]): string {
  return JSON.stringify(decodeMenuFavourites(JSON.stringify(values)));
}

export function toggleMenuFavourite(
  values: readonly MenuFavourite[],
  brandId: string,
  itemId: string,
): MenuFavourite[] {
  const key = favouriteKey(brandId, itemId);
  const clean = decodeMenuFavourites(JSON.stringify(values));
  if (!known.has(key)) return clean;
  if (clean.some((value) => favouriteKey(value.brandId, value.itemId) === key))
    return clean.filter((value) => favouriteKey(value.brandId, value.itemId) !== key);
  if (clean.length >= MAX_MENU_FAVOURITES) return clean;
  return [...clean, { brandId, itemId }];
}

/** Resolve against the current catalogue; even saved sold-out items remain removable. */
export function resolveMenuFavourites(
  values: readonly MenuFavourite[],
  catalogue: readonly LaunchMenuBrand[],
): FavouriteMenuEntry[] {
  return values.flatMap(({ brandId, itemId }) => {
    const brand = catalogue.find((entry) => entry.id === brandId);
    if (!brand) return [];
    for (const section of brand.sections) {
      const item = section.items.find((entry) => entry.id === itemId);
      if (item) return [{ brand, section, item }];
    }
    return [];
  });
}

export function favouriteCanBeOrdered(item: LaunchMenuItem, liveReady: boolean): boolean {
  return liveReady && item.available === true &&
    typeof item.pricePence === "number" && Number.isSafeInteger(item.pricePence) &&
    item.pricePence >= 0;
}
