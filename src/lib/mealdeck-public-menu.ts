import { launchMenuBrands, type LaunchMenuBrand } from "./launch-menu-catalogue";

export type MealDeckPublicMenuSnapshot = {
  available: true;
  checkedAt: string;
  items: Array<{
    sku: string;
    name: string;
    description: string | null;
    pricePence: number;
    options: Record<string, { pricePence: number; available: boolean }>;
    replacementPricePence: number | null;
  }>;
};

const isPence = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Validate the public boundary; never treat an error page or partial row as prices. */
export function parseMealDeckPublicMenu(value: unknown): MealDeckPublicMenuSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const data = value as MealDeckPublicMenuSnapshot;
  if (
    data.available !== true ||
    typeof data.checkedAt !== "string" ||
    !Number.isFinite(Date.parse(data.checkedAt)) ||
    !Array.isArray(data.items)
  )
    return null;
  const seen = new Set<string>();
  for (const item of data.items) {
    if (
      !item ||
      typeof item.sku !== "string" ||
      seen.has(item.sku) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      !(item.description === null || typeof item.description === "string") ||
      !isPence(item.pricePence) ||
      !item.options ||
      typeof item.options !== "object" ||
      Array.isArray(item.options) ||
      !(item.replacementPricePence === null || isPence(item.replacementPricePence))
    )
      return null;
    seen.add(item.sku);
    for (const option of Object.values(item.options)) {
      if (!option || !isPence(option.pricePence) || typeof option.available !== "boolean")
        return null;
    }
  }
  return data;
}

/** Keep reviewed choice structures and artwork; overlay only current canonical values. */
export function hydrateMealDeckPublicMenu(snapshot: MealDeckPublicMenuSnapshot): LaunchMenuBrand[] {
  const rows = new Map(snapshot.items.map((item) => [item.sku, item]));
  return launchMenuBrands.map((brand) => {
    const options = new Map<string, { pricePence: number; available: boolean }>();
    for (const section of brand.sections)
      for (const item of section.items) {
        for (const [id, option] of Object.entries(rows.get(item.id)?.options ?? {}))
          options.set(id, option);
      }
    return {
      ...brand,
      optionGroups: brand.optionGroups.map((group) => ({
        ...group,
        options: group.options.map((option) => {
          const live = options.get(option.id);
          return {
            ...option,
            pricePence: live?.pricePence ?? option.pricePence,
            available: option.available !== false && live?.available === true,
            ...(!live?.available ? { unavailableReason: "Currently unavailable" } : {}),
          };
        }),
      })),
      sections: brand.sections.map((section) => ({
        ...section,
        items: section.items.map((item) => {
          const row = rows.get(item.id);
          const { description: sourceDescription, ...itemTemplate } = item;
          const description = row ? row.description : sourceDescription;
          const requiredChoicesAvailable = item.optionGroupIds.every((id) => {
            const group = brand.optionGroups.find((entry) => entry.id === id);
            return (
              !group?.required ||
              !!group.when ||
              group.options.some(
                (option) => option.available !== false && row?.options[option.id]?.available,
              )
            );
          });
          const variants = item.priceVariants?.map((variant) => {
            const option = row?.options[variant.optionId];
            return {
              ...variant,
              available: option?.available === true,
              pricePence: row && option ? row.pricePence + option.pricePence : variant.pricePence,
            };
          });
          const availableVariants = variants?.filter((variant) => variant.available);
          return {
            ...itemTemplate,
            available:
              !!row && requiredChoicesAvailable && (!variants || !!availableVariants?.length),
            name: row?.name ?? item.name,
            ...(typeof description === "string" ? { description } : {}),
            pricePence: row
              ? availableVariants?.length
                ? Math.min(...availableVariants.map((variant) => variant.pricePence))
                : row.pricePence
              : null,
            replacementPricePence: row?.replacementPricePence ?? null,
            availableOptionIds: Object.entries(row?.options ?? {})
              .filter(([, option]) => option.available)
              .map(([id]) => id),
            ...(variants ? { priceVariants: variants } : {}),
          };
        }),
      })),
    };
  });
}
