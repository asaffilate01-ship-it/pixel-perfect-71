import { createHash } from "node:crypto";
import { z } from "zod";
import { cashOrderSchema, cashQuoteSchema } from "./mealdeck-cash-orders";
import {
  CheckoutProblem,
  checkoutQuoteInput,
  normaliseCheckoutSelection,
} from "./mealdeck-checkout-selection";
import { normalizeCustomerName, normalizeCustomerPhone } from "./mealdeck-customer";
import {
  normaliseOrderNotes,
  orderNotesMatch,
  ORDER_NOTES_ERROR_MESSAGE,
} from "./mealdeck-order-notes";
import {
  createPaymentClients,
  PAYMENT_NO_STORE,
  paymentDatabaseError,
  paymentErrorResponse,
  paymentObject,
  readPaymentInput,
  requirePaymentOrigin,
  verifiedPaymentUser,
  type PaymentClients,
  type PaymentJson,
} from "./mealdeck-payment-server-core";
import type { MealDeckRuntimeEnv } from "./mealdeck-runtime-config";

const scopeFields = { tenantId: z.uuid(), locationId: z.uuid() };
const cashInput = z.union([
  checkoutQuoteInput.extend({
    ...scopeFields,
    fulfilment: z.literal("pickup"),
    customerName: z.string(),
    customerPhone: z.string(),
  }),
  z.strictObject({
    ...scopeFields,
    action: z.literal("confirm"),
    quoteId: z.uuid(),
    attemptId: z.uuid(),
    cashReceived: z.literal(true),
  }),
  z.strictObject({
    ...scopeFields,
    action: z.literal("status"),
    quoteId: z.uuid(),
    attemptId: z.uuid(),
  }),
  z.strictObject({
    ...scopeFields,
    action: z.literal("cancel"),
    quoteId: z.uuid(),
    attemptId: z.uuid(),
  }),
]);

function cashUnavailable() {
  return new CheckoutProblem(
    "cash_unconfigured",
    "Staff cash ordering is not ready for this kitchen. Ask an administrator to finish its setup.",
    503,
  );
}

async function cashRpc(clients: PaymentClients, name: string, args: PaymentJson) {
  const { data, error } = await clients.service.rpc(name, args);
  if (error) {
    const message = String(paymentObject(error)["message"] ?? "");
    if (/PGRST202|42883/.test(String(paymentObject(error)["code"] ?? ""))) throw cashUnavailable();
    if (/cash_contact_required/.test(message))
      throw new CheckoutProblem(
        "contact_required",
        "Enter the customer's name and a valid phone number.",
      );
    if (/notes_invalid/.test(message))
      throw new CheckoutProblem("invalid_notes", ORDER_NOTES_ERROR_MESSAGE);
    if (/cash_attestation_required|cash_invalid_request/.test(message))
      throw new CheckoutProblem(
        "cash_confirmation_required",
        "Review the order and confirm that the cash has been received.",
      );
    if (/cash_attempt_closed/.test(message))
      throw new CheckoutProblem(
        "cash_attempt_closed",
        "This unused cash attempt is closed. Review a fresh order before confirming cash.",
        409,
      );
    if (/checkout_unavailable/.test(message))
      throw new CheckoutProblem(
        "ordering_closed",
        "The kitchen is not accepting new orders. Saved cash results can still be checked.",
        409,
      );
    throw paymentDatabaseError(error);
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new CheckoutProblem(
      "cash_result_unverified",
      "The saved cash result could not be verified. Check the same attempt before creating another order.",
      502,
    );
  return data as PaymentJson;
}

function cashResult(raw: PaymentJson, quoteId: string, confirmed: boolean) {
  const parsed = z
    .object({
      order: cashOrderSchema.nullable(),
      replayed: z.boolean(),
      cancelled: z.boolean().optional(),
    })
    .safeParse(raw);
  if (
    !parsed.success ||
    (confirmed && !parsed.data.order) ||
    (parsed.data.order && parsed.data.cancelled === true) ||
    (parsed.success && parsed.data.order && parsed.data.order.quoteId !== quoteId)
  )
    throw new CheckoutProblem(
      "cash_result_unverified",
      "The saved cash result could not be verified. Check the same attempt before creating another order.",
      502,
    );
  return parsed.data;
}

function requireNewCashAdmission(env: MealDeckRuntimeEnv) {
  // These existing application switches remain authoritative for new orders.
  // Cash never depends on a Stripe credential, native SDK or Terminal signoff.
  if (
    env["MEALDECK_ONLINE_CHECKOUT_ENABLED"] !== "true" ||
    env["MEALDECK_CHECKOUT_INTEGRATION_APPROVED"] !== "signed-off"
  )
    throw new CheckoutProblem(
      "ordering_closed",
      "New orders are not enabled for this kitchen. Saved cash results can still be checked.",
      409,
    );
}

/** One same-origin staff-only transport. Actor and destination come from verified server configuration. */
export async function handleCashOrdersRequest(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
) {
  try {
    if (request.method !== "POST")
      return Response.json(
        { error: "method_not_allowed" },
        { status: 405, headers: { ...PAYMENT_NO_STORE, Allow: "POST" } },
      );
    requirePaymentOrigin(request);
    const parsed = cashInput.safeParse(await readPaymentInput(request));
    if (!parsed.success)
      throw new CheckoutProblem(
        "invalid_request",
        "Review the cash order, customer details and confirmation.",
      );
    const input = parsed.data;
    const clients = createPaymentClients(env, fetcher);
    if (!clients) throw cashUnavailable();
    if (
      input.tenantId.toLowerCase() !== clients.config.tenantId ||
      input.locationId.toLowerCase() !== clients.config.locationId
    )
      throw new CheckoutProblem(
        "not_permitted",
        "This staff destination does not match the configured kitchen.",
        403,
      );
    const actor = await verifiedPaymentUser(request, clients.publicClient, true);
    const scope = {
      p_actor: actor,
      p_tenant: clients.config.tenantId,
      p_location: clients.config.locationId,
    };
    const respond = (value: unknown) => Response.json(value, { headers: PAYMENT_NO_STORE });
    if (input.action === "quote") {
      requireNewCashAdmission(env);
      const customerName = normalizeCustomerName(input.customerName);
      const customerPhone = normalizeCustomerPhone(input.customerPhone);
      if (!customerName || !customerPhone || /[\p{Cc}\p{Cf}]/u.test(input.customerName))
        throw new CheckoutProblem(
          "contact_required",
          "Enter the customer's name and a valid phone number.",
        );
      let notes: string | null;
      try {
        notes = normaliseOrderNotes(input.notes);
      } catch {
        throw new CheckoutProblem("invalid_notes", ORDER_NOTES_ERROR_MESSAGE);
      }
      const selection = normaliseCheckoutSelection(
        {
          action: "quote",
          fulfilment: "pickup",
          picks: input.picks,
          packing: input.packing,
          ...(input.vehicle === undefined ? {} : { vehicle: input.vehicle }),
          ...(notes ? { notes } : {}),
        },
        clients.config.tenantId,
      );
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            selection: selection.requestHash,
            customerName,
            customerPhone,
          }),
        )
        .digest("hex");
      const raw = await cashRpc(clients, "mealdeck_create_cash_quote", {
        ...scope,
        p_selection: selection.lines,
        p_packing: selection.packingPlan,
        p_request_hash: requestHash,
        p_customer_name: customerName,
        p_customer_phone: customerPhone,
        p_notes: notes,
      });
      const quote = cashQuoteSchema.safeParse(raw);
      if (
        !quote.success ||
        quote.data.customerName !== customerName ||
        quote.data.customerPhone !== customerPhone ||
        !orderNotesMatch(notes, quote.data.notes)
      )
        throw new CheckoutProblem(
          "cash_quote_unverified",
          "The kitchen total or customer details could not be verified. Review the order again.",
          502,
        );
      return respond({ quote: quote.data });
    }
    const args = { ...scope, p_quote: input.quoteId, p_attempt: input.attemptId };
    if (input.action === "cancel") {
      const closed = cashResult(
        await cashRpc(clients, "mealdeck_cancel_cash_order_attempt", args),
        input.quoteId,
        false,
      );
      if (!closed.order && closed.cancelled !== true)
        throw new CheckoutProblem(
          "cash_result_unverified",
          "The unused attempt could not be closed. Check the same saved attempt.",
          502,
        );
      return respond(closed);
    }
    // Always recover first, including after a switch is disabled or the kitchen
    // closes. SQL checks current permission and waits on the confirmation lock.
    const existing = cashResult(
      await cashRpc(clients, "mealdeck_cash_order_status", args),
      input.quoteId,
      false,
    );
    if (input.action === "status" || existing.order) return respond(existing);
    if (existing.cancelled)
      throw new CheckoutProblem(
        "cash_attempt_closed",
        "This unused cash attempt is closed. Review a fresh order before confirming cash.",
        409,
      );
    requireNewCashAdmission(env);
    return respond(
      cashResult(
        await cashRpc(clients, "mealdeck_confirm_cash_order", {
          ...args,
          p_cash_received: input.cashReceived,
        }),
        input.quoteId,
        true,
      ),
    );
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
