import {
  getLaunchMenuBrand,
  type LaunchMenuBrand,
  type LaunchMenuItem,
  type LaunchMenuOptionGroup,
} from "./launch-menu-catalogue";

/** Local meal planning only. These IDs and choices never create a priced order. */
export type LaunchMenuSelections = Record<string, string[]>;
export type LaunchMenuPick = {
  key: string;
  brandId: string;
  itemId: string;
  quantity: number;
  selections: LaunchMenuSelections;
};

export const LAUNCH_PICKS_STORAGE_KEY = "mealdeck-launch-picks-v1";
export const MAX_LAUNCH_PICK_QUANTITY = 20;
export const MAX_LAUNCH_PICKS = 60;

export function findLaunchMenuItem(brandId: string, itemId: string) {
  const brand = getLaunchMenuBrand(brandId);
  if (!brand) return undefined;
  for (const section of brand.sections) {
    const item = section.items.find((entry) => entry.id === itemId);
    if (item) return { brand, section, item };
  }
  return undefined;
}

export function launchItemGroups(brand: LaunchMenuBrand, item: LaunchMenuItem) {
  return item.optionGroupIds.flatMap((id) => {
    const group = brand.optionGroups.find((entry) => entry.id === id);
    return group ? [group] : [];
  });
}

export function isLaunchGroupActive(
  group: LaunchMenuOptionGroup,
  selections: LaunchMenuSelections,
  item: LaunchMenuItem,
) {
  if (!group.when) return true;
  if (!item.optionGroupIds.includes(group.when.groupId)) return false;
  const trigger = selections[group.when.groupId] ?? [];
  return group.when.optionIds.some((id) => trigger.includes(id));
}

export function cleanLaunchSelections(
  brand: LaunchMenuBrand,
  item: LaunchMenuItem,
  input: LaunchMenuSelections,
): LaunchMenuSelections {
  const groups = launchItemGroups(brand, item);
  const next: LaunchMenuSelections = {};
  for (const group of groups) {
    const supplied = input[group.id];
    if (!Array.isArray(supplied)) continue;
    const options = group.options
      .filter((option) => supplied.includes(option.id))
      .map((option) => option.id);
    if (options.length) next[group.id] = group.kind === "single" ? options.slice(0, 1) : options;
  }
  // Resolve dependencies after canonicalising every group, regardless of display order.
  for (let pass = 0; pass < groups.length; pass++) {
    for (const group of groups) {
      if (!isLaunchGroupActive(group, next, item)) delete next[group.id];
    }
  }
  return next;
}

export function toggleLaunchOption(
  brand: LaunchMenuBrand,
  item: LaunchMenuItem,
  selections: LaunchMenuSelections,
  groupId: string,
  optionId: string,
) {
  const group = launchItemGroups(brand, item).find((entry) => entry.id === groupId);
  if (
    !group ||
    !group.options.some((option) => option.id === optionId) ||
    !isLaunchGroupActive(group, selections, item)
  ) {
    return selections;
  }
  const selected = selections[groupId] ?? [];
  const options = selected.includes(optionId)
    ? group.required && group.kind === "single"
      ? selected
      : selected.filter((id) => id !== optionId)
    : group.kind === "single"
      ? [optionId]
      : [...selected, optionId];
  return cleanLaunchSelections(brand, item, { ...selections, [groupId]: options });
}

export function missingLaunchChoices(
  brand: LaunchMenuBrand,
  item: LaunchMenuItem,
  selections: LaunchMenuSelections,
) {
  const clean = cleanLaunchSelections(brand, item, selections);
  return launchItemGroups(brand, item).filter(
    (group) =>
      group.required && isLaunchGroupActive(group, clean, item) && !clean[group.id]?.length,
  );
}

export function launchSelectionLabels(
  brand: LaunchMenuBrand,
  item: LaunchMenuItem,
  selections: LaunchMenuSelections,
) {
  const clean = cleanLaunchSelections(brand, item, selections);
  return launchItemGroups(brand, item).flatMap((group) =>
    group.options
      .filter((option) => clean[group.id]?.includes(option.id))
      .map((option) => option.label),
  );
}

function pickKey(brandId: string, itemId: string, selections: LaunchMenuSelections) {
  const choices = Object.keys(selections)
    .sort()
    .map((id) => [id, [...(selections[id] ?? [])].sort()]);
  return JSON.stringify([brandId, itemId, choices]);
}

export function launchPickCount(picks: LaunchMenuPick[]) {
  return picks.reduce((total, pick) => total + pick.quantity, 0);
}

export function addLaunchPick(
  picks: LaunchMenuPick[],
  brandId: string,
  itemId: string,
  selections: LaunchMenuSelections,
  quantity = 1,
): LaunchMenuPick[] {
  const found = findLaunchMenuItem(brandId, itemId);
  if (!found || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LAUNCH_PICK_QUANTITY)
    return picks;
  const clean = cleanLaunchSelections(found.brand, found.item, selections);
  if (missingLaunchChoices(found.brand, found.item, clean).length) return picks;
  const key = pickKey(found.brand.id, itemId, clean);
  const existing = picks.find((pick) => pick.key === key);
  if (
    (existing?.quantity ?? 0) + quantity > MAX_LAUNCH_PICK_QUANTITY ||
    launchPickCount(picks) + quantity > MAX_LAUNCH_PICKS
  )
    return picks;
  return existing
    ? picks.map((pick) =>
        pick.key === key ? { ...pick, quantity: pick.quantity + quantity } : pick,
      )
    : [...picks, { key, brandId: found.brand.id, itemId, quantity, selections: clean }];
}

export function setLaunchPickQuantity(picks: LaunchMenuPick[], key: string, quantity: number) {
  const existing = picks.find((pick) => pick.key === key);
  if (
    !existing ||
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    quantity > MAX_LAUNCH_PICK_QUANTITY
  )
    return picks;
  if (launchPickCount(picks) - existing.quantity + quantity > MAX_LAUNCH_PICKS) return picks;
  return quantity === 0
    ? picks.filter((pick) => pick.key !== key)
    : picks.map((pick) => (pick.key === key ? { ...pick, quantity } : pick));
}

/** Restore only known dishes/options; stale or malformed browser data is discarded. */
export function decodeLaunchPicks(raw: string | null): LaunchMenuPick[] {
  if (!raw || raw.length > 100_000) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("picks" in value) ||
      !Array.isArray(value.picks) ||
      value.picks.length > MAX_LAUNCH_PICKS
    )
      return [];
    let picks: LaunchMenuPick[] = [];
    for (const entry of value.picks) {
      if (!entry || typeof entry !== "object") continue;
      const pick = entry as Record<string, unknown>;
      if (
        typeof pick["brandId"] !== "string" ||
        typeof pick["itemId"] !== "string" ||
        typeof pick["quantity"] !== "number" ||
        !pick["selections"] ||
        typeof pick["selections"] !== "object" ||
        Array.isArray(pick["selections"])
      )
        continue;
      const selections: LaunchMenuSelections = {};
      for (const [group, options] of Object.entries(pick["selections"])) {
        if (Array.isArray(options) && options.every((option) => typeof option === "string"))
          selections[group] = options;
      }
      picks = addLaunchPick(picks, pick["brandId"], pick["itemId"], selections, pick["quantity"]);
    }
    return picks;
  } catch {
    return [];
  }
}

export function encodeLaunchPicks(picks: LaunchMenuPick[]) {
  return JSON.stringify({
    version: 1,
    picks: picks.map(({ brandId, itemId, quantity, selections }) => ({
      brandId,
      itemId,
      quantity,
      selections,
    })),
  });
}
