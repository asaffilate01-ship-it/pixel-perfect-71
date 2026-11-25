import { isLaunchBrandPriceApproved, type LaunchMenuBrand, type LaunchMenuItem, type LaunchMenuSection } from "./launch-menu-catalogue";

/**
 * Shared desktop/mobile menu search. Deterministic discovery over the real
 * published catalogue; NOT a source of pricing, stock, allergen or dietary facts.
 *
 * Match words in any order (including option/section labels) and tolerate one
 * minor spelling slip only for words of at least five characters. No model,
 * external service or private customer data is involved.
 */
function searchableWords(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-GB")
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function oneEditAway(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const differences: number[] = [];
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        differences.push(i);
        if (differences.length > 2) return false;
      }
    }
    if (differences.length === 1) return true;
    return differences.length === 2 &&
      differences[1] === differences[0]! + 1 &&
      a[differences[0]!] === b[differences[1]!] &&
      a[differences[1]!] === b[differences[0]!];
  }
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++;
      j++;
    } else {
      if (skipped) return false;
      skipped = true;
      j++;
    }
  }
  return true;
}

/** Search results are suggestions; the live canonical menu remains authoritative. */
export function matchesLaunchMenuSearch(
  query: string,
  fields: readonly (string | null | undefined)[],
): boolean {
  const input = query.trim();
  if (!input) return true;
  // Bound accidental paste and fuzzy matching work on long inputs.
  if (input.length > 120) return false;
  const terms = searchableWords(input);
  if (!terms.length || terms.length > 8) return false;
  const words = searchableWords(fields.filter((v): v is string => typeof v === "string").join(" "));
  if (!words.length) return false;

  let correctedOneTypo = false;
  for (const term of terms) {
    if (words.some((word) => word.includes(term))) continue;
    // A single bounded typo can help customers find "chikcen wings".
    // Avoid fuzzy matching short terms such as "ham", "nut" or "soy".
    if (
      !correctedOneTypo &&
      term.length >= 5 &&
      words.some((word) => oneEditAway(term, word))
    ) {
      correctedOneTypo = true;
      continue;
    }
    return false;
  }
  return true;
}


export const OTHER_BRAND_SEARCH_LIMIT = 12;

export type OtherBrandMenuMatch = {
  brand: LaunchMenuBrand;
  section: LaunchMenuSection;
  item: LaunchMenuItem;
};

/** Discovery only: never creates a price, choice, basket or checkout authority. */
export function findOtherBrandMenuMatches(
  query: string,
  catalogue: readonly LaunchMenuBrand[],
  currentBrandId: string,
): OtherBrandMenuMatch[] {
  if (!query.trim() || query.trim().length > 120) return [];
  const matches: OtherBrandMenuMatch[] = [];
  for (const brand of catalogue) {
    if (brand.id === currentBrandId || !isLaunchBrandPriceApproved(brand.id)) continue;
    for (const section of brand.sections) {
      for (const item of section.items) {
        if (
          item.available !== true ||
          typeof item.pricePence !== "number" ||
          !Number.isSafeInteger(item.pricePence) ||
          item.pricePence < 0
        ) continue;
        const optionLabels = brand.optionGroups
          .filter((group) => item.optionGroupIds.includes(group.id))
          .flatMap((group) =>
            group.options
              .filter((option) => option.available === true && item.availableOptionIds?.includes(option.id))
              .map((option) => option.label),
          );
        if (!matchesLaunchMenuSearch(query, [
          brand.name,
          section.title,
          section.description,
          item.name,
          item.description,
          ...optionLabels,
        ])) continue;
        matches.push({ brand, section, item });
        if (matches.length === OTHER_BRAND_SEARCH_LIMIT) return matches;
      }
    }
  }
  return matches;
}
