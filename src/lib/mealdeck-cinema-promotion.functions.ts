import { createServerFn } from "@tanstack/react-start";

/** Never let the browser clock or a client-provided parameter activate an offer. */
export const getMealDeckCinemaPromotion = createServerFn({ method: "GET" }).handler(async () => {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  const { readCinemaPromoStatus } = await import("./mealdeck-cinema-promotion.server");
  setResponseHeader("Cache-Control", "no-store, max-age=0");
  return readCinemaPromoStatus(process.env);
});
