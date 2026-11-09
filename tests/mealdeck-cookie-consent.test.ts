import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  MEALDECK_COOKIE_CONSENT_KEY,
  allowsMealDeckOptionalCookies,
  makeMealDeckCookieConsent,
  parseMealDeckCookieConsent,
} from "../src/lib/mealdeck-cookie-consent";

describe("MealDeck first-visit privacy choices", () => {
  test("no consent means analytics and marketing are both denied", () => {
    expect(parseMealDeckCookieConsent(null)).toBeNull();
    expect(allowsMealDeckOptionalCookies(null, "analytics")).toBe(false);
    expect(allowsMealDeckOptionalCookies(null, "marketing")).toBe(false);
  });

  test("accept, reject and custom choices remain independent", () => {
    const at = new Date("2026-11-09T13:00:00Z");
    const rejected = makeMealDeckCookieConsent(false, false, at);
    expect(parseMealDeckCookieConsent(JSON.stringify(rejected))).toEqual(rejected);
    expect(allowsMealDeckOptionalCookies(rejected, "analytics")).toBe(false);
    expect(allowsMealDeckOptionalCookies(rejected, "marketing")).toBe(false);
    expect(allowsMealDeckOptionalCookies(makeMealDeckCookieConsent(true, false, at), "analytics")).toBe(true);
    expect(allowsMealDeckOptionalCookies(makeMealDeckCookieConsent(true, false, at), "marketing")).toBe(false);
    expect(allowsMealDeckOptionalCookies(makeMealDeckCookieConsent(true, true, at), "marketing")).toBe(true);
    expect(MEALDECK_COOKIE_CONSENT_KEY).toContain("consent");
  });

  test("forged or invalid choice never authorises tracking", () => {
    expect(parseMealDeckCookieConsent('{"version":1,"analytics":"yes","marketing":true,"savedAt":"2026-11-09T13:00:00Z"}')).toBeNull();
    expect(parseMealDeckCookieConsent('{"version":2,"analytics":true,"marketing":true,"savedAt":"2026-11-09T13:00:00Z"}')).toBeNull();
    expect(parseMealDeckCookieConsent("not-json")).toBeNull();
    expect(() => makeMealDeckCookieConsent(true, true, new Date(Number.NaN))).toThrow();
  });

  test("choices appear only on public routes and can be revisited from footer", () => {
    const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
    const footer = readFileSync(new URL("../src/components/site-footer.tsx", import.meta.url), "utf8");
    const banner = readFileSync(new URL("../src/components/mealdeck-cookie-choices.tsx", import.meta.url), "utf8");
    expect(root).toContain("!internal && <MealDeckCookieChoices />");
    expect(footer).toContain("Cookie settings");
    expect(footer).toContain("MEALDECK_OPEN_COOKIE_SETTINGS");
    expect(banner).toContain("Reject optional");
    expect(banner).toContain("Customise");
    expect(banner).toContain("Accept optional");
    expect(banner).toContain("No optional scripts are loaded here");
  });
});
