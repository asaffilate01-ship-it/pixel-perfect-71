import {
  getLaunchMenuBrand,
  type LaunchMenuBrand,
  type LaunchMenuItem,
  type LaunchMenuOptionGroup,
} from "./launch-menu-catalogue";
import {
  cleanLaunchCrossConfiguration,
  cleanLaunchSourceSelections,
  type LaunchCrossSelection,
} from "./launch-menu-upsells";

/** Local meal planning only. These IDs and choices never create a priced order. */
export type LaunchMenuSelections = Record<string, string[]>;
export type LaunchMenuPick = {
  key: string;
  brandId: string;
  itemId: string;
  quantity: number;
  selections: LaunchMenuSelections;
  crossSelections?: LaunchCrossSelection[];
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
  crossSelections: LaunchCrossSelection[] = [],
) {
  if (
    group.replacedBy &&
    (crossSelections.some(
      (choice) => choice.slot === group.replacedBy!.crossSlot && choice.mode === "upgrade",
    ) ||
      Object.values(selections).some((options) =>
        options.some((id) => group.replacedBy!.optionIds.includes(id)),
      ))
  )
    return false;
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
  return cleanLaunchSourceSelections(brand, item, input);
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
    !group.options.some((option) => option.id === optionId && option.available !== false) ||
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
  crossSelections: LaunchCrossSelection[] = [],
) {
  const clean = cleanLaunchCrossConfiguration(brand, item, selections, crossSelections);
  return launchItemGroups(brand, item).filter(
    (group) =>
      group.required &&
      isLaunchGroupActive(group, clean.selections, item, clean.crossSelections) &&
      !clean.selections[group.id]?.length,
  );
}

export function launchSelectionLabels(
  brand: LaunchMenuBrand,
  item: LaunchMenuItem,
  selections: LaunchMenuSelections,
  crossSelections: LaunchCrossSelection[] = [],
) {
  const clean = cleanLaunchCrossConfiguration(brand, item, selections, crossSelections);
  const replacesFries = clean.crossSelections.some(
    (choice) => choice.slot === "side" && choice.mode === "upgrade",
  );
  return launchItemGroups(brand, item).flatMap((group) =>
    group.options
      .filter((option) => clean.selections[group.id]?.includes(option.id))
      .filter(
        (option) =>
          !replacesFries ||
          !["souvano-heatwave-base-fries", "souvano-meal-side-fries"].includes(option.id),
      )
      .map((option) => option.label),
  );
}

function pickKey(
  brandId: string,
  itemId: string,
  selections: LaunchMenuSelections,
  crossSelections: LaunchCrossSelection[],
) {
  const choices = Object.keys(selections)
    .sort()
    .map((id) => [id, [...(selections[id] ?? [])].sort()]);
  const sourceKey = [brandId, itemId, choices];
  // Existing picks retain their exact v1 key when they have no attached choices.
  return JSON.stringify(
    crossSelections.length
      ? [
          ...sourceKey,
          crossSelections.map(({ slot, mode, brandId: targetBrandId, itemId: targetItemId }) => [
            slot,
            mode,
            targetBrandId,
            targetItemId,
          ]),
        ]
      : sourceKey,
  );
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
  crossSelections: LaunchCrossSelection[] = [],
): LaunchMenuPick[] {
  const found = findLaunchMenuItem(brandId, itemId);
  if (!found || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LAUNCH_PICK_QUANTITY)
    return picks;
  const clean = cleanLaunchCrossConfiguration(found.brand, found.item, selections, crossSelections);
  if (missingLaunchChoices(found.brand, found.item, clean.selections, clean.crossSelections).length)
    return picks;
  const key = pickKey(found.brand.id, itemId, clean.selections, clean.crossSelections);
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
    : [
        ...picks,
        {
          key,
          brandId: found.brand.id,
          itemId,
          quantity,
          selections: clean.selections,
          ...(clean.crossSelections.length ? { crossSelections: clean.crossSelections } : {}),
        },
      ];
}

/** Atomic same-dish edit: invalid choices/caps leave the previous line intact. */
export function updateLaunchPick(
  picks: LaunchMenuPick[],
  key: string,
  selections: LaunchMenuSelections,
  quantity?: number,
  crossSelections?: LaunchCrossSelection[],
): LaunchMenuPick[] {
  const existing = picks.find((pick) => pick.key === key);
  if (!existing) return picks;
  const candidate = addLaunchPick(
    [],
    existing.brandId,
    existing.itemId,
    selections,
    quantity ?? existing.quantity,
    crossSelections ?? existing.crossSelections ?? [],
  )[0];
  if (
    !candidate ||
    launchPickCount(picks) - existing.quantity + candidate.quantity > MAX_LAUNCH_PICKS
  )
    return picks;
  const duplicate = picks.find((pick) => pick.key !== key && pick.key === candidate.key);
  if (duplicate && duplicate.quantity + candidate.quantity > MAX_LAUNCH_PICK_QUANTITY) return picks;
  return picks.flatMap((pick) => {
    if (pick.key === key) return duplicate ? [] : [candidate];
    return duplicate && pick.key === duplicate.key
      ? [{ ...pick, quantity: pick.quantity + candidate.quantity }]
      : [pick];
  });
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
      const found = findLaunchMenuItem(pick["brandId"], pick["itemId"]);
      if (!found) continue;
      const clean = cleanLaunchCrossConfiguration(
        found.brand,
        found.item,
        selections,
        pick["crossSelections"],
      );
      picks = addLaunchPick(
        picks,
        pick["brandId"],
        pick["itemId"],
        clean.selections,
        pick["quantity"],
        clean.crossSelections,
      );
    }
    return picks;
  } catch {
    return [];
  }
}

export function encodeLaunchPicks(picks: LaunchMenuPick[]) {
  return JSON.stringify({
    version: 1,
    picks: picks.map(({ brandId, itemId, quantity, selections, crossSelections }) => ({
      brandId,
      itemId,
      quantity,
      selections,
      ...(crossSelections?.length
        ? {
            crossSelections: crossSelections.map(
              ({ slot, mode, brandId: targetBrandId, itemId: targetItemId }) => ({
                slot,
                mode,
                brandId: targetBrandId,
                itemId: targetItemId,
              }),
            ),
          }
        : {}),
    })),
  });
}
