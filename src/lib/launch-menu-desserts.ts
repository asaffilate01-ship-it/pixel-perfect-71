import {
  getLaunchMenuBrand,
  type LaunchMenuBrand,
  type LaunchMenuItem,
  type LaunchMenuSection,
} from "./launch-menu-catalogue";
import {
  MAX_LAUNCH_PICKS,
  findLaunchMenuItem,
  launchPickCount,
  type LaunchMenuPick,
} from "./launch-menu-picks";

export type LaunchDessertRecommendation = {
  brand: LaunchMenuBrand;
  section: LaunchMenuSection;
  item: LaunchMenuItem;
};

/** Recommend each flavour once, using current public stock and prices only. */
export function getLaunchDessertRecommendations(
  picks: LaunchMenuPick[],
  catalogue: LaunchMenuBrand[],
  preferredBrandId?: string,
): LaunchDessertRecommendation[] {
  if (!picks.length || launchPickCount(picks) >= MAX_LAUNCH_PICKS) return [];
  if (
    picks.some(
      (pick) => findLaunchMenuItem(pick.brandId, pick.itemId, catalogue)?.section.id === "desserts",
    )
  )
    return [];

  const preferred = preferredBrandId ? getLaunchMenuBrand(preferredBrandId, catalogue) : undefined;
  const orderedBrandIds = new Set([
    ...(preferred ? [preferred.id] : []),
    ...picks.map((pick) => pick.brandId),
    ...catalogue.map((brand) => brand.id),
  ]);
  const brands = [...orderedBrandIds].flatMap((id) => {
    const brand = getLaunchMenuBrand(id, catalogue);
    return brand ? [brand] : [];
  });

  return (["biscoff", "oreo"] as const).flatMap((flavour) => {
    for (const brand of brands) {
      const section = brand.sections.find((entry) => entry.id === "desserts");
      const item = section?.items.find(
        (entry) => entry.id === `${brand.id}-desserts-${flavour}-milkcake`,
      );
      if (
        section &&
        item?.available === true &&
        typeof item.pricePence === "number" &&
        Number.isSafeInteger(item.pricePence) &&
        item.pricePence >= 0 &&
        item.optionGroupIds.length === 0 &&
        !item.priceVariants?.length
      )
        return [{ brand, section, item }];
    }
    return [];
  });
}
