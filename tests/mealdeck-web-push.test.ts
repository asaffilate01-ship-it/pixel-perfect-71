import { describe, expect, test } from "bun:test";
import {
  createDecipheriv,
  createECDH,
  createPublicKey,
  hkdfSync,
  randomBytes,
  verify,
} from "node:crypto";
import webPush from "web-push";
import {
  customerPushPayloadSchema,
  isAllowedPushEndpoint,
  pushSubscriptionSchema,
  readWebPushConfig,
  sendCustomerWebPush,
  type CustomerPushPayload,
  type CustomerPushSubscription,
} from "../src/lib/mealdeck-web-push.server";

// Every outbound request is intercepted. Generated P-256 keys are test fixtures.
const vapid = webPush.generateVAPIDKeys();
const env = {
  MEALDECK_WEB_PUSH_ENABLED: "true",
  MEALDECK_WEB_PUSH_PUBLIC_KEY: vapid.publicKey,
  MEALDECK_WEB_PUSH_PRIVATE_KEY: vapid.privateKey,
  MEALDECK_WEB_PUSH_SUBJECT: "mailto:push@example.test",
  MEALDECK_WEB_PUSH_WORKER_SECRET: "fixture_worker_" + "w".repeat(32),
};
const config = readWebPushConfig(env)!;
const uid = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const receiver = createECDH("prime256v1");
receiver.generateKeys();
const authSecret = randomBytes(16);
const subscription: CustomerPushSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/fixture_subscription",
  keys: {
    p256dh: receiver.getPublicKey().toString("base64url"),
    auth: authSecret.toString("base64url"),
  },
};
const order: CustomerPushPayload = {
  type: "order_update",
  stage: "preparing",
  fulfilment: "pickup",
  checkoutMode: "guest",
  orderId: uid(1),
  notificationId: uid(2),
};
const offer: CustomerPushPayload = {
  type: "offer",
  campaignId: uid(3),
  notificationId: uid(4),
  title: "MealDeck offers",
  body: "See the current offer and its terms.",
  path: "/offers",
};

function intercepted(status = 201) {
  const requests: { url: string; init: RequestInit; headers: Headers; body: Buffer }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    requests.push({
      url,
      init,
      headers: new Headers(init.headers),
      body: Buffer.from(init.body as Uint8Array),
    });
    return new Response(
      status === 204 ? null : "private provider diagnostic and subscription token",
      {
        status,
        headers:
          status >= 300 && status < 400
            ? { Location: "http://169.254.169.254/latest/meta-data" }
            : {},
      },
    );
  }) as typeof fetch;
  return { requests, fetcher };
}

// Independently decrypt one RFC 8291 aes128gcm record using the receiver's
// private key. The test proves the generated body is usable Web Push ciphertext.
function decryptedPayload(body: Buffer) {
  const salt = body.subarray(0, 16);
  const recordSize = body.readUInt32BE(16);
  const publicKeyLength = body[20]!;
  expect(publicKeyLength).toBe(65);
  const senderPublicKey = body.subarray(21, 21 + publicKeyLength);
  const sharedSecret = receiver.computeSecret(senderPublicKey);
  const info = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    receiver.getPublicKey(),
    senderPublicKey,
  ]);
  const ikm = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, info, 32));
  const key = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16),
  );
  const nonce = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12),
  );
  const encrypted = body.subarray(21 + publicKeyLength);
  expect(encrypted.length).toBeLessThanOrEqual(recordSize);
  const decipher = createDecipheriv("aes-128-gcm", key, nonce);
  decipher.setAuthTag(encrypted.subarray(-16));
  const clear = Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]);
  expect(clear[clear.length - 1]).toBe(2);
  return JSON.parse(clear.subarray(0, -1).toString("utf8"));
}

describe("Web Push sender configuration", () => {
  test("activation needs a matching real VAPID pair and separate worker authority", () => {
    expect(config).toEqual({
      publicKey: vapid.publicKey,
      privateKey: vapid.privateKey,
      subject: env.MEALDECK_WEB_PUSH_SUBJECT,
      workerSecret: env.MEALDECK_WEB_PUSH_WORKER_SECRET,
    });
    const otherPair = webPush.generateVAPIDKeys();
    for (const patch of [
      { MEALDECK_WEB_PUSH_ENABLED: "false" },
      { MEALDECK_WEB_PUSH_PUBLIC_KEY: "" },
      { MEALDECK_WEB_PUSH_PRIVATE_KEY: "" },
      { MEALDECK_WEB_PUSH_PRIVATE_KEY: otherPair.privateKey },
      { MEALDECK_WEB_PUSH_PRIVATE_KEY: Buffer.alloc(32).toString("base64url") },
      {
        MEALDECK_WEB_PUSH_PUBLIC_KEY: Buffer.from([4, ...Array(64).fill(0)]).toString("base64url"),
      },
      { MEALDECK_WEB_PUSH_SUBJECT: "mailto:invalid" },
      { MEALDECK_WEB_PUSH_WORKER_SECRET: "too-short" },
    ])
      expect(readWebPushConfig({ ...env, ...patch })).toBeNull();
  });

  test("only recognised HTTPS push provider endpoints are accepted", () => {
    for (const endpoint of [
      subscription.endpoint,
      "https://updates.push.services.mozilla.com/wpush/v2/fixture_token",
      "https://web.push.apple.com/Qfixture_token",
      "https://wns2-db5p.notify.windows.com/w/?token=fixture_token",
    ])
      expect(isAllowedPushEndpoint(endpoint)).toBe(true);
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/fixture",
      "https://127.0.0.1/private",
      "http://169.254.169.254/latest/meta-data",
      "https://localhost/private",
      "https://fcm.googleapis.com.evil.example/fcm/send/fixture",
      "https://fcm.googleapis.com@evil.example/private",
      "https://user:pass@fcm.googleapis.com/fcm/send/fixture",
      "https://fcm.googleapis.com:8443/fcm/send/fixture",
      "https://fcm.googleapis.com/fcm/send/fixture#private",
      "https://fcm.googleapis.com/",
      "https://fcm.googleapis.com\\@evil.example/private",
      "https://evil.example/redirect-to-push",
    ])
      expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });

  test("subscription keys must be usable curve points and an exact auth secret", () => {
    expect(pushSubscriptionSchema.safeParse(subscription).success).toBe(true);
    for (const keys of [
      {
        ...subscription.keys,
        p256dh: Buffer.from([4, ...Array(64).fill(0)]).toString("base64url"),
      },
      {
        ...subscription.keys,
        p256dh: receiver.getPublicKey(undefined, "compressed").toString("base64url"),
      },
      { ...subscription.keys, auth: Buffer.alloc(15).toString("base64url") },
      { ...subscription.keys, auth: Buffer.alloc(17).toString("base64url") },
    ])
      expect(pushSubscriptionSchema.safeParse({ ...subscription, keys }).success).toBe(false);
  });
});

describe("Encrypted Web Push transport", () => {
  test("a real encrypted order payload has independently verifiable VAPID authentication", async () => {
    const f = intercepted();
    expect(await sendCustomerWebPush(config, subscription, order, 300, f.fetcher)).toEqual({
      outcome: "accepted",
      status: 201,
    });
    expect(f.requests).toHaveLength(1);
    const request = f.requests[0]!;
    expect(request.url).toBe(subscription.endpoint);
    expect(request.init.method).toBe("POST");
    expect(request.init.redirect).toBe("error");
    expect(request.init.signal).toBeInstanceOf(AbortSignal);
    expect(request.headers.get("Content-Encoding")).toBe("aes128gcm");
    expect(request.headers.get("TTL")).toBe("60");
    expect(request.headers.get("Urgency")).toBe("high");
    expect(request.body.includes(Buffer.from(JSON.stringify(order)))).toBe(false);
    expect(decryptedPayload(request.body)).toEqual(order);

    const authorization = request.headers.get("Authorization")!;
    const matched = /^vapid t=([^,]+), k=(.+)$/.exec(authorization);
    expect(matched).not.toBeNull();
    expect(matched![2]).toBe(vapid.publicKey);
    const [header, claims, signature] = matched![1]!.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toMatchObject({
      alg: "ES256",
    });
    const decoded = JSON.parse(Buffer.from(claims!, "base64url").toString());
    expect(decoded).toMatchObject({
      aud: "https://fcm.googleapis.com",
      sub: env.MEALDECK_WEB_PUSH_SUBJECT,
    });
    expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
    const rawPublic = Buffer.from(vapid.publicKey, "base64url");
    const publicKey = createPublicKey({
      format: "jwk",
      key: {
        kty: "EC",
        crv: "P-256",
        x: rawPublic.subarray(1, 33).toString("base64url"),
        y: rawPublic.subarray(33).toString("base64url"),
      },
    });
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${claims}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature!, "base64url"),
      ),
    ).toBe(true);
  });

  test("superseding stages use one topic while unrelated orders and campaigns stay separate", async () => {
    const f = intercepted();
    await sendCustomerWebPush(config, subscription, order, 20, f.fetcher);
    await sendCustomerWebPush(
      config,
      subscription,
      { ...order, stage: "ready_for_handover", notificationId: uid(6) },
      20,
      f.fetcher,
    );
    await sendCustomerWebPush(config, subscription, { ...order, orderId: uid(7) }, 20, f.fetcher);
    await sendCustomerWebPush(config, subscription, offer, 7200, f.fetcher);
    const topics = f.requests.map((request) => request.headers.get("Topic"));
    expect(topics[0]).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(topics[1]).toBe(topics[0]);
    expect(new Set([topics[0], topics[2], topics[3]]).size).toBe(3);
    expect(f.requests[0]!.headers.get("TTL")).toBe("20");
    expect(f.requests[3]!.headers.get("TTL")).toBe("3600");
    expect(f.requests[3]!.headers.get("Urgency")).toBe("normal");
    expect(decryptedPayload(f.requests[3]!.body)).toEqual(offer);
  });

  test("expiry, temporary failures and rejections return only bounded outcomes and status", async () => {
    for (const [status, outcome] of [
      [201, "accepted"],
      [202, "accepted"],
      [204, "accepted"],
      [404, "expired"],
      [410, "expired"],
      [408, "retry"],
      [429, "retry"],
      [503, "retry"],
      [400, "failed"],
      [401, "failed"],
      [403, "failed"],
    ] as const) {
      const f = intercepted(status);
      const result = await sendCustomerWebPush(config, subscription, order, 60, f.fetcher);
      expect(result).toEqual({ outcome, status });
      expect(JSON.stringify(result)).not.toContain("private provider diagnostic");
    }
  });

  test("redirects never authorise a second outbound destination", async () => {
    const f = intercepted(307);
    expect(await sendCustomerWebPush(config, subscription, order, 60, f.fetcher)).toEqual({
      outcome: "failed",
      status: 307,
    });
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0]!.init.redirect).toBe("error");
    const rejectedRedirect = (async () => {
      throw new TypeError("redirect to private endpoint refused");
    }) as typeof fetch;
    expect(await sendCustomerWebPush(config, subscription, order, 60, rejectedRedirect)).toEqual({
      outcome: "retry",
      status: null,
    });
  });

  test("handover codes, customer fields and arbitrary destinations never leave the server", async () => {
    const invalidPayloads = [
      { ...order, handoffCode: "1234" },
      { ...order, displayCode: "1234" },
      { ...order, title: "Private customer" },
      { ...order, body: "Code 1234" },
      { ...order, url: "https://evil.example/" },
      { ...order, path: "/account?token=private" },
      { ...offer, path: "https://evil.example/" },
      { ...offer, path: "/ops" },
      { ...offer, title: "Offer\nHidden instruction" },
      { ...offer, body: "Hidden\u202e text" },
    ];
    const f = intercepted();
    for (const payload of invalidPayloads) {
      expect(customerPushPayloadSchema.safeParse(payload).success).toBe(false);
      expect(
        await sendCustomerWebPush(
          config,
          subscription,
          payload as CustomerPushPayload,
          60,
          f.fetcher,
        ),
      ).toEqual({ outcome: "failed", status: null });
    }
    expect(f.requests).toHaveLength(0);
  });

  test("driver events cannot be sent for collection or kerbside orders", async () => {
    const f = intercepted();
    for (const stage of ["with_driver", "on_the_way"] as const) {
      for (const fulfilment of ["pickup", "curbside"] as const)
        expect(
          await sendCustomerWebPush(
            config,
            subscription,
            { ...order, stage, fulfilment },
            60,
            f.fetcher,
          ),
        ).toEqual({ outcome: "failed", status: null });
    }
    expect(f.requests).toHaveLength(0);
    for (const stage of ["with_driver", "on_the_way"] as const)
      expect(
        await sendCustomerWebPush(
          config,
          subscription,
          { ...order, stage, fulfilment: "delivery" },
          60,
          f.fetcher,
        ),
      ).toEqual({ outcome: "accepted", status: 201 });
    expect(f.requests).toHaveLength(2);
  });

  test("canonical database timestamps survive encryption and malformed time values cannot be sent", async () => {
    const payload = {
      ...order,
      occurredAt: "2026-11-07T12:00:00+00:00",
      expiresAt: "2026-11-07T12:01:00+00:00",
    };
    const f = intercepted();
    expect(await sendCustomerWebPush(config, subscription, payload, 60, f.fetcher)).toEqual({
      outcome: "accepted",
      status: 201,
    });
    expect(decryptedPayload(f.requests[0]!.body)).toEqual(payload);
    for (const patch of [
      { occurredAt: "not-a-date" },
      { expiresAt: "not-a-date" },
      { expiresAt: 1234 },
    ])
      expect(
        await sendCustomerWebPush(
          config,
          subscription,
          { ...payload, ...patch } as CustomerPushPayload,
          60,
          f.fetcher,
        ),
      ).toEqual({ outcome: "failed", status: null });
    expect(f.requests).toHaveLength(1);
  });

  test("unsafe subscriptions and expired or invalid TTLs fail before outbound fetch", async () => {
    const f = intercepted();
    for (const ttl of [0, -1, 0.5, NaN, Infinity])
      expect(await sendCustomerWebPush(config, subscription, order, ttl, f.fetcher)).toEqual({
        outcome: "failed",
        status: null,
      });
    expect(
      await sendCustomerWebPush(
        config,
        { ...subscription, endpoint: "https://localhost/private" },
        order,
        60,
        f.fetcher,
      ),
    ).toEqual({ outcome: "failed", status: null });
    expect(f.requests).toHaveLength(0);
  });
});
