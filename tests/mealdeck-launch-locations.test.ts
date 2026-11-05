import { describe, expect, test } from "bun:test";
import {
  isMealDeckLaunchFulfilment,
  isMealDeckLaunchLocation,
  MEALDECK_LAUNCH_LOCATIONS,
  MEALDECK_LAUNCH_FULFILMENTS,
} from "../src/lib/mealdeck-launch-locations";
import { readMealDeckRuntimeConfig } from "../src/lib/mealdeck-runtime-config";
import { resolveDishbeeServiceability } from "../src/lib/mealdeck-dishbee-contract";
import { lutonBusiness, stAlbansBusiness } from "../src/lib/seo";
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

  test("delivery, walk-in pickup and kerbside are scoped to Luton, with no dine-in route", () => {
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

  test("future structured data makes no order, coverage or opening-hours claim", () => {
    expect(stAlbansBusiness.description).toContain("future deck");
    expect(stAlbansBusiness).not.toHaveProperty("potentialAction");
    expect(stAlbansBusiness).not.toHaveProperty("openingHoursSpecification");
    expect(stAlbansBusiness).not.toHaveProperty("areaServed");
    expect(stAlbansBusiness).not.toHaveProperty("hasMenu");
  });

  test("Luton structured data describes only the five launch brands and keeps ordering closed", () => {
    expect(lutonBusiness.servesCuisine).toEqual([
      "Smash burgers",
      "Chicken",
      "Mediterranean grill",
      "Loaded fries",
      "Mac and cheese",
      "Mocktails",
    ]);
    expect(lutonBusiness.hasMenu).toBe("https://mealdeck.co.uk/menus");
    expect(lutonBusiness).not.toHaveProperty("potentialAction");
    expect(lutonBusiness).not.toHaveProperty("openingHoursSpecification");
  });
});
