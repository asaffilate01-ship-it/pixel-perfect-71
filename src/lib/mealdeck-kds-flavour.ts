import type { KdsOrderItem } from "./mealdeck-kds";

type ModifierDetail = NonNullable<KdsOrderItem["modifier_details"]>[number];

export type KdsFlavourHighlight = {
  label: "FLAVOUR" | "FLAVOUR & PORTION" | "BURGER DIP";
  value: string;
};

function groupKind(group: string): KdsFlavourHighlight["label"] | null {
  // Imported groups include the brand/dish before the final middle dot.
  const label = group.split("·").at(-1)?.trim().replace(/\s+/g, " ") ?? "";
  if (/^dip your burger$/i.test(label)) return "BURGER DIP";
  if (/^portion\s*(?:&|and)\s*flavou?r(?: price)?$/i.test(label)) {
    return "FLAVOUR & PORTION";
  }
  if (
    /^(?:(?:wing|chicken|milkshake|drink)\s+)?flavou?r(?: \((?:grilled|fried) wings\))?$/i.test(
      label,
    )
  ) {
    return "FLAVOUR";
  }
  return null;
}

const legacyPortionFlavour =
  /^(?:plain flavou?r|korean bbq|dynamite|fiery sweet chilli|spicy honey bbq)\s*·\s*\d+\s*pcs$/i;

/** Emphasise purchased choices only; explicit group metadata beats name matching. */
export function kdsFlavourHighlight(
  modifier: string,
  detail?: ModifierDetail,
): KdsFlavourHighlight | null {
  const original = modifier.trim();
  const group = detail?.group_name?.trim() ?? "";
  if (!original || detail?.kind === "cross") return null;

  const separator = original.indexOf(":");
  const prefixKind = separator < 0 ? null : groupKind(original.slice(0, separator));
  // A sauce called Dynamite is not a cooking-flavour instruction when its
  // saved group says Sauces/Add-ons. Missing metadata uses explicit legacy
  // labels or a known flavour+portion pair, never a bare sauce name.
  const label = group
    ? groupKind(group)
    : (prefixKind ?? (legacyPortionFlavour.test(original) ? "FLAVOUR & PORTION" : null));
  if (!label) return null;

  const value = prefixKind === label ? original.slice(separator + 1).trim() : original;
  if (!value) return null;
  const quantity = detail?.quantity_per_parent;
  const quantityText =
    quantity && Number.isSafeInteger(quantity) && quantity > 1 ? ` · ${quantity}× EACH` : "";
  return { label, value: value.toLocaleUpperCase("en-GB") + quantityText };
}
