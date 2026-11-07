import assert from "node:assert/strict";
import { register } from "node:module";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

// Run with --conditions=development so TanStack uses runtime server detection
// instead of Node's server-only export, which deliberately disables navigate().
// Vite normally turns these imports into URLs. Keep the real root/providers
// in this Node regression test; only non-JavaScript assets need an adapter.
register(
  `data:text/javascript,${encodeURIComponent(`
    export async function load(url, context, nextLoad) {
      if (/\\.(?:css|png|jpe?g|webp|svg)(?:\\?.*)?$/.test(url)) {
        return { format: "module", source: "export default " + JSON.stringify(url), shortCircuit: true };
      }
      return nextLoad(url, context);
    }
  `)}`,
  import.meta.url,
);
const { Route: mealDeckRoot } = await import("../src/routes/__root");
const { useArcadeProgress } = await import("../src/components/play/arcade-progress");

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function ArcadeConsumer() {
  const { progress } = useArcadeProgress();
  return <h1>Arcade ready: {progress.rounds.length} completed rounds</h1>;
}

function createHarness(initialPath: string) {
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    // Exercise the production root's actual provider ancestry, not a copy of it.
    component: mealDeckRoot.options.component,
    errorComponent: mealDeckRoot.options.errorComponent,
  });
  const gates = new Map<
    string,
    { entered: ReturnType<typeof deferred>; ready: ReturnType<typeof deferred> }
  >();
  const load = async (path: string) => {
    const gate = gates.get(path);
    if (gate) {
      gate.entered.resolve();
      await gate.ready.promise;
    }
  };
  const play = createRoute({
    getParentRoute: () => root,
    path: "/play",
    loader: () => load("/play"),
    component: ArcadeConsumer,
  });
  const game = createRoute({
    getParentRoute: () => root,
    path: "/play/feast-2048",
    loader: () => load("/play/feast-2048"),
    component: ArcadeConsumer,
  });
  const offers = createRoute({
    getParentRoute: () => root,
    path: "/offers",
    loader: () => load("/offers"),
    component: () => <h1>Offers ready</h1>,
  });
  const failed = createRoute({
    getParentRoute: () => root,
    path: "/failed",
    loader: () => {
      throw new Error("Genuine route failure");
    },
    component: () => <h1>Must not render</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([play, game, offers, failed]),
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    origin: "https://mealdeck.co.uk",
    isServer: false,
    defaultPendingMs: 250,
    defaultPendingMinMs: 0,
  });

  function html() {
    // Render the real client transaction's current match tree without mounting
    // browser effects. In particular, retain its incoming location and outgoing
    // matches: this mismatch is the state that caused the production flash.
    const wasServer = router.isServer;
    router.update({ isServer: true });
    try {
      return renderToStaticMarkup(<RouterProvider router={router} />);
    } finally {
      router.update({ isServer: wasServer });
    }
  }

  async function begin(to: "/play" | "/play/feast-2048" | "/offers") {
    const gate = { entered: deferred(), ready: deferred() };
    gates.set(to, gate);
    const navigation = router.navigate({ to });
    await gate.entered.promise;
    return {
      async finish() {
        gates.delete(to);
        gate.ready.resolve();
        await navigation;
      },
    };
  }

  return { router, html, begin };
}

describe("MealDeck arcade navigation", { timeout: 5000 }, () => {
  for (const from of ["/play", "/play/feast-2048"]) {
    test(`retains arcade context while leaving ${from} for a delayed page`, async () => {
      const { router, html, begin } = createHarness(from);
      await router.load();
      assert.match(html(), /Arcade ready/);

      const navigation = await begin("/offers");
      try {
        assert.equal(router.state.location.pathname, "/offers");
        assert.equal(router.state.matches.at(-1)?.pathname, from);
        const pendingHtml = html();
        assert.match(pendingHtml, /Arcade ready/);
        assert.doesNotMatch(pendingHtml, /Try again|didn.t load|Offers ready/);
      } finally {
        await navigation.finish();
      }

      assert.match(html(), /Offers ready/);
      assert.doesNotMatch(html(), /Try again|didn.t load/);
    });
  }

  test("can enter Play, leave it, and return to its cached route without losing context", async () => {
    const { router, html, begin } = createHarness("/offers");
    await router.load();

    const entry = await begin("/play");
    assert.equal(router.state.location.pathname, "/play");
    assert.equal(router.state.matches.at(-1)?.pathname, "/offers");
    assert.match(html(), /Offers ready/);
    await entry.finish();
    assert.match(html(), /Arcade ready/);

    await router.navigate({ to: "/offers" });
    assert.match(html(), /Offers ready/);
    await router.navigate({ to: "/play" });
    assert.match(html(), /Arcade ready/);
    assert.doesNotMatch(html(), /Try again|didn.t load/);
  });

  test("a genuine loader failure remains visible after navigation", async () => {
    const { router, html } = createHarness("/play");
    await router.load();
    await router.navigate({ to: "/failed" });
    const failedHtml = html();
    assert.equal(router.state.matches.at(-1)?.status, "error");
    assert.match(failedHtml, /Something went wrong!/);
    assert.match(failedHtml, /Genuine route failure/);
    assert.doesNotMatch(failedHtml, /Arcade ready|Must not render/);
  });
});
