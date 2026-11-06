import { createClient } from "@supabase/supabase-js";
import { CheckoutProblem } from "./mealdeck-checkout-selection";
import { createPaymentClients, verifiedPaymentUser } from "./mealdeck-payment-server-core";
import type { MealDeckRuntimeEnv } from "./mealdeck-runtime-config";
import { passwordOwnerAllowed, STAFF_PASSWORD_ACCOUNTS, staffPasswordSchema } from "./mealdeck-staff-passwords";

export async function updateStaffPassword(request: Request, input: unknown, env: MealDeckRuntimeEnv, fetcher: typeof fetch = fetch) {
  const parsed = staffPasswordSchema.safeParse(input);
  if (!parsed.success) throw new Error("Choose an approved account and a password of 12–128 characters.");
  const clients = createPaymentClients(env, fetcher);
  if (!clients) throw new Error("MealDeck account administration needs configuration.");
  const client = createClient(clients.config.url, clients.config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher, headers: { Authorization: request.headers.get("Authorization") ?? "" } },
  });
  await verifiedPaymentUser(request, client, true);
  const access = await client.rpc("mealdeck_ops_my_access");
  if (access.error || !passwordOwnerAllowed(access.data, clients.config.tenantId))
    throw new CheckoutProblem("not_permitted", "Only the MealDeck owner can set these passwords.", 403);
  const permission = await client.rpc("mealdeck_ops_staff_list", { p_tenant: clients.config.tenantId });
  if (permission.error || !Array.isArray(permission.data)) throw new Error("Current staff permission could not be verified.");
  const account = STAFF_PASSWORD_ACCOUNTS.find((a) => a.email === parsed.data.email);
  if (!account) throw new Error("This account is not approved.");
  const target = await clients.service.auth.admin.getUserById(account.id);
  if (target.error || target.data.user?.email?.toLowerCase() !== account.email)
    throw new Error("The approved account could not be verified. No password was changed.");
  const result = await clients.service.auth.admin.updateUserById(account.id, {
    password: parsed.data.password,
    ...(parsed.data.confirmEmailOwnership ? { email_confirm: true } : {}),
  });
  if (result.error) throw new Error("The password was not accepted. Use a stronger password and retry.");
  return { email: account.email, passwordSet: true, emailVerified: !!result.data.user?.email_confirmed_at };
}