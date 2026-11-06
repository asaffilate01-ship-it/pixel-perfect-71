import { z } from "zod";
import type { LaunchMenuPick } from "./launch-menu-picks";
import { getMealDeckOpsClient } from "./mealdeck-ops-browser";
import { orderNumberSchema } from "./mealdeck-order-number";

export type CashScope = { tenantId: string; locationId: string };
export type CashQuoteInput = {
  action: "quote";
  fulfilment: "pickup";
  picks: Omit<LaunchMenuPick, "key">[];
  packing: {
    cutleryRequested: boolean;
    separateBags: boolean;
    bagCount: number;
    allocations: { lineId: string; bag: number; quantity: number }[];
  };
  customerName: string;
  customerPhone: string;
  notes?: string;
};
export type CashAction =
  | CashQuoteInput
  | { action: "confirm"; quoteId: string; attemptId: string; cashReceived: true }
  | { action: "status" | "cancel"; quoteId: string; attemptId: string };

const pence = z.number().int().nonnegative().max(100_000_000);
const instant = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const contact = {
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  notes: z.string().nullable(),
};
export const cashPricedLineSchema = z.object({
  lineId: z.string().min(1).max(80),
  parentLineId: z.string().nullable(),
  name: z.string().min(1).max(240),
  quantity: z.number().int().min(1).max(60),
  base_unit_pence: pence,
  unit_pence: pence,
  line_pence: pence,
  modifiers: z
    .array(
      z.object({
        group_name: z.string(),
        name: z.string(),
        price_delta_pence: pence,
        kind: z.string(),
        target_brand_name: z.string().nullable(),
        target_description: z.string().nullable(),
      }),
    )
    .max(60),
  attachment: z.string().nullable(),
});
export type CashPricedLine = z.infer<typeof cashPricedLineSchema>;
const packingSchema = z.object({
  version: z.literal(1),
  separateBags: z.boolean(),
  cutleryRequested: z.boolean(),
  bags: z
    .array(
      z.object({
        number: z.number().int().min(1).max(10),
        name: z.string().optional(),
        allocations: z.array(
          z.object({ lineId: z.string(), quantity: z.number().int().positive() }),
        ),
      }),
    )
    .min(1)
    .max(10),
});
export const cashQuoteSchema = z
  .object({
    quoteId: z.uuid(),
    expiresAt: instant,
    currency: z.literal("GBP"),
    fulfilment: z.literal("pickup"),
    grossPence: pence,
    discountPence: pence,
    totalPence: pence.positive(),
    collectionEstimateMinutes: z.number().int().positive().max(240),
    lines: z.array(cashPricedLineSchema).min(1).max(180),
    packingPlan: packingSchema,
    ...contact,
  })
  .refine((quote) => quote.grossPence - quote.discountPence === quote.totalPence)
  .refine(
    (quote) => quote.lines.reduce((sum, line) => sum + line.line_pence, 0) === quote.grossPence,
  );
export type CashQuote = z.infer<typeof cashQuoteSchema>;

export const cashOrderSchema = z.object({
  orderId: z.uuid(),
  quoteId: z.uuid(),
  orderNumber: orderNumberSchema,
  handoffCode: z.string().regex(/^\d{4}$/),
  fulfilment: z.literal("pickup"),
  currency: z.literal("GBP"),
  paymentMethod: z.literal("cash"),
  cashReceived: z.literal(true),
  paymentStatus: z.string().min(1).max(40),
  verifiedPaid: z.boolean(),
  status: z.string().min(1).max(60),
  totalPence: pence.positive(),
  receivedAt: instant,
  acceptedAt: instant.nullable(),
  ...contact,
});
export type CashOrder = z.infer<typeof cashOrderSchema>;
export type CashResponse = {
  quote?: CashQuote;
  order?: CashOrder | null;
  replayed?: boolean;
  cancelled?: boolean;
};

export class CashOrderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 0,
    public readonly outcomeUnknown = false,
  ) {
    super(message);
    this.name = "CashOrderError";
  }
}

const knownRejections = new Set([
  "invalid_request",
  "invalid_origin",
  "request_too_large",
  "contact_required",
  "invalid_notes",
  "cash_confirmation_required",
  "not_permitted",
  "sign_in_required",
  "verification_required",
  "mfa_required",
  "ordering_closed",
  "quote_changed",
  "menu_changed",
  "attempt_conflict",
  "payment_not_found",
  "payment_in_progress",
  "retry_later",
  "invalid_selection",
  "invalid_option",
  "incomplete_choices",
  "item_unavailable",
  "upgrade_unavailable",
  "basket_limit",
  "vehicle_not_needed",
  "variant_required",
  "cash_attempt_closed",
]);

/** Transport only. A successful staff session and current scoped permission are checked on the server. */
export async function requestCashOrderWithToken(
  scope: CashScope,
  body: CashAction,
  accessToken: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<CashResponse> {
  const mutating = body.action === "confirm" || body.action === "cancel";
  let response: Response;
  try {
    response = await fetcher("/api/ops/cash", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      credentials: "same-origin",
      cache: "no-store",
      ...(signal ? { signal } : {}),
      body: JSON.stringify({ ...body, tenantId: scope.tenantId, locationId: scope.locationId }),
    });
  } catch {
    throw new CashOrderError(
      "connection_lost",
      body.action === "confirm"
        ? "The cash result could not be checked. Check the saved attempt before creating another order."
        : "The staff connection could not be reached. Try again.",
      0,
      mutating,
    );
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    raw = null;
  }
  if (!response.ok) {
    const error = z.object({ error: z.string(), message: z.string().max(1000) }).safeParse(raw);
    throw new CashOrderError(
      error.success ? error.data.error : "unavailable",
      error.success
        ? error.data.message
        : "The cash result could not be checked. Retry the saved attempt.",
      response.status,
      mutating &&
        (response.status >= 500 || !error.success || !knownRejections.has(error.data.error)),
    );
  }
  const parsed =
    body.action === "quote"
      ? z.object({ quote: cashQuoteSchema }).safeParse(raw)
      : z
          .object({
            order: cashOrderSchema.nullable(),
            replayed: z.boolean(),
            cancelled: z.boolean().optional(),
          })
          .safeParse(raw);
  if (
    !parsed.success ||
    (body.action === "confirm" && "order" in parsed.data && !parsed.data.order) ||
    (body.action === "cancel" &&
      "order" in parsed.data &&
      !parsed.data.order &&
      parsed.data.cancelled !== true) ||
    ("order" in parsed.data && parsed.data.order && parsed.data.cancelled === true) ||
    (parsed.success &&
      body.action !== "quote" &&
      "order" in parsed.data &&
      parsed.data.order &&
      parsed.data.order.quoteId !== body.quoteId)
  )
    throw new CashOrderError(
      "invalid_response",
      "The cash result could not be verified. Check the saved attempt.",
      502,
      mutating,
    );
  if ("order" in parsed.data) {
    const { cancelled, ...result } = parsed.data;
    return { ...result, ...(cancelled === undefined ? {} : { cancelled }) };
  }
  return parsed.data;
}

export async function requestCashOrder(
  scope: CashScope,
  body: CashAction,
  signal?: AbortSignal,
): Promise<CashResponse> {
  const client = getMealDeckOpsClient();
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token)
    throw new CashOrderError(
      "sign_in_required",
      "Sign in with your authorised staff account.",
      401,
    );
  let result: CashResponse | undefined;
  let failure: unknown;
  try {
    result = await requestCashOrderWithToken(scope, body, data.session.access_token, signal);
  } catch (error) {
    failure = error;
  }
  let sameSession = false;
  try {
    const current = await client.auth.getSession();
    sameSession =
      !current.error &&
      getMealDeckOpsClient() === client &&
      current.data.session?.user.id === data.session.user.id;
  } catch {
    /* A changed/retired staff connection cannot clear a saved attempt. */
  }
  if (!sameSession)
    throw new CashOrderError(
      "session_changed",
      "Your staff session changed. Sign in and check the saved attempt.",
      401,
      body.action === "confirm" || body.action === "cancel",
    );
  if (failure) throw failure;
  return result!;
}
