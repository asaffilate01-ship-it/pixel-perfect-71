import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CheckoutProblem } from "./mealdeck-checkout-selection";
import { guestTokenHash, readGuestToken } from "./mealdeck-guest-session.server";
import {
  createPaymentClients,
  requirePaymentOrigin,
  verifiedPaymentUser,
} from "./mealdeck-payment-server-core";
import { readMealDeckRuntimeConfig, type MealDeckRuntimeEnv } from "./mealdeck-runtime-config";
import {
  customerPushPayloadSchema,
  hasPushWorkerAuthority,
  isAllowedPushEndpoint,
  PUSH_NO_STORE,
  pushSubscriptionSchema,
  sendCustomerWebPush,
} from "./mealdeck-web-push.server";
import { resolveWebPushConfig } from "./mealdeck-push-runtime.server";

type Json = Record<string, unknown>;
const object = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const fail = (message = "Mobile notifications are being connected.") =>
  new CheckoutProblem("notifications_unavailable", message, 503);
function problem(error: unknown) {
  const known = error instanceof CheckoutProblem ? error : fail();
  return Response.json(
    { error: known.code, message: known.message },
    { status: known.status, headers: PUSH_NO_STORE },
  );
}
async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
    throw new CheckoutProblem("invalid_request", "Use a JSON request.", 415);
  if (Number(request.headers.get("Content-Length") ?? 0) > 8192)
    throw new CheckoutProblem("request_too_large", "The request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new CheckoutProblem("invalid_request", "Check this request.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) {
      await reader.cancel();
      throw new CheckoutProblem("request_too_large", "The request is too large.", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CheckoutProblem("invalid_request", "Check this request.", 400);
  }
}

async function db(
  client: Pick<SupabaseClient, "rpc">,
  name: string,
  params: Json = {},
): Promise<Json> {
  const { data, error } = await client.rpc(name, params);
  if (error) {
    const message = String(error.message ?? "");
    if (/mealdeck_push_mfa_required/.test(message))
      throw new CheckoutProblem(
        "mfa_required",
        "Complete your MealDeck staff multi-factor verification and refresh Operations before sending app notifications.",
        403,
      );
    if (/mealdeck_push_mfa_unavailable/.test(message))
      throw new CheckoutProblem(
        "notifications_unavailable",
        "Staff MFA verification is not available. Contact the MealDeck administrator before sending.",
        503,
      );
    if (/mealdeck_push_campaign_forbidden/.test(message))
      throw new CheckoutProblem(
        "not_permitted",
        "Only an approved MealDeck owner/admin with Finance read and manage permissions can send promotional app notifications.",
        403,
      );
    if (/mealdeck_push_campaign_expired/.test(message))
      throw new CheckoutProblem(
        "notification_changed",
        "This notification draft is too old to send. Create and review a fresh draft; drafts must be confirmed within 15 minutes.",
        409,
      );
    if (/scope|forbidden|permission|unauthor|mfa/.test(message))
      throw new CheckoutProblem(
        "not_permitted",
        "Your current session cannot perform this notification action.",
        403,
      );
    if (/order_unavailable|actor|guest|registration|verification/.test(message))
      throw new CheckoutProblem(
        "order_unavailable",
        "Open the order in its original guest browser or verified account.",
        403,
      );
    if (/conflict|expired|draft|changed|subscription_limit/.test(message))
      throw new CheckoutProblem(
        "notification_changed",
        "Refresh and check your notification choice before trying again.",
        409,
      );
    if (/invalid/.test(message))
      throw new CheckoutProblem(
        "invalid_request",
        "Check your notification details and try again.",
        400,
      );
    throw fail();
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw fail();
  return data as Json;
}

export async function readCustomerPushAvailability(
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
) {
  const clients = createPaymentClients(env, fetcher);
  if (!clients) return { available: false, publicKey: null };
  const push = await resolveWebPushConfig(env, clients.service, clients.config);
  if (!push) return { available: false, publicKey: null };
  try {
    const capabilities = await db(clients.publicClient, "mealdeck_customer_capabilities");
    return capabilities["pushReady"] === true
      ? { available: true, publicKey: push.publicKey }
      : { available: false, publicKey: null };
  } catch {
    return { available: false, publicKey: null };
  }
}

const endpoint = z.string().refine(isAllowedPushEndpoint);
const orderInput = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("status"), orderId: z.uuid(), endpoint: endpoint.optional() }),
  z.strictObject({
    action: z.literal("subscribe"),
    orderId: z.uuid(),
    subscription: pushSubscriptionSchema,
  }),
  z.strictObject({ action: z.literal("unsubscribe"), orderId: z.uuid(), endpoint }),
]);

export async function handleCustomerNotificationsRequest(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
) {
  try {
    if (request.method === "GET")
      return Response.json(await readCustomerPushAvailability(env, fetcher), {
        headers: PUSH_NO_STORE,
      });
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { ...PUSH_NO_STORE, Allow: "GET, POST" } });
    requirePaymentOrigin(request);
    const input = orderInput.safeParse(await readBody(request));
    if (!input.success)
      throw new CheckoutProblem("invalid_request", "Check your notification choice.", 400);
    const clients = createPaymentClients(env, fetcher);
    if (!clients) throw fail();
    let actor: string | null = null,
      guestHash: string | null = null;
    if (request.headers.has("Authorization"))
      actor = await verifiedPaymentUser(request, clients.publicClient);
    else {
      const cookie = readGuestToken(request.headers.get("Cookie"));
      if (!cookie)
        throw new CheckoutProblem(
          "order_unavailable",
          "Open the order in its original browser.",
          401,
        );
      guestHash = guestTokenHash(cookie);
    }
    const availability = await readCustomerPushAvailability(env, fetcher);
    if (input.data.action === "subscribe" && !availability.available) throw fail();
    // Withdrawal and state checks remain available even when delivery is paused.
    const subscription = input.data.action === "subscribe" ? input.data.subscription : null;
    const state = await db(clients.service, "mealdeck_push_order_subscription", {
      p_tenant: clients.config.tenantId,
      p_location: clients.config.locationId,
      p_order: input.data.orderId,
      p_actor: actor,
      p_guest_hash: guestHash,
      p_action: input.data.action === "status" ? "state" : input.data.action,
      p_endpoint:
        subscription?.endpoint ?? ("endpoint" in input.data ? (input.data.endpoint ?? null) : null),
      p_p256dh: subscription?.keys.p256dh ?? null,
      p_auth: subscription?.keys.auth ?? null,
    });
    return Response.json(
      {
        available: availability.available,
        enabled: state["connected"] === true,
        expiresAt: typeof state["expiresAt"] === "string" ? state["expiresAt"] : null,
      },
      { headers: PUSH_NO_STORE },
    );
  } catch (error) {
    return problem(error);
  }
}

const campaignScope = { tenantId: z.uuid(), locationId: z.uuid() };
const campaignInput = z.discriminatedUnion("action", [
  z.strictObject({ ...campaignScope, action: z.literal("list") }),
  z.strictObject({
    ...campaignScope,
    action: z.literal("prepare"),
    title: z.string().trim().min(1).max(60),
    body: z.string().trim().min(1).max(180),
    path: z.enum(["/offers", "/menus"]),
    expiresAt: z.iso.datetime(),
  }),
  z.strictObject({ ...campaignScope, action: z.enum(["confirm", "cancel"]), campaignId: z.uuid() }),
]);

/** Previewing a draft never dispatches it. Only the verified staff confirm action queues a campaign. */
export async function handleNotificationCampaignRequest(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
) {
  try {
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { ...PUSH_NO_STORE, Allow: "POST" } });
    requirePaymentOrigin(request);
    const input = campaignInput.safeParse(await readBody(request));
    if (!input.success)
      throw new CheckoutProblem("invalid_request", "Check the promotion and expiry time.", 400);
    const config = readMealDeckRuntimeConfig(env, "luton");
    if (!config) throw fail();
    if (input.data.tenantId !== config.tenantId || input.data.locationId !== config.locationId)
      throw new CheckoutProblem("not_permitted", "Select the configured Luton kitchen.", 403);
    const client = createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: fetcher,
        headers: { Authorization: request.headers.get("Authorization") ?? "" },
      },
    });
    await verifiedPaymentUser(request, client, true);
    const availability = await readCustomerPushAvailability(env, fetcher);
    if (input.data.action === "confirm" && !availability.available) throw fail();
    const params: Json = { p_tenant: config.tenantId, p_location: config.locationId };
    if (input.data.action === "prepare")
      Object.assign(params, {
        p_title: input.data.title,
        p_body: input.data.body,
        p_path: input.data.path,
        p_expires_at: input.data.expiresAt,
      });
    else if (input.data.action !== "list") params["p_campaign"] = input.data.campaignId;
    const result = await db(client, `mealdeck_push_campaign_${input.data.action}`, params);
    return Response.json(
      { ...result, available: availability.available },
      { headers: PUSH_NO_STORE },
    );
  } catch (error) {
    return problem(error);
  }
}

type WorkerDependencies = { send?: typeof sendCustomerWebPush; now?: () => number };
/** A supervised scheduler invokes this route independently of any customer's open page. */
export async function handleCustomerPushWorker(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
  dependencies: WorkerDependencies = {},
) {
  try {
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { ...PUSH_NO_STORE, Allow: "POST" } });
    if (!/^Bearer [A-Za-z0-9_-]{32,256}$/.test(request.headers.get("Authorization") ?? ""))
      throw new CheckoutProblem("not_permitted", "Worker authentication failed.", 403);
    const clients = createPaymentClients(env, fetcher);
    if (!clients) throw fail();
    const push = await resolveWebPushConfig(env, clients.service, clients.config);
    if (!push || !hasPushWorkerAuthority(request, push.workerSecret))
      throw new CheckoutProblem("not_permitted", "Worker authentication failed.", 403);
    const scope = { p_tenant: clients.config.tenantId, p_location: clients.config.locationId };
    const clock = dependencies.now ?? Date.now,
      deadline = clock() + 22_000;
    let processed = 0,
      accepted = 0,
      retried = 0,
      skipped = 0;
    // Claim one at a time: unused leases must not sit behind a slow network send.
    while (processed < 20 && clock() < deadline) {
      const claim = await db(clients.service, "mealdeck_push_claim", { ...scope, p_limit: 1 });
      if (!Array.isArray(claim["jobs"]) || claim["jobs"].length === 0) break;
      const job = object(claim["jobs"][0]);
      const parsed = z.strictObject({ jobId: z.uuid(), leaseToken: z.uuid() }).safeParse(job);
      if (!parsed.success) throw fail();
      const binding = { ...scope, p_job: parsed.data.jobId, p_lease: parsed.data.leaseToken };
      const current = await db(clients.service, "mealdeck_push_preflight", binding);
      processed++;
      if (current["send"] !== true) {
        skipped++;
        continue;
      }
      const subscription = pushSubscriptionSchema.safeParse(current["subscription"]);
      const payload = customerPushPayloadSchema.safeParse(current["payload"]);
      const ttl = current["ttlSeconds"];
      const result =
        subscription.success && payload.success && typeof ttl === "number"
          ? await (dependencies.send ?? sendCustomerWebPush)(
              push,
              subscription.data,
              payload.data,
              ttl,
              fetcher,
            )
          : { outcome: "failed" as const, status: null };
      await db(clients.service, "mealdeck_push_finish", {
        ...binding,
        p_outcome: result.outcome,
        p_status: result.status,
      });
      if (result.outcome === "accepted") accepted++;
      if (result.outcome === "retry") retried++;
    }
    if (env["MEALDECK_WEB_PUSH_ENABLED"] === undefined)
      await db(clients.service, "mealdeck_push_worker_seen", scope);
    // Provider acceptance is deliberately not labelled delivery or customer read.
    return Response.json({ processed, accepted, retried, skipped }, { headers: PUSH_NO_STORE });
  } catch (error) {
    return problem(error);
  }
}
