import { describe, expect, test } from "bun:test";
import {
  FRANCHISE_BRAND_IDS,
  franchiseSearchForSelection,
  franchiseSelectionFromSearch,
  parseFranchiseSearch,
} from "../src/lib/franchise-selection";

describe("franchise selection links", () => {
  test("brand advert attribution survives selection, detail links and full-package comparison", () => {
    const tagged = parseFranchiseSearch({
      brands: "skorch",
      utm_source: "facebook",
      utm_campaign: "skorch-launch",
      territoryCode: "not-approved",
    });
    const combined = franchiseSearchForSelection("selected_brands", ["skorch", "loadd"], tagged);
    expect(combined).toEqual({
      package: "brands",
      brands: "loadd,skorch",
      utm_source: "facebook",
      utm_campaign: "skorch-launch",
    });
    expect(franchiseSearchForSelection("full_mealdeck", [], combined)).toEqual({
      package: "full",
      utm_source: "facebook",
      utm_campaign: "skorch-launch",
    });
  });

  test("campaign attribution only retains bounded single-line strings", () => {
    expect(
      parseFranchiseSearch({
        utm_source: ["facebook"],
        utm_campaign: "bad\nvalue",
        utm_content: "x".repeat(250),
        utm_medium: " social ",
        email: "private@example.test",
      }),
    ).toEqual({ utm_medium: "social", utm_content: "x".repeat(200) });
  });

  test("the unfiltered franchise page defaults to the full MealDeck enquiry", () => {
    expect(parseFranchiseSearch({})).toEqual({});
    expect(franchiseSelectionFromSearch({})).toEqual({
      franchisePackage: "full_mealdeck",
      selectedBrandIds: [],
    });
  });

  test("brand IDs alone open a custom package in portfolio order", () => {
    expect(parseFranchiseSearch({ brands: "skorch,loadd,moktl" })).toEqual({
      package: "brands",
      brands: "loadd,moktl,skorch",
    });
    expect(franchiseSelectionFromSearch({ brands: "skorch,loadd,moktl" })).toEqual({
      franchisePackage: "selected_brands",
      selectedBrandIds: ["loadd", "moktl", "skorch"],
    });
  });

  test("an explicit full-package link discards residual individual choices", () => {
    const input = { package: "full", brands: "skorch,loadd" };
    expect(parseFranchiseSearch(input)).toEqual({ package: "full" });
    expect(franchiseSelectionFromSearch(input)).toEqual({
      franchisePackage: "full_mealdeck",
      selectedBrandIds: [],
    });
    expect(franchiseSearchForSelection("full_mealdeck", ["skorch"])).toEqual({ package: "full" });
  });

  test("unrecognised, duplicated and unrelated query values cannot enter a selection", () => {
    const input = {
      package: "brands",
      brands: "skorch,cafe1,loadd,skorch,FYRRA, moktl ,unknown-brand,",
      territoryCode: "MD-UNVERIFIED",
      offerVersion: "forged",
    };
    expect(parseFranchiseSearch(input)).toEqual({
      package: "brands",
      brands: "loadd,moktl,skorch",
    });
    expect(franchiseSelectionFromSearch(input).selectedBrandIds).toEqual([
      "loadd",
      "moktl",
      "skorch",
    ]);
  });

  test("an empty or entirely invalid custom link still opens the brand chooser", () => {
    for (const input of [{ package: "brands" }, { brands: "" }, { brands: "cafe1,fyrra" }]) {
      expect(parseFranchiseSearch(input)).toEqual({ package: "brands" });
      expect(franchiseSelectionFromSearch(input)).toEqual({
        franchisePackage: "selected_brands",
        selectedBrandIds: [],
      });
    }
    expect(franchiseSearchForSelection("selected_brands", [])).toEqual({ package: "brands" });
  });

  test("malformed query shapes are ignored without converting values into brand IDs", () => {
    for (const input of [
      { package: null, brands: null },
      { package: ["full"], brands: ["skorch"] },
      { package: "unexpected", brands: 1 },
      { package: { value: "brands" }, brands: { value: "skorch" } },
    ]) {
      expect(parseFranchiseSearch(input)).toEqual({});
    }
    expect(parseFranchiseSearch({ package: "brands", brands: ["skorch"] })).toEqual({
      package: "brands",
    });
  });

  test("a long repeated selection is bounded to the fifteen approved brands", () => {
    const brands = [...FRANCHISE_BRAND_IDS].reverse().join(",");
    const search = parseFranchiseSearch({ brands: Array(50).fill(brands).join(",") });
    expect(search).toEqual({ package: "brands", brands: FRANCHISE_BRAND_IDS.join(",") });
    expect(franchiseSelectionFromSearch(search).selectedBrandIds).toHaveLength(15);
  });

  test("shareable links round-trip one, two, three and every individual brand", () => {
    for (const selectedBrandIds of [
      ["skorch"] as const,
      ["loadd", "skorch"] as const,
      ["loadd", "moktl", "skorch"] as const,
      FRANCHISE_BRAND_IDS,
    ]) {
      const search = franchiseSearchForSelection("selected_brands", selectedBrandIds);
      expect(franchiseSelectionFromSearch(search)).toEqual({
        franchisePackage: "selected_brands",
        selectedBrandIds: [...selectedBrandIds],
      });
      expect(parseFranchiseSearch(search)).toEqual(search);
    }
  });
});
