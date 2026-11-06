import { launchMenuConfiguredItemPrice, type LaunchMenuBrand } from "./launch-menu-catalogue";
import {
  findLaunchMenuItem,
  launchItemGroups,
  MAX_LAUNCH_PICK_QUANTITY,
  type LaunchMenuPick,
} from "./launch-menu-picks";
import {
  cleanLaunchCrossConfiguration,
  launchCrossSelectionSummaries,
  priceForLaunchCrossChoice,
} from "./launch-menu-upsells";

const sterling = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

function knownPrice(value: number | null): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function formatLaunchMenuPrice(pence: number | null): string {
  const value = knownPrice(pence);
  return value === null ? "Price unavailable" : sterling.format(value / 100);
}

/** Display only: never an order quote or payment amount. */
export function launchMenuItemPrice(
  brandId: string,
  itemId: string,
  catalogue?: LaunchMenuBrand[],
): number | null {
  const item = findLaunchMenuItem(brandId, itemId, catalogue)?.item;
  return item && item.available !== false ? knownPrice(item.pricePence) : null;
}

export function launchMenuCrossChoicePrice(
  mode: "extra" | "upgrade",
  brandId: string,
  itemId: string,
  catalogue?: LaunchMenuBrand[],
): number | null {
  const found = findLaunchMenuItem(brandId, itemId, catalogue);
  const itemPrice = launchMenuItemPrice(brandId, itemId, catalogue);
  if (!found || itemPrice === null) return null;
  if (mode === "upgrade" && catalogue) return knownPrice(found.item.replacementPricePence ?? null);
  return knownPrice(priceForLaunchCrossChoice(mode, itemPrice, found.section.id));
}

type PriceSelection = Pick<
  LaunchMenuPick,
  "brandId" | "itemId" | "quantity" | "selections" | "crossSelections"
>;

export type LaunchPricedAddition = {
  mode: "extra" | "upgrade";
  slot: "side" | "drink";
  brandId: string;
  itemId: string;
  unitPence: number | null;
  linePence: number | null;
};

export type LaunchPricedOption = {
  groupId: string;
  optionId: string;
  label: string;
  unitPence: number | null;
  linePence: number | null;
};

export type LaunchPickDisplayPrice = {
  baseUnitPence: number | null;
  baseLinePence: number | null;
  additions: LaunchPricedAddition[];
  options: LaunchPricedOption[];
  itemsSubtotalPence: number | null;
};

function linePrice(unitPence: number | null, quantity: number): number | null {
  if (
    unitPence === null ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_LAUNCH_PICK_QUANTITY
  )
    return null;
  return knownPrice(unitPence * quantity);
}

function sumKnownPrices(amounts: (number | null)[]): number | null {
  if (amounts.some((amount) => amount === null)) return null;
  return knownPrice(amounts.reduce<number>((sum, amount) => sum + amount!, 0));
}

/**
 * A separate extra is one full product per parent unit. A replacement upgrade
 * uses its own approved surcharge, independently of the standalone item price.
 * Normalising first removes generic upgrade options replaced by named choices,
 * so those selections cannot be charged twice.
 * All amounts are re-read from this catalogue; saved browser amounts are ignored.
 */
export function launchMenuPickDisplayPrice(
  pick: PriceSelection,
  catalogue?: LaunchMenuBrand[],
): LaunchPickDisplayPrice {
  const found = findLaunchMenuItem(pick.brandId, pick.itemId, catalogue);

  if (!found || found.item.available === false) {
    return {
      baseUnitPence: null,
      baseLinePence: null,
      additions: [],
      options: [],
      itemsSubtotalPence: null,
    };
  }

  const configuration = cleanLaunchCrossConfiguration(
    found.brand,
    found.item,
    pick.selections,
    pick.crossSelections ?? [],
  );
  const baseUnitPence = launchMenuConfiguredItemPrice(
    pick.brandId,
    pick.itemId,
    configuration.selections,
    catalogue,
  );
  const baseLinePence = linePrice(baseUnitPence, pick.quantity);
  const children = launchCrossSelectionSummaries(
    found.brand,
    found.item,
    configuration.selections,
    configuration.crossSelections,
    catalogue,
  );
  const additions = children.map((child) => {
    const unitPence = launchMenuCrossChoicePrice(
      child.mode,
      child.brandId,
      child.itemId,
      catalogue,
    );
    return {
      mode: child.mode,
      slot: child.slot,
      brandId: child.brandId,
      itemId: child.itemId,
      unitPence,
      linePence: linePrice(unitPence, pick.quantity),
    };
  });
  const options = launchItemGroups(found.brand, found.item).flatMap((group) =>
    group.options
      .filter((option) => configuration.selections[group.id]?.includes(option.id))
      .map((option) => {
        const unitPence =
          option.available === false ||
          (found.item.availableOptionIds && !found.item.availableOptionIds.includes(option.id))
            ? null
            : knownPrice(option.pricePence);
        return {
          groupId: group.id,
          optionId: option.id,
          label: option.label,
          unitPence,
          linePence: linePrice(unitPence, pick.quantity),
        };
      }),
  );

  return {
    baseUnitPence,
    baseLinePence,
    additions,
    options,
    itemsSubtotalPence: sumKnownPrices([
      baseLinePence,
      ...additions.map((addition) => addition.linePence),
      ...options.map((option) => option.linePence),
    ]),
  };
}

export function launchMenuBasketDisplayPrice(
  picks: PriceSelection[],
  catalogue?: LaunchMenuBrand[],
) {
  const lines = picks.map((pick) => launchMenuPickDisplayPrice(pick, catalogue));
  return {
    itemsSubtotalPence: sumKnownPrices(lines.map((line) => line.itemsSubtotalPence)),
    hasPaidChoices: lines.some(
      (line) => line.additions.length > 0 || line.options.some((option) => option.unitPence !== 0),
    ),
  };
}
