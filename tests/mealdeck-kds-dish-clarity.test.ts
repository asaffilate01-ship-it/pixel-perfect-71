import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { launchMenuBrands } from "../src/lib/launch-menu-catalogue";
import {
  kdsModifierChoiceText,
  kdsModifierGroupLabel,
  kdsSouvanoMainState,
} from "../src/lib/mealdeck-kds-dish-clarity";

const souvano = { brand_name: "Souvano" };

function main(item_name: string) {
  return { ...souvano, item_name, parent_checkout_line_id: null };
}

describe("Souvano kitchen clarity", () => {
  test("each ordered main is a separate product, not a shared side group", () => {
    const brand = launchMenuBrands.find((entry) => entry.id === "souvano");
    if (!brand) throw new Error("Souvano missing from the menu");
    const mains = brand.sections
      .filter((section) => ["stir-fry-donner", "heatwave", "lamb-chops"].includes(section.id))
      .flatMap((section) => section.items);
    expect(mains.map((item) => item.name)).toEqual(["Stir-Fry Doner", "Heatwave", "Lamb Chops"]);
    expect(new Set(mains.map((item) => item.id)).size).toBe(3);
    for (const item of mains) {
      expect(kdsSouvanoMainState(main(item.name))).toBe("main");
    }
    expect(mains[0].optionGroupIds).toEqual(["souvano-donner-flavour", "souvano-meal-side"]);
    expect(mains[2].optionGroupIds).toEqual(["souvano-meal-side"]);
  });

  test("old shared side label never suggests the main could be either dish", () => {
    const old = "Souvano · Included side (Doner / Lamb Chops)";
    for (const dish of ["Lamb Chops", "Stir-Fry Doner"]) {
      expect(kdsModifierGroupLabel(main(dish), old)).toBe("Included side");
    }
    expect(kdsModifierGroupLabel(souvano, "Souvano · Included side")).toBe("Included side");
    expect(kdsModifierGroupLabel(souvano, "Souvano · Included side (Heatwave)")).toBe(
      "Included side",
    );
  });

  test("the side choice itself remains exactly what the customer ordered", () => {
    const legacy = "Souvano · Included side (Doner / Lamb Chops): ";
    for (const side of ["Fries", "Rice", "Naan"]) {
      expect(kdsModifierChoiceText(souvano, legacy + side)).toBe("Included side: " + side);
      expect(kdsModifierChoiceText(souvano, side)).toBe(side);
    }
    expect(kdsModifierGroupLabel({ brand_name: "Skorch" }, legacy)).toBe(legacy.trim());
    expect(kdsModifierChoiceText({ brand_name: "Skorch" }, legacy + "Fries")).toBe(
      legacy + "Fries",
    );
  });

  test("does not invent an entree for an ambiguous legacy purchase", () => {
    expect(kdsSouvanoMainState(main("Lamb Chops / Stir Fry Doner"))).toBe("verify-main");
    expect(kdsSouvanoMainState(main("Stir-Fry Doner / Lamb Chops"))).toBe("verify-main");
    expect(kdsSouvanoMainState(main("Biscoff Milkcake"))).toBeNull();
    expect(
      kdsSouvanoMainState({
        ...main("Lamb Chops"),
        parent_checkout_line_id: "attached-to-main",
      }),
    ).toBeNull();
  });

  test("new importer manifest names the shared side without listing mains", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("../deploy/mealdeck/catalogue/launch-catalogue.json", import.meta.url),
        "utf8",
      ),
    ) as { modifierGroups: { id: string; name: string }[] };
    const group = manifest.modifierGroups.find((entry) => entry.id === "souvano-meal-side");
    const heatwaveGroup = manifest.modifierGroups.find(
      (entry) => entry.id === "souvano-heatwave-base",
    );
    expect(group?.name).toBe("Souvano · Included side");
    expect(heatwaveGroup?.name).toBe("Souvano · Included side (Heatwave)");
    expect(new Set(manifest.modifierGroups.map((entry) => entry.name)).size).toBe(
      manifest.modifierGroups.length,
    );
  });
});
