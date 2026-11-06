import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  MEALDECK_CLOUD_ORIGIN, MEALDECK_CLOUD_PROJECT, withMealDeckCloudConnection,
} from "../src/lib/mealdeck-cloud-connection";
import { readMealDeckBackendConfig, readMealDeckRuntimeConfig, readMealDeckCheckoutServerKey } from "../src/lib/mealdeck-runtime-config";
const cloud = {
  projectId: MEALDECK_CLOUD_PROJECT, url: MEALDECK_CLOUD_ORIGIN,
  publishableKey: "sb_publishable_mealdeck_public_fixture_only",
};
describe("explicit installed MealDeck Cloud connection", () => {
  test("uses only the approved complete public pair and installed kitchen mapping", () => {
    const original = Object.freeze({ OTHER_SETTING: "preserved" });
    const env = withMealDeckCloudConnection(original, cloud);
    expect(readMealDeckBackendConfig(env).status).toBe("ready");
    const runtime = readMealDeckRuntimeConfig(env, "luton")!;
    expect(runtime.url).toBe(MEALDECK_CLOUD_ORIGIN);
    expect(runtime.tenantId).toBe("94f97f02-70ec-445a-87a4-b51c0956d193");
    expect(runtime.locationId).toBe("a0ba64ac-e268-44d3-8345-fce8d24999b6");
    expect(env.OTHER_SETTING).toBe("preserved");
    expect(original).toEqual({ OTHER_SETTING: "preserved" });
    expect(readMealDeckRuntimeConfig(env, "stalbans")).toBeNull();
    expect(readMealDeckCheckoutServerKey(env, runtime)).toBeNull();
    for (const flag of ["MEALDECK_ONLINE_CHECKOUT_ENABLED", "MEALDECK_CHECKOUT_INTEGRATION_APPROVED", "MEALDECK_AUTH_EMAIL_ENABLED", "MEALDECK_STRIPE_SECRET_KEY"])
      expect(env[flag]).toBeUndefined();
  });
  test("does not adopt other projects, incomplete pairs, privileged keys or lookalike origins", () => {
    for (const input of [
      {}, { ...cloud, projectId: "anotherproject" }, { ...cloud, url: "https://anotherproject.supabase.co" },
      { ...cloud, url: MEALDECK_CLOUD_ORIGIN + ".evil.example" },
      { ...cloud, url: MEALDECK_CLOUD_ORIGIN + "/auth" },
      { ...cloud, publishableKey: undefined }, { ...cloud, publishableKey: "sb_secret_private_fixture_not_public" },
      { ...cloud, publishableKey: "eyJinvalid.jwt.here" },
    ]) expect(readMealDeckBackendConfig(withMealDeckCloudConnection({}, input)).status).toBe("unconfigured");
  });
  test("explicit or legacy conflict is never repaired by silently changing projects", () => {
    for (const env of [
      { MEALDECK_SUPABASE_URL: MEALDECK_CLOUD_ORIGIN },
      { MEALDECK_SUPABASE_PUBLISHABLE_KEY: cloud.publishableKey },
      { DISHBEE_SUPABASE_URL: "https://dishbeefixture.supabase.co" },
      { VITE_MEALDECK_OPS_SUPABASE_URL: MEALDECK_CLOUD_ORIGIN },
      { MEALDECK_SUPABASE_URL: MEALDECK_CLOUD_ORIGIN, MEALDECK_SUPABASE_PUBLISHABLE_KEY: cloud.publishableKey, DISHBEE_SUPABASE_URL: "https://dishbeefixture.supabase.co" },
    ]) {
      expect(withMealDeckCloudConnection(env, cloud)).toBe(env);
      expect(readMealDeckBackendConfig(env).status).toBe("unconfigured");
    }
  });
  test("explicit alternate environments remain entirely independent", () => {
    const env = { MEALDECK_SUPABASE_URL: "https://stagingfixture.supabase.co", MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_staging_fixture_only" };
    expect(withMealDeckCloudConnection(env, cloud)).toBe(env);
    expect(readMealDeckBackendConfig(env).status).toBe("ready");
    expect(readMealDeckRuntimeConfig(env, "luton")).toBeNull();
  });
  test("does not combine the installed kitchen with conflicting explicit tenant/location scope", () => {
    for (const env of [
      { MEALDECK_TENANT_ID: "00000000-0000-4000-8000-000000000001" },
      { MEALDECK_LUTON_TENANT_ID: "00000000-0000-4000-8000-000000000001" },
      { MEALDECK_LUTON_LOCATION_ID: "00000000-0000-4000-8000-000000000001" },
    ]) expect(readMealDeckRuntimeConfig(withMealDeckCloudConnection(env, cloud), "luton")).toBeNull();
  });
  test("public response never spreads private server configuration", () => {
    const env = withMealDeckCloudConnection({ RESEND_API_KEY: "fixture-secret", MEALDECK_CHECKOUT_SERVER_KEY: "fixture-private" }, cloud);
    const response = JSON.stringify(readMealDeckBackendConfig(env));
    expect(response).not.toContain("fixture-secret");
    expect(response).not.toContain("fixture-private");
    expect(response).not.toContain("MEALDECK_TENANT_ID");
    expect(readFileSync("src/lib/mealdeck-backend.functions.ts", "utf8")).toContain('"no-store, private"');
  });
  test("customer, KDS, printer and server payment entrypoints use the same reviewed adapter", () => {
    for (const path of ["src/lib/mealdeck-backend.functions.ts", "src/lib/dishbee.functions.ts", "src/lib/mealdeck-opening-offer.functions.ts", ...["checkout", "group-orders", "group-payments", "terminal", "stripe.webhook", "auth.email", "ops.integrations"].map((s) => `src/routes/api.${s}.ts`)]) {
      expect(readFileSync(path, "utf8")).toContain("mealDeckDeploymentEnv()");
    }
  });
});
