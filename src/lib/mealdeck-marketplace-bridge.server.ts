import { createHash } from "node:crypto";
import { CheckoutProblem } from "./mealdeck-checkout-selection";
import { readPaymentInput } from "./mealdeck-payment-server-core";
import { readMealDeckRuntimeConfig, type MealDeckRuntimeEnv } from "./mealdeck-runtime-config";
import { operationalEvidenceFresh, MARKETPLACE_HEARTBEAT_MAX_AGE_MS } from "./mealdeck-ops-evidence";
import {
  marketplaceBridgeRequestSchema,
  marketplaceBridgeResponseSchemas,
  type MarketplaceBridgeRequest,
} from "./mealdeck-marketplace-protocol";

const NO_STORE = {
  "Cache-Control": "no-store, private",
  "Vary": "Authorization",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

type BridgeScope = { tenantId: string; locationId: string };

/**
 * Unmounted admission boundary. Only a reviewed server-owned implementation
 * may supply this dependency. It must authenticate the connector hash,
 * enforce connector/store/profile/tenant/location/lease scope atomically,
 * and reconcile command results against the marketplace ledger.
 * There is intentionally no default database client or public route.
 */
export type MarketplaceBridgeStore = (
  scope: BridgeScope,
  tokenHash: string,
  input: MarketplaceBridgeRequest,
) => Promise<unknown>;

export function marketplaceBridgeEnabled(env: MealDeckRuntimeEnv): boolean {
  return env["MEALDECK_MARKETPLACE_BRIDGE_ENABLED"] === "true" &&
    env["MEALDECK_MARKETPLACE_BRIDGE_APPROVAL"] === "signed-off";
}

const problem = (code: string, message: string, status: number) =>
  new CheckoutProblem(code, message, status);
const unavailable = () => problem("bridge_unavailable", "The marketplace response could not be verified. Check the original merchant screen.", 503);
const invalidObservation = () => problem("invalid_observation", "Send a current, complete marketplace observation.", 400);

function checkObservationTime(input: MarketplaceBridgeRequest, now: number) {
  if (!Number.isFinite(now)) throw unavailable();
  const fresh = (value: string) => operationalEvidenceFresh(value, now, MARKETPLACE_HEARTBEAT_MAX_AGE_MS);
  if (input.op === "heartbeat" || input.op === "observe") {
    if (!fresh(input.payload.observedAt)) throw invalidObservation();
    if (input.op === "observe" && Date.parse(input.payload.placedAt) > Date.parse(input.payload.observedAt))
      throw invalidObservation();
  }
  if (input.op === "result") {
    if (input.payload.observedAt !== undefined && !fresh(input.payload.observedAt)) throw invalidObservation();
    // No supported merchant command can have succeeded while the order is new.
    if (input.payload.outcome === "confirmed" && input.payload.observedState === "new") throw invalidObservation();
  }
}

function verifiedReply(input: MarketplaceBridgeRequest, value: unknown, now: number) {
  if (!Number.isFinite(now)) throw unavailable();
  switch (input.op) {
    case "heartbeat": {
      const result = marketplaceBridgeResponseSchemas.heartbeat.safeParse(value);
      if (!result.success ||
          result.data.profileId !== input.payload.evidence.profileId ||
          result.data.profileVersion !== input.payload.evidence.profileVersion ||
          !operationalEvidenceFresh(result.data.serverTime, now, MARKETPLACE_HEARTBEAT_MAX_AGE_MS))
        throw unavailable();
      return result.data;
    }
    case "observe": {
      const result = marketplaceBridgeResponseSchemas.observe.safeParse(value);
      if (!result.success ||
          !operationalEvidenceFresh(result.data.receivedAt, now, MARKETPLACE_HEARTBEAT_MAX_AGE_MS))
        throw unavailable();
      return result.data;
    }
    case "claim": {
      const result = marketplaceBridgeResponseSchemas.claim.safeParse(value);
      if (!result.success) throw unavailable();
      const command = result.data.command;
      if (command && (Date.parse(command.leaseExpiresAt) <= now ||
          (command.mode === "execute" && command.expectedState === "cancelled"))) throw unavailable();
      return result.data;
    }
    case "result": {
      const result = marketplaceBridgeResponseSchemas.result.safeParse(value);
      if (!result.success || result.data.commandId !== input.payload.commandId ||
          (result.data.status === "confirmed" && input.payload.outcome !== "confirmed")) throw unavailable();
      return result.data;
    }
  }
}

/** No browser session, raw bearer, client tenant or unverified success enters the store. */
export async function handleMarketplaceBridgeRequest(
  request: Request,
  env: MealDeckRuntimeEnv,
  store?: MarketplaceBridgeStore,
  clock: () => number = Date.now,
): Promise<Response> {
  try {
    if (request.method !== "POST") return Response.json(
      { error: "method_not_allowed" }, { status: 405, headers: { ...NO_STORE, Allow: "POST" } },
    );
    if (request.headers.has("Origin") || request.headers.has("Cookie") ||
        request.headers.has("Sec-Fetch-Site") || request.headers.has("Sec-Fetch-Mode") ||
        request.headers.has("Sec-Fetch-Dest") || request.headers.has("Sec-Fetch-User"))
      throw problem("bridge_not_authorised", "Use the provisioned machine bridge.", 403);
    const bearer = request.headers.get("Authorization") ?? "";
    if (!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(bearer))
      throw problem("bridge_not_authorised", "Bridge authentication is required.", 401);
    if (!marketplaceBridgeEnabled(env) || typeof store !== "function")
      throw problem("bridge_unconfigured", "The marketplace bridge has not been commissioned.", 503);
    const config = readMealDeckRuntimeConfig(env, "luton");
    if (!config) throw problem("bridge_unconfigured", "The dedicated kitchen connection needs setup.", 503);

    if (request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json")
      throw problem("invalid_request", "Use a JSON request.", 415);
    const declared = request.headers.get("Content-Length");
    if (declared !== null && !/^\d+$/.test(declared))
      throw problem("invalid_request", "Check the request length.", 400);

    const input = marketplaceBridgeRequestSchema.safeParse(await readPaymentInput(request, 256_000));
    if (!input.success) throw invalidObservation();
    checkObservationTime(input.data, clock());
    const tokenHash = createHash("sha256").update(bearer.slice(7), "utf8").digest("hex");
    // The store is the authority. Its raw errors never leave this boundary.
    let value: unknown;
    try {
      value = await store({ tenantId: config.tenantId, locationId: config.locationId }, tokenHash, input.data);
    } catch {
      throw unavailable();
    }
    return Response.json(verifiedReply(input.data, value, clock()), { headers: NO_STORE });
  } catch (error) {
    const failure = error instanceof CheckoutProblem ? error : unavailable();
    return Response.json({ error: failure.code, message: failure.message },
      { status: failure.status, headers: NO_STORE });
  }
}
