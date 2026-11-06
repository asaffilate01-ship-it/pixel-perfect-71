import { readMealDeckBackendConfig, type MealDeckRuntimeEnv } from "./mealdeck-runtime-config";

/** Explicitly approved independent MealDeck installation, not a generic backend fallback. */
export const MEALDECK_CLOUD_PROJECT = "srsxybepwujuawyutnbs";
export const MEALDECK_CLOUD_ORIGIN = `https://${MEALDECK_CLOUD_PROJECT}.supabase.co`;
const TENANT = "94f97f02-70ec-445a-87a4-b51c0956d193";
const LUTON = "a0ba64ac-e268-44d3-8345-fce8d24999b6";
export type MealDeckCloudPublicConnection = {
  projectId?: string;
  url?: string;
  publishableKey?: string;
};
const value = (env: MealDeckRuntimeEnv, name: string) => env[name]?.trim() || undefined;

/**
 * Lovable supplies its public connection at build time. Adopt ONLY the reviewed
 * MealDeck project's complete pair. Explicit, partial or conflicting MealDeck /
 * legacy settings remain authoritative and fail closed through the existing parser.
 * No secret, payment approval, email verification or permission is manufactured.
 */
export function withMealDeckCloudConnection(
  env: MealDeckRuntimeEnv,
  cloud: MealDeckCloudPublicConnection,
): MealDeckRuntimeEnv {
  const selected = readMealDeckBackendConfig(env);
  let result: MealDeckRuntimeEnv = env;
  if (selected.status === "unconfigured") {
    if (selected.reason !== "missing" || cloud.projectId !== MEALDECK_CLOUD_PROJECT)
      return env;
    const candidate = readMealDeckBackendConfig({
      MEALDECK_SUPABASE_URL: cloud.url,
      MEALDECK_SUPABASE_PUBLISHABLE_KEY: cloud.publishableKey,
    });
    if (candidate.status !== "ready" || candidate.backend.url !== MEALDECK_CLOUD_ORIGIN)
      return env;
    result = {
      ...env,
      MEALDECK_SUPABASE_URL: candidate.backend.url,
      MEALDECK_SUPABASE_PUBLISHABLE_KEY: candidate.backend.publishableKey,
    };
  }
  const backend = readMealDeckBackendConfig(result);
  if (backend.status !== "ready" || backend.backend.url !== MEALDECK_CLOUD_ORIGIN) return result;
  // Scope defaults belong only to this installed database. Existing explicit
  // scope values are never overwritten or combined with another tenant.
  const tenantNames = ["MEALDECK_TENANT_ID", "MEALDECK_LUTON_TENANT_ID", "MEALDECK_STALBANS_TENANT_ID"];
  const tenants = tenantNames.map((name) => value(result, name)).filter(Boolean);
  if (tenants.some((tenant) => tenant !== TENANT)) return result;
  const luton = value(result, "MEALDECK_LUTON_LOCATION_ID");
  if (luton && luton !== LUTON) return result;
  return {
    ...result,
    ...(tenants.length ? {} : { MEALDECK_TENANT_ID: TENANT }),
    ...(luton ? {} : { MEALDECK_LUTON_LOCATION_ID: LUTON }),
  };
}
