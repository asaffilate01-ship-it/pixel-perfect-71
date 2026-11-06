import { describe, expect, test } from "bun:test";
import {
  parseMealDeckPublicBackend,
  readMealDeckBackendConfig,
  readMealDeckCheckoutServerKey,
  readMealDeckRuntimeConfig,
} from "../src/lib/mealdeck-runtime-config";

const projectRef = "mealdeckexampleabcde";
const url = `https://${projectRef}.supabase.co`;
const publicKey = "sb_publishable_mealdeck_test_public_key_only";
const secretKey = "sb_secret_mealdeck_test_secret_key_only";
const tenant = "10000000-0000-4000-8000-000000000001";
const luton = "20000000-0000-4000-8000-000000000001";
const stAlbans = "20000000-0000-4000-8000-000000000002";
const shared = {
  MEALDECK_SUPABASE_URL: url,
  MEALDECK_SUPABASE_PUBLISHABLE_KEY: publicKey,
  MEALDECK_TENANT_ID: tenant,
  MEALDECK_LUTON_LOCATION_ID: luton,
  MEALDECK_STALBANS_LOCATION_ID: stAlbans,
};

// Deliberately unsigned fixtures: parsing only rejects configuration mistakes;
// it never authenticates a token, user, project or payment.
function legacyKey(role: string, ref = projectRef) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: "supabase", role, ref })}.test_signature`;
}

describe("MealDeck independent backend selection", () => {
  test("normalises one explicit pair for server and staff consumers", () => {
    expect(
      readMealDeckBackendConfig({
        ...shared,
        MEALDECK_SUPABASE_URL: ` ${url}/ `,
        MEALDECK_SUPABASE_PUBLISHABLE_KEY: ` ${publicKey} `,
      }),
    ).toEqual({
      status: "ready",
      backend: { schemaVersion: 1, owner: "mealdeck", url, publishableKey: publicKey },
    });
  });

  test("legacy-only and generic Supabase settings never select a project", () => {
    expect(
      readMealDeckBackendConfig({
        DISHBEE_SUPABASE_URL: url,
        DISHBEE_SUPABASE_ANON_KEY: publicKey,
      }),
    ).toMatchObject({ status: "unconfigured", reason: "legacy_only" });
    expect(
      readMealDeckBackendConfig({
        VITE_MEALDECK_OPS_SUPABASE_URL: url,
        VITE_MEALDECK_OPS_SUPABASE_ANON_KEY: publicKey,
      }),
    ).toMatchObject({ status: "unconfigured", reason: "legacy_only" });
    expect(
      readMealDeckBackendConfig({
        SUPABASE_URL: url,
        SUPABASE_ANON_KEY: publicKey,
      }),
    ).toMatchObject({ status: "unconfigured", reason: "missing" });
  });

  test("incomplete primary credentials never borrow either legacy field", () => {
    expect(
      readMealDeckBackendConfig({
        MEALDECK_SUPABASE_URL: url,
        DISHBEE_SUPABASE_ANON_KEY: publicKey,
      }),
    ).toMatchObject({ status: "unconfigured", reason: "incomplete" });
    expect(
      readMealDeckBackendConfig({
        MEALDECK_SUPABASE_PUBLISHABLE_KEY: publicKey,
        VITE_MEALDECK_OPS_SUPABASE_URL: url,
      }),
    ).toMatchObject({ status: "unconfigured", reason: "incomplete" });
  });

  test("matching legacy aliases are harmless during migration", () => {
    expect(
      readMealDeckBackendConfig({
        ...shared,
        DISHBEE_SUPABASE_URL: `${url}/`,
        DISHBEE_SUPABASE_ANON_KEY: publicKey,
        VITE_MEALDECK_OPS_SUPABASE_URL: url,
        VITE_MEALDECK_OPS_SUPABASE_ANON_KEY: publicKey,
      }),
    ).toMatchObject({ status: "ready" });
  });

  test("a stale URL or key rejects the complete selection", () => {
    for (const conflict of [
      { DISHBEE_SUPABASE_URL: "https://otherproject.supabase.co" },
      { DISHBEE_SUPABASE_ANON_KEY: "sb_publishable_other_project_key_here" },
      { VITE_MEALDECK_OPS_SUPABASE_URL: "https://otherproject.supabase.co" },
      { VITE_MEALDECK_OPS_SUPABASE_ANON_KEY: "sb_publishable_other_project_key_here" },
      { VITE_MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_other_project_key_here" },
    ]) {
      expect(readMealDeckBackendConfig({ ...shared, ...conflict })).toMatchObject({
        status: "unconfigured",
        reason: "legacy_conflict",
      });
    }
  });

  test("rejects URL credentials, insecure schemes, paths and request extras", () => {
    for (const bad of [
      "http://localhost:54321",
      `${url}/rest/v1`,
      `${url}?key=secret`,
      `${url}#staff`,
      `https://name:password@${projectRef}.supabase.co`,
      `${url}:8443`,
      "not-a-url",
    ]) {
      expect(readMealDeckBackendConfig({ ...shared, MEALDECK_SUPABASE_URL: bad })).toMatchObject({
        status: "unconfigured",
        reason: "invalid_url",
      });
    }
  });

  test("rejects privileged, user and malformed keys from the public descriptor", () => {
    for (const bad of [
      secretKey,
      legacyKey("service_role"),
      legacyKey("authenticated"),
      "plain-key",
      "sb_publishable_short",
    ]) {
      const result = readMealDeckBackendConfig({
        ...shared,
        MEALDECK_SUPABASE_PUBLISHABLE_KEY: bad,
      });
      expect(result).toMatchObject({ status: "unconfigured", reason: "invalid_public_key" });
      expect(JSON.stringify(result)).not.toContain(bad);
    }
  });

  test("legacy anon JWTs must belong to the configured URL's project", () => {
    expect(
      readMealDeckBackendConfig({
        ...shared,
        MEALDECK_SUPABASE_PUBLISHABLE_KEY: legacyKey("anon"),
      }),
    ).toMatchObject({ status: "ready" });
    expect(
      readMealDeckBackendConfig({
        ...shared,
        MEALDECK_SUPABASE_PUBLISHABLE_KEY: legacyKey("anon", "anotherproject"),
      }),
    ).toMatchObject({
      status: "unconfigured",
      reason: "key_project_mismatch",
    });
  });

  test("public projection never exposes privileged or unrelated environment values", () => {
    const result = readMealDeckBackendConfig({
      ...shared,
      MEALDECK_CHECKOUT_SERVER_KEY: secretKey,
      MEALDECK_QUOTE_SIGNING_SECRET: "private-quote-signing-secret",
    });
    expect(JSON.stringify(result)).not.toContain(secretKey);
    expect(JSON.stringify(result)).not.toContain("private-quote-signing-secret");
    expect(JSON.stringify(result)).not.toContain(tenant);
    expect(
      parseMealDeckPublicBackend({
        schemaVersion: 1,
        owner: "mealdeck",
        url,
        publishableKey: publicKey,
        serverKey: secretKey,
      }),
    ).toEqual({ schemaVersion: 1, owner: "mealdeck", url, publishableKey: publicKey });
  });

  test("staff bootstrap rejects unexpected ownership, schemas and privileged keys", () => {
    const valid = { schemaVersion: 1, owner: "mealdeck", url, publishableKey: publicKey };
    expect(parseMealDeckPublicBackend({ ...valid, owner: "dishbee" })).toBeNull();
    expect(parseMealDeckPublicBackend({ ...valid, schemaVersion: 2 })).toBeNull();
    expect(parseMealDeckPublicBackend({ ...valid, publishableKey: secretKey })).toBeNull();
    expect(parseMealDeckPublicBackend(null)).toBeNull();
  });
});

describe("MealDeck dedicated checkout credential", () => {
  const config = { url, anonKey: publicKey };

  test("requires a dedicated credential or the explicitly matching platform project", () => {
    expect(
      readMealDeckCheckoutServerKey({ ...shared, MEALDECK_CHECKOUT_SERVER_KEY: secretKey }, config),
    ).toBe(secretKey);
    expect(
      readMealDeckCheckoutServerKey(
        { ...shared, DISHBEE_MEALDECK_CHECKOUT_SERVER_KEY: secretKey },
        config,
      ),
    ).toBeNull();
    expect(
      readMealDeckCheckoutServerKey({ ...shared, SUPABASE_SERVICE_ROLE_KEY: secretKey }, config),
    ).toBeNull();
    expect(
      readMealDeckCheckoutServerKey({ ...shared, MEALDECK_CHECKOUT_SERVER_KEY: publicKey }, config),
    ).toBeNull();
  });

  test("reuses a platform credential only for the exact explicitly selected project", () => {
    expect(
      readMealDeckCheckoutServerKey(
        { ...shared, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: secretKey },
        config,
      ),
    ).toBe(secretKey);
    expect(
      readMealDeckCheckoutServerKey(
        {
          ...shared,
          SUPABASE_URL: "https://foreign.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: secretKey,
        },
        config,
      ),
    ).toBeNull();
    expect(
      readMealDeckCheckoutServerKey(
        { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: secretKey },
        config,
      ),
    ).toBeNull();
    expect(
      readMealDeckCheckoutServerKey(
        {
          ...shared,
          SUPABASE_URL: url,
          SUPABASE_SERVICE_ROLE_KEY: legacyKey("service_role", "foreign"),
        },
        config,
      ),
    ).toBeNull();
    expect(
      readMealDeckCheckoutServerKey(
        {
          ...shared,
          MEALDECK_CHECKOUT_SERVER_KEY: "invalid",
          SUPABASE_URL: url,
          SUPABASE_SERVICE_ROLE_KEY: secretKey,
        },
        config,
      ),
    ).toBeNull();
  });

  test("cannot be reused with a stale or different public connection", () => {
    const env = { ...shared, MEALDECK_CHECKOUT_SERVER_KEY: secretKey };
    expect(
      readMealDeckCheckoutServerKey(env, { ...config, url: "https://anotherproject.supabase.co" }),
    ).toBeNull();
    expect(
      readMealDeckCheckoutServerKey(env, {
        ...config,
        anonKey: "sb_publishable_stale_public_key_here",
      }),
    ).toBeNull();
    expect(
      readMealDeckCheckoutServerKey(
        { ...env, DISHBEE_SUPABASE_URL: "https://anotherproject.supabase.co" },
        config,
      ),
    ).toBeNull();
  });

  test("a conflicting legacy server credential fails closed instead of falling back", () => {
    expect(
      readMealDeckCheckoutServerKey(
        {
          ...shared,
          MEALDECK_CHECKOUT_SERVER_KEY: secretKey,
          DISHBEE_MEALDECK_CHECKOUT_SERVER_KEY: "sb_secret_a_different_project_secret_key",
        },
        config,
      ),
    ).toBeNull();
    expect(
      readMealDeckCheckoutServerKey(
        {
          ...shared,
          MEALDECK_CHECKOUT_SERVER_KEY: secretKey,
          DISHBEE_MEALDECK_CHECKOUT_SERVER_KEY: secretKey,
        },
        config,
      ),
    ).toBe(secretKey);
  });

  test("legacy server JWTs must be service_role keys for this exact project", () => {
    const valid = legacyKey("service_role");
    expect(
      readMealDeckCheckoutServerKey({ ...shared, MEALDECK_CHECKOUT_SERVER_KEY: valid }, config),
    ).toBe(valid);
    expect(
      readMealDeckCheckoutServerKey(
        { ...shared, MEALDECK_CHECKOUT_SERVER_KEY: legacyKey("service_role", "foreignproject") },
        config,
      ),
    ).toBeNull();
    expect(
      readMealDeckCheckoutServerKey(
        { ...shared, MEALDECK_CHECKOUT_SERVER_KEY: legacyKey("anon") },
        config,
      ),
    ).toBeNull();
  });
});

describe("MealDeck tenant and location configuration", () => {
  test("binds both kitchens to the same MealDeck-owned tenant", () => {
    const first = readMealDeckRuntimeConfig(shared, "luton");
    const second = readMealDeckRuntimeConfig(shared, "stalbans");
    expect(first?.tenantId).toBe(tenant);
    expect(second?.tenantId).toBe(first?.tenantId);
    expect(first?.locationId).toBe(luton);
    expect(second?.locationId).toBe(stAlbans);
    expect(first?.url).toBe(url);
    expect(first?.anonKey).toBe(publicKey);
  });

  test("accepts matching legacy tenant identifiers during controlled migration", () => {
    const env = {
      ...shared,
      MEALDECK_TENANT_ID: "",
      MEALDECK_LUTON_TENANT_ID: tenant,
      MEALDECK_STALBANS_TENANT_ID: tenant,
    };
    expect(readMealDeckRuntimeConfig(env, "luton")?.tenantId).toBe(tenant);
    expect(readMealDeckRuntimeConfig(env, "stalbans")?.tenantId).toBe(tenant);
  });

  test("rejects conflicting legacy or canonical tenant IDs", () => {
    const mismatch = {
      ...shared,
      MEALDECK_LUTON_TENANT_ID: "10000000-0000-4000-8000-000000000002",
    };
    expect(readMealDeckRuntimeConfig(mismatch, "luton")).toBeNull();
    expect(readMealDeckRuntimeConfig(mismatch, "stalbans")).toBeNull();
  });

  test("rejects duplicate location IDs instead of cross-routing orders", () => {
    const sameKitchen = { ...shared, MEALDECK_STALBANS_LOCATION_ID: luton };
    expect(readMealDeckRuntimeConfig(sameKitchen, "luton")).toBeNull();
    expect(readMealDeckRuntimeConfig(sameKitchen, "stalbans")).toBeNull();
  });

  test("fails closed on incomplete credentials and missing or malformed UUID mappings", () => {
    expect(
      readMealDeckRuntimeConfig({ ...shared, MEALDECK_SUPABASE_PUBLISHABLE_KEY: "" }, "luton"),
    ).toBeNull();
    expect(
      readMealDeckRuntimeConfig({ ...shared, MEALDECK_STALBANS_LOCATION_ID: "" }, "stalbans"),
    ).toBeNull();
    expect(readMealDeckRuntimeConfig({ ...shared, MEALDECK_TENANT_ID: "" }, "luton")).toBeNull();
    expect(
      readMealDeckRuntimeConfig({ ...shared, MEALDECK_TENANT_ID: "mealdeck" }, "luton"),
    ).toBeNull();
    expect(
      readMealDeckRuntimeConfig({ ...shared, MEALDECK_LUTON_LOCATION_ID: "luton" }, "luton"),
    ).toBeNull();
  });

  test("supports the current one-kitchen rollout without guessing a future location", () => {
    const partial = { ...shared, MEALDECK_STALBANS_LOCATION_ID: "" };
    expect(readMealDeckRuntimeConfig(partial, "luton")?.locationId).toBe(luton);
    expect(readMealDeckRuntimeConfig(partial, "stalbans")).toBeNull();
  });
});
