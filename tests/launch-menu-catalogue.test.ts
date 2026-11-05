import { describe, expect, it } from "bun:test";
import {
  getLaunchMenuBrand,
  launchMenuBrands,
  launchMenuSources,
  LAUNCH_ITEM_PRICE_PENCE,
  LAUNCH_UPGRADE_PRICE_PENCE,
  LAUNCH_CROSS_UPGRADE_PRICE_PENCE,
  type LaunchMenuBrand,
  type LaunchMenuOptionGroup,
} from "../src/lib/launch-menu-catalogue";

function brand(id: string): LaunchMenuBrand {
  const result = getLaunchMenuBrand(id);
  if (!result) throw new Error("Missing supplied-menu brand: " + id);
  return result;
}

function group(brandId: string, groupId: string): LaunchMenuOptionGroup {
  const result = brand(brandId).optionGroups.find((entry) => entry.id === groupId);
  if (!result) throw new Error("Missing supplied-menu group: " + groupId);
  return result;
}

describe("Supplied launch menu transcription", () => {
  it("retains the five supplied brands and all 77 products in 20 sections", () => {
    expect(
      launchMenuBrands.map((entry) => ({
        id: entry.id,
        sections: entry.sections.length,
        items: entry.sections.reduce((total, section) => total + section.items.length, 0),
      })),
    ).toEqual([
      { id: "tavo-chicken", sections: 7, items: 21 },
      { id: "moktl", sections: 1, items: 8 },
      { id: "loadd", sections: 4, items: 20 },
      { id: "skorch-burgers", sections: 4, items: 18 },
      { id: "souvano", sections: 4, items: 10 },
    ]);
    expect(getLaunchMenuBrand("not-a-supplied-brand")).toBeUndefined();
  });

  it("applies the owner's £20 starting price to every standalone product, including cans and sides", () => {
    expect(LAUNCH_ITEM_PRICE_PENCE).toBe(2000);
    for (const entry of launchMenuBrands) {
      for (const section of entry.sections) {
        for (const item of section.items) {
          expect(Number.isSafeInteger(item.pricePence)).toBe(true);
          expect(item.pricePence).toBe(2000);
        }
      }
    }
  });

  it("charges £20 for every optional add-on, meal or upgrade and retains included choices at no extra charge", () => {
    expect(LAUNCH_UPGRADE_PRICE_PENCE).toBe(2000);
    expect(LAUNCH_CROSS_UPGRADE_PRICE_PENCE).toBe(2000);
    const included = new Set([
      "tavo-chicken-portion",
      "tavo-chicken-flavour",
      "souvano-donner-flavour",
      "souvano-heatwave-base",
      "souvano-meal-side",
    ]);
    for (const entry of launchMenuBrands) {
      for (const optionGroup of entry.optionGroups) {
        for (const option of optionGroup.options) {
          expect(Number.isSafeInteger(option.pricePence)).toBe(true);
          expect(option.pricePence).toBe(included.has(optionGroup.id) ? 0 : 2000);
        }
      }
    }
  });

  it("resolves the Skorch marketing alias while preserving the operational brand ID", () => {
    const canonical = getLaunchMenuBrand("skorch-burgers");
    expect(canonical).toBeDefined();
    expect(getLaunchMenuBrand("skorch")).toBe(canonical);
    expect(getLaunchMenuBrand("skorch")?.id).toBe("skorch-burgers");
    expect(launchMenuBrands.filter((entry) => entry.id === "skorch-burgers")).toHaveLength(1);
  });

  it("retains Tavo's 3/5/8 portions and four wing/tender flavours without applying them to burgers", () => {
    const portions = group("tavo-chicken", "tavo-chicken-portion");
    expect(portions.options.map((option) => option.label)).toEqual(["3 pcs", "5 pcs", "8 pcs"]);
    expect(portions.kind).toBe("single");
    expect(portions.required).toBe(true);
    const flavours = group("tavo-chicken", "tavo-chicken-flavour");
    expect(flavours.options.map((option) => option.label)).toEqual([
      "Plain Flavour",
      "Korean BBQ",
      "Dynamite",
      "Fiery Sweet Chilli",
    ]);
    expect(flavours.required).toBe(true);
    for (const id of ["fried-chicken-wings", "fried-chicken-tenders", "grilled-chicken-wings"]) {
      const item = brand("tavo-chicken").sections.find((section) => section.id === id)?.items[0];
      expect(item?.optionGroupIds).toContain(portions.id);
      expect(item?.optionGroupIds).toContain(flavours.id);
    }
    const burgers = brand("tavo-chicken").sections.find((section) => section.id === "burgers");
    for (const item of burgers?.items ?? []) {
      expect(item.optionGroupIds).not.toContain(portions.id);
      expect(item.optionGroupIds).not.toContain(flavours.id);
    }
    const dip = group("tavo-chicken", "tavo-chicken-dipped-burger");
    expect(dip.required).toBe(false);
    expect(dip.options.map((option) => option.label)).toEqual([
      "Korean BBQ",
      "Dynamite",
      "Fiery Sweet Chilli",
    ]);
  });

  it("preserves Skorch's three-ring add-on without inventing a quantity for Tavo", () => {
    const tavo = group("tavo-chicken", "tavo-chicken-burger-add-ons");
    const skorch = group("skorch-burgers", "skorch-burgers-burger-add-ons");
    expect(tavo.options.map((option) => option.label)).toEqual([
      "2 Rashers",
      "Onion Rings",
      "Cheese Slice",
    ]);
    expect(skorch.options.map((option) => option.label)).toEqual([
      "2 Rashers",
      "3 Onion Rings",
      "Cheese Slice",
    ]);
    expect(tavo.kind).toBe("multiple");
    expect(skorch.kind).toBe("multiple");
    expect(tavo.required).toBe(false);
    expect(skorch.required).toBe(false);
  });

  it("retains Souvano's flavours and reveals a required meal side only after the optional meal", () => {
    const flavours = group("souvano", "souvano-donner-flavour");
    expect(flavours.options.map((option) => option.label)).toEqual([
      "Plain",
      "Fiery Sweet Chilli",
      "Dynamite",
      "Korean BBQ",
    ]);
    const meal = group("souvano", "souvano-make-it-a-meal");
    const side = group("souvano", "souvano-meal-side");
    expect(meal.required).toBe(false);
    expect(side.kind).toBe("single");
    expect(side.required).toBe(true);
    expect(side.options.map((option) => option.label)).toEqual(["Fries", "Rice", "Naan"]);
    expect(side.when).toEqual({ groupId: meal.id, optionIds: [meal.options[0].id] });
    for (const id of ["stir-fry-donner", "lamb-chops"]) {
      const item = brand("souvano").sections.find((section) => section.id === id)?.items[0];
      expect(item?.optionGroupIds).toContain(meal.id);
      expect(item?.optionGroupIds).toContain(side.id);
    }
  });

  it("keeps Heatwave's included base selectable without adding a second base for its meal", () => {
    const base = group("souvano", "souvano-heatwave-base");
    expect(base.options.map((option) => option.label)).toEqual([
      "Fragrant spicy rice",
      "Naan",
      "Fries",
    ]);
    expect(base.required).toBe(true);
    expect(base.kind).toBe("single");
    expect(base.when).toBeUndefined();
    const heatwave = brand("souvano").sections.find((section) => section.id === "heatwave")
      ?.items[0];
    expect(heatwave?.optionGroupIds).toContain(base.id);
    expect(heatwave?.optionGroupIds).toContain("souvano-make-it-a-meal");
    expect(heatwave?.optionGroupIds).not.toContain("souvano-meal-side");
  });

  it("conditions main-meal upgrades while keeping included kids meals independent of a meal toggle", () => {
    for (const id of ["tavo-chicken", "skorch-burgers"]) {
      const meal = group(id, id + "-make-it-a-meal");
      const upgrades = group(id, id + "-meal-upgrades");
      expect(upgrades.required).toBe(false);
      expect(upgrades.when).toEqual({ groupId: meal.id, optionIds: [meal.options[0].id] });
      const kidsUpgrades = group(id, id + "-kids-meal-upgrades");
      expect(kidsUpgrades.required).toBe(false);
      expect(kidsUpgrades.when).toBeUndefined();
      const kids = brand(id).sections.find((section) => section.id.startsWith("kids-"));
      expect(kids?.items[0].optionGroupIds).toEqual([kidsUpgrades.id]);
    }
  });

  it("resolves source evidence, dependencies and browse targets without ID collisions", () => {
    const references = new Set(
      launchMenuSources.flatMap((source) => [
        source.id,
        ...source.regions.map((region) => source.id + "#" + region.id),
      ]),
    );
    const ids = new Set<string>();
    for (const source of launchMenuSources) {
      for (const region of source.regions) {
        const [x, y, width, height] = region.bounds;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
        expect(x + width).toBeLessThanOrEqual(source.width);
        expect(y + height).toBeLessThanOrEqual(source.height);
      }
    }
    for (const entry of launchMenuBrands) {
      const groups = new Map(
        entry.optionGroups.map((optionGroup) => [optionGroup.id, optionGroup]),
      );
      const sourceBearing = [
        entry,
        ...entry.sections,
        ...entry.sections.flatMap((section) => section.items),
        ...entry.optionGroups,
        ...entry.optionGroups.flatMap((optionGroup) => optionGroup.options),
        ...entry.upsells,
      ];
      for (const record of sourceBearing) {
        expect(record.sourceRefs.length).toBeGreaterThan(0);
        for (const reference of record.sourceRefs) expect(references.has(reference)).toBe(true);
      }
      const declaredIds = [
        ...entry.sections.flatMap((section) => section.items.map((item) => item.id)),
        ...entry.optionGroups.flatMap((optionGroup) => [
          optionGroup.id,
          ...optionGroup.options.map((option) => option.id),
        ]),
        ...entry.upsells.map((upsell) => upsell.id),
      ];
      for (const id of declaredIds) {
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
      for (const section of entry.sections) {
        for (const item of section.items) {
          for (const id of item.optionGroupIds) {
            const optionGroup = groups.get(id);
            expect(optionGroup).toBeDefined();
            if (optionGroup?.when) {
              expect(item.optionGroupIds).toContain(optionGroup.when.groupId);
              const trigger = groups.get(optionGroup.when.groupId);
              for (const optionId of optionGroup.when.optionIds) {
                expect(trigger?.options.some((option) => option.id === optionId)).toBe(true);
              }
            }
          }
        }
      }
      for (const upsell of entry.upsells) {
        if (upsell.optionGroupId) expect(groups.has(upsell.optionGroupId)).toBe(true);
        if (upsell.targetBrandId) {
          expect(
            getLaunchMenuBrand(upsell.targetBrandId)?.sections.some(
              (section) => section.id === upsell.targetSectionId,
            ),
          ).toBe(true);
        }
      }
    }
  });
});
