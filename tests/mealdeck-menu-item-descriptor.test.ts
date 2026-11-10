import { describe, expect, test } from "bun:test";
import { launchMenuBrands } from "../src/lib/launch-menu-catalogue";
import { launchMenuItemDescriptor } from "../src/lib/launch-menu-item-descriptor";

function descriptor(brandId: string, sectionId: string, itemName: string) {
  const brand = launchMenuBrands.find((entry) => entry.id === brandId);
  const section = brand?.sections.find((entry) => entry.id === sectionId);
  const item = section?.items.find((entry) => entry.name === itemName);
  if (!brand || !section || !item) throw new Error("Missing reviewed menu fixture");
  return launchMenuItemDescriptor(brand, section, item);
}

describe("prominent customer menu explanations", () => {
  test("shows the actual number of smash patties in a burger bun", () => {
    expect(descriptor("skorch-burgers", "beef-smash-deck", "The Ace")).toBe(
      "1 beef smash patty · burger bun",
    );
    expect(descriptor("skorch-burgers", "beef-smash-deck", "Double Deal")).toBe(
      "2 beef smash patties · burger bun",
    );
    expect(descriptor("skorch-burgers", "beef-smash-deck", "Triple Stack")).toBe(
      "3 beef smash patties · burger bun",
    );
    expect(descriptor("skorch-burgers", "beef-smash-deck", "Four of a Kind")).toBe(
      "4 beef smash patties · burger bun",
    );
  });

  test("uses the renamed Load’d items as loaded fries, not burgers", () => {
    expect(descriptor("loadd", "loaded-fries", "Double Deck")).toBe("Grilled Chicken Loaded Fries");
    expect(descriptor("loadd", "full-house", "Double Deck")).toBe(
      "Grilled Chicken Loaded Fries & Mac ’n Cheese",
    );
  });

  test("The Blackjack subtitle shows smash beef AND fried chicken, not its reused Double Deck SKU", () => {
    const brand = { id: "loadd" } as const;
    const section = {
      id: "full-house",
      title: "The Full House",
      description:
        "The best of both worlds. Loaded fries and mac ’n cheese together in one box, topped with cheese, Algerian sauce, spring onions and crispy fried onions.",
    };
    // The published The Blackjack reuses the older Double Deck catalogue SKU,
    // so a SKU-only label incorrectly claims it is grilled chicken.
    const item = {
      id: "loadd-full-house-queen-of-hearts",
      name: "The Blackjack",
      description:
        section.description +
        "\\n\\nSmash Beef & Fried Chicken, loaded fries and mac ’n cheese.",
    };
    expect(launchMenuItemDescriptor(brand, section, item)).toBe(
      "Smash beef and fried chicken · loaded fries + mac ’n cheese",
    );
    // Do not affect the earlier menu entry when it is still named Double Deck.
    expect(descriptor("loadd", "full-house", "Double Deck")).toBe(
      "Grilled Chicken Loaded Fries & Mac ’n Cheese",
    );
    // When the item recipe no longer confirms both proteins, never assert them.
    expect(
      launchMenuItemDescriptor(brand, section, {
        ...item,
        description: section.description + "\\n\\nRecipe under review.",
      }),
    ).toBe("Loaded fries + mac ’n cheese");
  });

  test("shows actual Tavo fillet counts and cooking methods", () => {
    expect(descriptor("tavo-chicken", "burgers", "Cruncher")).toBe(
      "1 buttermilk fried chicken fillet in bun",
    );
    expect(descriptor("tavo-chicken", "burgers", "Twin Crunch")).toBe(
      "2 buttermilk fried chicken fillets in bun",
    );
    expect(descriptor("tavo-chicken", "burgers", "Flame")).toBe(
      "1 spicy grilled chicken fillet in bun",
    );
    expect(descriptor("tavo-chicken", "burgers", "Big Flame")).toBe(
      "2 spicy grilled chicken fillets in bun",
    );
  });

  test("distinguishes fried wings, fried tenders and grilled wings with flavour choice", () => {
    expect(descriptor("tavo-chicken", "fried-chicken-wings", "Fried Chicken Wings")).toBe(
      "Fried chicken wings with choice of flavour",
    );
    expect(descriptor("tavo-chicken", "fried-chicken-tenders", "Fried Chicken Tenders")).toBe(
      "Fried chicken tenders with choice of flavour",
    );
    expect(descriptor("tavo-chicken", "grilled-chicken-wings", "Grilled Chicken Wings")).toBe(
      "Grilled chicken wings with choice of flavour",
    );
  });

  test("preserves valid future fillet quantities without guessing unclear counts", () => {
    const brand = { id: "tavo-chicken" } as const;
    const section = { id: "burgers", title: "Burgers" };
    expect(
      launchMenuItemDescriptor(brand, section, {
        description: "3 buttermilk fried chicken fillets",
      }),
    ).toBe("3 buttermilk fried chicken fillets in bun");
    expect(
      launchMenuItemDescriptor(brand, section, { description: "4 spicy grilled chicken fillets" }),
    ).toBe("4 spicy grilled chicken fillets in bun");
    expect(
      launchMenuItemDescriptor(brand, section, { description: "Make it your own" }),
    ).toBe("Chicken fillet burger in bun");
    expect(descriptor("moktl", "mocktail-lounge", "Virgin Mojito")).toBe("");
  });

  test("does not invent patty count when the published description changes", () => {
    expect(
      launchMenuItemDescriptor(
        { id: "skorch-burgers" },
        { id: "beef-smash-deck", title: "The Beef Smash Deck" },
        { description: "A custom build" },
      ),
    ).toBe("Beef smash burger · bun");
  });
});
