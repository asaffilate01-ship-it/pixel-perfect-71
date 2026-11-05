/* Narrow /printer scope. Print jobs remain server-side, never in an offline cache. */
self.addEventListener("install", () => {});
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => {
  if (event.data?.type === "MEALDECK_ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});
