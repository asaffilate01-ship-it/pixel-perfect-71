import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getMealDeckPublicBackend } from "./mealdeck-backend.functions";
import { createMealDeckBackendClientCache } from "./mealdeck-backend-client-cache";

/** An isolated MealDeck driver login: never share Onyn tokens or privileged keys. */
const clients = createMealDeckBackendClientCache<SupabaseClient>({
  read: () => getMealDeckPublicBackend(),
  create: ({ url, publishableKey }) =>
    createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: `mealdeck-driver-${new URL(url).hostname}-auth-token`,
      },
      global: { headers: { "X-Client-Info": "mealdeck-driver-pwa" } },
    }),
  retire: (client) => { void client.auth.stopAutoRefresh().catch(() => {}); },
});

export async function initialiseDriverClient(): Promise<SupabaseClient> {
  if (typeof window === "undefined") throw new Error("Driver login is available in the app only.");
  try { return await clients.initialise(); }
  catch { throw new Error("MealDeck driver login is not configured. Contact the kitchen manager."); }
}
export function driverClient(): SupabaseClient {
  const client = clients.get();
  if (!client) throw new Error("Your driver connection is not ready. Reload the app.");
  return client;
}
export async function driverRpc<T>(functionName: string, args: Record<string, unknown> = {}): Promise<T> {
  const client = driverClient();
  const { data, error } = await client.rpc(functionName, args);
  if (clients.get() !== client) throw new Error("Your driver session changed. Sign in again.");
  if (error) {
    const message = error.message || "";
    if (error.code === "PGRST202" || /driver_app_not_installed/.test(message))
      throw new Error("Driver dispatch is not installed for this kitchen yet.");
    if (error.code === "PGRST301" || error.code === "PGRST302" ||
        /jwt.*expired|not_authenticated|session.*expired/.test(message))
      throw new Error("Your driver session has expired. Sign out and sign in again.");
    if (/mealdeck_driver_forbidden/.test(message) || error.code === "42501")
      throw new Error("Your signed-in account has not been approved for MealDeck Driver. Ask your kitchen manager to approve your verified email in Operations → Driver dispatch, then sign in again.");
    if (/mealdeck_driver_conflict|mealdeck_driver_offer_expired/.test(message))
      throw new Error("This delivery changed. Refresh the job before taking another action.");
    if (/mealdeck_driver_handover_pending/.test(message))
      throw new Error("The kitchen must confirm sealed-bag handover first.");
    if (/mealdeck_driver_kitchen_not_ready/.test(message))
      throw new Error("The kitchen has not released this order. Check the order with staff.");
    throw new Error("The latest delivery state could not be confirmed. Refresh before retrying.");
  }
  return data as T;
}
