import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getMealDeckPublicBackend } from "./mealdeck-backend.functions";
import { createMealDeckBackendClientCache } from "./mealdeck-backend-client-cache";
import { OpsRequestError } from "./mealdeck-ops-browser";
const clients = createMealDeckBackendClientCache<SupabaseClient>({
  read: () => getMealDeckPublicBackend(),
  create: ({ url, publishableKey }) =>
    createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: `mealdeck-printer-${new URL(url).hostname}-auth-token`,
      },
      global: { headers: { "X-Client-Info": "mealdeck-printer-web" } },
    }),
  retire: (client) => {
    void client.auth.stopAutoRefresh().catch(() => {});
  },
});
export async function initializePrinterClient(refresh = false) {
  if (typeof window === "undefined") throw new Error("Browser required");
  return clients.initialise(refresh);
}
export async function printerRpc(name: string, args: Record<string, unknown> = {}) {
  if (!/^mealdeck_printer_[a-z_]+$/.test(name)) throw new Error("Invalid printer operation");
  const db = clients.get();
  if (!db)
    throw new OpsRequestError("unconfigured", "Connect and sign in to the printer app first.");
  const { data, error } = await db.rpc(name, args);
  if (clients.get() !== db)
    throw new OpsRequestError("unauthenticated", "Sign in again to continue.");
  if (error) {
    if (/unauthenticated|jwt.*expired/i.test(error.message) || error.code === "PGRST301")
      throw new OpsRequestError(
        "unauthenticated",
        "Your printer session has expired. Sign in again.",
      );
    if (/forbidden|permission/i.test(error.message) || error.code === "42501")
      throw new OpsRequestError(
        "forbidden",
        "This account does not have printer access for this kitchen.",
      );
    if (error.code === "PGRST202")
      throw new OpsRequestError(
        "unconfigured",
        name === "mealdeck_printer_acceptance_board" || name === "mealdeck_printer_accept_order"
          ? "Accepting orders from this printer needs its database update. Existing receipt printing remains available; ask your administrator to finish the update."
          : "The receipt service needs its database setup. Ask your administrator to finish the printer installation.",
      );
    if (/mealdeck_kds_conflict/.test(error.message))
      throw new OpsRequestError(
        "conflict",
        "This order changed on another screen. Refresh the paid orders and receipt queue before accepting it.",
      );
    if (
      /mealdeck_kds_(invalid_transition|order_unavailable|payment_required|release_required|not_released|routing_incomplete|instructions_unavailable)/.test(
        error.message,
      )
    )
      throw new OpsRequestError(
        "invalid_transition",
        "This order is no longer cleared for acceptance. Refresh the queue and ask the kitchen to review its current status.",
      );
    if (/verified_account_required/.test(error.message))
      throw new OpsRequestError(
        "unavailable",
        "This email needs an existing account with a verified email address. Register and verify the account first.",
      );
    if (/self_assignment/.test(error.message))
      throw new OpsRequestError(
        "unavailable",
        "Owners already have printer access. Use a separate verified terminal account.",
      );
    if (/inspection_required/.test(error.message))
      throw new OpsRequestError(
        "invalid_transition",
        "Inspect the printer and resolve the previous receipt before requesting another copy.",
      );
    if (/job_claimed|claim_expired/.test(error.message))
      throw new OpsRequestError(
        "conflict",
        "Another terminal has claimed this receipt, or its claim has expired. Refresh and check the printer.",
      );
    if (/verified_acceptance_required/.test(error.message))
      throw new OpsRequestError(
        "invalid_transition",
        "The order is no longer cleared for printing. Ask an administrator to review its payment and acceptance.",
      );
    throw new OpsRequestError(
      "unavailable",
      "This printer action was not confirmed. Refresh the queue and inspect the printer before trying again.",
    );
  }
  return data as unknown;
}
export class PrinterBridgeError extends Error {
  constructor(public readonly status: number) {
    super("The local printer bridge did not confirm this action.");
  }
}
export const PRINTER_BRIDGE_ORIGIN = "https://127.0.0.1:17443";
/** Fixed, paired loopback service. No customer-supplied URL, host or raw bytes. */
export async function printerBridge(
  path: string,
  token: string | null,
  body?: unknown,
  accessToken?: string,
) {
  if (!/^\/v1\/(pair|health|recovery|jobs(?:\/[a-f0-9-]{36}(?:\/resolve)?)?)$/.test(path))
    throw new Error("Invalid bridge path");
  const response = await fetch(PRINTER_BRIDGE_ORIGIN + path, {
    method: body === undefined ? "GET" : "POST",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(accessToken ? { "X-Mealdeck-Access-Token": accessToken } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new PrinterBridgeError(response.status);
  return (await response.json()) as Record<string, unknown>;
}
