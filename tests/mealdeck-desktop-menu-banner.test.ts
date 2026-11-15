import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OfferBannerLayout } from "../src/components/own-driver-offer-banner";

describe("MealDeck menu desktop banner alignment", () => {
  test("copy and action links use separate aligned groups, not a single wrapping row", () => {
    const markup = renderToStaticMarkup(
      createElement(OfferBannerLayout, {
        label: "MealDeck member registration and delivery",
        icon: createElement("svg", { "aria-hidden": true, width: 18, height: 18 }),
        title: "Join MealDeck for member-only offers and loyalty benefits.",
        details: "Verify email and mobile number for member benefits.",
        actions: createElement(
          "a",
          { href: "/account", className: "md-own-driver-offer-link" },
          "Register",
        ),
      }),
    );
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="MealDeck member registration and delivery"');
    expect(markup).toContain('class="md-own-driver-offer-inner"');
    expect(markup).toContain('class="md-own-driver-offer-message"');
    expect(markup).toContain('class="md-own-driver-offer-copy"');
    expect(markup).toContain('class="md-own-driver-offer-actions"');
    expect(markup).toContain('href="/account"');
    expect(markup.indexOf("md-own-driver-offer-copy")).toBeLessThan(
      markup.indexOf("md-own-driver-offer-actions"),
    );
    expect(markup).not.toContain("flex-wrap items-center justify-center");
  });

  test("banner shares menu gutters and stays readable on tablet/mobile", () => {
    const css = readFileSync(
      new URL("../src/styles.mealdeck-rebuild.css", import.meta.url),
      "utf8",
    );
    const menu = readFileSync(
      new URL("../src/styles.launch-menus.css", import.meta.url),
      "utf8",
    );
    expect(menu).toContain("max-width: 1380px;");
    expect(menu).toContain("padding: 28px 34px 52px;");
    expect(css).toContain(".md-own-driver-offer-inner {");
    expect(css).toContain("max-width: 1380px;");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) max-content;");
    expect(css).toContain("align-items: center;");
    expect(css).toContain("justify-content: flex-end;");
    expect(css).toContain("@media (max-width: 1160px)");
    expect(css).toContain("@media (max-width: 1100px)");
    expect(css).toContain("@media (max-width: 800px)");
    expect(css).toContain("@media (max-width: 560px)");
    expect(css).toContain(".md-site-header .md-own-driver-offer-link:focus-visible");
    expect(css).toContain(".md-own-driver-offer a.md-own-driver-offer-link {");
    expect(css).toContain("white-space: nowrap;");
  });
});

describe("MealDeck low-friction ordering UX regressions", () => {
  const source = (path: string) =>
    readFileSync(new URL("../" + path, import.meta.url), "utf8");

  test("promotions auto-dismiss, have a close button and stay off payment pages", () => {
    const banner = source("src/components/own-driver-offer-banner.tsx");
    const css = source("src/styles.member-banner.css");
    expect(banner).toContain('className="md-member-popup-close"');
    expect(banner).toContain('aria-label="Close MealDeck announcement"');
    expect(banner).toContain("window.setTimeout(() => setVisible(false), 8_000)");
    expect(banner).toContain('pathname === "/" || pathname === "/luton" || pathname === "/offers"');
    expect(banner).toContain("window.sessionStorage.setItem(MEMBER_NOTICE_SESSION_KEY");
    expect(css).toContain(".md-member-popup {");
    expect(css).toContain("position: fixed;");
    expect(css).toContain("max-height: min(55dvh, 300px);");
  });

  test("central mobile Order Now control keeps its logo without decorative burgers", () => {
    const tabs = source("src/components/mobile-tab-bar.tsx");
    expect(tabs).toContain('<MealDeckLogo decorative className="h-8 w-8" />');
    expect(tabs).toContain('aria-label="Order Now — browse MealDeck menus"');
    expect(tabs).not.toContain("suitArtwork.burger");
  });

  test("one-tap checkout remains attached to the existing validated handoff", () => {
    const nav = source("src/components/menus/launch-menu-app-nav.tsx");
    const browser = source("src/components/menus/launch-menu-browser.tsx");
    const css = source("src/styles.launch-app.css");
    expect(nav).toContain('className="lma-tab lma-tab-checkout"');
    expect(nav).toContain('to="/checkout"');
    expect(nav).toContain("count > 0 && (");
    expect(nav).toContain("onClick={onCheckout}");
    expect(browser).toContain("onCheckout={proceedToCheckout}");
    expect(browser).toContain("prepareLaunchCheckout(live.picks, live)");
    expect(browser).toContain("launchItemGroups(entry.brand, entry.item).length === 0");
    expect(css).toContain('grid-template-columns: repeat(5, minmax(0, 1fr));');
  });
});
