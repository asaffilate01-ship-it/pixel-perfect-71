import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { CheckoutProblem } from "./mealdeck-checkout-selection";
import { readPaymentInput } from "./mealdeck-payment-server-core";
import {
  readMealDeckCheckoutServerKey,
  readMealDeckRuntimeConfig,
  type MealDeckRuntimeEnv,
} from "./mealdeck-runtime-config";
import {
  marketplaceBridgeRequestSchema,
  marketplaceBridgeResponseSchemas,
  type MarketplaceBridgeRequest,
} from "./mealdeck-marketplace-protocol";

export const MARKETPLACE_NO_STORE = {
  "Cache-Control": "no-store, private",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

/** Runtime activation is independent of direct checkout and never inferred from credentials. */
export function marketplaceBridgeEnabled(env: MealDeckRuntimeEnv) {
  return (
    env["MEALDECK_MARKETPLACE_BRIDGE_ENABLED"] === "true" &&
    env["MEALDECK_MARKETPLACE_BRIDGE_APPROVAL"] === "signed-off"
  );
}

type BridgeScope = { tenantId: string; locationId: string };
type BridgeRpc = (
  scope: BridgeScope,
  tokenHash: string,
  input: MarketplaceBridgeRequest,
) => Promise<unknown>;

function bridgeProblem(error: unknown): CheckoutProblem {
  if (error instanceof CheckoutProblem) return error;
  const message =
    error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (
    /marketplace_(?:forbidden|unauthorized|credential|scope|profile|connector|disabled|unconfigured)/.test(
      message,
    )
  )
    return new CheckoutProblem(
      "bridge_not_authorised",
      "The bridge connection or reviewed profile is unavailable.",
      403,
    );
  if (/marketplace_(?:lease|command|identity|snapshot|stale|conflict|immutable)/.test(message))
    return new CheckoutProblem(
      "bridge_needs_checking",
      "Refresh the exact order and reconcile the existing action.",
      409,
    );
  if (/marketplace_(?:invalid|payload|observation)/.test(message))
    return new CheckoutProblem(
      "invalid_observation",
      "The complete platform observation could not be verified.",
      400,
    );
  if (/marketplace_(?:rate_limit|retry_later)/.test(message))
    return new CheckoutProblem("retry_later", "Wait before sending another bridge request.", 429);
  return new CheckoutProblem(
    "bridge_unavailable",
    "The marketplace bridge is unavailable. Check the original merchant screen.",
    503,
  );
}

function createBridgeRpc(env: MealDeckRuntimeEnv, fetcher: typeof fetch): BridgeRpc | null {
  const config = readMealDeckRuntimeConfig(env, "luton");
  const key = config && readMealDeckCheckoutServerKey(env, config);
  if (!config || !key) return null;
  const client = createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher },
  });
  return async (scope, tokenHash, input) => {
    const { data, error } = await client.rpc("mealdeck_marketplace_bridge", {
      p_tenant: scope.tenantId,
      p_location: scope.locationId,
      p_connector: input.connectorId,
      p_token_hash: tokenHash,
      p_operation: input.op,
      p_payload: input.payload,
    });
    if (error) throw error;
    return data;
  };
}

/** Machine-only endpoint. The database rechecks connector, scope, token, profile and lease. */
export async function handleMarketplaceBridgeRequest(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
  rpcOverride?: BridgeRpc,
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
    // Bridge tokens never belong to browser localStorage or a customer/staff client.
    if (request.headers.has("Origin") || request.headers.get("Sec-Fetch-Site") === "cross-site")
      throw new CheckoutProblem("bridge_not_authorised", "Use the provisioned local bridge.", 403);
    const header = request.headers.get("Authorization") ?? "";
    if (!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(header))
      throw new CheckoutProblem("bridge_not_authorised", "Bridge authentication is required.", 401);
    if (!marketplaceBridgeEnabled(env))
      throw new CheckoutProblem(
        "bridge_unconfigured",
        "The marketplace bridge has not been commissioned.",
        503,
      );
    const config = readMealDeckRuntimeConfig(env, "luton");
    if (!config)
      throw new CheckoutProblem(
        "bridge_unconfigured",
        "The MealDeck kitchen connection needs setup.",
        503,
      );
    const input = marketplaceBridgeRequestSchema.safeParse(
      await readPaymentInput(request, 256_000),
    );
    if (!input.success)
      throw new CheckoutProblem(
        "invalid_observation",
        "Send a complete supported bridge request.",
        400,
      );
    const rpc = rpcOverride ?? createBridgeRpc(env, fetcher);
    if (!rpc)
      throw new CheckoutProblem(
        "bridge_unconfigured",
        "The MealDeck kitchen connection needs setup.",
        503,
      );
    const tokenHash = createHash("sha256").update(header.slice(7), "utf8").digest("hex");
    const data = await rpc(
      { tenantId: config.tenantId, locationId: config.locationId },
      tokenHash,
      input.data,
    );
    const verified = marketplaceBridgeResponseSchemas[input.data.op].safeParse(data);
    if (!verified.success) throw new Error("marketplace_response_unavailable");
    return Response.json(verified.data, { headers: MARKETPLACE_NO_STORE });
  } catch (error) {
    const problem = bridgeProblem(error);
    return Response.json(
      { error: problem.code, message: problem.message },
      {
        status: problem.status,
        headers: MARKETPLACE_NO_STORE,
      },
    );
  }
}
