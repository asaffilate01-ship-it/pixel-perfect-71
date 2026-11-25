import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { findOtherBrandMenuMatches, matchesLaunchMenuSearch, OTHER_BRAND_SEARCH_LIMIT } from "../src/lib/launch-menu-search";
import { getLaunchMenuBrand, type LaunchMenuBrand, type LaunchMenuItem } from "../src/lib/launch-menu-catalogue";

describe("MealDeck real-menu desktop/mobile search quality", () => {
  test("empty searches preserve all current available dishes", () => {
    expect(matchesLaunchMenuSearch("", ["Chicken Wings"])).toBe(true);
    expect(matchesLaunchMenuSearch("   ", ["Chicken Wings"])).toBe(true);
  });
  test("works across dish, section and option labels in any word order", () => {
    const fields = ["Crispy wings", "Fried chicken", "Choice of BBQ flavour", "Tavo Chicken"];
    expect(matchesLaunchMenuSearch("chicken wings", fields)).toBe(true);
    expect(matchesLaunchMenuSearch("wings chicken", fields)).toBe(true);
    expect(matchesLaunchMenuSearch("bbq crispy", fields)).toBe(true);
    expect(matchesLaunchMenuSearch("chicken milkcake", fields)).toBe(false);
  });
  test("folds common punctuation, apostrophes, hyphens and diacritics", () => {
    expect(matchesLaunchMenuSearch("load'd", ["Load’d Fries"])).toBe(true);
    expect(matchesLaunchMenuSearch("loadd fries", ["Load’d Fries"])).toBe(true);
    expect(matchesLaunchMenuSearch("cafe", ["Café Latte"])).toBe(true);
    expect(matchesLaunchMenuSearch("mac n cheese", ["Mac ’n’ Cheese"])).toBe(true);
  });
  test("tolerates one long-word typo without inventing results", () => {
    expect(matchesLaunchMenuSearch("chikcen wings", ["Chicken wings"])).toBe(true);
    expect(matchesLaunchMenuSearch("burgre", ["Smash burger"])).toBe(true);
    expect(matchesLaunchMenuSearch("chikcen wingz", ["Chicken wings"])).toBe(false);
    expect(matchesLaunchMenuSearch("chikcen fries", ["Chicken wings"])).toBe(false);
  });
  test("does not fuzz short ingredient and dietary words", () => {
    expect(matchesLaunchMenuSearch("ham", ["Jam cake"])).toBe(false);
    expect(matchesLaunchMenuSearch("soy", ["Joy Juice"])).toBe(false);
    expect(matchesLaunchMenuSearch("nuts", ["Nut-free category"])).toBe(false);
    expect(matchesLaunchMenuSearch("milk", ["Milk cake"])).toBe(true);
  });
  test("handles pasted and invalid searches predictably", () => {
    expect(matchesLaunchMenuSearch("a".repeat(121), ["a".repeat(121)])).toBe(false);
    expect(matchesLaunchMenuSearch("one two three four five six seven eight nine", ["one two three four five six seven eight nine"])).toBe(false);
    expect(matchesLaunchMenuSearch("...", ["Chicken wings"])).toBe(false);
    expect(matchesLaunchMenuSearch("wings", [])).toBe(false);
  });
  test("the actual ordering screen uses the shared helper without changing quote authority", () => {
    const source = readFileSync(
      new URL("../src/components/menus/launch-menu-browser.tsx", import.meta.url), "utf8",
    );
    expect(source).toContain('findOtherBrandMenuMatches, matchesLaunchMenuSearch');
    expect(source).toContain("matchesLaunchMenuSearch(query, [");
    expect(source).toContain(".filter((item) => item.available !== false)");
    expect(source).toContain("!query ||");
    expect(source).toContain("option.available !== false");
    expect(source).toContain("findOtherBrandMenuMatches(query, catalogue, currentBrandId)");
    expect(source).toContain("publicMenu.ready && currentBrandId");
    expect(source).toContain("discoveryEntries.map((entry)");
    expect(source).toContain("disabled={!publicMenu.ready || entry.item.available === false}");
  });
});


describe("Cross-brand search over verified live items", () => {
  const item = (id: string, overrides: Partial<LaunchMenuItem> = {}): LaunchMenuItem => ({
    id, name: "Crispy chicken", pricePence: 599, available: true,
    optionGroupIds: [], availableOptionIds: [], sourceRefs: [], ...overrides,
  });
  const menu = (id: LaunchMenuBrand["id"], items: LaunchMenuItem[]): LaunchMenuBrand => ({
    ...getLaunchMenuBrand(id)!,
    sections: [{ id: "search", title: "Mains", items, sourceRefs: [] }],
    optionGroups: [{
      id: "flavours", label: "Flavour", kind: "single", required: true,
      sourceRefs: [], options: [
        { id: "bbq", label: "Korean BBQ", pricePence: 0, available: true, sourceRefs: [] },
        { id: "unavailable", label: "Dynamite", pricePence: 0, available: false, sourceRefs: [] },
      ],
    }],
  });
  test("excludes the current brand, unconfirmed stock, invalid prices and unavailable variants", () => {
    const catalogue = [
      menu("skorch-burgers", [item("same-brand")]),
      menu("tavo-chicken", [
        item("live"),
        item("sold-out", { available: false }),
        (({ available: _available, ...rest }) => rest)(item("unverified")),
        item("no-price", { pricePence: null }),
        item("negative", { pricePence: -1 }),
        item("fraction", { pricePence: 99.5 }),
      ]),
    ];
    expect(findOtherBrandMenuMatches("chikcen", catalogue, "skorch-burgers").map((entry) => entry.item.id)).toEqual(["live"]);
    expect(findOtherBrandMenuMatches("", catalogue, "skorch-burgers")).toEqual([]);
    expect(findOtherBrandMenuMatches("x".repeat(121), catalogue, "skorch-burgers")).toEqual([]);
  });
  test("matches only option labels available on the specific item", () => {
    const catalogue = [menu("tavo-chicken", [
      item("has-bbq", { optionGroupIds: ["flavours"], availableOptionIds: ["bbq"] }),
      item("other", { optionGroupIds: ["flavours"], availableOptionIds: [] }),
      item("sold-out-option", { optionGroupIds: ["flavours"], availableOptionIds: ["unavailable"] }),
    ])];
    expect(findOtherBrandMenuMatches("korean bbq", catalogue, "skorch-burgers").map((entry) => entry.item.id)).toEqual(["has-bbq"]);
    expect(findOtherBrandMenuMatches("dynamite", catalogue, "skorch-burgers")).toEqual([]);
  });
  test("preserves stable catalogue ordering and limits result cards", () => {
    const catalogue = [menu("tavo-chicken", Array.from({ length: 20 }, (_, i) => item("dish-" + i)))];
    const matches = findOtherBrandMenuMatches("chicken", catalogue, "skorch-burgers");
    expect(matches).toHaveLength(OTHER_BRAND_SEARCH_LIMIT);
    expect(matches[0]?.item.id).toBe("dish-0");
    expect(matches[11]?.item.id).toBe("dish-11");
  });
});
