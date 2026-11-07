import { z } from "zod";

/** Wire contract for a provisioned, store-scoped bridge; never a public checkout input. */
const printable = (limit: number, empty = false) =>
  z
    .string()
    .refine(
      (value) =>
        (empty || value.trim().length > 0) &&
        [...value].length <= limit &&
        !/[\p{Cc}\p{Cf}]/u.test(value),
      "Use bounded plain text without hidden control characters.",
    );
const notes = z
  .string()
  .refine(
    (value) =>
      [...value].length <= 1_000 &&
      !/\p{Cf}/u.test(value) &&
      ![...value].some(
        (character) => /\p{Cc}/u.test(character) && character !== "\n" && character !== "\t",
      ),
    "Use bounded kitchen notes without hidden control characters.",
  );
const timestamp = z.iso.datetime({ offset: true });
const money = z.number().int().min(0).max(10_000_000);
const quantity = z.number().int().min(1).max(999);

export const marketplacePlatformSchema = z.enum(["uber_eats", "just_eat"]);
export const marketplaceRemoteStateSchema = z.enum([
  "new",
  "accepted",
  "preparing",
  "ready",
  "handed_over",
  "cancelled",
]);
export const marketplaceActionSchema = z.enum(["accept", "preparing", "ready", "handover"]);
export const marketplaceCapabilitiesSchema = z.strictObject({
  accept: z.boolean(),
  preparing: z.boolean(),
  ready: z.boolean(),
  handover: z.boolean(),
});
export const marketplaceEvidenceSchema = z.strictObject({
  profileId: printable(120),
  profileVersion: printable(80),
});
export const marketplaceHealthErrorSchema = z.enum([
  "ui_unavailable",
  "identity_mismatch",
  "profile_mismatch",
  "session_required",
  "device_unavailable",
  "observation_incomplete",
  "command_uncertain",
  "bridge_error",
]);
const identity = {
  externalStoreId: printable(200).refine(
    (value) => value.trim() === value && !/[\p{Zl}\p{Zp}]/u.test(value),
  ),
  externalOrderId: printable(200).refine(
    (value) => value.trim() === value && !/[\p{Zl}\p{Zp}]/u.test(value),
  ),
  // Preserve letters, punctuation and leading zeroes. Never coerce to a number.
  displayReference: printable(80).refine(
    (value) => value.trim() === value && !/[\p{Zl}\p{Zp}]/u.test(value),
  ),
};
export const marketplaceObservationSchema = z
  .strictObject({
    platform: marketplacePlatformSchema,
    ...identity,
    state: marketplaceRemoteStateSchema,
    fulfilment: z.enum(["collection", "platform_delivery", "merchant_delivery"]),
    paymentResponsibility: z.literal("platform"),
    currency: z.literal("GBP"),
    totalPence: money,
    placedAt: timestamp,
    observedAt: timestamp,
    items: z
      .array(
        z.strictObject({
          externalLineId: printable(200),
          name: printable(300),
          quantity,
          unitPricePence: money.nullable(),
          modifiers: z.array(z.strictObject({ name: printable(300), quantity })).max(100),
          notes: notes.nullable().optional(),
        }),
      )
      .min(1)
      .max(200),
    notes: notes.nullable().optional(),
    evidence: marketplaceEvidenceSchema,
  })
  .refine(
    (order) => new Set(order.items.map((item) => item.externalLineId)).size === order.items.length,
    "Each order line needs a unique identity.",
  );

export const marketplaceHeartbeatSchema = z
  .strictObject({
    evidence: marketplaceEvidenceSchema,
    status: z.enum(["healthy", "degraded"]),
    capabilities: marketplaceCapabilitiesSchema,
    observedAt: timestamp,
    errorCode: marketplaceHealthErrorSchema.optional(),
  })
  .refine(
    (value) => value.status !== "healthy" || value.errorCode === undefined,
    "A healthy bridge cannot report an unresolved error.",
  );

export const marketplaceResultSchema = z
  .strictObject({
    commandId: z.uuid(),
    leaseToken: z.uuid(),
    outcome: z.enum(["confirmed", "not_applied", "uncertain", "unsupported"]),
    observedState: marketplaceRemoteStateSchema.or(z.literal("unknown")).optional(),
    observedAt: timestamp.optional(),
    externalStoreId: identity.externalStoreId.optional(),
    externalOrderId: identity.externalOrderId.optional(),
    displayReference: identity.displayReference.optional(),
    evidence: marketplaceEvidenceSchema,
  })
  .refine(
    (value) =>
      value.outcome !== "confirmed" ||
      (value.observedState !== undefined &&
        value.observedState !== "unknown" &&
        value.observedAt !== undefined &&
        value.externalStoreId !== undefined &&
        value.externalOrderId !== undefined &&
        value.displayReference !== undefined),
    "Confirmation needs a fresh exact-order readback.",
  );

export const marketplaceBridgeRequestSchema = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("heartbeat"),
    connectorId: z.uuid(),
    payload: marketplaceHeartbeatSchema,
  }),
  z.strictObject({
    op: z.literal("observe"),
    connectorId: z.uuid(),
    payload: marketplaceObservationSchema,
  }),
  z.strictObject({
    op: z.literal("claim"),
    connectorId: z.uuid(),
    payload: z.strictObject({ evidence: marketplaceEvidenceSchema }),
  }),
  z.strictObject({
    op: z.literal("result"),
    connectorId: z.uuid(),
    payload: marketplaceResultSchema,
  }),
]);

const commandSchema = z.strictObject({
  commandId: z.uuid(),
  leaseToken: z.uuid(),
  leaseExpiresAt: timestamp,
  mode: z.enum(["execute", "reconcile"]),
  platform: marketplacePlatformSchema,
  ...identity,
  action: marketplaceActionSchema,
  expectedState: marketplaceRemoteStateSchema,
});
export const marketplaceBridgeResponseSchemas = {
  heartbeat: z.strictObject({
    ok: z.literal(true),
    platform: marketplacePlatformSchema,
    externalStoreId: identity.externalStoreId,
    profileId: printable(120),
    profileVersion: printable(80),
    capabilities: marketplaceCapabilitiesSchema,
    enabled: z.literal(true),
    serverTime: timestamp,
  }),
  observe: z.strictObject({
    ok: z.literal(true),
    orderId: z.uuid(),
    replayed: z.boolean(),
    held: z.boolean(),
    platformState: marketplaceRemoteStateSchema,
    receivedAt: timestamp,
  }),
  claim: z.strictObject({ command: commandSchema.nullable() }),
  result: z.strictObject({
    ok: z.literal(true),
    commandId: z.uuid(),
    status: z.enum(["confirmed", "needs_checking", "unsupported"]),
  }),
};

export type MarketplaceBridgeRequest = z.infer<typeof marketplaceBridgeRequestSchema>;
export type MarketplaceBridgeOperation = MarketplaceBridgeRequest["op"];
