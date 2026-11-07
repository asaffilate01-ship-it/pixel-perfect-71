import { describe, expect, test } from "bun:test";
import {
  isMealDeckLaunchFulfilment,
  isMealDeckLaunchLocation,
  MEALDECK_LAUNCH_LOCATIONS,
  MEALDECK_LAUNCH_FULFILMENTS,
} from "../src/lib/mealdeck-launch-locations";
import { readMealDeckRuntimeConfig } from "../src/lib/mealdeck-runtime-config";
import { resolveDishbeeServiceability } from "../src/lib/mealdeck-dishbee-contract";
import { lutonBusiness, orgJsonLd, stAlbansPageJsonLd } from "../src/lib/seo";
import { marketingBrands } from "../src/lib/marketing-brands";
import { getLaunchMenuBrand } from "../src/lib/launch-menu-catalogue";

describe("the first MealDeck launch is Luton only", () => {
  test("the Luton marketing collection resolves all five brands, including the Skorch alias", () => {
    const displayed = marketingBrands.filter((brand) => !!getLaunchMenuBrand(brand.id));
    expect(displayed.map((brand) => getLaunchMenuBrand(brand.id)!.id).sort()).toEqual(
      ["skorch-burgers", "tavo-chicken", "souvano", "loadd", "moktl"].sort(),
    );
    expect(displayed.find((brand) => brand.id === "skorch")?.name).toBe("Skorch");
  });

  test("only the exact Luton key is admitted; future and malformed locations stay closed", () => {
    expect(MEALDECK_LAUNCH_LOCATIONS).toEqual(["luton"]);
    expect(isMealDeckLaunchLocation("luton")).toBe(true);
    for (const location of ["stalbans", "bedford", "Luton", " luton", "", null, undefined, {}]) {
      expect(isMealDeckLaunchLocation(location)).toBe(false);
    }
  });

  test("legacy fulfilment identifiers remain scoped to Luton, with no dine-in route", () => {
    expect(MEALDECK_LAUNCH_FULFILMENTS).toEqual(["delivery", "pickup", "curbside"]);
    for (const fulfilment of MEALDECK_LAUNCH_FULFILMENTS) {
      expect(isMealDeckLaunchFulfilment("luton", fulfilment)).toBe(true);
      expect(isMealDeckLaunchFulfilment("stalbans", fulfilment)).toBe(false);
      expect(isMealDeckLaunchFulfilment("bedford", fulfilment)).toBe(false);
    }
    for (const fulfilment of ["dinein", "walkin", "kerbside", null, undefined]) {
      expect(isMealDeckLaunchFulfilment("luton", fulfilment)).toBe(false);
    }
  });

  test("valid future environment bindings remain available but cannot authorize customer service", () => {
    const tenantId = "10000000-0000-4000-8000-000000000001";
    const locationId = "20000000-0000-4000-8000-000000000002";
    const configured = readMealDeckRuntimeConfig(
      {
        MEALDECK_SUPABASE_URL: "https://mealdeckexampleabcde.supabase.co",
        MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_not_a_real_key",
        MEALDECK_TENANT_ID: tenantId,
        MEALDECK_LUTON_LOCATION_ID: "20000000-0000-4000-8000-000000000001",
        MEALDECK_STALBANS_LOCATION_ID: locationId,
      },
      "stalbans",
    );
    expect(configured?.locationId).toBe(locationId);
    expect(
      resolveDishbeeServiceability(
        {
          served: true,
          tenant_id: tenantId,
          location_id: locationId,
          channel_open: true,
          town: "Luton",
          message: "Open for orders",
        },
        [{ location: "stalbans", tenantId, locationId }],
      ),
    ).toMatchObject({ served: false });
  });

  test("St Albans is a coming-soon page, without an active restaurant or service claims", () => {
    expect(stAlbansPageJsonLd["@type"]).toBe("WebPage");
    expect(stAlbansPageJsonLd.name).toContain("Coming soon");
    expect(stAlbansPageJsonLd.description).toContain("confirmed separately");
    expect(stAlbansPageJsonLd.url).toBe("https://mealdeck.co.uk/st-albans");
    for (const claim of [
      "potentialAction",
      "openingHoursSpecification",
      "specialOpeningHoursSpecification",
      "areaServed",
      "hasMenu",
    ])
      expect(stAlbansPageJsonLd).not.toHaveProperty(claim);
    expect(
      orgJsonLd["@graph"]
        .filter((entry) => entry["@type"] === "Restaurant")
        .map((entry) => entry.url),
    ).toEqual(["https://mealdeck.co.uk/luton"]);
  });

  test("Luton describes launch cuisines and dated hours without asserting live ordering", () => {
    expect(lutonBusiness.servesCuisine).toEqual([
      "Smash burgers",
      "Chicken",
      "Greek",
      "Turkish",
      "Loaded fries",
      "Mac and cheese",
      "Mocktails",
    ]);
    expect(lutonBusiness.hasMenu).toBe("https://mealdeck.co.uk/menus");
    expect(lutonBusiness).not.toHaveProperty("potentialAction");
    expect(lutonBusiness).not.toHaveProperty("openingHoursSpecification");
    expect(
      lutonBusiness.specialOpeningHoursSpecification.map((hours) => [
        hours.validFrom,
        hours.validThrough,
        hours.opens,
        hours.closes,
      ]),
    ).toEqual([
      ["2026-11-06", "2026-11-06", "15:00:00", "00:00:00"],
      ["2026-11-07", "2026-11-07", "13:00:00", "00:00:00"],
      ["2026-11-08", "2026-11-08", "13:00:00", "23:00:00"],
    ]);
  });
});
