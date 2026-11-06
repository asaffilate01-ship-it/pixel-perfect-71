import { opsRpc, OpsRequestError } from "./mealdeck-ops-browser";

export type OpsMenuCategory = {
  category_id: string;
  brand_id: string;
  brand_name: string;
  category_name: string;
  active: boolean;
  affected_item_count: number;
};
export type OpsMenuCategoryUpdate = OpsMenuCategory & { changed: boolean };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hasControl = (value: string) =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
const label = (value: unknown, minimum = 1): value is string =>
  typeof value === "string" &&
  value.trim().length >= minimum &&
  value.length <= 140 &&
  !hasControl(value);
const invalid = () =>
  new OpsRequestError(
    "unavailable",
    "The saved categories could not be verified. Reload categories and try again.",
  );

function readCategory(value: unknown): OpsMenuCategory {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const row = value as Record<string, unknown>;
  if (
    typeof row["category_id"] !== "string" ||
    !uuid.test(row["category_id"]) ||
    typeof row["brand_id"] !== "string" ||
    !uuid.test(row["brand_id"]) ||
    !label(row["brand_name"]) ||
    !label(row["category_name"], 2) ||
    typeof row["active"] !== "boolean" ||
    typeof row["affected_item_count"] !== "number" ||
    !Number.isSafeInteger(row["affected_item_count"]) ||
    row["affected_item_count"] < 0
  )
    throw invalid();
  return {
    category_id: row["category_id"],
    brand_id: row["brand_id"],
    brand_name: row["brand_name"],
    category_name: row["category_name"],
    active: row["active"],
    affected_item_count: row["affected_item_count"],
  };
}

export async function listMenuCategories(
  tenantId: string,
  request: typeof opsRpc = opsRpc,
): Promise<OpsMenuCategory[]> {
  const data = await request<unknown>("mealdeck_ops_menu_categories", { p_tenant: tenantId });
  if (!Array.isArray(data)) throw invalid();
  const rows = data.map(readCategory);
  if (new Set(rows.map((row) => row.category_id)).size !== rows.length) throw invalid();
  return rows;
}

export async function updateMenuCategory(
  tenantId: string,
  current: OpsMenuCategory,
  draft: { name: string; active: boolean },
  request: typeof opsRpc = opsRpc,
): Promise<OpsMenuCategoryUpdate> {
  const previous = readCategory(current);
  const name = draft.name.trim();
  if (!label(name, 2) || hasControl(draft.name) || typeof draft.active !== "boolean")
    throw new Error("Use a category name of 2–140 characters and choose its availability.");
  const data = await request<unknown>("mealdeck_ops_update_menu_category", {
    p_tenant: tenantId,
    p_category: previous.category_id,
    p_brand: previous.brand_id,
    p_name: name,
    p_active: draft.active,
    p_expected_name: previous.category_name,
    p_expected_active: previous.active,
  });
  const row = readCategory(data);
  const changed = (data as Record<string, unknown>)["changed"];
  if (
    row.category_id !== previous.category_id ||
    row.brand_id !== previous.brand_id ||
    row.category_name !== name ||
    row.active !== draft.active ||
    typeof changed !== "boolean"
  )
    throw invalid();
  return { ...row, changed };
}
