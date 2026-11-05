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

// Only the configured sender can address the encrypted push subscription.
// It must recheck current account preferences before each send. Keep lock-screen
// messages generic: no name, vehicle, address, basket or order-payment details.
self.addEventListener("push", (event) => {
  let payload;
  try { payload = event.data?.json(); } catch { return; }
  if (!payload || !["order_update", "offer"].includes(payload.type)) return;
  const offer = payload.type === "offer";
  event.waitUntil(self.registration.showNotification("MealDeck", {
    body: offer ? "There’s a new MealDeck offer to explore." : "There’s an update in your MealDeck account.",
    icon: "/pwa/mealdeck-icon-192.png",
    badge: "/pwa/mealdeck-icon-192.png",
    tag: offer ? "mealdeck-offer" : "mealdeck-order-update",
    data: { path: offer ? "/menus" : "/account" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.path === "/menus" ? "/menus" : "/account";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    for (const client of windows) {
      const clientUrl = new URL(client.url);
      // Customer notifications must never navigate a kitchen/printer/staff app.
      const customerPage = ["/", "/menu", "/menus", "/account", "/checkout", "/order", "/play", "/track"].includes(clientUrl.pathname.replace(/\/+$/, "") || "/");
      if (clientUrl.origin === self.location.origin && customerPage && "focus" in client) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
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
