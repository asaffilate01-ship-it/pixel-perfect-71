import { describe, expect, test } from "bun:test";
import type { LaunchMenuBrand } from "../src/lib/launch-menu-catalogue";
import { resolveAgentMenuSuggestions } from "../src/lib/mealdeck-agent-menu-grounding";

const now = Date.parse("2026-11-12T12:00:00.000Z");
const checkedAt = new Date(now - 10_000).toISOString();

function menu(overrides: Record<string, Record<string, unknown>> = {}): LaunchMenuBrand[] {
  return [{
    id: "tavo-chicken",
    name: "Tavo Chicken",
    sections: [{
      id: "wings",
      title: "Chicken Wings",
      items: [
        { id: "wings-6", name: "Six Wings", available: true, pricePence: 649 },
        { id: "wings-8", name: "Eight Wings", available: false, pricePence: 749 },
        { id: "tenders", name: "Tenders", available: true, pricePence: 599 },
        { id: "zero", name: "Water", available: true, pricePence: 0 },
      ].map((item) => ({ ...item, ...(overrides[item.id] ?? {}) })),
    }],
  }] as unknown as LaunchMenuBrand[];
}

describe("MealDeck agent menu grounding — no live model", () => {
  test("accepts only currently verified, available items from the actual menu", () => {
    expect(resolveAgentMenuSuggestions(["wings-6", "wings-8", "missing", "tenders"], menu(), checkedAt, now))
      .toEqual([
        { itemId: "wings-6", brandId: "tavo-chicken", brandName: "Tavo Chicken", sectionName: "Chicken Wings", name: "Six Wings" },
        { itemId: "tenders", brandId: "tavo-chicken", brandName: "Tavo Chicken", sectionName: "Chicken Wings", name: "Tenders" },
      ]);
  });
  test("never passes model-invented prices, allergen assurances, promotions or prose", () => {
    const result = resolveAgentMenuSuggestions([
      { sku: "wings-6", pricePence: 1, allergenSafe: true, promotion: "FREE" },
      "wings-6", "zero",
    ], menu(), checkedAt, now);
    expect(result.map((item) => Object.keys(item))).toEqual([
      ["itemId", "brandId", "brandName", "sectionName", "name"],
      ["itemId", "brandId", "brandName", "sectionName", "name"],
    ]);
    expect(JSON.stringify(result)).not.toContain("allergen");
    expect(JSON.stringify(result)).not.toContain("pricePence");
    expect(result[1]?.name).toBe("Water");
  });
  test("ignores unknown, malicious and duplicate identifiers", () => {
    expect(resolveAgentMenuSuggestions([
      "wings-6", "wings-6", "<script>alert(1)</script>",
      "https://other.example/path", "__proto__", "fake", "tenders",
    ], menu(), checkedAt, now).map((item) => item.itemId)).toEqual(["wings-6", "tenders"]);
    expect(resolveAgentMenuSuggestions({ sku: "wings-6" }, menu(), checkedAt, now)).toEqual([]);
  });
  test("rejects stale, invalid or future-dated public-menu evidence", () => {
    for (const date of [null, "bad-date", new Date(now - 120_001).toISOString(), new Date(now + 10_001).toISOString()]) {
      expect(resolveAgentMenuSuggestions(["wings-6"], menu(), date, now)).toEqual([]);
    }
    expect(resolveAgentMenuSuggestions(["wings-6"], menu(), checkedAt, Number.NaN)).toEqual([]);
  });
  test("requires availability and price validation; rejects conflicting SKUs", () => {
    expect(resolveAgentMenuSuggestions(["wings-6"], menu({ "wings-6": { available: undefined } }), checkedAt, now)).toEqual([]);
    expect(resolveAgentMenuSuggestions(["wings-6"], menu({ "wings-6": { pricePence: null } }), checkedAt, now)).toEqual([]);
    const duplicates = menu();
    duplicates[0]!.sections[0]!.items.push({ ...duplicates[0]!.sections[0]!.items[0]! });
    expect(resolveAgentMenuSuggestions(["wings-6"], duplicates, checkedAt, now)).toEqual([]);
  });
  test("deduplicates and bounds model candidate responses", () => {
    expect(resolveAgentMenuSuggestions(["wings-6", "tenders", "zero", "wings-6"], menu(), checkedAt, now)).toHaveLength(3);
    expect(resolveAgentMenuSuggestions(Array(13).fill("wings-6"), menu(), checkedAt, now)).toEqual([]);
    expect(resolveAgentMenuSuggestions([], menu(), checkedAt, now)).toEqual([]);
  });
});
