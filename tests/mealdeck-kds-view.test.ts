import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KdsCompletedCard } from "../src/components/ops/kds-completed-card";
import type { KdsOrder, KdsOrderItem } from "../src/lib/mealdeck-kds";
import type { KdsCompletedOrder } from "../src/lib/mealdeck-kds-workflow";
import {
  kdsClockTime,
  kdsTicketProgress,
  matchesKdsOrderSearch,
  selectCompletedKdsOrders,
  selectKdsOrders,
} from "../src/lib/mealdeck-kds-view";

function item(overrides: Partial<KdsOrderItem> = {}): KdsOrderItem {
  return {
    order_item_id: "line-1",
    brand_id: "skorch",
    brand_name: "Skorch",
    item_name: "Double Deal",
    quantity: 2,
    modifiers: ["Sauce: Algerian", "Extra cheese"],
    notes: "No gherkins",
    participant_name: null,
    status: "queued",
    bags: [{ number: 1, name: "Amer", quantity: 2 }],
    ...overrides,
  };
}

function order(overrides: Partial<KdsOrder> = {}): KdsOrder {
  return {
    order_id: "order-1",
    version: "a".repeat(32),
    preparation_status: "queued",
    display_code: "MD1234",
    created_at: "2026-11-06T15:00:00Z",
    released_at: "2026-11-06T15:01:00Z",
    order_status: "accepted",
    fulfilment: "pickup",
    accepted_at: null,
    notes: "Pack sauces separately",
    group_order: true,
    routing_complete: true,
    blocked_reason: null,
    items: [item()],
    tickets: [],
    pass: null,
    ...overrides,
  };
}

function completed(overrides: Partial<KdsCompletedOrder> = {}): KdsCompletedOrder {
  return {
    order_id: "done-1",
    display_code: "MD5678",
    order_status: "fulfilled",
    handoff_status: "handed_off",
    accepted_at: "2026-11-06T15:02:00Z",
    completed_at: "2026-11-06T15:20:00Z",
    fulfilment: "pickup",
    group_order: true,
    cutlery_requested: true,
    notes: "Pack sauces separately",
    items: [item()],
    ...overrides,
  };
}

const filters = { query: "", fulfilment: "all", sort: "oldest", stage: "all" } as const;

describe("kitchen view keeps complete canonical tickets", () => {
  test("search finds named bags, exact modifiers and notes across a whole order", () => {
    const candidate = order();
    expect(matchesKdsOrderSearch(candidate, " amer  algerian ")).toBe(true);
    expect(matchesKdsOrderSearch(candidate, "bag 1")).toBe(true);
    expect(matchesKdsOrderSearch(candidate, "no gherkins")).toBe(true);
    expect(matchesKdsOrderSearch(candidate, "sauces separately")).toBe(true);
    expect(matchesKdsOrderSearch(candidate, "MD1234 Skorch")).toBe(true);
    expect(matchesKdsOrderSearch(candidate, "Amer mango")).toBe(false);
    expect(matchesKdsOrderSearch(candidate, "   ")).toBe(true);
  });

  test("finds a kerbside vehicle without filtering food out of its master ticket", () => {
    const candidate = order({
      fulfilment: "curbside",
      vehicle: { make: "Toyota", colour: "Blue", registrationLast4: "12AB" },
      items: [
        item(),
        item({ order_item_id: "line-2", brand_name: "Moktl", item_name: "Mango Mirage" }),
      ],
    });
    const selected = selectKdsOrders([candidate], { ...filters, query: "blue 12ab" });
    expect(selected).toEqual([candidate]);
    expect(selected[0]).toBe(candidate);
    expect(selected[0]!.items).toHaveLength(2);
    expect(selected[0]!.items[1]!.item_name).toBe("Mango Mirage");
  });

  test("stage and fulfilment filters intersect while acceptance stays separate from payment release", () => {
    const incoming = order();
    const accepted = order({
      order_id: "accepted",
      accepted_at: "2026-11-06T15:02:00Z",
      fulfilment: "curbside",
    });
    expect(selectKdsOrders([incoming, accepted], { ...filters, stage: "queued" })).toEqual([
      incoming,
    ]);
    expect(
      selectKdsOrders([incoming, accepted], {
        ...filters,
        stage: "accepted",
        fulfilment: "curbside",
      }),
    ).toEqual([accepted]);
    expect(
      selectKdsOrders([incoming, accepted], {
        ...filters,
        stage: "accepted",
        fulfilment: "pickup",
      }),
    ).toEqual([]);
    expect(selectKdsOrders([incoming, accepted], { ...filters, stage: "done" })).toEqual([]);
  });

  test("sorts by kitchen release and does not mutate server array or ticket state", () => {
    const newer = order({ order_id: "newer", released_at: "2026-11-06T15:10:00Z" });
    const older = order({
      order_id: "older",
      created_at: "2026-11-06T15:05:00Z",
      released_at: "2026-11-06T15:06:00Z",
    });
    const source = [newer, older];
    expect(selectKdsOrders(source, filters)).toEqual([older, newer]);
    expect(selectKdsOrders(source, { ...filters, sort: "newest" })).toEqual([newer, older]);
    expect(source).toEqual([newer, older]);
    expect(older.preparation_status).toBe("queued");
    expect(older.accepted_at).toBeNull();
  });

  test("progress counts each purchased line once, including attached extras and named bags", () => {
    const parent = item({ checkout_line_id: "main", status: "ready" });
    const extra = item({
      order_item_id: "extra",
      checkout_line_id: "extra",
      parent_checkout_line_id: "main",
      brand_name: "Moktl",
      item_name: "Virgin Mojito",
      status: "ready",
    });
    const secondBag = item({
      order_item_id: "other",
      quantity: 1,
      bags: [{ number: 2, name: "Alex", quantity: 1 }],
    });
    const candidate = order({ items: [parent, extra, secondBag] });
    expect(kdsTicketProgress(candidate)).toEqual({
      readyLines: 2,
      totalLines: 3,
      quantity: 5,
      bagCount: 2,
      percent: 67,
    });
  });

  test("completed search and sort use confirmed handover time", () => {
    const first = completed();
    const last = completed({
      order_id: "done-2",
      completed_at: "2026-11-06T15:45:00Z",
      fulfilment: "curbside",
    });
    expect(
      selectCompletedKdsOrders([first, last], { ...filters, sort: "newest", query: "Amer" }),
    ).toEqual([last, first]);
    expect(selectCompletedKdsOrders([first, last], { ...filters, fulfilment: "pickup" })).toEqual([
      first,
    ]);
  });

  test("clock labels always use UK local time, including British Summer Time", () => {
    expect(kdsClockTime("2026-11-06T15:04:00Z")).toBe("15:04");
    expect(kdsClockTime("2026-07-06T15:04:00Z")).toBe("16:04");
  });
});

test("Done tickets retain instructions but expose no mutation or print control", () => {
  const html = renderToStaticMarkup(createElement(KdsCompletedCard, { order: completed() }));
  for (const text of [
    "MD5678",
    "Amer · Bag 1",
    "Algerian",
    "Extra cheese",
    "No gherkins",
    "Pack sauces separately",
    "Cutlery requested",
    "15:20",
    "read-only",
  ]) {
    expect(html).toContain(text);
  }
  expect(html).not.toMatch(/<(button|input|form)\b/);
});
