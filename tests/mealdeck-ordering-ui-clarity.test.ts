import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const source = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("MealDeck temporary notice and shorter checkout path", () => {
  test("notice closes after eight seconds, allows dismissal and excludes ordering", () => {
    const banner = source("src/components/own-driver-offer-banner.tsx");
    const css = source("src/styles.member-banner.css");
    expect(banner).toContain("MEALDECK_ANNOUNCEMENT_SESSION_KEY");
    expect(banner).toContain("window.sessionStorage.setItem");
    expect(banner).toContain("8_000");
    expect(banner).toContain('aria-label="Close MealDeck update"');
    expect(banner).toContain('pathname === "/" || pathname === "/luton"');
    expect(css).toContain("position: fixed;");
    expect(css).toContain("max-height: min(340px, 45dvh);");
    expect(css).toContain("(prefers-reduced-motion: reduce)");
  });
  test("central mobile Order Now button has no burger corner artwork", () => {
    const tabs = source("src/components/mobile-tab-bar.tsx");
    expect(tabs).toContain('aria-label="Order Now — browse MealDeck menus"');
    expect(tabs).not.toContain("suitArtwork.burger");
    expect(tabs).not.toContain('rotate-[-6deg]');
  });
  test("mobile checkout reuses the validated basket transfer and retains basket", () => {
    const nav = source("src/components/menus/launch-menu-app-nav.tsx");
    const menu = source("src/components/menus/launch-menu-browser.tsx");
    expect(nav).toContain('to="/checkout"');
    expect(nav).toContain("count > 0");
    expect(nav).toContain("onClick={onCheckout}");
    expect(nav).toContain("onBasket");
    expect(menu).toContain("onCheckout={proceedToCheckout}");
    expect(menu).toContain("prepareLaunchCheckout(live.picks, live)");
    expect(source("src/styles.launch-app.css")).toContain('data-has-checkout="true"');
  });
  test("desktop checkout shortcut and three-stage instructions remain available", () => {
    const menu = source("src/components/menus/launch-menu-browser.tsx");
    const checkout = source("src/components/launch-checkout.tsx");
    expect(menu).toContain("lm-desktop-fast-checkout");
    expect(menu).toContain('onClick={proceedToCheckout}');
    expect(checkout).toContain("md-checkout-journey");
    expect(checkout).toContain("Review &amp; pay");
    expect(checkout).toContain("reviewConfirmed");
  });
});
