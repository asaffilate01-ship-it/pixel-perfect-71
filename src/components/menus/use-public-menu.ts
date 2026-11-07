import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { launchMenuBrands } from "@/lib/launch-menu-catalogue";
import {
  hydrateMealDeckPublicMenu,
  parseMealDeckPublicMenu,
  type MealDeckPublicMenuSnapshot,
} from "@/lib/mealdeck-public-menu";

export function mealDeckPublicMenuQueryOptions(initialMenu?: MealDeckPublicMenuSnapshot | null) {
  return queryOptions({
    queryKey: ["mealdeck-public-menu", "luton"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/public/menu", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Menu updates are unavailable.");
      const snapshot = parseMealDeckPublicMenu(await response.json());
      if (!snapshot) throw new Error("Menu updates are unavailable.");
      return snapshot;
    },
    // Initial data fills an empty cache only. A newer shared browser snapshot
    // wins, and rendered menu text never counts as a successful client refresh.
    initialData: initialMenu ?? undefined,
    initialDataUpdatedAt: 0,
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    retry: 1,
  });
}

/** Shared public data only. Refresh stock and prices on focus and every 15 seconds. */
export function usePublicMenu(initialMenu?: MealDeckPublicMenuSnapshot | null) {
  const query = useQuery(mealDeckPublicMenuQueryOptions(initialMenu));
  const catalogue = useMemo(
    () => (query.data ? hydrateMealDeckPublicMenu(query.data) : launchMenuBrands),
    [query.data],
  );
  const loading = query.isPending || (!!query.data && !query.isFetched);
  return {
    catalogue,
    ready: !!query.data && query.isFetched && !query.isError,
    loading,
    message: loading
      ? "Checking today’s menu and availability…"
      : query.isError
        ? "Menu updates are temporarily unavailable. Your basket is saved; please try again."
        : "Prices and availability are updated from the kitchen.",
    retry: () => void query.refetch(),
  };
}
