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
