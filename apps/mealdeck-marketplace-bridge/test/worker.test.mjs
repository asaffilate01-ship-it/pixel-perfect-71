import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { FixtureTransport, fixtureProfile } from "../demo/fixture.mjs";
import { UberEatsAdapter } from "../src/adapters.mjs";
import { BridgeWorker } from "../src/worker.mjs";
import { BridgeClient } from "../src/client.mjs";

async function setup(mode = "live") {
  const fixture = new FixtureTransport();
  const profile = fixtureProfile("uber_eats");
  const adapter = new UberEatsAdapter(fixture, profile, "fixture-store");
  const [order] = await adapter.scan();
  const records = new Map();
  const health = [];
  const journal = {
    get: (key) => records.get(key),
    put: async (key, value) => records.set(key, value),
    health: async (value) => health.push(value),
  };
  const calls = [];
  const command = {
    ...order,
    commandId: randomUUID(),
    leaseToken: randomUUID(),
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    mode: "execute",
    action: "accept",
    expectedState: "new",
  };
  const client = {
    heartbeat: async () => ({ capabilities: adapter.capabilities() }),
    observe: async (observation) => {
      calls.push(["observe", observation.externalOrderId]);
      return { ok: true, held: false };
    },
    claim: async () => {
      calls.push(["claim"]);
      return command;
    },
    result: async (result) => {
      calls.push(["result", result.outcome]);
      return {
        ok: true,
        commandId: result.commandId,
        status: result.outcome === "confirmed" ? "confirmed" : "needs_checking",
      };
    },
  };
  const config = { mode, profile, pollIntervalMs: 1000 };
  const worker = new BridgeWorker({ config, adapter, client, journal });
  return { fixture, profile, adapter, order, command, journal, client, worker, health, calls };
}

test("observe mode imports without ever claiming or applying merchant commands", async () => {
  const s = await setup("observe");
  const health = await s.worker.tick();
  assert.equal(health.status, "healthy");
  assert.equal(health.ordersObserved, 1);
  assert.equal(
    s.calls.some((call) => call[0] === "claim"),
    false,
  );
  assert.equal(s.fixture.mutationClicks, 0);
});

test("stopping while a scan is in flight does not claim or dispatch later work", async () => {
  const s = await setup();
  const abort = new AbortController();
  s.adapter.scan = async () => {
    abort.abort();
    return [s.order];
  };
  const health = await s.worker.tick(abort.signal);
  assert.equal(health.status, "stopped");
  assert.equal(
    s.calls.some((call) => call[0] === "claim" || call[0] === "observe"),
    false,
  );
  assert.equal(s.fixture.mutationClicks, 0);
});

test("one cancelled or changed held order does not starve another order or its command", async () => {
  const s = await setup();
  const held = {
    ...s.order,
    externalOrderId: "cancelled-fixture-order",
    displayReference: "CANCELLED",
    state: "cancelled",
  };
  s.adapter.scan = async () => [held, s.order];
  s.client.observe = async (order) => {
    s.calls.push(["observe", order.externalOrderId]);
    return { ok: true, held: order.externalOrderId === held.externalOrderId };
  };
  const health = await s.worker.tick();
  assert.equal(health.status, "healthy");
  assert.equal(health.heldOrders, 1);
  assert.equal(health.ordersObserved, 2);
  assert.equal(s.fixture.mutationClicks, 1);
  assert.equal(health.commandStatus, "confirmed");
});

test("held command target is not applied but the connection remains available for other orders", async () => {
  const s = await setup();
  s.client.observe = async () => ({ ok: true, held: true });
  const health = await s.worker.tick();
  assert.equal(health.status, "healthy");
  assert.equal(health.heldOrders, 1);
  assert.equal(health.commandStatus, "needs_checking");
  assert.equal(s.fixture.mutationClicks, 0);
});

test("wrong logged-in store degrades the connector without importing or claiming", async () => {
  const s = await setup();
  s.fixture.store.text = "another-store";
  const health = await s.worker.tick();
  assert.equal(health.status, "degraded");
  assert.equal(health.errorCode, "identity_mismatch");
  assert.deepEqual(s.calls, []);
});

test("server-disabled capability cannot dispatch even when the local profile has a button", async () => {
  const s = await setup();
  s.client.heartbeat = async () => ({
    capabilities: { accept: false, preparing: false, ready: false, handover: false },
  });
  await s.worker.tick();
  assert.equal(s.fixture.mutationClicks, 0);
  assert.ok(s.calls.some((call) => call[0] === "result" && call[1] === "unsupported"));
});

function clientSetup(reply) {
  const profile = fixtureProfile("uber_eats");
  const config = {
    serverUrl: "https://mealdeck.example/",
    connectorId: randomUUID(),
    profile,
    externalStoreId: "fixture-store",
    tokenEnvironment: "MEALDECK_FIXTURE_TOKEN",
  };
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    return Response.json(reply);
  };
  const client = new BridgeClient(config, {
    environment: { MEALDECK_FIXTURE_TOKEN: "x".repeat(43) },
    fetchImpl,
  });
  return { config, client, requests };
}

test("client uses the scoped envelope, server-only bearer header and no redirect following", async () => {
  const { config, client, requests } = clientSetup({ command: null });
  assert.equal(await client.claim(), null);
  assert.equal(requests[0].url, "https://mealdeck.example/api/marketplace/bridge");
  assert.equal(requests[0].init.redirect, "error");
  assert.equal(requests[0].init.headers.Authorization, `Bearer ${"x".repeat(43)}`);
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    op: "claim",
    connectorId: config.connectorId,
    payload: {
      evidence: {
        profileId: config.profile.profileId,
        profileVersion: config.profile.profileVersion,
      },
    },
  });
  assert.equal(requests[0].url.includes("xxx"), false);
});

test("server time anchors lease decisions and wrong returned store/profile is rejected", async () => {
  const s = clientSetup({
    ok: true,
    enabled: true,
    platform: "uber_eats",
    externalStoreId: "fixture-store",
    profileId: "offline-uber_eats-fixture",
    profileVersion: "1",
    capabilities: { accept: true, preparing: false, ready: true, handover: true },
    serverTime: new Date(Date.now() + 10_000).toISOString(),
  });
  const before = Date.now();
  await s.client.heartbeat({});
  assert.ok(s.client.serverNow() >= before + 9900);
  s.client.fetch = async () =>
    Response.json({
      ok: true,
      enabled: true,
      platform: "uber_eats",
      externalStoreId: "other",
      profileId: s.config.profile.profileId,
      profileVersion: "1",
    });
  await assert.rejects(s.client.heartbeat({}), /identity_mismatch/);
});

test("HTTP failures never expose upstream error bodies or secrets", async () => {
  const s = clientSetup({});
  s.client.fetch = async () => new Response("secret customer detail", { status: 500 });
  await assert.rejects(s.client.claim(), (error) => error.message === "bridge_error");
});
