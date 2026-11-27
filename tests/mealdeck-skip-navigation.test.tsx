import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { SkipToMainContent } from "../src/components/skip-to-main-content";
const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
const tabs = readFileSync(new URL("../src/components/mobile-tab-bar.tsx", import.meta.url), "utf8");

describe("MealDeck keyboard navigation", () => {
  test("provides one visible-on-focus link to real page content", () => {
    const html = renderToStaticMarkup(<SkipToMainContent />);
    expect(html).toContain('href="#mealdeck-main"');
    expect(html).toContain("Skip to main content");
  });
  test("main target is rendered around all nested site routes", () => {
    expect(root).toContain('id="mealdeck-main"');
    expect(root).toContain("tabIndex={-1}");
    expect(root).toContain("<Outlet />");
    expect(root).toContain("<SkipToMainContent />");
  });
  test("mobile navigation labels ordering without restricting delivery and shows the active page", () => {
    expect(tabs).toContain("Click Here to Order — browse MealDeck menus");
    expect(tabs).toContain("<span>Click</span>");
    expect(tabs).toContain("<span>Here to</span>");
    expect(tabs).toMatch(/<span[^>]*>Order<\/span>/);
    expect(tabs).not.toContain("MealDeckLogo");
    expect(tabs).not.toContain("rotate-[-6deg]");
    expect(tabs).toMatch(/to="\/menus"\s+aria-label="Click Here to Order/);
    expect(tabs).toContain('aria-current={dealActive ? "page" : undefined}');
    expect(tabs).toContain("focus-visible:outline");
    expect(tabs).toContain('{ label: "Account", to: "/account", icon: UserRound }');
    expect(tabs).toContain("isMealDeckNavCurrent(pathname, hash, t)");
    expect(tabs).not.toContain('{ label: "Track", to: "/track"');
  });
});


test("site navigation keeps customer accounts visible and game copy truthful", () => {
  const header=readFileSync(new URL("../src/components/site-header.tsx", import.meta.url), "utf8");
  const footer=readFileSync(new URL("../src/components/site-footer.tsx", import.meta.url), "utf8");
  const css=readFileSync(new URL("../src/styles.mealdeck-rebuild.css", import.meta.url), "utf8");
  const desktop=header.slice(header.indexOf('aria-label="Main navigation"'),header.indexOf('className="md-header-actions"'));
  expect(desktop).toContain('to="/account"');
  expect(desktop).toContain("My account");
  expect(header).not.toContain("Play &amp; Rewards");
  expect(footer).not.toContain("Play &amp; Rewards");
  expect(footer).toContain('to="/ops">Staff sign-in');
  expect(header).toContain('aria-controls={menuId}');
  expect(header).toContain('id={menuId} ref={mobileNavRef} hidden={!open}');
  expect(header).toContain('document.removeEventListener("pointerdown", onOutsidePointer)');
  expect(header).toContain('document.removeEventListener("focusin", onFocusOutside)');
  expect(header).toContain('wideScreen.removeEventListener("change", closeOnWideScreen)');
  expect(css).toContain(".md-mobile-nav[hidden] { display: none !important; }");
  expect(css).toContain("@media (max-width: 1180px) {\n  .md-mobile-nav:not([hidden])");
});


test("mobile menu uses the exact complement of the CSS breakpoint and resets when disabled", () => {
  const header = readFileSync(new URL("../src/components/site-header.tsx", import.meta.url), "utf8");
  expect(header).toContain('window.matchMedia("not all and (max-width: 1180px)")');
  expect(header).toContain("if (!open || !nav) return;");
  expect(header).toContain("[pathname, hash, nav]");
  expect(header).toContain("[open, nav]");
});
