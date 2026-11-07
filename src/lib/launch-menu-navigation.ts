import { getMealDeckMenuPage } from "./mealdeck-menu-seo";

export type LaunchMenuSearch = { brand?: string; section?: string };

/** Keep the same public menu choices when following a canonical menu link. */
export function validateLaunchMenuSearch(search: Record<string, unknown>): LaunchMenuSearch {
  return {
    ...(typeof search["brand"] === "string" && search["brand"].trim()
      ? { brand: search["brand"].trim() }
      : {}),
    ...(typeof search["section"] === "string" && search["section"].trim()
      ? { section: search["section"].trim() }
      : {}),
  };
}

/** Menu routes own their mobile menu bar and desktop basket dock. */
export function isLaunchMenuRoute(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  const staticPath = path.toLowerCase();
  return (
    staticPath === "/menus" ||
    staticPath === "/menu" ||
    staticPath === "/order" ||
    (/^\/menus\//i.test(path) && !!getMealDeckMenuPage(path.slice("/menus/".length)))
  );
}
