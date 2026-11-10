import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");
const uberStore = "https://www.ubereats.com/gb/store/meal-deck-luton/IWmoPuRPWUW1kbGPDpKswg?diningMode=DELIVERY";

describe("MealDeck Luton real ordering channels", () => {
  test("advertises the approved 4 km and £15 direct delivery policy even when the kitchen is closed", () => {
    const footer = source("src/components/site-footer.tsx");
    const home = source("src/routes/index.tsx");
    const offers = source("src/routes/offers.tsx");
    const luton = source("src/routes/luton.tsx");
    const terms = source("src/routes/delivery-terms.tsx");

    expect(footer).toContain("Free direct delivery within 4 km of LU4 8NU on orders of £15+ after discounts.");
    expect(home).toContain("Free local delivery · Check availability");
    expect(home).toContain("£15+ after discounts");
    expect(offers).toContain("Free direct delivery is offered within 4 km of LU4 8NU");
    expect(luton).toContain("subject to checkout availability");
    expect(terms).toContain("£15.00");
    expect(terms).toContain("4 km straight-line radius");
    expect(footer).not.toContain("Delivery · Coming soon");
    expect(home).not.toContain("Delivery · Coming soon");
    expect(luton).not.toContain("Delivery currently unavailable");
    expect(terms).not.toContain("On Sunday 8 November 2026");
  });

  test("never mistakes permanent service policy for a live authorisation to take payment", () => {
    const live = source("src/components/own-driver-offer-banner.tsx");
    const home = source("src/routes/index.tsx");
    const terms = source("src/routes/delivery-terms.tsx");
    expect(live).toContain('fetch("/api/checkout"');
    expect(live).toContain('result["available"] === true');
    expect(live).toContain('result["fulfilments"].includes("delivery")');
    expect(home).toContain("The kitchen and driver must be accepting deliveries at checkout.");
    expect(terms).toContain("when delivery is shown as available at checkout");
  });

  test("offers Uber Eats without suggesting its fees or orders are governed by direct delivery rules", () => {
    for (const path of [
      "src/routes/index.tsx",
      "src/components/location-page.tsx",
      "src/components/site-footer.tsx",
    ]) {
      const content = source(path);
      expect(content).toContain(uberStore);
      expect(content).toContain('target="_blank"');
      expect(content).toContain('rel="noopener noreferrer"');
      expect(content).not.toContain("Six Car Hire");
    }
    expect(source("src/routes/luton.tsx")).toContain("Uber Eats");
  });

  test("keeps uncommissioned channels and live GPS clearly separated from ordering", () => {
    const home = source("src/routes/index.tsx");
    const track = source("src/routes/track.tsx");
    const luton = source("src/routes/luton.tsx");
    expect(home).toContain("<h4>WhatsApp ordering</h4>");
    expect(home).toContain("live driver GPS tracking is not yet available.");
    expect(track).toContain("Live, turn-by-turn GPS tracking of our driver is still in development.");
    expect(luton).not.toContain("Group ordering starts on Monday 9 November");
  });
});
