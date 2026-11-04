import { createFileRoute } from "@tanstack/react-router";
import { LaunchMenuBrowser } from "@/components/menus/launch-menu-browser";
import { validateLaunchMenuSearch } from "@/lib/launch-menu-navigation";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/menus")({
  validateSearch: validateLaunchMenuSearch,
  head: () =>
    seo({
      title: "The launch menus — Skorch, Tavo, Souvano, Load’d & Moktl | MealDeck",
      description:
        "Explore MealDeck’s launch menus: smash burgers, chicken, Mediterranean grill, loaded fries and mocktails. Build your basket with meal upgrades and extras. Ordering coming soon.",
      path: "/menus",
    }),
  component: MenusPage,
});

function MenusPage() {
  const { brand, section } = Route.useSearch();
  return <LaunchMenuBrowser requestedBrandId={brand} requestedSectionId={section} />;
}
