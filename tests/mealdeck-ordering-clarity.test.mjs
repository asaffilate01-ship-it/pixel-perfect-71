// Dependency-free regression tests run the real TypeScript modules, not copies.
// Node 22: node --experimental-strip-types --test tests/mealdeck-ordering-clarity.test.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kdsFlavourHighlight, kdsTavoChickenPreparation, kdsTavoFlavourNeedsReview } from "../src/lib/mealdeck-kds-flavour.ts";
import {
  kdsModifierChoiceText,
  kdsModifierGroupLabel,
  kdsSouvanoMainState,
} from "../src/lib/mealdeck-kds-dish-clarity.ts";
import { launchMenuItemDescriptor } from "../src/lib/launch-menu-item-descriptor.ts";

const detail = (group_name, overrides = {}) => ({
  name: "Dynamite", group_name, price_delta_pence: 51, quantity_per_parent: 1,
  kind: "source", ...overrides,
});
const souvano = { brand_name: "Souvano" };
const main = (item_name, overrides = {}) => ({ ...souvano, item_name, ...overrides });
const descriptor = (brandId, sectionId, description, sectionDescription) =>
  launchMenuItemDescriptor(
    { id: brandId },
    { id: sectionId, title: "Published section", description: sectionDescription },
    { description },
  );

describe("KDS highlights the actual choice, not a similar sauce name", () => {
  for (const group of ["Sauces", "Burger Add Ons", "Included side", "Extras", "Tavo Chicken · Sauces"]) {
    it(`does not relabel ${group} as a cooking flavour`, () => {
      assert.equal(kdsFlavourHighlight("Dynamite", detail(group)), null);
      assert.equal(kdsFlavourHighlight("Flavour: Korean BBQ", detail(group)), null);
    });
  }
  for (const group of ["Flavour", "Flavor", "Tavo Chicken · Flavour", "Flavour (grilled wings)"]) {
    it(`highlights the chosen flavour for ${group}`, () => {
      assert.deepEqual(kdsFlavourHighlight("Fiery Sweet Chilli", detail(group)), {
        label: "FLAVOUR", value: "FIERY SWEET CHILLI",
      });
    });
  }
  it("keeps flavour and paid portion together without internal price arithmetic", () => {
    assert.deepEqual(kdsFlavourHighlight("Korean BBQ · 5 pcs", detail(
      "Tavo Chicken · Fried Chicken Wings · Portion and flavour price", { kind: "variant" },
    )), { label: "FLAVOUR & PORTION", value: "KOREAN BBQ · 5 PCS" });
  });
  it("does not infer flavour solely from a portion variant", () => {
    assert.equal(kdsFlavourHighlight("5 pcs", detail("Portion", { kind: "variant" })), null);
  });
  it("keeps burger dipping distinct from wing flavour", () => {
    assert.deepEqual(kdsFlavourHighlight("Dynamite", detail("Tavo Chicken · Dip Your Burger")), {
      label: "BURGER DIP", value: "DYNAMITE",
    });
  });
  it("does not relabel a cross-brand addition as the parent's flavour", () => {
    assert.equal(kdsFlavourHighlight("Dynamite", detail("Flavour", { kind: "cross" })), null);
  });
  it("preserves multiple selected portions per parent", () => {
    assert.deepEqual(kdsFlavourHighlight("Dynamite", detail("Flavour", { quantity_per_parent: 2 })), {
      label: "FLAVOUR", value: "DYNAMITE · 2× EACH",
    });
  });
  it("supports explicit old labels and strips only their redundant prefix", () => {
    assert.deepEqual(kdsFlavourHighlight("Wing flavour: Spicy Honey BBQ"), {
      label: "FLAVOUR", value: "SPICY HONEY BBQ",
    });
    assert.deepEqual(kdsFlavourHighlight("Tavo Chicken · Flavour: Dynamite", detail("Flavour")), {
      label: "FLAVOUR", value: "DYNAMITE",
    });
    assert.deepEqual(kdsFlavourHighlight("Korean BBQ · 5 pcs"), {
      label: "FLAVOUR & PORTION", value: "KOREAN BBQ · 5 PCS",
    });
  });
  it("does not guess from bare sauces, absent choices or notes", () => {
    for (const value of ["Dynamite", "Korean BBQ", "Plain", "No gherkin", "Flavour: ", ""]) {
      assert.equal(kdsFlavourHighlight(value), null);
    }
  });
  it("does not mutate the purchased modifier metadata", () => {
    const frozen = Object.freeze(detail("Flavour"));
    const original = JSON.stringify(frozen);
    kdsFlavourHighlight("Dynamite", frozen);
    assert.equal(JSON.stringify(frozen), original);
  });
});

describe("Tavo KDS identity and flavour safety", () => {
  it("shows exact fillet construction for the purchased dish, not a choice modifier", () => {
    assert.equal(kdsTavoChickenPreparation({brand_name: "Tavo Chicken", item_name: "Cruncher"}), "1 buttermilk fried chicken fillet in bun");
    assert.equal(kdsTavoChickenPreparation({brand_name: "Tavo Chicken", item_name: "Big Flame"}), "2 spicy grilled chicken fillets in bun");
  });
  it("recognises explicit wing flavour and portion without mistaking a sauce for flavour", () => {
    assert.equal(kdsTavoFlavourNeedsReview({
      brand_name: "Tavo Chicken", item_name: "Fried Chicken Wings",
      modifiers: ["Dynamite · 8 pcs"],
    }), false);
    assert.equal(kdsTavoFlavourNeedsReview({
      brand_name: "Tavo Chicken", item_name: "Grilled Chicken Wings",
      modifiers: ["Spicy Honey BBQ"],
      modifier_details: [detail("Tavo Chicken · Flavour (grilled wings)")],
    }), false);
    assert.equal(kdsTavoFlavourNeedsReview({
      brand_name: "Tavo Chicken", item_name: "Fried Chicken Tenders",
      modifiers: ["Dynamite"],
      modifier_details: [detail("Sauces")],
    }), true);
    assert.equal(kdsTavoFlavourNeedsReview({
      brand_name: "Tavo Chicken", item_name: "Fried Chicken Tenders",
      modifiers: [],
    }), true);
  });
});

describe("Souvano never guesses which main was ordered", () => {
  for (const name of ["Lamb Chops", "Heatwave", "Stir-Fry Doner", "Stir Fry Donner", "Stir‑Fry Doner"]) {
    it(`recognises the separate frozen main ${name}`, () => {
      assert.equal(kdsSouvanoMainState(main(name)), "main");
    });
  }
  for (const name of [
    "Lamb Chops / Stir Fry Doner", "Stir-Fry Donner / Lamb Chops",
    "Lamb Chops or Doner", "Doner & Lamb Chops",
  ]) {
    it(`flags rather than silently resolves ${name}`, () => {
      assert.equal(kdsSouvanoMainState(main(name)), "verify-main");
    });
  }
  it("leaves other brands, dessert and attached extras alone", () => {
    assert.equal(kdsSouvanoMainState(main("Biscoff Milkcake")), null);
    assert.equal(kdsSouvanoMainState(main("Lamb Chops", { brand_name: "Skorch" })), null);
    assert.equal(kdsSouvanoMainState(main("Lamb Chops", { parent_checkout_line_id: "parent" })), null);
  });
  for (const suffix of ["Doner / Lamb Chops", "Stir-Fry Doner / Lamb Chops", "Lamb Chops / Stir‑Fry Donner", "Heatwave"]) {
    it(`normalises only the shared side caption (${suffix})`, () => {
      const label = `Souvano · Included side (${suffix})`;
      assert.equal(kdsModifierGroupLabel(souvano, label), "Included side");
      for (const choice of ["Fries", "Rice", "Naan", "Rice: keep separate", "Fries / Rice"]) {
        assert.equal(kdsModifierChoiceText(souvano, `${label}: ${choice}`), `Included side: ${choice}`);
      }
      assert.equal(kdsModifierChoiceText({ brand_name: "Skorch" }, `${label}: Rice`), `${label}: Rice`);
    });
  }
  it("preserves unknown groups, empty values and already-selected sides", () => {
    assert.equal(kdsModifierGroupLabel(souvano, "Souvano · Included side (Rice / Fries)"),
      "Souvano · Included side (Rice / Fries)");
    for (const value of ["Rice", "Do not add rice", "Included side:", ""]) {
      assert.equal(kdsModifierChoiceText(souvano, value), value);
    }
    assert.equal(kdsModifierGroupLabel(souvano, undefined), null);
  });
});

describe("compact customer descriptors use published facts", () => {
  for (const count of [1, 2, 3, 4]) {
    it(`shows ${count} actual smash patties`, () => {
      assert.equal(descriptor("skorch-burgers", "beef-smash-deck", `${count} ${count === 1 ? "patty" : "patties"}.`),
        `${count} beef smash ${count === 1 ? "patty" : "patties"} · burger bun`);
    });
  }
  it("does not promise optional, conflicting or missing patty counts", () => {
    for (const description of [undefined, "A custom build", "1 patty or 2 patties", "Add 2 patties", "2 patties plus 1 patty"]) {
      assert.equal(descriptor("skorch-burgers", "beef-smash-deck", description), "Beef smash burger · bun");
    }
  });
  it("keeps Tavo's exact cooked fillet count and rejects an optional upgrade", () => {
    assert.equal(descriptor("tavo-chicken", "burgers", "Buttermilk fried chicken fillet"), "1 buttermilk fried chicken fillet in bun");
    assert.equal(descriptor("tavo-chicken", "burgers", "2 buttermilk fried chicken fillets"), "2 buttermilk fried chicken fillets in bun");
    assert.equal(descriptor("tavo-chicken", "burgers", "Spicy grilled chicken fillet"), "1 spicy grilled chicken fillet in bun");
    assert.equal(descriptor("tavo-chicken", "burgers", "2 spicy grilled chicken fillets"), "2 spicy grilled chicken fillets in bun");
    assert.equal(descriptor("tavo-chicken", "burgers", "3 spicy grilled chicken fillets"), "3 spicy grilled chicken fillets in bun");
    assert.equal(descriptor("tavo-chicken", "burgers", "Add 2 chicken fillets"), "Chicken fillet burger in bun");
  });
  it("does not repeat the importer's section paragraph in a Load'd badge", () => {
    const shared = "All with cheese, Algerian sauce, and spring onions.";
    assert.equal(descriptor("loadd", "loaded-fries", `${shared}\n\nGrilled chicken`, shared), "Grilled chicken · loaded fries");
    assert.equal(descriptor("loadd", "loaded-fries", `${shared}\r\n\r\nFried chicken`, shared), "Fried chicken · loaded fries");
    assert.equal(descriptor("loadd", "loaded-fries", shared, shared), "Loaded fries");
  });
  it("bounds badges without discarding the original full description", () => {
    const item = Object.freeze({ description: "A very long current kitchen description ".repeat(8) });
    const before = item.description;
    assert.equal(launchMenuItemDescriptor({ id: "loadd" }, { id: "loaded-fries", title: "Loaded Fries" }, item), "Loaded fries");
    assert.equal(item.description, before);
    assert.equal(descriptor("loadd", "loaded-fries", "Fried chicken. Contains cheese."), "Loaded fries");
  });
  it("identifies the Full House topping only when explicitly stated", () => {
    assert.equal(descriptor("loadd", "full-house", "Grilled chicken, loaded fries and mac ’n cheese."),
      "Grilled chicken · loaded fries + mac ’n cheese");
    assert.equal(descriptor("loadd", "full-house", "A new chef's combination"), "Loaded fries + mac ’n cheese");
  });
  it("retains other published types without inventing a recipe", () => {
    assert.equal(descriptor("loadd", "loaded-mac-cheese", ""), "Loaded mac ’n cheese");
    assert.equal(descriptor("moktl", "mocktail-lounge", ""), "");
    assert.equal(descriptor("souvano", "lamb-chops", ""), "Published section");
  });
});


describe("preserve the publishing branch's approved product wording", () => {
  const lines = {
    "loadd-loaded-fries-king-of-hearts": "Fried Chicken Loaded Fries",
    "loadd-loaded-fries-queen-of-hearts": "Grilled Chicken Loaded Fries",
    "loadd-loaded-fries-jack-of-diamonds": "Chicken Shawarma Loaded Fries",
    "loadd-loaded-fries-king-of-spades": "Smashed Beef Loaded Fries",
    "loadd-loaded-mac-cheese-ace-mac": "Plain Mac ’n Cheese",
    "loadd-loaded-mac-cheese-jacks-mac": "Fried Chicken Mac ’n Cheese",
    "loadd-loaded-mac-cheese-diamond-melt": "Chicken Shawarma Mac ’n Cheese",
    "loadd-loaded-mac-cheese-spade-stack": "Smash Beef Mac ’n Cheese",
    "loadd-loaded-mac-cheese-kings-mac": "Grilled Chicken Mac ’n Cheese",
    "loadd-full-house-king-of-hearts": "Fried Chicken Loaded Fries & Mac ’n Cheese",
    "loadd-full-house-queen-of-hearts": "Grilled Chicken Loaded Fries & Mac ’n Cheese",
    "loadd-full-house-jack-of-diamonds": "Chicken Shawarma Loaded Fries & Mac ’n Cheese",
    "loadd-full-house-king-of-spades": "Smashed Beef Loaded Fries & Mac ’n Cheese",
    "souvano-heatwave-heatwave": "Chopped and Shredded Chicken",
  };
  for (const [id, expected] of Object.entries(lines)) {
    it(`retains the stable product line for ${id}`, () => {
      const brandId = id.startsWith("souvano-") ? "souvano" : "loadd";
      const sectionId = id.includes("loaded-fries") ? "loaded-fries"
        : id.includes("loaded-mac-cheese") ? "loaded-mac-cheese"
          : id.includes("full-house") ? "full-house" : "heatwave";
      assert.equal(launchMenuItemDescriptor(
        { id: brandId }, { id: sectionId, title: "Published section" },
        { id, description: "Current full description remains available separately" },
      ), expected);
    });
  }
});
