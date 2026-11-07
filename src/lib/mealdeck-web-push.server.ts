import { createECDH, createHash, ECDH, timingSafeEqual } from "node:crypto";
import webPush from "web-push";
import { z } from "zod";
import type { MealDeckRuntimeEnv } from "./mealdeck-runtime-config";

export const PUSH_NO_STORE = {
  "Cache-Control": "no-store, private",
  Vary: "Authorization, Cookie",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export type WebPushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
  workerSecret: string;
};

function base64Key(value: string, length: number): Buffer | null {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === length && decoded.toString("base64url") === value.replace(/=+$/, "")
    ? decoded
    : null;
}

/** Both keys must be a matching P-256 pair. No private configuration reaches the browser. */
export function readWebPushConfig(env: MealDeckRuntimeEnv): WebPushConfig | null {
  if (env["MEALDECK_WEB_PUSH_ENABLED"] !== "true") return null;
  const publicKey = env["MEALDECK_WEB_PUSH_PUBLIC_KEY"]?.trim() ?? "";
  const privateKey = env["MEALDECK_WEB_PUSH_PRIVATE_KEY"]?.trim() ?? "";
  const subject = env["MEALDECK_WEB_PUSH_SUBJECT"]?.trim() ?? "";
  const workerSecret = env["MEALDECK_WEB_PUSH_WORKER_SECRET"]?.trim() ?? "";
  const publicBytes = base64Key(publicKey, 65);
  const privateBytes = base64Key(privateKey, 32);
  if (
    !publicBytes ||
    publicBytes[0] !== 4 ||
    !privateBytes ||
    !/^mailto:[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(subject) ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(workerSecret)
  )
    return null;
  try {
    const pair = createECDH("prime256v1");
    pair.setPrivateKey(privateBytes);
    if (!timingSafeEqual(pair.getPublicKey(), publicBytes)) return null;
  } catch {
    return null;
  }
  return { publicKey, privateKey, subject, workerSecret };
}

/** A transport endpoint is a bearer capability, never an arbitrary outbound URL. */
export function isAllowedPushEndpoint(value: string): boolean {
  if (value.length < 20 || value.length > 2048 || /[\\\s]/.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      url.pathname.length > 1 &&
      /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(
        url.hostname,
      ) &&
      /^https:\/\/[^/]+\/[A-Za-z0-9_/?=&%:.-]+$/.test(value)
    );
  } catch {
    return false;
  }
}

export const pushSubscriptionSchema = z.strictObject({
  endpoint: z.string().refine(isAllowedPushEndpoint),
  keys: z.strictObject({
    p256dh: z.string().refine((key) => {
      const bytes = base64Key(key, 65);
      if (!bytes || bytes[0] !== 4) return false;
      try {
        ECDH.convertKey(bytes, "prime256v1");
        return true;
      } catch {
        return false;
      }
    }),
    auth: z.string().refine((key) => base64Key(key, 16) !== null),
  }),
});
export type CustomerPushSubscription = z.infer<typeof pushSubscriptionSchema>;

const plain = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));
// PostgreSQL JSON timestamps may include an explicit UTC offset.
const eventTime = z
  .string()
  .max(40)
  .refine((value) => Number.isFinite(Date.parse(value)));
export const orderPushPayloadSchema = z.strictObject({
  type: z.literal("order_update"),
  stage: z.enum([
    "accepted",
    "preparing",
    "ready_for_handover",
    "completed",
    "with_driver",
    "on_the_way",
  ]),
  fulfilment: z.enum(["pickup", "curbside", "delivery"]),
  checkoutMode: z.enum(["member", "guest"]),
  orderId: z.uuid(),
  notificationId: z.uuid(),
  occurredAt: eventTime.optional(),
  expiresAt: eventTime.optional(),
});
export const offerPushPayloadSchema = z.strictObject({
  type: z.literal("offer"),
  campaignId: z.uuid(),
  notificationId: z.uuid(),
  occurredAt: eventTime.optional(),
  expiresAt: eventTime.optional(),
  title: plain(60),
  body: plain(180),
  path: z.enum(["/offers", "/menus"]),
});
export const customerPushPayloadSchema = z.discriminatedUnion("type", [
  orderPushPayloadSchema,
  offerPushPayloadSchema,
]);
export type CustomerPushPayload = z.infer<typeof customerPushPayloadSchema>;
export type PushSendOutcome = {
  outcome: "accepted" | "retry" | "expired" | "failed";
  status: number | null;
};

export function hasPushWorkerAuthority(request: Request, secret: string): boolean {
  const actual = Buffer.from(request.headers.get("Authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Only the encrypted standards-based body goes to the provider; never log its URL or body. */
export async function sendCustomerWebPush(
  config: WebPushConfig,
  subscription: CustomerPushSubscription,
  payload: CustomerPushPayload,
  ttlSeconds: number,
  fetcher: typeof fetch = fetch,
): Promise<PushSendOutcome> {
  const checkedSubscription = pushSubscriptionSchema.safeParse(subscription);
  const checkedPayload = customerPushPayloadSchema.safeParse(payload);
  if (
    !checkedSubscription.success ||
    !checkedPayload.success ||
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds <= 0
  )
    return { outcome: "failed", status: null };
  const message = checkedPayload.data;
  const order = message.type === "order_update";
  if (
    order &&
    ["with_driver", "on_the_way"].includes(message.stage) &&
    message.fulfilment !== "delivery"
  )
    return { outcome: "failed", status: null };
  const topic = createHash("sha256")
    .update(message.type === "order_update" ? message.orderId : message.campaignId)
    .digest("base64url")
    .slice(0, 32);
  let details;
  try {
    details = webPush.generateRequestDetails(
      checkedSubscription.data,
      JSON.stringify(checkedPayload.data),
      {
        vapidDetails: {
          subject: config.subject,
          publicKey: config.publicKey,
          privateKey: config.privateKey,
        },
        contentEncoding: "aes128gcm",
        TTL: Math.min(ttlSeconds, order ? 60 : 3600),
        urgency: order ? "high" : "normal",
        topic,
      },
    );
  } catch {
    return { outcome: "failed", status: null };
  }
  try {
    const response = await fetcher(details.endpoint, {
      method: "POST",
      headers: details.headers as Record<string, string>,
      ...(details.body ? { body: new Uint8Array(details.body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    const status = response.status;
    await response.body?.cancel().catch(() => undefined);
    if (response.ok) return { outcome: "accepted", status };
    if (status === 404 || status === 410) return { outcome: "expired", status };
    if (status === 408 || status === 429 || status >= 500) return { outcome: "retry", status };
    return { outcome: "failed", status };
  } catch {
    return { outcome: "retry", status: null };
  }
}
