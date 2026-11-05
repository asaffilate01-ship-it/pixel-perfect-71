import {
  getLaunchMenuBrand,
  launchCrossReplacementPricePence,
  type LaunchMenuBrand,
  type LaunchMenuItem,
} from "./launch-menu-catalogue";
import type { LaunchMenuSelections } from "./launch-menu-picks";

export type LaunchCrossSlot = "side" | "drink";
export type LaunchCrossMode = "upgrade" | "extra";
export type LaunchCrossBrandId = "loadd" | "moktl";

/** One attached child per slot and per parent unit; prices come from the catalogue. */
export type LaunchCrossSelection = {
  slot: LaunchCrossSlot;
  mode: LaunchCrossMode;
  brandId: LaunchCrossBrandId;
  itemId: string;
};

export type LaunchCrossChoice = {
  brandId: LaunchCrossBrandId;
  itemId: string;
  name: string;
  sectionId: string;
  sectionTitle: string;
  description?: string;
  /** Standalone product price; a meal replacement uses the explicit upgrade surcharge. */
  pricePence: number;
};

export type LaunchCrossOffer = {
  id: string;
  slot: LaunchCrossSlot;
  mode: LaunchCrossMode;
  brandId: LaunchCrossBrandId;
  title: string;
  description: string;
  replaces: "fries" | "drink" | null;
  choices: LaunchCrossChoice[];
};

export type LaunchCrossSummary = LaunchCrossSelection & {
  brandName: string;
  itemName: string;
  sectionTitle: string;
  label: string;
  /** Amount per parent unit: standalone extra or the approved upgrade surcharge. */
  pricePence: number;
};

export type LaunchCrossConfiguration = {
  selections: LaunchMenuSelections;
  crossSelections: LaunchCrossSelection[];
};

export function priceForLaunchCrossChoice(
  mode: LaunchCrossMode,
  standalonePricePence: number,
  targetSectionId: string,
): number | null {
  if (!Number.isSafeInteger(standalonePricePence) || standalonePricePence < 0) return null;
  if (mode === "extra") return standalonePricePence;
  return launchCrossReplacementPricePence(targetSectionId);
}

const upgradeGroups = [
  ["tavo-chicken-meal-upgrades", "-upgrade"],
  ["tavo-chicken-kids-meal-upgrades", "-upgrade"],
  ["skorch-burgers-meal-upgrades", ""],
  ["skorch-burgers-kids-meal-upgrades", ""],
] as const;
const mappedSideOptions = new Set(
  upgradeGroups.flatMap(([id, suffix]) => [
    `${id}-loaded-fries${suffix}`,
    `${id}-loaded-mac-n-cheese${suffix}`,
  ]),
);
const mappedDrinkOptions = new Set(upgradeGroups.map(([id, suffix]) => `${id}-mocktail${suffix}`));
const milkshakeOptions = new Set(upgradeGroups.map(([id, suffix]) => `${id}-milkshake${suffix}`));
const periSaltOptions = new Set(upgradeGroups.map(([id]) => `${id}-peri-salt`));

export function isMappedLaunchUpgradeOption(optionId: string) {
  return mappedSideOptions.has(optionId) || mappedDrinkOptions.has(optionId);
}

function parentFromCatalogue(brand: LaunchMenuBrand, item: LaunchMenuItem) {
  const canonicalBrand = getLaunchMenuBrand(brand.id);
  if (!canonicalBrand) return undefined;
  for (const section of canonicalBrand.sections) {
    const canonicalItem = section.items.find((entry) => entry.id === item.id);
    if (canonicalItem) return { brand: canonicalBrand, section, item: canonicalItem };
  }
  return undefined;
}

/** Shared source-choice validation avoids a runtime dependency on the picks module. */
export function cleanLaunchSourceSelections(
  brand: LaunchMenuBrand,
  item: LaunchMenuItem,
  input: LaunchMenuSelections,
): LaunchMenuSelections {
  const parent = parentFromCatalogue(brand, item);
  if (!parent) return {};
  const groups = parent.item.optionGroupIds.flatMap((id) => {
    const group = parent.brand.optionGroups.find((entry) => entry.id === id);
    return group ? [group] : [];
  });
  const next: LaunchMenuSelections = {};
  for (const group of groups) {
    const supplied = input[group.id];
    if (!Array.isArray(supplied)) continue;
    const options = group.options
      .filter((option) => option.available !== false && supplied.includes(option.id))
      .map((option) => option.id);
    if (options.length) next[group.id] = group.kind === "single" ? options.slice(0, 1) : options;
  }
  for (let pass = 0; pass < groups.length; pass++) {
    for (const group of groups) {
      if (
        (group.when &&
          (!parent.item.optionGroupIds.includes(group.when.groupId) ||
            !group.when.optionIds.some((id) => next[group.when!.groupId]?.includes(id)))) ||
        (group.replacedBy &&
          Object.values(next).some((options) =>
            options.some((id) => group.replacedBy!.optionIds.includes(id)),
          ))
      )
        delete next[group.id];
    }
  }
  return next;
}

function targetChoices(brandId: LaunchCrossBrandId): LaunchCrossChoice[] {
  const brand = getLaunchMenuBrand(brandId);
  const sections =
    brandId === "loadd" ? ["loaded-fries", "loaded-mac-cheese"] : ["mocktail-lounge"];
  return (
    brand?.sections
      .filter((section) => sections.includes(section.id))
      .flatMap((section) =>
        section.items
          .filter((item) => item.pricePence !== null)
          .map((item) => ({
            brandId,
            itemId: item.id,
            name: item.name,
            sectionId: section.id,
            sectionTitle: section.title,
            ...(item.description ? { description: item.description } : {}),
            pricePence: item.pricePence!,
          })),
      ) ?? []
  );
}

/** Owner-approved menu mappings; item and upgrade prices remain catalogue-owned. */
export function getLaunchCrossOffers(
  brand: LaunchMenuBrand,
  item: LaunchMenuItem,
  selections: LaunchMenuSelections,
): LaunchCrossOffer[] {
  const parent = parentFromCatalogue(brand, item);
  if (!parent) return [];
  const mainSections: Record<string, string[]> = {
    "tavo-chicken": [
      "burgers",
      "fried-chicken-wings",
      "fried-chicken-tenders",
      "grilled-chicken-wings",
      "kids-meals",
    ],
    "skorch-burgers": ["beef-smash-deck", "kids-meal"],
    souvano: ["stir-fry-donner", "heatwave", "lamb-chops"],
    loadd: ["loaded-fries", "loaded-mac-cheese", "full-house"],
  };
  if (!mainSections[parent.brand.id]?.includes(parent.section.id)) return [];
  const clean = cleanLaunchSourceSelections(parent.brand, parent.item, selections);
  const mealGroup = `${parent.brand.id}-make-it-a-meal`;
  const meal =
    parent.section.id === "kids-meal" ||
    parent.section.id === "kids-meals" ||
    !!clean[mealGroup]?.includes(`${mealGroup}-make-it-a-meal`);
  const sideMode: LaunchCrossMode | undefined =
    parent.brand.id === "loadd" ? undefined : meal ? "upgrade" : "extra";
  const offers: LaunchCrossOffer[] = [];
  if (sideMode)
    offers.push({
      id: `loadd-side-${sideMode}`,
      slot: "side",
      mode: sideMode,
      brandId: "loadd",
      title: sideMode === "upgrade" ? "Upgrade your fries with Load’d" : "Add a Load’d side",
      description:
        sideMode === "extra"
          ? "Add one Load’d side alongside this main."
          : "Replace the included meal fries with one Load’d side.",
      replaces: sideMode === "upgrade" ? "fries" : null,
      choices: targetChoices("loadd"),
    });
  offers.push({
    id: `moktl-drink-${meal ? "upgrade" : "extra"}`,
    slot: "drink",
    mode: meal ? "upgrade" : "extra",
    brandId: "moktl",
    title: meal ? "Upgrade your drink with Moktl" : "Add a Moktl drink",
    description: meal
      ? "Replace the included meal drink with one Moktl mocktail."
      : "Add one Moktl mocktail alongside this dish.",
    replaces: meal ? "drink" : null,
    choices: targetChoices("moktl"),
  });
  return offers;
}

function withoutOptions(selections: LaunchMenuSelections, excluded: Set<string>) {
  const next: LaunchMenuSelections = {};
  for (const [id, options] of Object.entries(selections)) {
    const kept = options.filter((option) => !excluded.has(option));
    if (kept.length) next[id] = kept;
  }
  return next;
}

/** Invalid modes disappear; an old meal upgrade never becomes an extra. */
export function cleanLaunchCrossConfiguration(
  brand: LaunchMenuBrand,
  item: LaunchMenuItem,
  selections: LaunchMenuSelections,
  input: unknown = [],
): LaunchCrossConfiguration {
  let clean = cleanLaunchSourceSelections(brand, item, selections);
  const offers = getLaunchCrossOffers(brand, item, clean);
  const crossSelections: LaunchCrossSelection[] = [];
  const supplied: unknown[] = Array.isArray(input) ? input : [];
  for (const offer of offers) {
    const selected = supplied.find((entry): entry is LaunchCrossSelection => {
      if (!entry || typeof entry !== "object") return false;
      const value = entry as Record<string, unknown>;
      return (
        value["slot"] === offer.slot &&
        value["mode"] === offer.mode &&
        value["brandId"] === offer.brandId &&
        offer.choices.some((choice) => choice.itemId === value["itemId"])
      );
    });
    if (!selected) continue;
    // A normal option change to Milkshake wins over an earlier Moktl selection.
    if (
      offer.slot === "drink" &&
      Object.values(clean).some((options) => options.some((id) => milkshakeOptions.has(id)))
    )
      continue;
    if (
      offer.slot === "side" &&
      offer.mode === "upgrade" &&
      Object.values(clean).some((options) => options.some((id) => periSaltOptions.has(id)))
    )
      continue;
    crossSelections.push({
      slot: offer.slot,
      mode: offer.mode,
      brandId: offer.brandId,
      itemId: selected.itemId,
    });
    clean = withoutOptions(clean, offer.slot === "side" ? mappedSideOptions : mappedDrinkOptions);
    if (offer.mode === "upgrade") {
      for (const group of brand.optionGroups) {
        if (group.replacedBy?.crossSlot === offer.slot) delete clean[group.id];
      }
    }
  }
  return { selections: clean, crossSelections };
}

export function setLaunchCrossChoice(
  brand: LaunchMenuBrand,
  item: LaunchMenuItem,
  selections: LaunchMenuSelections,
  current: LaunchCrossSelection[],
  offerId: string,
  itemId: string | null,
): LaunchCrossConfiguration {
  const clean = cleanLaunchCrossConfiguration(brand, item, selections, current);
  const offer = getLaunchCrossOffers(brand, item, clean.selections).find(
    (entry) => entry.id === offerId,
  );
  if (!offer || (itemId !== null && !offer.choices.some((choice) => choice.itemId === itemId)))
    return clean;
  const next = clean.crossSelections.filter((entry) => entry.slot !== offer.slot);
  if (itemId === null) return { ...clean, crossSelections: next };
  const sourceSelections = withoutOptions(
    clean.selections,
    offer.slot === "side"
      ? new Set([...mappedSideOptions, ...periSaltOptions])
      : new Set([...mappedDrinkOptions, ...milkshakeOptions]),
  );
  next.push({ slot: offer.slot, mode: offer.mode, brandId: offer.brandId, itemId });
  return cleanLaunchCrossConfiguration(brand, item, sourceSelections, next);
}

export function launchCrossSelectionSummaries(
  brand: LaunchMenuBrand,
  item: LaunchMenuItem,
  selections: LaunchMenuSelections,
  input: unknown = [],
): LaunchCrossSummary[] {
  const clean = cleanLaunchCrossConfiguration(brand, item, selections, input);
  const offers = getLaunchCrossOffers(brand, item, clean.selections);
  return clean.crossSelections.flatMap((selection) => {
    const offer = offers.find((entry) => entry.slot === selection.slot);
    const choice = offer?.choices.find((entry) => entry.itemId === selection.itemId);
    const target = getLaunchMenuBrand(selection.brandId);
    if (!choice || !target) return [];
    const pricePence = priceForLaunchCrossChoice(
      selection.mode,
      choice.pricePence,
      choice.sectionId,
    );
    if (pricePence === null) return [];
    const component =
      selection.slot === "drink"
        ? "Meal drink"
        : brand.id === "souvano" && item.id === "souvano-heatwave-heatwave"
          ? "Fries base"
          : "Meal fries";
    const name = selection.slot === "side" ? `${choice.sectionTitle}: ${choice.name}` : choice.name;
    return [
      {
        ...selection,
        brandName: target.name,
        itemName: choice.name,
        sectionTitle: choice.sectionTitle,
        label:
          selection.mode === "upgrade"
            ? `${component} replaced with ${target.name} · ${name}`
            : `Extra ${target.name} ${selection.slot} · ${name}`,
        pricePence,
      },
    ];
  });
}
