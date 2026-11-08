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

  test("distinguishes chicken burgers and keeps Moktl free of duplicate copy", () => {
    expect(descriptor("tavo-chicken", "burgers", "Twin Crunch")).toBe(
      "2 chicken fillets · burger bun",
    );
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
