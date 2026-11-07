import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { CheckoutProblem } from "./mealdeck-checkout-selection";
import type { MealDeckRuntimeEnv } from "./mealdeck-runtime-config";

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const opaqueId = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9._:+/=-]+$/);
const numberId = /^\d{5,30}$/;
export const WHATSAPP_NO_STORE = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization, Cookie",
};

export function readWhatsAppConfig(env: MealDeckRuntimeEnv) {
  const phoneNumberId = env["MEALDECK_LUTON_WHATSAPP_PHONE_NUMBER_ID"]?.trim();
  const businessAccountId = env["MEALDECK_WHATSAPP_BUSINESS_ACCOUNT_ID"]?.trim();
  const appSecret = env["MEALDECK_WHATSAPP_APP_SECRET"]?.trim();
  const verifyToken = env["MEALDECK_WHATSAPP_VERIFY_TOKEN"]?.trim();
  const accessToken = env["MEALDECK_WHATSAPP_ACCESS_TOKEN"]?.trim();
  const workerSecret = env["MEALDECK_WHATSAPP_WORKER_SECRET"]?.trim();
  const handoffSecret = env["MEALDECK_WHATSAPP_HANDOFF_SECRET"]?.trim();
  const graphVersion = env["MEALDECK_WHATSAPP_GRAPH_VERSION"]?.trim();
  const businessNumber = env["MEALDECK_LUTON_WHATSAPP_BUSINESS_NUMBER"]?.trim();
  if (
    !phoneNumberId ||
    !numberId.test(phoneNumberId) ||
    !businessAccountId ||
    !numberId.test(businessAccountId) ||
    !appSecret ||
    !/^[a-f\d]{32,128}$/i.test(appSecret) ||
    !verifyToken ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(verifyToken) ||
    !workerSecret ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(workerSecret) ||
    !handoffSecret ||
    !/^[a-f0-9]{64}$/.test(handoffSecret) ||
    !accessToken ||
    !/^[A-Za-z0-9._|-]{20,4096}$/.test(accessToken) ||
    !graphVersion ||
    !/^v\d{1,3}\.\d{1,2}$/.test(graphVersion) ||
    !businessNumber ||
    !/^\+?[1-9]\d{7,14}$/.test(businessNumber) ||
    env["MEALDECK_LUTON_WHATSAPP_VERIFIED"] !== "true"
  )
    return null;
  return {
    phoneNumberId,
    businessAccountId,
    appSecret,
    verifyToken,
    accessToken,
    workerSecret,
    handoffSecret,
    graphVersion,
    businessNumber: businessNumber.replace(/^\+/, ""),
    origin: "https://mealdeck.co.uk",
    orderingEnabled:
      env["MEALDECK_WHATSAPP_ORDERING_ENABLED"] === "true" &&
      env["MEALDECK_WHATSAPP_ORDERING_APPROVAL"] === "signed-off",
  };
}
export type WhatsAppConfig = NonNullable<ReturnType<typeof readWhatsAppConfig>>;

export function constantTimeSecret(actual: string | null, expected: string) {
  if (!actual || actual.length > 8192) return false;
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function verifyWhatsAppSignature(raw: Uint8Array, signature: string | null, secret: string) {
  if (!signature || !/^sha256=[a-f\d]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  return constantTimeSecret(signature, `sha256=${expected}`);
}
export function newWhatsAppCapability() {
  return randomBytes(32).toString("hex");
}

export async function readWhatsAppBody(request: Request, maximum = 262_144) {
  const length = Number(request.headers.get("Content-Length") ?? 0);
  if (!Number.isFinite(length) || length < 0 || length > maximum)
    throw new CheckoutProblem("invalid_request", "Request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new CheckoutProblem("invalid_request", "Request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const raw = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return raw;
}

export type WhatsAppInbound = {
  providerMessageId: string;
  senderId: string;
  receivedAt: string;
  input: { text: string; actionId?: string; unsupported?: boolean };
};
export const WHATSAPP_SENSITIVE_REMOVED =
  "Sensitive payment or credential details were removed. Staff review is required.";
/** Discard unsolicited card/credential content before durable storage or AI. */
export function containsSensitiveWhatsAppDetails(text: string) {
  if (
    /\b(?:cvv|cvc|security\s*code|password|one[- ]time\s*(?:password|code)|otp)\s*(?::|=|is)?\s*\S{3,}/i.test(
      text,
    ) ||
    /\bsk-[A-Za-z0-9_-]{16,}|\bBearer\s+[A-Za-z0-9._~-]{20,}/i.test(text)
  )
    return true;
  const candidates = text.match(/(?:\d[ -]?){13,19}/g) ?? [];
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    if (!/^[3456]\d{12,18}$/.test(digits)) return false;
    let sum = 0;
    for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
      let value = Number(digits[i]);
      if (double) {
        value *= 2;
        if (value > 9) value -= 9;
      }
      sum += value;
    }
    return sum % 10 === 0;
  });
}
/** Only signed, exact-account/phone events reach this parser. Never infer member identity. */
export function parseWhatsAppMessages(
  value: unknown,
  config: WhatsAppConfig,
  now = Date.now(),
): WhatsAppInbound[] {
  const root = object(value);
  if (root["object"] !== "whatsapp_business_account") return [];
  const events: WhatsAppInbound[] = [];
  const bounded = (value: unknown) => {
    const values = list(value);
    if (values.length > 100)
      throw new CheckoutProblem(
        "batch_too_large",
        "Retry this event after increasing the reviewed queue batch limit.",
        503,
      );
    return values;
  };
  for (const entry of bounded(root["entry"])) {
    const account = object(entry);
    if (account["id"] !== config.businessAccountId) continue;
    for (const change of bounded(account["changes"])) {
      const item = object(change),
        body = object(item["value"]);
      if (
        item["field"] !== "messages" ||
        body["messaging_product"] !== "whatsapp" ||
        object(body["metadata"])["phone_number_id"] !== config.phoneNumberId
      )
        continue;
      for (const raw of bounded(body["messages"])) {
        const message = object(raw),
          id = opaqueId.safeParse(message["id"]);
        // Provider identifiers are opaque. A contact phone and an authenticated
        // customer account are collected/verified separately by existing checkout.
        const sender = opaqueId.safeParse(message["from"]);
        const timestamp =
          typeof message["timestamp"] === "string" && /^\d{10,13}$/.test(message["timestamp"])
            ? Number(message["timestamp"]) * 1000
            : NaN;
        if (
          !id.success ||
          !sender.success ||
          !Number.isSafeInteger(timestamp) ||
          timestamp > now + 60_000 ||
          timestamp < now - 7 * 86_400_000
        )
          continue;
        let text = "",
          actionId: string | undefined,
          unsupported = false;
        if (message["type"] === "text") {
          const candidate = object(message["text"])["body"];
          if (typeof candidate !== "string") continue;
          if (containsSensitiveWhatsAppDetails(candidate)) {
            text = WHATSAPP_SENSITIVE_REMOVED;
            unsupported = true;
          } else if (
            candidate.length > 4000 ||
            Buffer.byteLength(JSON.stringify({ text: candidate }), "utf8") > 12_000
          ) {
            text = "This message is too long. Please send a shorter text message.";
            unsupported = true;
          } else text = candidate;
        } else if (message["type"] === "interactive") {
          const interactive = object(message["interactive"]);
          const selected =
            interactive["type"] === "button_reply"
              ? object(interactive["button_reply"])
              : interactive["type"] === "list_reply"
                ? object(interactive["list_reply"])
                : {};
          if (typeof selected["id"] !== "string" || selected["id"].length > 200) continue;
          actionId = selected["id"]; // Labels supplied by customers never select a dish.
        } else if (message["type"] === "button") {
          const candidate = object(message["button"])["payload"];
          if (typeof candidate !== "string" || candidate.length > 200) continue;
          actionId = candidate;
        } else {
          unsupported = true;
        }
        events.push({
          providerMessageId: id.data,
          senderId: sender.data,
          receivedAt: new Date(timestamp).toISOString(),
          input: {
            text,
            ...(actionId ? { actionId } : {}),
            ...(unsupported ? { unsupported } : {}),
          },
        });
        if (events.length > 100)
          throw new CheckoutProblem(
            "batch_too_large",
            "Retry this event after increasing the reviewed queue batch limit.",
            503,
          );
      }
    }
  }
  return events;
}

const cleanText = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => !/\p{Cc}/u.test(value.replace(/[\n\r\t]/g, "")));
const action = z.strictObject({ id: cleanText(200), title: cleanText(20) });
const row = z.strictObject({
  id: cleanText(200),
  title: cleanText(24),
  description: cleanText(72).optional(),
});
export const whatsAppReplySchema = z
  .strictObject({
    text: cleanText(4096),
    buttons: z.array(action).min(1).max(3).optional(),
    list: z
      .array(z.strictObject({ title: cleanText(24), rows: z.array(row).min(1).max(10) }))
      .min(1)
      .max(10)
      .optional(),
    sealedCheckoutLink: z
      .string()
      .regex(/^v1\.[A-Za-z0-9_-]{40,4096}$/)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (
      (value.buttons && value.list) ||
      (value.sealedCheckoutLink && (value.buttons || value.list)) ||
      ((value.buttons || value.list) && value.text.length > 1024) ||
      (value.list && value.list.reduce((n, section) => n + section.rows.length, 0) > 10)
    )
      ctx.addIssue({ code: "custom", message: "Invalid interactive message." });
    const ids =
      value.buttons?.map((button) => button.id) ??
      value.list?.flatMap((section) => section.rows.map((item) => item.id)) ??
      [];
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Duplicate action IDs." });
  });
export type WhatsAppReply = {
  text: string;
  buttons?: { id: string; title: string }[];
  list?: { title: string; rows: { id: string; title: string; description?: string }[] }[];
  sealedCheckoutLink?: string;
};

/** Capabilities remain encrypted while queued; only their hashes live in the handoff ledger. */
export function sealWhatsAppCheckoutReply(
  config: WhatsAppConfig,
  senderId: string,
  text: string,
): WhatsAppReply {
  cleanText(2000).parse(text);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(config.handoffSecret, "hex"), iv);
  cipher.setAAD(Buffer.from(`mealdeck-whatsapp-link-v1\0${config.phoneNumberId}\0${senderId}`));
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return {
    text: "Private secure checkout link (available only to the customer).",
    sealedCheckoutLink:
      "v1." + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url"),
  };
}
export function unsealWhatsAppReply(
  config: WhatsAppConfig,
  senderId: string,
  reply: WhatsAppReply,
): WhatsAppReply {
  const valid = whatsAppReplySchema.parse(reply);
  if (!valid.sealedCheckoutLink)
    return {
      text: valid.text,
      ...(valid.buttons ? { buttons: valid.buttons } : {}),
      ...(valid.list
        ? {
            list: valid.list.map((section) => ({
              title: section.title,
              rows: section.rows.map((row) => ({
                id: row.id,
                title: row.title,
                ...(row.description ? { description: row.description } : {}),
              })),
            })),
          }
        : {}),
    };
  const encrypted = Buffer.from(valid.sealedCheckoutLink.slice(3), "base64url");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(config.handoffSecret, "hex"),
    encrypted.subarray(0, 12),
  );
  decipher.setAAD(Buffer.from(`mealdeck-whatsapp-link-v1\0${config.phoneNumberId}\0${senderId}`));
  decipher.setAuthTag(encrypted.subarray(12, 28));
  const text = Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString(
    "utf8",
  );
  return { text: cleanText(2000).parse(text) };
}

export function whatsappMessagePayload(senderId: string, reply: WhatsAppReply) {
  const to = opaqueId.parse(senderId),
    valid = whatsAppReplySchema.parse(reply);
  if (valid.sealedCheckoutLink) throw new Error("Checkout link must be decrypted by the sender.");
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  if (valid.buttons)
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: valid.text },
        action: { buttons: valid.buttons.map((button) => ({ type: "reply", reply: button })) },
      },
    };
  if (valid.list)
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: valid.text },
        action: { button: "Choose", sections: valid.list },
      },
    };
  return { ...base, type: "text", text: { preview_url: false, body: valid.text } };
}

export function insideWhatsAppServiceWindow(lastInboundAt: string, now = Date.now()) {
  const received = Date.parse(lastInboundAt);
  // Leave a delivery margin; server send time, never worker claim time, is decisive.
  return Number.isFinite(received) && received <= now + 60_000 && now - received < 86_340_000;
}

export type WhatsAppSendOutcome = {
  outcome: "sent" | "retry" | "uncertain";
  providerMessageId?: string;
};
/** No automatic retries after a timeout/5xx: Meta may already have accepted the send. */
export async function sendWhatsAppReply(
  config: WhatsAppConfig,
  senderId: string,
  reply: WhatsAppReply,
  lastInboundAt: string,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<WhatsAppSendOutcome> {
  if (!insideWhatsAppServiceWindow(lastInboundAt, now)) return { outcome: "uncertain" };
  let payload: ReturnType<typeof whatsappMessagePayload>;
  try {
    payload = whatsappMessagePayload(senderId, unsealWhatsAppReply(config, senderId, reply));
  } catch {
    return { outcome: "uncertain" };
  }
  try {
    const result = await fetcher(
      `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    // A definitive rate-limit rejection is safe to retry. Other failures are held
    // for operators, without saving provider response bodies (which may contain PII).
    if (result.status === 429) return { outcome: "retry" };
    if (!result.ok) return { outcome: "uncertain" };
    const body = object(await result.json());
    const id = opaqueId.safeParse(object(list(body["messages"])[0])["id"]);
    return id.success ? { outcome: "sent", providerMessageId: id.data } : { outcome: "uncertain" };
  } catch {
    return { outcome: "uncertain" };
  }
}
