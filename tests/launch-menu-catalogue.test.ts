import { describe, expect, it } from "bun:test";
import {
  getLaunchMenuBrand,
  launchMenuBrands,
  launchMenuSources,
  isLaunchBrandPriceApproved,
  launchMenuPriceApproval,
  getLaunchMenuPriceVariant,
  launchMenuConfiguredItemPrice,
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
  it("retains the five approved brands and all 79 products in 20 sections", () => {
    expect(
      launchMenuBrands.map((entry) => ({
        id: entry.id,
        sections: entry.sections.length,
        items: entry.sections.reduce((total, section) => total + section.items.length, 0),
      })),
    ).toEqual([
      { id: "tavo-chicken", sections: 7, items: 22 },
      { id: "moktl", sections: 1, items: 8 },
      { id: "loadd", sections: 5, items: 27 },
      { id: "skorch-burgers", sections: 4, items: 19 },
      { id: "souvano", sections: 3, items: 3 },
    ]);
    expect(getLaunchMenuBrand("not-a-supplied-brand")).toBeUndefined();
  });

  it("matches every supplied standalone price, including brand-specific drinks and nuggets", () => {
    const standardDrinks = [
      ["Pepsi", 100],
      ["Pepsi Max", 100],
      ["Tango Orange", 100],
      ["Tango Apple", 100],
      ["Rubicon Mango", 100],
      ["7up", 100],
      ["Water Bottle", 100],
      ["Red Bull", 220],
    ];
    const sides = [
      ["Fries", 200],
      ["Peri Fries", 250],
      ["Onion Rings (x6)", 250],
      ["Mozzarella Sticks (x6)", 300],
      ["Chilli Cheese Nuggets (x6)", 300],
      ["Chicken Nuggets (x6)", 400],
    ];
    const expected = {
      "skorch-burgers": {
        "beef-smash-deck": [
          ["The Ace", 399],
          ["Double Deal", 550],
          ["Triple Stack", 700],
          ["Four of a Kind", 899],
        ],
        "kids-meal": [["Nuggets Meal", 500]],
        sides,
        "cans-drinks": standardDrinks,
      },
      "tavo-chicken": {
        burgers: [
          ["Cruncher", 449],
          ["Twin Crunch", 599],
          ["Flame", 550],
          ["Big Flame", 650],
        ],
        "fried-chicken-wings": [["Fried Chicken Wings", 299]],
        "fried-chicken-tenders": [["Fried Chicken Tenders", 299]],
        "grilled-chicken-wings": [["Grilled Chicken Wings", 249]],
        "kids-meals": [["Nuggets Meal", 500]],
        sides: [...sides.slice(0, 5), ["Chicken Nuggets (x6)", 350]],
        "cans-drinks": [
          ["Coke", 100],
          ["Pepsi Max", 100],
          ["Tango Apple", 100],
          ["Miranda Orange", 100],
          ["Miranda Strawberry", 100],
          ["Barr Limeade", 100],
          ["Water Bottle", 100],
          ["Red Bull", 220],
        ],
      },
      loadd: {
        "loaded-fries": [
          ["King of Hearts", 550],
          ["Queen of Hearts", 550],
          ["Jack of Diamonds", 550],
          ["King of Spades", 550],
        ],
        "loaded-mac-cheese": [
          ["Ace Mac", 500],
          ["Jack’s Mac", 599],
          ["Diamond Melt", 599],
          ["Spade Stack", 599],
          ["King’s Mac", 599],
        ],
        "full-house": [
          ["King of Hearts", 699],
          ["Queen of Hearts", 699],
          ["Jack of Diamonds", 699],
          ["King of Spades", 699],
        ],
        sides,
        "cans-drinks": standardDrinks,
      },
      moktl: {
        "mocktail-lounge": [
          ["Virgin Mojito", 450],
          ["Mango Mirage", 450],
          ["Lychee Breeze", 450],
          ["Apple Rush", 450],
          ["Blue Wave", 450],
          ["Strawberry Splash", 450],
          ["Passion Paradise", 450],
          ["Rush Hour", 600],
        ],
      },
      souvano: {
        "stir-fry-donner": [["Stir-Fry Doner", 650]],
        heatwave: [["Heatwave", 699]],
        "lamb-chops": [["Lamb Chops", 999]],
      },
    };
    for (const entry of launchMenuBrands) {
      expect(isLaunchBrandPriceApproved(entry.id)).toBe(true);
      expect(
        Object.fromEntries(
          entry.sections.map((section) => [
            section.id,
            section.items.map((item) => [item.name, item.pricePence]),
          ]),
        ),
      ).toEqual(expected[entry.id]);
    }
    expect(isLaunchBrandPriceApproved("paratique")).toBe(false);
    expect(brand("skorch").sections[0]?.description).toContain(
      "lettuce, cheese, gherkin, caramelised onion",
    );
    expect(brand("tavo-chicken").sections[0]?.description).not.toContain("caramelised");
    expect(brand("tavo-chicken").sections[0]?.items.map((item) => item.description)).toEqual([
      "Buttermilk fried chicken fillet",
      "2 buttermilk fried chicken fillets",
      "Spicy grilled chicken fillet",
      "2 spicy grilled chicken fillets",
    ]);
  });

  it("prices every upgrade and add-on, charging a selected Tavo dip once", () => {
    for (const id of ["tavo-chicken", "skorch-burgers"]) {
      expect(group(id, `${id}-make-it-a-meal`).options.map((option) => option.pricePence)).toEqual([
        250,
      ]);
      for (const suffix of ["meal-upgrades", "kids-meal-upgrades"])
        expect(group(id, `${id}-${suffix}`).options.map((option) => option.pricePence)).toEqual([
          50, 299, 399, 299, 299,
        ]);
      for (const suffix of ["included-meal-drink", "kids-included-drink"]) {
        const included = group(id, `${id}-${suffix}`);
        expect(included.options).toHaveLength(7);
        expect(
          included.options.every(
            (option) => option.pricePence === 0 && option.label !== "Red Bull",
          ),
        ).toBe(true);
        expect(included.replacedBy?.crossSlot).toBe("drink");
      }
    }
    const milkshakes = launchMenuBrands
      .flatMap((entry) => entry.optionGroups.flatMap((entry) => entry.options))
      .filter((option) => /^milkshake/i.test(option.label));
    expect(milkshakes).toHaveLength(4);
    expect(
      milkshakes.every(
        (option) =>
          option.pricePence === 299 &&
          option.available === false &&
          option.unavailableReason === "Flavours coming soon",
      ),
    ).toBe(true);
    expect(
      group("skorch", "skorch-burgers-burger-add-ons").options.map((option) => option.pricePence),
    ).toEqual([199, 199, 50]);
    expect(
      group("tavo-chicken", "tavo-chicken-burger-add-ons").options.map(
        (option) => option.pricePence,
      ),
    ).toEqual([150, 150, 50]);
    expect(
      group("tavo-chicken", "tavo-chicken-dipped-burger").options.map(
        (option) => option.pricePence,
      ),
    ).toEqual([150, 150, 150]);
  });

  it("matches all 36 Tavo flavour × portion prices and rejects incomplete or ambiguous selections", () => {
    const fried = {
      "plain-flavour": [299, 550, 649],
      "korean-bbq": [350, 650, 799],
      dynamite: [350, 650, 799],
      "fiery-sweet-chilli": [350, 650, 899],
    };
    const grilled = {
      "plain-flavour": [249, 449, 649],
      "spicy-honey-bbq": [299, 499, 699],
      dynamite: [299, 499, 699],
      "fiery-sweet-chilli": [299, 499, 699],
    };
    for (const sectionId of [
      "fried-chicken-wings",
      "fried-chicken-tenders",
      "grilled-chicken-wings",
    ]) {
      const item = brand("tavo-chicken").sections.find((section) => section.id === sectionId)!
        .items[0]!;
      const isGrilled = sectionId === "grilled-chicken-wings";
      const flavourGroup = isGrilled ? "tavo-grilled-chicken-flavour" : "tavo-chicken-flavour";
      for (const [flavour, prices] of Object.entries(isGrilled ? grilled : fried)) {
        for (const [index, portion] of [3, 5, 8].entries()) {
          const selections = {
            "tavo-chicken-portion": [`tavo-chicken-portion-${portion}-pcs`],
            [flavourGroup]: [`${flavourGroup}-${flavour}`],
          };
          const variant = getLaunchMenuPriceVariant("tavo-chicken", item.id, selections)!;
          expect(variant.groupId).toBe(`${item.id}-price-variant`);
          expect(variant.pricePence).toBe(prices[index]);
          expect(launchMenuConfiguredItemPrice("tavo-chicken", item.id, selections)).toBe(
            prices[index],
          );
          expect(
            launchMenuConfiguredItemPrice("tavo-chicken", item.id, {
              ...selections,
              "tavo-chicken-portion": ["tavo-chicken-portion-3-pcs", "tavo-chicken-portion-8-pcs"],
            }),
          ).toBeNull();
        }
      }
      expect(launchMenuConfiguredItemPrice("tavo-chicken", item.id, {})).toBeNull();
      expect(item.priceVariants).toHaveLength(12);
    }
    expect(launchMenuConfiguredItemPrice("souvano", "souvano-lamb-chops-lamb-chops", {})).toBe(999);
    expect(launchMenuConfiguredItemPrice("unknown", "unknown", {})).toBeNull();
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
    for (const id of ["fried-chicken-wings", "fried-chicken-tenders"]) {
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

  it("includes one free side with all three Souvano mains and retains mandatory Doner flavour", () => {
    const souvano = brand("souvano");
    const flavours = group("souvano", "souvano-donner-flavour");
    expect(flavours.options.map((option) => option.label)).toEqual([
      "Plain",
      "Fiery Sweet Chilli",
      "Dynamite",
      "Korean BBQ",
    ]);
    expect(flavours.required).toBe(true);
    for (const item of souvano.sections.flatMap((section) => section.items)) {
      const side = group(
        "souvano",
        item.id.includes("heatwave") ? "souvano-heatwave-base" : "souvano-meal-side",
      );
      expect(item.optionGroupIds).toContain(side.id);
      expect(side.required).toBe(true);
      expect(side.when).toBeUndefined();
      expect(side.options.map((option) => option.label)).toEqual(["Fries", "Rice", "Naan"]);
      expect(side.options.every((option) => option.pricePence === 0)).toBe(true);
      expect(item.optionGroupIds).not.toContain("souvano-make-it-a-meal");
    }
    expect(souvano.sections.some((section) => section.id === "cans-drinks")).toBe(false);
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
      expect(kids?.items[0].optionGroupIds).toEqual([kidsUpgrades.id, `${id}-kids-included-drink`]);
    }
  });

  it("resolves source evidence, dependencies and browse targets without ID collisions", () => {
    const references = new Set([
      ...launchMenuSources.flatMap((source) => [
        source.id,
        ...source.regions.map((region) => source.id + "#" + region.id),
      ]),
      ...launchMenuPriceApproval.brandIds.map((id) => `${launchMenuPriceApproval.id}#${id}`),
    ]);
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
