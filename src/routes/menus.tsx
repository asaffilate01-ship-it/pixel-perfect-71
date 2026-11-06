import { createFileRoute } from "@tanstack/react-router";
import { LaunchMenuBrowser } from "@/components/menus/launch-menu-browser";
import { validateLaunchMenuSearch } from "@/lib/launch-menu-navigation";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/menus")({
  validateSearch: validateLaunchMenuSearch,
  head: () =>
    seo({
      title: "Luton food menus — Skorch, Tavo, Souvano, Load’d & Moktl | MealDeck",
      description:
        "Order Skorch burgers, Tavo chicken, Souvano Greek and Turkish food, Load’d loaded fries and mac and cheese, and Moktl mocktails for Luton collection or kerbside during kitchen opening hours.",
      path: "/menus",
    }),
  component: MenusPage,
});

function MenusPage() {
  const { brand, section } = Route.useSearch();
  return <LaunchMenuBrowser requestedBrandId={brand} requestedSectionId={section} />;
}
