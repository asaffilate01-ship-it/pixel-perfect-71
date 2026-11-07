import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  readMealDeckCheckoutServerKey,
  readMealDeckRuntimeConfig,
  type MealDeckRuntimeEnv,
} from "./mealdeck-runtime-config";

export type WhatsappJson = Record<string, unknown>;
export type WhatsappReply = {
  text: string;
  sealedCheckoutLink?: string;
  buttons?: { id: string; title: string }[];
  list?: { title: string; rows: { id: string; title: string; description?: string }[] }[];
};
export type WhatsappOrderBinding = {
  orderId: string;
  fulfilment: "pickup" | "curbside";
  status: "payment_pending" | "paid" | "accepted" | "ready" | "completed" | "held";
  verifiedPaid: boolean;
  acceptedAt: string | null;
  readyForCollectionAt: string | null;
  completedAt: string | null;
  handoffCode: string | null;
  arrivedAt: string | null;
  canStartNewOrder: boolean;
};
export type WhatsappInboundClaim = {
  eventId: string;
  leaseId: string;
  sessionId: string;
  senderId: string;
  receivedAt: string;
  input: WhatsappJson;
  draft: WhatsappJson;
  revision: number;
  canStartNewOrder: boolean;
  orderBinding: WhatsappOrderBinding | null;
};
export type WhatsappOutboxClaim = {
  id: string;
  leaseId: string;
  senderId: string;
  reply: WhatsappReply;
  lastInboundAt: string;
  windowExpiresAt: string;
};
export type WhatsappHandoff = {
  handoffId: string;
  draft: WhatsappJson;
  revision: number;
  expiresAt: string;
  quoteId: string | null;
  orderId: string | null;
  attemptId: string | null;
  requestHash: string | null;
  paused: boolean;
  checkoutMode: "member" | "guest" | null;
  phase: "draft" | "quoted" | "order";
  orderBinding: WhatsappOrderBinding | null;
  resumed?: boolean;
};
export type WhatsappCheckoutActor = {
  customerId?: string | null;
  guestTokenHash?: string | null;
};
export type WhatsappStore = ReturnType<typeof whatsappStoreForClient>;

/**
 * Keep database/provider diagnostics out of HTTP responses and chat transcripts.
 * The stable code supports a precise retry or handoff decision without leaking
 * database object names, customer identities, secrets, or request payloads.
 */
export class WhatsappStoreError extends Error {
  readonly code: string;
  constructor(code: string) {
    super("WhatsApp ordering could not complete this operation.");
    this.name = "WhatsappStoreError";
    this.code = code;
  }
}

type Scope = { tenantId: string; locationId: string; phoneId: string };
type RpcClient = Pick<SupabaseClient, "rpc">;

/** Injection point for tests; all production scope values come from server env. */
export function whatsappStoreForClient(client: RpcClient, scope: Scope) {
  const dbScope = {
    p_tenant: scope.tenantId,
    p_location: scope.locationId,
    p_phone_id: scope.phoneId,
  };
  async function rpc<T>(action: string, input: WhatsappJson = {}): Promise<T> {
    const { data, error } = await client.rpc(`mealdeck_whatsapp_${action}`, {
      ...input,
      ...dbScope,
    });
    if (error) {
      const match = String(error.message ?? "").match(/mealdeck_whatsapp_([a-z_]+)/);
      throw new WhatsappStoreError(match?.[1] ?? "store_unavailable");
    }
    return data as T;
  }
  const actorArgs = (actor: WhatsappCheckoutActor) => {
    const customer = actor.customerId ?? null;
    const guest = actor.guestTokenHash ?? null;
    if ((customer === null) === (guest === null)) throw new WhatsappStoreError("actor_invalid");
    return { p_customer: customer, p_guest_token_hash: guest };
  };
  return {
    enqueue(input: {
      providerMessageId: string;
      senderId: string;
      input: WhatsappJson;
      receivedAt: string;
    }) {
      return rpc<{
        accepted: boolean;
        duplicate?: boolean;
        eventId?: string;
        reason?: "queue_full" | "rate_limited";
        optOutApplied?: boolean;
      }>("enqueue", {
        p_provider_message_id: input.providerMessageId,
        p_sender_id: input.senderId,
        p_input: input.input,
        p_received_at: input.receivedAt,
      });
    },
    claimInbound() {
      return rpc<WhatsappInboundClaim | null>("claim_inbound");
    },
    finishInbound(input: {
      eventId: string;
      leaseId: string;
      revision: number;
      draft: WhatsappJson;
      replies: WhatsappReply[];
      checkout?: { tokenHash: string };
    }) {
      return rpc<{
        applied: boolean;
        duplicate?: boolean;
        revision: number;
        handoffId?: string | null;
      }>("finish_inbound", {
        p_event: input.eventId,
        p_lease: input.leaseId,
        p_revision: input.revision,
        p_draft: input.draft,
        p_replies: input.replies,
        p_token_hash: input.checkout?.tokenHash ?? null,
      });
    },
    failInbound(input: { eventId: string; leaseId: string; retryable: boolean }) {
      return rpc<boolean>("fail_inbound", {
        p_event: input.eventId,
        p_lease: input.leaseId,
        p_retryable: input.retryable,
      });
    },
    claimOutbox() {
      return rpc<WhatsappOutboxClaim | null>("claim_outbox");
    },
    /** "retry" is reserved for a definite provider rejection before acceptance. */
    finishOutbox(input: {
      id: string;
      leaseId: string;
      outcome: "sent" | "retry" | "uncertain";
      providerMessageId?: string;
    }) {
      return rpc<boolean>("finish_outbox", {
        p_id: input.id,
        p_lease: input.leaseId,
        p_outcome: input.outcome,
        p_provider_message_id: input.providerMessageId ?? null,
      });
    },
    exchangeHandoff(input: {
      tokenHash: string;
      claimHash: string;
      existingClaimHash?: string | null;
    }) {
      return rpc<WhatsappHandoff>("exchange_handoff", {
        p_token_hash: input.tokenHash,
        p_claim_hash: input.claimHash,
        p_existing_claim_hash: input.existingClaimHash ?? null,
      });
    },
    readHandoff(claimHash: string) {
      return rpc<WhatsappHandoff>("read_handoff", { p_claim_hash: claimHash });
    },
    registerQuote(
      input: WhatsappCheckoutActor & { claimHash: string; quoteId: string; requestHash: string },
    ) {
      return rpc<WhatsappHandoff>("register_quote", {
        p_claim_hash: input.claimHash,
        p_quote: input.quoteId,
        p_request_hash: input.requestHash,
        ...actorArgs(input),
      });
    },
    bindOrder(
      input: WhatsappCheckoutActor & {
        claimHash: string;
        quoteId: string;
        attemptId: string;
        orderId: string;
      },
    ) {
      return rpc<WhatsappHandoff>("bind_order", {
        p_claim_hash: input.claimHash,
        p_quote: input.quoteId,
        p_attempt: input.attemptId,
        p_order: input.orderId,
        ...actorArgs(input),
      });
    },
    markArrived(sessionId: string) {
      return rpc<WhatsappOrderBinding>("mark_arrived", { p_session: sessionId });
    },
    queueStatusNotifications() {
      return rpc<number>("queue_status_notifications");
    },
    cleanup() {
      return rpc<{ messageBodiesRedacted: number; draftsExpired: number; handoffsExpired: number }>(
        "cleanup",
      );
    },
  };
}

/**
 * Does not check the new-order flag: a previously bound payment or receipt must
 * remain recoverable after a channel is paused. Admission is gated by the route.
 */
export function createWhatsappStore(
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
): WhatsappStore | null {
  const config = readMealDeckRuntimeConfig(env, "luton");
  const phoneId = env["MEALDECK_LUTON_WHATSAPP_PHONE_NUMBER_ID"]?.trim() ?? "";
  if (!config || !/^[0-9]{5,30}$/.test(phoneId)) return null;
  const key = readMealDeckCheckoutServerKey(env, config);
  if (!key) return null;
  const client = createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher },
  });
  return whatsappStoreForClient(client, {
    tenantId: config.tenantId,
    locationId: config.locationId,
    phoneId,
  });
}
