import type { LaunchMenuBrand } from "./launch-menu-catalogue";

/**
 * Future AI/MCP menu assistants may return ONLY SKU IDs. Resolve each against
 * recently verified, hydrated public MealDeck catalogue data. Model-authored
 * prices, discounts, descriptions, allergen claims, stock and ETAs are ignored.
 *
 * This is not a live model integration, authorisation layer or checkout quote.
 */
export type VerifiedAgentMenuSuggestion = {
  itemId: string;
  brandId: LaunchMenuBrand["id"];
  brandName: string;
  sectionName: string;
  name: string;
};

const MAX_CANDIDATES = 12;
const MAX_RESULTS = 4;
const MAX_AGE_MS = 120_000;
const SKU_PATTERN = /^[a-z0-9][a-z0-9_-]{0,179}$/i;

export function resolveAgentMenuSuggestions(
  candidateSkuIds: unknown,
  hydratedMenu: readonly LaunchMenuBrand[],
  verifiedCheckedAt: string | null,
  nowMs: number = Date.now(),
): VerifiedAgentMenuSuggestion[] {
  if (
    !Array.isArray(candidateSkuIds) ||
    candidateSkuIds.length === 0 ||
    candidateSkuIds.length > MAX_CANDIDATES ||
    !Number.isFinite(nowMs) ||
    typeof verifiedCheckedAt !== "string"
  ) return [];

  const checkedAt = Date.parse(verifiedCheckedAt);
  if (
    !Number.isFinite(checkedAt) ||
    checkedAt > nowMs + 10_000 ||
    nowMs - checkedAt > MAX_AGE_MS
  ) return [];

  const verified = new Map<string, VerifiedAgentMenuSuggestion>();
  const ambiguous = new Set<string>();
  for (const brand of hydratedMenu) {
    for (const section of brand.sections) {
      for (const item of section.items) {
        if (
          item.available !== true ||
          item.pricePence === null ||
          !Number.isSafeInteger(item.pricePence) ||
          item.pricePence < 0
        ) continue;
        // A conflicting SKU in the hydrated catalogue can no longer ground
        // any agent answer, even when one of its records looks valid.
        if (verified.has(item.id) || ambiguous.has(item.id)) {
          verified.delete(item.id);
          ambiguous.add(item.id);
          continue;
        }
        verified.set(item.id, {
          itemId: item.id,
          brandId: brand.id,
          brandName: brand.name,
          sectionName: section.title,
          name: item.name,
        });
      }
    }
  }

  const results: VerifiedAgentMenuSuggestion[] = [];
  const seen = new Set<string>();
  for (const candidate of candidateSkuIds) {
    if (
      typeof candidate !== "string" ||
      !SKU_PATTERN.test(candidate) ||
      seen.has(candidate)
    ) continue;
    seen.add(candidate);
    const item = verified.get(candidate);
    if (!item) continue;
    results.push(item);
    if (results.length === MAX_RESULTS) break;
  }
  return results;
}
