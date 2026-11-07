import { createServerFn } from "@tanstack/react-start";

/** Public menu presentation only; this function accepts no client-selected scope. */
export const getMealDeckMenuForRender = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest, setResponseHeader } = await import("@tanstack/react-start/server");
  const { readMealDeckMenuForRender } = await import("./mealdeck-menu-render.server");
  setResponseHeader("Cache-Control", "no-store");
  return readMealDeckMenuForRender(process.env, fetch, getRequest().signal);
});
