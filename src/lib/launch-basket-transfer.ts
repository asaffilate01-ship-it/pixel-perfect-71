import {
  decodeLaunchPicks,
  encodeLaunchPicks,
  LAUNCH_PICKS_STORAGE_KEY,
  type LaunchMenuPick,
} from "./launch-menu-picks";

export const CHECKOUT_BASKET_HANDOFF_KEY = "mealdeck-checkout-picks-v1";
// Memory carries the current basket across a same-tab route change even when
// both storage APIs are blocked. It is never a server quote or durable backup.
let current: string | null = null;

export function prepareLaunchCheckout(picks: LaunchMenuPick[]) {
  current = encodeLaunchPicks(picks);
  try {
    sessionStorage.setItem(CHECKOUT_BASKET_HANDOFF_KEY, current);
  } catch {
    /* Memory remains. */
  }
}

export function readLaunchCheckoutPicks(): LaunchMenuPick[] {
  if (current !== null) return decodeLaunchPicks(current);
  try {
    const saved = sessionStorage.getItem(CHECKOUT_BASKET_HANDOFF_KEY);
    if (saved !== null) return decodeLaunchPicks(saved);
  } catch {
    /* Check persistent basket separately. */
  }
  try {
    return decodeLaunchPicks(localStorage.getItem(LAUNCH_PICKS_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function clearLaunchCheckoutTransfer() {
  current = null;
  try {
    sessionStorage.removeItem(CHECKOUT_BASKET_HANDOFF_KEY);
  } catch {
    /* No durable transfer. */
  }
}
