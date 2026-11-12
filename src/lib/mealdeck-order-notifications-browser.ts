import { isWebPushPublicKey } from "./mealdeck-customer";
import type { MealDeckCheckoutMode } from "./mealdeck-checkout-browser";

export type OrderPushConfig = { available: boolean; publicKey: string | null };
export type OrderPushSupport = "supported" | "home-screen-required" | "unsupported";
export type OrderPushState = { available: boolean; enabled: boolean };
export type OrderPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};
type OrderPushInput =
  | { action: "status"; orderId: string; endpoint?: string }
  | { action: "subscribe"; orderId: string; subscription: OrderPushSubscription }
  | { action: "unsubscribe"; orderId: string; endpoint: string };

const orderIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailableMessage = "Order alerts could not be updated. Please reconnect and try again.";
export const ORDER_PUSH_RECONNECT_MESSAGE =
  "This device has an older notification connection. Turn off device notifications in your MealDeck account or browser settings, then reconnect.";
export const ORDER_PUSH_UPDATE_MESSAGE =
  "A MealDeck app update is ready. Use Update app, then check this order again. Updating refreshes this page.";

export class OrderNotificationsError extends Error {
  constructor(
    public readonly code:
      | "unavailable"
      | "unsupported"
      | "home-screen-required"
      | "blocked"
      | "dismissed"
      | "not-ready"
      | "key-changed",
    message: string,
  ) {
    super(message);
    this.name = "OrderNotificationsError";
  }
}

/** A receipt navigation hint only. The server still verifies the selected identity. */
export function notificationReceiptMode(
  orderId: unknown,
  mode: unknown,
): MealDeckCheckoutMode | undefined {
  return typeof orderId === "string" &&
    orderIdPattern.test(orderId) &&
    (mode === "guest" || mode === "member")
    ? mode
    : undefined;
}

export function orderPushSupport(): OrderPushSupport {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !window.isSecureContext)
    return "unsupported";
  const appleMobile =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (appleMobile && !standalone) return "home-screen-required";
  return "Notification" in window && "PushManager" in window && "serviceWorker" in navigator
    ? "supported"
    : "unsupported";
}

export type OrderPushDevice = {
  support: () => OrderPushSupport;
  permission: () => NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  registration: () => Promise<
    Pick<ServiceWorkerRegistration, "pushManager"> &
      Partial<Pick<ServiceWorkerRegistration, "waiting">>
  >;
};

type OrderWorkerRegistration = Pick<
  ServiceWorkerRegistration,
  "active" | "scope" | "waiting" | "pushManager"
>;

/**
 * The PWA provider can still be activating /sw.js on a fresh paid-order page.
 * Waiting is allowed only AFTER the user has explicitly granted permission.
 * The timeout prevents a missing or foreign worker from hanging checkout.
 * This never registers a new worker or requests browser permission.
 */
export async function waitForOrderPushWorker(
  current: () => Promise<OrderWorkerRegistration | undefined>,
  ready: () => Promise<OrderWorkerRegistration>,
  origin: string,
  timeoutMs = 8_000,
): Promise<OrderWorkerRegistration> {
  const notReady = () =>
    new OrderNotificationsError(
      "not-ready",
      "MealDeck is still getting ready on this device. Reload this order, then try again.",
    );
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
    throw notReady();
  const expectedScope = new URL("/", origin).href;
  const valid = (worker: OrderWorkerRegistration | undefined): worker is OrderWorkerRegistration => {
    if (!worker?.active || worker.scope !== expectedScope) return false;
    try {
      const script = new URL(worker.active.scriptURL);
      return script.origin === new URL(expectedScope).origin && script.pathname === "/sw.js";
    } catch {
      return false;
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(notReady()), timeoutMs);
  });
  try {
    const existing = await Promise.race([current(), deadline]);
    if (valid(existing)) return existing;
    const activated = await Promise.race([ready(), deadline]);
    if (!valid(activated)) throw notReady();
    return activated;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const browserDevice: OrderPushDevice = {
  support: orderPushSupport,
  permission: () => Notification.permission,
  requestPermission: () => Notification.requestPermission(),
  registration: () =>
    waitForOrderPushWorker(
      () => navigator.serviceWorker.getRegistration("/"),
      () => navigator.serviceWorker.ready,
      window.location.origin,
    ),
};

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  const result = object(await response.json().catch(() => null));
  if (!response.ok) {
    const message = result["message"];
    throw new OrderNotificationsError(
      "unavailable",
      typeof message === "string" && message.length > 0 && message.length <= 400
        ? message
        : unavailableMessage,
    );
  }
  return result;
}

export async function readOrderPushConfig(
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<OrderPushConfig> {
  const result = await responseBody(
    await request("/api/notifications", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      ...(signal ? { signal } : {}),
    }),
  );
  if (typeof result["available"] !== "boolean")
    throw new OrderNotificationsError("unavailable", unavailableMessage);
  const publicKey = isWebPushPublicKey(result["publicKey"])
    ? (result["publicKey"] as string)
    : null;
  return { available: result["available"] && publicKey !== null, publicKey };
}

/** Guest identity stays in its HttpOnly cookie, even when a member is also signed in. */
export async function requestOrderNotifications(
  mode: MealDeckCheckoutMode,
  input: OrderPushInput,
  getAccessToken: () => Promise<string | null>,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<{ enabled: boolean; available?: boolean }> {
  if (!orderIdPattern.test(input.orderId))
    throw new OrderNotificationsError(
      "unavailable",
      "Open your private order to change its alerts.",
    );
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (mode === "member") {
    const token = await getAccessToken();
    if (!token)
      throw new OrderNotificationsError(
        "unavailable",
        "Sign in again to change this order’s alerts.",
      );
    headers["Authorization"] = "Bearer " + token;
  }
  if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  const result = await responseBody(
    await request("/api/notifications", {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      credentials: "same-origin",
      cache: "no-store",
      ...(signal ? { signal } : {}),
    }),
  );
  if (
    typeof result["enabled"] !== "boolean" ||
    (input.action === "status" && typeof result["available"] !== "boolean")
  )
    throw new OrderNotificationsError("unavailable", unavailableMessage);
  return {
    enabled: result["enabled"],
    ...(typeof result["available"] === "boolean" ? { available: result["available"] } : {}),
  };
}

/** Reading this state never requests permission or creates a browser subscription. */
export async function readOrderPushDevice(device: OrderPushDevice = browserDevice): Promise<{
  support: OrderPushSupport;
  permission: NotificationPermission;
  subscription: PushSubscription | null;
  updateReady: boolean;
}> {
  const support = device.support();
  if (support !== "supported")
    return { support, permission: "default", subscription: null, updateReady: false };
  const permission = device.permission();
  // New customers have not consented yet: do not require an installed SW just
  // to show the "Notify me about this order" choice. A user click first
  // requests permission, then waits for the correct /sw.js to activate.
  if (permission !== "granted")
    return { support, permission, subscription: null, updateReady: false };
  const worker = await device.registration();
  return {
    support,
    permission,
    subscription: await worker.pushManager.getSubscription(),
    updateReady: Boolean(worker.waiting),
  };
}

function publicKeyBytes(publicKey: string): Uint8Array<ArrayBuffer> {
  const base64 = publicKey.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)), (char) =>
    char.charCodeAt(0),
  );
}

function sameApplicationKey(subscription: PushSubscription, expected: Uint8Array): boolean {
  const key = subscription.options.applicationServerKey;
  if (!key) return false;
  const current = new Uint8Array(key);
  return (
    current.length === expected.length && current.every((value, index) => value === expected[index])
  );
}

export function matchesOrderPushKey(subscription: PushSubscription, publicKey: unknown): boolean {
  return (
    isWebPushPublicKey(publicKey) && sameApplicationKey(subscription, publicKeyBytes(publicKey))
  );
}

/** Call from the tap itself; permission is requested before any awaited network/device work. */
export async function enableOrderNotifications(
  mode: MealDeckCheckoutMode,
  orderId: string,
  config: OrderPushConfig,
  getAccessToken: () => Promise<string | null>,
  request: typeof fetch = fetch,
  device: OrderPushDevice = browserDevice,
): Promise<string> {
  if (!orderIdPattern.test(orderId))
    throw new OrderNotificationsError(
      "unavailable",
      "Open your private order to change its alerts.",
    );
  if (!config.available || !isWebPushPublicKey(config.publicKey))
    throw new OrderNotificationsError(
      "unavailable",
      "Order alerts are still being connected. Follow your order’s progress here.",
    );
  const support = device.support();
  if (support !== "supported")
    throw new OrderNotificationsError(
      support,
      support === "home-screen-required"
        ? "On iPhone or iPad, add MealDeck to your home screen, then open it there to allow notifications."
        : "This browser does not support app notifications. You can follow your order’s progress here.",
    );
  const currentPermission = device.permission();
  if (currentPermission === "denied")
    throw new OrderNotificationsError(
      "blocked",
      "Notifications are blocked. Allow MealDeck notifications in your browser or device settings, then check again.",
    );
  const permission = currentPermission === "granted" ? "granted" : await device.requestPermission();
  if (permission !== "granted")
    throw new OrderNotificationsError(
      permission === "denied" ? "blocked" : "dismissed",
      "Notifications remain off. You can try again when you are ready.",
    );
  const worker = await device.registration();
  if (worker.waiting) throw new OrderNotificationsError("not-ready", ORDER_PUSH_UPDATE_MESSAGE);
  const key = publicKeyBytes(config.publicKey);
  let subscription = await worker.pushManager.getSubscription();
  if (subscription && !sameApplicationKey(subscription, key))
    throw new OrderNotificationsError("key-changed", ORDER_PUSH_RECONNECT_MESSAGE);
  subscription ??= await worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });
  const keys = subscription.toJSON().keys;
  if (!keys?.["p256dh"] || !keys["auth"])
    throw new OrderNotificationsError(
      "unavailable",
      "Your browser could not create a notification connection. Please try again.",
    );
  const result = await requestOrderNotifications(
    mode,
    {
      action: "subscribe",
      orderId,
      subscription: {
        endpoint: subscription.endpoint,
        keys: { p256dh: keys["p256dh"], auth: keys["auth"] },
      },
    },
    getAccessToken,
    undefined,
    request,
  );
  if (!result.enabled)
    throw new OrderNotificationsError(
      "unavailable",
      "Your order alert choice was not saved. Please try again.",
    );
  // A lost response can follow a committed subscription. Keep the browser
  // connection for an idempotent retry; it may also serve another order or offers.
  return subscription.endpoint;
}

/** Remove this order association only; account offers and other orders keep their connection. */
export async function disableOrderNotifications(
  mode: MealDeckCheckoutMode,
  orderId: string,
  endpoint: string,
  getAccessToken: () => Promise<string | null>,
  request: typeof fetch = fetch,
): Promise<void> {
  const result = await requestOrderNotifications(
    mode,
    { action: "unsubscribe", orderId, endpoint },
    getAccessToken,
    undefined,
    request,
  );
  if (result.enabled)
    throw new OrderNotificationsError(
      "unavailable",
      "This order’s alerts could not be turned off. Please try again.",
    );
}
