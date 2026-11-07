import { z } from "zod";
import type { LaunchMenuPick } from "./launch-menu-picks";
import { normalizeCustomerName, normalizeCustomerPhone } from "./mealdeck-customer";
import { parseKerbsideVehicle } from "./mealdeck-opening-offer";
import { MAX_ORDER_NOTES_LENGTH, normaliseOrderNotes } from "./mealdeck-order-notes";
import type { MealDeckCheckoutMode } from "./mealdeck-checkout-browser";

const sourceId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(180);
const pick = z
  .object({
    key: z.string().min(1).max(16_000),
    brandId: sourceId,
    itemId: sourceId,
    quantity: z.number().int().min(1).max(20),
    selections: z.record(sourceId, z.array(sourceId).max(30)),
    crossSelections: z
      .array(
        z
          .object({
            slot: z.enum(["side", "drink"]),
            mode: z.enum(["upgrade", "extra"]),
            brandId: z.enum(["loadd", "moktl"]),
            itemId: sourceId,
          })
          .strict(),
      )
      .max(2)
      .optional(),
  })
  .strict()
  .transform(({ crossSelections, ...value }): LaunchMenuPick => ({
    ...value,
    ...(crossSelections ? { crossSelections } : {}),
  }));

const checkoutDraft = z.object({
  picks: z.array(pick).min(1).max(60),
  fulfilment: z.enum(["pickup", "curbside"]),
  customer: z.object({ name: z.string().max(240), phone: z.string().max(40) }).strict(),
  vehicle: z
    .object({
      make: z.string().max(60),
      colour: z.string().max(40),
      registrationLast4: z.string().regex(/^[A-Z0-9]{4}$/),
    })
    .strict()
    .nullable(),
  notes: z.string().max(MAX_ORDER_NOTES_LENGTH * 2),
  packingPlan: z
    .object({
      cutleryRequested: z.boolean(),
      separateBags: z.boolean(),
      bagCount: z.number().int().min(1).max(3),
      allocations: z
        .array(
          z
            .object({
              lineId: z.string().regex(/^line-([1-9]|[1-5][0-9]|60)$/),
              bag: z.number().int().min(1).max(3),
              quantity: z.number().int().min(1).max(20),
            })
            .strict(),
        )
        .max(180),
    })
    .strict(),
});

const checkoutContext = z.object({
  handoffId: z.uuid(),
  expiresAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  draft: checkoutDraft,
  orderId: z.uuid().nullable().optional().default(null),
  quoteId: z.uuid().nullable().optional().default(null),
  attemptId: z.uuid().nullable().optional().default(null),
  checkoutMode: z.enum(["member", "guest"]).nullable().optional().default(null),
  paused: z.boolean().optional().default(false),
});

/** A safe display/selection projection. Chat consent and identity flags never cross this boundary. */
export type WhatsAppCheckoutContext = z.infer<typeof checkoutContext>;
export type WhatsAppCheckoutDraft = WhatsAppCheckoutContext["draft"];

export function matchingWhatsAppReceiptContext(context: WhatsAppCheckoutContext, orderId: string) {
  return context.orderId === orderId ? context : null;
}

export function parseWhatsAppCheckoutContext(value: unknown): WhatsAppCheckoutContext | null {
  const parsed = checkoutContext.safeParse(value);
  if (!parsed.success) return null;
  const result = parsed.data;
  const draft = result.draft;
  if (!normalizeCustomerName(draft.customer.name) || !normalizeCustomerPhone(draft.customer.phone))
    return null;
  if (
    draft.fulfilment === "curbside" ? !parseKerbsideVehicle(draft.vehicle) : draft.vehicle !== null
  )
    return null;
  if (
    new Set(draft.picks.map((entry) => entry.key)).size !== draft.picks.length ||
    draft.picks.reduce((sum, entry) => sum + entry.quantity, 0) > 60
  )
    return null;
  try {
    normaliseOrderNotes(draft.notes);
  } catch {
    return null;
  }
  const packing = draft.packingPlan;
  if (!packing.separateBags) {
    if (packing.bagCount !== 1 || packing.allocations.length) return null;
  } else {
    const pairs = new Set<string>();
    const totals = new Map<string, number>();
    const bags = new Set<number>();
    for (const allocation of packing.allocations) {
      const index = Number(allocation.lineId.slice(5)) - 1;
      const pair = allocation.lineId + ":" + allocation.bag;
      if (!draft.picks[index] || allocation.bag > packing.bagCount || pairs.has(pair)) return null;
      pairs.add(pair);
      bags.add(allocation.bag);
      totals.set(allocation.lineId, (totals.get(allocation.lineId) ?? 0) + allocation.quantity);
    }
    if (
      bags.size !== packing.bagCount ||
      draft.picks.some((entry, index) => totals.get("line-" + (index + 1)) !== entry.quantity)
    )
      return null;
  }
  if ((result.orderId || result.attemptId) && (!result.quoteId || !result.checkoutMode))
    return null;
  return result;
}

export function whatsAppGuestContactMatches(
  draft: WhatsAppCheckoutDraft,
  contact: { name: string | null; phone: string | null },
) {
  return (
    normalizeCustomerName(contact.name ?? "") === normalizeCustomerName(draft.customer.name) &&
    normalizeCustomerPhone(contact.phone ?? "") === normalizeCustomerPhone(draft.customer.phone)
  );
}

export function whatsAppDraftBagQuantities(draft: WhatsAppCheckoutDraft) {
  return Object.fromEntries(
    draft.picks.map((entry, index) => [
      "line-" + (index + 1),
      draft.packingPlan.separateBags
        ? Array.from(
            { length: draft.packingPlan.bagCount },
            (_, bag) =>
              draft.packingPlan.allocations.find(
                (allocation) =>
                  allocation.lineId === "line-" + (index + 1) && allocation.bag === bag + 1,
              )?.quantity ?? 0,
          )
        : [entry.quantity],
    ]),
  );
}

export function whatsAppQuoteInput(draft: WhatsAppCheckoutDraft) {
  const notes = normaliseOrderNotes(draft.notes);
  return {
    action: "quote",
    fulfilment: draft.fulfilment,
    picks: draft.picks.map(
      ({ brandId, itemId, quantity, selections, crossSelections }: LaunchMenuPick) => ({
        brandId,
        itemId,
        quantity,
        selections,
        ...(crossSelections?.length ? { crossSelections } : {}),
      }),
    ),
    ...(draft.fulfilment === "curbside" ? { vehicle: draft.vehicle } : {}),
    ...(notes ? { notes } : {}),
    packing: draft.packingPlan,
  };
}

export type WhatsAppIntakeAction = { action: "redeem"; token: string } | { action: "current" };
export class WhatsAppCheckoutLinkError extends Error {}

/** Clear the entire fragment before validating it or starting any request. Query tokens are never read. */
export function takeWhatsAppCheckoutFragment(
  location: Pick<Location, "hash" | "pathname" | "search">,
  history: Pick<History, "replaceState" | "state">,
): WhatsAppIntakeAction {
  const fragment = location.hash;
  if (fragment || location.search) history.replaceState(history.state, "", location.pathname);
  if (new URLSearchParams(location.search).has("token"))
    throw new WhatsAppCheckoutLinkError(
      "This checkout link is incomplete. Return to your MealDeck WhatsApp conversation and request a new link.",
    );
  if (!fragment) return { action: "current" };
  const match = /^#(?:token=)?([a-f0-9]{64})$/i.exec(fragment);
  if (!match)
    throw new WhatsAppCheckoutLinkError(
      "This checkout link is incomplete. Return to your MealDeck WhatsApp conversation and request a new link.",
    );
  return { action: "redeem", token: match[1]! };
}

export async function requestWhatsAppCheckout(
  action: WhatsAppIntakeAction,
  request: typeof fetch = fetch,
  options?: { signal?: AbortSignal },
): Promise<WhatsAppCheckoutContext> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options?.signal?.aborted) controller.abort();
  else options?.signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 10_000);
  try {
    const response = await request("/api/whatsapp/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      body: JSON.stringify(action),
      signal: controller.signal,
    });
    if (!response.ok) {
      if ([400, 401, 403, 404, 409, 410].includes(response.status))
        throw new WhatsAppCheckoutLinkError(
          "This checkout link has expired or is no longer available in this browser. Return to your MealDeck WhatsApp conversation for a new link.",
        );
      throw new Error(
        "We couldn't connect to secure checkout. Check your connection and try again.",
      );
    }
    const result = parseWhatsAppCheckoutContext(await response.json());
    if (!result)
      throw new WhatsAppCheckoutLinkError(
        "We couldn't verify every part of this order. Return to your MealDeck WhatsApp conversation for a new checkout link.",
      );
    return result;
  } catch (error) {
    if (error instanceof WhatsAppCheckoutLinkError) throw error;
    throw new Error("We couldn't connect to secure checkout. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
    options?.signal?.removeEventListener("abort", abort);
  }
}

// beforeLoad removes the capability before this page mounts or requests menu/account data.
// Only a pending request lives in memory; the capability is never returned as router data.
let preparedIntake: Promise<WhatsAppCheckoutContext> | null = null;
export function prepareWhatsAppCheckoutIntake() {
  if (
    typeof window === "undefined" ||
    window.location.pathname.replace(/\/+$/, "") !== "/whatsapp/checkout" ||
    (!window.location.hash && !window.location.search)
  )
    return;
  try {
    preparedIntake = requestWhatsAppCheckout(
      takeWhatsAppCheckoutFragment(window.location, window.history),
    );
  } catch (error) {
    preparedIntake = Promise.reject(error);
  }
  // The page attaches its handler after routing; prevent an unhandled rejection in between.
  void preparedIntake.catch(() => undefined);
}

export function loadWhatsAppCheckoutIntake() {
  prepareWhatsAppCheckoutIntake();
  const prepared = preparedIntake;
  preparedIntake = null;
  return prepared ?? requestWhatsAppCheckout({ action: "current" });
}

const paymentAttempt = z
  .object({
    quoteId: z.uuid(),
    attemptId: z.uuid(),
    checkoutMode: z.enum(["member", "guest"]),
    orderId: z.uuid().optional(),
  })
  .strict();
export type WhatsAppPaymentAttempt = z.infer<typeof paymentAttempt>;
type AttemptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function whatsAppCheckoutStorageKey(
  handoffId: string,
  kind: "attempt" | "mode" = "attempt",
) {
  if (!z.uuid().safeParse(handoffId).success) throw new Error("Invalid checkout reference.");
  return "mealdeck-whatsapp-" + kind + "-v1:" + handoffId;
}

export function readWhatsAppPaymentAttempt(storage: AttemptStorage, handoffId: string) {
  try {
    const parsed = paymentAttempt.safeParse(
      JSON.parse(storage.getItem(whatsAppCheckoutStorageKey(handoffId)) ?? "null"),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Persist the original attempt before requesting payment, without customer details, food or capability. */
export function rememberWhatsAppPaymentAttempt(
  storage: AttemptStorage,
  handoffId: string,
  value: WhatsAppPaymentAttempt,
) {
  try {
    const parsed = paymentAttempt.safeParse(value);
    if (!parsed.success) return false;
    const key = whatsAppCheckoutStorageKey(handoffId);
    const existing = readWhatsAppPaymentAttempt(storage, handoffId);
    if (
      existing &&
      (existing.quoteId !== value.quoteId ||
        existing.attemptId !== value.attemptId ||
        existing.checkoutMode !== value.checkoutMode ||
        (existing.orderId && value.orderId && existing.orderId !== value.orderId))
    )
      return false;
    const encoded = JSON.stringify({
      ...parsed.data,
      ...(existing?.orderId ? { orderId: existing.orderId } : {}),
    });
    storage.setItem(key, encoded);
    return storage.getItem(key) === encoded;
  } catch {
    return false;
  }
}

export function whatsAppPaymentRecovery(
  context: WhatsAppCheckoutContext,
  saved: WhatsAppPaymentAttempt | null,
  quoteId: string,
  mode: MealDeckCheckoutMode,
) {
  if (context.attemptId && context.quoteId === quoteId && context.checkoutMode === mode)
    return {
      quoteId,
      attemptId: context.attemptId,
      checkoutMode: mode,
      ...(context.orderId ? { orderId: context.orderId } : {}),
    };
  if (
    saved &&
    saved.quoteId === quoteId &&
    saved.checkoutMode === mode &&
    (!context.orderId || !saved.orderId || saved.orderId === context.orderId)
  )
    return saved;
  return null;
}
