import { describe, expect, test } from "bun:test";
import { getLaunchMenuBrand } from "../src/lib/launch-menu-catalogue";
import { addLaunchPick, encodeLaunchPicks, setLaunchPickQuantity } from "../src/lib/launch-menu-picks";
import {
  LAUNCH_BASKET_TTL_MS,
  decodeTimedLaunchBasket,
  emptyTimedLaunchBasket,
  encodeTimedLaunchBasket,
  expireTimedLaunchBasket,
  updateTimedLaunchBasket,
  nextLaunchBasketExpiry,
} from "../src/lib/launch-basket-expiration";

const start = Date.parse("2026-11-09T10:35:00Z");
const brand = getLaunchMenuBrand("moktl")!;
const item = brand.sections.find(s=>s.id==="mocktail-lounge")!.items[0]!;
const first = () => addLaunchPick([], brand.id, item.id, {}, 1);
const change = (qty: number) => setLaunchPickQuantity(first(), first()[0]!.key, qty);

describe("MealDeck five-minute browser basket expiration", () => {
  test("expires at exactly five minutes, including while the site was closed", () => {
    const initial = updateTimedLaunchBasket(emptyTimedLaunchBasket(), first(), start);
    const raw = encodeTimedLaunchBasket(initial);
    expect(decodeTimedLaunchBasket(raw, start+LAUNCH_BASKET_TTL_MS-1).picks).toHaveLength(1);
    expect(decodeTimedLaunchBasket(raw, start+LAUNCH_BASKET_TTL_MS).picks).toEqual([]);
    expect(nextLaunchBasketExpiry(initial)).toBe(start+LAUNCH_BASKET_TTL_MS);
  });
  test("additional quantities have independent deadlines", () => {
    const firstBatch = updateTimedLaunchBasket(emptyTimedLaunchBasket(), first(), start);
    const secondBatch = updateTimedLaunchBasket(firstBatch, change(3), start+60_000);
    const later = expireTimedLaunchBasket(secondBatch, start+LAUNCH_BASKET_TTL_MS);
    expect(later.picks[0]?.quantity).toBe(2);
    expect(expireTimedLaunchBasket(later,start+LAUNCH_BASKET_TTL_MS+60_000).picks).toEqual([]);
  });
  test("reducing quantity preserves old expiry rather than extending older units", () => {
    const firstBatch = updateTimedLaunchBasket(emptyTimedLaunchBasket(), change(3), start);
    const reduced = updateTimedLaunchBasket(firstBatch, change(1), start+120_000);
    expect(nextLaunchBasketExpiry(reduced)).toBe(start+LAUNCH_BASKET_TTL_MS);
    expect(expireTimedLaunchBasket(reduced, start+LAUNCH_BASKET_TTL_MS).picks).toEqual([]);
  });
  test("no legacy untimed v1 cart or invented expiry may be restored", () => {
    expect(decodeTimedLaunchBasket(encodeLaunchPicks(first()),start).picks).toEqual([]);
    expect(decodeTimedLaunchBasket("broken-json",start).picks).toEqual([]);
    const valid = JSON.parse(encodeTimedLaunchBasket(updateTimedLaunchBasket(emptyTimedLaunchBasket(),first(),start)));
    valid.batches[0].entries[0].expiresAt = start + LAUNCH_BASKET_TTL_MS+1;
    expect(decodeTimedLaunchBasket(JSON.stringify(valid),start).picks).toEqual([]);
  });
  test("linked variants keep canonical selections and are never used as a payment price", () => {
    const state = updateTimedLaunchBasket(emptyTimedLaunchBasket(),first(),start);
    const restored = decodeTimedLaunchBasket(encodeTimedLaunchBasket(state),start+1000);
    expect(restored.picks).toEqual(first());
    expect(encodeTimedLaunchBasket(restored)).not.toMatch(/payment|cardNumber|stripe|address/i);
  });
});
