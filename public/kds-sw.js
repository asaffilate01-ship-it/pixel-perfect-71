/* Narrow /kds scope, root-served worker. No order/session/API/HTML caching. */
self.addEventListener("install", () => {});
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => {
  if (event.data?.type === "MEALDECK_ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});
