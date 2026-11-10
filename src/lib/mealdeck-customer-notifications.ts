import { CustomerAccountError, isWebPushPublicKey } from "./mealdeck-customer";
import { customerRpc } from "./mealdeck-customer-browser";

export type CustomerDeviceNotifications = "unsupported" | "blocked" | "off" | "connected";
export type CustomerPushStage = "permission" | "worker" | "subscription" | "saving" | "verifying";

export class CustomerPushTimeoutError extends CustomerAccountError {
  constructor(stage: string) {
    super(
      "unavailable",
      stage +
        " is taking too long. Check your browser permission or internet connection, then retry.",
    );
    this.name = "CustomerPushTimeoutError";
  }
}

/** A stalled browser prompt, PushManager or network call must not leave the UI spinning forever.
 * The browser may finish an in-flight request later; a retry reuses the same subscription
 * rather than creating a second send or changing customer marketing choices.
 */
export async function withCustomerPushDeadline<T>(
  action: Promise<T>,
  stage: string,
  milliseconds = 15_000,
): Promise<T> {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1)
    throw new Error("Invalid push deadline");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CustomerPushTimeoutError(stage)), milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function supportsCustomerPush(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "Notification" in window &&
    "PushManager" in window &&
    "serviceWorker" in navigator
  );
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const worker = await withCustomerPushDeadline(
    navigator.serviceWorker.getRegistration("/"),
    "Finding the MealDeck customer app",
    8_000,
  );
  if (worker?.active && new URL(worker.scope).pathname === "/") return worker;
  // The PWA provider registers /sw.js after hydration. First-use customers
  // can click Allow while it is installing; wait briefly for activation.
  return new Promise<ServiceWorkerRegistration>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new CustomerAccountError(
            "unavailable",
            "MealDeck notifications are still installing. Reload the app, then try again.",
          ),
        ),
      7_000,
    );
    void navigator.serviceWorker.ready.then(
      (ready) => {
        clearTimeout(timer);
        if (ready.active && new URL(ready.scope).pathname === "/") resolve(ready);
        else
          reject(
            new CustomerAccountError(
              "unavailable",
              "Open the MealDeck customer app to enable notifications, then try again.",
            ),
          );
      },
      () => {
        clearTimeout(timer);
        reject(
          new CustomerAccountError(
            "unavailable",
            "The notification connection is not ready. Reload and try again.",
          ),
        );
      },
    );
  });
}

export async function readCustomerDeviceNotifications(): Promise<CustomerDeviceNotifications> {
  if (!supportsCustomerPush()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  // First-time visitors have no permission or endpoint. Do not wait for a
  // browser service worker or network call just to enable the Allow button.
  if (Notification.permission !== "granted") return "off";
  const worker = await withCustomerPushDeadline(
    navigator.serviceWorker.getRegistration("/"),
    "Checking the MealDeck app",
    8_000,
  );
  const subscription = worker
    ? await withCustomerPushDeadline(
        worker.pushManager.getSubscription(),
        "Checking device alerts",
        8_000,
      )
    : null;
  if (!subscription || Notification.permission !== "granted") return "off";
  const result = await withCustomerPushDeadline(
    customerRpc<{ connected: boolean }>("mealdeck_customer_has_push", {
      p_endpoint: subscription.endpoint,
    }),
    "Checking your saved notification device",
    8_000,
  );
  return result?.connected === true ? "connected" : "off";
}

/** Call directly from a customer's click, after they save their separate choices. */
export async function enableCustomerDeviceNotifications(
  publicKey: string,
  onStage?: (stage: CustomerPushStage) => void,
): Promise<void> {
  if (!isWebPushPublicKey(publicKey))
    throw new CustomerAccountError("unconfigured", "App notifications are coming soon.");
  if (!supportsCustomerPush())
    throw new CustomerAccountError(
      "unavailable",
      "On iPhone or iPad, add MealDeck to your home screen first, then open the app. Your browser may not support notifications.",
    );
  if (Notification.permission === "denied")
    throw new CustomerAccountError(
      "unavailable",
      "Notifications are blocked in your browser settings. You can change that permission there.",
    );
  onStage?.("permission");
  // Request permission while still in the original user-click activation.
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await withCustomerPushDeadline(
          Notification.requestPermission(),
          "Browser notification permission",
          20_000,
        );
  if (permission !== "granted")
    throw new CustomerAccountError(
      "unavailable",
      "Notifications remain off. You can enable them later from your account.",
    );
  onStage?.("worker");
  const worker = await registration();
  const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/") + "="), (c) =>
    c.charCodeAt(0),
  );
  onStage?.("subscription");
  let subscription = await withCustomerPushDeadline(
    worker.pushManager.getSubscription(),
    "Checking your phone's existing notification connection",
  );
  if (subscription?.options.applicationServerKey) {
    const existing = new Uint8Array(subscription.options.applicationServerKey);
    if (
      existing.length !== bytes.length ||
      existing.some((value, index) => value !== bytes[index])
    ) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  const created = !subscription;
  subscription ??= await withCustomerPushDeadline(
    worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    }),
    "Connecting your phone to push notifications",
    20_000,
  );
  const keys = subscription.toJSON().keys;
  try {
    if (!keys?.["p256dh"] || !keys["auth"])
      throw new CustomerAccountError(
        "unavailable",
        "Your browser could not create a notification connection. Please try again.",
      );
    onStage?.("saving");
    const result = await withCustomerPushDeadline(
      customerRpc<{ saved: boolean }>("mealdeck_customer_save_push", {
        p_endpoint: subscription.endpoint,
        p_p256dh: keys["p256dh"],
        p_auth: keys["auth"],
      }),
      "Saving your device's notification connection",
    );
    if (result?.saved !== true)
      throw new CustomerAccountError(
        "unavailable",
        "Your notification choice could not be saved. Please try again.",
      );
    onStage?.("verifying");
  } catch (error) {
    // A timed-out server write is uncertain: it may still have succeeded.
    // Preserve the endpoint for an idempotent retry/reconciliation rather than
    // unregistering a device that the server has already saved.
    if (created && !(error instanceof CustomerPushTimeoutError)) {
      await subscription.unsubscribe().catch(() => false);
    }
    throw error;
  }
}

/** Stop local delivery even if a network interruption prevents the server removal. */
export async function disableCustomerDeviceNotifications(): Promise<void> {
  if (!supportsCustomerPush()) return;
  const worker = await navigator.serviceWorker.getRegistration("/");
  const subscription = await worker?.pushManager.getSubscription();
  if (!subscription) return;
  let problem: unknown;
  try {
    await customerRpc("mealdeck_customer_remove_push", { p_endpoint: subscription.endpoint });
  } catch (error) {
    problem = error;
  }
  const removed = await subscription.unsubscribe();
  if (!removed)
    throw new CustomerAccountError(
      "unavailable",
      "Your browser could not turn off notifications. Block MealDeck notifications in browser settings, then retry.",
    );
  if (problem)
    throw new CustomerAccountError(
      "unavailable",
      "Notifications are off on this device. Reconnect to sync that change with your account.",
    );
}
