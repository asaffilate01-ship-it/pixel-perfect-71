import type { Brand, MenuItem } from "./mealdeck";
import { matchesBrowseCategory } from "./marketplace-discovery";
import burgerPhoto from "@/assets/hero-burger.png";
import chickenPhoto from "@/assets/hero-chicken.png";
import frenchTacosPhoto from "@/assets/hero-tacos.png";
import pizzaPhoto from "@/assets/hero-pizza.png";
import loadedFriesPhoto from "@/assets/hero-fries.png";
import curryPhoto from "@/assets/hero-curry.png";

/** Only item.imageUrl is a genuine menu-item photo.
 * Local fallback images are clearly labelled illustrative and are never
 * represented as the actual purchased item.
 */
export function marketplaceItemPhoto(item: MenuItem, brand?: Brand):
  { src: string | undefined; illustrative: boolean } {
  if (item.imageUrl) return {src:item.imageUrl,illustrative:false};
  const categoryImages: Array<[Parameters<typeof matchesBrowseCategory>[1], string]> = [
    ["burgers", burgerPhoto],
    ["french-tacos", frenchTacosPhoto],
    ["chicken", chickenPhoto],
    ["pizza", pizzaPhoto],
    ["sides", loadedFriesPhoto],
    ["indian", curryPhoto],
  ];
  const match=categoryImages.find(([category])=>matchesBrowseCategory(item,category,brand));
  return {src:match?.[1] ?? brand?.image,illustrative:true};
}
