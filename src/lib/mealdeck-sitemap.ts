import { posts } from "./blog";
import { ARCADE_GAME_PAGES } from "./mealdeck-arcade-pages";
import { FRANCHISE_BRAND_IDS } from "./franchise-selection";
import { canonicalUrl, isPrivateSeoPath } from "./seo";
import { MEALDECK_MENU_PAGES } from "./mealdeck-menu-seo";
import { COMING_SOON } from "./launch-status";

/** Public discovery pages only. Private rooms and auth links never enter the sitemap. */
export const MEALDECK_PUBLIC_PATHS = [
  "/",
  "/luton",
  "/st-albans",
  "/bedford",
  "/menus",
  ...MEALDECK_MENU_PAGES.map((page) => page.path),
  // /order currently renders the same launch menu and canonicalises to /menus.
  ...(!COMING_SOON ? ["/order"] : []),
  "/offers",
  "/opening-offer",
  "/meta-ad",
  "/play",
  "/play/daily",
  "/play/receipt",
  "/play/promote",
  ...ARCADE_GAME_PAGES.map((game) => game.path),
  "/privacy",
  "/franchise",
  ...FRANCHISE_BRAND_IDS.map((id) => `/franchise/${id}`),
  "/blog",
  ...posts.map((post) => `/blog/${post.slug}`),
] as const;

export function mealDeckSitemap() {
  const urls = [
    ...new Set(MEALDECK_PUBLIC_PATHS.filter((path) => !isPrivateSeoPath(path)).map(canonicalUrl)),
  ];
  const xmlText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((url) => `  <url><loc>${xmlText(url)}</loc></url>`)
    .join("\n")}\n</urlset>`;
}
