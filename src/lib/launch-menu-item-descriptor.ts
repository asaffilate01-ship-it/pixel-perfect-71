import type { LaunchMenuBrand, LaunchMenuItem, LaunchMenuSection } from "./launch-menu-catalogue";

/** Preserve the publishing branch's existing, product-specific subtitle copy. */
const ownerDishLines: Readonly<Record<string, string>> = {
  "tavo-chicken-burgers-cruncher": "1 buttermilk fried chicken fillet in bun",
  "tavo-chicken-burgers-twin-crunch": "2 buttermilk fried chicken fillets in bun",
  "tavo-chicken-burgers-flame": "1 spicy grilled chicken fillet in bun",
  "tavo-chicken-burgers-big-flame": "2 spicy grilled chicken fillets in bun",
  "tavo-chicken-fried-chicken-wings-fried-chicken-wings":
    "Fried chicken wings with choice of flavour",
  "tavo-chicken-fried-chicken-tenders-fried-chicken-tenders":
    "Fried chicken tenders with choice of flavour",
  "tavo-chicken-grilled-chicken-wings-grilled-chicken-wings":
    "Grilled chicken wings with choice of flavour",
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

type DescriptorSection = Pick<LaunchMenuSection, "id" | "title"> &
  Partial<Pick<LaunchMenuSection, "description">>;

function dishDescription(section: DescriptorSection, item: Pick<LaunchMenuItem, "description">) {
  const description = (item.description ?? "").replace(/\r\n/g, "\n").trim();
  const shared = (section.description ?? "").replace(/\r\n/g, "\n").trim();
  // The importer joins section copy and the actual dish description with a
  // blank line. Remove only that exact known prefix, not arbitrary food text.
  if (shared && description === shared) return "";
  return shared && description.startsWith(shared + "\n\n")
    ? description.slice(shared.length).trim()
    : description;
}

/** Presentation only: identity, complete descriptions, prices and recipes stay unchanged. */
export function launchMenuItemDescriptor(
  brand: Pick<LaunchMenuBrand, "id">,
  section: DescriptorSection,
  item: Pick<LaunchMenuItem, "description"> & Partial<Pick<LaunchMenuItem, "id">>,
): string {
  const ownerLine = item.id ? ownerDishLines[item.id] : undefined;
  if (ownerLine) return ownerLine;
  const description = dishDescription(section, item);

  if (brand.id === "skorch-burgers" && section.id === "beef-smash-deck") {
    const counts = [...description.matchAll(/\b([1-9])\s+patt(?:y|ies)\b/gi)];
    // Do not turn optional/alternative counts into a promised burger size.
    const count =
      counts.length === 1 && !/\b(?:add|extra|optional|upgrade|or)\b/i.test(description)
        ? counts[0]?.[1]
        : undefined;
    return count
      ? `${count} beef smash ${count === "1" ? "patty" : "patties"} · burger bun`
      : "Beef smash burger · bun";
  }

  if (brand.id === "tavo-chicken" && section.id === "burgers") {
    // Fall back to the source cooking method, never a generic "chicken burger".
    // Do not infer a quantity from an ambiguous or optional description.
    const match = description.match(
      /^(?:([1-9]\\d*)\\s+)?(buttermilk fried|spicy grilled)\\s+chicken\\s+(fillet|fillets)\\b/i,
    );
    const count = match?.[1]
      ? Number(match[1])
      : match?.[3]?.toLowerCase() === "fillet"
        ? 1
        : null;
    return count && match && !/\\b(?:add|extra|optional|upgrade|or)\\b/i.test(description)
      ? `${count} ${match[2].toLowerCase()} chicken ${count === 1 ? "fillet" : "fillets"} in bun`
      : "Chicken fillet burger in bun";
  }

  if (brand.id === "loadd") {
    if (section.id === "loaded-fries") {
      const topping = description.replace(/[.\s]+$/, "");
      // Long or multi-paragraph copy stays in the existing full description,
      // not in a badge competing with the name, price and Add control.
      return topping && topping.length <= 70 && !/[\n.!?]/.test(topping)
        ? `${topping} · loaded fries`
        : "Loaded fries";
    }
    if (section.id === "loaded-mac-cheese") return "Loaded mac ’n cheese";
    if (section.id === "full-house") {
      const topping = description.match(
        /^([^,\n]{1,45}),\s*loaded fries and mac [’']n cheese\.?$/i,
      )?.[1];
      return topping
        ? `${topping} · loaded fries + mac ’n cheese`
        : "Loaded fries + mac ’n cheese";
    }
  }

  // Preserve the existing Moktl presentation: no additional explainer line.
  if (brand.id === "moktl" && section.id === "mocktail-lounge") return "";
  return section.title;
}
