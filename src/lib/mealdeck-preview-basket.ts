import { modifierGroupsFor, type MenuItem } from "./mealdeck";

/**
 * Browse-only sample basket for the Coming Soon experience.
 * Never submit these quantities or totals to a payment or ordering API.
 */
export const SAMPLE_MAX_PER_DISH = 20;
export const SAMPLE_MAX_ITEMS = 60;
const MAX_SAMPLE_SUBTOTAL_PENCE = 10_000_000;

export type SampleBasketSelection = Readonly<{groupId:string;optionId:string}>;
export type SampleBasketLine = Readonly<{ item: MenuItem; quantity: number; selected?: readonly SampleBasketSelection[]; variantId?:string }>;
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
    typeof dish.pricePence === "number" &&
    Number.isSafeInteger(dish.pricePence) && dish.pricePence >= 0 &&
    dish.pricePence <= MAX_SAMPLE_SUBTOTAL_PENCE;
}

/**
 * Price is determined from the current item snapshot and its modifier groups,
 * never from a client-supplied extra-price number. Invalid or duplicate
 * selections fail closed.
 */
export function sampleLineUnitPrice(line:SampleBasketLine):number|null{
  if(!isSampleItem(line.item))return null;
  const groups=modifierGroupsFor(line.item);
  const selections=line.selected??[];
  if(!Array.isArray(selections)||selections.length>20)return null;
  const seen=new Set<string>();
  const counts=new Map<string,number>();
  let delta=0;
  for(const entry of selections){
    if(!entry||typeof entry.groupId!=="string"||typeof entry.optionId!=="string")return null;
    const group=groups.find(g=>g.id===entry.groupId);
    const option=group?.options.find(o=>o.id===entry.optionId);
    const key=entry.groupId+":"+entry.optionId;
    if(!group||!option||seen.has(key)||!Number.isSafeInteger(option.priceDeltaPence)||
       option.priceDeltaPence<0)return null;
    seen.add(key);
    counts.set(group.id,(counts.get(group.id)??0)+1);
    delta+=option.priceDeltaPence;
  }
  if(groups.some(group=>(counts.get(group.id)??0)<group.minSelect||
      (counts.get(group.id)??0)>group.maxSelect))return null;
  const total=line.item.pricePence+delta;
  return Number.isSafeInteger(total)&&total>=0&&total<=MAX_SAMPLE_SUBTOTAL_PENCE?total:null;
}

/** Penny-exact illustrative quantities, never a live delivery or checkout quote. */
export function summariseSampleBasket(lines: readonly SampleBasketLine[]): SampleBasketSummary {
  if (!Array.isArray(lines) || lines.length > SAMPLE_MAX_ITEMS) return invalid();
  const seen = new Set<string>();
  const itemBrands = new Map<string,string>();
  const brands = new Set<string>();
  let dishes = 0;
  let subtotalPence = 0;
  for (const line of lines) {
    if (!line || !isSampleItem(line.item) ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1 || line.quantity > SAMPLE_MAX_PER_DISH ||
      (line.variantId!==undefined && (typeof line.variantId!=="string" ||
        !/^.+::variant:[1-9][0-9]*$/.test(line.variantId) ||
        !line.variantId.startsWith(line.item.id+"::variant:") ||
        line.variantId.length>160)) ||
      seen.has(line.variantId??line.item.id) ||
      (itemBrands.has(line.item.id) && itemBrands.get(line.item.id)!==line.item.brandId)) return invalid();
    const unitPrice=sampleLineUnitPrice(line);
    if(unitPrice===null)return invalid();
    seen.add(line.variantId??line.item.id);
    itemBrands.set(line.item.id,line.item.brandId);
    brands.add(line.item.brandId);
    dishes += line.quantity;
    subtotalPence += unitPrice * line.quantity;
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
    summary.subtotalPence + (sampleLineUnitPrice(existing)??MAX_SAMPLE_SUBTOTAL_PENCE+1) > MAX_SAMPLE_SUBTOTAL_PENCE) return [...lines];
  return lines.map((line, position) =>
    position === index ? { ...line, quantity: line.quantity + 1 } : line);
}
