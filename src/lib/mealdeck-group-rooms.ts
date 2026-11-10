import { z } from "zod";
import { packingPersonNameSchema } from "./mealdeck-packing-name";
import { sharedPaymentRoomSchema, sharedPaymentResumeSchema } from "./mealdeck-shared-payments";
import type { LaunchMenuPick } from "./launch-menu-picks";

export const GROUP_ORDER_JOIN_SECONDS = 180;
export const GROUP_ORDER_MAX_PEOPLE = 10;
const uuid = z.uuid();
const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const instant = z
  .string()
  .max(64)
  .refine((value) => Number.isFinite(Date.parse(value)));
const sourceId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const mode = z.enum(["separate", "organiser"]);
const personInput = z.string().min(1).max(128);

export const groupOrderPickSchema = z.strictObject({
  brandId: sourceId,
  itemId: sourceId,
  quantity: z.number().int().min(1).max(20),
  selections: z
    .record(sourceId, z.array(sourceId).max(30))
    .refine((value) => Object.keys(value).length <= 30),
  crossSelections: z
    .array(
      z.strictObject({
        slot: z.enum(["side", "drink"]),
        mode: z.enum(["upgrade", "extra"]),
        brandId: z.enum(["loadd", "moktl"]),
        itemId: sourceId,
      }),
    )
    .max(2)
    .optional(),
});
export type GroupOrderPick = z.infer<typeof groupOrderPickSchema>;

/** Derived display keys never become part of the authoritative saved choices. */
export function groupOrderWirePicks(picks: readonly LaunchMenuPick[]): GroupOrderPick[] {
  return picks.map(({ brandId, itemId, quantity, selections, crossSelections }) => ({
    brandId,
    itemId,
    quantity,
    selections,
    ...(crossSelections ? { crossSelections } : {}),
  }));
}
const picks = z
  .array(groupOrderPickSchema)
  .max(60)
  .refine((value) => value.reduce((sum, pick) => sum + pick.quantity, 0) <= 60);

export const groupOrderCapabilitiesSchema = z.strictObject({
  available: z.boolean(),
  guestEligible: z.boolean(),
  message: z.string().max(2000),
  joinWindowSeconds: z.literal(GROUP_ORDER_JOIN_SECONDS),
  maxPeople: z.literal(GROUP_ORDER_MAX_PEOPLE),
  newRoomsAvailable: z.boolean().optional(),
  groupOrderingStartsAt: z.iso.datetime().optional(),
});
export type GroupOrderCapabilities = z.infer<typeof groupOrderCapabilitiesSchema>;

export const groupOrderPersonSchema = z.strictObject({
  participantId: uuid,
  name: packingPersonNameSchema,
  isOrganiser: z.boolean(),
  state: z.enum(["invited", "joined", "ready", "left", "expired", "removed"]),
  version,
  bagNumber: z.number().int().min(1).max(10).nullable(),
  shareId: uuid.nullable(),
  picks: picks.optional(),
  /** Server-owned expiry for saved unpaid choices; absent on old installations. */
  choicesExpiresAt: instant.nullable().optional(),
  paymentState: z
    .enum(["unpaid", "processing", "paid", "refund_review", "cancelled"])
    .nullable()
    .optional(),
});
export type GroupOrderPerson = z.infer<typeof groupOrderPersonSchema>;

export const groupOrderRoomSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    roomId: uuid,
    revision: version,
    phase: z.enum(["collecting", "ready", "payment", "cancelled"]),
    paymentMode: mode,
    joinDeadline: instant,
    /** Server-enforced 30-minute pre-payment room deadline. */
    unpaidRoomExpiresAt: instant.nullable().optional(),
    /** Set only by canonical cancellation or confirmed order handoff. */
    closedAt: instant.nullable().optional(),
    closeReason: z.enum(["unpaid_timeout", "all_left", "fulfilled", "cancelled"]).nullable().optional(),
    invitationsClosed: z.boolean(),
    serverNow: instant,
    createdAt: instant,
    fulfilment: z.enum(["pickup", "curbside"]),
    vehicle: z
      .strictObject({
        make: z.string().min(2).max(60),
        colour: z.string().min(2).max(40),
        registrationLast4: z.string().regex(/^[A-Z0-9]{4}$/),
      })
      .nullable()
      .optional(),
    cutleryRequested: z.boolean(),
    viewer: z.strictObject({ participantId: uuid, role: z.enum(["organiser", "participant"]) }),
    people: z.array(groupOrderPersonSchema).min(1).max(GROUP_ORDER_MAX_PEOPLE),
    pendingCount: z.number().int().min(0).max(9),
    joinedCount: z.number().int().min(1).max(10),
    readyCount: z.number().int().min(0).max(10),
    canFinalize: z.boolean(),
    orderId: uuid.nullable(),
    paymentRoomId: uuid.nullable(),
  })
  .superRefine((room, context) => {
    const invalid = (message: string) => context.addIssue({ code: "custom", message });
    const person = room.people.find((entry) => entry.participantId === room.viewer.participantId);
    if (
      new Set(room.people.map((entry) => entry.participantId)).size !== room.people.length ||
      room.people.filter((entry) => entry.isOrganiser).length !== 1 ||
      !person ||
      person.isOrganiser !== (room.viewer.role === "organiser")
    )
      invalid("The room membership is inconsistent.");
    if (
      room.pendingCount !== room.people.filter((entry) => entry.state === "invited").length ||
      room.joinedCount !==
        room.people.filter((entry) => ["joined", "ready"].includes(entry.state)).length ||
      room.readyCount !== room.people.filter((entry) => entry.state === "ready").length
    )
      invalid("The participant counts are inconsistent.");
    if ((room.closedAt == null) !== (room.closeReason == null))
      invalid("The room closing state is incomplete.");
    if (room.unpaidRoomExpiresAt && room.orderId !== null)
      invalid("An order already locked for payment must not have a draft timeout.");
    if (room.closeReason === "fulfilled" && room.orderId === null)
      invalid("A fulfilled room must have a confirmed order.");
    if (
      (room.orderId === null) !== (room.paymentRoomId === null) ||
      (room.paymentRoomId !== null && room.paymentRoomId !== room.roomId)
    )
      invalid("The payment order does not belong to this room.");
    if (
      room.canFinalize &&
      (room.viewer.role !== "organiser" ||
        !["collecting", "ready"].includes(room.phase) ||
        room.pendingCount !== 0 ||
        room.readyCount !== room.joinedCount ||
        room.orderId !== null)
    )
      invalid("This group is not ready to lock its order.");
    if (
      room.viewer.role !== "organiser" &&
      room.people.some(
        (entry) => entry.participantId !== room.viewer.participantId &&
          (entry.picks !== undefined || entry.choicesExpiresAt !== undefined),
      )
    )
      invalid("Another person's private draft was included.");
  });
export type GroupOrderRoom = z.infer<typeof groupOrderRoomSchema>;

export const groupOrderInviteSchema = z.strictObject({ roomId: uuid, participantId: uuid, token });
export type GroupOrderInvite = z.infer<typeof groupOrderInviteSchema>;
export const groupOrderInvitationPreviewSchema = z.strictObject({
  schemaVersion: z.literal(1),
  roomId: uuid,
  participantId: uuid,
  organiserName: packingPersonNameSchema,
  inviteeName: packingPersonNameSchema,
  paymentMode: mode,
  joinDeadline: instant,
  serverNow: instant,
  joinable: z.boolean(),
  message: z.string().max(2000),
});
export type GroupOrderInvitationPreview = z.infer<typeof groupOrderInvitationPreviewSchema>;

export const groupOrderRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("create"),
    attemptId: uuid,
    name: personInput,
    inviteNames: z.array(personInput).max(9),
    paymentMode: mode,
    fulfilment: z.enum(["pickup", "curbside"]),
    vehicle: z.unknown().optional(),
    cutleryRequested: z.boolean(),
  }),
  groupOrderInviteSchema.extend({ action: z.literal("preview") }),
  groupOrderInviteSchema.extend({ action: z.literal("join"), name: personInput }),
  z.strictObject({ action: z.literal("room"), roomId: uuid }),
  z.strictObject({ action: z.literal("save"), roomId: uuid, version, picks }),
  z.strictObject({ action: z.literal("ready"), roomId: uuid, version, ready: z.boolean() }),
  z.strictObject({ action: z.literal("leave"), roomId: uuid }),
  z.strictObject({ action: z.literal("remove"), roomId: uuid, participantId: uuid }),
  z.strictObject({ action: z.literal("close"), roomId: uuid }),
  z.strictObject({
    action: z.literal("finalize"),
    roomId: uuid,
    revision: version,
    attemptId: uuid,
    reviewConfirmed: z.literal(true),
  }),
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
export type GroupOrderRequest = z.infer<typeof groupOrderRequestSchema>;

export const groupOrderResultSchema = z
  .strictObject({
    room: groupOrderRoomSchema,
    payment: sharedPaymentRoomSchema.nullable(),
    inviteLinks: z
      .array(
        z.strictObject({
          participantId: uuid,
          name: packingPersonNameSchema,
          url: z.string().min(1).max(2000),
        }),
      )
      .max(9)
      .optional(),
    resumePayments: z.array(sharedPaymentResumeSchema).max(10).optional(),
    checkoutUrl: z.string().min(1).max(4096).nullable().optional(),
  })
  .superRefine((result, context) => {
    const invalid = (message: string) => context.addIssue({ code: "custom", message });
    if (
      result.payment &&
      (result.payment.roomId !== result.room.paymentRoomId ||
        result.payment.orderId !== result.room.orderId)
    )
      invalid("The payment belongs to another room.");
    if ((result.room.paymentRoomId !== null) !== (result.payment !== null))
      invalid("The saved order is missing its payment status.");
    if (result.inviteLinks?.length && result.room.viewer.role !== "organiser")
      invalid("Only the organiser may receive unused invitations.");
    if (
      new Set(result.inviteLinks?.map((link) => link.participantId)).size !==
      (result.inviteLinks?.length ?? 0)
    )
      invalid("The invitation list repeats a participant.");
    if (
      result.inviteLinks?.some(
        (link) =>
          !result.room.people.some(
            (person) => person.participantId === link.participantId && person.state === "invited",
          ),
      )
    )
      invalid("The invitation no longer belongs to a waiting person.");
    if (
      new Set(result.resumePayments?.map((attempt) => attempt.attemptId)).size !==
      (result.resumePayments?.length ?? 0)
    )
      invalid("The payment recovery list is inconsistent.");
    if (result.checkoutUrl && !result.payment) invalid("An unfrozen room cannot request payment.");
  });
export type GroupOrderResult = z.infer<typeof groupOrderResultSchema>;

export function groupOrderRoomPath(roomId: string): string {
  if (!uuid.safeParse(roomId).success) throw new Error("This group room link is invalid.");
  return "/group-order?room=" + roomId;
}
