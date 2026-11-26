import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("MealDeck hosted marketing after 8 November 2026", () => {
  test("current offers page has no three expired/unapproved active campaigns", () => {
    const offers = source("src/routes/offers.tsx");
    expect(offers).not.toMatch(/opening.weekend|99p|30% off/i);
    expect(offers).toContain("£1 paid = 1 loyalty point.");
    expect(offers).not.toMatch(/Double loyalty points|Join for double points|£15 or more from Monday 9/);
    expect(offers).not.toContain('to="/opening-offer"');
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

  test("evergreen public surfaces do not render or link to the retired campaign", () => {
    for (const path of ["src/routes/index.tsx", "src/routes/meta-ad.tsx", "src/components/site-footer.tsx", "src/components/marketing/offer-discovery.tsx"]) {
      expect(source(path)).not.toMatch(/OpeningWeekendOffer|opening.weekend|6–8 November|99p|double loyalty points/i);
    }
    expect(source("src/routes/opening-offer.tsx")).toContain('redirect({ to: "/offers", statusCode: 301');
    expect(source("src/lib/mealdeck-sitemap.ts")).not.toContain('"/opening-offer"');
  });

  test("server-offer uncertainty fails closed rather than showing an expired 30% advert", () => {
    const offer = source("src/components/opening-weekend-offer.tsx");
    expect(offer).toContain('offer.status !== "active" && offer.status !== "upcoming"');
    expect(offer).toContain("Opening weekend has finished.");
  });
});


describe("Evergreen privacy and checkout communication", () => {
  test("privacy notice matches the 20-minute basket, device favourites and separate consent choices", () => {
    const privacy = source("src/routes/privacy.tsx");
    expect(privacy).toContain("20 minutes after each quantity is added");
    expect(privacy).toContain("Clear all");
    expect(privacy).toContain("SMS or WhatsApp messages");
    expect(privacy).not.toMatch(/6–8 November|double-points offer|five minutes after each quantity/i);
  });
  test("guest and registration help does not advertise expired launch promotions", () => {
    expect(source("src/components/launch-checkout.tsx")).not.toContain("applies during launch hours");
    expect(source("src/lib/mealdeck-customer-browser.ts")).not.toContain("Email registration opens at 1pm Monday 9 November");
  });
});


describe("Current ordering guides and location pages", () => {
  test("first-order guide provides three mutually exclusive methods without changing checkout", () => {
    const guide = source("src/routes/meta-ad.tsx");
    expect(guide).toContain('useState<"pickup" | "curbside" | "delivery">("pickup")');
    expect(guide).toContain('aria-pressed={method === "pickup"}');
    expect(guide).toContain('aria-pressed={delivery}');
    expect(guide).toContain('onClick={() => setMethod("delivery")}');
    expect(guide).toContain("name and WhatsApp number");
    expect(guide).toContain("£15 minimum after discounts");
    expect(guide).not.toContain("name, email and mobile number");
    expect(guide).not.toContain("setDeliveryNotice");
    expect(guide).toContain('delivery ? deliveryMilestones : collectionMilestones');
  });
  test("location marketing no longer describes Luton as a launch", () => {
    for (const path of ["src/routes/luton.tsx", "src/routes/st-albans.tsx", "src/routes/bedford.tsx", "src/components/location-page.tsx", "src/lib/seo.ts"]) {
      expect(source(path)).not.toMatch(/Luton launches\s+first|launching in Luton first|first launch kitchen|Luton launch deck|Luton’s launch menus/i);
    }
  });
});

test("blog landing SEO no longer promotes the expired campaigns", () => {
  expect(source("src/routes/blog.index.tsx")).not.toMatch(/three November offers|five launch menus/i);
  expect(source("src/routes/blog.$slug.tsx")).toContain("dateModified: loaderData.updatedAt ?? loaderData.date");
});
