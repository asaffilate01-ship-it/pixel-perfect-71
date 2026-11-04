export type LaunchMenuSearch = { brand?: string; section?: string };

/** Keep the same public menu choices when following a canonical menu link. */
export function validateLaunchMenuSearch(search: Record<string, unknown>): LaunchMenuSearch {
  return {
    ...(typeof search["brand"] === "string" ? { brand: search["brand"] } : {}),
    ...(typeof search["section"] === "string" ? { section: search["section"] } : {}),
  };
}

/** All menu entry paths use the basket dock instead of the general mobile bar. */
export function isLaunchMenuRoute(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  return path === "/menus" || path === "/menu" || path === "/order";
}
