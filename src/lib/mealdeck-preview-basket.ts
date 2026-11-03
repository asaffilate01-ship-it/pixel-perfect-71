import type { MenuItem } from "./mealdeck";

/**
 * Browse-only sample basket for the Coming Soon experience.
 * Never submit these quantities or totals to a payment or ordering API.
 */
export const SAMPLE_MAX_PER_DISH = 20;
export const SAMPLE_MAX_ITEMS = 60;
const MAX_SAMPLE_SUBTOTAL_PENCE = 10_000_000;

export type SampleBasketLine = Readonly<{ item: MenuItem; quantity: number }>;
export type SampleBasketSummary = Readonly<{
  valid: boolean;
  dishes: number;
  brands: number;
  subtotalPence: number;
}>;

const invalid = (): SampleBasketSummary => ({
  valid: false,
  dishes: 0,
  brands: 0,
  subtotalPence: 0,
});
function isSampleItem(item: unknown): item is MenuItem {
  if (!item || typeof item !== "object") return false;
  const dish = item as Partial<MenuItem>;
  return typeof dish.id === "string" && dish.id.length > 0 &&
    typeof dish.brandId === "string" && dish.brandId.length > 0 &&
    Number.isSafeInteger(dish.pricePence) && (dish.pricePence ?? -1) >= 0 &&
    (dish.pricePence ?? Infinity) <= MAX_SAMPLE_SUBTOTAL_PENCE;
}

/** Penny-exact illustrative quantities, never a live delivery or checkout quote. */
export function summariseSampleBasket(lines: readonly SampleBasketLine[]): SampleBasketSummary {
  if (!Array.isArray(lines) || lines.length > SAMPLE_MAX_ITEMS) return invalid();
  const seen = new Set<string>();
  const brands = new Set<string>();
  let dishes = 0;
  let subtotalPence = 0;
  for (const line of lines) {
    if (!line || !isSampleItem(line.item) ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1 || line.quantity > SAMPLE_MAX_PER_DISH ||
      seen.has(line.item.id)) return invalid();
    seen.add(line.item.id);
    brands.add(line.item.brandId);
    dishes += line.quantity;
    subtotalPence += line.item.pricePence * line.quantity;
    if (dishes > SAMPLE_MAX_ITEMS ||
      !Number.isSafeInteger(subtotalPence) ||
      subtotalPence > MAX_SAMPLE_SUBTOTAL_PENCE) return invalid();
  }
  return { valid: true, dishes, brands: brands.size, subtotalPence };
}

/** Add/remove one of a sample dish. Unrecognised changes fail closed. */
export function adjustSampleBasket(
  lines: readonly SampleBasketLine[],
  item: MenuItem,
  change: -1 | 1,
): SampleBasketLine[] {
  const summary = summariseSampleBasket(lines);
  if (!summary.valid || !isSampleItem(item) || (change !== -1 && change !== 1)) {
    return [...lines];
  }
  const index = lines.findIndex(line => line.item.id === item.id);
  if (index >= 0 && lines[index]!.item.brandId !== item.brandId) return [...lines];
  if (change === -1) {
    if (index === -1) return [...lines];
    const existing = lines[index]!;
    if (existing.quantity === 1) return lines.filter((_, position) => position !== index);
    return lines.map((line, position) =>
      position === index ? { ...line, quantity: line.quantity - 1 } : line);
  }
  if (summary.dishes >= SAMPLE_MAX_ITEMS) return [...lines];
  if (index === -1) {
    if (summary.subtotalPence + item.pricePence > MAX_SAMPLE_SUBTOTAL_PENCE) return [...lines];
    return [...lines, { item, quantity: 1 }];
  }
  const existing = lines[index]!;
  if (existing.quantity >= SAMPLE_MAX_PER_DISH ||
    summary.subtotalPence + existing.item.pricePence > MAX_SAMPLE_SUBTOTAL_PENCE) return [...lines];
  return lines.map((line, position) =>
    position === index ? { ...line, quantity: line.quantity + 1 } : line);
}
