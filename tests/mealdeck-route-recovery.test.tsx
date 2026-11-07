import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { MealDeckPageLoading } from "../src/components/mealdeck-page-loading";
import { isRouteAssetError, recoverMealDeckRoute } from "../src/lib/mealdeck-route-recovery";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

describe("MealDeck navigation recovery", () => {
  for (const [browser, message] of [
    [
      "Chrome",
      "Failed to fetch dynamically imported module: https://mealdeck.co.uk/assets/menus-old.js",
    ],
    [
      "Firefox",
      "error loading dynamically imported module: https://mealdeck.co.uk/assets/play-old.js",
    ],
    ["Safari", "Importing a module script failed."],
    ["Vite CSS", "Unable to preload CSS for /assets/menu-old.css"],
  ]) {
    test(`${browser} asset failure refreshes the document without invalidating the failed route`, async () => {
      const error = new TypeError(message);
      assert.equal(isRouteAssetError(error), true);
      const calls: string[] = [];
      await recoverMealDeckRoute(error, {
        invalidate: async () => {
          calls.push("invalidate");
        },
        reset: () => calls.push("reset"),
        reload: () => calls.push("reload"),
      });
      assert.deepEqual(calls, ["reload"]);
    });
  }

  test("recognises a cross-realm error without requiring the local Error prototype", () => {
    const error: unknown = runInNewContext('new TypeError("Importing a module script failed.")');
    assert.equal(error instanceof Error, false);
    assert.equal(isRouteAssetError(error), true);
  });

  test("ordinary network, application and malformed errors never request an asset refresh", () => {
    const errors: unknown[] = [
      new TypeError("Failed to fetch"),
      new Error("Menu updates are unavailable."),
      new Error("Cannot read properties of undefined (reading 'items')"),
      new Error("HTTPError"),
      new Error("The API reported: Unable to preload CSS for /assets/example.css"),
      new Response(null, { status: 503 }),
      "Failed to fetch dynamically imported module: /assets/example.js",
      null,
      undefined,
      503,
      {},
      { message: null },
      { message: 503 },
    ];
    for (const error of errors) {
      assert.equal(isRouteAssetError(error), false, String(error));
    }
  });

  test("keeps the error boundary in place until the replacement route load settles", async () => {
    const nextLoad = deferred<void>();
    const calls: string[] = [];
    const recovery = recoverMealDeckRoute(new Error("Route unavailable"), {
      invalidate: () => {
        calls.push("invalidate");
        return nextLoad.promise;
      },
      reset: () => calls.push("reset"),
      reload: () => calls.push("reload"),
    });

    await Promise.resolve();
    assert.deepEqual(calls, ["invalidate"]);
    nextLoad.resolve();
    await recovery;
    assert.deepEqual(calls, ["invalidate", "reset"]);
  });

  test("a rejected replacement load preserves the error instead of resetting or reloading", async () => {
    const nextLoad = deferred<void>();
    const failure = new Error("Replacement load failed");
    const calls: string[] = [];
    const recovery = recoverMealDeckRoute(new Error("Route unavailable"), {
      invalidate: () => {
        calls.push("invalidate");
        return nextLoad.promise;
      },
      reset: () => calls.push("reset"),
      reload: () => calls.push("reload"),
    });

    const rejected = assert.rejects(recovery, (error: unknown) => error === failure);
    nextLoad.reject(failure);
    await rejected;
    assert.deepEqual(calls, ["invalidate"]);
  });

  test("a synchronous retry failure is also surfaced without clearing the boundary", async () => {
    const failure = new Error("Router unavailable");
    const calls: string[] = [];
    await assert.rejects(
      recoverMealDeckRoute(new Error("Route unavailable"), {
        invalidate: () => {
          calls.push("invalidate");
          throw failure;
        },
        reset: () => calls.push("reset"),
        reload: () => calls.push("reload"),
      }),
      (error: unknown) => error === failure,
    );
    assert.deepEqual(calls, ["invalidate"]);
  });

  test("loading UI renders without application providers and does not announce a failure", () => {
    const html = renderToStaticMarkup(<MealDeckPageLoading />);
    assert.match(html, /role="status"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /Loading your page/);
    assert.doesNotMatch(html, /Try again|Refresh page|didn.t load|not found|<button/);
  });

  test("TanStack retains real loader failures when a shared pending component is configured", async () => {
    const failure = new Error("Menu route cannot load");
    let shouldFail = true;
    const root = createRootRoute({ component: Outlet });
    const route = createRoute({
      getParentRoute: () => root,
      path: "menu-test",
      loader: () => {
        if (shouldFail) throw failure;
        return { ready: true };
      },
      component: () => <h1>Menu page ready</h1>,
      errorComponent: ({ error }) => <h1 role="alert">{error.message}</h1>,
    });
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ["/menu-test"] }),
      defaultPendingComponent: MealDeckPageLoading,
    });

    await router.load();
    const failedHtml = renderToStaticMarkup(<RouterProvider router={router} />);
    assert.match(failedHtml, /role="alert"/);
    assert.match(failedHtml, /Menu route cannot load/);
    assert.doesNotMatch(failedHtml, /Loading your page|Menu page ready/);

    shouldFail = false;
    let reset = false;
    await recoverMealDeckRoute(failure, {
      invalidate: () => router.invalidate(),
      reset: () => {
        reset = true;
      },
      reload: () => assert.fail("An ordinary loader failure must not reload the document"),
    });
    assert.equal(reset, true);
    const readyHtml = renderToStaticMarkup(<RouterProvider router={router} />);
    assert.match(readyHtml, /Menu page ready/);
    assert.doesNotMatch(readyHtml, /Menu route cannot load|Loading your page/);
  });
});
