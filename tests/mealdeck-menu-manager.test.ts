import { describe, expect, it } from "bun:test";
import {
  executeMenuAvailabilityChanges,
  filterMenuItems,
  menuBrandChoices,
  menuBulkTargets,
  menuCategoryChoices,
  menuDraftHasChanges,
  menuMasterChanged,
  menuProductDraft,
  menuVisibility,
  menuVisibilityCounts,
  parseOpsMenuItems,
  validateMenuProductDraft,
} from "../src/lib/mealdeck-menu-manager";
import type { OpsMenuItem } from "../src/lib/mealdeck-ops-types";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const skorch = id(1001);
const tavo = id(1002);
function product(value: number, overrides: Partial<OpsMenuItem> = {}): OpsMenuItem {
  return {
    item_id: id(value),
    brand_id: skorch,
    brand_name: "Skorch",
    category_name: "Sides",
    item_name: "Chicken nuggets",
    description: "Crispy chicken pieces",
    price_pence: 400,
    location_price_pence: 400,
    active: true,
    visible: true,
    allergens: ["Wheat"],
    ...overrides,
  };
}
const filters = { query: "", brand: "", category: "", visibility: "all" as const };

describe("Menu manager — saved data and discovery", () => {
  it("keeps brand-specific prices separate even when products and categories have the same names", () => {
    const items = [
      product(1),
      product(2, {
        brand_id: tavo,
        brand_name: "Tavo Chicken",
        price_pence: 350,
        location_price_pence: 350,
      }),
    ];
    expect(filterMenuItems(items, { ...filters, brand: tavo })).toEqual([items[1]!]);
    expect(menuBrandChoices(items).map((brand) => brand.id)).toEqual([skorch, tavo]);
    expect(items[0]!.price_pence).toBe(400);
    expect(items[1]!.price_pence).toBe(350);
  });

  it("searches all loaded products rather than silently truncating the catalogue after 120", () => {
    const items = Array.from({ length: 750 }, (_, index) =>
      product(index + 1, { item_name: `Dish ${index + 1}` }),
    );
    expect(filterMenuItems(items, filters)).toHaveLength(750);
    expect(
      filterMenuItems(items, { ...filters, query: "dish 750" }).map((item) => item.item_id),
    ).toEqual([id(750)]);
  });

  it("combines search words, brand, category and status without mutating the source list", () => {
    const shown = product(1);
    const hidden = product(2, { visible: false });
    const inactive = product(3, { active: false, visible: true });
    const other = product(4, { brand_id: tavo, brand_name: "Tavo Chicken" });
    const items = [shown, hidden, inactive, other];
    expect(
      filterMenuItems(items, {
        query: "  CRISPY skorch ",
        brand: skorch,
        category: "Sides",
        visibility: "hidden",
      }),
    ).toEqual([hidden]);
    expect(items).toEqual([shown, hidden, inactive, other]);
    expect(menuVisibilityCounts(items)).toEqual({ all: 4, shown: 2, hidden: 1, inactive: 1 });
    expect(menuVisibility(inactive)).toBe("inactive");
  });

  it("only offers categories belonging to the selected brand", () => {
    const items = [
      product(1),
      product(2, { brand_id: tavo, brand_name: "Tavo", category_name: "Wings" }),
    ];
    expect(menuCategoryChoices(items, skorch)).toEqual(["Sides"]);
    expect(menuCategoryChoices(items, "")).toEqual(["Sides", "Wings"]);
  });

  it("rejects ambiguous or malformed server rows instead of showing guessed availability or prices", () => {
    for (const rows of [
      null,
      {},
      [product(1), product(1)],
      [product(1, { price_pence: 1.5 })],
      [{ ...product(1), visible: "true" }],
      [{ ...product(1), location_price_pence: "400" }],
      [{ ...product(1), item_id: "other" }],
      [{ ...product(1), allergens: null }],
    ]) {
      expect(() => parseOpsMenuItems(rows)).toThrow("saved menu could not be verified");
    }
    expect(parseOpsMenuItems([product(1)])).toEqual([product(1)]);
  });
});

describe("Menu manager — prices and edit freshness", () => {
  it("edits the master price without replacing a kitchen override", () => {
    const item = product(1, { price_pence: 650, location_price_pence: 699 });
    const draft = menuProductDraft(item);
    expect(draft.price).toBe("6.50");
    expect(validateMenuProductDraft({ ...draft, price: "6.99" })).toMatchObject({
      valid: true,
      pricePence: 699,
    });
    expect(item.location_price_pence).toBe(699);
    expect(menuDraftHasChanges({ ...draft, price: "6.5" }, item)).toBe(false);
    expect(menuDraftHasChanges({ ...draft, price: "6.99" }, item)).toBe(true);
  });

  it("validates the same bounds as the existing product RPC, in integer pence", () => {
    const draft = menuProductDraft(product(1));
    for (const amount of ["-1", "6.999", "1e3", "£6.50", "10000.01", "NaN", ""]) {
      expect(validateMenuProductDraft({ ...draft, price: amount })).toMatchObject({
        valid: false,
        field: "price",
      });
    }
    expect(validateMenuProductDraft({ ...draft, name: "  ", price: "6.50" })).toMatchObject({
      valid: false,
      field: "name",
    });
    expect(validateMenuProductDraft({ ...draft, description: "x".repeat(2001) })).toMatchObject({
      valid: false,
      field: "description",
    });
    expect(
      validateMenuProductDraft({ ...draft, name: " Chicken nuggets ", price: "6.99" }),
    ).toEqual({
      valid: true,
      name: "Chicken nuggets",
      description: "Crispy chicken pieces",
      pricePence: 699,
      active: true,
    });
  });

  it("requires review after another editor changes fields this form writes, while keeping local visibility independent", () => {
    const previous = product(1);
    expect(menuMasterChanged(previous, product(1, { price_pence: 499 }))).toBe(true);
    expect(menuMasterChanged(previous, product(1, { active: false }))).toBe(true);
    expect(menuMasterChanged(previous, product(1, { description: "New recipe description" }))).toBe(
      true,
    );
    expect(menuMasterChanged(previous, product(1, { visible: false, allergens: ["Milk"] }))).toBe(
      false,
    );
  });
});

describe("Menu manager — scoped availability changes", () => {
  it("does not restore inactive products or write IDs missing from the authorised menu", () => {
    const items = [
      product(1),
      product(2, { visible: false }),
      product(3, { active: false, visible: false }),
    ];
    const selected = new Set([id(1), id(2), id(3), id(99)]);
    expect(menuBulkTargets(items, selected, "hide").map((item) => item.item_id)).toEqual([id(1)]);
    expect(menuBulkTargets(items, selected, "restore").map((item) => item.item_id)).toEqual([
      id(2),
    ]);
    expect(menuBulkTargets(items, selected, "deactivate").map((item) => item.item_id)).toEqual([
      id(1),
      id(2),
    ]);
  });

  it("re-reads every product before global deactivation so current prices and descriptions are preserved", async () => {
    let reads = 0;
    const writes: OpsMenuItem[] = [];
    const result = await executeMenuAvailabilityChanges({
      action: "deactivate",
      selectedIds: new Set([id(1), id(2)]),
      isCurrent: () => true,
      onProgress: () => {},
      transport: {
        read: async () => {
          reads++;
          return [
            product(1, { price_pence: reads === 1 ? 400 : 499 }),
            product(2, { description: reads < 3 ? "Old details" : "Current approved details" }),
          ];
        },
        setVisibility: async () => {
          throw new Error("Wrong scope");
        },
        updateProduct: async (item) => {
          writes.push(item);
          return true;
        },
      },
    });
    expect(reads).toBe(3);
    expect(writes[0]).toMatchObject({ item_id: id(1), price_pence: 499, active: false });
    expect(writes[1]).toMatchObject({
      item_id: id(2),
      description: "Current approved details",
      active: false,
    });
    expect([...result.completed]).toEqual([id(1), id(2)]);
    expect(result.failure).toBe("");
  });

  it("stops on an unconfirmed write and reports the confirmed subset without claiming the whole batch saved", async () => {
    const writes: string[] = [];
    const progress: number[] = [];
    const result = await executeMenuAvailabilityChanges({
      action: "hide",
      selectedIds: new Set([id(1), id(2), id(3)]),
      isCurrent: () => true,
      onProgress: (done) => progress.push(done),
      transport: {
        read: async () => [product(1), product(2), product(3)],
        updateProduct: async () => {
          throw new Error("Master products must not change");
        },
        setVisibility: async (itemId, visible) => {
          expect(visible).toBe(false);
          writes.push(itemId);
          return itemId === id(1) ? true : { success: true };
        },
      },
    });
    expect(writes).toEqual([id(1), id(2)]);
    expect([...result.completed]).toEqual([id(1)]);
    expect(result.failure).toContain("change was not confirmed");
    expect(progress).toEqual([0, 1]);
  });

  it("makes no further writes when the operator changes kitchen during a batch", async () => {
    let current = true;
    let writes = 0;
    const result = await executeMenuAvailabilityChanges({
      action: "hide",
      selectedIds: new Set([id(1), id(2)]),
      isCurrent: () => current,
      onProgress: () => {},
      transport: {
        read: async () => [product(1), product(2)],
        updateProduct: async () => {
          throw new Error("Wrong scope");
        },
        setVisibility: async () => {
          writes++;
          current = false;
          return true;
        },
      },
    });
    expect(writes).toBe(1);
    expect(result.cancelled).toBe(true);
    expect([...result.completed]).toEqual([id(1)]);
  });

  it("skips products already changed elsewhere and never turns them back on", async () => {
    let reads = 0;
    const result = await executeMenuAvailabilityChanges({
      action: "deactivate",
      selectedIds: new Set([id(1)]),
      isCurrent: () => true,
      onProgress: () => {},
      transport: {
        read: async () => [product(1, { active: ++reads === 1 })],
        updateProduct: async () => {
          throw new Error("Already inactive; no write expected");
        },
        setVisibility: async () => {
          throw new Error("Wrong scope");
        },
      },
    });
    expect([...result.skipped]).toEqual([id(1)]);
    expect(result.completed.size).toBe(0);
    expect(result.failure).toBe("");
  });
});
