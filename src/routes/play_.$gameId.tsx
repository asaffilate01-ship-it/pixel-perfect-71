import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArcadePage } from "@/components/play/arcade-page";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { parseArcadeSearch, parseArcadeSetupSearch } from "@/lib/mealdeck-arcade-library";
import { arcadeGameSeo, getArcadeGamePage } from "@/lib/mealdeck-arcade-pages";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/play_/$gameId")({
  validateSearch: parseArcadeSetupSearch,
  loader: ({ params }) => {
    const game = getArcadeGamePage(params.gameId);
    if (!game) throw notFound();
    return game;
  },
  head: ({ loaderData }) =>
    loaderData
      ? arcadeGameSeo(loaderData.id)
      : seo({
          title: "Game not found | MealDeck Play",
          description: "Choose a free food-themed game from the MealDeck game library.",
          path: "/play",
          noIndex: true,
        }),
  notFoundComponent: GameNotFound,
  component: GamePage,
});

function GamePage() {
  const game = Route.useLoaderData();
  const setup = Route.useSearch();
  const search = parseArcadeSearch({ ...setup, game: game.id });
  return <ArcadePage search={search} page="game" />;
}

function GameNotFound() {
  return (
    <div className="md-marketing-shell md-arcade-entry">
      <SiteHeader />
      <main className="md-arcade-entry-main md-arcade-not-found">
        <p className="md-arcade-entry-eyebrow">MealDeck Play · 404</p>
        <h1>That game is not on the menu.</h1>
        <p>Choose from the current game library to find your next round.</p>
        <Link to="/play" className="md-arcade-entry-button">
          Explore the games
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
