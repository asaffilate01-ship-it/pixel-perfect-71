import { describe, expect, test } from "bun:test";
import { posts } from "../src/lib/blog";
import {
  DOUBLE_POINTS_CAMPAIGN,
  MEALDECK_OFFERS,
  MEALDECK_OFFERS_TIME_ZONE,
  MILK_CAKE_CAMPAIGN,
} from "../src/lib/mealdeck-offers";
import {
  OPENING_OFFER_PERCENT,
  openingOfferDiscountPence,
} from "../src/lib/mealdeck-opening-offer";

describe("The three approved November MealDeck offers", () => {
  test("publishes exactly the three approved campaigns, with the opening offer first", () => {
    expect(MEALDECK_OFFERS.map((offer) => offer.id)).toEqual([
      "opening-weekend",
      "sunday-milk-cake",
      "double-points",
    ]);
    expect(new Set(MEALDECK_OFFERS.map((offer) => offer.id)).size).toBe(3);
    expect(MEALDECK_OFFERS_TIME_ZONE).toBe("Europe/London");
    expect(MEALDECK_OFFERS.every((offer) => offer.terms.length > 0)).toBe(true);
  });

  test("keeps the 30% entire-menu offer aligned with the existing discount contract", () => {
    const opening = MEALDECK_OFFERS[0]!;
    expect(opening.value).toBe(`${OPENING_OFFER_PERCENT}%`);
    expect(opening.startsOn).toBe("2026-11-06");
    expect(opening.throughDate).toBe("2026-11-08");
    expect(opening.audience).toBe("Guests and members");
    expect(opening.terms.join(" ")).toContain("No minimum order value");
    expect(openingOfferDiscountPence(1500)).toBe(450);
  });

  test("publishes 99p after the included 30% discount while keeping pricing server-owned", () => {
    expect(MILK_CAKE_CAMPAIGN.pricePence).toBe(99);
    expect(MILK_CAKE_CAMPAIGN.requiresOrder).toBe(true);
    expect(MILK_CAKE_CAMPAIGN.date).toBe("2026-11-08");
    expect(MILK_CAKE_CAMPAIGN.registrationRequired).toBe(false);
    expect(MILK_CAKE_CAMPAIGN.pricingAuthority).toBe("server");
    const cake = MEALDECK_OFFERS.find((offer) => offer.id === "sunday-milk-cake")!;
    expect(cake.startsOn).toBe(cake.throughDate);
    expect(cake.description).toContain("with every order");
    expect(cake.description).toContain("T&Cs apply");
    expect(cake.terms.join(" ")).toContain("One milkcake per order is 99p after the 30% discount");
    expect(cake.terms.join(" ")).toContain("already includes this discount");
    expect(cake.terms.join(" ")).toContain(
      "Additional milkcakes are £3.99 each before the usual 30% discount",
    );
    expect(cake.terms.join(" ")).not.toMatch(/£1\.29|£1\.41|minimum spend/i);
    expect(cake.terms).toContain(
      "Available during Sunday's opening hours, 3pm–11pm, for Luton collection or kerbside pickup.",
    );
    expect("flavour" in MILK_CAKE_CAMPAIGN).toBe(false);
    expect(MILK_CAKE_CAMPAIGN.maximumPerOrder).toBe(1);
    expect(MILK_CAKE_CAMPAIGN.additionalPricePence).toBe(399);
  });

  test("limits double points to Monday 9 through Friday 13 November, inclusive in the UK", () => {
    expect(DOUBLE_POINTS_CAMPAIGN.startsOn).toBe("2026-11-09");
    expect(DOUBLE_POINTS_CAMPAIGN.throughDate).toBe("2026-11-13");
    const start = Date.parse(DOUBLE_POINTS_CAMPAIGN.startsAtInclusive);
    const end = Date.parse(DOUBLE_POINTS_CAMPAIGN.endsAtExclusive);
    expect(Date.parse("2026-11-08T23:59:59.999+00:00")).toBeLessThan(start);
    expect(Date.parse("2026-11-09T00:00:00+00:00")).toBe(start);
    expect(Date.parse("2026-11-13T00:00:00+00:00")).toBeLessThan(end);
    expect(Date.parse("2026-11-13T23:59:59.999+00:00")).toBeLessThan(end);
    expect(Date.parse("2026-11-14T00:00:00+00:00")).toBe(end);
    expect(end - start).toBe(5 * 24 * 60 * 60 * 1_000);
    const offer = MEALDECK_OFFERS.find((entry) => entry.id === "double-points")!;
    expect(offer.startsOn).toBe(DOUBLE_POINTS_CAMPAIGN.startsOn);
    expect(offer.throughDate).toBe(DOUBLE_POINTS_CAMPAIGN.throughDate);
    expect(offer.dateLabel).toBe("Monday 9 – Friday 13 November 2026, inclusive");
  });

  test("records the member threshold and multiplier without inventing earning rules or consent", () => {
    expect(DOUBLE_POINTS_CAMPAIGN.minimumSpendPence).toBe(1500);
    expect(DOUBLE_POINTS_CAMPAIGN.multiplier).toBe(2);
    expect(DOUBLE_POINTS_CAMPAIGN.registrationRequired).toBe(true);
    expect(DOUBLE_POINTS_CAMPAIGN.marketingOptInRequired).toBe(false);
    expect(DOUBLE_POINTS_CAMPAIGN.basePointsPerPound).toBeNull();
    expect(DOUBLE_POINTS_CAMPAIGN.minimumSpendBasis).toBeNull();
    expect(DOUBLE_POINTS_CAMPAIGN.automaticAwardsEnabled).toBe(false);
  });

  test("removes retired deals and unapproved loyalty promises from the published blog", () => {
    const publicCopy = JSON.stringify(posts);
    expect(publicCopy).not.toMatch(
      /Burger Ace|Perfect Pair|Group Hand|Three-Brand Trifecta|Loyalty Flush|10×|£5 off|one deal per order|points from every order/i,
    );
    const explainer = posts.find((post) => post.slug === "house-rules-every-offer-explained")!;
    for (const offer of MEALDECK_OFFERS) {
      expect(explainer.body.some((section) => section.p === offer.terms.join(" "))).toBe(true);
    }
  });
});
