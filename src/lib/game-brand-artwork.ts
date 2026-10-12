import mealdeckCardFront from "@/assets/mealdeck-card-front.png";
import { marketingBrands } from "@/lib/marketing-brands";
import type { BrandTheme } from "@/lib/dishbee-play";

/** Same source files as MealDeck's actual storefront brand logos.
 * Do not replace approved brand marks with invented AI approximations.
 */
function exactBrandLogo(id: string): string {
  const brand = marketingBrands.find(item => item.id === id);
  if (!brand) throw new Error(`Missing required approved brand logo: ${id}`);
  return brand.logo;
}
export const gameBrandArtwork: Record<BrandTheme, string> = {
  mealdeck: mealdeckCardFront,
  skorch: exactBrandLogo("skorch"),
  taconelle: exactBrandLogo("taconelle"),
  loadd: exactBrandLogo("loadd"),
  paratique: exactBrandLogo("paratique"),
  tavo: exactBrandLogo("tavo-chicken"),
  vyta: exactBrandLogo("vyta"),
};
