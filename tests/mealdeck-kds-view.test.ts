import { describe, expect, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KdsCompletedCard } from "../src/components/ops/kds-completed-card";
import { KitchenOrderCard } from "../src/components/ops/kds-panel";
import { kdsOrderStage, nextKdsOrderAction } from "../src/lib/mealdeck-kds-presentation";
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

function ticketMarkup(
  candidate: KdsOrder,
  overrides: Partial<ComponentProps<typeof KitchenOrderCard>> = {},
) {
  return renderToStaticMarkup(
    createElement(KitchenOrderCard, {
      order: candidate,
      stage: kdsOrderStage(candidate),
      now: Date.parse("2026-11-06T15:12:00Z"),
      action: nextKdsOrderAction(candidate),
      disabled: false,
      saving: false,
      confirmingSeal: false,
      actionRef: () => {},
      cardRef: () => {},
      onAction: () => {},
      onConfirmSeal: () => {},
      onCancelSeal: () => {},
      onItemReady: () => {},
      onHandoff: () => {},
      ...overrides,
    }),
  );
}

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

  test("search finds the canonical order number, distinct collection code and saved pickup contact", () => {
    for (const fulfilment of ["pickup", "curbside"] as const) {
      const candidate = order({
        order_number: "0001",
        display_code: "4601",
        fulfilment,
        pickupContact: { name: "Sam Palmer", phone: "+447700900123" },
      });
      for (const query of ["0001", "4601", "Sam Palmer", "900123", "0001 Palmer"]) {
        expect(matchesKdsOrderSearch(candidate, query)).toBe(true);
      }
      expect(matchesKdsOrderSearch(candidate, "0002")).toBe(false);
    }
    for (const fulfilment of ["delivery", "dine_in"] as const) {
      expect(
        matchesKdsOrderSearch(
          order({ fulfilment, pickupContact: { name: "Private contact", phone: "+447700900123" } }),
          "Private contact",
        ),
      ).toBe(false);
    }
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

test("Done tickets show their canonical number and saved pickup contact as read-only text", () => {
  const candidate = completed({
    order_number: "0002",
    display_code: "7834",
    pickupContact: { name: "Sam & <Guest>", phone: "+447700900123" },
  });
  const html = renderToStaticMarkup(createElement(KdsCompletedCard, { order: candidate }));
  expect(html).toMatch(/<h3[^>]*>0002<\/h3>/);
  expect(html).toContain("Collection code</span><strong>7834</strong>");
  expect(html).toContain("Sam &amp; &lt;Guest&gt;");
  expect(html).toContain("+447700900123");
  expect(html).not.toMatch(/<(button|input|form|a)\b/);
  expect(matchesKdsOrderSearch(candidate, "0002 Sam")).toBe(true);
});

describe("ticket alignment retains every kitchen instruction", () => {
  test("current and Done tickets spell out frozen meal quantities and side/drink replacements", () => {
    const meal = item({
      quantity: 2,
      unit_pence: 699,
      modifiers: ["Make it a meal", "Selected drink: Mango Mirage"],
      mealComponents: [
        { slot: "side", name: "Loaded tots", quantityPerParent: 1, replacement: true },
        { slot: "drink", name: "Mango & <mint>", quantityPerParent: 1, replacement: true },
      ],
    });
    for (const html of [
      ticketMarkup(order({ items: [meal] })),
      renderToStaticMarkup(
        createElement(KdsCompletedCard, { order: completed({ items: [meal] }) }),
      ),
    ]) {
      const contents = html.match(
        /<section class="md-kds-meal-components"[\s\S]*?<\/section>/,
      )?.[0];
      expect(contents).toContain("Meal includes");
      expect(contents).toContain("totals for 2 items");
      expect(contents).toContain("<strong>2×</strong><span>Loaded tots");
      expect(contents).toContain("<strong>2×</strong><span>Mango &amp; &lt;mint&gt;");
      expect(contents).toContain("Replaces the standard side");
      expect(contents).toContain("Replaces the standard drink");
      expect(contents).not.toContain("Fries");
      expect(html).toContain("Make it a meal");
      expect(html).toContain("Amer · Bag 1");
    }
    expect(ticketMarkup(order({ items: [meal] }))).toContain("£6.99 each");
    expect(matchesKdsOrderSearch(order({ items: [meal] }), "loaded tots")).toBe(true);
  });

  test("only canonical included components appear; legacy labels and paid extras add no invented fries", () => {
    const legacy = item({ modifiers: ["Make it a meal"] });
    expect(ticketMarkup(order({ items: [legacy] }))).not.toContain("Meal includes");
    const side = item({
      item_name: "Chicken box",
      checkout_line_id: "main",
      mealComponents: [{ slot: "side", name: "Rice", quantityPerParent: 1, replacement: false }],
    });
    const extra = item({
      order_item_id: "extra",
      item_name: "Extra onion rings",
      checkout_line_id: "extra",
      parent_checkout_line_id: "main",
    });
    const html = ticketMarkup(order({ items: [side, extra] }));
    expect(html.match(/aria-label="Meal contents"/g)).toHaveLength(1);
    expect(html).toContain("<strong>2×</strong><span>Rice</span>");
    expect(html).not.toContain("Fries");
    expect(html).not.toContain("standard drink");
    expect(html).toContain("Extra onion rings");
    expect(html).toContain("with the item above");
  });

  test("canonical order numbers are prominent while collection codes remain separate", () => {
    const html = ticketMarkup(order({ order_number: "0001", display_code: "4601" }));
    expect(html).toMatch(/<h3[^>]*>0001<\/h3>/);
    expect(html).toContain("Collection code</span><strong>4601</strong>");
    expect(html).toContain('aria-label="Accept order · Order 0001"');
    expect(html).not.toContain('aria-label="Accept order · Order 4601"');
  });

  test("historical tickets retain a useful reference until a canonical number is present", () => {
    for (const order_number of [undefined, null]) {
      const html = ticketMarkup(order({ order_number, display_code: "4601" }));
      expect(html).toMatch(/<h3[^>]*>4601<\/h3>/);
      expect(html).toContain('class="md-kds-ticket-eyebrow">Collection code</p>');
      expect(html).not.toContain('class="md-kds-collection-code"');
      expect(html).toContain('aria-label="Accept order · Collection code 4601"');
      expect(html).not.toContain('class="md-kds-ticket-eyebrow">Order</p>');
    }
  });

  test("kerbside contact appears as escaped text beside the car, without a messaging action", () => {
    const html = ticketMarkup(
      order({
        fulfilment: "curbside",
        vehicle: { make: "Toyota", colour: "Blue", registrationLast4: "12AB" },
        pickupContact: { name: "Sam & <Guest>", phone: "+447700900123" },
      }),
    );
    for (const text of [
      'aria-label="Kerbside pickup contact"',
      ">Name</dt>",
      "WhatsApp number",
      "Sam &amp; &lt;Guest&gt;",
      "+447700900123",
      "Toyota",
      "Blue",
      "12AB",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("<Guest>");
    expect(html).not.toMatch(/href="(?:tel:|https?:\/\/(?:wa\.me|[^/]*whatsapp))/);
  });

  test("collection tickets include the saved name and phone without a car or messaging action", () => {
    const html = ticketMarkup(
      order({ pickupContact: { name: "Alex & <Family>", phone: "+447700900456" } }),
    );
    expect(html).toContain('aria-label="Collection contact"');
    expect(html).toContain("Alex &amp; &lt;Family&gt;");
    expect(html).toContain("+447700900456");
    expect(html).not.toContain("Reg ends");
    expect(html).not.toContain("<Family>");
    expect(html).not.toMatch(/href="(?:tel:|https?:\/\/(?:wa\.me|[^/]*whatsapp))/);
  });

  test("old tickets and unsupported fulfilments do not invent or display contact details", () => {
    for (const candidate of [
      order({ fulfilment: "curbside" }),
      order({ fulfilment: "curbside", pickupContact: null }),
      order({ fulfilment: "pickup", pickupContact: null }),
      ...(["delivery", "dine_in"] as const).map((fulfilment) =>
        order({ fulfilment, pickupContact: { name: "Private contact", phone: "+447700900123" } }),
      ),
    ]) {
      const html = ticketMarkup(candidate);
      expect(html).not.toContain('aria-label="Kerbside pickup contact"');
      expect(html).not.toContain('aria-label="Collection contact"');
      expect(html).not.toContain("Private contact");
      expect(html).not.toContain("+447700900123");
    }
  });

  test("long dish, modifier, extra and bag names stay complete in their detail rows", () => {
    const mainName = "Double smash burger with mature cheddar and caramelised onions";
    const extraName = "Passion fruit and mango mocktail with a fresh mint garnish";
    const bags = [
      { number: 1, name: "Alexandria-Josephine", quantity: 2 },
      { number: 2, name: "Christopher-Louise", quantity: 1 },
    ];
    const candidate = order({
      preparation_status: "preparing",
      accepted_at: "2026-11-06T15:02:00Z",
      fulfilment: "curbside",
      cutlery_requested: true,
      vehicle: { make: "Volkswagen", colour: "Dark blue", registrationLast4: "12AB" },
      items: [
        item({
          checkout_line_id: "main",
          item_name: mainName,
          quantity: 3,
          status: "preparing",
          bags,
          unit_pence: 650,
          modifiers: ["Sauce: Algerian", "ExtraCheeseWithCaramelisedOnionsAndChilliSauce"],
          modifier_details: [
            { name: "Algerian", group_name: "Sauce", price_delta_pence: 0, quantity_per_parent: 1 },
            {
              name: "ExtraCheeseWithCaramelisedOnionsAndChilliSauce",
              group_name: "Burger extras",
              price_delta_pence: 150,
              quantity_per_parent: 2,
            },
          ],
        }),
        item({
          order_item_id: "extra",
          checkout_line_id: "extra",
          parent_checkout_line_id: "main",
          brand_id: "moktl",
          brand_name: "Moktl",
          item_name: extraName,
          quantity: 3,
          status: "preparing",
          bags,
          modifiers: ["Less ice", "KeepFreshMintAndGarnishSeparate"],
          notes: "Keep drinks with the matching named bags",
        }),
      ],
    });
    const html = ticketMarkup(candidate);
    for (const text of [
      mainName,
      extraName,
      "Extra from Moktl · with the item above",
      "Alexandria-Josephine · Bag 1",
      "Christopher-Louise · Bag 2",
      "ExtraCheeseWithCaramelisedOnionsAndChilliSauce",
      "KeepFreshMintAndGarnishSeparate",
      "Keep drinks with the matching named bags",
      "No gherkins",
      "Pack sauces separately",
      "Include cutlery",
      "Dark blue",
      "Volkswagen",
      "12AB",
      "2× each · +£1.50",
    ]) {
      expect(html).toContain(text);
    }
    expect(html.match(/class="md-kds-line-details"/g)).toHaveLength(2);
    expect(html.match(/aria-label="Quantity 3"/g)).toHaveLength(2);
    const checklist = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
    expect(checklist).toHaveLength(2);
    expect(checklist.every((input) => !input.includes("disabled"))).toBe(true);
  });

  test("Tavo portion and flavour show the full dish price without the internal 51p adjustment", () => {
    const wings = (flavour: string, lineId: string) =>
      item({
        order_item_id: lineId,
        brand_id: "tavo-chicken",
        brand_name: "Tavo Chicken",
        item_name: "Fried Chicken Wings",
        quantity: 1,
        base_unit_pence: 299,
        unit_pence: 350,
        modifiers: ["3 pcs", flavour, `${flavour} · 3 pcs`],
        modifier_details: [
          {
            name: "3 pcs",
            group_name: "Portion",
            kind: "source",
            price_delta_pence: 0,
            quantity_per_parent: 1,
          },
          {
            name: flavour,
            group_name: "Flavour",
            kind: "source",
            price_delta_pence: 0,
            quantity_per_parent: 1,
          },
          {
            name: `${flavour} · 3 pcs`,
            group_name: "Tavo Chicken · Fried Chicken Wings · Portion and flavour price",
            kind: "variant",
            price_delta_pence: 51,
            quantity_per_parent: 1,
          },
        ],
        bags: [{ number: 1, quantity: 1 }],
        notes: null,
        status: "preparing",
      });
    const candidate = order({
      order_number: "0002",
      display_code: "7628",
      accepted_at: "2026-11-06T18:50:00Z",
      preparation_status: "preparing",
      items: [wings("Korean BBQ", "wings-korean"), wings("Fiery Sweet Chilli", "wings-chilli")],
    });
    const before = JSON.stringify(candidate);
    const html = ticketMarkup(candidate);
    expect(html.match(/£3\.50 each/g)).toHaveLength(2);
    expect(html.match(/selected choices included/g)).toHaveLength(2);
    expect(html).toContain("Portion &amp; flavour:");
    expect(html).toContain("Korean BBQ · 3 pcs");
    expect(html).toContain("Fiery Sweet Chilli · 3 pcs");
    expect(html).not.toContain("£0.51");
    expect(html).not.toContain("£2.99");
    expect(html).not.toContain("Portion and flavour price");
    expect(html.match(/aria-label="Quantity 1"/g)).toHaveLength(2);
    const checklist = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
    expect(checklist).toHaveLength(2);
    expect(checklist.every((input) => !input.includes("disabled"))).toBe(true);
    expect(JSON.stringify(candidate)).toBe(before);

    const done = renderToStaticMarkup(
      createElement(KdsCompletedCard, { order: completed({ items: candidate.items }) }),
    );
    expect(done).toContain("Korean BBQ · 3 pcs");
    expect(done).toContain("Fiery Sweet Chilli · 3 pcs");
    expect(done).not.toContain("£0.51");
    expect(done).not.toMatch(/<(button|input|form)\b/);
  });

  test("the responsive sealing action keeps its explicit confirmation and locked checklist", () => {
    const html = ticketMarkup(
      order({
        order_number: "0001",
        display_code: "4601",
        accepted_at: "2026-11-06T15:02:00Z",
        preparation_status: "ready",
        items: [item({ status: "ready" })],
        pass: { status: "packing", version: "b".repeat(32), updated_at: "2026-11-06T15:10:00Z" },
      }),
      { confirmingSeal: true },
    );
    expect(html).toContain('class="md-kds-seal-actions"');
    expect(html).toContain("Check every item, drink, sauce and requested cutlery.");
    expect(html).toContain("Confirm ready for handover");
    expect(html).toContain(">Back</button>");
    expect(html.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0]).toContain('disabled=""');
    expect(html).not.toContain('class="md-kds-handoff-form');
  });

  test("the larger handover field still requires a four-digit code before confirmation", () => {
    const html = ticketMarkup(
      order({
        order_number: "0001",
        display_code: "4601",
        accepted_at: "2026-11-06T15:02:00Z",
        preparation_status: "ready",
        items: [item({ status: "ready" })],
        pass: {
          status: "ready_for_handoff",
          version: "b".repeat(32),
          updated_at: "2026-11-06T15:10:00Z",
        },
      }),
    );
    expect(html).toContain('class="md-kds-handoff-form space-y-2"');
    expect(html).toContain('aria-label="Collection code for order 0001"');
    expect(html).toContain("Enter the customer’s four-digit collection code");
    expect(html).not.toContain("four-digit order number");
    expect(html.match(/<input[^>]*inputMode="numeric"[^>]*>/)?.[0]).toContain('value=""');
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('pattern="[0-9]{4}"');
    expect(html).toContain('maxLength="4"');
    expect(html.match(/<button[^>]*type="submit"[^>]*>/)?.[0]).toContain('disabled=""');
    expect(html).toContain("Confirm handover · Mark done");
  });
});
