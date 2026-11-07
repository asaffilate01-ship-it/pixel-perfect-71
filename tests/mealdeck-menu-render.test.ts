import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import {
  mealDeckPublicMenuQueryOptions,
  usePublicMenu,
} from "../src/components/menus/use-public-menu";
import { readMealDeckMenuForRender } from "../src/lib/mealdeck-menu-render.server";
import type { MealDeckPublicMenuSnapshot } from "../src/lib/mealdeck-public-menu";

const env = {
  MEALDECK_SUPABASE_URL: "https://menufixture.supabase.co",
  MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_menu_fixture_public",
  MEALDECK_CHECKOUT_SERVER_KEY: "sb_secret_menu_fixture_server",
  MEALDECK_TENANT_ID: "40000000-0000-4000-8000-000000000001",
};
const sku = "loadd-loaded-fries-king-of-hearts";
const initialMenu: MealDeckPublicMenuSnapshot = {
  available: true,
  checkedAt: "2026-11-07T17:00:00.000Z",
  items: [
    {
      sku,
      categoryName: "Loaded Fries",
      name: "Royal Flush",
      description: "Fried chicken",
      pricePence: 550,
      options: {},
      replacementPricePence: null,
    },
  ],
};

function renderMenu(client: QueryClient, initial: MealDeckPublicMenuSnapshot | null) {
  function Probe() {
    const menu = usePublicMenu(initial);
    const item = menu.catalogue
      .flatMap((brand) => brand.sections.flatMap((section) => section.items))
      .find((entry) => entry.id === sku);
    return createElement(
      "output",
      { "data-ready": menu.ready, "data-loading": menu.loading },
      `${item?.name} · ${menu.message}`,
    );
  }
  return renderToString(createElement(QueryClientProvider, { client }, createElement(Probe)));
}

describe("server-rendered current public menu", () => {
  test("uses only the existing no-argument public read and strips private provider fields", async () => {
    const calls: {
      url: string;
      body: unknown;
      headers: Headers;
      cache: RequestCache | undefined;
    }[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
        headers: new Headers(init?.headers),
        cache: init?.cache,
      });
      return Response.json({
        ...initialMenu,
        tenantId: env.MEALDECK_TENANT_ID,
        orders: [{ email: "PRIVATE@invalid.example" }],
        items: [
          { ...initialMenu.items[0]!, internalCostPence: 30, privateField: "PRIVATE" },
          { ...initialMenu.items[0]!, sku: "unreviewed-private-dish", name: "PRIVATE DRAFT" },
        ],
      });
    }) as typeof fetch;
    const result = await readMealDeckMenuForRender(env, fetcher);
    expect(result).toEqual(initialMenu);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://menufixture.supabase.co/rest/v1/rpc/mealdeck_public_menu");
    expect(calls[0]!.body).toEqual({});
    expect(calls[0]!.headers.get("apikey")).toBe(env.MEALDECK_SUPABASE_PUBLISHABLE_KEY);
    expect(calls[0]!.cache).toBe("no-store");
    expect(JSON.stringify([...calls[0]!.headers])).not.toContain(env.MEALDECK_CHECKOUT_SERVER_KEY);
    for (const hidden of ["PRIVATE", "tenantId", "internalCostPence", env.MEALDECK_TENANT_ID])
      expect(JSON.stringify(result)).not.toContain(hidden);
  });

  test("missing configuration and an already-aborted page never query the backend", async () => {
    const unexpectedFetch = (() => {
      throw new Error("Unexpected backend read");
    }) as typeof fetch;
    expect(await readMealDeckMenuForRender({}, unexpectedFetch)).toBeNull();
    expect(await readMealDeckMenuForRender(env, unexpectedFetch, AbortSignal.abort())).toBeNull();
  });

  test("failed, malformed and rejected provider reads yield no initial menu", async () => {
    const cases = [
      async () => Response.json({ message: "PRIVATE" }, { status: 403 }),
      async () => Response.json({ available: true, checkedAt: "invalid", items: [] }),
      async () => {
        throw new Error("PRIVATE provider connection error");
      },
    ];
    for (const fetcher of cases)
      expect(await readMealDeckMenuForRender(env, fetcher as typeof fetch)).toBeNull();
  });

  test("a slow provider is aborted at the render deadline instead of continuing after fallback", async () => {
    let activeReads = 0;
    let aborted = false;
    const fetcher = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        activeReads++;
        const signal = init!.signal!;
        signal.addEventListener(
          "abort",
          () => {
            activeReads--;
            aborted = true;
            reject(signal.reason);
          },
          { once: true },
        );
      })) as typeof fetch;
    const started = Date.now();
    expect(await readMealDeckMenuForRender(env, fetcher)).toBeNull();
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(aborted).toBe(true);
    expect(activeReads).toBe(0);
  });

  test("leaving the page cancels its public read before the render deadline", async () => {
    const controller = new AbortController();
    let aborted = false;
    const fetcher = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(init!.signal!.reason);
          },
          { once: true },
        );
        controller.abort();
      })) as typeof fetch;
    const started = Date.now();
    expect(await readMealDeckMenuForRender(env, fetcher, controller.signal)).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
    expect(aborted).toBe(true);
  });
});

describe("rendered menu hydration and live browser readiness", () => {
  test("current menu names render before JavaScript, with selection disabled until client refresh", async () => {
    const client = new QueryClient();
    const rendered = renderMenu(client, initialMenu);
    expect(rendered).toContain("Royal Flush");
    expect(rendered).toContain('data-ready="false"');
    expect(rendered).toContain('data-loading="true"');
    expect(rendered).toContain("Checking today’s menu");

    let calls = 0;
    const observer = new QueryObserver(client, {
      ...mealDeckPublicMenuQueryOptions(initialMenu),
      queryFn: async () => {
        calls++;
        return initialMenu;
      },
    });
    expect(observer.getCurrentResult().isStale).toBe(true);
    const unsubscribe = observer.subscribe(() => {});
    // Subscription performs the ordinary client refresh immediately.
    expect(calls).toBe(1);
    await observer.refetch();
    expect(renderMenu(client, initialMenu)).toContain('data-ready="true"');
    unsubscribe();
    client.clear();
  });

  test("an existing newer browser menu wins over an older page-render snapshot", () => {
    const client = new QueryClient();
    const updated = {
      ...initialMenu,
      checkedAt: "2026-11-07T17:01:00.000Z",
      items: [{ ...initialMenu.items[0]!, name: "Kitchen's latest dish name" }],
    };
    client.setQueryData(mealDeckPublicMenuQueryOptions().queryKey, updated);
    const rendered = renderMenu(client, initialMenu);
    expect(rendered).toContain("Kitchen&#x27;s latest dish name");
    expect(rendered).not.toContain("Royal Flush");
    expect(rendered).toContain('data-ready="true"');
    expect(client.getQueryData(mealDeckPublicMenuQueryOptions().queryKey)).toEqual(updated);
    client.clear();
  });

  test("failed client refresh retains readable menu text without enabling selections", async () => {
    const client = new QueryClient();
    const observer = new QueryObserver(client, {
      ...mealDeckPublicMenuQueryOptions(initialMenu),
      retry: false,
      queryFn: async () => {
        throw new Error("Menu temporarily unavailable");
      },
    });
    await observer.refetch();
    const rendered = renderMenu(client, initialMenu);
    expect(rendered).toContain("Royal Flush");
    expect(rendered).toContain('data-ready="false"');
    expect(rendered).toContain("Menu updates are temporarily unavailable");
    client.clear();
  });
});
