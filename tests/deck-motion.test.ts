import { describe, expect, test } from "bun:test";
import { createElement, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  observeDeckMotion,
  useDeckMotion,
  type DeckMotionState,
} from "../src/hooks/use-deck-motion";

class TrackedTarget extends EventTarget {
  readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  readonly subscriptions: {
    type: string;
    options: boolean | AddEventListenerOptions | undefined;
  }[] = [];

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (listener) {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
      this.subscriptions.push({ type, options });
    }
    super.addEventListener(type, listener, options);
  }

  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    if (listener) this.listeners.get(type)?.delete(listener);
    super.removeEventListener(type, listener, options);
  }

  get listenerCount() {
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0);
  }
}

class FakeMediaQuery extends TrackedTarget {
  constructor(public matches: boolean) {
    super();
  }

  change(matches: boolean) {
    this.matches = matches;
    this.dispatchEvent(new Event("change"));
  }
}

function fixture(
  options: { simple?: boolean; observer?: boolean; viewport?: boolean; scale?: number } = {},
) {
  const reduced = new FakeMediaQuery(false);
  const simple = new FakeMediaQuery(options.simple ?? true);
  const viewport = Object.assign(new TrackedTarget(), { scale: options.scale ?? 1 });
  const document = Object.assign(new TrackedTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });
  const stage = {} as Element;
  const observed: Element[] = [];
  const queries: string[] = [];
  const updates: DeckMotionState[] = [];
  let observerCallback: IntersectionObserverCallback | undefined;
  let observerInstance: IntersectionObserver;
  let disconnects = 0;

  class FakeObserver {
    constructor(callback: IntersectionObserverCallback) {
      observerCallback = callback;
      observerInstance = this as unknown as IntersectionObserver;
    }

    observe(target: Element) {
      observed.push(target);
    }

    disconnect() {
      disconnects++;
    }
  }

  const browserWindow = {
    matchMedia(query: string) {
      queries.push(query);
      if (query === "(prefers-reduced-motion: reduce)") return reduced;
      if (query === "(max-width: 820px), (pointer: coarse)") return simple;
      throw new Error(`Unexpected media query: ${query}`);
    },
    visualViewport: options.viewport === false ? null : viewport,
    ...(options.observer === false ? {} : { IntersectionObserver: FakeObserver }),
  } as unknown as NonNullable<Parameters<typeof observeDeckMotion>[2]>;

  const cleanup = observeDeckMotion(stage, (state) => updates.push(state), browserWindow, document);

  return {
    reduced,
    simple,
    viewport,
    document,
    stage,
    observed,
    queries,
    updates,
    cleanup,
    get disconnects() {
      return disconnects;
    },
    intersect(isIntersecting: boolean) {
      observerCallback?.(
        [{ target: stage, isIntersecting } as IntersectionObserverEntry],
        observerInstance,
      );
    },
    visibility(visibilityState: DocumentVisibilityState) {
      document.visibilityState = visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    },
    zoom(scale: number) {
      viewport.scale = scale;
      viewport.dispatchEvent(new Event("resize"));
    },
    touch(type: string, count: number) {
      const event = new Event(type, { cancelable: true });
      Object.defineProperty(event, "touches", { value: Array.from({ length: count }, () => ({})) });
      document.dispatchEvent(event);
      return event;
    },
  };
}

describe("deck motion lifecycle", () => {
  test("server rendering starts static without accessing browser globals", () => {
    function Probe() {
      const stage = useRef<HTMLElement>(null);
      const motion = useDeckMotion(stage);
      return createElement("span", {
        "data-animate": motion.canAnimate,
        "data-simple": motion.simplifiedMotion,
      });
    }

    expect(renderToStaticMarkup(createElement(Probe))).toBe(
      '<span data-animate="false" data-simple="true"></span>',
    );
  });

  test("starts static and pauses immediately when the stage leaves the viewport", () => {
    const f = fixture();
    expect(f.observed).toEqual([f.stage]);
    expect(f.updates).toEqual([]);
    f.intersect(true);
    f.intersect(false);
    f.intersect(true);
    expect(f.updates).toEqual([
      { canAnimate: true, simplifiedMotion: true },
      { canAnimate: false, simplifiedMotion: true },
      { canAnimate: true, simplifiedMotion: true },
    ]);
    f.cleanup();
  });

  test("visibility and reduced motion each pause the deck and both must allow a resume", () => {
    const f = fixture();
    f.intersect(true);
    f.visibility("hidden");
    expect(f.updates.at(-1)?.canAnimate).toBe(false);
    f.reduced.change(true);
    f.visibility("visible");
    expect(f.updates).toHaveLength(2);
    f.reduced.change(false);
    expect(f.updates.at(-1)?.canAnimate).toBe(true);
    f.reduced.change(true);
    expect(f.updates.at(-1)?.canAnimate).toBe(false);
    f.intersect(false);
    f.reduced.change(false);
    expect(f.updates).toHaveLength(4);
    f.cleanup();
  });

  test("pinch scale pauses above 1.01 and duplicate viewport events do not emit", () => {
    const f = fixture();
    f.intersect(true);
    f.zoom(1.01);
    expect(f.updates).toHaveLength(1);
    f.zoom(1.0101);
    expect(f.updates.at(-1)?.canAnimate).toBe(false);
    for (const scale of [1.1, 1.5, 2, 3, 2, 1.02]) f.zoom(scale);
    expect(f.updates).toHaveLength(2);
    f.zoom(1);
    expect(f.updates.at(-1)?.canAnimate).toBe(true);
    for (let i = 0; i < 20; i++) {
      f.zoom(1);
      f.intersect(true);
      f.visibility("visible");
      f.reduced.change(false);
      f.simple.change(true);
    }
    expect(f.updates).toHaveLength(3);
    f.cleanup();
  });

  test("keeps invalid or already zoomed viewport scales static", () => {
    const f = fixture({ scale: 2 });
    f.intersect(true);
    expect(f.updates).toEqual([]);
    for (const scale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) f.zoom(scale);
    expect(f.updates).toEqual([]);
    f.zoom(1);
    expect(f.updates.at(-1)?.canAnimate).toBe(true);
    f.cleanup();
  });

  test("the lightweight media query can change independently of animation permission", () => {
    const f = fixture({ simple: false });
    expect(f.queries).toEqual([
      "(prefers-reduced-motion: reduce)",
      "(max-width: 820px), (pointer: coarse)",
    ]);
    expect(f.updates).toEqual([{ canAnimate: false, simplifiedMotion: false }]);
    f.intersect(true);
    f.simple.change(true);
    expect(f.updates.at(-1)).toEqual({ canAnimate: true, simplifiedMotion: true });
    f.simple.change(true);
    expect(f.updates).toHaveLength(3);
    f.visibility("hidden");
    f.simple.change(false);
    expect(f.updates.at(-1)).toEqual({ canAnimate: false, simplifiedMotion: false });
    f.cleanup();
  });

  test("passive two-finger listeners pause before zoom without cancelling gestures", () => {
    const f = fixture();
    f.intersect(true);
    expect(f.touch("touchstart", 1).defaultPrevented).toBe(false);
    expect(f.updates).toHaveLength(1);
    expect(f.touch("touchstart", 2).defaultPrevented).toBe(false);
    expect(f.updates.at(-1)?.canAnimate).toBe(false);
    f.zoom(2);
    f.touch("touchend", 1);
    expect(f.updates).toHaveLength(2);
    f.zoom(1);
    expect(f.updates.at(-1)?.canAnimate).toBe(true);
    f.touch("touchstart", 2);
    f.touch("touchcancel", 0);
    expect(f.updates.at(-1)?.canAnimate).toBe(true);
    for (const type of ["touchstart", "touchend", "touchcancel"]) {
      expect(
        f.document.subscriptions.find((subscription) => subscription.type === type)?.options,
      ).toEqual({ passive: true });
    }
    expect(f.viewport.subscriptions[0]?.options).toEqual({ passive: true });
    f.cleanup();
  });

  test("a hidden tab clears interrupted touch state before returning", () => {
    const f = fixture();
    f.intersect(true);
    f.touch("touchstart", 2);
    f.visibility("hidden");
    f.visibility("visible");
    expect(f.updates.at(-1)?.canAnimate).toBe(true);
    f.cleanup();
  });

  test("missing observers degrade to static and missing visualViewport permits ordinary animation", () => {
    const unobserved = fixture({ observer: false });
    unobserved.zoom(1);
    unobserved.reduced.change(false);
    expect(unobserved.observed).toEqual([]);
    expect(unobserved.updates).toEqual([]);
    unobserved.cleanup();
    const noViewport = fixture({ viewport: false });
    noViewport.intersect(true);
    expect(noViewport.updates.at(-1)?.canAnimate).toBe(true);
    noViewport.cleanup();
  });

  test("cleanup removes every subscription and ignores late observer notifications", () => {
    const f = fixture();
    f.intersect(true);
    expect(f.document.listenerCount).toBe(4);
    expect(f.viewport.listenerCount).toBe(1);
    expect(f.reduced.listenerCount).toBe(1);
    expect(f.simple.listenerCount).toBe(1);
    f.cleanup();
    expect(f.disconnects).toBe(1);
    expect(f.document.listenerCount).toBe(0);
    expect(f.viewport.listenerCount).toBe(0);
    expect(f.reduced.listenerCount).toBe(0);
    expect(f.simple.listenerCount).toBe(0);
    f.intersect(false);
    f.zoom(2);
    f.visibility("hidden");
    f.reduced.change(true);
    f.simple.change(false);
    f.touch("touchstart", 2);
    expect(f.updates).toEqual([{ canAnimate: true, simplifiedMotion: true }]);
  });
});
