import { z } from "zod";

const pence = z.number().int().min(0).max(100_000_000);
export const terminalOrderSchema = z
  .object({
    orderId: z.uuid(),
    // Display only; the four-digit collection credential remains separate.
    orderNumber: z
      .string()
      .regex(/^(?!0000$)(?:[0-9]{4}|[1-9][0-9]{4,18})$/)
      .nullable()
      .optional(),
    handoffCode: z
      .string()
      .regex(/^\d{4}$/)
      .nullable(),
    fulfilment: z.enum(["pickup", "curbside"]),
    kitchenName: z.string().min(1).max(160),
    currency: z.literal("gbp"),
    totalPence: pence,
    paidPence: pence,
    remainingPence: pence,
    status: z.enum(["unpaid", "processing", "paid", "hold", "cancelled"]),
    canCollect: z.boolean(),
    lines: z
      .array(
        z.object({
          name: z.string().min(1).max(240),
          quantity: z.number().int().min(1).max(600),
          linePence: pence,
          description: z.string().max(2000).optional(),
        }),
      )
      .max(600),
    message: z.string().max(1000),
  })
  .refine(
    (order) =>
      order.status === "hold"
        ? order.remainingPence === Math.max(0, order.totalPence - order.paidPence) &&
          !order.canCollect
        : order.paidPence + order.remainingPence === order.totalPence,
    "The server order balance does not reconcile.",
  )
  .refine(
    (order) => order.status !== "paid" || (order.remainingPence === 0 && !order.canCollect),
    "Paid orders cannot collect again.",
  );

export type TerminalOrder = z.infer<typeof terminalOrderSchema>;
export const terminalConfigSchema = z
  .object({
    ready: z.boolean(),
    reason: z.string().nullable(),
    message: z.string(),
    kitchen: z.object({ id: z.uuid(), name: z.string().min(1) }),
    stripeLocationId: z
      .string()
      .regex(/^tml_[A-Za-z0-9]+$/)
      .nullable(),
    mode: z.enum(["test", "live"]),
    simulationAllowed: z.boolean(),
    canCreateSale: z.boolean(),
  })
  .refine((config) => !config.ready || !!config.stripeLocationId)
  .refine((config) => config.mode !== "live" || !config.simulationAllowed);
export type TerminalConfig = z.infer<typeof terminalConfigSchema>;

export const attemptResponseSchema = z
  .object({
    order: terminalOrderSchema,
    attempt: z.object({
      id: z.uuid(),
      paymentIntentId: z
        .string()
        .regex(/^pi_[A-Za-z0-9]+$/)
        .nullable(),
      clientSecret: z.string().min(1).nullable().optional(),
      status: z.enum(["reserved", "processing", "succeeded", "cancelled", "hold"]),
    }),
    action: z.enum(["collect", "reconcile", "none"]),
  })
  .refine(
    (result) =>
      result.action !== "collect" ||
      (result.order.canCollect &&
        result.order.remainingPence > 0 &&
        result.attempt.status === "reserved" &&
        !!result.attempt.paymentIntentId &&
        !!result.attempt.clientSecret),
    "This attempt is not available for collection.",
  );
export type AttemptResponse = z.infer<typeof attemptResponseSchema>;

export const recoverySchema = z.union([
  z.strictObject({ orderId: z.uuid(), attemptId: z.uuid() }),
  z.strictObject({ quoteId: z.uuid(), attemptId: z.uuid() }),
]);
export type Recovery = z.infer<typeof recoverySchema>;

export const terminalQuoteSchema = z
  .object({
    quoteId: z.uuid(),
    expiresAt: z.string().datetime({ offset: true }),
    grossPence: pence,
    discountPence: pence,
    totalPence: pence,
    collectionEstimateMinutes: z.number().int().min(1).max(300).nullable(),
    lines: z.array(
      z
        .object({
          lineId: z.string(),
          name: z.string(),
          quantity: z.number().int().min(1),
          line_pence: pence,
          modifiers: z.array(z.object({ name: z.string() }).passthrough()),
        })
        .passthrough(),
    ),
    packingPlan: z.object({
      version: z.literal(1),
      separateBags: z.boolean(),
      cutleryRequested: z.boolean(),
      bags: z.array(
        z.object({
          number: z.number().int().min(1),
          allocations: z.array(z.object({ lineId: z.string(), quantity: z.number().int().min(1) })),
        }),
      ),
    }),
  })
  .refine((quote) => quote.grossPence - quote.discountPence === quote.totalPence);
export type TerminalQuote = z.infer<typeof terminalQuoteSchema>;

export function trustedOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  )
    throw new Error("Use the approved HTTPS MealDeck server origin.");
  return url.origin;
}

export function publicAuthKey(value: string): boolean {
  if (value.startsWith("sb_publishable_") && value.length > 20) return true;
  try {
    const segment = value.split(".")[1];
    if (!segment) return false;
    const claims = JSON.parse(atob(segment.replace(/-/g, "+").replace(/_/g, "/")));
    return claims.role === "anon";
  } catch {
    return false;
  }
}

export const bootstrapSchema = z.object({
  apiVersion: z.literal(1),
  auth: z
    .object({
      url: z.string().refine((value) => {
        try {
          trustedOrigin(value);
          return true;
        } catch {
          return false;
        }
      }),
      publishableKey: z.string().refine(publicAuthKey),
    })
    .nullable(),
  message: z.string(),
});
export type Bootstrap = z.infer<typeof bootstrapSchema>;
