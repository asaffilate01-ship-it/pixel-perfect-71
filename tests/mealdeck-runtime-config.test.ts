import { describe, expect, test } from "bun:test";
import { readMealDeckRuntimeConfig } from "../src/lib/mealdeck-runtime-config";

const shared = {
  DISHBEE_SUPABASE_URL: "https://example.supabase.co",
  DISHBEE_SUPABASE_ANON_KEY: "public-test-key",
  MEALDECK_TENANT_ID: "one-mealdeck-tenant",
  MEALDECK_LUTON_LOCATION_ID: "luton-kitchen",
  MEALDECK_STALBANS_LOCATION_ID: "st-albans-kitchen",
};

describe("MealDeck tenant and location configuration", () => {
  test("binds both kitchens to the same canonical Dishbee tenant", () => {
    const luton = readMealDeckRuntimeConfig(shared, "luton");
    const stAlbans = readMealDeckRuntimeConfig(shared, "stalbans");
    expect(luton?.tenantId).toBe("one-mealdeck-tenant");
    expect(stAlbans?.tenantId).toBe(luton?.tenantId);
    expect(luton?.locationId).toBe("luton-kitchen");
    expect(stAlbans?.locationId).toBe("st-albans-kitchen");
  });

  test("accepts matching legacy identifiers during controlled migration", () => {
    const { MEALDECK_TENANT_ID, ...withoutCanonical } = shared;
    expect(MEALDECK_TENANT_ID).toBeTruthy();
    const env = {
      ...withoutCanonical,
      MEALDECK_LUTON_TENANT_ID: "legacy-shared",
      MEALDECK_STALBANS_TENANT_ID: "legacy-shared",
    };
    expect(readMealDeckRuntimeConfig(env, "luton")?.tenantId).toBe("legacy-shared");
    expect(readMealDeckRuntimeConfig(env, "stalbans")?.tenantId).toBe("legacy-shared");
  });

  test("rejects conflicting legacy or canonical tenant IDs", () => {
    const mismatch = {
      ...shared,
      MEALDECK_LUTON_TENANT_ID: "luton-as-independent-tenant",
      MEALDECK_STALBANS_TENANT_ID: "st-albans-as-independent-tenant",
    };
    expect(readMealDeckRuntimeConfig(mismatch, "luton")).toBeNull();
    expect(readMealDeckRuntimeConfig(mismatch, "stalbans")).toBeNull();
    expect(readMealDeckRuntimeConfig({
      ...shared,
      MEALDECK_LUTON_TENANT_ID: "foreign-tenant",
    }, "luton")).toBeNull();
  });

  test("rejects duplicate location IDs instead of cross-routing orders", () => {
    const sameKitchen = {
      ...shared,
      MEALDECK_STALBANS_LOCATION_ID: "luton-kitchen",
    };
    expect(readMealDeckRuntimeConfig(sameKitchen, "luton")).toBeNull();
    expect(readMealDeckRuntimeConfig(sameKitchen, "stalbans")).toBeNull();
  });

  test("fails closed on incomplete database credentials or location mapping", () => {
    expect(readMealDeckRuntimeConfig({
      ...shared,
      DISHBEE_SUPABASE_ANON_KEY: "",
    }, "luton")).toBeNull();
    expect(readMealDeckRuntimeConfig({
      ...shared,
      MEALDECK_STALBANS_LOCATION_ID: "",
    }, "stalbans")).toBeNull();
    expect(readMealDeckRuntimeConfig({
      ...shared,
      MEALDECK_TENANT_ID: "",
    }, "luton")).toBeNull();
  });

  test("supports staged location rollout without guessing the missing location", () => {
    const partial = {
      ...shared,
      MEALDECK_STALBANS_LOCATION_ID: "",
    };
    expect(readMealDeckRuntimeConfig(partial, "luton")?.locationId).toBe("luton-kitchen");
    expect(readMealDeckRuntimeConfig(partial, "stalbans")).toBeNull();
  });
});
