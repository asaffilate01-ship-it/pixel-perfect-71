import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { MealDeckPageLoading } from "./components/mealdeck-page-loading";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: MealDeckPageLoading,
    defaultPendingMs: 250,
    defaultPendingMinMs: 200,
  });

  return router;
};
