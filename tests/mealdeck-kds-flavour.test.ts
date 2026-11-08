import { describe, expect, test } from "bun:test";
import {
  kdsFlavourHighlight,
  kdsTavoChickenPreparation,
  kdsTavoFlavourNeedsReview,
} from "../src/lib/mealdeck-kds-flavour";

describe("KDS flavour prominence", () => {
  test("emphasises a labelled wing flavour without losing its choice", () => {
    expect(
      kdsFlavourHighlight("Dynamite", {
        name: "Dynamite",
        group_name: "Flavour",
        price_delta_pence: 0,
        quantity_per_parent: 1,
      }),
    ).toEqual({ label: "FLAVOUR", value: "DYNAMITE" });
  });

  test("keeps the paid portion on wing variants", () => {
    expect(
      kdsFlavourHighlight("Korean BBQ · 5 pcs", {
        name: "Korean BBQ · 5 pcs",
        group_name: "Portion & flavour",
        price_delta_pence: 0,
        quantity_per_parent: 1,
        kind: "variant",
      }),
    ).toEqual({ label: "FLAVOUR & PORTION", value: "KOREAN BBQ · 5 PCS" });
  });

  test("shows burger dipping flavour and legacy labelled choices", () => {
    expect(
      kdsFlavourHighlight("Fiery Sweet Chilli", {
        name: "Fiery Sweet Chilli",
        group_name: "Dip Your Burger",
        price_delta_pence: 150,
        quantity_per_parent: 1,
      }),
    ).toEqual({ label: "BURGER DIP", value: "FIERY SWEET CHILLI" });
    expect(kdsFlavourHighlight("Wing flavour: Spicy Honey BBQ")).toEqual({
      label: "FLAVOUR",
      value: "SPICY HONEY BBQ",
    });
  });


  test("identifies Tavo's exact purchased fried and grilled fillet preparations", () => {
    expect(kdsTavoChickenPreparation({ brand_name: "Tavo Chicken", item_name: "Cruncher" })).toBe(
      "1 buttermilk fried chicken fillet in bun",
    );
    expect(kdsTavoChickenPreparation({ brand_name: "Tavo Chicken", item_name: "Twin Crunch" })).toBe(
      "2 buttermilk fried chicken fillets in bun",
    );
    expect(kdsTavoChickenPreparation({ brand_name: "Tavo Chicken", item_name: "Flame" })).toBe(
      "1 spicy grilled chicken fillet in bun",
    );
    expect(kdsTavoChickenPreparation({ brand_name: "Tavo Chicken", item_name: "Big Flame" })).toBe(
      "2 spicy grilled chicken fillets in bun",
    );
    expect(kdsTavoChickenPreparation({ brand_name: "Another brand", item_name: "Flame" })).toBeNull();
    expect(kdsTavoChickenPreparation({ brand_name: "Tavo Chicken", item_name: "Mystery" })).toBeNull();
  });

  test("makes Tavo wing/tender flavours verifiable, with portion and grilled status", () => {
    expect(
      kdsFlavourHighlight("Spicy Honey BBQ", {
        name: "Spicy Honey BBQ",
        group_name: "Tavo Chicken · Flavour (grilled wings)",
        price_delta_pence: 0,
        quantity_per_parent: 1,
        kind: "source",
      }),
    ).toEqual({ label: "FLAVOUR", value: "SPICY HONEY BBQ" });
    for (const dish of ["Fried Chicken Wings", "Fried Chicken Tenders", "Grilled Chicken Wings"]) {
      expect(
        kdsTavoFlavourNeedsReview({
          brand_name: "Tavo Chicken",
          item_name: dish,
          modifiers: ["Korean BBQ · 5 pcs"],
        }),
      ).toBe(false);
    }
    expect(
      kdsTavoFlavourNeedsReview({
        brand_name: "Tavo Chicken",
        item_name: "Grilled Chicken Wings",
        modifiers: ["Spicy Honey BBQ"],
        modifier_details: [
          {
            name: "Spicy Honey BBQ",
            group_name: "Tavo Chicken · Flavour (grilled wings)",
            price_delta_pence: 0,
            quantity_per_parent: 1,
          },
        ],
      }),
    ).toBe(false);
  });

  test("flags missing or ambiguous saved Tavo flavours rather than guessing from a sauce", () => {
    expect(
      kdsTavoFlavourNeedsReview({
        brand_name: "Tavo Chicken",
        item_name: "Fried Chicken Wings",
        modifiers: [],
      }),
    ).toBe(true);
    expect(
      kdsTavoFlavourNeedsReview({
        brand_name: "Tavo Chicken",
        item_name: "Fried Chicken Tenders",
        modifiers: ["Dynamite"],
        modifier_details: [
          {
            name: "Dynamite",
            group_name: "Sauce",
            price_delta_pence: 0,
            quantity_per_parent: 1,
          },
        ],
      }),
    ).toBe(true);
    expect(
      kdsTavoFlavourNeedsReview({
        brand_name: "Tavo Chicken",
        item_name: "Flame",
        modifiers: [],
      }),
    ).toBe(false);
  });

  test("does not mislabel general sauces, toppings or notes as a wing flavour", () => {
    expect(kdsFlavourHighlight("No gherkin")).toBeNull();
    expect(
      kdsFlavourHighlight("Extra cheese", {
        name: "Extra cheese",
        group_name: "Burger Add Ons",
        price_delta_pence: 50,
        quantity_per_parent: 1,
      }),
    ).toBeNull();
  });
});
