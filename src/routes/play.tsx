import { createFileRoute } from "@tanstack/react-router";
import { ArcadePage } from "@/components/play/arcade-page";
import { parseArcadeSearch } from "@/lib/mealdeck-arcade-library";
import { arcadeGameSeo, arcadeLibrarySeo, getArcadeGamePage } from "@/lib/mealdeck-arcade-pages";

/** Keep existing /play?game=... links playable, with the new game page as their canonical. */
export const Route = createFileRoute("/play")({
  validateSearch: parseArcadeSearch,
  loaderDeps: ({ search }) => ({ game: search.game }),
  loader: ({ deps }) => getArcadeGamePage(deps.game),
  head: ({ loaderData }) => (loaderData ? arcadeGameSeo(loaderData.id) : arcadeLibrarySeo()),
  component: PlayPage,
});

function PlayPage() {
  const search = Route.useSearch();
  return <ArcadePage search={search} page={search.game ? "game" : "library"} />;
}
