import type { OpsMenuCategory } from "./mealdeck-ops-menu-structure";
import type { OpsModifierPrice } from "./mealdeck-ops-modifier-prices";
import { poundsToPence } from "./mealdeck-ops-math";

export type MenuCategoryDraft = { name: string; active: boolean };
export type MenuOptionDraft = MenuCategoryDraft & { price: string };

export function menuCategoryDraft(row: OpsMenuCategory): MenuCategoryDraft {
  return { name: row.category_name, active: row.active };
}

export function menuOptionDraft(row: OpsModifierPrice): MenuOptionDraft {
  return {
    name: row.option_name,
    price: (row.price_delta_pence / 100).toFixed(2),
    active: row.active,
  };
}

export function menuCategoryChanged(previous: OpsMenuCategory, latest: OpsMenuCategory) {
  return (
    previous.category_id !== latest.category_id ||
    previous.brand_id !== latest.brand_id ||
    previous.category_name !== latest.category_name ||
    previous.active !== latest.active
  );
}

export function menuOptionChanged(previous: OpsModifierPrice, latest: OpsModifierPrice) {
  return (
    previous.option_id !== latest.option_id ||
    previous.group_id !== latest.group_id ||
    previous.option_name !== latest.option_name ||
    previous.price_delta_pence !== latest.price_delta_pence ||
    previous.active !== latest.active
  );
}

export function menuCategoryDraftChanged(draft: MenuCategoryDraft, saved: OpsMenuCategory) {
  return draft.name.trim() !== saved.category_name || draft.active !== saved.active;
}

export function menuOptionDraftChanged(draft: MenuOptionDraft, saved: OpsModifierPrice) {
  return (
    draft.name.trim() !== saved.option_name ||
    poundsToPence(draft.price) !== saved.price_delta_pence ||
    draft.active !== saved.active
  );
}

export function validateMenuChoiceName(name: string, kind: "category" | "option") {
  const trimmed = name.trim();
  const minimum = kind === "category" ? 2 : 1;
  if (
    trimmed.length < minimum ||
    trimmed.length > 140 ||
    [...name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return {
      valid: false as const,
      message: `Use ${minimum}–140 characters for the ${kind === "category" ? "category name" : "add-on name"}, without line breaks or control characters.`,
    };
  return { valid: true as const, name: trimmed };
}

export function validateMenuOptionDraft(draft: MenuOptionDraft) {
  const checked = validateMenuChoiceName(draft.name, "option");
  if (!checked.valid) return checked;
  const pricePence = poundsToPence(draft.price);
  if (pricePence === null || pricePence > 1_000_000)
    return {
      valid: false as const,
      message: "Enter a price from £0.00 to £10,000.00 with no more than two decimals.",
    };
  return { valid: true as const, name: checked.name, pricePence, active: draft.active };
}
