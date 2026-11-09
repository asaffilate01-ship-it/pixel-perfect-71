import {
  decodeLaunchPicks,
  encodeLaunchPicks,
  MAX_LAUNCH_PICKS,
  MAX_LAUNCH_PICK_QUANTITY,
  type LaunchMenuPick,
} from "./launch-menu-picks";

/** Browser draft only. The database still prices and validates every order. */
export const LAUNCH_BASKET_TTL_MS = 5 * 60 * 1000;
export const LAUNCH_BASKET_EXPIRY_NOTICE =
  "Basket items are removed 5 minutes after they are added. Please add any expired items again.";
type Batch = Readonly<{ quantity: number; expiresAt: number }>;
export type TimedLaunchBasket = Readonly<{
  picks: LaunchMenuPick[];
  batches: Record<string, Batch[]>;
}>;

export function emptyTimedLaunchBasket(): TimedLaunchBasket {
  return { picks: [], batches: {} };
}

const validTime = (value: number) => Number.isSafeInteger(value) && value >= 0;

/** Expire individual quantities, including two additions of the same dish at different times. */
export function expireTimedLaunchBasket(
  basket: TimedLaunchBasket,
  at = Date.now(),
): TimedLaunchBasket {
  if (!validTime(at)) return emptyTimedLaunchBasket();
  let changed = false;
  const nextBatches: Record<string, Batch[]> = {};
  const nextPicks: LaunchMenuPick[] = [];
  for (const pick of basket.picks) {
    const original = basket.batches[pick.key] ?? [];
    const valid = original.filter((b) => b.expiresAt > at);
    const quantity = valid.reduce((sum, b) => sum + b.quantity, 0);
    if (!quantity || quantity !== pick.quantity || valid.length !== original.length) changed = true;
    if (!quantity) continue;
    nextPicks.push(quantity === pick.quantity ? pick : { ...pick, quantity });
    nextBatches[pick.key] = valid;
  }
  return changed ? { picks: nextPicks, batches: nextBatches } : basket;
}

/**
 * Preserve the lifetime of existing quantities. Editing a different variant
 * starts a new line; increasing an existing line adds a fresh quantity batch,
 * without extending the deadline of its older units.
 */
export function updateTimedLaunchBasket(
  previous: TimedLaunchBasket,
  requested: LaunchMenuPick[],
  at = Date.now(),
): TimedLaunchBasket {
  if (!validTime(at) || at > Number.MAX_SAFE_INTEGER - LAUNCH_BASKET_TTL_MS)
    return emptyTimedLaunchBasket();
  const active = expireTimedLaunchBasket(previous, at);
  const oldQuantity = new Map(active.picks.map((pick) => [pick.key, pick.quantity]));
  const result: Record<string, Batch[]> = {};
  for (const pick of requested) {
    const previousQuantity = oldQuantity.get(pick.key) ?? 0;
    const keep = Math.min(previousQuantity, pick.quantity);
    let remaining = keep;
    const batches: Batch[] = [];
    for (const batch of active.batches[pick.key] ?? []) {
      const quantity = Math.min(remaining, batch.quantity);
      if (quantity > 0) batches.push({ quantity, expiresAt: batch.expiresAt });
      remaining -= quantity;
    }
    if (pick.quantity > keep)
      batches.push({ quantity: pick.quantity - keep, expiresAt: at + LAUNCH_BASKET_TTL_MS });
    result[pick.key] = batches;
  }
  return { picks: requested, batches: result };
}

export function encodeTimedLaunchBasket(basket: TimedLaunchBasket): string {
  return JSON.stringify({
    version: 2,
    basket: encodeLaunchPicks(basket.picks),
    batches: basket.picks.map((pick) => ({ key: pick.key, entries: basket.batches[pick.key] ?? [] })),
  });
}

/** Reject old unlimited-lifetime v1 storage: it cannot prove when items were added. */
export function decodeTimedLaunchBasket(
  raw: string | null,
  at = Date.now(),
): TimedLaunchBasket {
  const empty = emptyTimedLaunchBasket();
  if (!raw || raw.length > 150_000 || !validTime(at)) return empty;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
    const payload = value as Record<string, unknown>;
    if (payload["version"] !== 2 || typeof payload["basket"] !== "string"
      || !Array.isArray(payload["batches"]) || payload["batches"].length > MAX_LAUNCH_PICKS)
      return empty;
    const picks = decodeLaunchPicks(payload["basket"]);
    if (encodeLaunchPicks(picks) !== payload["basket"] || picks.length !== payload["batches"].length)
      return empty;
    const batches: Record<string, Batch[]> = {};
    for (let index = 0; index < picks.length; index++) {
      const batchItem = payload["batches"][index];
      if (!batchItem || typeof batchItem !== "object" || Array.isArray(batchItem)) return empty;
      const row = batchItem as Record<string, unknown>;
      if (row["key"] !== picks[index]!.key
        || !Array.isArray(row["entries"])
        || row["entries"].length < 1
        || row["entries"].length > MAX_LAUNCH_PICK_QUANTITY) return empty;
      let total = 0;
      const entries: Batch[] = [];
      for (const untrusted of row["entries"]) {
        if (!untrusted || typeof untrusted !== "object" || Array.isArray(untrusted)) return empty;
        const e = untrusted as Record<string, unknown>;
        if (!Number.isSafeInteger(e["quantity"]) || (e["quantity"] as number) < 1
          || (e["quantity"] as number) > MAX_LAUNCH_PICK_QUANTITY
          || !Number.isSafeInteger(e["expiresAt"])
          || (e["expiresAt"] as number) < 0
          || (e["expiresAt"] as number) > at + LAUNCH_BASKET_TTL_MS) return empty;
        total += e["quantity"] as number;
        entries.push({ quantity: e["quantity"] as number, expiresAt: e["expiresAt"] as number });
      }
      if (total !== picks[index]!.quantity) return empty;
      batches[picks[index]!.key] = entries;
    }
    return expireTimedLaunchBasket({ picks, batches }, at);
  } catch {
    return empty;
  }
}

export function nextLaunchBasketExpiry(basket: TimedLaunchBasket): number | null {
  const deadlines = Object.values(basket.batches).flatMap((entries) => entries.map((e) => e["expiresAt"]));
  return deadlines.length ? Math.min(...deadlines) : null;
}
