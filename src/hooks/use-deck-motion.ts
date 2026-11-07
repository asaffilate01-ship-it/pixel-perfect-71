import { useEffect, useState, type RefObject } from "react";

export type DeckMotionState = { canAnimate: boolean; simplifiedMotion: boolean };

// Start with a single static face on the server and on the first client render.
const initialState: DeckMotionState = { canAnimate: false, simplifiedMotion: true };

type MotionWindow = Pick<Window, "matchMedia" | "visualViewport"> & {
  IntersectionObserver?: typeof IntersectionObserver;
};
type MotionDocument = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>;

/** Event subscription kept separate so pause and cleanup can be tested without a browser. */
export function observeDeckMotion(
  stage: Element,
  onChange: (state: DeckMotionState) => void,
  browserWindow: MotionWindow = window,
  browserDocument: MotionDocument = document,
) {
  const reduced = browserWindow.matchMedia("(prefers-reduced-motion: reduce)");
  const simple = browserWindow.matchMedia("(max-width: 820px), (pointer: coarse)");
  const viewport = browserWindow.visualViewport;
  let visible = false;
  let multiTouch = false;
  let disposed = false;
  let previous = initialState;

  const publish = () => {
    if (disposed) return;
    const scale = viewport?.scale ?? 1;
    const next = {
      canAnimate:
        visible &&
        browserDocument.visibilityState === "visible" &&
        !reduced.matches &&
        !multiTouch &&
        Number.isFinite(scale) &&
        scale > 0 &&
        scale <= 1.01,
      simplifiedMotion: simple.matches,
    };
    // Pinch zoom can emit many resize events. Only boolean transitions render
    // React, and pausing is immediate even when the tab has stopped RAF work.
    if (
      next.canAnimate === previous.canAnimate &&
      next.simplifiedMotion === previous.simplifiedMotion
    )
      return;
    previous = next;
    onChange(next);
  };
  const onTouch = (event: Event) => {
    multiTouch = (event as TouchEvent).touches.length > 1;
    publish();
  };
  const onVisibility = () => {
    if (browserDocument.visibilityState !== "visible") multiTouch = false;
    publish();
  };
  const observer = browserWindow.IntersectionObserver
    ? new browserWindow.IntersectionObserver(([entry]) => {
        visible = !!entry?.isIntersecting;
        publish();
      })
    : null;

  // Without IntersectionObserver, keep the decorative deck static.
  observer?.observe(stage);
  reduced.addEventListener("change", publish);
  simple.addEventListener("change", publish);
  viewport?.addEventListener("resize", publish, { passive: true });
  browserDocument.addEventListener("visibilitychange", onVisibility);
  for (const name of ["touchstart", "touchend", "touchcancel"]) {
    browserDocument.addEventListener(name, onTouch, { passive: true });
  }
  publish();

  return () => {
    disposed = true;
    observer?.disconnect();
    reduced.removeEventListener("change", publish);
    simple.removeEventListener("change", publish);
    viewport?.removeEventListener("resize", publish);
    browserDocument.removeEventListener("visibilitychange", onVisibility);
    for (const name of ["touchstart", "touchend", "touchcancel"]) {
      browserDocument.removeEventListener(name, onTouch);
    }
  };
}

export function useDeckMotion(stage: RefObject<HTMLElement | null>): DeckMotionState {
  const [motion, setMotion] = useState(initialState);
  useEffect(() => {
    if (!stage.current) return;
    return observeDeckMotion(stage.current, setMotion);
  }, [stage]);
  return motion;
}
