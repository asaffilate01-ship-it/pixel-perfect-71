import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { Script, createContext } from "node:vm";
import { resolve } from "node:path";

const workerSource = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const origin = "https://mealdeck.example.test";
type WorkerRequest = Pick<Request, "url" | "method" | "mode" | "headers">;
type WorkerEvent = Record<string, unknown>;

/** Execute the shipped worker against bounded fake browser APIs, with no network. */
function worker() {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const cacheNames = new Set(["unrelated-app-cache", "mealdeck-public-offline-v0"]);
  const cached = new Map<string, Response>();
  const installed: string[] = [];
  const deleted: string[] = [];
  const fetched: string[] = [];
  let activationRequests = 0;
  let claims = 0;
  let networkFails = false;
  const pathOf = (value: string | WorkerRequest) =>
    new URL(typeof value === "string" ? value : value.url, origin).pathname;
  const context = createContext({
    URL,
    Response,
    Set,
    Promise,
    self: {
      location: { origin },
      addEventListener: (name: string, handler: (event: WorkerEvent) => void) =>
        listeners.set(name, handler),
      skipWaiting: async () => {
        activationRequests++;
      },
      clients: {
        claim: async () => {
          claims++;
        },
      },
    },
    caches: {
      open: async (name: string) => {
        cacheNames.add(name);
        return {
          addAll: async (urls: string[]) => {
            installed.push(...urls);
            for (const url of urls)
              cached.set(
                url,
                new Response(url === "/offline.html" ? "STATIC OFFLINE SCREEN" : "STATIC ARTWORK"),
              );
          },
        };
      },
      keys: async () => [...cacheNames],
      delete: async (name: string) => {
        deleted.push(name);
        return cacheNames.delete(name);
      },
      match: async (value: string | WorkerRequest) => cached.get(pathOf(value))?.clone(),
    },
    fetch: async (request: WorkerRequest) => {
      fetched.push(request.url);
      if (networkFails) throw new TypeError("Network unavailable");
      return new Response("CURRENT NETWORK RESPONSE");
    },
  });
  new Script(workerSource, { filename: "public/sw.js" }).runInContext(context);
  async function event(name: string, data: WorkerEvent = {}) {
    const pending: Promise<unknown>[] = [];
    listeners.get(name)?.({ ...data, waitUntil: (value: Promise<unknown>) => pending.push(value) });
    await Promise.all(pending);
  }
  function request(path: string, options: Partial<WorkerRequest> = {}) {
    let response: Promise<Response> | undefined;
    listeners.get("fetch")?.({
      request: {
        url: new URL(path, origin).href,
        method: "GET",
        mode: "navigate",
        headers: new Headers(),
        ...options,
      },
      respondWith: (value: Promise<Response>) => {
        response = Promise.resolve(value);
      },
    });
    return response;
  }
  return {
    event,
    request,
    installed,
    deleted,
    fetched,
    cached,
    cacheNames,
    failNetwork: () => {
      networkFails = true;
    },
    get activationRequests() {
      return activationRequests;
    },
    get claims() {
      return claims;
    },
  };
}

describe("MealDeck PWA privacy and offline operation", () => {
  test("pre-caches only the offline screen and approved static icon paths", async () => {
    const w = worker();
    await w.event("install");
    expect(w.installed).toEqual([
      "/offline.html",
      "/pwa/mealdeck-icon-192.png",
      "/pwa/mealdeck-icon-512.png",
      "/pwa/mealdeck-maskable-512.png",
      "/apple-touch-icon.png",
    ]);
    expect(w.activationRequests).toBe(0);
    expect(w.cached.has("/menus")).toBe(false);
  });

  test("public menu navigation is network-first and never stores application HTML", async () => {
    const w = worker();
    await w.event("install");
    const response = await w.request("/menus?brand=moktl&section=mocktail-lounge");
    expect(await response?.text()).toBe("CURRENT NETWORK RESPONSE");
    expect(w.fetched).toEqual([origin + "/menus?brand=moktl&section=mocktail-lounge"]);
    expect(w.cached.size).toBe(5);
  });

  test("a disconnected public navigation receives the static offline screen", async () => {
    const w = worker();
    await w.event("install");
    w.failNetwork();
    for (const path of ["/", "/menu", "/menus/", "/order?preview=sample", "/play"]) {
      expect(await (await w.request(path))?.text()).toBe("STATIC OFFLINE SCREEN");
    }
  });

  test("evicted offline cache fails clearly without fabricating an order or response", async () => {
    const w = worker();
    w.failNetwork();
    const response = await w.request("/menus");
    expect(response?.status).toBe(503);
    expect(response?.headers.get("cache-control")).toBe("no-store");
  });

  test("staff, tracking, authentication, server functions and API traffic bypass the worker", () => {
    const w = worker();
    w.failNetwork();
    for (const path of [
      "/ops",
      "/ops/menus",
      "/kds",
      "/kds/",
      "/track",
      "/track?order=private",
      "/api/order",
      "/_serverFn/private",
      "/auth/callback",
      "/checkout",
      "/menus/customer-order",
    ]) {
      expect(w.request(path)).toBeUndefined();
    }
    expect(w.request("/menus", { mode: "cors" })).toBeUndefined();
    expect(w.fetched).toHaveLength(0);
  });

  test("credentials, writes, cross-origin requests and altered asset URLs are never cached", () => {
    const w = worker();
    expect(
      w.request("/menus", { headers: new Headers({ Authorization: "Bearer fixture" }) }),
    ).toBeUndefined();
    expect(w.request("/menus", { method: "POST" })).toBeUndefined();
    expect(w.request("https://other.example.test/menus")).toBeUndefined();
    expect(w.request("/pwa/mealdeck-icon-512.png?token=private", { mode: "cors" })).toBeUndefined();
    expect(w.request("/assets/private.json", { mode: "cors" })).toBeUndefined();
    expect(w.cached.size).toBe(0);
  });

  test("activation removes only obsolete MealDeck offline caches", async () => {
    const w = worker();
    await w.event("install");
    await w.event("activate");
    expect(w.deleted).toEqual(["mealdeck-public-offline-v0"]);
    expect(w.cacheNames.has("unrelated-app-cache")).toBe(true);
    expect(w.cacheNames.has("mealdeck-public-offline-v1")).toBe(true);
    expect(w.claims).toBe(1);
  });

  test("an update waits for the explicit MealDeck activation message", async () => {
    const w = worker();
    await w.event("message", { data: { type: "UNRELATED_MESSAGE" } });
    expect(w.activationRequests).toBe(0);
    await w.event("message", { data: { type: "MEALDECK_ACTIVATE_UPDATE" } });
    expect(w.activationRequests).toBe(1);
  });

  test("install metadata resolves real local artwork and opens the public menu", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    );
    expect(manifest.name).toBe("MealDeck");
    expect(manifest.start_url).toBe("/menus");
    expect(manifest.display).toBe("standalone");
    expect(manifest.scope).toBe("/");
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith("/")).toBe(true);
      expect(existsSync(resolve(import.meta.dir, "../public", icon.src.slice(1)))).toBe(true);
    }
    expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === "maskable")).toBe(
      true,
    );
  });
});
