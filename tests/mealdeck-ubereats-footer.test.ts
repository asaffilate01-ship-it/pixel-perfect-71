import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const footer = readFileSync(new URL("../src/components/site-footer.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.mealdeck-rebuild.css", import.meta.url), "utf8");

describe("MealDeck Luton ordering links in the footer", () => {
  test("Uber Eats opens the specific Luton store without personal search-location parameters", () => {
    expect(footer).toContain(
      'href="https://www.ubereats.com/gb/store/meal-deck-luton/IWmoPuRPWUW1kbGPDpKswg?diningMode=DELIVERY"',
    );
    expect(footer).toContain('aria-label="Order MealDeck Luton on Uber Eats"');
    const uberLink = footer.match(
      /<a\\s+className="md-app-logo"[^>]*href="https:\\/\\/www\\.ubereats\\.com[^>]*>[\\s\\S]*?<\\/a>/,
    )?.[0];
    expect(uberLink).toBeDefined();
    // A direct user-initiated HTTPS navigation gives verified iOS Universal
    // Links / Android App Links a chance to reach an installed app. Do not
    // force a browser new tab or an unofficial app-only URI with no fallback.
    expect(uberLink).not.toContain('target="_blank"');
    expect(uberLink).not.toContain("onClick=");
    expect(uberLink).not.toContain('href="ubereats://');
    expect(uberLink).toContain('rel="noopener noreferrer"');
    expect(footer).not.toContain("Uber Eats platform website — coming soon");
    expect(footer).not.toContain("Six Car Hire");
    expect(footer).not.toContain("referenceType");
  });
  test("Deliveroo and Just Eat links are not incorrectly advertised as live", () => {
    expect(footer).toContain("Deliveroo platform website — coming soon");
    expect(footer).toContain("Just Eat platform website — coming soon");
  });
  test("linked platform logos have visible keyboard focus", () => {
    expect(styles).toContain(".md-app-logo[href]:focus-visible");
  });
});
