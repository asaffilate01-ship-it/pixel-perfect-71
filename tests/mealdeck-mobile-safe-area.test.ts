import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("Samsung / Android installed PWA bottom safe area", () => {
  test("all customer surfaces share a standalone fallback alongside the reported device inset", () => {
    const shared = source("src/styles.pwa.css");
    const shell = source("src/routes/__root.tsx");
    expect(shared).toContain("--md-mobile-safe-bottom: max(");
    expect(shared).toContain("env(safe-area-inset-bottom, 0px)");
    expect(shared).toContain("(display-mode: standalone) and (pointer: coarse)");
    expect(shared).toContain("--md-standalone-navigation-fallback: 32px");
    expect(shell).toContain("viewport-fit=cover");
  });

  test("floating site tabs and menu tabs sit above system navigation and reserve scroll clearance", () => {
    const tabs = source("src/components/mobile-tab-bar.tsx");
    const menu = source("src/styles.launch-app.css");
    expect(tabs).toContain('height: "calc(116px + var(--md-mobile-safe-bottom))"');
    expect(tabs).toContain('bottom: "calc(12px + var(--md-mobile-safe-bottom))"');
    expect(menu).toContain("height: calc(86px + var(--md-mobile-safe-bottom));");
    expect(menu).toContain("bottom: var(--md-mobile-safe-bottom);");
    expect(menu).not.toContain("calc(8px + env(safe-area-inset-bottom, 0px))");
  });

  test("basket dialogs and fixed order dock can reach their final buttons on short phones", () => {
    const basket = source("src/styles.launch-basket.css");
    const menu = source("src/styles.launch-app.css");
    const legacy = source("src/styles.launch-menus.css");
    expect(basket).toContain("bottom: calc(12px + var(--md-mobile-safe-bottom))");
    expect(basket).toContain("bottom: var(--md-mobile-safe-bottom)");
    expect(basket).toContain(
      "max-height: calc(100dvh - max(12px, env(safe-area-inset-top, 0px)) - var(--md-mobile-safe-bottom))",
    );
    expect(menu).toContain(
      "max-height: calc(100dvh - max(12px, env(safe-area-inset-top, 0px)) - var(--md-mobile-safe-bottom))",
    );
    expect(legacy).toContain("padding-bottom: calc(100px + var(--md-mobile-safe-bottom))");
  });

  test("account settings, driver handoff and auxiliary controls keep space below their last action", () => {
    const account = source("src/styles.customer-account.css");
    const driver = source("src/components/driver/driver-workspace.css");
    const site = source("src/styles.css");
    const marketing = source("src/styles.mealdeck-rebuild.css");
    expect(account).toContain("padding-bottom: calc(128px + var(--md-mobile-safe-bottom))");
    expect(driver).toContain("padding:22px 14px calc(96px + var(--md-mobile-safe-bottom))");
    expect(site).toContain("bottom: calc(7.5rem + var(--md-mobile-safe-bottom))");
    expect(marketing).toContain("padding-bottom: max(20px, var(--md-mobile-safe-bottom))");
  });
});
