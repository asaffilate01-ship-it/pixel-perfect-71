import { z } from "zod";
import { packingPersonNameSchema } from "./mealdeck-packing-name";
import { orderNumberSchema } from "./mealdeck-order-number";
import { normaliseOrderNotes } from "./mealdeck-order-notes";

/** Browser-safe transport only. Payment and allocation authority stays on the server. */
export type SharedPaymentChoice = "host" | "by_bag" | "equal";
export type SharedPaymentSplitMode = Exclude<SharedPaymentChoice, "host">;

const uuid = z.string().uuid();
const pence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const bagNumber = z.number().int().min(1).max(10);
const lineId = z.string().min(1).max(180);
const instant = z
  .string()
  .max(64)
  .refine((value) => Number.isFinite(Date.parse(value)));

export const sharedPaymentCapabilitiesSchema = z.strictObject({
  available: z.boolean(),
  guestEligible: z.boolean(),
  message: z.string().max(2000),
  newRoomsAvailable: z.boolean().optional(),
  groupOrderingStartsAt: instant.optional(),
});
export type SharedPaymentCapabilities = z.infer<typeof sharedPaymentCapabilitiesSchema>;

export const sharedPaymentShareSchema = z.strictObject({
  shareId: uuid,
  bagNumber,
  amountPence: pence,
  paidPence: pence,
  status: z.enum(["unpaid", "processing", "paid", "refund_review", "cancelled"]),
});
export type SharedPaymentShare = z.infer<typeof sharedPaymentShareSchema>;

export const sharedPaymentRoomSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    roomId: uuid,
    orderId: uuid,
    orderNumber: orderNumberSchema.nullable().optional(),
    notes: z
      .string()
      .nullable()
      .optional()
      .refine((value) => {
        try {
          return value === undefined || normaliseOrderNotes(value) === value;
        } catch {
          return false;
        }
      }),
    handoffCode: z
      .string()
      .regex(/^\d{4}$/)
      .nullable(),
    splitMode: z.enum(["by_bag", "equal"]),
    status: z.enum([
      "awaiting_payment",
      "partially_paid",
      "paid",
      "cancelled",
      "expired",
      "refund_review",
      "hold",
    ]),
    currency: z.literal("gbp"),
    totalPence: pence.refine((value) => value > 0),
    paidPence: pence,
    remainingPence: pence,
    expiresAt: instant,
    viewer: z.strictObject({
      role: z.enum(["organiser", "participant"]),
      shareId: uuid.nullable(),
    }),
    canPay: z.boolean(),
    canCancel: z.boolean(),
    message: z.string().max(2000),
    shares: z.array(sharedPaymentShareSchema).min(1).max(10),
    lines: z
      .array(
        z.strictObject({
          lineId,
          name: z.string().min(1).max(500),
          quantity: z.number().int().min(1).max(60),
          linePence: pence,
          description: z.string().max(4000).optional(),
        }),
      )
      .min(1)
      .max(180),
    bags: z
      .array(
        z.strictObject({
          number: bagNumber,
          name: packingPersonNameSchema.optional(),
          allocations: z
            .array(z.strictObject({ lineId, quantity: z.number().int().min(1).max(60) }))
            .min(1)
            .max(180),
        }),
      )
      .min(1)
      .max(10),
    cutleryRequested: z.boolean(),
    fulfilment: z.enum(["pickup", "curbside"]),
  })
  .superRefine((room, context) => {
    const invalid = (message: string) => context.addIssue({ code: "custom", message });
    const shareIds = new Set(room.shares.map((share) => share.shareId));
    const shareBags = new Set(room.shares.map((share) => share.bagNumber));
    const lines = new Map(room.lines.map((line) => [line.lineId, line]));
    const bags = new Set(room.bags.map((bag) => bag.number));
    if (
      shareIds.size !== room.shares.length ||
      shareBags.size !== room.shares.length ||
      lines.size !== room.lines.length ||
      bags.size !== room.bags.length ||
      room.shares.some((share) => !bags.has(share.bagNumber))
    )
      invalid("The payment room has inconsistent shares or bags.");
    for (const bag of room.bags) {
      if (new Set(bag.allocations.map((part) => part.lineId)).size !== bag.allocations.length)
        invalid("A bag repeats the same order line.");
      if (bag.allocations.some((part) => !lines.has(part.lineId)))
        invalid("A bag refers to an unknown order line.");
    }
    const allocated = new Map(room.lines.map((line) => [line.lineId, 0]));
    for (const bag of room.bags)
      for (const part of bag.allocations)
        allocated.set(part.lineId, (allocated.get(part.lineId) ?? 0) + part.quantity);
    if (
      room.lines.some(
        (line) =>
          (allocated.get(line.lineId) ?? 0) > line.quantity ||
          (room.viewer.role === "organiser" && allocated.get(line.lineId) !== line.quantity),
      )
    )
      invalid("The visible bags do not match the order quantities.");
    if (room.viewer.role === "organiser") {
      const total = room.shares.reduce((sum, share) => sum + share.amountPence, 0);
      if (!Number.isSafeInteger(total) || total !== room.totalPence)
        invalid("The organiser's shares do not match the order total.");
    } else if (!room.viewer.shareId || !shareIds.has(room.viewer.shareId)) {
      invalid("The participant's own share is missing.");
    }
    // Participant snapshots may deliberately contain only their own share and bag.
    if (room.remainingPence > room.totalPence)
      invalid("The remaining amount exceeds the order total.");
    if (room.status === "paid" && (room.remainingPence !== 0 || room.paidPence < room.totalPence))
      invalid("A paid order still has an outstanding amount.");
    if (
      room.canPay &&
      (!["awaiting_payment", "partially_paid"].includes(room.status) || room.remainingPence === 0)
    )
      invalid("This room cannot accept another payment.");
    if (room.canCancel && room.viewer.role !== "organiser")
      invalid("Only the organiser may cancel the room.");
  });
export type SharedPaymentRoom = z.infer<typeof sharedPaymentRoomSchema>;

export const sharedPaymentInviteLinkSchema = z.strictObject({
  shareId: uuid,
  bagNumber,
  url: z.string().min(1).max(2000),
});
export type SharedPaymentInviteLink = z.infer<typeof sharedPaymentInviteLinkSchema>;

/** Only the server may return an existing attempt owned by the current payer. */
export const sharedPaymentResumeSchema = z.strictObject({
  attemptId: uuid,
  amountPence: pence.refine((value) => value > 0),
  coverRemaining: z.boolean(),
});
export type SharedPaymentResume = z.infer<typeof sharedPaymentResumeSchema>;

export const sharedPaymentResultSchema = z
  .strictObject({
    room: sharedPaymentRoomSchema,
    inviteLinks: z.array(sharedPaymentInviteLinkSchema).max(10).optional(),
    checkoutUrl: z.string().max(4000).nullable().optional(),
    resumePayments: z.array(sharedPaymentResumeSchema).max(10).optional(),
  })
  .superRefine((result, context) => {
    const attempts = result.resumePayments ?? [];
    if (
      new Set(attempts.map((attempt) => attempt.attemptId)).size !== attempts.length ||
      attempts.some((attempt) => attempt.amountPence > result.room.totalPence) ||
      (attempts.length > 0 && !["awaiting_payment", "partially_paid"].includes(result.room.status))
    )
      context.addIssue({ code: "custom", message: "The saved payment details are inconsistent." });
  });
export type SharedPaymentResult = z.infer<typeof sharedPaymentResultSchema>;

/** Processing claims belong to their original payer and cannot be covered again. */
export function sharedPaymentUnclaimedPence(room: SharedPaymentRoom): number {
  return room.shares.reduce(
    (sum, share) =>
      share.status === "unpaid" ? sum + Math.max(0, share.amountPence - share.paidPence) : sum,
    0,
  );
}

export const sharedPaymentRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("create"),
    quoteId: uuid,
    attemptId: uuid,
    bagCount: z.number().int().min(2).max(10),
    splitMode: z.enum(["by_bag", "equal"]),
    reviewConfirmed: z.literal(true),
  }),
  z.strictObject({
    action: z.literal("join"),
    roomId: uuid,
    shareId: uuid,
    token: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
  }),
  z.strictObject({ action: z.literal("room"), roomId: uuid }),
  z.strictObject({
    action: z.literal("pay"),
    roomId: uuid,
    attemptId: uuid,
    coverRemaining: z.boolean(),
    reviewConfirmed: z.literal(true),
  }),
  z.strictObject({ action: z.literal("reconcile"), roomId: uuid }),
  z.strictObject({ action: z.literal("cancel"), roomId: uuid, confirm: z.literal(true) }),
]);
export type SharedPaymentRequest = z.infer<typeof sharedPaymentRequestSchema>;

export function parseSharedPaymentCapabilities(value: unknown): SharedPaymentCapabilities | null {
  const result = sharedPaymentCapabilitiesSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parseSharedPaymentRoom(value: unknown): SharedPaymentRoom | null {
  const result = sharedPaymentRoomSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parseSharedPaymentResult(value: unknown): SharedPaymentResult | null {
  const result = sharedPaymentResultSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function isSharedPaymentRoomId(value: unknown): value is string {
  return uuid.safeParse(value).success;
}

export function sharedPaymentRoomPath(roomId: string) {
  if (!isSharedPaymentRoomId(roomId)) throw new Error("This payment room could not be identified.");
  return "/group-pay?room=" + roomId;
}
