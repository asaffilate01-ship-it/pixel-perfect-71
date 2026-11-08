import type { KdsOrderItem } from "./mealdeck-kds";

type ModifierDetail = NonNullable<KdsOrderItem["modifier_details"]>[number];

export type KdsFlavourHighlight = {
  label: "FLAVOUR" | "FLAVOUR & PORTION" | "BURGER DIP";
  value: string;
};

const legacyFlavours =
  /^(?:plain flavour|korean bbq|dynamite|fiery sweet chilli|spicy honey bbq)(?:\s*[·-]\s*\d+\s*pcs)?$/i;

/**
 * Emphasise flavour already chosen and purchased. Never infer a flavour from
 * an item name, a menu default, or another order line.
 */
export function kdsFlavourHighlight(
  modifier: string,
  detail?: ModifierDetail,
): KdsFlavourHighlight | null {
  const value = modifier.trim();
  const group = detail?.group_name?.trim() ?? "";
  if (!value) return null;

  const isDip = /\bdip your burger\b/i.test(group);
  const isFlavour = /\bflavou?r\b/i.test(group);
  const isVariant = detail?.kind === "variant" && (/\bflavou?r\b/i.test(group) || /\b\d+\s*pcs\b/i.test(value));
  const legacyPrefix = /^(?:(?:wing|chicken)\s+)?flavou?r\s*:\s*/i;
  if (!isDip && !isFlavour && !isVariant && !legacyPrefix.test(value) && !legacyFlavours.test(value)) {
    return null;
  }

  return {
    label: isDip ? "BURGER DIP" : isVariant ? "FLAVOUR & PORTION" : "FLAVOUR",
    value: value.replace(legacyPrefix, "").toLocaleUpperCase("en-GB"),
  };
}
