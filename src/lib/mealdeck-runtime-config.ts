/**
 * MealDeck is ONE Dishbee tenant with two location IDs.
 *
 * This is a server-only configuration boundary. Do not silently stitch together
 * two independent tenants under one MealDeck basket, and do not guess UUIDs.
 * Until the operator fixes a conflict, return null and keep checkout disabled.
 */
export type MealDeckLocationKey = "luton" | "stalbans";
export type MealDeckRuntimeEnv = Readonly<Record<string, string | undefined>>;

export type MealDeckRuntimeConfig = {
  url: string;
  anonKey: string;
  tenantId: string;
  locationId: string;
};

function configured(env: MealDeckRuntimeEnv, key: string): string | undefined {
  return env[key]?.trim() || undefined;
}

export function readMealDeckRuntimeConfig(
  env: MealDeckRuntimeEnv,
  location: MealDeckLocationKey,
): MealDeckRuntimeConfig | null {
  const url = configured(env, "DISHBEE_SUPABASE_URL");
  const anonKey = configured(env, "DISHBEE_SUPABASE_ANON_KEY");
  const sharedTenant = configured(env, "MEALDECK_TENANT_ID");
  const lutonTenant = configured(env, "MEALDECK_LUTON_TENANT_ID");
  const stAlbansTenant = configured(env, "MEALDECK_STALBANS_TENANT_ID");
  const tenantIds = [sharedTenant, lutonTenant, stAlbansTenant].filter(
    (id): id is string => Boolean(id),
  );

  // During migration the two legacy environment names may still be used.
  // They MUST reference the same canonical MealDeck tenant if both are set.
  if (new Set(tenantIds).size > 1) return null;

  const tenantId = tenantIds[0];
  const lutonLocation = configured(env, "MEALDECK_LUTON_LOCATION_ID");
  const stAlbansLocation = configured(env, "MEALDECK_STALBANS_LOCATION_ID");

  // Never present one physical kitchen as two independent serving locations.
  if (lutonLocation && stAlbansLocation && lutonLocation === stAlbansLocation) {
    return null;
  }

  const locationId = location === "luton" ? lutonLocation : stAlbansLocation;
  if (!url || !anonKey || !tenantId || !locationId) return null;

  return { url, anonKey, tenantId, locationId };
}
