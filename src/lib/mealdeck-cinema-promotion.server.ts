import { launchMenuBrands } from "./launch-menu-catalogue";
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
      parsed.some(sku => typeof sku !== "string" || !sku.trim() || sku.length > 180) ||
      new Set(parsed).size !== parsed.length) return null;
  const items = launchMenuBrands.flatMap(brand => brand.sections.flatMap(section => section.items));
  const selected = parsed.map(sku => items.filter(item => item.id === sku));
  if (selected.some(matches => matches.length !== 1)) return null;
  return { terms, eligibleProducts: selected.map(matches => matches[0]!.name) };
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
    terms: phase === "hidden" ? null : config?.terms ?? null,
    eligibleProducts: phase === "hidden" ? [] : config?.eligibleProducts ?? [],
  };
}
