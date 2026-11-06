import { describe, expect, test } from "bun:test";
import { OpsRequestError, type opsRpc } from "../src/lib/mealdeck-ops-browser";
import {
  listMenuCategories,
  updateMenuCategory,
  type OpsMenuCategory,
} from "../src/lib/mealdeck-ops-menu-structure";
import {
  updateModifierOption,
  type OpsModifierPrice,
} from "../src/lib/mealdeck-ops-modifier-prices";

const tenant = "40000000-0000-4000-8000-000000000001";
const category: OpsMenuCategory = {
  category_id: "40000000-0000-4000-8000-000000000002",
  brand_id: "40000000-0000-4000-8000-000000000003",
  brand_name: "Skorch Burgers",
  category_name: "Beef smash",
  active: true,
  affected_item_count: 5,
};
const option: OpsModifierPrice = {
  option_id: "40000000-0000-4000-8000-000000000004",
  group_id: "40000000-0000-4000-8000-000000000005",
  group_name: "Burger extras",
  option_name: "Cheese",
  price_delta_pence: 50,
  active: true,
  affected_item_count: 8,
};
type Call = { name: string; parameters: Record<string, unknown> };
function transport(result: unknown, calls: Call[] = []): typeof opsRpc {
  return async <T>(name: string, parameters: Record<string, unknown> = {}) => {
    calls.push({ name, parameters });
    return result as T;
  };
}

describe("category and add-on authenticated edit transport", () => {
  test("category listing is tenant scoped and verifies unique canonical records", async () => {
    const calls: Call[] = [];
    expect(await listMenuCategories(tenant, transport([category], calls))).toEqual([category]);
    expect(calls).toEqual([
      { name: "mealdeck_ops_menu_categories", parameters: { p_tenant: tenant } },
    ]);
    for (const bad of [
      null,
      {},
      [category, category],
      [{ ...category, active: "true" }],
      [{ ...category, affected_item_count: -1 }],
      [{ ...category, category_id: "invalid" }],
    ]) {
      await expect(listMenuCategories(tenant, transport(bad))).rejects.toBeInstanceOf(
        OpsRequestError,
      );
    }
  });

  test("category update sends stable ownership and both expected fields with the requested values", async () => {
    const calls: Call[] = [];
    const saved = { ...category, category_name: "Signature smash", active: false, changed: true };
    expect(
      await updateMenuCategory(
        tenant,
        category,
        { name: "  Signature smash  ", active: false },
        transport(saved, calls),
      ),
    ).toEqual(saved);
    expect(calls).toEqual([
      {
        name: "mealdeck_ops_update_menu_category",
        parameters: {
          p_tenant: tenant,
          p_category: category.category_id,
          p_brand: category.brand_id,
          p_name: "Signature smash",
          p_active: false,
          p_expected_name: "Beef smash",
          p_expected_active: true,
        },
      },
    ]);
    expect(category.category_name).toBe("Beef smash");
    expect(category.active).toBe(true);
  });

  test("add-on edits send name, exact pence, availability and all expected fields atomically", async () => {
    const calls: Call[] = [];
    const saved = {
      ...option,
      option_name: "Smoked cheese",
      price_delta_pence: 75,
      active: false,
      changed: true,
    };
    expect(
      await updateModifierOption(
        tenant,
        option,
        { name: " Smoked cheese ", pricePence: 75, active: false },
        transport(saved, calls),
      ),
    ).toEqual(saved);
    expect(calls).toEqual([
      {
        name: "mealdeck_ops_modifier_update_option",
        parameters: {
          p_tenant: tenant,
          p_option: option.option_id,
          p_group: option.group_id,
          p_name: "Smoked cheese",
          p_price_pence: 75,
          p_active: false,
          p_expected_name: "Cheese",
          p_expected_price_pence: 50,
          p_expected_active: true,
        },
      },
    ]);
    expect(option.option_name).toBe("Cheese");
    expect(option.price_delta_pence).toBe(50);
  });

  test("a mismatched category receipt is never presented as a successful save", async () => {
    const saved = { ...category, category_name: "Signature smash", active: false, changed: true };
    for (const bad of [
      { ...saved, category_id: option.option_id },
      { ...saved, brand_id: option.group_id },
      { ...saved, category_name: "Other name" },
      { ...saved, active: true },
      { ...saved, changed: "true" },
    ])
      await expect(
        updateMenuCategory(
          tenant,
          category,
          { name: "Signature smash", active: false },
          transport(bad),
        ),
      ).rejects.toBeInstanceOf(OpsRequestError);
  });

  test("a mismatched add-on receipt cannot change group, identity, price or availability", async () => {
    const saved = {
      ...option,
      option_name: "Smoked cheese",
      price_delta_pence: 75,
      active: false,
      changed: true,
    };
    for (const bad of [
      { ...saved, option_id: category.category_id },
      { ...saved, group_id: category.brand_id },
      { ...saved, option_name: "Other name" },
      { ...saved, price_delta_pence: 76 },
      { ...saved, price_delta_pence: 75.5 },
      { ...saved, active: true },
      { ...saved, changed: undefined },
    ])
      await expect(
        updateModifierOption(
          tenant,
          option,
          { name: "Smoked cheese", pricePence: 75, active: false },
          transport(bad),
        ),
      ).rejects.toBeInstanceOf(OpsRequestError);
  });

  test("invalid edits do not make a network request", async () => {
    const calls: Call[] = [];
    const send = transport(null, calls);
    for (const name of ["", "A", "x".repeat(141), "Beef\nsmash"]) {
      await expect(
        updateMenuCategory(tenant, category, { name, active: true }, send),
      ).rejects.toBeInstanceOf(Error);
    }
    for (const pricePence of [-1, 0.5, 1_000_001, NaN, Infinity]) {
      await expect(
        updateModifierOption(tenant, option, { name: "Cheese", pricePence, active: true }, send),
      ).rejects.toBeInstanceOf(Error);
    }
    for (const name of ["", "x".repeat(141), "Cheese\nextra"]) {
      await expect(
        updateModifierOption(tenant, option, { name, pricePence: 50, active: true }, send),
      ).rejects.toBeInstanceOf(Error);
    }
    expect(calls).toHaveLength(0);
  });

  test("conflicts preserve their typed error so the UI keeps drafts and requires review", async () => {
    const conflict = new OpsRequestError("conflict", "Changed on another screen");
    const send: typeof opsRpc = async () => {
      throw conflict;
    };
    await expect(
      updateMenuCategory(tenant, category, { name: "New category", active: true }, send),
    ).rejects.toBe(conflict);
    await expect(
      updateModifierOption(
        tenant,
        option,
        { name: "New extra", pricePence: 75, active: true },
        send,
      ),
    ).rejects.toBe(conflict);
  });

  test("idempotent unchanged confirmations and zero-price options remain valid", async () => {
    expect(
      (
        await updateMenuCategory(
          tenant,
          category,
          { name: category.category_name, active: true },
          transport({ ...category, changed: false }),
        )
      ).changed,
    ).toBe(false);
    const included = { ...option, price_delta_pence: 0, changed: false };
    expect(
      await updateModifierOption(
        tenant,
        included,
        { name: included.option_name, pricePence: 0, active: true },
        transport(included),
      ),
    ).toEqual(included);
  });
});
