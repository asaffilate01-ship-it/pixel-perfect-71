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
