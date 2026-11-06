import { describe, expect, test } from "bun:test";
import {
  menuCategoryChanged,
  menuCategoryDraft,
  menuCategoryDraftChanged,
  menuOptionChanged,
  menuOptionDraft,
  menuOptionDraftChanged,
  validateMenuChoiceName,
  validateMenuOptionDraft,
} from "../src/lib/mealdeck-menu-choice-editor";
import type { OpsMenuCategory } from "../src/lib/mealdeck-ops-menu-structure";
import type { OpsModifierPrice } from "../src/lib/mealdeck-ops-modifier-prices";

const category: OpsMenuCategory = {
  category_id: "40000000-0000-4000-8000-000000000001",
  brand_id: "40000000-0000-4000-8000-000000000002",
  brand_name: "Skorch Burgers",
  category_name: "Beef smash",
  active: true,
  affected_item_count: 5,
};
const option: OpsModifierPrice = {
  option_id: "40000000-0000-4000-8000-000000000003",
  group_id: "40000000-0000-4000-8000-000000000004",
  group_name: "Burger extras",
  option_name: "Cheese",
  price_delta_pence: 50,
  active: true,
  affected_item_count: 8,
};

describe("category and add-on editor state", () => {
  test("drafts preserve exact prices and the saved availability without mutating IDs", () => {
    const before = JSON.stringify({ category, option });
    expect(menuCategoryDraft(category)).toEqual({ name: "Beef smash", active: true });
    expect(menuOptionDraft(option)).toEqual({ name: "Cheese", price: "0.50", active: true });
    expect(JSON.stringify({ category, option })).toBe(before);
    expect(menuOptionDraft({ ...option, price_delta_pence: 0, active: false })).toEqual({
      name: "Cheese",
      price: "0.00",
      active: false,
    });
  });

  test("name or availability changes are unsaved edits even when price is unchanged", () => {
    expect(menuOptionDraftChanged(menuOptionDraft(option), option)).toBe(false);
    expect(
      menuOptionDraftChanged({ ...menuOptionDraft(option), name: "Smoked cheese" }, option),
    ).toBe(true);
    expect(menuOptionDraftChanged({ ...menuOptionDraft(option), active: false }, option)).toBe(
      true,
    );
    expect(menuOptionDraftChanged({ ...menuOptionDraft(option), price: "0.5" }, option)).toBe(
      false,
    );
    expect(menuCategoryDraftChanged({ name: "Beef smash", active: false }, category)).toBe(true);
    expect(menuCategoryDraftChanged({ name: "  Beef smash  ", active: true }, category)).toBe(
      false,
    );
  });

  test("every writable add-on field and its group identity participates in stale detection", () => {
    for (const delta of [
      { option_name: "Mozzarella" },
      { price_delta_pence: 75 },
      { active: false },
      { group_id: category.brand_id },
      { option_id: category.category_id },
    ])
      expect(menuOptionChanged(option, { ...option, ...delta })).toBe(true);
    expect(menuOptionChanged(option, { ...option, affected_item_count: 9 })).toBe(false);
  });

  test("category stale detection checks both editable fields and stable ownership", () => {
    for (const delta of [
      { category_name: "Smash burgers" },
      { active: false },
      { category_id: option.option_id },
      { brand_id: option.group_id },
    ])
      expect(menuCategoryChanged(category, { ...category, ...delta })).toBe(true);
    expect(menuCategoryChanged(category, { ...category, affected_item_count: 12 })).toBe(false);
  });

  test("names follow database limits without silently changing visible wording", () => {
    expect(validateMenuChoiceName("  Skorch favourites  ", "category")).toEqual({
      valid: true,
      name: "Skorch favourites",
    });
    expect(validateMenuChoiceName("A", "category").valid).toBe(false);
    expect(validateMenuChoiceName("A", "option").valid).toBe(true);
    for (const name of ["", "   ", "x".repeat(141), "Name\nnext", "Name\tend", "Name\u007f"]) {
      expect(validateMenuChoiceName(name, "category").valid).toBe(false);
      expect(validateMenuChoiceName(name, "option").valid).toBe(false);
    }
  });

  test("option edits use exact integer pence and allow zero-price included choices", () => {
    expect(
      validateMenuOptionDraft({ name: "  Peri salt  ", price: "0.59", active: false }),
    ).toEqual({ valid: true, name: "Peri salt", pricePence: 59, active: false });
    expect(
      validateMenuOptionDraft({ name: "Included drink", price: "0.00", active: true }),
    ).toEqual({ valid: true, name: "Included drink", pricePence: 0, active: true });
    for (const price of ["", "-1", "0.001", "1e3", "£3", "NaN", "Infinity", "10000.01"]) {
      expect(validateMenuOptionDraft({ name: "Cheese", price, active: true }).valid).toBe(false);
    }
  });
});
