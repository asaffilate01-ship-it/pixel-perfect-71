import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  parseWhatsAppInbox,
  prepareWhatsAppStaffReply,
  readWhatsAppPendingReply,
  whatsAppReplyStorageKey,
} from "../src/lib/mealdeck-whatsapp-inbox-browser";
import { WhatsAppInboxConversation } from "../src/components/ops/whatsapp-inbox-panel";

const tenantId = "00000000-0000-4000-8000-000000000001";
const locationId = "00000000-0000-4000-8000-000000000002";
const staffUserId = "00000000-0000-4000-8000-000000000003";
const sessionId = "00000000-0000-4000-8000-000000000004";
const messageId = "00000000-0000-4000-8000-000000000005";
const requestId = "00000000-0000-4000-8000-000000000006";
const scope = { tenantId, locationId, staffUserId };

function storage() {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
  };
}

function card() {
  return {
    sessionId,
    senderId: "private-provider-sender",
    mode: "staff",
    assignedTo: staffUserId,
    lastInboundAt: "2026-11-07T18:00:00Z",
    supportReason: "allergen",
    draft: {
      customer: { name: "A <Customer>", phone: "+447700900123" },
      fulfilment: "curbside",
      vehicle: { make: "VW", colour: "Blue", registrationLast4: "4ABC" },
      picks: [],
      notes: "",
    },
    orderBinding: {
      orderId: messageId,
      fulfilment: "curbside",
      status: "ready",
      verifiedPaid: true,
      arrivedAt: "2026-11-07T18:05:00Z",
      handoffCode: "1234",
    },
    recentMessages: [
      {
        eventId: messageId,
        input: { text: "I have <script> arrived" },
        receivedAt: "2026-11-07T18:05:00Z",
        status: "completed",
      },
    ],
    heldReplies: [
      {
        id: requestId,
        reason: "send_uncertain",
        reply: { text: "We are checking your question.", sealedCheckoutLink: "private-ciphertext" },
      },
    ],
    recentReplies: [
      {
        id: requestId,
        requestId,
        status: "queued",
        reply: {
          text: "We will check with the kitchen.",
          sealedCheckoutLink: "private-ciphertext",
        },
        createdAt: "2026-11-07T18:06:00Z",
      },
    ],
  };
}

describe("WhatsApp staff reply recovery", () => {
  test("exact retries retain one request ID without caching the message body", async () => {
    const local = storage();
    const key = whatsAppReplyStorageKey(scope, sessionId);
    const first = await prepareWhatsAppStaffReply(
      local,
      key,
      "  Hello A Customer\r\nWe are checking with the kitchen.  ",
    );
    const repeated = await prepareWhatsAppStaffReply(
      local,
      key,
      "Hello A Customer\nWe are checking with the kitchen.",
    );
    expect(repeated.requestId).toBe(first.requestId);
    expect(repeated.textHash).toBe(first.textHash);
    expect(repeated.text).toBe("Hello A Customer\nWe are checking with the kitchen.");
    const retained = JSON.parse(local.getItem(key)!);
    expect(Object.keys(retained).sort()).toEqual(["requestId", "textHash"]);
    expect(local.getItem(key)).not.toContain("Customer");
    expect(local.getItem(key)).not.toContain("kitchen");
    expect(readWhatsAppPendingReply(local, key)?.requestId).toBe(first.requestId);
    await expect(prepareWhatsAppStaffReply(local, key, "A different reply")).rejects.toThrow(
      "previous reply has not been confirmed",
    );
    expect(readWhatsAppPendingReply(local, key)?.requestId).toBe(first.requestId);
  });

  test("staff, kitchen and conversation references isolate pending reply IDs", async () => {
    const local = storage();
    const keys = [
      whatsAppReplyStorageKey(scope, sessionId),
      whatsAppReplyStorageKey({ ...scope, staffUserId: messageId }, sessionId),
      whatsAppReplyStorageKey({ ...scope, locationId: messageId }, sessionId),
      whatsAppReplyStorageKey(scope, messageId),
    ];
    const attempts = await Promise.all(
      keys.map((key) => prepareWhatsAppStaffReply(local, key, "The same words")),
    );
    expect(new Set(keys).size).toBe(4);
    expect(new Set(attempts.map((attempt) => attempt.requestId)).size).toBe(4);
    expect(() => whatsAppReplyStorageKey(scope, "invalid")).toThrow();
  });

  test("blocked storage, a corrupt pending reference and invalid reply text do not produce a sendable replacement", async () => {
    const local = storage();
    const key = whatsAppReplyStorageKey(scope, sessionId);
    local.setItem(key, "broken-json");
    await expect(prepareWhatsAppStaffReply(local, key, "Hello")).rejects.toThrow(
      "saved reply reference",
    );
    expect(local.getItem(key)).toBe("broken-json");
    local.removeItem(key);
    for (const invalid of ["  ", "\u0000", "a".repeat(1001)])
      await expect(prepareWhatsAppStaffReply(local, key, invalid)).rejects.toThrow();
    expect(local.entries.size).toBe(0);
    await expect(
      prepareWhatsAppStaffReply(
        { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        key,
        "Hello",
      ),
    ).rejects.toThrow("Allow browser storage");
  });
});

describe("private staff inbox projection and evidence", () => {
  test("supports old/new inbox responses while excluding provider identity, handoff codes and encrypted links", () => {
    const value = card();
    const current = parseWhatsAppInbox({ configured: true, sessions: [value] })!;
    expect(current.sessions).toHaveLength(1);
    expect(current.sessions[0]).not.toHaveProperty("senderId");
    expect(current.sessions[0]!.orderBinding).not.toHaveProperty("handoffCode");
    expect(current.sessions[0]!.heldReplies[0]!.reply).not.toHaveProperty("sealedCheckoutLink");
    expect(current.sessions[0]!.recentReplies[0]!.reply).not.toHaveProperty("sealedCheckoutLink");
    const { recentReplies: _replies, ...legacy } = value;
    expect(
      parseWhatsAppInbox({ configured: true, sessions: [legacy] })!.sessions[0]!.recentReplies,
    ).toEqual([]);
    expect(parseWhatsAppInbox({ configured: false, sessions: [] })).toEqual({
      configured: false,
      sessions: [],
    });
    expect(
      parseWhatsAppInbox({ configured: true, sessions: [{ ...value, assignedTo: "unverified" }] }),
    ).toBeNull();
  });

  test("shows reported arrival, held messages and queue status without claiming delivery", () => {
    const session = parseWhatsAppInbox({ configured: true, sessions: [card()] })!.sessions[0]!;
    const html = renderToStaticMarkup(
      createElement(WhatsAppInboxConversation, { session, staffUserId }),
    );
    expect(html).toContain("You are handling this conversation");
    expect(html).toContain("Ready for collection");
    expect(html).toContain("Customer reports arrival");
    expect(html).toContain("4ABC");
    expect(html).toContain("Replies held for review");
    expect(html).toContain("Queued");
    expect(html).not.toContain("Delivered");
    expect(html).not.toContain("private-provider-sender");
    expect(html).not.toContain("private-ciphertext");
    expect(html).not.toContain("1234");
    expect(html).toContain("A &lt;Customer&gt;");
    expect(html).toContain("I have &lt;script&gt; arrived");
    expect(html).not.toContain("<script>");
  });

  test("a ready label without verified payment is never presented as a confirmed collection", () => {
    const value = card();
    value.orderBinding.verifiedPaid = false;
    const session = parseWhatsAppInbox({ configured: true, sessions: [value] })!.sessions[0]!;
    const html = renderToStaticMarkup(
      createElement(WhatsAppInboxConversation, { session, staffUserId: tenantId }),
    );
    expect(html).toContain("Payment not yet confirmed");
    expect(html).not.toContain("Ready for collection");
    expect(html).toContain("Another staff member is handling");
  });
});
