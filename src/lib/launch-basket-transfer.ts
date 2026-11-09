import {
  decodeLaunchPicks,
  encodeLaunchPicks,
  LAUNCH_PICKS_STORAGE_KEY,
  type LaunchMenuPick,
} from "./launch-menu-picks";
import { z } from "zod";
import {
  LAUNCH_BASKET_EXPIRY_NOTICE,
  decodeTimedLaunchBasket,
  encodeTimedLaunchBasket,
  expireTimedLaunchBasket,
  type TimedLaunchBasket,
} from "./launch-basket-expiration";
import { validateGroupPicks, type GroupCheckoutTransfer } from "./mealdeck-group-plan";

export const CHECKOUT_BASKET_HANDOFF_KEY = "mealdeck-checkout-picks-v1";
export const CHECKOUT_GROUP_HANDOFF_KEY = "mealdeck-checkout-group-v1";
export const CHECKOUT_TIMED_BASKET_KEY = "mealdeck-checkout-basket-timed-v2";
// Memory carries the current basket across a same-tab route change even when
// both storage APIs are blocked. It is never a server quote or durable backup.
let current: string | null = null;
let currentTimed: string | null = null;
let currentGroup: string | null = null;

const groupHandoffSchema = z.strictObject({
  version: z.literal(1),
  basket: z.string().max(100_000),
  groupId: z.string().uuid(),
  packing: z.strictObject({
    separateBags: z.literal(true),
    bagCount: z.number().int().min(1).max(10),
    allocations: z
      .array(
        z.strictObject({
          lineId: z.string().regex(/^line-([1-9]|[1-5][0-9]|60)$/),
          bag: z.number().int().min(1).max(10),
          quantity: z.number().int().min(1).max(20),
        }),
      )
      .min(1)
      .max(600),
  }),
  bags: z
    .array(
      z.strictObject({ number: z.number().int().min(1).max(10), label: z.string().min(1).max(32) }),
    )
    .min(1)
    .max(10),
});
export type LaunchCheckoutGroup = Omit<z.infer<typeof groupHandoffSchema>, "version" | "basket">;

/** Optional packing hints must account for every current line exactly once. */
export function parseLaunchCheckoutGroup(
  raw: string | null,
  picks: LaunchMenuPick[],
): LaunchCheckoutGroup | null {
  if (!raw || raw.length > 120_000 || !picks.length) return null;
  try {
    const parsed = groupHandoffSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.basket !== encodeLaunchPicks(picks)) return null;
    const { groupId, packing, bags } = parsed.data;
    if (bags.length !== packing.bagCount || bags.some((bag, index) => bag.number !== index + 1))
      return null;
    const totals = new Map(picks.map((_, index) => ["line-" + (index + 1), 0]));
    const pairs = new Set<string>();
    const usedBags = new Set<number>();
    for (const allocation of packing.allocations) {
      const pair = allocation.lineId + ":" + allocation.bag;
      if (!totals.has(allocation.lineId) || allocation.bag > packing.bagCount || pairs.has(pair))
        return null;
      pairs.add(pair);
      usedBags.add(allocation.bag);
      totals.set(allocation.lineId, totals.get(allocation.lineId)! + allocation.quantity);
    }
    if (
      usedBags.size !== packing.bagCount ||
      picks.some((pick, index) => totals.get("line-" + (index + 1)) !== pick.quantity)
    )
      return null;
    return { groupId, packing, bags };
  } catch {
    return null;
  }
}

export function prepareLaunchCheckout(picks: LaunchMenuPick[], timed?: TimedLaunchBasket) {
  const safe = timed ? expireTimedLaunchBasket(timed) : null;
  if (safe && encodeLaunchPicks(safe.picks) !== encodeLaunchPicks(picks))
    throw new Error(LAUNCH_BASKET_EXPIRY_NOTICE);
  current = encodeLaunchPicks(picks);
  currentGroup = null;
  currentTimed = safe ? encodeTimedLaunchBasket(safe) : null;
  try {
    sessionStorage.removeItem(CHECKOUT_GROUP_HANDOFF_KEY);
    sessionStorage.setItem(CHECKOUT_BASKET_HANDOFF_KEY, current);
    if (currentTimed) sessionStorage.setItem(CHECKOUT_TIMED_BASKET_KEY, currentTimed);
    else sessionStorage.removeItem(CHECKOUT_TIMED_BASKET_KEY);
  } catch {
    /* Memory remains; no expiry is extended when storage is blocked. */
  }
}

export function prepareGroupCheckout(transfer: GroupCheckoutTransfer) {
  const basket = encodeLaunchPicks(transfer.picks);
  const metadata = JSON.stringify({
    version: 1,
    basket,
    groupId: transfer.groupId,
    packing: transfer.packing,
    bags: transfer.bags,
  });
  if (!parseLaunchCheckoutGroup(metadata, transfer.picks))
    throw new Error("Review each person’s bag before continuing to checkout.");
  prepareLaunchCheckout(transfer.picks);
  currentGroup = metadata;
  try {
    sessionStorage.setItem(CHECKOUT_GROUP_HANDOFF_KEY, metadata);
  } catch {
    /* Memory remains. */
  }
}

export function readLaunchCheckoutGroup(picks: LaunchMenuPick[]): LaunchCheckoutGroup | null {
  if (current !== null) return parseLaunchCheckoutGroup(currentGroup, picks);
  try {
    return parseLaunchCheckoutGroup(sessionStorage.getItem(CHECKOUT_GROUP_HANDOFF_KEY), picks);
  } catch {
    return null;
  }
}

export function readLaunchCheckoutPicks(): LaunchMenuPick[] {
  return readLaunchCheckoutTransfer().picks;
}

export type LaunchCheckoutTransfer = {
  picks: LaunchMenuPick[];
  group: LaunchCheckoutGroup | null;
  issue: string | null;
};

/** Group restoration is all-or-nothing; it must never become a partial personal basket. */
export function readLaunchCheckoutTransfer(expectGroup = false): LaunchCheckoutTransfer {
  let raw = current;
  let rawGroup = currentGroup;
  let timedRaw = currentTimed;
  if (raw === null) {
    try {
      raw = sessionStorage.getItem(CHECKOUT_BASKET_HANDOFF_KEY);
      rawGroup = sessionStorage.getItem(CHECKOUT_GROUP_HANDOFF_KEY);
      timedRaw = sessionStorage.getItem(CHECKOUT_TIMED_BASKET_KEY);
    } catch {
      /* A group URL still fails closed when same-tab storage was lost. */
    }
  }
  if (expectGroup || rawGroup !== null) {
    const invalid = {
      picks: [],
      group: null,
      issue:
        "Your complete group choices and bags could not be restored. Return to your group draft, review the current menu and send the whole group to checkout again.",
    };
    if (!raw || !rawGroup || raw.length > 100_000) return invalid;
    try {
      const value = JSON.parse(raw) as { version?: unknown; picks?: unknown } | null;
      if (!value || value.version !== 1) return invalid;
      const picks = validateGroupPicks(value.picks);
      // Bind the exact canonical selection, including variants and attached extras.
      if (encodeLaunchPicks(picks) !== raw) return invalid;
      const group = parseLaunchCheckoutGroup(rawGroup, picks);
      return group ? { picks, group, issue: null } : invalid;
    } catch {
      return invalid;
    }
  }
  if (raw !== null) {
    if (!timedRaw) return { picks: [], group: null, issue: LAUNCH_BASKET_EXPIRY_NOTICE };
    try {
      const saved: unknown = JSON.parse(timedRaw);
      if (!saved || typeof saved !== "object" || Array.isArray(saved)
        || (saved as Record<string, unknown>)["basket"] !== raw)
        return { picks: [], group: null, issue: LAUNCH_BASKET_EXPIRY_NOTICE };
      const picks = decodeTimedLaunchBasket(timedRaw).picks;
      if (encodeLaunchPicks(picks) !== raw)
        return { picks, group: null, issue: LAUNCH_BASKET_EXPIRY_NOTICE };
      return { picks, group: null, issue: null };
    } catch {
      return { picks: [], group: null, issue: LAUNCH_BASKET_EXPIRY_NOTICE };
    }
  }
  try {
    const picks = decodeTimedLaunchBasket(localStorage.getItem(LAUNCH_PICKS_STORAGE_KEY)).picks;
    return { picks, group: null, issue: null };
  } catch {
    return { picks: [], group: null, issue: null };
  }
}

export function clearLaunchCheckoutTransfer() {
  current = null;
  currentGroup = null;
  currentTimed = null;
  try {
    sessionStorage.removeItem(CHECKOUT_BASKET_HANDOFF_KEY);
    sessionStorage.removeItem(CHECKOUT_GROUP_HANDOFF_KEY);
    sessionStorage.removeItem(CHECKOUT_TIMED_BASKET_KEY);
  } catch {
    /* No durable transfer. */
  }
}
