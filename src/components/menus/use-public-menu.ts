import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { launchMenuBrands } from "@/lib/launch-menu-catalogue";
import { hydrateMealDeckPublicMenu, parseMealDeckPublicMenu } from "@/lib/mealdeck-public-menu";

/** Shared public data only. Refresh stock and prices on focus and every 15 seconds. */
export function usePublicMenu() {
  const query = useQuery({
    queryKey: ["mealdeck-public-menu", "luton"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/public/menu", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Menu updates are unavailable.");
      const snapshot = parseMealDeckPublicMenu(await response.json());
      if (!snapshot) throw new Error("Menu updates are unavailable.");
      return snapshot;
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: "always",
    retry: 1,
  });
  const catalogue = useMemo(
    () => (query.data ? hydrateMealDeckPublicMenu(query.data) : launchMenuBrands),
    [query.data],
  );
  return {
    catalogue,
    ready: !!query.data && !query.isError,
    loading: query.isPending,
    message: query.isPending
      ? "Checking today’s menu and availability…"
      : query.isError
        ? "Menu updates are temporarily unavailable. Your basket is saved; please try again."
        : "Prices and availability are updated from the kitchen.",
    retry: () => void query.refetch(),
  };
}
