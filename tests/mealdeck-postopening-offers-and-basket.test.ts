import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getLaunchMenuBrand } from "../src/lib/launch-menu-catalogue";
import { addLaunchPick } from "../src/lib/launch-menu-picks";
import {
  LAUNCH_BASKET_TTL_MS,
  decodeTimedLaunchBasket,
  emptyTimedLaunchBasket,
  encodeTimedLaunchBasket,
  expireTimedLaunchBasket,
  updateTimedLaunchBasket,
} from "../src/lib/launch-basket-expiration";

const source = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("post-opening MealDeck offers", () => {
  test("public offers page retires 30%/99p active cards and unapproved double points", () => {
    const offers = source("src/routes/offers.tsx");
    expect(offers).not.toContain("MealDeckOfferCards");
    expect(offers).not.toContain("Join for double points");
    expect(offers).not.toContain("99p Milk Cake & Double Points");
    expect(offers).toContain("promotion have ended");
    expect(offers).toContain("£1 paid = 1 loyalty point.");
    expect(offers).toContain('to="/account"');
  });
  test("historical opening offer fails closed instead of showing 30% when checkout status is missing", () => {
    const opening = source("src/components/opening-weekend-offer.tsx");
    expect(opening).toContain('offer.status !== "active" && offer.status !== "upcoming"');
    expect(opening).toContain("Opening weekend has finished.");
  });
  test("homepage promotes only the active standard point-earning policy", () => {
    const home = source("src/components/marketing/offer-discovery.tsx");
    expect(home).not.toContain("MEALDECK_OFFERS");
    expect(home).not.toContain("double loyalty points");
    expect(home).not.toContain("30% opening offer");
    expect(home).toContain("one point per complete £1 paid");
  });
  test("menu checkout uses the timed-basket handoff, never expired dessert promotion copy", () => {
    const menu = source("src/components/menus/launch-menu-browser.tsx");
    expect(menu).toContain("expireTimedLaunchBasket(basketRef.current)");
    expect(menu).toContain("prepareLaunchCheckout(live.picks, live)");
    expect(menu).toContain("window.addEventListener(\"storage\", onStorage)");
    expect(menu).not.toContain("One milkcake per order is 99p");
    expect(menu).not.toContain("<MilkcakeOfferTerms");
  });
  test("unpaid checkout rechecks expiry before quote, payment and creating a shared payment room", () => {
    const checkout = source("src/components/launch-checkout.tsx");
    expect(checkout).toContain("browserBasketStillValid()");
    expect(checkout).toContain("!basketLoaded");
    expect(checkout).toContain("if (orderId || whatsAppDraft || whatsAppPaymentAttempt || groupExpected) return true;");
    expect(checkout).toContain("window.clearInterval(interval)");
  });
});

describe("20-minute personal-basket expiration keeps paid receipt evidence untouched", () => {
  test("old saved baskets cannot silently reappear or extend their original deadline", () => {
    const menu = getLaunchMenuBrand("moktl")!;
    const item = menu.sections.flatMap(s => s.items)[0]!;
    const picks = addLaunchPick([],menu.id,item.id,{},1);
    const at = Date.parse("2026-11-09T15:00:00Z");
    const timed = updateTimedLaunchBasket(emptyTimedLaunchBasket(),picks,at);
    expect(decodeTimedLaunchBasket(encodeTimedLaunchBasket(timed), at + LAUNCH_BASKET_TTL_MS - 1).picks).toHaveLength(1);
    expect(expireTimedLaunchBasket(timed,at + LAUNCH_BASKET_TTL_MS).picks).toHaveLength(0);
    expect(decodeTimedLaunchBasket(encodeTimedLaunchBasket(timed),at + LAUNCH_BASKET_TTL_MS).picks).toHaveLength(0);
  });
});
