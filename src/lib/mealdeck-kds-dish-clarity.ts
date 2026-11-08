import type { KdsOrderItem } from "./mealdeck-kds";

/**
 * Souvano sells three distinct main dishes. Their common side choice is NOT
 * the name of a fourth, combined main. Work only from the frozen order's dish
 * name and modifier text: never choose Lamb Chops or Doner by inference.
 */
type KdsDishIdentity = Pick<
  KdsOrderItem,
  "brand_name" | "item_name" | "parent_checkout_line_id"
>;

function isSouvano(item: Pick<KdsOrderItem, "brand_name">): boolean {
  return item.brand_name.trim().toLocaleLowerCase("en-GB") === "souvano";
}

const knownMainNames = /^(?:stir[- ]fry doner|heatwave|lamb chops)$/i;
const ambiguousMainNames =
  /\b(?:lamb chops\s*\/\s*(?:stir[- ]fry\s*)?doner|(?:stir[- ]fry\s*)?doner\s*\/\s*lamb chops)\b/i;

/** Only known ordered mains receive a MAIN label; a combined legacy name is flagged. */
export function kdsSouvanoMainState(
  item: KdsDishIdentity,
): "main" | "verify-main" | null {
  if (!isSouvano(item) || item.parent_checkout_line_id) return null;
  if (knownMainNames.test(item.item_name.trim())) return "main";
  if (ambiguousMainNames.test(item.item_name.trim())) return "verify-main";
  return null;
}

/**
 * Hide an old shared modifier-group label that misleadingly lists two mains.
 * Keep the purchased side itself (Fries / Rice / Naan) intact.
 */
const sharedSideGroup =
  /^souvano\s*·\s*included side\s*(?:\(\s*(?:doner\s*\/\s*lamb chops|(?:lamb chops\s*\/\s*(?:stir[- ]fry\s*)?doner))\s*\))?$/i;

export function kdsModifierGroupLabel(
  item: Pick<KdsOrderItem, "brand_name">,
  rawGroupName: string | null | undefined,
): string | null {
  const groupName = rawGroupName?.trim() ?? "";
  if (!groupName) return null;
  if (isSouvano(item) && sharedSideGroup.test(groupName)) return "Included side";
  // The Heatwave side is a distinct, still-uniquely-identified DB group.
  if (isSouvano(item) && /^souvano\s*·\s*included side\s*\(heatwave\)$/i.test(groupName)) {
    return "Included side";
  }
  return groupName;
}

/** Legacy modifier text may itself contain the misleading group prefix. */
export function kdsModifierChoiceText(
  item: Pick<KdsOrderItem, "brand_name">,
  rawModifier: string,
): string {
  if (!isSouvano(item)) return rawModifier;
  return rawModifier.replace(
    /^souvano\s*·\s*included side\s*\(\s*(?:doner\s*\/\s*lamb chops|lamb chops\s*\/\s*(?:stir[- ]fry\s*)?doner)\s*\)\s*:\s*/i,
    "Included side: ",
  );
}
