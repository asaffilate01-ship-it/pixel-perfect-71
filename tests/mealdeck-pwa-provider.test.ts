import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Script, createContext } from "node:vm";
import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from "typescript";
import type { MealDeckPwaState } from "../src/lib/mealdeck-pwa-context";
import { mealDeckPwaSurface } from "../src/lib/mealdeck-pwa-surface";

const providerSource = readFileSync(
  new URL("../src/components/pwa-provider.tsx", import.meta.url),
  "utf8",
);
const providerCode = transpileModule(providerSource, {
  compilerOptions: {
    module: ModuleKind.CommonJS,
    target: ScriptTarget.ES2022,
    jsx: JsxEmit.ReactJSX,
  },
}).outputText;

class TrackedEvents extends EventTarget {
  readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (listener) {
      const group = this.listeners.get(type) ?? new Set();
      group.add(listener);
      this.listeners.set(type, group);
    }
    super.addEventListener(type, listener);
  }

  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (listener) this.listeners.get(type)?.delete(listener);
    super.removeEventListener(type, listener);
  }

  get listenerCount() {
    return [...this.listeners.values()].reduce((count, group) => count + group.size, 0);
  }
}

class Worker extends TrackedEvents {
  state = "installing";
  readonly messages: unknown[] = [];
  rejectMessages = false;

  postMessage(message: unknown) {
    if (this.rejectMessages) throw new Error("Worker has become redundant");
    this.messages.push(message);
  }
}

/** Run the shipped provider with browser event targets and a minimal React hook
 * host. No real browser, service worker, network or global mocks are used. */
function provider(
  options: {
    phase?: "idle" | "installing" | "waiting";
    deferRegistration?: boolean;
    legacyStandalone?: boolean;
    pathname?: string;
  } = {},
) {
  const worker = new Worker();
  if (options.phase === "waiting") worker.state = "installed";
  const registration = Object.assign(new TrackedEvents(), {
    installing: options.phase === "installing" ? worker : (null as Worker | null),
    waiting: options.phase === "waiting" ? worker : (null as Worker | null),
  });
  let finishRegistration: (value: typeof registration) => void = () => undefined;
  const result = options.deferRegistration
    ? new Promise<typeof registration>((resolve) => {
        finishRegistration = resolve;
      })
    : Promise.resolve(registration);
  const workers = Object.assign(new TrackedEvents(), {
    controller: {},
    registrations: [] as { url: string; scope: string }[],
    register: (url: string, options: { scope: string }) => {
      workers.registrations.push({ url, scope: options.scope });
      return result;
    },
  });
  const standalone = Object.assign(new TrackedEvents(), { matches: false });
  let reloads = 0;
  const window = Object.assign(new TrackedEvents(), {
    isSecureContext: true,
    matchMedia: () => standalone,
    location: {
      reload: () => {
        reloads++;
      },
    },
  });
  const navigator = {
    onLine: true,
    standalone: options.legacyStandalone ?? false,
    serviceWorker: workers,
  };

  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const effects: (() => () => void)[] = [];
  let stateIndex = 0,
    refIndex = 0,
    effectIndex = 0;
  let latest: MealDeckPwaState;
  const contextProvider = {};
  const exports = {} as { PwaProvider: (props: { children: null }) => unknown };
  const context = createContext({
    exports,
    window,
    navigator,
    require: (name: string) => {
      if (name === "@tanstack/react-router")
        return {
          useRouterState: ({
            select,
          }: {
            select: (state: { location: { pathname: string } }) => unknown;
          }) => select({ location: { pathname: options.pathname ?? "/menus" } }),
        };
      if (name.includes("mealdeck-pwa-surface")) return { mealDeckPwaSurface };
      if (name === "react")
        return {
          useState: (initial: unknown) => {
            const index = stateIndex++;
            if (index === states.length) states.push(initial);
            return [
              states[index],
              (next: unknown) => {
                states[index] = next;
              },
            ];
          },
          useRef: (initial: unknown) => {
            const index = refIndex++;
            if (index === refs.length) refs.push({ current: initial });
            return refs[index];
          },
          useEffect: (effect: () => () => void) => {
            if (effectIndex++ === effects.length) effects.push(effect);
          },
        };
      if (name === "react/jsx-runtime")
        return {
          jsx: (type: unknown, props: { value?: MealDeckPwaState }) => {
            if (type === contextProvider && props.value) latest = props.value;
            return null;
          },
        };
      if (name.includes("mealdeck-pwa-context"))
        return { PwaContext: { Provider: contextProvider } };
      return {};
    },
  });
  new Script(providerCode, { filename: "src/components/pwa-provider.tsx" }).runInContext(context);
  function snapshot() {
    stateIndex = refIndex = effectIndex = 0;
    exports.PwaProvider({ children: null });
    return latest;
  }
  snapshot();
  const cleanups = effects.map((effect) => effect());
  return {
    snapshot,
    worker,
    registration,
    workers,
    window,
    standalone,
    finishRegistration: () => finishRegistration(registration),
    unmount: () => cleanups.forEach((cleanup) => cleanup()),
    get reloads() {
      return reloads;
    },
  };
}

describe("MealDeck PWA provider lifecycle", () => {
  test("registers distinct customer, kitchen and printer workers with bounded staff scopes", async () => {
    for (const [pathname, url, scope] of [
      ["/menus", "/sw.js", "/"],
      ["/kds", "/kds-sw.js", "/kds"],
      ["/printer", "/printer-sw.js", "/printer"],
    ]) {
      const p = provider({ pathname });
      await Promise.resolve();
      expect(p.workers.registrations).toEqual([{ url, scope }]);
      p.unmount();
      expect(p.workers.listenerCount).toBe(0);
    }
  });
  test("observes an update already installing when registration resolves", async () => {
    const p = provider({ phase: "installing" });
    await Promise.resolve();
    expect(p.snapshot().updateReady).toBe(false);
    p.registration.installing = null;
    p.registration.waiting = p.worker;
    p.worker.state = "installed";
    p.worker.dispatchEvent(new Event("statechange"));
    expect(p.snapshot().updateReady).toBe(true);
    p.unmount();
  });

  test("observes a later updatefound and removes terminal worker listeners", async () => {
    const p = provider();
    await Promise.resolve();
    p.registration.installing = p.worker;
    p.registration.dispatchEvent(new Event("updatefound"));
    p.registration.installing = null;
    p.registration.waiting = p.worker;
    p.worker.state = "installed";
    p.worker.dispatchEvent(new Event("statechange"));
    expect(p.snapshot().updateReady).toBe(true);
    p.worker.state = "redundant";
    p.registration.waiting = null;
    p.worker.dispatchEvent(new Event("statechange"));
    expect(p.snapshot().updateReady).toBe(false);
    expect(p.worker.listenerCount).toBe(0);
    p.unmount();
  });

  test("another tab's activation clears its waiting notice without reloading", async () => {
    const p = provider({ phase: "waiting" });
    await Promise.resolve();
    expect(p.snapshot().updateReady).toBe(true);
    p.registration.waiting = null;
    p.workers.dispatchEvent(new Event("controllerchange"));
    expect(p.snapshot().updateReady).toBe(false);
    expect(p.reloads).toBe(0);
    p.unmount();
  });

  test("a stale update click clears the notice without sending or reloading", async () => {
    const p = provider({ phase: "waiting" });
    await Promise.resolve();
    p.registration.waiting = null;
    p.snapshot().update();
    expect(p.snapshot().updateReady).toBe(false);
    expect(p.worker.messages).toHaveLength(0);
    p.workers.dispatchEvent(new Event("controllerchange"));
    expect(p.reloads).toBe(0);
    p.unmount();
  });

  test("an explicit update activates the waiting worker and reloads its page once", async () => {
    const p = provider({ phase: "waiting" });
    await Promise.resolve();
    p.snapshot().update();
    expect(p.worker.messages).toEqual([{ type: "MEALDECK_ACTIVATE_UPDATE" }]);
    expect(p.reloads).toBe(0);
    p.registration.waiting = null;
    p.workers.dispatchEvent(new Event("controllerchange"));
    p.workers.dispatchEvent(new Event("controllerchange"));
    expect(p.reloads).toBe(1);
    expect(p.snapshot().updateReady).toBe(false);
    p.unmount();
  });

  test("a worker superseded before postMessage cannot trigger a later reload", async () => {
    const p = provider({ phase: "waiting" });
    await Promise.resolve();
    p.worker.rejectMessages = true;
    p.snapshot().update();
    expect(p.snapshot().updateReady).toBe(false);
    p.registration.waiting = null;
    p.workers.dispatchEvent(new Event("controllerchange"));
    expect(p.reloads).toBe(0);
    p.unmount();
  });

  test("unmount removes registration, worker, media and window listeners", async () => {
    const p = provider({ phase: "installing" });
    await Promise.resolve();
    expect(p.registration.listenerCount).toBe(1);
    expect(p.worker.listenerCount).toBe(1);
    p.unmount();
    for (const target of [p.registration, p.worker, p.workers, p.window, p.standalone]) {
      expect(target.listenerCount).toBe(0);
    }
  });

  test("registration resolving after unmount cannot attach new listeners", async () => {
    const p = provider({ phase: "installing", deferRegistration: true });
    p.unmount();
    p.finishRegistration();
    await Promise.resolve();
    expect(p.registration.listenerCount).toBe(0);
    expect(p.worker.listenerCount).toBe(0);
  });

  test("recognises iOS standalone and observes display mode changes", () => {
    const ios = provider({ legacyStandalone: true });
    expect(ios.snapshot().installed).toBe(true);
    ios.unmount();
    const browser = provider();
    expect(browser.snapshot().installed).toBe(false);
    browser.standalone.matches = true;
    browser.standalone.dispatchEvent(new Event("change"));
    expect(browser.snapshot().installed).toBe(true);
    browser.unmount();
  });
});
