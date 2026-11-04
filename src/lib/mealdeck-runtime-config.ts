/**
 * Connection validation shared by MealDeck's server and staff-client bootstrap.
 * MealDeck owns its database; Dishbee is the technology provider, not a fallback
 * database. This module reads only the supplied map and never reads process.env.
 */
export type MealDeckLocationKey = "luton" | "stalbans";
export type MealDeckRuntimeEnv = Readonly<Record<string, string | undefined>>;

export type MealDeckPublicBackend = {
  schemaVersion: 1;
  owner: "mealdeck";
  url: string;
  publishableKey: string;
};
export type MealDeckBackendFailure =
  | "missing"
  | "legacy_only"
  | "incomplete"
  | "invalid_url"
  | "invalid_public_key"
  | "key_project_mismatch"
  | "legacy_conflict";
export type MealDeckBackendResult =
  | { status: "ready"; backend: MealDeckPublicBackend }
  | { status: "unconfigured"; reason: MealDeckBackendFailure; message: string };

/** Historical field names are retained for existing server RPC consumers. */
export type MealDeckRuntimeConfig = {
  url: string;
  anonKey: string;
  tenantId: string;
  locationId: string;
};

const legacyPublicPairs = [
  ["DISHBEE_SUPABASE_URL", "DISHBEE_SUPABASE_ANON_KEY"],
  ["VITE_MEALDECK_OPS_SUPABASE_URL", "VITE_MEALDECK_OPS_SUPABASE_ANON_KEY"],
  ["VITE_MEALDECK_SUPABASE_URL", "VITE_MEALDECK_SUPABASE_PUBLISHABLE_KEY"],
] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function configured(env: MealDeckRuntimeEnv, key: string): string | undefined {
  return env[key]?.trim() || undefined;
}

function projectOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.port
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Decode only to reject wrong key types/project refs, never to authorise a user. */
function legacyKeyClaims(key: string): Record<string, unknown> | null {
  const parts = key.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  try {
    const decode = (part: string): unknown =>
      JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    const header = decode(parts[0]!);
    const claims = decode(parts[1]!);
    if (
      !header ||
      typeof header !== "object" ||
      Array.isArray(header) ||
      (header as Record<string, unknown>)["alg"] !== "HS256" ||
      !claims ||
      typeof claims !== "object" ||
      Array.isArray(claims)
    )
      return null;
    return claims as Record<string, unknown>;
  } catch {
    return null;
  }
}

function keyProjectMatches(claims: Record<string, unknown>, origin: string): boolean {
  const ref = claims["ref"];
  return (
    claims["iss"] === "supabase" &&
    typeof ref === "string" &&
    /^[a-z0-9]+$/.test(ref) &&
    new URL(origin).hostname === `${ref}.supabase.co`
  );
}

function publicKeyIssue(key: string, origin: string): MealDeckBackendFailure | null {
  if (/^sb_publishable_[A-Za-z0-9_-]{16,512}$/.test(key)) return null;
  const claims = legacyKeyClaims(key);
  if (!claims || claims["role"] !== "anon") return "invalid_public_key";
  return keyProjectMatches(claims, origin) ? null : "key_project_mismatch";
}

function failure(reason: MealDeckBackendFailure): MealDeckBackendResult {
  const messages: Record<MealDeckBackendFailure, string> = {
    missing:
      "Staff operations is not configured. Connect MealDeck’s dedicated Supabase URL and publishable key on the server.",
    legacy_only:
      "MealDeck needs its own database connection. Replace the legacy Dishbee or browser-only database settings with MealDeck’s server configuration.",
    incomplete:
      "MealDeck’s database connection is incomplete. Configure its project URL and publishable key together.",
    invalid_url:
      "MealDeck’s database URL is invalid. Use the HTTPS project origin without credentials, paths or query parameters.",
    invalid_public_key:
      "MealDeck’s public database key is invalid. Use a publishable key or legacy anon key; privileged keys must stay server-only.",
    key_project_mismatch:
      "MealDeck’s database URL and key belong to different projects. Check the dedicated MealDeck connection.",
    legacy_conflict:
      "MealDeck’s database settings conflict with legacy settings. Remove the outdated settings or make them match the dedicated MealDeck connection.",
  };
  return { status: "unconfigured", reason, message: messages[reason] };
}

/** No field can fall back to Dishbee, generic Supabase or VITE credentials. */
export function readMealDeckBackendConfig(env: MealDeckRuntimeEnv): MealDeckBackendResult {
  const rawUrl = configured(env, "MEALDECK_SUPABASE_URL");
  const key = configured(env, "MEALDECK_SUPABASE_PUBLISHABLE_KEY");
  if (!rawUrl && !key) {
    const legacy = legacyPublicPairs.some((pair) => pair.some((name) => configured(env, name)));
    return failure(legacy ? "legacy_only" : "missing");
  }
  if (!rawUrl || !key) return failure("incomplete");
  const url = projectOrigin(rawUrl);
  if (!url) return failure("invalid_url");
  const issue = publicKeyIssue(key, url);
  if (issue) return failure(issue);
  for (const [urlName, keyName] of legacyPublicPairs) {
    const legacyUrl = configured(env, urlName);
    const legacyKey = configured(env, keyName);
    if ((legacyUrl && projectOrigin(legacyUrl) !== url) || (legacyKey && legacyKey !== key)) {
      return failure("legacy_conflict");
    }
  }
  return {
    status: "ready",
    backend: { schemaVersion: 1, owner: "mealdeck", url, publishableKey: key },
  };
}

/** Copy only the public connection fields returned by the server bootstrap. */
export function parseMealDeckPublicBackend(value: unknown): MealDeckPublicBackend | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    data["schemaVersion"] !== 1 ||
    data["owner"] !== "mealdeck" ||
    typeof data["url"] !== "string" ||
    typeof data["publishableKey"] !== "string"
  )
    return null;
  const result = readMealDeckBackendConfig({
    MEALDECK_SUPABASE_URL: data["url"],
    MEALDECK_SUPABASE_PUBLISHABLE_KEY: data["publishableKey"],
  });
  return result.status === "ready" ? result.backend : null;
}

/**
 * The checkout credential is independently privileged and never returned by the
 * public bootstrap. Bind it to the same currently selected MealDeck connection.
 * Opaque secret keys cannot be decoded; operators must provision them from that
 * project. Legacy JWT service keys are additionally checked against the URL ref.
 */
export function readMealDeckCheckoutServerKey(
  env: MealDeckRuntimeEnv,
  config: Pick<MealDeckRuntimeConfig, "url" | "anonKey">,
): string | null {
  const selected = readMealDeckBackendConfig(env);
  if (
    selected.status !== "ready" ||
    selected.backend.url !== config.url ||
    selected.backend.publishableKey !== config.anonKey
  )
    return null;
  const key = configured(env, "MEALDECK_CHECKOUT_SERVER_KEY");
  const oldKey = configured(env, "DISHBEE_MEALDECK_CHECKOUT_SERVER_KEY");
  if (!key || key === config.anonKey || (oldKey && oldKey !== key)) return null;
  if (/^sb_secret_[A-Za-z0-9_-]{16,512}$/.test(key)) return key;
  const claims = legacyKeyClaims(key);
  return claims?.["role"] === "service_role" && keyProjectMatches(claims, config.url) ? key : null;
}

export function readMealDeckRuntimeConfig(
  env: MealDeckRuntimeEnv,
  location: MealDeckLocationKey,
): MealDeckRuntimeConfig | null {
  const selected = readMealDeckBackendConfig(env);
  if (selected.status !== "ready") return null;
  const sharedTenant = configured(env, "MEALDECK_TENANT_ID");
  const lutonTenant = configured(env, "MEALDECK_LUTON_TENANT_ID");
  const stAlbansTenant = configured(env, "MEALDECK_STALBANS_TENANT_ID");
  const tenantIds = [sharedTenant, lutonTenant, stAlbansTenant].filter((id): id is string =>
    Boolean(id),
  );
  if (new Set(tenantIds).size > 1) return null;
  const tenantId = tenantIds[0];
  const lutonLocation = configured(env, "MEALDECK_LUTON_LOCATION_ID");
  const stAlbansLocation = configured(env, "MEALDECK_STALBANS_LOCATION_ID");
  if (lutonLocation && stAlbansLocation && lutonLocation === stAlbansLocation) return null;
  const locationId = location === "luton" ? lutonLocation : stAlbansLocation;
  if (!tenantId || !locationId || !uuidPattern.test(tenantId) || !uuidPattern.test(locationId))
    return null;
  return {
    url: selected.backend.url,
    anonKey: selected.backend.publishableKey,
    tenantId,
    locationId,
  };
}
