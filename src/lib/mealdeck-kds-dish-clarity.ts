import type { KdsOrderItem } from "./mealdeck-kds";

type KdsDishIdentity = Pick<KdsOrderItem, "brand_name" | "item_name" | "parent_checkout_line_id">;

function comparable(value: string): string {
  // Match historical spelling/typography without rewriting purchased text.
  return value
    .trim()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ");
}

function isSouvano(item: Pick<KdsOrderItem, "brand_name">): boolean {
  return comparable(item.brand_name).toLocaleLowerCase("en-GB") === "souvano";
}

const knownMainNames = /^(?:stir[- ]fry donn?er|heatwave|lamb chops)$/i;

/** Never choose a main from a shared side, price or flavour. */
export function kdsSouvanoMainState(item: KdsDishIdentity): "main" | "verify-main" | null {
  if (!isSouvano(item) || item.parent_checkout_line_id) return null;
  const name = comparable(item.item_name);
  // Both dish names need review regardless of slash/order/legacy spelling.
  if (/\blamb chops\b/i.test(name) && /\bdonn?er\b/i.test(name)) return "verify-main";
  return knownMainNames.test(name) ? "main" : null;
}

const sharedSideGroup =
  /^(?:souvano\s*·\s*)?included side(?:\s*\(\s*(?:heatwave|(?:stir[- ]fry )?donn?er\s*\/\s*lamb chops|lamb chops\s*\/\s*(?:stir[- ]fry )?donn?er)\s*\))?$/i;

export function kdsModifierGroupLabel(
  item: Pick<KdsOrderItem, "brand_name">,
  rawGroupName: string | null | undefined,
): string | null {
  const groupName = rawGroupName?.trim() ?? "";
  if (!groupName) return null;
  return isSouvano(item) && sharedSideGroup.test(comparable(groupName))
    ? "Included side"
    : groupName;
}

/** Replace only a recognised group prefix; keep the actual side/notes intact. */
export function kdsModifierChoiceText(
  item: Pick<KdsOrderItem, "brand_name">,
  rawModifier: string,
): string {
  if (!isSouvano(item)) return rawModifier;
  const separator = rawModifier.indexOf(":");
  if (separator < 0 || !sharedSideGroup.test(comparable(rawModifier.slice(0, separator)))) {
    return rawModifier;
  }
  const choice = rawModifier.slice(separator + 1).trimStart();
  return choice ? `Included side: ${choice}` : rawModifier;
}
