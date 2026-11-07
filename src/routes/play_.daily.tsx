import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArcadePage } from "@/components/play/arcade-page";
import { arcadeDailySeo, resolveArcadeDailyPage } from "@/lib/mealdeck-arcade-pages";

export const Route = createFileRoute("/play_/daily")({
  validateSearch: () => ({}),
  // A fresh visit resolves today's UTC challenge; no preload can choose yesterday's date.
  staleTime: 0,
  preloadStaleTime: 0,
  gcTime: 0,
  loader: () => resolveArcadeDailyPage(),
  head: () => arcadeDailySeo(),
  component: DailyPage,
});

function DailyPage() {
  const loaded = Route.useLoaderData();
  // SSR loader data hydrates unchanged. Invalidation or midnight cannot reset an active round.
  const [visit] = useState(() => loaded);
  return <ArcadePage search={visit} page="daily" />;
}
