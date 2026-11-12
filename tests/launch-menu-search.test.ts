import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { matchesLaunchMenuSearch } from "../src/lib/launch-menu-search";

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
    expect(source).toContain('import { matchesLaunchMenuSearch } from "@/lib/launch-menu-search";');
    expect(source).toContain("matchesLaunchMenuSearch(query, [");
    expect(source).toContain(".filter((item) => item.available !== false)");
    expect(source).toContain("!query ||");
  });
});
