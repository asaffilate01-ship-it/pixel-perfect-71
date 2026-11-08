import { describe, expect, test } from "bun:test";
import { kdsFlavourHighlight } from "../src/lib/mealdeck-kds-flavour";

describe("KDS flavour prominence", () => {
  test("emphasises a labelled wing flavour without losing its choice", () => {
    expect(kdsFlavourHighlight("Dynamite", {
      name: "Dynamite",
      group_name: "Flavour",
      price_delta_pence: 0,
      quantity_per_parent: 1,
    })).toEqual({ label: "FLAVOUR", value: "DYNAMITE" });
  });

  test("keeps the paid portion on wing variants", () => {
    expect(kdsFlavourHighlight("Korean BBQ · 5 pcs", {
      name: "Korean BBQ · 5 pcs",
      group_name: "Portion & flavour",
      price_delta_pence: 0,
      quantity_per_parent: 1,
      kind: "variant",
    })).toEqual({ label: "FLAVOUR & PORTION", value: "KOREAN BBQ · 5 PCS" });
  });

  test("shows burger dipping flavour and legacy labelled choices", () => {
    expect(kdsFlavourHighlight("Fiery Sweet Chilli", {
      name: "Fiery Sweet Chilli",
      group_name: "Dip Your Burger",
      price_delta_pence: 150,
      quantity_per_parent: 1,
    })).toEqual({ label: "BURGER DIP", value: "FIERY SWEET CHILLI" });
    expect(kdsFlavourHighlight("Wing flavour: Spicy Honey BBQ"))
      .toEqual({ label: "FLAVOUR", value: "SPICY HONEY BBQ" });
  });

  test("does not mislabel general sauces, toppings or notes as a wing flavour", () => {
    expect(kdsFlavourHighlight("No gherkin")).toBeNull();
    expect(kdsFlavourHighlight("Extra cheese", {
      name: "Extra cheese",
      group_name: "Burger Add Ons",
      price_delta_pence: 50,
      quantity_per_parent: 1,
    })).toBeNull();
  });
});
