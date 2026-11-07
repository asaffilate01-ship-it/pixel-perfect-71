/* MealDeck's bounded offline experience. Keep private/live data on the network. */
const CACHE_PREFIX = "mealdeck-public-offline-";
const CACHE_NAME = CACHE_PREFIX + "v1";
const OFFLINE_URL = "/offline.html";
const STATIC_URLS = [
  OFFLINE_URL,
  "/pwa/mealdeck-icon-192.png",
  "/pwa/mealdeck-icon-512.png",
  "/pwa/mealdeck-maskable-512.png",
  "/apple-touch-icon.png",
];
const PUBLIC_NAVIGATIONS = new Set([
  "/",
  "/menu",
  "/menus",
  "/menus/skorch-burgers",
  "/menus/tavo-chicken",
  "/menus/loadd",
  "/menus/souvano",
  "/menus/moktl",
  "/order",
  "/play",
  "/brands",
  "/franchise",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "MEALDECK_ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});

const PUSH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_PUSH_MESSAGES = {
  accepted: ["Order accepted", "The kitchen has accepted your order."],
  preparing: [
    "Preparing your order",
    "The kitchen is preparing your food. We’ll let you know when it’s ready.",
  ],
  ready_for_handover: [
    "Ready for handover",
    "Your order is ready. Have your handover code ready — tap to view it.",
  ],
  with_driver: ["With your driver", "Your driver has collected your order."],
  on_the_way: [
    "On the way",
    "Your order is on the way. Have your handover code ready — tap to view it.",
  ],
  completed: ["Order handed over", "Your order has been handed over. Enjoy your MealDeck meal."],
};
const boundedPushText = (value, maximum) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= maximum &&
  !/[\p{Cc}\p{Cf}]/u.test(value);
const pushTime = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const validOrderPushData = (payload) =>
  payload?.type === "order_update" &&
  PUSH_UUID.test(payload.orderId) &&
  ["guest", "member"].includes(payload.checkoutMode) &&
  ["pickup", "curbside", "delivery"].includes(payload.fulfilment) &&
  Object.prototype.hasOwnProperty.call(ORDER_PUSH_MESSAGES, payload.stage) &&
  (!["with_driver", "on_the_way"].includes(payload.stage) || payload.fulfilment === "delivery");

function orderPushDisplay(payload) {
  const message = ORDER_PUSH_MESSAGES[payload.stage];
  let title = "MealDeck · " + message[0];
  let body = message[1];
  if (payload.stage === "ready_for_handover") {
    body =
      payload.fulfilment === "delivery"
        ? "Your order is packed and ready for your driver. We’ll update you when it’s collected."
        : payload.fulfilment === "curbside"
          ? "Your order is ready for kerbside handover. Have your handover code ready — tap to view it."
          : "Your order is ready to collect. Have your handover code ready — tap to view it.";
  }
  const occurredAt = pushTime(payload.occurredAt);
  const expiresAt = pushTime(payload.expiresAt);
  if (payload.expiresAt !== undefined && (expiresAt === null || expiresAt <= Date.now())) {
    title = "MealDeck · Order update";
    body = "Open your order for its latest status.";
  }
  const data = {
    type: "order_update",
    orderId: payload.orderId,
    checkoutMode: payload.checkoutMode,
  };
  // Keep only validated status metadata on the visible notification. Invalid
  // timestamps cannot later resurrect stale copy as an apparently fresh update.
  if (
    (payload.occurredAt === undefined || occurredAt !== null) &&
    (payload.expiresAt === undefined || expiresAt !== null)
  ) {
    data.stage = payload.stage;
    data.fulfilment = payload.fulfilment;
    if (occurredAt !== null) data.occurredAt = new Date(occurredAt).toISOString();
    if (expiresAt !== null) data.expiresAt = new Date(expiresAt).toISOString();
  }
  return { title, body, tag: "mealdeck-order-" + payload.orderId, data };
}
// Serialize display work in this worker lifetime so two concurrent push events
// cannot both read an empty visible history and then overwrite a newer stage.
let notificationDisplayQueue = Promise.resolve();

// Only the configured sender can address the encrypted subscription. Status
// copy is fixed here: payload text can never disclose a collection code, name,
// vehicle, address, basket or payment detail. Codes stay in the private receipt.
self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return;
  }
  if (!payload || !["order_update", "offer"].includes(payload.type)) return;
  const offer = payload.type === "offer";
  const expired =
    typeof payload.expiresAt === "string" &&
    (!Number.isFinite(Date.parse(payload.expiresAt)) ||
      Date.parse(payload.expiresAt) <= Date.now());
  let title = "MealDeck";
  let body = offer
    ? "There’s a new MealDeck offer to explore."
    : "There’s an update in your MealDeck account.";
  let tag = offer ? "mealdeck-offer" : "mealdeck-order-update";
  let data = { path: offer ? "/menus" : "/account" };
  let actions;
  let orderPayload = null;
  let renotify = !offer;
  if (!offer && PUSH_UUID.test(payload.notificationId) && validOrderPushData(payload)) {
    orderPayload = payload;
    ({ title, body, tag, data } = orderPushDisplay(payload));
  } else if (
    offer &&
    PUSH_UUID.test(payload.campaignId) &&
    PUSH_UUID.test(payload.notificationId) &&
    ["/offers", "/menus"].includes(payload.path) &&
    boundedPushText(payload.title, 60) &&
    boundedPushText(payload.body, 180)
  ) {
    title = "MealDeck · " + payload.title;
    body = payload.body;
    tag = "mealdeck-offer-" + payload.campaignId;
    data = { type: "offer", path: payload.path };
    actions = [{ action: "preferences", title: "Manage offers" }];
    if (expired) {
      title = "MealDeck";
      body = "View the current MealDeck offers.";
    }
  }
  const display = notificationDisplayQueue
    .catch(() => undefined)
    .then(async () => {
      const incomingTime = pushTime(orderPayload?.occurredAt);
      if (
        orderPayload &&
        incomingTime !== null &&
        typeof self.registration.getNotifications === "function"
      ) {
        try {
          const visible = await self.registration.getNotifications({ tag });
          let latest = orderPayload;
          let latestTime = incomingTime;
          for (const notification of visible) {
            const previous = notification.data;
            const previousTime = pushTime(previous?.occurredAt);
            if (
              validOrderPushData(previous) &&
              previous.orderId === orderPayload.orderId &&
              previous.checkoutMode === orderPayload.checkoutMode &&
              previousTime !== null &&
              previousTime > latestTime &&
              (previous.expiresAt === undefined || pushTime(previous.expiresAt) !== null)
            ) {
              latest = previous;
              latestTime = previousTime;
            }
          }
          if (latest !== orderPayload) {
            // A delayed push must still produce a visible notification. Rebuild
            // the newest visible stage from fixed copy, without alerting again;
            // never trust an existing notification's arbitrary title or body.
            ({ title, body, tag, data } = orderPushDisplay(latest));
            renotify = false;
          }
        } catch {
          // Browser notification history is optional; current validated copy
          // remains usable without writing order data to caches or storage.
        }
      }
      await self.registration.showNotification(title, {
        body,
        icon: "/pwa/mealdeck-icon-192.png",
        badge: "/pwa/mealdeck-icon-192.png",
        tag,
        renotify,
        data,
        ...(actions ? { actions } : {}),
      });
    });
  notificationDisplayQueue = display;
  event.waitUntil(display);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;
  let path = data?.path === "/menus" ? "/menus" : data?.path === "/offers" ? "/offers" : "/account";
  if (
    data?.type === "order_update" &&
    PUSH_UUID.test(data.orderId) &&
    ["guest", "member"].includes(data.checkoutMode)
  )
    path = "/checkout?order=" + data.orderId + "&notificationMode=" + data.checkoutMode;
  if (event.action === "preferences") path = "/account";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        const clientUrl = new URL(client.url);
        // Customer notifications must never navigate a kitchen/printer/staff app.
        const customerPage = [
          "/",
          "/menu",
          "/menus",
          "/offers",
          "/account",
          "/checkout",
          "/order",
          "/play",
          "/track",
        ].includes(clientUrl.pathname.replace(/\/+$/, "") || "/");
        if (clientUrl.origin === self.location.origin && customerPage && "focus" in client) {
          await client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.headers.has("authorization")
  )
    return;

  if (!url.search && STATIC_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request, { cacheName: CACHE_NAME }).then((cached) => cached || fetch(request)),
    );
    return;
  }

  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (request.mode !== "navigate" || !PUBLIC_NAVIGATIONS.has(path)) return;

  // Never cache the application's SSR HTML, including menu query strings.
  // Offline navigation gets a static, truthful fallback with no order data.
  event.respondWith(
    fetch(request).catch(async () => {
      const offline = await caches.match(OFFLINE_URL, { cacheName: CACHE_NAME });
      return (
        offline ||
        new Response("MealDeck is offline. Reconnect and refresh to continue.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        })
      );
    }),
  );
});
