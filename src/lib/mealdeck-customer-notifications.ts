import { CustomerAccountError, isWebPushPublicKey } from "./mealdeck-customer";
import { customerRpc } from "./mealdeck-customer-browser";

export type CustomerDeviceNotifications = "unsupported" | "blocked" | "off" | "connected";

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
  const worker = await navigator.serviceWorker.getRegistration("/");
  if (worker?.active) return worker;
  // The PWA provider registers /sw.js after hydration. First-use customers
  // can click Allow while it is installing; wait briefly for activation.
  return new Promise<ServiceWorkerRegistration>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new CustomerAccountError(
        "unavailable",
        "MealDeck notifications are still installing. Reload the app, then try again.",
      )),
      7_000,
    );
    void navigator.serviceWorker.ready.then(
      (ready) => {
        clearTimeout(timer);
        if (ready.active && new URL(ready.scope).pathname === "/") resolve(ready);
        else reject(new CustomerAccountError(
          "unavailable",
          "Open the MealDeck customer app to enable notifications, then try again.",
        ));
      },
      () => {
        clearTimeout(timer);
        reject(new CustomerAccountError(
          "unavailable",
          "The notification connection is not ready. Reload and try again.",
        ));
      },
    );
  });
}

export async function readCustomerDeviceNotifications(): Promise<CustomerDeviceNotifications> {
  if (!supportsCustomerPush()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const worker = await navigator.serviceWorker.getRegistration("/");
  const subscription = await worker?.pushManager.getSubscription();
  if (!subscription || Notification.permission !== "granted") return "off";
  const result = await customerRpc<{ connected: boolean }>("mealdeck_customer_has_push", {
    p_endpoint: subscription.endpoint,
  });
  return result?.connected === true ? "connected" : "off";
}

/** Call directly from a customer's click, after they save their separate choices. */
export async function enableCustomerDeviceNotifications(publicKey: string): Promise<void> {
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
  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted")
    throw new CustomerAccountError(
      "unavailable",
      "Notifications remain off. You can enable them later from your account.",
    );
  const worker = await registration();
  const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/") + "="), (c) =>
    c.charCodeAt(0),
  );
  let subscription = await worker.pushManager.getSubscription();
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
  subscription ??= await worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: bytes,
  });
  const keys = subscription.toJSON().keys;
  try {
    if (!keys?.["p256dh"] || !keys["auth"])
      throw new CustomerAccountError(
        "unavailable",
        "Your browser could not create a notification connection. Please try again.",
      );
    const result = await customerRpc<{ saved: boolean }>("mealdeck_customer_save_push", {
      p_endpoint: subscription.endpoint,
      p_p256dh: keys["p256dh"],
      p_auth: keys["auth"],
    });
    if (result?.saved !== true)
      throw new CustomerAccountError(
        "unavailable",
        "Your notification choice could not be saved. Please try again.",
      );
  } catch (error) {
    // Never call the browser permission alone a successful server subscription.
    if (created) await subscription.unsubscribe().catch(() => false);
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
