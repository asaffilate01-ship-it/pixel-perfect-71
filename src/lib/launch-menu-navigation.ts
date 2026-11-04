export type LaunchMenuSearch = { brand?: string; section?: string };

/** Keep the same public menu choices when following a canonical menu link. */
export function validateLaunchMenuSearch(search: Record<string, unknown>): LaunchMenuSearch {
  return {
    ...(typeof search["brand"] === "string" ? { brand: search["brand"] } : {}),
    ...(typeof search["section"] === "string" ? { section: search["section"] } : {}),
  };
}

/** Menu routes own their mobile menu bar and desktop basket dock. */
export function isLaunchMenuRoute(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  return path === "/menus" || path === "/menu" || path === "/order";
}
