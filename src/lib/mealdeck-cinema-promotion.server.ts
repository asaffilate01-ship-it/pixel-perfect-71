import { launchMenuBrands } from "./launch-menu-catalogue";
import { hydrateMealDeckPublicMenu, parseMealDeckPublicMenu } from "./mealdeck-public-menu";
import { handlePublicMenuRequest } from "./mealdeck-public-menu.server";
import { cinemaPromoNextTransition, cinemaPromoPhase, type CinemaPromoSnapshot } from "./mealdeck-cinema-promotion";
import type { MealDeckRuntimeEnv } from "./mealdeck-runtime-config";

/** An explicit operator approval is not evidence of a paid order.
 * Keep the banner dormant until terms, canonical catalogue IDs and draw controls have been reviewed.
 * This module exposes no database IDs, credentials, or participant information.
 */
export function readCinemaPromoConfig(env: MealDeckRuntimeEnv) {
  if (env["MEALDECK_MUNCHBOX_CINEMA_PROMO_APPROVED"] !== "true") return null;
  const terms = env["MEALDECK_MUNCHBOX_CINEMA_PROMO_TERMS"]?.trim();
  if (!terms || terms.length < 80 || terms.length > 8000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(terms)) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(env["MEALDECK_MUNCHBOX_CINEMA_PROMO_SKUS"] ?? "null"); }
  catch { return null; }
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > 100 ||
      parsed.some(sku => typeof sku !== "string" || !sku.trim() || sku !== sku.trim() || sku.length > 160) ||
      new Set(parsed).size !== parsed.length) return null;
  const items = launchMenuBrands.flatMap(brand => brand.sections.flatMap(section => section.items));
  const selected = parsed.map(sku => items.filter(item => item.id === sku));
  if (selected.some(matches => matches.length !== 1)) return null;
  return { terms, eligibleSkus: parsed as string[], eligibleProducts: selected.map(matches => matches[0]!.name) };
}

export function readCinemaPromoStatus(env: MealDeckRuntimeEnv, now = Date.now()): CinemaPromoSnapshot {
  const validNow = Number.isFinite(now) && Math.abs(now) <= 8_640_000_000_000_000;
  const config = validNow ? readCinemaPromoConfig(env) : null;
  const approved = config !== null;
  const phase = cinemaPromoPhase(now, approved);
  return {
    phase,
    serverNow: new Date(validNow ? now : 0).toISOString(),
    nextTransitionAt: cinemaPromoNextTransition(now, approved),
    approved,
    catalogueState: "not-checked",
    terms: phase === "hidden" ? null : config?.terms ?? null,
    eligibleProducts: phase === "hidden" ? [] : config?.eligibleProducts ?? [],
  };
}


const MENU_MAX_AGE_MS = 60_000;
const MENU_FUTURE_TOLERANCE_MS = 5_000;

/** Public availability is presentation only, never entry or payment authority.
 * Do not request the menu before the entry window or after its cutoff.
 * Preserve all approved terms and the original allowlist during stock outages.
 */
export async function readLiveCinemaPromoStatus(
  env: MealDeckRuntimeEnv,
  clock: () => number = Date.now,
  fetcher: typeof fetch = fetch,
): Promise<CinemaPromoSnapshot> {
  const before = readCinemaPromoStatus(env, clock());
  if (before.phase !== "active") return before;
  let menu: ReturnType<typeof parseMealDeckPublicMenu> = null;
  try {
    const response = await handlePublicMenuRequest(
      new Request("https://mealdeck.co.uk/api/public/menu", { method: "GET" }),
      env,
      fetcher,
    );
    if (response.ok) menu = parseMealDeckPublicMenu(await response.json());
  } catch {
    // A failed or unavailable catalogue does not prove that a dish is orderable.
  }
  // The awaited read may have crossed midnight; the new server time wins.
  const now = clock();
  const status = readCinemaPromoStatus(env, now);
  if (status.phase !== "active") return status;
  const config = readCinemaPromoConfig(env);
  if (!config) return status;
  const age = menu ? now - Date.parse(menu.checkedAt) : Infinity;
  if (!menu || !Number.isFinite(age) || age < -MENU_FUTURE_TOLERANCE_MS || age > MENU_MAX_AGE_MS) {
    return { ...status, catalogueState: "unverified" };
  }
  try {
    const allowed = new Set(config.eligibleSkus);
    const items = hydrateMealDeckPublicMenu(menu).flatMap(brand => brand.sections.flatMap(section => section.items));
    const available = items.some(item => allowed.has(item.id) && item.available === true &&
      typeof item.pricePence === "number" && item.pricePence > 0);
    return { ...status, catalogueState: available ? "available" : "unavailable" };
  } catch {
    return { ...status, catalogueState: "unverified" };
  }
}
