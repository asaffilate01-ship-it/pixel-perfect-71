import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { LaunchMenuBrowser } from "@/components/menus/launch-menu-browser";
import { validateLaunchMenuSearch } from "@/lib/launch-menu-navigation";
import { getMealDeckMenuPage } from "@/lib/mealdeck-menu-seo";
import { getMealDeckMenuForRender } from "@/lib/mealdeck-menu-render.functions";
import { ldScript, menuPageJsonLd, seo } from "@/lib/seo";

export const Route = createFileRoute("/menus")({
  validateSearch: validateLaunchMenuSearch,
  loaderDeps: ({ search }) => ({ brand: search.brand }),
  loader: async () => ({
    // Initial HTML uses the same safe public menu as the browser. Client tab
    // changes keep the shared live query and do not add another network read.
    initialMenu: import.meta.env.SSR ? await getMealDeckMenuForRender() : null,
  }),
  head: ({ match, matches }) => {
    // Head's route-local type is narrower than the complete runtime match list.
    if (matches.some((entry) => String(entry.routeId) === "/menus/$brandId")) return {};
    const page = getMealDeckMenuPage(match.loaderDeps.brand);
    return page
      ? { ...seo(page), scripts: [ldScript(menuPageJsonLd(page))] }
      : seo({
          title: "Luton Menus: Burgers, Wings & Loaded Fries | MealDeck",
          description:
            "Explore Skorch burgers, Tavo Chicken wings, Load’d fries, Souvano doner, Moktl mocktails and milk cake. One MealDeck basket for Luton collection or kerbside.",
          path: "/menus",
          noIndex: !!match.loaderDeps.brand,
        });
  },
  component: MenusPage,
});

function MenusPage() {
  const { brand, section } = Route.useSearch();
  const { initialMenu } = Route.useLoaderData();
  const childBrandId = useRouterState({
    select: (state) =>
      state.matches.find((entry) => entry.routeId === "/menus/$brandId")?.params.brandId,
  });
  const page = getMealDeckMenuPage(childBrandId);
  // Unknown brands render the child route's real 404 rather than a soft-404 menu.
  if (childBrandId && !page) return <Outlet />;
  return (
    <>
      <LaunchMenuBrowser
        requestedBrandId={page?.brandId ?? brand}
        requestedSectionId={section}
        initialMenu={initialMenu}
      />
      <Outlet />
    </>
  );
}
