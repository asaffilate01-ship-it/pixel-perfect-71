import { describe, expect, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KdsWorkspaceControls } from "../src/components/ops/kds-panel";
import {
  readKdsToolsPreference,
  saveKdsToolsPreference,
} from "../src/lib/mealdeck-kds-preferences";

function renderControls(overrides: Partial<ComponentProps<typeof KdsWorkspaceControls>> = {}) {
  return renderToStaticMarkup(
    createElement(KdsWorkspaceControls, {
      activeCount: 8,
      counts: { queued: 3, accepted: 2, preparing: 1, ready: 1, sealed: 1, done: 4 },
      filter: "all",
      query: "",
      fulfilment: "all",
      sort: "oldest",
      view: "tickets",
      visibleCount: 8,
      refreshing: false,
      refreshDisabled: false,
      soundEnabled: false,
      onFilterChange: () => {},
      onQueryChange: () => {},
      onFulfilmentChange: () => {},
      onSortChange: () => {},
      onViewChange: () => {},
      onRefresh: () => {},
      onClear: () => {},
      ...overrides,
    }),
  );
}

function visibleToolbar(html: string) {
  const collapsed = html.indexOf('hidden=""');
  expect(collapsed).toBeGreaterThan(0);
  return html.slice(0, collapsed);
}

describe("compact kitchen toolbar", () => {
  test("starts with tools collapsed while stage tabs, refresh and sound status stay visible", () => {
    const html = renderControls();
    const visible = visibleToolbar(html);
    expect(visible).toContain('aria-expanded="false"');
    const target = visible.match(/aria-controls="([^"]+)"/)?.[1];
    expect(target).toBeTruthy();
    expect(html).toContain(`id="${target}" hidden=""`);
    expect(visible).toContain("Show tools");
    expect(visible).toContain("Refresh kitchen orders");
    expect(visible).toContain("Sound off");
    expect(visible).toContain("active orders");
    expect(visible).not.toMatch(/<(input|select)\b/);
    expect(visible).toContain("Filter kitchen orders by stage");
    for (const [stage, label, count] of [
      ["all", "All active", 8],
      ["queued", "New", 3],
      ["accepted", "Accepted", 2],
      ["preparing", "Preparing", 1],
      ["ready", "Ready to pack", 1],
      ["sealed", "Ready for handover", 1],
      ["done", "Done", 4],
    ]) {
      const tab = visible.match(
        new RegExp(`<button[^>]*data-stage="${stage}"[^>]*>[\\s\\S]*?</button>`),
      )?.[0];
      expect(tab).toContain(String(label));
      expect(tab).toContain(`<strong>${count}</strong>`);
    }
    expect(html).toContain("Find an order, dish, brand, bag name, note or vehicle");
  });

  test("hiding tools cannot hide applied filters or their reset", () => {
    const visible = visibleToolbar(
      renderControls({
        filter: "preparing",
        fulfilment: "curbside",
        query: "MD1234",
        visibleCount: 1,
      }),
    );
    expect(visible).toContain("Stage: Preparing");
    expect(visible).toContain("Kerbside");
    expect(visible).toContain("MD1234");
    expect(visible).toContain("Clear filters");
    expect(visible).toContain("of 8");
  });

  test("completed history stays clearly read-only when the tools are hidden", () => {
    const visible = visibleToolbar(
      renderControls({ filter: "done", visibleCount: 4, sort: "newest" }),
    );
    expect(visible).toContain("Done · read-only");
    expect(visible).toContain("recent handovers");
    expect(visible).toContain("Latest handover");
    expect(visible).toContain("Clear filters");
    expect(visible).not.toMatch(/Accept order|Start prep|Print receipt|Mark done/);
  });
});

describe("kitchen toolbar preference", () => {
  test("defaults to compact when preferences are absent, invalid or unavailable", () => {
    for (const value of [null, "", "true", "{}", "closed"]) {
      expect(readKdsToolsPreference("kitchen-a", { getItem: () => value })).toBe(false);
    }
    expect(
      readKdsToolsPreference("kitchen-a", {
        getItem() {
          throw new Error("Browser storage is blocked");
        },
      }),
    ).toBe(false);
    expect(() =>
      saveKdsToolsPreference("kitchen-a", true, {
        setItem() {
          throw new Error("Browser storage is full");
        },
      }),
    ).not.toThrow();
  });

  test("remembers only open or closed for the selected kitchen", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    saveKdsToolsPreference("tenant-a:kitchen-a", true, storage);
    expect(readKdsToolsPreference("tenant-a:kitchen-a", storage)).toBe(true);
    expect(readKdsToolsPreference("tenant-b:kitchen-a", storage)).toBe(false);
    expect(readKdsToolsPreference("tenant-a:kitchen-b", storage)).toBe(false);
    expect([...values.values()]).toEqual(["open"]);
    saveKdsToolsPreference("tenant-a:kitchen-a", false, storage);
    expect(readKdsToolsPreference("tenant-a:kitchen-a", storage)).toBe(false);
    expect([...values.values()]).toEqual(["closed"]);
  });
});
