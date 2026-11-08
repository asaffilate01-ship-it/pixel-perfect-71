/* Driver PWA intentionally caches zero delivery data, HTML, auth or API responses. */
self.addEventListener("install", () => {});
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => {
  if (event.data?.type === "MEALDECK_ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});
