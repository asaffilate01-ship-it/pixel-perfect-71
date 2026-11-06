import { createClient } from "@supabase/supabase-js";
import { CheckoutProblem } from "./mealdeck-checkout-selection";
import { verifiedPaymentUser } from "./mealdeck-payment-server-core";
import { readMealDeckBackendConfig, type MealDeckRuntimeEnv } from "./mealdeck-runtime-config";
import {
  hasGlobalOwner,
  passwordOwnerAllowed,
  STAFF_PASSWORD_ACCOUNTS,
  staffPasswordSchema,
} from "./mealdeck-staff-passwords";

/**
 * Narrow view of the platform-injected privileged client. It is the only route to
 * account administration on Lovable Cloud, whose service key is never exposed to
 * operators, so no checkout server key is required for this form.
 */
export type StaffPasswordAdminClient = {
  from(table: "tenants"): {
    select(columns: string): PromiseLike<{ data: unknown; error: unknown }>;
  };
  auth: {
    admin: {
      getUserById(id: string): PromiseLike<{
        data: { user?: { email?: string | null } | null } | null;
        error: unknown;
      }>;
      updateUserById(
        id: string,
        attributes: Record<string, unknown>,
      ): PromiseLike<{
        data: { user?: { email_confirmed_at?: string | null } | null } | null;
        error: unknown;
      }>;
    };
  };
};

async function loadPrivilegedClient(): Promise<StaffPasswordAdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as StaffPasswordAdminClient;
}

function hostOf(value: string): string {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

/** MealDeck runs on exactly one tenant; anything else fails closed. */
async function onlyTenant(admin: StaffPasswordAdminClient): Promise<string> {
  const tenants = await admin.from("tenants").select("id");
  if (tenants.error) throw new Error("MealDeck kitchen configuration could not be verified.");
  const rows = Array.isArray(tenants.data) ? tenants.data : [];
  const ids = rows
    .map((row) => (row as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const [tenantId] = ids;
  if (ids.length !== 1 || !tenantId)
    throw new Error("MealDeck account administration needs exactly one MealDeck kitchen configured.");
  return tenantId;
}

export async function updateStaffPassword(
  request: Request,
  input: unknown,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
  loadAdmin: () => Promise<StaffPasswordAdminClient> = loadPrivilegedClient,
) {
  const parsed = staffPasswordSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("Choose an approved account and a password of 12–128 characters.");

  const backend = readMealDeckBackendConfig(env);
  if (backend.status !== "ready")
    throw new Error("MealDeck account administration needs configuration.");
  const url = backend.backend.url;

  // A URL from one project must never be combined with a key from another.
  const privilegedUrl = env["SUPABASE_URL"];
  if (privilegedUrl && (hostOf(privilegedUrl) === "" || hostOf(privilegedUrl) !== hostOf(url)))
    throw new Error("MealDeck account administration is pointing at the wrong project.");

  const client = createClient(url, backend.backend.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher, headers: { Authorization: request.headers.get("Authorization") ?? "" } },
  });
  await verifiedPaymentUser(request, client, true);
  const access = await client.rpc("mealdeck_ops_my_access");
  if (access.error || !hasGlobalOwner(access.data))
    throw new CheckoutProblem("not_permitted", "Only the MealDeck owner can set these passwords.", 403);

  const admin = await loadAdmin();
  const tenantId = await onlyTenant(admin);
  if (!passwordOwnerAllowed(access.data, tenantId))
    throw new CheckoutProblem("not_permitted", "Only the MealDeck owner can set these passwords.", 403);

  const permission = await client.rpc("mealdeck_ops_staff_list", { p_tenant: tenantId });
  if (permission.error || !Array.isArray(permission.data))
    throw new Error("Current staff permission could not be verified.");

  const account = STAFF_PASSWORD_ACCOUNTS.find((a) => a.email === parsed.data.email);
  if (!account) throw new Error("This account is not approved.");
  const target = await admin.auth.admin.getUserById(account.id);
  if (target.error || target.data?.user?.email?.toLowerCase() !== account.email)
    throw new Error("The approved account could not be verified. No password was changed.");
  const result = await admin.auth.admin.updateUserById(account.id, {
    password: parsed.data.password,
    ...(parsed.data.confirmEmailOwnership ? { email_confirm: true } : {}),
  });
  if (result.error) throw new Error("The password was not accepted. Use a stronger password and retry.");
  return {
    email: account.email,
    passwordSet: true,
    emailVerified: !!result.data?.user?.email_confirmed_at,
  };
}
