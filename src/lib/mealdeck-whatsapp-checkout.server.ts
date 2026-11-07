import { z } from "zod";
import { CheckoutProblem, normaliseCheckoutSelection } from "./mealdeck-checkout-selection";
import { guestTokenHash } from "./mealdeck-guest-session.server";
import type { MealDeckRuntimeEnv } from "./mealdeck-runtime-config";
import { readMealDeckRuntimeConfig } from "./mealdeck-runtime-config";
import { requirePaymentOrigin } from "./mealdeck-payment-server-core";
import {
  createWhatsappStore,
  WhatsappStoreError,
  type WhatsappHandoff,
  type WhatsappStore,
  type WhatsappCheckoutActor,
} from "./mealdeck-whatsapp-store.server";
import {
  newWhatsAppCapability,
  readWhatsAppBody,
  WHATSAPP_NO_STORE,
} from "./mealdeck-whatsapp-transport.server";
import { parseWhatsAppDraft } from "./mealdeck-whatsapp-conversation";

export const WHATSAPP_CLAIM_COOKIE = "__Host-mealdeck_whatsapp";
const capability = /^[a-f0-9]{64}$/;
export function readWhatsAppClaim(header: string | null): string | null {
  const values = (header ?? "")
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.startsWith(WHATSAPP_CLAIM_COOKIE + "="));
  if (values.length !== 1) return null;
  const value = values[0]!.slice(WHATSAPP_CLAIM_COOKIE.length + 1);
  return capability.test(value) ? value : null;
}
export function whatsAppClaimCookie(value: string) {
  if (!capability.test(value)) throw new Error("Invalid checkout claim.");
  return `${WHATSAPP_CLAIM_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
}
function unavailable() {
  return new CheckoutProblem(
    "whatsapp_link_unavailable",
    "This WhatsApp checkout link is unavailable. Return to your conversation for help.",
    410,
  );
}
export function whatsappCheckoutError(error: unknown) {
  if (error instanceof CheckoutProblem) return error;
  if (error instanceof WhatsappStoreError && /handoff|actor|quote|order_invalid/.test(error.code))
    return unavailable();
  return new CheckoutProblem(
    "whatsapp_unavailable",
    "WhatsApp checkout could not connect. Please try again.",
    503,
  );
}
export function whatsappHandoffProjection(handoff: WhatsappHandoff) {
  const draft = parseWhatsAppDraft(handoff.draft);
  if (
    !draft ||
    !z.uuid().safeParse(handoff.handoffId).success ||
    !Number.isFinite(Date.parse(handoff.expiresAt))
  )
    throw unavailable();
  // No sender ID, claim/token hash, audit history or chat-consent metadata crosses this boundary.
  return {
    handoffId: handoff.handoffId,
    expiresAt: handoff.expiresAt,
    quoteId: handoff.quoteId,
    orderId: handoff.orderId,
    attemptId: handoff.attemptId,
    checkoutMode: handoff.checkoutMode,
    paused: handoff.paused === true,
    draft: {
      picks: draft.picks,
      fulfilment: draft.fulfilment,
      customer: draft.customer,
      vehicle: draft.vehicle,
      packingPlan: draft.packingPlan,
      notes: draft.notes,
    },
  };
}
const intake = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("redeem"), token: z.string().regex(capability) }),
  z.strictObject({ action: z.literal("current") }),
]);
export async function handleWhatsAppCheckoutRequest(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
  storeOverride?: WhatsappStore,
) {
  try {
    if (request.method !== "POST")
      return Response.json(
        { error: "method_not_allowed" },
        { status: 405, headers: { ...WHATSAPP_NO_STORE, Allow: "POST" } },
      );
    requirePaymentOrigin(request);
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
      throw new CheckoutProblem("invalid_request", "Use a JSON request.", 415);
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(await readWhatsAppBody(request, 1024)));
    } catch (error) {
      if (error instanceof CheckoutProblem) throw error;
      throw unavailable();
    }
    const input = intake.safeParse(raw);
    if (!input.success) throw unavailable();
    const store = storeOverride ?? createWhatsappStore(env, fetcher);
    if (!store)
      throw new CheckoutProblem(
        "whatsapp_unavailable",
        "WhatsApp checkout is being connected.",
        503,
      );
    const existing = readWhatsAppClaim(request.headers.get("Cookie"));
    if (input.data.action === "current") {
      if (!existing) throw unavailable();
      return Response.json(
        whatsappHandoffProjection(await store.readHandoff(guestTokenHash(existing))),
        { headers: WHATSAPP_NO_STORE },
      );
    }
    const claim = newWhatsAppCapability();
    const handoff = await store.exchangeHandoff({
      tokenHash: guestTokenHash(input.data.token),
      claimHash: guestTokenHash(claim),
      existingClaimHash: existing ? guestTokenHash(existing) : null,
    });
    if (handoff.resumed && !existing) throw unavailable();
    return Response.json(whatsappHandoffProjection(handoff), {
      headers: {
        ...WHATSAPP_NO_STORE,
        "Set-Cookie": whatsAppClaimCookie(handoff.resumed ? existing! : claim),
      },
    });
  } catch (error) {
    const problem = whatsappCheckoutError(error);
    return Response.json(
      { error: problem.code, message: problem.message },
      { status: problem.status, headers: WHATSAPP_NO_STORE },
    );
  }
}

/** Opt-in context is required on the dedicated flow; ordinary website requests are unchanged. */
export async function readWhatsAppCheckoutBinding(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
) {
  if (!request.headers.has("X-Mealdeck-WhatsApp")) return null;
  if (request.headers.get("X-Mealdeck-WhatsApp") !== "1") throw unavailable();
  requirePaymentOrigin(request);
  const raw = readWhatsAppClaim(request.headers.get("Cookie"));
  const store = createWhatsappStore(env, fetcher),
    config = readMealDeckRuntimeConfig(env, "luton");
  if (!raw || !store || !config) throw unavailable();
  const claimHash = guestTokenHash(raw);
  try {
    const handoff = await store.readHandoff(claimHash);
    if (handoff.paused)
      throw new CheckoutProblem(
        "whatsapp_staff_review",
        "Staff need to review this order before checkout continues. A payment already in progress has not been cancelled.",
        409,
      );
    const draft = parseWhatsAppDraft(handoff.draft);
    if (!draft) throw unavailable();
    const expectedHash =
      handoff.requestHash && /^[a-f0-9]{64}$/.test(handoff.requestHash)
        ? handoff.requestHash
        : normaliseCheckoutSelection(
            {
              action: "quote",
              fulfilment: draft.fulfilment,
              picks: draft.picks.map(({ key: _key, ...pick }) => pick),
              ...(draft.fulfilment === "curbside" ? { vehicle: draft.vehicle } : {}),
              packing: draft.packingPlan,
              ...(draft.notes ? { notes: draft.notes } : {}),
            },
            config.tenantId,
          ).requestHash;
    return { store, claimHash, handoff, requestHash: expectedHash };
  } catch (error) {
    throw whatsappCheckoutError(error);
  }
}
export type WhatsAppCheckoutBinding = NonNullable<
  Awaited<ReturnType<typeof readWhatsAppCheckoutBinding>>
>;
export async function registerWhatsAppCheckoutQuote(
  binding: WhatsAppCheckoutBinding,
  quoteId: unknown,
  requestHash: string,
  actor: WhatsappCheckoutActor,
) {
  if (binding.requestHash !== requestHash || !z.uuid().safeParse(quoteId).success)
    throw new CheckoutProblem(
      "whatsapp_order_changed",
      "The order differs from your WhatsApp review. Return to WhatsApp to change it.",
      409,
    );
  try {
    await binding.store.registerQuote({
      claimHash: binding.claimHash,
      quoteId: quoteId as string,
      requestHash,
      ...actor,
    });
  } catch (error) {
    throw whatsappCheckoutError(error);
  }
}
export async function bindWhatsAppCheckoutOrder(
  binding: WhatsAppCheckoutBinding,
  input: { quoteId: string; attemptId: string; orderId: string },
  actor: WhatsappCheckoutActor,
) {
  if (
    binding.handoff.quoteId !== input.quoteId ||
    (binding.handoff.attemptId && binding.handoff.attemptId !== input.attemptId)
  )
    throw unavailable();
  try {
    await binding.store.bindOrder({ claimHash: binding.claimHash, ...input, ...actor });
  } catch (error) {
    throw whatsappCheckoutError(error);
  }
}
