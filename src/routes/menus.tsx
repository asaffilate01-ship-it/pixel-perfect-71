import { createFileRoute } from "@tanstack/react-router";
import { LaunchMenuBrowser } from "@/components/menus/launch-menu-browser";
import { seo } from "@/lib/seo";

type MenuSearch = { brand?: string; section?: string };

export const Route = createFileRoute("/menus")({
  validateSearch: (search: Record<string, unknown>): MenuSearch => ({
    ...(typeof search["brand"] === "string" ? { brand: search["brand"] } : {}),
    ...(typeof search["section"] === "string" ? { section: search["section"] } : {}),
  }),
  head: () =>
    seo({
      title: "The launch menus — Skorch, Tavo, Souvano, Load’d & Moktl | MealDeck",
      description:
        "Explore MealDeck’s launch menus: smash burgers, chicken, Mediterranean grill, loaded fries and mocktails. Build your picks with meal upgrades and add-ons. Ordering coming soon.",
      path: "/menus",
    }),
  component: MenusPage,
});

function MenusPage() {
  const { brand, section } = Route.useSearch();
  return <LaunchMenuBrowser requestedBrandId={brand} requestedSectionId={section} />;
}
