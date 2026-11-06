import {
  launchMenuBrands,
  type LaunchMenuBrand,
  type LaunchMenuItem,
} from "./launch-menu-catalogue";
import { getLaunchCrossOffers } from "./launch-menu-upsells";

type PublicMenuOption = { pricePence: number; available: boolean; label?: string };

export type MealDeckPublicMenuSnapshot = {
  available: true;
  checkedAt: string;
  items: Array<{
    sku: string;
    categoryName?: string;
    name: string;
    description: string | null;
    pricePence: number;
    options: Record<string, PublicMenuOption>;
    replacementPricePence: number | null;
    replacementLabel?: string;
  }>;
};

const isPence = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isLabel = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 140;

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
      !(item.categoryName === undefined || isLabel(item.categoryName)) ||
      !(item.replacementLabel === undefined || isLabel(item.replacementLabel)) ||
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
      if (
        !option ||
        !isPence(option.pricePence) ||
        typeof option.available !== "boolean" ||
        !(option.label === undefined || isLabel(option.label))
      )
        return null;
    }
  }
  return data;
}

/** Keep reviewed choice structures and artwork; overlay only current canonical values. */
export function hydrateMealDeckPublicMenu(snapshot: MealDeckPublicMenuSnapshot): LaunchMenuBrand[] {
  const rows = new Map(snapshot.items.map((item) => [item.sku, item]));
  const sourceItems = new Map(
    launchMenuBrands.flatMap((brand) =>
      brand.sections.flatMap((section) =>
        section.items.map((item) => [item.id, { brand, item }] as const),
      ),
    ),
  );

  function itemIsAvailable(
    brand: LaunchMenuBrand,
    item: LaunchMenuItem,
    ancestors = new Set<string>(),
  ): boolean {
    const row = rows.get(item.id);
    if (!row || ancestors.has(item.id)) return false;
    const nextAncestors = new Set(ancestors).add(item.id);
    const requiredChoicesAvailable = item.optionGroupIds.every((id) => {
      const group = brand.optionGroups.find((entry) => entry.id === id);
      if (!group?.required || group.when) return true;
      if (
        group.options.some(
          (option) => option.available !== false && row.options[option.id]?.available,
        )
      )
        return true;
      // An included drink may be replaced by a named, currently available upgrade.
      // Only source-eligible offers count; an unrelated extra cannot satisfy it.
      return (
        !!group.replacedBy &&
        getLaunchCrossOffers(brand, item, {}).some(
          (offer) =>
            offer.mode === "upgrade" &&
            offer.slot === group.replacedBy!.crossSlot &&
            offer.choices.some((choice) => {
              const target = sourceItems.get(choice.itemId);
              const replacement = rows.get(choice.itemId);
              return (
                !!target &&
                target.brand.id === choice.brandId &&
                typeof replacement?.replacementPricePence === "number" &&
                itemIsAvailable(target.brand, target.item, nextAncestors)
              );
            }),
        )
      );
    });
    return (
      requiredChoicesAvailable &&
      (!item.priceVariants ||
        item.priceVariants.some((variant) => row.options[variant.optionId]?.available === true))
    );
  }

  return launchMenuBrands.map((brand) => {
    const options = new Map<string, PublicMenuOption>();
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
            label: live?.label ?? option.label,
            pricePence: live?.pricePence ?? option.pricePence,
            available: option.available !== false && live?.available === true,
            ...(!live?.available ? { unavailableReason: "Currently unavailable" } : {}),
          };
        }),
      })),
      sections: brand.sections.map((section) => ({
        ...section,
        title:
          section.items
            .map((item) => rows.get(item.id)?.categoryName)
            .find((name) => name !== undefined) ?? section.title,
        items: section.items.map((item) => {
          const row = rows.get(item.id);
          const { description: sourceDescription, ...itemTemplate } = item;
          const description = row ? row.description : sourceDescription;
          const variants = item.priceVariants?.map((variant) => {
            const option = row?.options[variant.optionId];
            return {
              ...variant,
              label: option?.label ?? variant.label,
              available: option?.available === true,
              pricePence: row && option ? row.pricePence + option.pricePence : variant.pricePence,
            };
          });
          const availableVariants = variants?.filter((variant) => variant.available);
          return {
            ...itemTemplate,
            available: itemIsAvailable(brand, item),
            name: row?.name ?? item.name,
            ...(typeof description === "string" ? { description } : {}),
            pricePence: row
              ? availableVariants?.length
                ? Math.min(...availableVariants.map((variant) => variant.pricePence))
                : row.pricePence
              : null,
            replacementPricePence: row?.replacementPricePence ?? null,
            ...(row?.replacementLabel === undefined
              ? {}
              : { replacementLabel: row.replacementLabel }),
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
