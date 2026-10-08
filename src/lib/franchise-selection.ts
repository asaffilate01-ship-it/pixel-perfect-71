/** Commercial franchise choices; independent of location-specific ordering menus. */
export const FRANCHISE_BRAND_IDS = [
  "taconelle",
  "paratique",
  "tavo-chicken",
  "loadd",
  "sabzora",
  "icova",
  "vyta",
  "moktl",
  "tarka-box",
  "skorch",
  "pastarivo",
  "nusara",
  "rise-and-griddle",
  "souvano",
  "forvello",
] as const;

export type FranchiseBrandId = (typeof FRANCHISE_BRAND_IDS)[number];
export type FranchisePackage = "full_mealdeck" | "selected_brands";
const CAMPAIGN_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;
type FranchiseAttribution = Partial<Record<(typeof CAMPAIGN_KEYS)[number], string>>;
export type FranchiseSearch = {
  package?: "brands" | "full";
  brands?: string;
} & FranchiseAttribution;
export type FranchiseSelection = {
  franchisePackage: FranchisePackage;
  selectedBrandIds: FranchiseBrandId[];
};

/** Use the portfolio order for stable, bounded links, regardless of click order. */
export function normaliseFranchiseBrandIds(input: readonly unknown[]): FranchiseBrandId[] {
  const requested = new Set(input);
  return FRANCHISE_BRAND_IDS.filter((id) => requested.has(id));
}

/**
 * URL input is intentionally forgiving. Enquiry submissions are validated
 * separately and reject unknown IDs, duplicates and conflicting scopes.
 */
function campaignAttribution(input: Record<string, unknown>): FranchiseAttribution {
  const attribution: FranchiseAttribution = {};
  for (const key of CAMPAIGN_KEYS) {
    const value = input[key];
    if (
      typeof value !== "string" ||
      [...value].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      continue;
    const cleaned = value.trim().slice(0, 200);
    if (cleaned) attribution[key] = cleaned;
  }
  return attribution;
}

export function parseFranchiseSearch(input: Record<string, unknown>): FranchiseSearch {
  const attribution = campaignAttribution(input);
  if (input["package"] === "full") return { ...attribution, package: "full" };
  const rawBrands = input["brands"];
  const brandIds =
    typeof rawBrands === "string"
      ? normaliseFranchiseBrandIds(rawBrands.split(",").map((id) => id.trim()))
      : [];
  if (input["package"] === "brands" || typeof rawBrands === "string") {
    return brandIds.length > 0
      ? { ...attribution, package: "brands", brands: brandIds.join(",") }
      : { ...attribution, package: "brands" };
  }
  return attribution;
}

export function franchiseSearchForSelection(
  franchisePackage: FranchisePackage,
  selectedBrandIds: readonly FranchiseBrandId[],
  currentSearch: Record<string, unknown> = {},
): FranchiseSearch {
  const attribution = campaignAttribution(currentSearch);
  if (franchisePackage === "full_mealdeck") return { ...attribution, package: "full" };
  const brandIds = normaliseFranchiseBrandIds(selectedBrandIds);
  return brandIds.length > 0
    ? { ...attribution, package: "brands", brands: brandIds.join(",") }
    : { ...attribution, package: "brands" };
}

export function franchiseSelectionFromSearch(input: Record<string, unknown>): FranchiseSelection {
  const search = parseFranchiseSearch(input);
  if (search.package !== "brands") {
    return { franchisePackage: "full_mealdeck", selectedBrandIds: [] };
  }
  return {
    franchisePackage: "selected_brands",
    selectedBrandIds: normaliseFranchiseBrandIds(search.brands?.split(",") ?? []),
  };
}
