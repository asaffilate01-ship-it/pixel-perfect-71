import type { SupabaseClient } from "@supabase/supabase-js";
import type { MealDeckRuntimeEnv } from "./mealdeck-runtime-config";
import { readWebPushConfig, type WebPushConfig } from "./mealdeck-web-push.server";

/**
 * The hosted sender may keep its small dedicated credential bundle in Supabase
 * Vault. Only this existing server connection can read it, scoped to its exact
 * MealDeck kitchen. Public handlers return only availability and the public key.
 * An explicit environment switch always wins, including an operator's OFF.
 */
export async function resolveWebPushConfig(
  env: MealDeckRuntimeEnv,
  service: Pick<SupabaseClient, "rpc">,
  scope: { tenantId: string; locationId: string },
): Promise<WebPushConfig | null> {
  if (env["MEALDECK_WEB_PUSH_ENABLED"] !== undefined) return readWebPushConfig(env);
  try {
    const { data, error } = await service.rpc("mealdeck_push_runtime_config", {
      p_tenant: scope.tenantId,
      p_location: scope.locationId,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data) || data.enabled !== true)
      return null;
    return readWebPushConfig({
      MEALDECK_WEB_PUSH_ENABLED: "true",
      MEALDECK_WEB_PUSH_PUBLIC_KEY: typeof data.publicKey === "string" ? data.publicKey : "",
      MEALDECK_WEB_PUSH_PRIVATE_KEY: typeof data.privateKey === "string" ? data.privateKey : "",
      MEALDECK_WEB_PUSH_SUBJECT: typeof data.subject === "string" ? data.subject : "",
      MEALDECK_WEB_PUSH_WORKER_SECRET:
        typeof data.workerSecret === "string" ? data.workerSecret : "",
    });
  } catch {
    return null;
  }
}
