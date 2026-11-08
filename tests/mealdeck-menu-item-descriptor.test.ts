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
    expect(descriptor("skorch-burgers", "beef-smash-deck", "The Ace"))
      .toBe("1 beef smash patty · burger bun");
    expect(descriptor("skorch-burgers", "beef-smash-deck", "Double Deal"))
      .toBe("2 beef smash patties · burger bun");
    expect(descriptor("skorch-burgers", "beef-smash-deck", "Triple Stack"))
      .toBe("3 beef smash patties · burger bun");
    expect(descriptor("skorch-burgers", "beef-smash-deck", "Four of a Kind"))
      .toBe("4 beef smash patties · burger bun");
  });

  test("shows the owner’s Load’d loaded fries lines", () => {
    expect(descriptor("loadd", "loaded-fries", "Royal Flush")).toBe("Fried Chicken Loaded Fries");
    expect(descriptor("loadd", "loaded-fries", "Double Deck")).toBe("Grilled Chicken Loaded Fries");
    expect(descriptor("loadd", "loaded-fries", "All In")).toBe("Chicken Shawarma Loaded Fries");
    expect(descriptor("loadd", "loaded-fries", "The Jackpot")).toBe("Smashed Beef Loaded Fries");
  });

  test("keeps the line on the stable product even when the live name differs", () => {
    expect(launchMenuItemDescriptor(
      { id: "loadd" },
      { id: "loaded-fries", title: "Loaded Fries" },
      { id: "loadd-loaded-fries-king-of-hearts", description: "Anything" },
    )).toBe("Fried Chicken Loaded Fries");
  });

  test("names each mac ’n cheese topping", () => {
    expect(descriptor("loadd", "loaded-mac-cheese", "Ace Mac")).toBe("Plain Mac ’n Cheese");
    expect(descriptor("loadd", "loaded-mac-cheese", "Jack’s Mac")).toBe("Fried Chicken Mac ’n Cheese");
    expect(descriptor("loadd", "loaded-mac-cheese", "Diamond Melt")).toBe("Chicken Shawarma Mac ’n Cheese");
    expect(descriptor("loadd", "loaded-mac-cheese", "Spade Stack")).toBe("Smash Beef Mac ’n Cheese");
  });

  test("names each Full House topping", () => {
    expect(descriptor("loadd", "full-house", "Royal Flush"))
      .toBe("Fried Chicken Loaded Fries & Mac ’n Cheese");
    expect(descriptor("loadd", "full-house", "The Jackpot"))
      .toBe("Smashed Beef Loaded Fries & Mac ’n Cheese");
  });

  test("Heatwave reads as chopped and shredded chicken", () => {
    expect(descriptor("souvano", "heatwave", "Heatwave")).toBe("Chopped and Shredded Chicken");
  });

  test("chicken burgers keep their line; mocktails have none", () => {
    expect(descriptor("tavo-chicken", "burgers", "Twin Crunch"))
      .toBe("2 chicken fillets · burger bun");
    expect(descriptor("moktl", "mocktail-lounge", "Virgin Mojito")).toBe("");
  });

  test("does not invent patty count when the published description changes", () => {
    expect(launchMenuItemDescriptor(
      { id: "skorch-burgers" },
      { id: "beef-smash-deck", title: "The Beef Smash Deck" },
      { description: "A custom build" },
    )).toBe("Beef smash burger · bun");
  });
});
