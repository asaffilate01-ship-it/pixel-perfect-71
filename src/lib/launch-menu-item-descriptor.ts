import type { LaunchMenuBrand, LaunchMenuItem, LaunchMenuSection } from "./launch-menu-catalogue";

/**
 * A customer-facing explanation displayed beside a dish name.
 * This is presentation copy only: product identity, purchased descriptions,
 * ingredients, price, and checkout snapshots remain canonical.
 */
export function launchMenuItemDescriptor(
  brand: Pick<LaunchMenuBrand, "id">,
  section: Pick<LaunchMenuSection, "id" | "title">,
  item: Pick<LaunchMenuItem, "description">,
): string {
  const description = item.description?.trim() ?? "";

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
    if (section.id === "loaded-fries") {
      const topping = description.replace(/[.\s]+$/, "");
      return topping ? `${topping} · loaded fries` : "Loaded fries";
    }
    if (section.id === "loaded-mac-cheese") return "Loaded mac ’n cheese";
    if (section.id === "full-house") return "Loaded fries + mac ’n cheese";
  }

  if (brand.id === "moktl" && section.id === "mocktail-lounge") {
    return "Alcohol-free mocktail";
  }

  // Other menu types use the actual published section, never a guessed recipe.
  return section.title;
}
