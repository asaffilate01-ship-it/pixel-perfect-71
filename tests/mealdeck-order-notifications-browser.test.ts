import { describe, expect, test } from "bun:test";
import {
  disableOrderNotifications,
  enableOrderNotifications,
  matchesOrderPushKey,
  notificationReceiptMode,
  readOrderPushConfig,
  readOrderPushDevice,
  requestOrderNotifications,
  type OrderPushDevice,
  type OrderPushSupport,
} from "../src/lib/mealdeck-order-notifications-browser";

const orderId = "934e2745-7e07-46fb-9803-756bc286b737";
const keyBytes = Uint8Array.from({ length: 65 }, (_, index) => (index === 0 ? 4 : 17));
const publicKey = btoa(String.fromCharCode(...keyBytes))
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");
const endpoint = "https://fcm.googleapis.com/fcm/send/test-device";
const config = { available: true, publicKey };

function fixture(
  options: {
    permission?: NotificationPermission;
    support?: OrderPushSupport;
    existing?: boolean;
    mismatchedKey?: boolean;
    grant?: NotificationPermission;
    waiting?: boolean;
  } = {},
) {
  const events: string[] = [];
  const requests: RequestInit[] = [];
  const counters = { subscriptions: 0, unsubscriptions: 0 };
  const subscription = {
    endpoint,
    options: {
      applicationServerKey: options.mismatchedKey
        ? Uint8Array.from(keyBytes, (_, index) => (index === 0 ? 4 : 18)).buffer
        : keyBytes.buffer,
      userVisibleOnly: true,
    },
    toJSON: () => ({
      endpoint,
      expirationTime: null,
      keys: { p256dh: publicKey, auth: "A".repeat(22) },
    }),
    unsubscribe: async () => {
      counters.unsubscriptions += 1;
      return true;
    },
  } as unknown as PushSubscription;
  let current = options.existing ? subscription : null;
  let permission = options.permission ?? "default";
  const device: OrderPushDevice = {
    support: () => options.support ?? "supported",
    permission: () => permission,
    requestPermission: async () => {
      events.push("permission");
      permission = options.grant ?? "granted";
      return permission;
    },
    registration: async () => {
      events.push("registration");
      return {
        waiting: options.waiting ? ({} as ServiceWorker) : null,
        pushManager: {
          getSubscription: async () => {
            events.push("getSubscription");
            return current;
          },
          subscribe: async () => {
            events.push("subscribe");
            counters.subscriptions += 1;
            current = subscription;
            return subscription;
          },
        } as unknown as PushManager,
      };
    },
  };
  const token = async () => {
    events.push("token");
    return "verified-member-bearer";
  };
  const request = (async (_input: unknown, init?: RequestInit) => {
    events.push("network");
    requests.push(init!);
    const input = init?.body ? JSON.parse(String(init.body)) : {};
    return Response.json({ available: true, enabled: input.action !== "unsubscribe", publicKey });
  }) as typeof fetch;
  return { device, token, request, requests, events, counters, subscription };
}

describe("order notification identity and readiness", () => {
  test("receipt mode is a narrow hint only when a real UUID and known mode are present", () => {
    expect(notificationReceiptMode(orderId, "guest")).toBe("guest");
    expect(notificationReceiptMode(orderId, "member")).toBe("member");
    for (const invalid of [null, undefined, "", "0001", "../../ops", "a".repeat(36)])
      expect(notificationReceiptMode(invalid, "guest")).toBeUndefined();
    for (const invalid of [null, undefined, "admin", "Guest", true, "guest&token=private"])
      expect(notificationReceiptMode(orderId, invalid)).toBeUndefined();
  });

  test("public readiness requires both a ready sender and a valid public key", async () => {
    for (const value of [
      { available: true, publicKey: "not-a-vapid-key" },
      { available: false, publicKey },
      { available: true, publicKey: null },
    ]) {
      const request = (async () => Response.json(value)) as typeof fetch;
      expect((await readOrderPushConfig(undefined, request)).available).toBe(false);
    }
    const missing = (async () => Response.json({ publicKey })) as typeof fetch;
    await expect(readOrderPushConfig(undefined, missing)).rejects.toThrow();
    const f = fixture();
    const controller = new AbortController();
    expect(await readOrderPushConfig(controller.signal, f.request)).toEqual(config);
    expect(f.requests[0]?.credentials).toBe("same-origin");
    expect(f.requests[0]?.cache).toBe("no-store");
    expect(f.requests[0]?.signal).toBe(controller.signal);
  });

  test("guest actions use their private cookie without reading a signed-in member token", async () => {
    const f = fixture();
    for (const action of ["status", "unsubscribe"] as const)
      await requestOrderNotifications(
        "guest",
        { action, orderId, endpoint },
        f.token,
        undefined,
        f.request,
      );
    await requestOrderNotifications(
      "guest",
      {
        action: "subscribe",
        orderId,
        subscription: { endpoint, keys: { p256dh: publicKey, auth: "A".repeat(22) } },
      },
      f.token,
      undefined,
      f.request,
    );
    expect(f.events).not.toContain("token");
    for (const request of f.requests) {
      expect(new Headers(request.headers).has("Authorization")).toBe(false);
      expect(request.credentials).toBe("same-origin");
      expect(request.cache).toBe("no-store");
    }
  });

  test("a member needs a bearer and never falls back to the guest cookie", async () => {
    const f = fixture();
    await expect(
      requestOrderNotifications(
        "member",
        { action: "status", orderId },
        async () => null,
        undefined,
        f.request,
      ),
    ).rejects.toThrow("Sign in again");
    expect(f.requests).toHaveLength(0);
    await requestOrderNotifications(
      "member",
      { action: "status", orderId, endpoint },
      f.token,
      undefined,
      f.request,
    );
    expect(new Headers(f.requests[0]?.headers).get("Authorization")).toBe(
      "Bearer verified-member-bearer",
    );
  });

  test("read-only state never creates a connection or asks permission", async () => {
    const f = fixture({ permission: "granted", existing: true });
    const state = await readOrderPushDevice(f.device);
    expect(state.subscription?.endpoint).toBe(endpoint);
    expect(f.events).toEqual(["registration", "getSubscription"]);
    expect(f.counters.subscriptions).toBe(0);
  });

  test("a saved device is available only for its currently configured application key", () => {
    const current = fixture({ existing: true });
    const old = fixture({ existing: true, mismatchedKey: true });
    expect(matchesOrderPushKey(current.subscription, publicKey)).toBe(true);
    expect(matchesOrderPushKey(old.subscription, publicKey)).toBe(false);
    expect(matchesOrderPushKey(current.subscription, null)).toBe(false);
    expect(matchesOrderPushKey(current.subscription, "invalid-key")).toBe(false);
  });

  test("a waiting app update blocks new opt-in while preserving the saved device for withdrawal", async () => {
    const f = fixture({ permission: "granted", existing: true, waiting: true });
    const state = await readOrderPushDevice(f.device);
    expect(state.updateReady).toBe(true);
    expect(state.subscription?.endpoint).toBe(endpoint);
    await expect(
      enableOrderNotifications("guest", orderId, config, f.token, f.request, f.device),
    ).rejects.toThrow("Use Update app");
    expect(f.events).not.toContain("permission");
    expect(f.requests).toHaveLength(0);
    expect(f.counters).toEqual({ subscriptions: 0, unsubscriptions: 0 });
    await disableOrderNotifications("guest", orderId, endpoint, f.token, f.request);
    expect(JSON.parse(String(f.requests[0]?.body)).action).toBe("unsubscribe");
    expect(f.counters.unsubscriptions).toBe(0);
  });

  test("existing choices can be checked and withdrawn while sending is unavailable", async () => {
    const request = (async (_url: unknown, init?: RequestInit) => {
      const input = JSON.parse(String(init?.body));
      return Response.json({ available: false, enabled: input.action === "status" });
    }) as typeof fetch;
    expect(
      await requestOrderNotifications(
        "guest",
        { action: "status", orderId, endpoint },
        async () => null,
        undefined,
        request,
      ),
    ).toEqual({ available: false, enabled: true });
    await disableOrderNotifications("guest", orderId, endpoint, async () => null, request);
  });
});

describe("order notification permission and subscription lifecycle", () => {
  test("permission starts in the tap before any awaited registration, auth or network work", async () => {
    const f = fixture();
    let answer!: (permission: NotificationPermission) => void;
    f.device.requestPermission = () => {
      f.events.push("permission");
      return new Promise((resolve) => {
        answer = resolve;
      });
    };
    const result = enableOrderNotifications(
      "member",
      orderId,
      config,
      f.token,
      f.request,
      f.device,
    );
    expect(f.events).toEqual(["permission"]);
    answer("granted");
    expect(await result).toBe(endpoint);
    expect(f.events).toEqual([
      "permission",
      "registration",
      "getSubscription",
      "subscribe",
      "token",
      "network",
    ]);
    expect(f.counters.subscriptions).toBe(1);
  });

  test("unsupported, blocked and dismissed permission never reaches the server", async () => {
    for (const options of [
      { support: "unsupported" as const },
      { support: "home-screen-required" as const },
      { permission: "denied" as const },
      { grant: "default" as const },
      { grant: "denied" as const },
    ]) {
      const f = fixture(options);
      await expect(
        enableOrderNotifications("guest", orderId, config, f.token, f.request, f.device),
      ).rejects.toThrow();
      expect(f.counters.subscriptions).toBe(0);
      expect(f.requests).toHaveLength(0);
      expect(f.events).not.toContain("registration");
    }
  });

  test("invalid order and unavailable configuration do not ask browser permission", async () => {
    for (const [id, settings] of [
      ["0001", config],
      [orderId, { available: false, publicKey }],
    ] as const) {
      const f = fixture();
      await expect(
        enableOrderNotifications("guest", id, settings, f.token, f.request, f.device),
      ).rejects.toThrow();
      expect(f.events).toEqual([]);
    }
  });

  test("an existing matching connection is reused without removing offers or other orders", async () => {
    const f = fixture({ permission: "granted", existing: true });
    await enableOrderNotifications("guest", orderId, config, f.token, f.request, f.device);
    expect(f.counters).toEqual({ subscriptions: 0, unsubscriptions: 0 });
    expect(f.events).not.toContain("permission");
    expect(JSON.parse(String(f.requests[0]?.body))).toEqual({
      action: "subscribe",
      orderId,
      subscription: { endpoint, keys: { p256dh: publicKey, auth: "A".repeat(22) } },
    });
  });

  test("a mismatched VAPID key needs explicit recovery and preserves the existing connection", async () => {
    const f = fixture({ permission: "granted", existing: true, mismatchedKey: true });
    await expect(
      enableOrderNotifications("member", orderId, config, f.token, f.request, f.device),
    ).rejects.toThrow("older notification connection");
    expect(f.counters).toEqual({ subscriptions: 0, unsubscriptions: 0 });
    expect(f.requests).toHaveLength(0);
  });

  test("a lost save response is not success; retry preserves the same browser subscription", async () => {
    const f = fixture({ permission: "granted" });
    const interrupted = (async () => {
      throw new Error("Network interrupted");
    }) as typeof fetch;
    await expect(
      enableOrderNotifications("guest", orderId, config, f.token, interrupted, f.device),
    ).rejects.toThrow("Network interrupted");
    expect(f.counters).toEqual({ subscriptions: 1, unsubscriptions: 0 });
    expect(
      await enableOrderNotifications("guest", orderId, config, f.token, f.request, f.device),
    ).toBe(endpoint);
    expect(f.counters).toEqual({ subscriptions: 1, unsubscriptions: 0 });
  });

  test("a successful HTTP response without persisted enablement is never reported as connected", async () => {
    for (const response of [{ enabled: false }, { ok: true }, { enabled: "true" }]) {
      const f = fixture({ permission: "granted", existing: true });
      const request = (async () => Response.json(response)) as typeof fetch;
      await expect(
        enableOrderNotifications("guest", orderId, config, f.token, request, f.device),
      ).rejects.toThrow();
      expect(f.counters.unsubscriptions).toBe(0);
    }
  });

  test("removing one order requires server confirmation and leaves the browser connection intact", async () => {
    const f = fixture({ permission: "granted", existing: true });
    await disableOrderNotifications("member", orderId, endpoint, f.token, f.request);
    expect(JSON.parse(String(f.requests[0]?.body))).toEqual({
      action: "unsubscribe",
      orderId,
      endpoint,
    });
    expect(f.counters.unsubscriptions).toBe(0);
    const stillEnabled = (async () => Response.json({ enabled: true })) as typeof fetch;
    await expect(
      disableOrderNotifications("guest", orderId, endpoint, f.token, stillEnabled),
    ).rejects.toThrow("could not be turned off");
  });
});
