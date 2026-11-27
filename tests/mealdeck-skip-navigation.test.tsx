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
