import { z } from "zod";
import { normaliseOrderNotes } from "./mealdeck-order-notes";

const timestamp = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const textReply = z.object({ text: z.string().max(8192).optional() });
export const replyStatus = z.enum(["queued", "sending", "sent", "held", "cancelled"]);
const inboxSession = z.object({
  sessionId: z.uuid(),
  mode: z.enum(["ai", "support", "staff"]),
  supportReason: z.string().max(300).nullable(),
  assignedTo: z.uuid().nullable(),
  lastInboundAt: timestamp,
  draft: z.object({
    customer: z.object({ name: z.string().max(240), phone: z.string().max(40) }).optional(),
    fulfilment: z.enum(["pickup", "curbside"]).optional(),
    vehicle: z
      .object({
        make: z.string().max(60),
        colour: z.string().max(40),
        registrationLast4: z.string().max(4),
      })
      .nullable()
      .optional(),
    notes: z.string().max(2000).optional(),
    picks: z
      .array(
        z.object({
          brandId: z.string().max(180),
          itemId: z.string().max(180),
          quantity: z.number().int().min(1).max(20),
          selections: z.record(z.string(), z.array(z.string())).optional(),
        }),
      )
      .max(60)
      .optional(),
  }),
  orderBinding: z
    .object({
      orderId: z.uuid(),
      fulfilment: z.enum(["pickup", "curbside"]),
      status: z.enum(["payment_pending", "paid", "accepted", "ready", "completed", "held"]),
      verifiedPaid: z.boolean(),
      arrivedAt: timestamp.nullable(),
    })
    .nullable(),
  recentMessages: z
    .array(
      z.object({
        eventId: z.uuid(),
        input: z.object({
          text: z.string().max(8192).optional(),
          actionId: z.string().max(200).optional(),
          unsupported: z.boolean().optional(),
        }),
        receivedAt: timestamp,
        status: z.string().max(60),
      }),
    )
    .max(12),
  heldReplies: z
    .array(z.object({ id: z.uuid(), reason: z.string().max(80).nullable(), reply: textReply }))
    .max(6),
  recentReplies: z
    .array(
      z.object({
        id: z.uuid(),
        requestId: z.uuid().nullable().optional(),
        status: replyStatus,
        reply: textReply,
        createdAt: timestamp,
      }),
    )
    .max(12)
    .optional()
    .default([]),
});
const inbox = z.object({ configured: z.boolean(), sessions: z.array(inboxSession).max(100) });
export type WhatsAppInboxSession = z.infer<typeof inboxSession>;
export function parseWhatsAppInbox(value: unknown) {
  const parsed = inbox.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const pendingReply = z
  .object({ requestId: z.uuid(), textHash: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export type PendingReply = z.infer<typeof pendingReply>;
type ReplyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type InboxScope = { tenantId: string; locationId: string; staffUserId: string };

export function whatsAppReplyStorageKey(scope: InboxScope, sessionId: string) {
  const ids = [scope.tenantId, scope.locationId, scope.staffUserId, sessionId];
  if (ids.some((value) => !z.uuid().safeParse(value).success))
    throw new Error("Select a valid staff conversation.");
  return "mealdeck-whatsapp-reply-v1:" + ids.join(":");
}

export function readWhatsAppPendingReply(storage: ReplyStorage, key: string) {
  try {
    const parsed = pendingReply.safeParse(JSON.parse(storage.getItem(key) ?? "null"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Store identifiers and a digest only. Message bodies remain in memory and in the authorised server inbox. */
export async function prepareWhatsAppStaffReply(storage: ReplyStorage, key: string, value: string) {
  const text = normaliseOrderNotes(value);
  if (!text) throw new Error("Write a reply before sending.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const textHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const previous = readWhatsAppPendingReply(storage, key);
  if (storage.getItem(key) !== null && !previous)
    throw new Error(
      "The saved reply reference could not be verified. Refresh the conversation and ask the team to check the previous send before sending another reply.",
    );
  if (previous && previous.textHash !== textHash)
    throw new Error(
      "The previous reply has not been confirmed. Retry its exact text or refresh to check its status before writing another reply.",
    );
  const pending = previous ?? { requestId: crypto.randomUUID(), textHash };
  const encoded = JSON.stringify(pending);
  storage.setItem(key, encoded);
  if (storage.getItem(key) !== encoded)
    throw new Error(
      "Allow browser storage before sending so an interrupted reply can be retried safely.",
    );
  return { ...pending, text };
}

export function forgetPendingReply(storage: ReplyStorage, key: string, requestId: string) {
  if (readWhatsAppPendingReply(storage, key)?.requestId === requestId) storage.removeItem(key);
}
