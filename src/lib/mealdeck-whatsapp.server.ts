import { CheckoutProblem, normaliseCheckoutSelection } from "./mealdeck-checkout-selection";
import { guestTokenHash } from "./mealdeck-guest-session.server";
import { handlePublicMenuRequest } from "./mealdeck-public-menu.server";
import { parseMealDeckPublicMenu, type MealDeckPublicMenuSnapshot } from "./mealdeck-public-menu";
import {
  readOnlineCheckoutStatus,
  type MealDeckOnlineCheckoutStatus,
} from "./mealdeck-online-checkout.server";
import { readMealDeckRuntimeConfig, type MealDeckRuntimeEnv } from "./mealdeck-runtime-config";
import {
  advanceWhatsAppConversation,
  createWhatsAppDraft,
  parseWhatsAppDraft,
} from "./mealdeck-whatsapp-conversation";
import { proposeWhatsAppSelection } from "./mealdeck-whatsapp-ai.server";
import {
  createWhatsappStore,
  type WhatsappStore,
  type WhatsappOrderBinding,
} from "./mealdeck-whatsapp-store.server";
import {
  constantTimeSecret,
  newWhatsAppCapability,
  parseWhatsAppMessages,
  readWhatsAppBody,
  readWhatsAppConfig,
  sendWhatsAppReply,
  whatsAppReplySchema,
  WHATSAPP_NO_STORE,
  WHATSAPP_SENSITIVE_REMOVED,
  sealWhatsAppCheckoutReply,
  type WhatsAppReply,
} from "./mealdeck-whatsapp-transport.server";
import { verifyWhatsAppSignature } from "./mealdeck-whatsapp-transport.server";

function responseError(error: unknown) {
  const problem =
    error instanceof CheckoutProblem
      ? error
      : new CheckoutProblem(
          "whatsapp_unavailable",
          "WhatsApp ordering is temporarily unavailable.",
          503,
        );
  return Response.json(
    { error: problem.code, message: problem.message },
    { status: problem.status, headers: WHATSAPP_NO_STORE },
  );
}

/** Acknowledge only after durable enqueue. No AI, payment or provider send runs on this path. */
export async function handleWhatsAppWebhook(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
  storeOverride?: WhatsappStore,
) {
  try {
    const config = readWhatsAppConfig(env);
    if (!config)
      throw new CheckoutProblem("whatsapp_unavailable", "WhatsApp is being connected.", 503);
    if (request.method === "GET") {
      const url = new URL(request.url),
        challenge = url.searchParams.get("hub.challenge");
      if (
        url.searchParams.get("hub.mode") !== "subscribe" ||
        !challenge ||
        !/^\d{1,100}$/.test(challenge) ||
        !constantTimeSecret(url.searchParams.get("hub.verify_token"), config.verifyToken)
      )
        throw new CheckoutProblem("not_permitted", "Verification failed.", 403);
      return new Response(challenge, {
        headers: { ...WHATSAPP_NO_STORE, "Content-Type": "text/plain" },
      });
    }
    if (request.method !== "POST")
      return new Response(null, {
        status: 405,
        headers: { ...WHATSAPP_NO_STORE, Allow: "GET, POST" },
      });
    const raw = await readWhatsAppBody(request);
    if (!verifyWhatsAppSignature(raw, request.headers.get("X-Hub-Signature-256"), config.appSecret))
      throw new CheckoutProblem("not_permitted", "Signature verification failed.", 403);
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    } catch {
      throw new CheckoutProblem("invalid_request", "Invalid event.", 400);
    }
    const events = parseWhatsAppMessages(value, config);
    const store = storeOverride ?? createWhatsappStore(env, fetcher);
    if (!store)
      throw new CheckoutProblem("whatsapp_unavailable", "WhatsApp is being connected.", 503);
    for (const event of events) {
      const result = await store.enqueue(event);
      // Rate-limited abuse is deliberately acknowledged. A global queue failure
      // must be retried by Meta; already persisted events deduplicate atomically.
      if (!result.accepted && result.reason === "queue_full")
        throw new CheckoutProblem("retry_later", "Please retry this event.", 503);
    }
    return Response.json({ received: true }, { headers: WHATSAPP_NO_STORE });
  } catch (error) {
    return responseError(error);
  }
}

export function whatsAppOrderStatusReply(order: WhatsappOrderBinding): WhatsAppReply {
  const code =
    order.verifiedPaid && /^\d{4}$/.test(order.handoffCode ?? "")
      ? ` Your collection code is ${order.handoffCode}.`
      : "";
  const labels: Record<WhatsappOrderBinding["status"], string> = {
    payment_pending:
      "Payment has not yet been verified. Use your original secure checkout to check or resume it. Do not start a second payment.",
    paid: "Payment is verified. Your order is waiting for kitchen acceptance.",
    accepted:
      "The kitchen has accepted your order. We will confirm when all food is ready for collection.",
    ready: "Your complete order is ready for collection.",
    completed: "Your order has been handed over. Thank you for ordering with MealDeck.",
    held: "This order needs a staff review. No new payment or refund has been made by this assistant. Type help for staff assistance.",
  };
  return {
    text:
      (labels[order.status] ?? labels.held) +
      code +
      (order.fulfilment === "curbside" &&
      order.verifiedPaid &&
      ["paid", "accepted", "ready"].includes(order.status)
        ? " When you are safely parked at the kitchen, reply I'M HERE so the team can find your car."
        : ""),
  };
}

type WorkerDependencies = {
  store?: WhatsappStore;
  menu?: () => Promise<MealDeckPublicMenuSnapshot | null>;
  status?: () => Promise<MealDeckOnlineCheckoutStatus>;
  propose?: typeof proposeWhatsAppSelection;
  send?: typeof sendWhatsAppReply;
};
/** Call from one supervised scheduler; leases also make overlapping workers safe. */
export async function handleWhatsAppWorker(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
  dependencies: WorkerDependencies = {},
) {
  try {
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { ...WHATSAPP_NO_STORE, Allow: "POST" } });
    const config = readWhatsAppConfig(env);
    if (
      !config ||
      !constantTimeSecret(request.headers.get("Authorization"), `Bearer ${config.workerSecret}`)
    )
      throw new CheckoutProblem("not_permitted", "Worker authentication failed.", 403);
    const store = dependencies.store ?? createWhatsappStore(env, fetcher);
    const scope = readMealDeckRuntimeConfig(env, "luton");
    if (!store || !scope)
      throw new CheckoutProblem("whatsapp_unavailable", "WhatsApp is being connected.", 503);
    const deadline = Date.now() + 23_000;
    let processed = 0,
      sent = 0,
      held = 0;
    const claim = await store.claimInbound();
    if (claim) {
      try {
        let draft = parseWhatsAppDraft(claim.draft) ?? createWhatsAppDraft();
        draft.revision = claim.revision;
        const text = typeof claim.input["text"] === "string" ? claim.input["text"] : "";
        const actionId =
          typeof claim.input["actionId"] === "string" ? claim.input["actionId"] : undefined;
        let replies: WhatsAppReply[] = [],
          token: string | null = null;
        const order = claim.orderBinding;
        if (
          order &&
          /^(?:status|order status|where(?:'s| is) my order|payment status)$/i.test(text.trim())
        ) {
          draft.revision++;
          replies = [whatsAppOrderStatusReply(order)];
        } else if (/^(?:i['’]?m here|i am here|arrived)$/i.test(text.trim())) {
          draft.revision++;
          if (
            order?.fulfilment === "curbside" &&
            order.verifiedPaid &&
            ["paid", "accepted", "ready"].includes(order.status)
          ) {
            await store.markArrived(claim.sessionId);
            replies = [
              {
                text: "Your arrival is recorded for the kitchen team. Please remain safely parked. Staff will match the car details from your order before handing it over.",
              },
            ];
          } else
            replies = [
              {
                text: "I could not find an eligible paid kerbside order in this conversation. Type status to check your order, or help for staff assistance.",
              },
            ];
        } else if (claim.input["unsupported"] === true) {
          if (text === WHATSAPP_SENSITIVE_REMOVED) {
            // Redaction must never suppress an allergy/refund request embedded
            // in the same message. Conservatively pause for a person to review.
            const result = advanceWhatsAppConversation(draft, { text: "help" }, null, {
              available: false,
              estimateMinutes: null,
              guestEligible: false,
            });
            draft = result.draft;
            replies = [
              {
                text: "For your security, payment or credential details were removed from this message. Please use secure checkout for card details. Staff need to review your request before automated checkout continues.",
              },
              ...result.replies,
            ];
          } else {
            draft.revision++;
            replies = [
              {
                text: "Please use a short text message or the menu buttons to order. Photos, recordings and payment screenshots cannot confirm an order. Keep card details and passwords out of chat. Type help to contact the team.",
              },
            ];
          }
        } else {
          const results = await Promise.allSettled([
            dependencies.menu
              ? dependencies.menu()
              : (async () => {
                  const result = await handlePublicMenuRequest(
                    new Request(`${config.origin}/api/menu`),
                    env,
                    fetcher,
                  );
                  return result.ok ? parseMealDeckPublicMenu(await result.json()) : null;
                })(),
            dependencies.status ? dependencies.status() : readOnlineCheckoutStatus(env, fetcher),
          ]);
          const menu = results[0].status === "fulfilled" ? results[0].value : null;
          const status = results[1].status === "fulfilled" ? results[1].value : null;
          const proposal =
            !actionId && config.orderingEnabled
              ? await (dependencies.propose ?? proposeWhatsAppSelection)(
                  draft,
                  text,
                  menu,
                  env,
                  fetcher,
                )
              : undefined;
          const result = advanceWhatsAppConversation(
            draft,
            { text, ...(actionId ? { actionId } : {}), proposal },
            menu,
            {
              available: config.orderingEnabled && status?.available === true,
              estimateMinutes: status?.kitchen?.collectionEstimateMinutes ?? null,
              guestEligible: status?.guestCheckout.eligible === true,
              canStartNewOrder: claim.canStartNewOrder === true,
            },
          );
          draft = result.draft;
          replies = result.replies;
          if (result.requestCheckout) {
            if (!config.orderingEnabled || !status?.available)
              throw new Error("New checkout is unavailable.");
            normaliseCheckoutSelection(
              {
                action: "quote",
                fulfilment: draft.fulfilment,
                picks: draft.picks.map(({ key: _key, ...pick }) => pick),
                ...(draft.fulfilment === "curbside" ? { vehicle: draft.vehicle } : {}),
                packing: draft.packingPlan,
                ...(draft.notes ? { notes: draft.notes } : {}),
              },
              scope.tenantId,
            );
            token = newWhatsAppCapability();
            replies.push(
              sealWhatsAppCheckoutReply(
                config,
                claim.senderId,
                `Review and pay securely with MealDeck:\n${config.origin}/whatsapp/checkout#token=${token}\nThis private link expires in 15 minutes. Open it on your own device and do not forward it. Card details belong only on the secure payment page.`,
              ),
            );
          }
        }
        for (const reply of replies) whatsAppReplySchema.parse(reply);
        await store.finishInbound({
          eventId: claim.eventId,
          leaseId: claim.leaseId,
          revision: claim.revision,
          draft,
          replies,
          ...(token ? { checkout: { tokenHash: guestTokenHash(token) } } : {}),
        });
        processed++;
      } catch {
        // Safe diagnostic only; never log a customer body, capability or provider credential.
        await store.failInbound({
          eventId: claim.eventId,
          leaseId: claim.leaseId,
          retryable: true,
        });
        held++;
      }
    }
    await store.cleanup();
    await store.queueStatusNotifications();
    for (let count = 0; count < 8 && Date.now() < deadline; count++) {
      const outgoing = await store.claimOutbox();
      if (!outgoing) break;
      const outcome = await (dependencies.send ?? sendWhatsAppReply)(
        config,
        outgoing.senderId,
        outgoing.reply,
        outgoing.lastInboundAt,
        fetcher,
      );
      await store.finishOutbox({ id: outgoing.id, leaseId: outgoing.leaseId, ...outcome });
      if (outcome.outcome === "sent") sent++;
      else held++;
    }
    return Response.json({ processed, sent, held }, { headers: WHATSAPP_NO_STORE });
  } catch (error) {
    return responseError(error);
  }
}
