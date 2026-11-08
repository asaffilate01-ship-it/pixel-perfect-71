import type { LaunchMenuBrand, LaunchMenuItem, LaunchMenuSection } from "./launch-menu-catalogue";

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
  item: Pick<LaunchMenuItem, "description">,
): string {
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
    const match = description.match(
      /^([1-9])\s+(?:(?:buttermilk|fried|spicy|grilled)\s+)*chicken\s+fillets?\b/i,
    );
    const count =
      match && !/\b(?:add|extra|optional|upgrade|or)\b/i.test(description) ? match[1] : null;
    return count
      ? `${count} chicken ${count === "1" ? "fillet" : "fillets"} · burger bun`
      : "Chicken burger · bun";
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

  if (brand.id === "moktl" && section.id === "mocktail-lounge") return "Alcohol-free mocktail";
  return section.title;
}
