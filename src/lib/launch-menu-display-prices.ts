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
export function launchMenuItemPrice(brandId: string, itemId: string): number | null {
  const item = findLaunchMenuItem(brandId, itemId)?.item;
  return item ? knownPrice(item.pricePence) : null;
}

export function launchMenuCrossChoicePrice(
  mode: "extra" | "upgrade",
  brandId: string,
  itemId: string,
): number | null {
  const itemPrice = launchMenuItemPrice(brandId, itemId);
  if (itemPrice === null) return null;
  return knownPrice(priceForLaunchCrossChoice(mode, itemPrice));
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
export function launchMenuPickDisplayPrice(pick: PriceSelection): LaunchPickDisplayPrice {
  const found = findLaunchMenuItem(pick.brandId, pick.itemId);
  const baseUnitPence = launchMenuItemPrice(pick.brandId, pick.itemId);
  const baseLinePence = linePrice(baseUnitPence, pick.quantity);
  if (!found) {
    return {
      baseUnitPence,
      baseLinePence,
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
  const children = launchCrossSelectionSummaries(
    found.brand,
    found.item,
    configuration.selections,
    configuration.crossSelections,
  );
  const additions = children.map((child) => {
    const unitPence = launchMenuCrossChoicePrice(child.mode, child.brandId, child.itemId);
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
        const unitPence = knownPrice(option.pricePence);
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

export function launchMenuBasketDisplayPrice(picks: PriceSelection[]) {
  const lines = picks.map(launchMenuPickDisplayPrice);
  return {
    itemsSubtotalPence: sumKnownPrices(lines.map((line) => line.itemsSubtotalPence)),
    hasPaidChoices: lines.some(
      (line) => line.additions.length > 0 || line.options.some((option) => option.unitPence !== 0),
    ),
  };
}
