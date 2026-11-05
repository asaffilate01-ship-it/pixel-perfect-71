import { opsRpc, OpsRequestError } from "./mealdeck-ops-browser";

export type OpsModifierPrice = {
  option_id: string;
  group_id: string;
  group_name: string;
  option_name: string;
  price_delta_pence: number;
  active: boolean;
  affected_item_count: number;
};
export type OpsModifierPriceUpdate = OpsModifierPrice & { changed: boolean };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const price = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1000000;
const label = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 140;

function readRow(value: unknown): OpsModifierPrice {
  if (!value || typeof value !== "object") throw invalidResponse();
  const row = value as { [Key in keyof OpsModifierPrice]?: unknown };
  if (
    typeof row.option_id !== "string" ||
    !uuid.test(row.option_id) ||
    typeof row.group_id !== "string" ||
    !uuid.test(row.group_id) ||
    !label(row.group_name) ||
    !label(row.option_name) ||
    !price(row.price_delta_pence) ||
    typeof row.active !== "boolean" ||
    typeof row.affected_item_count !== "number" ||
    !Number.isSafeInteger(row.affected_item_count) ||
    row.affected_item_count < 0
  )
    throw invalidResponse();
  return {
    option_id: row.option_id,
    group_id: row.group_id,
    group_name: row.group_name,
    option_name: row.option_name,
    price_delta_pence: row.price_delta_pence,
    active: row.active,
    affected_item_count: row.affected_item_count,
  };
}

function invalidResponse() {
  return new OpsRequestError(
    "unavailable",
    "The saved option prices could not be verified. Reload prices and try again.",
  );
}

export async function listModifierPrices(tenantId: string): Promise<OpsModifierPrice[]> {
  const data = await opsRpc<unknown>("mealdeck_ops_modifier_prices", { p_tenant: tenantId });
  if (!Array.isArray(data)) throw invalidResponse();
  const rows = data.map(readRow);
  if (new Set(rows.map((row) => row.option_id)).size !== rows.length) throw invalidResponse();
  return rows;
}

export async function updateModifierPrice(
  tenantId: string,
  optionId: string,
  pricePence: number,
  expectedPricePence: number,
): Promise<OpsModifierPriceUpdate> {
  if (!price(pricePence) || !price(expectedPricePence)) {
    throw new Error("Enter a price from £0.00 to £10,000.00 with no more than two decimals.");
  }
  const data = await opsRpc<unknown>("mealdeck_ops_modifier_update_price", {
    p_tenant: tenantId,
    p_option: optionId,
    p_price_pence: pricePence,
    p_expected_price_pence: expectedPricePence,
  });
  const row = readRow(data);
  if (
    row.option_id !== optionId ||
    row.price_delta_pence !== pricePence ||
    typeof (data as Record<string, unknown>)["changed"] !== "boolean"
  )
    throw invalidResponse();
  return { ...row, changed: (data as Record<string, unknown>)["changed"] as boolean };
}
