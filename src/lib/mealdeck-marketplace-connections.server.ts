import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CheckoutProblem } from "./mealdeck-checkout-selection";
import {
  MARKETPLACE_NO_STORE,
  marketplaceBridgeEnabled,
} from "./mealdeck-marketplace-bridge.server";
import {
  marketplaceConnectionsReportSchema,
  marketplaceConnectionSchema,
} from "./mealdeck-marketplace-connections";
import { readMealDeckRuntimeConfig, type MealDeckRuntimeEnv } from "./mealdeck-runtime-config";
import {
  readPaymentInput,
  requirePaymentOrigin,
  verifiedPaymentUser,
} from "./mealdeck-payment-server-core";

const inputSchema = z.strictObject({
  action: z.literal("status"),
  tenantId: z.uuid(),
  locationId: z.uuid(),
});

/** Read-only diagnostic; never provisions, enables or dispatches a connector. */
export async function handleMarketplaceConnectionsRequest(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
) {
  try {
    if (request.method !== "POST")
      return Response.json(
        { error: "method_not_allowed" },
        {
          status: 405,
          headers: { ...MARKETPLACE_NO_STORE, Allow: "POST" },
        },
      );
    requirePaymentOrigin(request);
    const input = inputSchema.safeParse(await readPaymentInput(request, 4096));
    if (!input.success)
      throw new CheckoutProblem("invalid_request", "Choose the configured kitchen.", 400);
    const config = readMealDeckRuntimeConfig(env, "luton");
    if (!config)
      throw new CheckoutProblem(
        "setup_required",
        "The dedicated kitchen connection needs setup.",
        503,
      );
    if (config.tenantId !== input.data.tenantId || config.locationId !== input.data.locationId)
      throw new CheckoutProblem(
        "not_permitted",
        "These connections belong to the configured kitchen.",
        403,
      );
    const client = createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: fetcher,
        headers: { Authorization: request.headers.get("Authorization") ?? "" },
      },
    });
    await verifiedPaymentUser(request, client, true);
    // SQL verifies current owner/admin, scoped finance permission and MFA again.
    // A public key plus the actual user token can never become service authority.
    const { data, error } = await client.rpc("mealdeck_ops_marketplace_connections", {
      p_tenant: config.tenantId,
      p_location: config.locationId,
    });
    if (error) {
      if (/forbidden|permission|denied|mfa|owner|admin/i.test(error.message ?? ""))
        throw new CheckoutProblem(
          "not_permitted",
          "Current owner or administrator permission is required.",
          403,
        );
      throw new CheckoutProblem(
        "connections_unavailable",
        "The marketplace setup report is unavailable. Check that the connector database extension is installed.",
        503,
      );
    }
    const rows = z.array(marketplaceConnectionSchema).max(100).safeParse(data);
    if (!rows.success) throw new Error("Invalid connection report");
    const report = marketplaceConnectionsReportSchema.parse({
      tenantId: config.tenantId,
      locationId: config.locationId,
      checkedAt: new Date().toISOString(),
      runtimeEnabled: marketplaceBridgeEnabled(env),
      connections: rows.data,
    });
    return Response.json(report, { headers: MARKETPLACE_NO_STORE });
  } catch (error) {
    const problem =
      error instanceof CheckoutProblem
        ? error
        : new CheckoutProblem(
            "connections_unavailable",
            "The marketplace setup report could not be verified.",
            503,
          );
    return Response.json(
      { error: problem.code, message: problem.message },
      {
        status: problem.status,
        headers: MARKETPLACE_NO_STORE,
      },
    );
  }
}
