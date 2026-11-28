import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  handleMarketplaceBridgeRequest,
  type MarketplaceBridgeStore,
} from "../src/lib/mealdeck-marketplace-bridge.server";

const tenantId = "00000000-0000-4000-8000-000000000001";
const locationId = "00000000-0000-4000-8000-000000000002";
const connectorId = "00000000-0000-4000-8000-000000000003";
const commandId = "00000000-0000-4000-8000-000000000004";
const leaseToken = "00000000-0000-4000-8000-000000000005";
const token = "fixture_bridge_token_".repeat(3);
const now = Date.parse("2026-11-28T07:00:00Z");
const stamp = new Date(now).toISOString();
const clock = () => now;
const env = {
  MEALDECK_SUPABASE_URL: "https://marketplacefixture.supabase.co",
  MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_" + "x".repeat(24),
  MEALDECK_TENANT_ID: tenantId,
  MEALDECK_LUTON_LOCATION_ID: locationId,
  MEALDECK_MARKETPLACE_BRIDGE_ENABLED: "true",
  MEALDECK_MARKETPLACE_BRIDGE_APPROVAL: "signed-off",
};
const evidence = { profileId: "offline-fixture", profileVersion: "1" };
const identity = { externalStoreId: "store-01", externalOrderId: "order-001", displayReference: "00Ab-19" };
const capabilities = { accept: true, preparing: false, ready: true, handover: false };
const claim = { op: "claim", connectorId, payload: { evidence } };
const heartbeat = { op: "heartbeat", connectorId, payload: { evidence, status: "healthy", observedAt: stamp, capabilities } };
const observation = { platform: "uber_eats", ...identity, state: "new", fulfilment: "platform_delivery",
  paymentResponsibility: "platform", currency: "GBP", totalPence: 1599, placedAt: stamp, observedAt: stamp,
  evidence, items: [{ externalLineId: "line-1", name: "Fixture burger", quantity: 1, unitPricePence: null, modifiers: [] }] };
const request = (value: unknown, headers: Record<string, string> = {}) =>
  new Request("https://mealdeck.co.uk/api/marketplace/bridge", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...headers },
    body: JSON.stringify(value),
  });

describe("Unmounted marketplace machine admission", () => {
  test("default off, missing approval and absent store all fail closed", async () => {
    let calls = 0;
    const store: MarketplaceBridgeStore = async () => { calls++; return { command: null }; };
    for (const config of [{}, { ...env, MEALDECK_MARKETPLACE_BRIDGE_APPROVAL: "" },
      { ...env, MEALDECK_MARKETPLACE_BRIDGE_ENABLED: "false" }, { ...env, MEALDECK_LUTON_LOCATION_ID: "" }]) {
      expect((await handleMarketplaceBridgeRequest(request(claim), config, store, clock)).status).toBe(503);
    }
    expect((await handleMarketplaceBridgeRequest(request(claim), env, undefined, clock)).status).toBe(503);
    expect(calls).toBe(0);
  });

  test("browser transport, cookies, invalid token and wrong methods never reach the store", async () => {
    let calls = 0;
    const store: MarketplaceBridgeStore = async () => { calls++; return { command: null }; };
    for (const header of [{ Origin: "https://mealdeck.co.uk" }, { Cookie: "fixture=1" },
      { "Sec-Fetch-Site": "same-origin" }, { "Sec-Fetch-Mode": "cors" }]) {
      expect((await handleMarketplaceBridgeRequest(request(claim, header as Record<string, string>), env, store, clock)).status).toBe(403);
    }
    expect((await handleMarketplaceBridgeRequest(request(claim, { Authorization: "Bearer short" }), env, store, clock)).status).toBe(401);
    const wrongMethod = await handleMarketplaceBridgeRequest(new Request("https://mealdeck.co.uk"), env, store, clock);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("Allow")).toBe("POST");
    expect(calls).toBe(0);
  });

  test("only configured scope, one-way token hash and validated input reach the store", async () => {
    let calls = 0;
    const store: MarketplaceBridgeStore = async (scope, hash, input) => {
      calls++;
      expect(scope).toEqual({ tenantId, locationId });
      expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
      expect(hash).not.toBe(token);
      expect(input).toEqual(claim);
      return { command: null };
    };
    const response = await handleMarketplaceBridgeRequest(request(claim), env, store, clock);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toEqual({ command: null });
    expect(calls).toBe(1);
  });

  test("rejects client-supplied scope, malformed media and excessive bodies before store access", async () => {
    let calls = 0;
    const store: MarketplaceBridgeStore = async () => { calls++; return {}; };
    expect((await handleMarketplaceBridgeRequest(request({ ...claim, tenantId }), env, store, clock)).status).toBe(400);
    expect((await handleMarketplaceBridgeRequest(request(claim, { "Content-Type": "application/jsonx" }), env, store, clock)).status).toBe(415);
    expect((await handleMarketplaceBridgeRequest(request(claim, { "Content-Length": "garbage" }), env, store, clock)).status).toBe(400);
    expect((await handleMarketplaceBridgeRequest(request({ ...claim, padding: "x".repeat(260_000) }), env, store, clock)).status).toBe(413);
    expect(calls).toBe(0);
  });

  test("stale, future and chronologically impossible observations are rejected", async () => {
    let calls = 0;
    const store: MarketplaceBridgeStore = async () => { calls++; return {}; };
    for (const payload of [
      { ...observation, observedAt: new Date(now - 90_001).toISOString() },
      { ...observation, observedAt: new Date(now + 5_001).toISOString() },
      { ...observation, placedAt: new Date(now + 1).toISOString() },
    ]) {
      expect((await handleMarketplaceBridgeRequest(request({ op: "observe", connectorId, payload }), env, store, clock)).status).toBe(400);
    }
    expect(calls).toBe(0);
  });

  test("heartbeat must match the reviewed profile and current server time", async () => {
    const reply = { ok: true, platform: "uber_eats", externalStoreId: identity.externalStoreId,
      ...evidence, capabilities, enabled: true, serverTime: stamp };
    expect((await handleMarketplaceBridgeRequest(request(heartbeat), env, async () => reply, clock)).status).toBe(200);
    for (const changed of [{ ...reply, profileId: "another-profile" },
      { ...reply, profileVersion: "2" }, { ...reply, serverTime: new Date(now - 90_001).toISOString() },
      { ...reply, token_hash: "private" }]) {
      expect((await handleMarketplaceBridgeRequest(request(heartbeat), env, async () => changed, clock)).status).toBe(503);
    }
  });

  test("expired and cancelled execute commands cannot leave the boundary", async () => {
    const command = { commandId, leaseToken, leaseExpiresAt: new Date(now + 30_000).toISOString(),
      mode: "execute", platform: "uber_eats", ...identity, action: "accept", expectedState: "new" };
    expect((await handleMarketplaceBridgeRequest(request(claim), env, async () => ({ command }), clock)).status).toBe(200);
    for (const changed of [{ ...command, leaseExpiresAt: stamp }, { ...command, expectedState: "cancelled" }]) {
      expect((await handleMarketplaceBridgeRequest(request(claim), env, async () => ({ command: changed }), clock)).status).toBe(503);
    }
  });

  test("uncertain or mismatched command results never become successful confirmations", async () => {
    const payload = { commandId, leaseToken, evidence, ...identity, observedAt: stamp,
      outcome: "confirmed", observedState: "accepted" };
    const resultRequest = (patch: Record<string, unknown> = {}) => request({ op: "result", connectorId, payload: { ...payload, ...patch } });
    const reply = { ok: true, commandId, status: "confirmed" };
    expect((await handleMarketplaceBridgeRequest(resultRequest(), env, async () => reply, clock)).status).toBe(200);
    expect((await handleMarketplaceBridgeRequest(resultRequest({ outcome: "uncertain" }), env, async () => reply, clock)).status).toBe(503);
    expect((await handleMarketplaceBridgeRequest(resultRequest(), env, async () => ({ ...reply, commandId: connectorId }), clock)).status).toBe(503);
    expect((await handleMarketplaceBridgeRequest(resultRequest({ observedState: "new" }), env, async () => reply, clock)).status).toBe(400);
  });

  test("raw provider errors and credential fields are never exposed", async () => {
    const response = await handleMarketplaceBridgeRequest(request(claim), env, async () => { throw new Error(token + " private database detail"); }, clock);
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain(token);
    expect(body).not.toContain("private database detail");
    expect((await handleMarketplaceBridgeRequest(request(claim), env, async () => ({ command: null, token_hash: token }), clock)).status).toBe(503);
  });
});
