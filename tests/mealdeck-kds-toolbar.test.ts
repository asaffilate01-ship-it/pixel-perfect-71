import { describe, expect, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  KdsWorkspaceControls,
  KdsWorkspaceTools,
  OpsKdsPanel,
} from "../src/components/ops/kds-panel";
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

function kitchenNavigation(html: string) {
  const nav = html.match(/<nav[^>]*aria-label="Kitchen navigation"[^>]*>[\s\S]*?<\/nav>/)?.[0];
  expect(nav).toBeTruthy();
  return nav!;
}

function navigationButton(nav: string, label: string) {
  const found = nav.match(
    new RegExp(`<button[^>]*aria-label="${label}(?:, \\d+)?"[^>]*>[\\s\\S]*?</button>`),
  )?.[0];
  expect(found).toBeTruthy();
  return found!;
}

describe("standalone kitchen mobile navigation", () => {
  test("is opt-in so the embedded operations board does not add another navigation bar", () => {
    expect(renderControls()).not.toContain('aria-label="Kitchen navigation"');
    const html = renderControls({ mobileNavigation: true });
    const nav = kitchenNavigation(html);
    expect(nav.match(/<button\b/g)).toHaveLength(4);
    expect(navigationButton(nav, "Tickets")).toContain('aria-pressed="true"');
    expect(navigationButton(nav, "Tickets")).toContain('aria-label="Tickets, 8"');
    expect(navigationButton(nav, "Board")).not.toContain("disabled");
    expect(navigationButton(nav, "Tools")).toContain('aria-expanded="false"');
    expect(navigationButton(nav, "Tools")).toContain("aria-controls=");
    expect(navigationButton(nav, "Refresh")).not.toContain("disabled");

    const outsideTools = visibleToolbar(html);
    expect(outsideTools.match(/data-stage="/g)).toHaveLength(7);
    expect(outsideTools).toContain("Ready for handover");
    expect(outsideTools).toContain("Done");
  });

  test("board selection and hidden-filter counts reflect the current controlled state", () => {
    const html = renderControls({
      mobileNavigation: true,
      view: "stages",
      query: "Amer",
      fulfilment: "curbside",
      refreshDisabled: true,
    });
    const nav = kitchenNavigation(html);
    expect(navigationButton(nav, "Board")).toContain('aria-pressed="true"');
    expect(navigationButton(nav, "Tickets")).toContain('aria-pressed="false"');
    expect(navigationButton(nav, "Tools")).toContain('aria-label="Tools, 2"');
    expect(navigationButton(nav, "Refresh")).toContain('disabled=""');
    expect(visibleToolbar(html)).toContain("Search: “Amer”");
  });

  test("Done remains read-only ticket history, with no misleading active-stage board action", () => {
    const html = renderControls({
      mobileNavigation: true,
      filter: "done",
      view: "stages",
      visibleCount: 4,
    });
    const nav = kitchenNavigation(html);
    expect(visibleToolbar(html)).toContain("Done · read-only");
    expect(navigationButton(nav, "Tickets")).toContain('aria-pressed="true"');
    expect(navigationButton(nav, "Tickets")).toContain('aria-label="Tickets, 4"');
    expect(navigationButton(nav, "Board")).toContain('disabled=""');
    expect(navigationButton(nav, "Board")).toContain('aria-pressed="false"');
    expect(nav).not.toMatch(/Accept order|Start prep|Print receipt|Mark done/);
  });

  test("an unverified initial feed offers refresh without inventing usable tickets or tools", () => {
    const props = {
      tenantId: "00000000-0000-4000-8000-000000000001",
      locationId: "00000000-0000-4000-8000-000000000002",
      can: () => false,
    };
    expect(renderToStaticMarkup(createElement(OpsKdsPanel, props))).not.toContain(
      'aria-label="Kitchen navigation"',
    );
    const html = renderToStaticMarkup(
      createElement(OpsKdsPanel, { ...props, mobileNavigation: true }),
    );
    expect(html).toContain("Loading kitchen orders");
    const nav = kitchenNavigation(html);
    for (const label of ["Tickets", "Board", "Tools"]) {
      expect(navigationButton(nav, label)).toContain('disabled=""');
    }
    expect(navigationButton(nav, "Refresh")).not.toContain("disabled");
    expect(html).not.toContain('data-testid="kds-order-card"');
  });

  test("mobile tools retain the same query, fulfilment, sorting and staff controls", () => {
    const html = renderToStaticMarkup(
      createElement(KdsWorkspaceTools, {
        mobile: true,
        filter: "ready",
        query: "Amer Bag 1",
        onQueryChange: () => {},
        fulfilment: "curbside",
        onFulfilmentChange: () => {},
        sort: "newest",
        onSortChange: () => {},
        view: "stages",
        onViewChange: () => {},
        extraTools: createElement("span", null, "Existing sound and installation controls"),
      }),
    );
    expect(html).toContain('value="Amer Bag 1"');
    expect(html).toContain('<option value="curbside" selected="">');
    expect(html).toContain('<option value="newest" selected="">');
    expect(html).toContain("Find an order, dish, brand, bag name, note or vehicle");
    expect(html).toContain("Existing sound and installation controls");
    expect(html).not.toContain('aria-label="Kitchen board layout"');
    expect(html).not.toMatch(/Accept order|Start prep|Print receipt|Mark done/);
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
