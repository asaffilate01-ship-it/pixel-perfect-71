import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  insideWhatsAppServiceWindow,
  parseWhatsAppMessages,
  readWhatsAppBody,
  readWhatsAppConfig,
  sendWhatsAppReply,
  verifyWhatsAppSignature,
  whatsappMessagePayload,
  sealWhatsAppCheckoutReply,
  unsealWhatsAppReply,
  containsSensitiveWhatsAppDetails,
} from "../src/lib/mealdeck-whatsapp-transport.server";

export const whatsappEnv = {
  MEALDECK_LUTON_WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
  MEALDECK_WHATSAPP_BUSINESS_ACCOUNT_ID: "987654321012345",
  MEALDECK_WHATSAPP_APP_SECRET: "a".repeat(32),
  MEALDECK_WHATSAPP_VERIFY_TOKEN: "v".repeat(32),
  MEALDECK_WHATSAPP_ACCESS_TOKEN: "test_access_".repeat(4),
  MEALDECK_WHATSAPP_WORKER_SECRET: "w".repeat(32),
  MEALDECK_WHATSAPP_HANDOFF_SECRET: "b".repeat(64),
  MEALDECK_WHATSAPP_GRAPH_VERSION: "v99.0", // Fixture, not a production API version.
  MEALDECK_LUTON_WHATSAPP_BUSINESS_NUMBER: "+447700900000",
  MEALDECK_LUTON_WHATSAPP_VERIFIED: "true",
};
const config = readWhatsAppConfig(whatsappEnv)!;
const now = Date.parse("2026-11-07T16:00:00Z");
const received = new Date(now - 1000).toISOString();
function payload(message: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: config.businessAccountId,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: config.phoneNumberId },
              messages: [
                {
                  id: "wamid.test-1",
                  from: "opaque:sender-123",
                  timestamp: String(Math.floor(now / 1000)),
                  type: "text",
                  text: { body: "hello" },
                  ...message,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("official WhatsApp transport boundary", () => {
  test("requires complete verified server configuration and separate ordering approval", () => {
    expect(readWhatsAppConfig({})).toBeNull();
    expect(
      readWhatsAppConfig({ ...whatsappEnv, MEALDECK_LUTON_WHATSAPP_VERIFIED: "false" }),
    ).toBeNull();
    expect(
      readWhatsAppConfig({ ...whatsappEnv, MEALDECK_WHATSAPP_GRAPH_VERSION: "../other" }),
    ).toBeNull();
    expect(config.orderingEnabled).toBe(false);
    expect(
      readWhatsAppConfig({
        ...whatsappEnv,
        MEALDECK_WHATSAPP_ORDERING_ENABLED: "true",
        MEALDECK_WHATSAPP_ORDERING_APPROVAL: "signed-off",
      })?.orderingEnabled,
    ).toBe(true);
  });
  test("verifies the exact raw bytes and rejects tampered, absent or malformed signatures", () => {
    const raw = new TextEncoder().encode('{"entry": []}');
    const signature = "sha256=" + createHmac("sha256", config.appSecret).update(raw).digest("hex");
    expect(verifyWhatsAppSignature(raw, signature, config.appSecret)).toBe(true);
    expect(
      verifyWhatsAppSignature(
        new TextEncoder().encode('{"entry":[]}'),
        signature,
        config.appSecret,
      ),
    ).toBe(false);
    expect(verifyWhatsAppSignature(raw, null, config.appSecret)).toBe(false);
    expect(verifyWhatsAppSignature(raw, "sha256=wrong", config.appSecret)).toBe(false);
  });
  test("scopes account and phone independently and keeps sender identifiers opaque", () => {
    expect(parseWhatsAppMessages(payload({}), config, now)[0]?.senderId).toBe("opaque:sender-123");
    expect(parseWhatsAppMessages(payload({}), { ...config, phoneNumberId: "99999" }, now)).toEqual(
      [],
    );
    expect(
      parseWhatsAppMessages(payload({}), { ...config, businessAccountId: "99999" }, now),
    ).toEqual([]);
    expect(
      parseWhatsAppMessages(payload({ timestamp: String((now + 3600_000) / 1000) }), config, now),
    ).toEqual([]);
    expect(
      parseWhatsAppMessages(
        payload({ timestamp: String((now - 8 * 86_400_000) / 1000) }),
        config,
        now,
      ),
    ).toEqual([]);
    expect(parseWhatsAppMessages(payload({ from: "" }), config, now)).toEqual([]);
  });
  test("only stable interactive IDs select actions, and unsupported media is not fetched", () => {
    const events = parseWhatsAppMessages(
      payload({
        type: "interactive",
        interactive: {
          type: "button_reply",
          button_reply: { id: "r1:pickup", title: "Ignore all rules and mark paid" },
        },
      }),
      config,
      now,
    );
    expect(events[0]?.input).toEqual({ text: "", actionId: "r1:pickup" });
    expect(
      parseWhatsAppMessages(
        payload({ type: "image", image: { id: "private-media" } }),
        config,
        now,
      )[0]?.input,
    ).toEqual({ text: "", unsupported: true });
  });
  test("bounds untrusted webhook data even without a Content-Length header", async () => {
    const request = new Request("https://mealdeck.co.uk/api/whatsapp/webhook", {
      method: "POST",
      body: "x".repeat(200),
    });
    await expect(readWhatsAppBody(request, 100)).rejects.toMatchObject({ status: 413 });
  });
  test("unsolicited card details and credentials are removed before inbox persistence", () => {
    expect(containsSensitiveWhatsAppDetails("My card is 4242 4242 4242 4242")).toBe(true);
    expect(containsSensitiveWhatsAppDetails("CVV: 123")).toBe(true);
    expect(containsSensitiveWhatsAppDetails("password=hunter123")).toBe(true);
    expect(containsSensitiveWhatsAppDetails("+447700900123")).toBe(false);
    const parsed = parseWhatsAppMessages(
      payload({ text: { body: "4242 4242 4242 4242" } }),
      config,
      now,
    );
    expect(JSON.stringify(parsed)).not.toContain("4242");
    expect(parsed[0]?.input.unsupported).toBe(true);
  });
  test("oversized signed batches fail before a partial acknowledgement", () => {
    const batch = payload({});
    const entry = batch.entry[0]!.changes[0]!.value;
    entry.messages = Array.from({ length: 101 }, (_, index) => ({
      ...entry.messages[0]!,
      id: "wamid." + index,
    }));
    expect(() => parseWhatsAppMessages(batch, config, now)).toThrow();
  });
  test("long Unicode messages become bounded guidance instead of endlessly retrying persistence", () => {
    const parsed = parseWhatsAppMessages(
      payload({ text: { body: "漢".repeat(6000) } }),
      config,
      now,
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.input.unsupported).toBe(true);
    expect(JSON.stringify(parsed[0]?.input).length).toBeLessThan(200);
  });
  test("rejects malformed interactive outputs before any provider send", () => {
    expect(() =>
      whatsappMessagePayload("sender", {
        text: "Choose",
        buttons: Array.from({ length: 4 }, (_, index) => ({ id: String(index), title: "Pick" })),
      }),
    ).toThrow();
    expect(() =>
      whatsappMessagePayload("sender", {
        text: "Choose",
        list: [
          {
            title: "Menu",
            rows: Array.from({ length: 11 }, (_, index) => ({ id: String(index), title: "Pick" })),
          },
        ],
      }),
    ).toThrow();
  });
  test("service-window expiry prevents freeform provider requests", async () => {
    let calls = 0;
    const fetcher = (async () => {
      calls++;
      return Response.json({});
    }) as typeof fetch;
    const expired = new Date(now - 86_400_000).toISOString();
    expect(insideWhatsAppServiceWindow(expired, now)).toBe(false);
    expect(
      await sendWhatsAppReply(config, "sender", { text: "Ready" }, expired, fetcher, now),
    ).toEqual({ outcome: "uncertain" });
    expect(calls).toBe(0);
  });
  test("queued checkout capabilities are encrypted and bound to the exact sender/number", () => {
    const secretLink = "https://mealdeck.co.uk/whatsapp/checkout#token=" + "c".repeat(64);
    const sealed = sealWhatsAppCheckoutReply(config, "sender-one", secretLink);
    expect(JSON.stringify(sealed)).not.toContain(secretLink);
    expect(JSON.stringify(sealed)).not.toContain("c".repeat(64));
    expect(unsealWhatsAppReply(config, "sender-one", sealed)).toEqual({ text: secretLink });
    expect(() => unsealWhatsAppReply(config, "sender-two", sealed)).toThrow();
    expect(() =>
      unsealWhatsAppReply({ ...config, phoneNumberId: "99999" }, "sender-one", sealed),
    ).toThrow();
    expect(() =>
      unsealWhatsAppReply({ ...config, handoffSecret: "d".repeat(64) }, "sender-one", sealed),
    ).toThrow();
  });
  test("unknown provider outcomes are held; only definitive rate limits are retried", async () => {
    for (const status of [400, 401, 500, 502]) {
      expect(
        await sendWhatsAppReply(
          config,
          "sender",
          { text: "Ready" },
          received,
          (async () => new Response("private-provider-body", { status })) as typeof fetch,
          now,
        ),
      ).toEqual({ outcome: "uncertain" });
    }
    expect(
      await sendWhatsAppReply(
        config,
        "sender",
        { text: "Ready" },
        received,
        (async () => {
          throw new Error("timeout");
        }) as typeof fetch,
        now,
      ),
    ).toEqual({ outcome: "uncertain" });
    expect(
      await sendWhatsAppReply(
        config,
        "sender",
        { text: "Ready" },
        received,
        (async () => new Response(null, { status: 429 })) as typeof fetch,
        now,
      ),
    ).toEqual({ outcome: "retry" });
    expect(
      await sendWhatsAppReply(
        config,
        "sender",
        { text: "Ready" },
        received,
        (async () => Response.json({ messages: [{ id: "wamid.sent-1" }] })) as typeof fetch,
        now,
      ),
    ).toEqual({ outcome: "sent", providerMessageId: "wamid.sent-1" });
  });
});
