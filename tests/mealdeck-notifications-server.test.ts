import { describe, expect, test } from "bun:test";
import { createECDH, createHash, randomBytes } from "node:crypto";
import webPush from "web-push";
import {
  handleCustomerNotificationsRequest,
  handleCustomerPushWorker,
  handleNotificationCampaignRequest,
} from "../src/lib/mealdeck-notifications.server";
import type { MealDeckRuntimeEnv } from "../src/lib/mealdeck-runtime-config";
import type { PushSendOutcome } from "../src/lib/mealdeck-web-push.server";

// Synthetic identities and injected fetch only. These tests never contact Auth,
// a database, a push provider, or a customer's actual subscription.
const uid = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const origin = "https://mealdeck.example.test";
const database = "https://pushfixture.supabase.co";
const keys = webPush.generateVAPIDKeys();
const env = {
  MEALDECK_SUPABASE_URL: database,
  MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_push_fixture_public",
  MEALDECK_CHECKOUT_SERVER_KEY: "sb_secret_push_fixture_server",
  MEALDECK_TENANT_ID: uid(1),
  MEALDECK_LUTON_LOCATION_ID: uid(2),
  MEALDECK_WEB_PUSH_ENABLED: "true",
  MEALDECK_WEB_PUSH_PUBLIC_KEY: keys.publicKey,
  MEALDECK_WEB_PUSH_PRIVATE_KEY: keys.privateKey,
  MEALDECK_WEB_PUSH_SUBJECT: "mailto:push@example.test",
  MEALDECK_WEB_PUSH_WORKER_SECRET: "fixture_worker_" + "w".repeat(32),
};
const guestToken = "a1".repeat(32);
const memberHeader = "Bearer " + "member_fixture_".repeat(3);
const customer = uid(3);
const orderId = uid(4);
const guestCookie = `__Host-mealdeck_guest=${guestToken}`;
const receiver = createECDH("prime256v1");
receiver.generateKeys();
const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/fixture_subscription",
  keys: {
    p256dh: receiver.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  },
};
const orderPayload = {
  type: "order_update",
  stage: "preparing",
  fulfilment: "pickup",
  checkoutMode: "guest",
  orderId,
  notificationId: uid(5),
};
type Json = Record<string, unknown>;
type Call = { path: string; headers: Headers; args: Json };
type Reply = Json | Response;

function fixture() {
  const calls: Call[] = [];
  const state = {
    authValid: true,
    confirmed: true,
    anonymous: false,
    pushReady: true,
    connected: true,
    expiresAt: "2026-11-08T12:00:00Z",
    orderError: null as string | null,
  };
  const rpc = new Map<string, (args: Json) => Reply | Promise<Reply>>();
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    const args = typeof init?.body === "string" ? (JSON.parse(init.body) as Json) : {};
    calls.push({ path: url.pathname, headers, args });
    if (url.origin !== database)
      throw new Error("Unexpected external request in notification fixture.");
    if (url.pathname === "/auth/v1/user") {
      if (!state.authValid)
        return Response.json({ message: "Invalid fixture token" }, { status: 401 });
      return Response.json({
        id: customer,
        email: "customer@example.test",
        email_confirmed_at: state.confirmed ? "2026-11-01T12:00:00Z" : null,
        is_anonymous: state.anonymous,
      });
    }
    const name = url.pathname.split("/").at(-1)!;
    const handler = rpc.get(name);
    if (handler) {
      const result = await handler(args);
      return result instanceof Response ? result : Response.json(result);
    }
    if (name === "mealdeck_customer_capabilities")
      return Response.json({ pushReady: state.pushReady });
    if (name === "mealdeck_push_order_subscription") {
      if (state.orderError)
        return Response.json({ message: state.orderError, code: "P0001" }, { status: 400 });
      return Response.json({
        connected: state.connected,
        expiresAt: state.expiresAt,
        privateDatabaseField: "must never reach the customer response",
      });
    }
    throw new Error(`Unexpected fixture RPC ${name}`);
  }) as typeof fetch;
  return { calls, state, rpc, fetcher };
}

function customerRequest(
  body: unknown,
  headers: Record<string, string> = {},
  requestOrigin: string | null = origin,
) {
  return new Request(`${origin}/api/notifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(requestOrigin ? { Origin: requestOrigin } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
function workerRequest(authorization = `Bearer ${env.MEALDECK_WEB_PUSH_WORKER_SECRET}`) {
  return new Request(`${origin}/api/notifications/worker`, {
    method: "POST",
    headers: { Authorization: authorization },
  });
}
const orderCalls = (calls: Call[]) =>
  calls.filter((call) => call.path.endsWith("/mealdeck_push_order_subscription"));
const finishCalls = (calls: Call[]) =>
  calls.filter((call) => call.path.endsWith("/mealdeck_push_finish"));

function queuedJobs(f: ReturnType<typeof fixture>, preflights: Json[]) {
  const pending = preflights.map((current, index) => ({
    jobId: uid(100 + index),
    leaseToken: uid(200 + index),
    current,
  }));
  const all = [...pending];
  f.rpc.set("mealdeck_push_claim", () => {
    const job = pending.shift();
    return { jobs: job ? [{ jobId: job.jobId, leaseToken: job.leaseToken }] : [] };
  });
  f.rpc.set("mealdeck_push_preflight", (args) => {
    const job = all.find((candidate) => candidate.jobId === args["p_job"]);
    expect(job).toBeDefined();
    expect(args["p_lease"]).toBe(job!.leaseToken);
    return job!.current;
  });
  f.rpc.set("mealdeck_push_finish", () => ({ recorded: true }));
  return all;
}

describe("Per-order mobile notification access", () => {
  test("unauthenticated availability exposes only the public key and never caches private state", async () => {
    const f = fixture();
    const response = await handleCustomerNotificationsRequest(
      new Request(`${origin}/api/notifications`),
      env,
      f.fetcher,
    );
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(body)).toEqual({ available: true, publicKey: keys.publicKey });
    for (const secret of [
      keys.privateKey,
      env.MEALDECK_CHECKOUT_SERVER_KEY,
      env.MEALDECK_WEB_PUSH_WORKER_SECRET,
    ])
      expect(body).not.toContain(secret);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Vary")).toBe("Authorization, Cookie");
    expect(f.calls.map((call) => call.path)).toEqual([
      "/rest/v1/rpc/mealdeck_customer_capabilities",
    ]);
    expect(f.calls[0]!.headers.get("apikey")).toBe(env.MEALDECK_SUPABASE_PUBLISHABLE_KEY);
  });

  test("database readiness is required even with valid sender keys", async () => {
    const f = fixture();
    f.state.pushReady = false;
    const response = await handleCustomerNotificationsRequest(
      new Request(`${origin}/api/notifications`),
      env,
      f.fetcher,
    );
    expect(await response.json()).toEqual({ available: false, publicKey: null });
  });

  test("missing or cross-site Origin cannot mutate a subscription", async () => {
    for (const request of [
      customerRequest(
        { action: "subscribe", orderId, subscription },
        { Cookie: guestCookie },
        null,
      ),
      customerRequest(
        { action: "subscribe", orderId, subscription },
        { Cookie: guestCookie },
        "https://evil.example",
      ),
      customerRequest(
        { action: "unsubscribe", orderId, endpoint: subscription.endpoint },
        { Cookie: guestCookie, "Sec-Fetch-Site": "cross-site" },
      ),
    ]) {
      const f = fixture();
      const response = await handleCustomerNotificationsRequest(request, env, f.fetcher);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: "invalid_origin" });
      expect(f.calls).toHaveLength(0);
    }
  });

  test("a supplied invalid member bearer never falls back to the valid guest cookie", async () => {
    for (const authorization of ["", "Bearer short", memberHeader]) {
      const f = fixture();
      f.state.authValid = false;
      const response = await handleCustomerNotificationsRequest(
        customerRequest(
          { action: "subscribe", orderId, subscription },
          { Authorization: authorization, Cookie: guestCookie },
        ),
        env,
        f.fetcher,
      );
      expect(response.status).toBe(401);
      expect(orderCalls(f.calls)).toHaveLength(0);
      expect(f.calls.every((call) => call.path === "/auth/v1/user")).toBe(true);
    }
  });

  test("unverified and anonymous Auth identities cannot subscribe", async () => {
    for (const patch of [{ confirmed: false }, { anonymous: true }]) {
      const f = fixture();
      Object.assign(f.state, patch);
      const response = await handleCustomerNotificationsRequest(
        customerRequest(
          { action: "subscribe", orderId, subscription },
          { Authorization: memberHeader, Cookie: guestCookie },
        ),
        env,
        f.fetcher,
      );
      expect(response.status).toBe(401);
      expect(orderCalls(f.calls)).toHaveLength(0);
    }
  });

  test("guest access binds the selected order to a hash and never forwards the raw cookie", async () => {
    const f = fixture();
    const response = await handleCustomerNotificationsRequest(
      customerRequest({ action: "subscribe", orderId, subscription }, { Cookie: guestCookie }),
      env,
      f.fetcher,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      available: true,
      enabled: true,
      expiresAt: f.state.expiresAt,
    });
    const call = orderCalls(f.calls)[0]!;
    expect(call.args).toMatchObject({
      p_tenant: uid(1),
      p_location: uid(2),
      p_order: orderId,
      p_actor: null,
      p_guest_hash: createHash("sha256").update(guestToken).digest("hex"),
      p_action: "subscribe",
      p_endpoint: subscription.endpoint,
      p_p256dh: subscription.keys.p256dh,
      p_auth: subscription.keys.auth,
    });
    expect(call.headers.get("apikey")).toBe(env.MEALDECK_CHECKOUT_SERVER_KEY);
    expect(f.calls.every((item) => !item.headers.has("Cookie"))).toBe(true);
    expect(JSON.stringify(f.calls)).not.toContain(guestToken);
    expect(f.calls.some((item) => item.path === "/auth/v1/user")).toBe(false);
  });

  test("verified member identity wins over a coexisting guest session", async () => {
    const f = fixture();
    const response = await handleCustomerNotificationsRequest(
      customerRequest(
        { action: "status", orderId },
        { Authorization: memberHeader, Cookie: guestCookie },
      ),
      env,
      f.fetcher,
    );
    expect(response.status).toBe(200);
    expect(orderCalls(f.calls)[0]!.args).toMatchObject({
      p_actor: customer,
      p_guest_hash: null,
      p_order: orderId,
      p_action: "state",
    });
    expect(f.calls[0]!.headers.get("Authorization")).toBe(memberHeader);
  });

  test("missing, ambiguous, or malformed guest sessions are rejected without database access", async () => {
    for (const cookie of ["", "__Host-mealdeck_guest=bad", `${guestCookie}; ${guestCookie}`]) {
      const f = fixture();
      const response = await handleCustomerNotificationsRequest(
        customerRequest({ action: "status", orderId }, { Cookie: cookie }),
        env,
        f.fetcher,
      );
      expect(response.status).toBe(401);
      expect(f.calls).toHaveLength(0);
    }
  });

  test("database refusal of a different order is preserved without leaking the database message", async () => {
    const f = fixture();
    f.state.orderError = `mealdeck_push_order_unavailable private endpoint ${subscription.endpoint}`;
    const response = await handleCustomerNotificationsRequest(
      customerRequest({ action: "status", orderId: uid(99) }, { Cookie: guestCookie }),
      env,
      f.fetcher,
    );
    expect(response.status).toBe(403);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ error: "order_unavailable" });
    expect(body).not.toContain(subscription.endpoint);
    expect(body).not.toContain("private endpoint");
    expect(orderCalls(f.calls)[0]!.args["p_order"]).toBe(uid(99));
  });

  test("disabling the sender keeps withdrawal working but prevents new subscriptions", async () => {
    const disabled: MealDeckRuntimeEnv = { ...env, MEALDECK_WEB_PUSH_ENABLED: "false" };
    const f = fixture();
    f.state.connected = false;
    const withdrawal = await handleCustomerNotificationsRequest(
      customerRequest(
        { action: "unsubscribe", orderId, endpoint: subscription.endpoint },
        { Cookie: guestCookie },
      ),
      disabled,
      f.fetcher,
    );
    expect(withdrawal.status).toBe(200);
    expect(await withdrawal.json()).toEqual({
      available: false,
      enabled: false,
      expiresAt: f.state.expiresAt,
    });
    expect(orderCalls(f.calls)[0]!.args["p_action"]).toBe("unsubscribe");
    const blocked = fixture();
    const response = await handleCustomerNotificationsRequest(
      customerRequest({ action: "subscribe", orderId, subscription }, { Cookie: guestCookie }),
      disabled,
      blocked.fetcher,
    );
    expect(response.status).toBe(503);
    expect(blocked.calls).toHaveLength(0);
  });

  test("browser-supplied actor and scope fields cannot override server authority", async () => {
    const f = fixture();
    const response = await handleCustomerNotificationsRequest(
      customerRequest(
        {
          action: "subscribe",
          orderId,
          subscription,
          actor: customer,
          tenantId: uid(99),
          guestHash: "forged",
        },
        { Cookie: guestCookie },
      ),
      env,
      f.fetcher,
    );
    expect(response.status).toBe(400);
    expect(f.calls).toHaveLength(0);
  });

  test("an oversized body is rejected before Auth or database access even without Content-Length", async () => {
    const f = fixture();
    const response = await handleCustomerNotificationsRequest(
      customerRequest(
        { action: "status", orderId, extra: "x".repeat(9000) },
        { Cookie: guestCookie },
      ),
      env,
      f.fetcher,
    );
    expect(response.status).toBe(413);
    expect(f.calls).toHaveLength(0);
  });
});

describe("Hosted notification credentials", () => {
  const hostedEnv: MealDeckRuntimeEnv = { ...env, MEALDECK_WEB_PUSH_ENABLED: undefined };
  const hostedConfig = {
    enabled: true,
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    subject: env.MEALDECK_WEB_PUSH_SUBJECT,
    workerSecret: env.MEALDECK_WEB_PUSH_WORKER_SECRET,
  };

  test("Vault configuration is read using the server's exact kitchen scope and only public availability leaves GET", async () => {
    const f = fixture();
    f.rpc.set("mealdeck_push_runtime_config", () => hostedConfig);
    const response = await handleCustomerNotificationsRequest(
      new Request(`${origin}/api/notifications`),
      hostedEnv,
      f.fetcher,
    );
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ available: true, publicKey: keys.publicKey });
    expect(f.calls[0]!.path).toBe("/rest/v1/rpc/mealdeck_push_runtime_config");
    expect(f.calls[0]!.args).toEqual({ p_tenant: uid(1), p_location: uid(2) });
    expect(f.calls[0]!.headers.get("apikey")).toBe(env.MEALDECK_CHECKOUT_SERVER_KEY);
    for (const secret of [
      keys.privateKey,
      hostedConfig.workerSecret,
      env.MEALDECK_CHECKOUT_SERVER_KEY,
    ])
      expect(body).not.toContain(secret);
  });

  test("an explicit off or broken environment configuration never falls back to a working Vault sender", async () => {
    for (const configuredEnv of [
      { ...env, MEALDECK_WEB_PUSH_ENABLED: "false" },
      { ...env, MEALDECK_WEB_PUSH_ENABLED: "" },
      { ...env, MEALDECK_WEB_PUSH_PRIVATE_KEY: "invalid" },
    ]) {
      const f = fixture();
      f.rpc.set("mealdeck_push_runtime_config", () => hostedConfig);
      const response = await handleCustomerNotificationsRequest(
        new Request(`${origin}/api/notifications`),
        configuredEnv,
        f.fetcher,
      );
      expect(await response.json()).toEqual({ available: false, publicKey: null });
      expect(f.calls).toHaveLength(0);
    }
  });

  test("disabled, invalid or unavailable Vault configuration cannot imply delivery readiness", async () => {
    for (const config of [
      { ...hostedConfig, enabled: false },
      { ...hostedConfig, privateKey: webPush.generateVAPIDKeys().privateKey },
      new Response(JSON.stringify({ message: `private database diagnostic ${keys.privateKey}` }), {
        status: 403,
      }),
    ]) {
      const f = fixture();
      f.rpc.set("mealdeck_push_runtime_config", () => config);
      const response = await handleCustomerNotificationsRequest(
        new Request(`${origin}/api/notifications`),
        hostedEnv,
        f.fetcher,
      );
      expect(await response.json()).toEqual({ available: false, publicKey: null });
      expect(f.calls).toHaveLength(1);
    }
  });

  test("only the Vault worker secret can claim jobs and report an authenticated worker heartbeat", async () => {
    const f = fixture();
    f.rpc.set("mealdeck_push_runtime_config", () => hostedConfig);
    queuedJobs(f, []);
    f.rpc.set("mealdeck_push_worker_seen", () => ({ recorded: true }));
    const rejected = await handleCustomerPushWorker(
      workerRequest("Bearer " + "x".repeat(40)),
      hostedEnv,
      f.fetcher,
    );
    expect(rejected.status).toBe(403);
    expect(f.calls.map((call) => call.path)).toEqual(["/rest/v1/rpc/mealdeck_push_runtime_config"]);
    const accepted = await handleCustomerPushWorker(workerRequest(), hostedEnv, f.fetcher);
    expect(await accepted.json()).toEqual({ processed: 0, accepted: 0, retried: 0, skipped: 0 });
    expect(f.calls.at(-1)!.path).toBe("/rest/v1/rpc/mealdeck_push_worker_seen");
    expect(f.calls.at(-1)!.args).toEqual({ p_tenant: uid(1), p_location: uid(2) });
  });
});

describe("Supervised notification worker", () => {
  test("a valid isolated worker bearer is required before any job can be claimed", async () => {
    for (const authorization of [
      "",
      memberHeader,
      `Bearer ${env.MEALDECK_WEB_PUSH_WORKER_SECRET.slice(0, -1)}x`,
    ]) {
      const f = fixture();
      const response = await handleCustomerPushWorker(workerRequest(authorization), env, f.fetcher);
      expect(response.status).toBe(403);
      expect(f.calls).toHaveLength(0);
    }
  });

  test("withdrawal at preflight suppresses a job already claimed", async () => {
    const f = fixture();
    const jobs = queuedJobs(f, [
      {
        send: false,
        reason: "consent_withdrawn",
        subscription,
        payload: orderPayload,
        ttlSeconds: 60,
      },
    ]);
    let sends = 0;
    const response = await handleCustomerPushWorker(workerRequest(), env, f.fetcher, {
      send: async () => {
        sends++;
        return { outcome: "accepted", status: 201 };
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 1, accepted: 0, retried: 0, skipped: 1 });
    expect(sends).toBe(0);
    expect(finishCalls(f.calls)).toHaveLength(0);
    expect(f.calls.find((call) => call.path.endsWith("/mealdeck_push_preflight"))?.args).toEqual({
      p_tenant: uid(1),
      p_location: uid(2),
      p_job: jobs[0]!.jobId,
      p_lease: jobs[0]!.leaseToken,
    });
  });

  test("provider acceptance, retry and expiry are recorded against each original lease with safe aggregate output", async () => {
    const f = fixture();
    const outcomes: PushSendOutcome[] = [
      { outcome: "accepted", status: 201 },
      { outcome: "retry", status: 429 },
      { outcome: "expired", status: 410 },
    ];
    const jobs = queuedJobs(
      f,
      outcomes.map(() => ({ send: true, subscription, payload: orderPayload, ttlSeconds: 45 })),
    );
    let sends = 0;
    const response = await handleCustomerPushWorker(workerRequest(), env, f.fetcher, {
      send: async (_config, actualSubscription, payload, ttl) => {
        expect(actualSubscription).toEqual(subscription);
        expect(payload).toEqual(orderPayload);
        expect(ttl).toBe(45);
        return outcomes[sends++]!;
      },
    });
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ processed: 3, accepted: 1, retried: 1, skipped: 0 });
    expect(sends).toBe(3);
    expect(finishCalls(f.calls).map((call) => call.args)).toEqual(
      jobs.map((job, index) => ({
        p_tenant: uid(1),
        p_location: uid(2),
        p_job: job.jobId,
        p_lease: job.leaseToken,
        p_outcome: outcomes[index]!.outcome,
        p_status: outcomes[index]!.status,
      })),
    );
    for (const value of [
      subscription.endpoint,
      subscription.keys.auth,
      env.MEALDECK_WEB_PUSH_WORKER_SECRET,
      "delivered",
      "read",
    ])
      expect(body).not.toContain(value);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  test("invalid queued endpoints and code-bearing payloads are never passed to a sender", async () => {
    const f = fixture();
    queuedJobs(f, [
      {
        send: true,
        subscription: { ...subscription, endpoint: "http://169.254.169.254/latest/meta-data" },
        payload: orderPayload,
        ttlSeconds: 60,
      },
      {
        send: true,
        subscription,
        payload: { ...orderPayload, handoffCode: "1234" },
        ttlSeconds: 60,
      },
    ]);
    let sends = 0;
    const response = await handleCustomerPushWorker(workerRequest(), env, f.fetcher, {
      send: async () => {
        sends++;
        return { outcome: "accepted", status: 201 };
      },
    });
    expect(await response.json()).toEqual({ processed: 2, accepted: 0, retried: 0, skipped: 0 });
    expect(sends).toBe(0);
    expect(
      finishCalls(f.calls).map((call) => [call.args["p_outcome"], call.args["p_status"]]),
    ).toEqual([
      ["failed", null],
      ["failed", null],
    ]);
  });

  test("one invocation cannot claim an unbounded queue", async () => {
    const f = fixture();
    queuedJobs(
      f,
      Array.from({ length: 25 }, () => ({ send: false })),
    );
    const response = await handleCustomerPushWorker(workerRequest(), env, f.fetcher, {
      now: () => 0,
    });
    expect(await response.json()).toEqual({ processed: 20, accepted: 0, retried: 0, skipped: 20 });
    expect(f.calls.filter((call) => call.path.endsWith("/mealdeck_push_claim"))).toHaveLength(20);
    expect(
      f.calls.every((call) => call.headers.get("apikey") === env.MEALDECK_CHECKOUT_SERVER_KEY),
    ).toBe(true);
  });
});

describe("Marketing campaign boundaries", () => {
  test("preparing a campaign only creates its reviewable draft using the verified staff bearer", async () => {
    const f = fixture();
    f.rpc.set("mealdeck_push_campaign_prepare", () => ({
      campaignId: uid(50),
      status: "draft",
      audience: 7,
    }));
    const response = await handleNotificationCampaignRequest(
      customerRequest(
        {
          action: "prepare",
          tenantId: uid(1),
          locationId: uid(2),
          title: "Weekend offer",
          body: "See the current offer terms.",
          path: "/offers",
          expiresAt: "2026-11-08T23:00:00Z",
        },
        { Authorization: memberHeader },
      ),
      env,
      f.fetcher,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "draft", available: true });
    const campaignCalls = f.calls.filter((call) => call.path.includes("mealdeck_push_campaign_"));
    expect(campaignCalls).toHaveLength(1);
    expect(campaignCalls[0]!.path).toEndWith("/mealdeck_push_campaign_prepare");
    expect(campaignCalls[0]!.headers.get("Authorization")).toBe(memberHeader);
    expect(campaignCalls[0]!.headers.get("apikey")).toBe(env.MEALDECK_SUPABASE_PUBLISHABLE_KEY);
  });

  test("another kitchen and arbitrary campaign destinations cannot reach a campaign RPC", async () => {
    for (const patch of [{ locationId: uid(99) }, { path: "https://evil.example/offer" }]) {
      const f = fixture();
      const response = await handleNotificationCampaignRequest(
        customerRequest(
          {
            action: "prepare",
            tenantId: uid(1),
            locationId: uid(2),
            title: "Weekend offer",
            body: "See terms.",
            path: "/offers",
            expiresAt: "2026-11-08T23:00:00Z",
            ...patch,
          },
          { Authorization: memberHeader },
        ),
        env,
        f.fetcher,
      );
      expect([400, 403]).toContain(response.status);
      expect(f.calls).toHaveLength(0);
    }
  });
});
