import { describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import {
  handleMarketplaceBridgeRequest,
  marketplaceBridgeEnabled,
} from "../src/lib/mealdeck-marketplace-bridge.server";
import {
  marketplaceBridgeRequestSchema,
  marketplaceObservationSchema,
} from "../src/lib/mealdeck-marketplace-protocol";

// All identifiers/credentials are disposable fixtures. No request reaches a real provider/database.
const connectorId = "00000000-0000-4000-8000-000000000001";
const tenantId = "00000000-0000-4000-8000-000000000002";
const locationId = "00000000-0000-4000-8000-000000000003";
const commandId = "00000000-0000-4000-8000-000000000004";
const leaseToken = "00000000-0000-4000-8000-000000000005";
const token = "fixture_bridge_token_".repeat(3);
const evidence = { profileId: "offline-fixture", profileVersion: "1" };
const now = "2026-11-07T12:00:00Z";
const env = {
  MEALDECK_SUPABASE_URL: "https://marketplacefixture.supabase.co",
  MEALDECK_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${randomBytes(24).toString("base64url")}`,
  MEALDECK_CHECKOUT_SERVER_KEY: `sb_secret_${randomBytes(24).toString("base64url")}`,
  MEALDECK_TENANT_ID: tenantId,
  MEALDECK_LUTON_LOCATION_ID: locationId,
  MEALDECK_MARKETPLACE_BRIDGE_ENABLED: "true",
  MEALDECK_MARKETPLACE_BRIDGE_APPROVAL: "signed-off",
};
const capabilities = { accept: true, preparing: false, ready: true, handover: false };
const observation = {
  platform: "uber_eats",
  externalStoreId: "fixture-store",
  externalOrderId: "fixture-stable-order",
  displayReference: "00Ab9",
  state: "new",
  fulfilment: "platform_delivery",
  paymentResponsibility: "platform",
  currency: "GBP",
  totalPence: 1599,
  placedAt: now,
  observedAt: now,
  evidence,
  items: [
    {
      externalLineId: "line-1",
      name: "Fixture burger",
      quantity: 2,
      unitPricePence: 700,
      modifiers: [{ name: "Extra cheese", quantity: 1 }],
      notes: "No onions",
    },
  ],
  notes: "Pack drinks separately",
};
const forbiddenFetch = (async () => {
  throw new Error("No network in isolated bridge test");
}) as typeof fetch;
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://mealdeck.co.uk/api/marketplace/bridge", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...headers },
    body: JSON.stringify(body),
  });

describe("marketplace observation authority", () => {
  test("preserves original letters/leading zeroes, nullable known prices and complete extras", () => {
    const parsed = marketplaceObservationSchema.parse(observation);
    expect(parsed.displayReference).toBe("00Ab9");
    expect(parsed.items[0]?.modifiers).toEqual([{ name: "Extra cheese", quantity: 1 }]);
    expect(parsed.items[0]?.notes).toBe("No onions");
    const unknownPrice = structuredClone(observation) as Record<string, unknown>;
    unknownPrice.items = [{ ...observation.items[0], unitPricePence: null }];
    expect(marketplaceObservationSchema.safeParse(unknownPrice).success).toBe(true);
  });

  test("refuses fabricated payment flags, browser tenant selection, incomplete lines and lossy references", () => {
    for (const changed of [
      { ...observation, paid: true },
      { ...observation, paymentResponsibility: "cash" },
      { ...observation, tenantId },
      { ...observation, displayReference: 1234 },
      { ...observation, totalPence: 15.99 },
      { ...observation, items: [] },
      { ...observation, items: [observation.items[0], observation.items[0]] },
      { ...observation, notes: "Hidden\u202einstruction" },
      { ...observation, currency: "USD" },
    ])
      expect(marketplaceObservationSchema.safeParse(changed).success).toBe(false);
  });

  test("confirmation requires a matching-order readback shape, not just click success", () => {
    const base = {
      op: "result",
      connectorId,
      payload: { commandId, leaseToken, evidence, outcome: "confirmed" },
    };
    expect(marketplaceBridgeRequestSchema.safeParse(base).success).toBe(false);
    expect(
      marketplaceBridgeRequestSchema.safeParse({
        ...base,
        payload: {
          ...base.payload,
          externalStoreId: "fixture-store",
          externalOrderId: "fixture-stable-order",
          displayReference: "00Ab9",
          observedAt: now,
          observedState: "accepted",
        },
      }).success,
    ).toBe(true);
    expect(
      marketplaceBridgeRequestSchema.safeParse({
        ...base,
        payload: { ...base.payload, outcome: "uncertain" },
      }).success,
    ).toBe(true);
  });
});

describe("machine bridge HTTP boundary", () => {
  test("default OFF and partial configuration never calls the store", async () => {
    expect(marketplaceBridgeEnabled({})).toBe(false);
    for (const changed of [
      {},
      { ...env, MEALDECK_MARKETPLACE_BRIDGE_ENABLED: "false" },
      { ...env, MEALDECK_MARKETPLACE_BRIDGE_APPROVAL: undefined },
    ]) {
      const result = await handleMarketplaceBridgeRequest(
        request({ op: "claim", connectorId, payload: { evidence } }),
        changed,
        forbiddenFetch,
        async () => {
          throw new Error("Disabled bridge reached store");
        },
      );
      expect(result.status).toBe(503);
      expect((await result.json()).error).toBe("bridge_unconfigured");
    }
  });

  test("only server scope and a one-way credential hash reach the protected RPC", async () => {
    let called = false;
    const result = await handleMarketplaceBridgeRequest(
      request({ op: "observe", connectorId, payload: observation }),
      env,
      forbiddenFetch,
      async (scope, hash, input) => {
        called = true;
        expect(scope).toEqual({ tenantId, locationId });
        expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
        expect(hash).not.toBe(token);
        expect(input.op).toBe("observe");
        return {
          ok: true,
          orderId: commandId,
          replayed: false,
          held: false,
          platformState: "new",
          receivedAt: now,
        };
      },
    );
    expect(called).toBe(true);
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toContain("no-store");
    expect(await result.text()).not.toContain(token);
  });

  test("rejects browser-origin requests and missing machine tokens before calling a store", async () => {
    for (const headers of [
      { Origin: "https://mealdeck.co.uk" },
      { Authorization: "" },
      { Authorization: "Bearer short" },
    ]) {
      const result = await handleMarketplaceBridgeRequest(
        request({ op: "claim", connectorId, payload: { evidence } }, headers),
        env,
        forbiddenFetch,
      );
      expect([401, 403]).toContain(result.status);
    }
  });

  test("limits streamed request bodies even without Content-Length", async () => {
    const result = await handleMarketplaceBridgeRequest(
      request({
        op: "observe",
        connectorId,
        payload: { ...observation, notes: "x".repeat(260_000) },
      }),
      env,
      forbiddenFetch,
    );
    expect(result.status).toBe(413);
  });

  test("does not turn an unvalidated backend response into success", async () => {
    const result = await handleMarketplaceBridgeRequest(
      request({ op: "claim", connectorId, payload: { evidence } }),
      env,
      forbiddenFetch,
      async () => ({ command: null, token_hash: "sensitive" }),
    );
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("sensitive");
  });

  test("sanitizes denied credentials and uncertain leases without raw provider/DB details", async () => {
    for (const [message, status] of [
      [`mealdeck_marketplace_forbidden ${token}`, 403],
      [`mealdeck_marketplace_lease_expired ${token}`, 409],
      [`internal secret ${token}`, 503],
    ] as const) {
      const result = await handleMarketplaceBridgeRequest(
        request({ op: "claim", connectorId, payload: { evidence } }),
        env,
        forbiddenFetch,
        async () => {
          throw new Error(message);
        },
      );
      expect(result.status).toBe(status);
      expect(await result.text()).not.toContain(token);
    }
  });

  test("uses the named service RPC and never forwards the bearer to Supabase", async () => {
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(
        `${env.MEALDECK_SUPABASE_URL}/rest/v1/rpc/mealdeck_marketplace_bridge`,
      );
      expect(new Headers(init?.headers).get("Authorization")).not.toContain(token);
      const body = JSON.parse(String(init?.body));
      expect(body.p_tenant).toBe(tenantId);
      expect(body.p_location).toBe(locationId);
      expect(body.p_connector).toBe(connectorId);
      expect(body.p_operation).toBe("heartbeat");
      expect(body.p_token_hash).toBe(createHash("sha256").update(token).digest("hex"));
      return Response.json({
        ok: true,
        platform: "uber_eats",
        externalStoreId: "fixture-store",
        profileId: evidence.profileId,
        profileVersion: evidence.profileVersion,
        capabilities,
        enabled: true,
        serverTime: now,
      });
    }) as typeof fetch;
    const result = await handleMarketplaceBridgeRequest(
      request({
        op: "heartbeat",
        connectorId,
        payload: { evidence, observedAt: now, status: "healthy", capabilities },
      }),
      env,
      fetcher,
    );
    expect(result.status).toBe(200);
  });
});
