import {
  modifierGroupsFor,
  type CartLine, type LocationKey, type MenuItem, type SelectedModifier,
} from "./mealdeck";

/** Local-only preference data. Never store names, addresses, phone numbers, payments, or item prices. */
const MAX_FAVOURITES = 40;
const MAX_SAVED_LINES = 30;
const MAX_QUANTITY = 25;
export const FAVOURITES_STORAGE_KEY = "mealdeck:favourites:v1";
export const BASKET_STORAGE_KEY = "mealdeck:saved-basket:v1";

export function normaliseFavouriteIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string =>
    typeof id === "string" && id.length > 0 && id.length <= 96,
  );
  return [...new Set(ids)].slice(0, MAX_FAVOURITES);
}
export function decodeFavourites(json: string | null): string[] {
  if (!json) return [];
  try { return normaliseFavouriteIds(JSON.parse(json)); }
  catch { return []; }
}
export function toggleFavourite(ids: readonly string[], id: string): string[] {
  const current = normaliseFavouriteIds(ids);
  if (!id || id.length > 96) return current;
  return current.includes(id)
    ? current.filter(itemId => itemId !== id)
    : normaliseFavouriteIds([...current, id]);
}

export type SavedBasketLine = {
  itemId: string;
  quantity: number;
  selected: { groupId: string; optionId: string }[];
};
export type SavedBasket = {
  version: 1;
  location: LocationKey;
  lines: SavedBasketLine[];
};

/** Explicit "save this basket" action only, not actual order-history / a completed purchase. */
export function encodeSavedBasket(location: LocationKey, cart: readonly CartLine[]): string {
  const lines: SavedBasketLine[] = cart.slice(0, MAX_SAVED_LINES).map(line => ({
    itemId: line.id,
    quantity: Math.max(1, Math.min(MAX_QUANTITY, Math.trunc(line.quantity))),
    selected: line.selectedModifiers.map(m => ({groupId: m.groupId, optionId: m.id})),
  }));
  return JSON.stringify({version: 1, location, lines} satisfies SavedBasket);
}
export function decodeSavedBasket(json: string | null): SavedBasket | null {
  if (!json) return null;
  try {
    const data: unknown = JSON.parse(json);
    if (!data || typeof data !== "object") return null;
    const value = data as Record<string, unknown>;
    if (value["version"] !== 1 || (value["location"] !== "luton" && value["location"] !== "stalbans")
      || !Array.isArray(value["lines"]) || value["lines"].length > MAX_SAVED_LINES) return null;
    const parsed: SavedBasketLine[] = [];
    for (const raw of value["lines"]) {
      if (!raw || typeof raw !== "object") return null;
      const l = raw as Record<string, unknown>;
      if (typeof l["itemId"] !== "string" || l["itemId"].length < 1 || l["itemId"].length > 96
        || typeof l["quantity"] !== "number" || !Number.isInteger(l["quantity"]) ||
        l["quantity"] < 1 || l["quantity"] > MAX_QUANTITY ||
        !Array.isArray(l["selected"]) || l["selected"].length > 20) return null;
      const selected: SavedBasketLine["selected"] = [];
      for (const entry of l["selected"]) {
        if (!entry || typeof entry !== "object") return null;
        const option = entry as Record<string, unknown>;
        if (typeof option["groupId"] !== "string" || !option["groupId"] ||
          option["groupId"].length > 120 || typeof option["optionId"] !== "string" ||
          !option["optionId"] || option["optionId"].length > 120) return null;
        selected.push({groupId: option["groupId"], optionId: option["optionId"]});
      }
      parsed.push({itemId:l["itemId"], quantity:l["quantity"], selected});
    }
    return {version:1,location:value["location"],lines:parsed};
  } catch { return null; }
}

export type BasketRestoreResult = {cart: CartLine[]; added: number; unavailable: number; mismatch: boolean};
/** Revalidate saved IDs, quantities and option IDs against the CURRENT catalogue.
 * Never reuse any saved price. Checkout must still revalidate everything server-side.
 */
export function restoreSavedBasket(
  saved: SavedBasket, location: LocationKey, catalogue: readonly MenuItem[], cart: readonly CartLine[] = [],
): BasketRestoreResult {
  if (saved.location !== location) {
    return {cart:[...cart],added:0,unavailable:saved.lines.length,mismatch:true};
  }
  let result=[...cart]; let added=0; let unavailable=0;
  for (const savedLine of saved.lines) {
    const item = catalogue.find(entry => entry.id === savedLine.itemId);
    if (!item) {unavailable++;continue;}
    const groups = modifierGroupsFor(item);
    const selected: SelectedModifier[] = [];
    let valid = true;
    for (const option of savedLine.selected) {
      const group = groups.find(g => g.id === option["groupId"]);
      const current = group?.options.find(o => o.id === option["optionId"]);
      if (!group || !current ||
        selected.some(s=>s.groupId===group.id && s.id===current.id)) {valid=false;break;}
      selected.push({...current,groupId:group.id,groupName:group.name});
    }
    if (valid) valid=groups.every(group => {
      const count=selected.filter(option => option["groupId"] === group.id).length;
      return count >= group.minSelect && count <= group.maxSelect;
    });
    if (!valid) {unavailable++;continue;}
    const lineId = `${item.id}:${selected.map(m => `${m.groupId}:${m.id}`).sort().join("|")}`;
    const existing = result.find(line => line.lineId === lineId)?.quantity ?? 0;
    const increase = Math.max(0, Math.min(savedLine.quantity, MAX_QUANTITY - existing));
    const refreshedLine: CartLine = { ...item, lineId, quantity: existing + increase, selectedModifiers: selected };
    result = existing > 0
      ? result.map(line => line.lineId === lineId ? refreshedLine : line)
      : [...result, refreshedLine];
    added += increase;
  }
  return {cart:result,added,unavailable,mismatch:false};
}

