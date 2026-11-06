import { describe, expect, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LaunchBasketFeedback } from "../src/components/menus/launch-basket-feedback";
import { LaunchBasketDock } from "../src/components/menus/launch-basket";
import { LaunchMenuAppNav } from "../src/components/menus/launch-menu-app-nav";

function feedback(overrides: Partial<ComponentProps<typeof LaunchBasketFeedback>> = {}) {
  return renderToStaticMarkup(
    createElement(LaunchBasketFeedback, {
      update: { message: "Pepsi added to your basket." },
      dialogOpen: false,
      canUndo: false,
      onUndo: () => {},
      onDismiss: () => {},
      onExpire: () => {},
      ...overrides,
    }),
  );
}

describe("one basket opener with separate change feedback", () => {
  test("add/remove confirmation is announced without another View basket action", () => {
    for (const message of ["Pepsi added to your basket.", "Pepsi removed from your basket."]) {
      const html = feedback({ update: { message } });
      expect(html).toContain('role="status" aria-live="polite" aria-atomic="true"');
      expect(html).toContain(message);
      expect(html).toContain('data-feedback-kind="routine"');
      expect(html).toContain('aria-label="Dismiss basket update"');
      expect(html.match(/<button\b/g)).toHaveLength(1);
      expect(html).not.toContain("View basket");
      expect(html).not.toContain("Undo");
    }
  });

  test("empty-basket recovery keeps an explicit Undo and dismiss action", () => {
    const html = feedback({ update: { message: "Basket emptied." }, canUndo: true });
    expect(html).toContain("Basket emptied.");
    expect(html).toContain('data-feedback-kind="persistent"');
    expect(html).toContain("Undo");
    expect(html).toContain('aria-label="Dismiss basket update"');
    expect(html.match(/<button\b/g)).toHaveLength(2);
    expect(html).not.toContain("View basket");
  });

  test("saving warnings remain readable and dismissible without a duplicate opener", () => {
    const html = feedback({
      update: { message: "Your basket is still here for this visit.", tone: "info" },
    });
    expect(html).toContain("Your basket is still here for this visit.");
    expect(html).toContain('data-feedback-kind="persistent"');
    expect(html).toContain('aria-label="Dismiss basket update"');
    expect(html).not.toContain("View basket");
  });

  test("a basket or customiser dialog suppresses background feedback", () => {
    for (const overrides of [{ dialogOpen: true }, { update: null }]) {
      const html = feedback(overrides);
      expect(html).not.toContain('aria-label="Basket update"');
      expect(html).not.toContain("Pepsi added");
      expect(html).not.toContain("<button");
    }
  });

  test("desktop dock keeps the real count and hides while a dialog owns the screen", () => {
    const closed = renderToStaticMarkup(
      createElement(LaunchBasketDock, { count: 3, dialogOpen: false, onOpen: () => {} }),
    );
    expect(closed).toContain('aria-label="View basket, 3 selections"');
    expect(closed).toContain('aria-haspopup="dialog" aria-expanded="false"');
    expect(closed).toContain("Ordering coming soon");
    expect(closed).not.toContain('class="lmb-dock" hidden');

    const open = renderToStaticMarkup(
      createElement(LaunchBasketDock, { count: 3, dialogOpen: true, onOpen: () => {} }),
    );
    expect(open).toContain('class="lmb-dock" hidden=""');
  });

  test("routine desktop confirmation reuses the dock and keeps its full accessible message", () => {
    const message = "A very long burger name with its meal and shared extras added to your basket.";
    const html = renderToStaticMarkup(
      createElement(LaunchBasketDock, {
        count: 3,
        dialogOpen: false,
        feedbackMessage: message,
        onOpen: () => {},
      }),
    );
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).toContain('aria-label="View basket, 3 selections"');
    const descriptionId = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(descriptionId).toBeTruthy();
    expect(html).toContain(`id="${descriptionId}" data-basket-update="true"`);
    expect(html).toContain(`title="${message}"`);
    expect(html).toContain(`>${message}</small>`);
    expect(html).not.toContain("Ordering coming soon");
    // The shared feedback live region announces this once; the dock is a description.
    expect(html).not.toContain("aria-live");
  });

  test("mobile navigation has one basket tab and yields to the open dialog", () => {
    const renderNav = (dialogOpen: boolean) =>
      renderToStaticMarkup(
        createElement(LaunchMenuAppNav, {
          brands: [],
          brandId: undefined,
          count: 3,
          basketOpen: dialogOpen,
          dialogOpen,
          onMenus: () => {},
          onBrand: () => {},
          onBasket: () => {},
        }),
      );
    const closed = renderNav(false);
    expect(closed.match(/aria-label="View basket, 3 selections"/g)).toHaveLength(1);
    expect(closed.match(/<button\b/g)).toHaveLength(4);
    expect(closed).not.toContain('aria-label="Menu navigation" hidden');
    expect(renderNav(true)).toContain('aria-label="Menu navigation" hidden=""');
  });
});
