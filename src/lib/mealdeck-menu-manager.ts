import type { OpsMenuItem } from "./mealdeck-ops-types";
import { poundsToPence } from "./mealdeck-ops-math";

export type MenuVisibility = "shown" | "hidden" | "inactive";
export type MenuVisibilityFilter = "all" | MenuVisibility;
export type MenuBulkAction = "hide" | "restore" | "deactivate";
export const UNASSIGNED_MENU_BRAND = "unassigned";

export type MenuFilters = {
  query: string;
  brand: string;
  category: string;
  visibility: MenuVisibilityFilter;
};

export type MenuProductDraft = {
  name: string;
  description: string;
  price: string;
  active: boolean;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
const label = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 200;

/** Do not turn malformed records into available products or invented prices. */
export function parseOpsMenuItems(value: unknown): OpsMenuItem[] {
  const invalid = () =>
    new Error("The saved menu could not be verified. Reload it before making changes.");
  if (!Array.isArray(value)) throw invalid();
  const seen = new Set<string>();
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw invalid();
    const row = entry as { [Key in keyof OpsMenuItem]?: unknown };
    if (
      typeof row.item_id !== "string" ||
      !uuid.test(row.item_id) ||
      seen.has(row.item_id) ||
      (row.brand_id !== null && (typeof row.brand_id !== "string" || !uuid.test(row.brand_id))) ||
      (row.brand_name !== null && !label(row.brand_name)) ||
      !label(row.category_name) ||
      !label(row.item_name) ||
      (row.description !== null && typeof row.description !== "string") ||
      !money(row.price_pence) ||
      !money(row.location_price_pence) ||
      typeof row.active !== "boolean" ||
      typeof row.visible !== "boolean" ||
      !Array.isArray(row.allergens) ||
      !row.allergens.every((allergen) => typeof allergen === "string")
    )
      throw invalid();
    seen.add(row.item_id);
    return {
      item_id: row.item_id,
      brand_id: row.brand_id,
      brand_name: row.brand_name,
      category_name: row.category_name,
      item_name: row.item_name,
      description: row.description,
      price_pence: row.price_pence,
      active: row.active,
      visible: row.visible,
      location_price_pence: row.location_price_pence,
      allergens: [...row.allergens],
    };
  });
}

/** Visibility is a saved menu setting, not a claim about stock or kitchen opening. */
export function menuVisibility(item: Pick<OpsMenuItem, "active" | "visible">): MenuVisibility {
  return !item.active ? "inactive" : item.visible ? "shown" : "hidden";
}

export function menuBrandChoices(items: readonly OpsMenuItem[]) {
  const choices = new Map<string, { id: string; name: string; count: number }>();
  for (const item of items) {
    const id = item.brand_id ?? UNASSIGNED_MENU_BRAND;
    const existing = choices.get(id);
    if (existing) existing.count++;
    else choices.set(id, { id, name: item.brand_name ?? "Unassigned brand", count: 1 });
  }
  return [...choices.values()].sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
}

export function menuCategoryChoices(items: readonly OpsMenuItem[], brand: string) {
  return [
    ...new Set(
      items
        .filter((item) => !brand || (item.brand_id ?? UNASSIGNED_MENU_BRAND) === brand)
        .map((item) => item.category_name),
    ),
  ].sort((a, b) => a.localeCompare(b, "en-GB"));
}

export function filterMenuItems(items: readonly OpsMenuItem[], filters: MenuFilters) {
  const terms = filters.query.trim().toLocaleLowerCase("en-GB").split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (filters.brand && (item.brand_id ?? UNASSIGNED_MENU_BRAND) !== filters.brand) return false;
    if (filters.category && item.category_name !== filters.category) return false;
    if (filters.visibility !== "all" && menuVisibility(item) !== filters.visibility) return false;
    const searchable =
      `${item.item_name} ${item.brand_name ?? ""} ${item.category_name} ${item.description ?? ""}`.toLocaleLowerCase(
        "en-GB",
      );
    return terms.every((term) => searchable.includes(term));
  });
}

export function menuVisibilityCounts(items: readonly OpsMenuItem[]) {
  const counts = { all: items.length, shown: 0, hidden: 0, inactive: 0 };
  for (const item of items) counts[menuVisibility(item)]++;
  return counts;
}

/** Limit changes to selected, currently authorised rows that actually need them. */
export function menuBulkTargets(
  items: readonly OpsMenuItem[],
  selectedIds: ReadonlySet<string>,
  action: MenuBulkAction,
) {
  return items.filter(
    (item) =>
      selectedIds.has(item.item_id) &&
      item.active &&
      (action === "deactivate" || (action === "hide" ? item.visible : !item.visible)),
  );
}

type MenuAvailabilityTransport = {
  read: () => Promise<OpsMenuItem[]>;
  setVisibility: (itemId: string, visible: boolean) => Promise<unknown>;
  updateProduct: (item: OpsMenuItem) => Promise<unknown>;
};

/** Each existing RPC audits its own change. Report partial completion explicitly. */
export async function executeMenuAvailabilityChanges(input: {
  action: MenuBulkAction;
  selectedIds: ReadonlySet<string>;
  transport: MenuAvailabilityTransport;
  isCurrent: () => boolean;
  onProgress: (done: number, total: number) => void;
}) {
  const completed = new Set<string>();
  const skipped = new Set<string>();
  let targetCount = 0;
  let failure = "";
  let cancelled = false;
  try {
    if (!input.isCurrent()) return { completed, skipped, targetCount, failure, cancelled: true };
    const rows = await input.transport.read();
    if (!input.isCurrent()) return { completed, skipped, targetCount, failure, cancelled: true };
    const targets = menuBulkTargets(rows, input.selectedIds, input.action);
    targetCount = targets.length;
    const targetIds = new Set(targets.map((item) => item.item_id));
    for (const itemId of input.selectedIds) if (!targetIds.has(itemId)) skipped.add(itemId);
    input.onProgress(0, targetCount);
    for (const target of targets) {
      if (!input.isCurrent()) {
        cancelled = true;
        break;
      }
      let saved: unknown;
      if (input.action === "deactivate") {
        // The existing master-product RPC also writes name/description/price.
        // Re-read immediately before each call instead of copying the initial list.
        const freshRows = await input.transport.read();
        if (!input.isCurrent()) {
          cancelled = true;
          break;
        }
        const fresh = freshRows.find((item) => item.item_id === target.item_id);
        if (!fresh || !fresh.active) {
          skipped.add(target.item_id);
          continue;
        }
        saved = await input.transport.updateProduct({ ...fresh, active: false });
      } else {
        saved = await input.transport.setVisibility(target.item_id, input.action === "restore");
      }
      if (saved !== true) throw new Error(`${target.item_name}: the change was not confirmed.`);
      completed.add(target.item_id);
      if (!input.isCurrent()) {
        cancelled = true;
        break;
      }
      input.onProgress(completed.size, targetCount);
    }
  } catch (reason) {
    failure =
      reason instanceof Error ? reason.message : "The availability change could not be confirmed.";
  }
  return { completed, skipped, targetCount, failure, cancelled };
}

export function menuProductDraft(item: OpsMenuItem): MenuProductDraft {
  return {
    name: item.item_name,
    description: item.description ?? "",
    price: (item.price_pence / 100).toFixed(2),
    active: item.active,
  };
}

export function menuDraftHasChanges(draft: MenuProductDraft, item: OpsMenuItem) {
  return (
    draft.name.trim() !== item.item_name ||
    draft.description !== (item.description ?? "") ||
    poundsToPence(draft.price) !== item.price_pence ||
    draft.active !== item.active
  );
}

/** Compare only fields this editor writes; local visibility and allergens are independent. */
export function menuMasterChanged(previous: OpsMenuItem, latest: OpsMenuItem) {
  return (
    previous.item_id !== latest.item_id ||
    previous.item_name !== latest.item_name ||
    (previous.description ?? "") !== (latest.description ?? "") ||
    previous.price_pence !== latest.price_pence ||
    previous.active !== latest.active
  );
}

export function validateMenuProductDraft(
  draft: MenuProductDraft,
):
  | { valid: true; name: string; description: string; pricePence: number; active: boolean }
  | { valid: false; field: "name" | "description" | "price"; message: string } {
  const name = draft.name.trim();
  if (!name || name.length > 140)
    return {
      valid: false,
      field: "name",
      message: "Enter a product name between 1 and 140 characters.",
    };
  if (draft.description.length > 2000)
    return {
      valid: false,
      field: "description",
      message: "Keep the description to 2,000 characters or fewer.",
    };
  const pricePence = poundsToPence(draft.price);
  if (pricePence === null || pricePence > 1_000_000)
    return {
      valid: false,
      field: "price",
      message: "Enter a price from £0.00 to £10,000.00 with no more than two decimals.",
    };
  return { valid: true, name, description: draft.description, pricePence, active: draft.active };
}
