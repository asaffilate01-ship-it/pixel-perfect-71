import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getMealDeckMenuPage } from "@/lib/mealdeck-menu-seo";
import { ldScript, menuPageJsonLd, seo } from "@/lib/seo";

export const Route = createFileRoute("/menus/$brandId")({
  loader: ({ params }) => {
    const page = getMealDeckMenuPage(params.brandId);
    if (!page) throw notFound();
    return page;
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          ...seo(loaderData),
          scripts: [ldScript(menuPageJsonLd(loaderData))],
        }
      : seo({
          title: "Menu not found | MealDeck",
          description: "Explore the five MealDeck menus for Luton collection and kerbside pickup.",
          path: "/menus",
          noIndex: true,
        }),
  // The parent owns the menu and basket so moving between brands cannot remount
  // a basket kept in memory when browser storage is unavailable.
  component: () => null,
  notFoundComponent: () => (
    <div className="md-marketing-shell lm-shell">
      <SiteHeader />
      <main className="lm-main lm-pending-menu">
        <h1>That menu isn’t in this deck.</h1>
        <p>Browse our five Luton menus for burgers, chicken, loaded fries, doner and mocktails.</p>
        <Link to="/menus" className="md-btn md-btn-yellow">
          Browse menus
        </Link>
      </main>
      <SiteFooter />
    </div>
  ),
});
