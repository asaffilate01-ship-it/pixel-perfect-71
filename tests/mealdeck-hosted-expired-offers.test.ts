import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("MealDeck hosted marketing after 8 November 2026", () => {
  test("current offers page has no three expired/unapproved active campaigns", () => {
    const offers = source("src/routes/offers.tsx");
    expect(offers).toContain("opening-weekend 30% discount and Sunday 99p milkcake promotion have ended");
    expect(offers).not.toMatch(/Double loyalty points|Join for double points|£15 or more from Monday 9/);
    expect(offers).toContain('to="/opening-offer"');
    expect(offers).toContain('to="/account"');
  });

  test("homepage and offer cards promote only the actual member earning policy", () => {
    const home = source("src/routes/index.tsx");
    const cards = source("src/components/marketing/offer-discovery.tsx");
    expect(home).not.toMatch(/Double points offer|double loyalty points|30% off the entire menu during our 6–8 November/);
    expect(cards).toContain("one point per complete £1");
    expect(cards).not.toContain("MEALDECK_OFFERS.map");
    expect(cards).not.toMatch(/Register for\s+double loyalty points/);
  });

  test("server-offer uncertainty fails closed rather than showing an expired 30% advert", () => {
    const offer = source("src/components/opening-weekend-offer.tsx");
    expect(offer).toContain('offer.status !== "active" && offer.status !== "upcoming"');
    expect(offer).toContain("Opening weekend has finished.");
  });
});
