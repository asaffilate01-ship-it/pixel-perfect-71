import type { LaunchMenuBrand, LaunchMenuItem, LaunchMenuSection } from "./launch-menu-catalogue";

/**
 * Owner-approved short lines beside Load’d and Souvano dish names, keyed by
 * the stable product ID so a display rename never changes which line shows.
 */
const ownerDishLines: Readonly<Record<string, string>> = {
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

/**
 * A customer-facing explanation displayed beside a dish name. An empty string
 * means no line is shown. This is presentation copy only: product identity,
 * purchased descriptions, ingredients, price, and checkout snapshots remain canonical.
 */
export function launchMenuItemDescriptor(
  brand: Pick<LaunchMenuBrand, "id">,
  section: Pick<LaunchMenuSection, "id" | "title">,
  item: Pick<LaunchMenuItem, "description"> & Partial<Pick<LaunchMenuItem, "id">>,
): string {
  const description = item.description?.trim() ?? "";
  const ownerLine = item.id ? ownerDishLines[item.id] : undefined;
  if (ownerLine) return ownerLine;

  if (brand.id === "skorch-burgers" && section.id === "beef-smash-deck") {
    // Respect the current catalogue/back-office description rather than
    // assuming the product's name always implies the same patty count.
    const count = description.match(/\b([1-4])\s+patt(?:y|ies)\b/i)?.[1];
    return count
      ? `${count} beef smash ${count === "1" ? "patty" : "patties"} · burger bun`
      : "Beef smash burger · bun";
  }

  if (brand.id === "tavo-chicken" && section.id === "burgers") {
    const count = description.match(/\b(2)\s+[^.]*?chicken\s+fillets?\b/i)?.[1];
    return count ? "2 chicken fillets · burger bun" : "Chicken burger · bun";
  }

  if (brand.id === "loadd") {
    if (section.id === "loaded-fries") return "Loaded Fries";
    if (section.id === "loaded-mac-cheese") return "Loaded Mac ’n Cheese";
    if (section.id === "full-house") return "Loaded Fries & Mac ’n Cheese";
  }

  // The owner asked for mocktails to have no extra explainer line.
  if (brand.id === "moktl" && section.id === "mocktail-lounge") return "";

  // Other menu types use the actual published section, never a guessed recipe.
  return section.title;
}
