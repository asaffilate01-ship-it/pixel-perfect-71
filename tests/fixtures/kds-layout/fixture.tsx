/** UI TEST ONLY. Synthetic local state, no auth, backend, or real orders.
 * Keep this fixture outside public/build output. See README.md for approved preview setup. */
import { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  KdsOrderCollection,
  KdsWorkspaceControls,
  KitchenOrderCard,
} from "../../../src/components/ops/kds-panel";
import { KdsCompletedCard } from "../../../src/components/ops/kds-completed-card";
import { KdsOrderNavigator } from "../../../src/components/ops/kds-order-navigator";
import { KdsTicketGrid } from "../../../src/components/ops/kds-ticket-grid";
import type { KdsOrder, KdsOrderItem } from "../../../src/lib/mealdeck-kds";
import type { KdsCompletedOrder } from "../../../src/lib/mealdeck-kds-workflow";
import {
  kdsOrderStage,
  nextKdsOrderAction,
  type KdsOrderStage,
} from "../../../src/lib/mealdeck-kds-presentation";
import {
  selectCompletedKdsOrders,
  selectKdsOrders,
  type KdsFulfilmentFilter,
  type KdsSort,
  type KdsStageFilter,
  type KdsView,
} from "../../../src/lib/mealdeck-kds-view";
import "../../../src/styles.css";
import "../../../src/styles.mealdeck-rebuild.css";
import "../../../src/components/ops/ops-theme.css";
import "../../../src/components/ops/operations-mobile.css";
import "../../../src/components/ops/staff-mobile-navigation.css";
import "../../../src/components/ops/kds-workspace.css";

const QA_NOW = Date.parse("2026-11-07T17:24:00Z");
const VERSION = "a".repeat(32);
const ISO = "2026-11-07T17:10:00Z";
const NOOP_REF = () => {};
const STYLE = `
  html, body { margin: 0; min-width: 0; }
  .qa-shell { padding: 12px; }
  .qa-banner { margin-bottom: 12px; border: 2px solid #923514; background: #fff5d5; padding: 10px 12px; color: #44230c; }
  .qa-banner h1 { margin: 0; font-size: 18px; line-height: 1.3; }
  .qa-banner p { margin: 5px 0 0; font-size: 13px; line-height: 1.45; }
  .qa-banner details { margin-top: 8px; }
  .qa-banner summary { cursor: pointer; font-weight: 700; font-size: 14px; }
  .qa-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 0 4px; }
  .qa-controls button { min-height: 36px; padding: 7px 10px; background: white; border: 1px solid #9c8467; border-radius: 5px; color: #2c251c; font: 600 13px/1.4 sans-serif; cursor: pointer; }
  .qa-controls button[aria-pressed="true"] { background: #342a20; color: white; }
  .qa-controls label { display: flex; align-items: center; gap: 6px; font-size: 13px; }
  .qa-controls input[type="checkbox"] { width: 20px; height: 20px; }
  .qa-log { max-height: 160px; overflow: auto; margin: 6px 0 0; font: 12px/1.45 monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
  .qa-board { display: grid; gap: 12px; }
  .qa-legacy-rows .md-kds-ticket-grid,
  .qa-legacy-rows .md-kds-lanes-single .md-kds-lane-orders { grid-auto-rows: auto !important; grid-auto-flow: row !important; row-gap: 12px !important; }
  .qa-legacy-rows .md-kds-ticket-grid > *,
  .qa-legacy-rows .md-kds-lanes-single .md-kds-lane-orders > * { grid-row: auto !important; grid-column: auto !important; padding-bottom: 0 !important; }
`;

function makeItem(
  orderNumber: number,
  index: number,
  overrides: Partial<KdsOrderItem> = {},
): KdsOrderItem {
  return {
    order_item_id: `qa-item-${orderNumber}-${index + 1}`,
    checkout_line_id: `qa-line-${orderNumber}-${index + 1}`,
    brand_id: "qa-skorch",
    brand_name: "Skorch Burgers · QA",
    item_name: index === 0 ? "Double Deal · synthetic sample" : `QA dish ${index + 1}`,
    quantity: 1,
    unit_pence: 550,
    modifiers: [],
    notes: null,
    participant_name: null,
    status: "preparing",
    bags: [{ number: 1, name: "Test Alex", quantity: 1 }],
    ...overrides,
  };
}

function makeOrder(number: number, itemCount: number, overrides: Partial<KdsOrder> = {}): KdsOrder {
  return {
    order_id: `qa-order-${number}`,
    order_number: String(number),
    version: VERSION,
    preparation_status: "preparing",
    display_code: number === 9102 ? "2468" : String(4000 + (number % 1000)),
    created_at: new Date(QA_NOW - (30 - (number % 100)) * 60000).toISOString(),
    released_at: new Date(QA_NOW - (29 - (number % 100)) * 60000).toISOString(),
    order_status: "preparing",
    fulfilment: "pickup",
    accepted_at: ISO,
    notes: null,
    group_order: false,
    routing_complete: true,
    blocked_reason: null,
    cutlery_requested: false,
    pickupContact: { name: `Test Customer ${number}`, phone: "+447700900123" },
    items: Array.from({ length: itemCount }, (_, index) => makeItem(number, index)),
    tickets: [],
    pass: { status: "waiting_for_kitchen", version: VERSION, updated_at: ISO },
    ...overrides,
  };
}

function makeLongItems(number: number, count: number): KdsOrderItem[] {
  return Array.from({ length: count }, (_, index) => {
    const bag = (index % 3) + 1;
    const name = ["Test Alex", "Test Priya", "Test Robin"][bag - 1]!;
    if (index === 1) {
      return makeItem(number, index, {
        parent_checkout_line_id: `qa-line-${number}-1`,
        brand_id: "qa-moktl",
        brand_name: "Moktl · QA",
        item_name: "Mango and passionfruit mocktail · attached extra · synthetic sample",
        quantity: 2,
        unit_pence: 299,
        modifiers: ["Flavour: Mango and passionfruit", "Garnish: Lime wedge on the side"],
        notes: "Please keep both drinks with Test Alex’s burger bag. This is a synthetic QA note.",
        bags: [{ number: 1, name: "Test Alex", quantity: 2 }],
      });
    }
    return makeItem(number, index, {
      brand_id: index < 5 ? "qa-skorch" : index < 10 ? "qa-souvano" : "qa-tavo",
      brand_name:
        index < 5 ? "Skorch Burgers · QA" : index < 10 ? "Souvano · QA" : "Tavo Chicken · QA",
      item_name:
        index === 0
          ? "The Four of a Kind burger with a deliberately long name to verify wrapping on narrow kitchen displays · QA"
          : index % 2
            ? `QA ${index + 1}: Middle Eastern style chicken with a long descriptive item name`
            : `QA ${index + 1}: Double Deal`,
      quantity: index === 0 ? 2 : 1,
      unit_pence: index === 0 ? 1149 : 650,
      modifiers:
        index % 3 === 0
          ? [
              "Flavour: Fiery Sweet Chilli",
              "Sauce: Algerian, packed in a separate pot",
              "Extra cheese",
            ]
          : ["Side: Rice", "Sauce: Garlic and herb on the side"],
      modifier_details:
        index % 3 === 0
          ? [
              {
                name: "Fiery Sweet Chilli",
                group_name: "Flavour",
                price_delta_pence: 0,
                quantity_per_parent: 1,
                kind: "variant",
              },
              {
                name: "Algerian sauce",
                group_name: "Sauce",
                price_delta_pence: 50,
                quantity_per_parent: 1,
                kind: "source",
              },
              {
                name: "Extra cheese",
                group_name: "Extras",
                price_delta_pence: 50,
                quantity_per_parent: 1,
                kind: "source",
              },
            ]
          : [],
      mealComponents:
        index === 0
          ? [
              {
                slot: "side",
                name: "Regular fries with peri salt",
                quantityPerParent: 1,
                replacement: false,
              },
              { slot: "drink", name: "7Up can", quantityPerParent: 1, replacement: false },
            ]
          : [],
      notes:
        index % 2 === 0
          ? "QA item note: no gherkins. Keep the sauce separate and label this bag clearly.\nSecond line checks that multiline instructions remain visible."
          : null,
      participant_name: name,
      bags: [{ number: bag, name, quantity: index === 0 ? 2 : 1 }],
      status: index === 3 ? "ready" : "preparing",
    });
  });
}

function readyItems(number: number, count: number) {
  return Array.from({ length: count }, (_, index) => makeItem(number, index, { status: "ready" }));
}

function makeOrders(): KdsOrder[] {
  return [
    makeOrder(9101, 15, {
      items: makeLongItems(9101, 15),
      group_order: true,
      cutlery_requested: true,
      fulfilment: "curbside",
      vehicle: { make: "Toyota", colour: "Metallic midnight blue", registrationLast4: "12AB" },
      pickupContact: { name: "Test Alexandra Montgomery-Worthington", phone: "+447700900123" },
      notes:
        "QA order note: three named bags. Keep hot food and cold desserts separate within each person’s allocation. Parked outside the example shop, bay 3.\nAll names, prices, contact details and instructions on this page are synthetic.",
    }),
    makeOrder(9102, 2, {
      preparation_status: "ready",
      order_status: "ready",
      items: readyItems(9102, 2),
      pass: { status: "ready_for_handoff", version: VERSION, updated_at: ISO },
      pickupContact: { name: "Test Sam · handoff-state check", phone: "+447700900456" },
      notes:
        "UI-only state check: enter a partial code here, resize the frame, then remove earlier order 9101. Full synthetic code: 2468.",
    }),
    makeOrder(9103, 1, {
      accepted_at: null,
      preparation_status: "queued",
      order_status: "accepted",
      pass: null,
      items: [makeItem(9103, 0, { status: "queued", bags: [] })],
    }),
    makeOrder(9104, 8, {
      items: makeLongItems(9104, 8),
      group_order: true,
      notes: "QA: second long order, to compare packing of short tickets between two tall tickets.",
    }),
    makeOrder(9105, 1, {
      preparation_status: "queued",
      order_status: "accepted",
      items: [
        makeItem(9105, 0, {
          status: "queued",
          item_name: "Oreo Milkcake · QA",
          brand_id: "qa-icova",
          brand_name: "Icova · QA",
          unit_pence: 399,
        }),
      ],
    }),
    makeOrder(9106, 2, {
      preparation_status: "ready",
      order_status: "ready",
      items: readyItems(9106, 2),
      cutlery_requested: true,
      pass: { status: "ready_to_pack", version: VERSION, updated_at: ISO },
    }),
    makeOrder(9107, 1, {
      preparation_status: "ready",
      order_status: "ready",
      items: readyItems(9107, 1),
      pass: { status: "packing", version: VERSION, updated_at: ISO },
    }),
    makeOrder(9108, 2, {
      fulfilment: "curbside",
      vehicle: { make: "Mercedes-Benz", colour: "Silver", registrationLast4: "34CD" },
      pickupContact: { name: "Test Jordan Fitzgerald", phone: "+447700900789" },
      items: [
        makeItem(9108, 0, {
          item_name: "QA loaded fries with Korean barbecue chicken",
          modifiers: ["Sauce: Korean BBQ", "Extra: crispy onions", "No jalapeños"],
          notes: "QA: sauce in a separate pot; label as Test Priya · Bag 2.",
          bags: [{ number: 2, name: "Test Priya", quantity: 1 }],
        }),
        makeItem(9108, 1, {
          item_name: "QA sparkling water",
          unit_pence: 100,
          brand_name: "Moktl · QA",
          brand_id: "qa-moktl",
          bags: [{ number: 2, name: "Test Priya", quantity: 1 }],
        }),
      ],
    }),
  ];
}

function completedFrom(order: KdsOrder, number?: number): KdsCompletedOrder {
  return {
    order_id: number ? `qa-done-${number}` : order.order_id,
    order_number: number ? String(number) : (order.order_number ?? null),
    display_code: order.display_code,
    order_status: "fulfilled",
    handoff_status: "handed_off",
    accepted_at: order.accepted_at ?? ISO,
    completed_at: "2026-11-07T17:23:00Z",
    fulfilment: order.fulfilment,
    pickupContact: order.pickupContact ?? null,
    group_order: order.group_order,
    cutlery_requested: !!order.cutlery_requested,
    notes: order.notes,
    items: order.items,
  };
}

function makeDoneOrders() {
  const orders = makeOrders();
  return [
    completedFrom(orders[0]!, 9201),
    completedFrom(orders[2]!, 9202),
    completedFrom(orders[3]!, 9203),
  ];
}

function Fixture() {
  const [orders, setOrders] = useState(makeOrders);
  const [doneOrders, setDoneOrders] = useState(makeDoneOrders);
  const [view, setView] = useState<KdsView>("tickets");
  const [filter, setFilter] = useState<KdsStageFilter>("all");
  const [query, setQuery] = useState("");
  const [fulfilment, setFulfilment] = useState<KdsFulfilmentFilter>("all");
  const [sort, setSort] = useState<KdsSort>("oldest");
  const [mobileNavigation, setMobileNavigation] = useState(true);
  const [legacyRows, setLegacyRows] = useState(false);
  const [confirmingSeal, setConfirmingSeal] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [geometry, setGeometry] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const nextNumber = useRef(9109);
  const counts = useMemo(() => {
    const value: Record<KdsOrderStage, number> = {
      queued: 0,
      accepted: 0,
      preparing: 0,
      ready: 0,
      sealed: 0,
      done: doneOrders.length,
    };
    orders.forEach((order) => {
      value[kdsOrderStage(order)] += 1;
    });
    return value;
  }, [orders, doneOrders.length]);
  const visibleOrders = selectKdsOrders(orders, { query, fulfilment, sort, stage: filter });
  const visibleDone = selectCompletedKdsOrders(doneOrders, { query, fulfilment, sort });
  const log = (event: object) =>
    setEvents((previous) => [JSON.stringify(event), ...previous].slice(0, 15));
  const update = (id: string, change: (order: KdsOrder) => KdsOrder) =>
    setOrders((previous) =>
      previous.map((order) => (order.order_id === id ? change(order) : order)),
    );

  function actionFor(order: KdsOrder) {
    const action = nextKdsOrderAction(order);
    log({ handler: "onAction", orderId: order.order_id, action });
    if (!action) return;
    if (action.status === "sealed") {
      setConfirmingSeal(order.order_id);
      return;
    }
    update(order.order_id, (current) => {
      if (action.target === "accept") return { ...current, accepted_at: ISO };
      if (action.target === "order")
        return {
          ...current,
          preparation_status: "preparing",
          order_status: "preparing",
          items: current.items.map((item) => ({
            ...item,
            status: item.status === "ready" ? "ready" : "preparing",
          })),
        };
      if (action.target === "pass")
        return { ...current, pass: { status: "packing", version: VERSION, updated_at: ISO } };
      return current;
    });
  }

  function itemReady(order: KdsOrder, itemId: string, ready: boolean) {
    log({ handler: "onItemReady", orderId: order.order_id, itemId, ready });
    update(order.order_id, (current) => {
      const items: KdsOrderItem[] = current.items.map((item) =>
        item.order_item_id === itemId ? { ...item, status: ready ? "ready" : "preparing" } : item,
      );
      const allReady = items.every((item) => item.status === "ready");
      return {
        ...current,
        items,
        preparation_status: allReady ? "ready" : "preparing",
        order_status: allReady ? "ready" : "preparing",
        pass: {
          status: allReady ? "ready_to_pack" : "waiting_for_kitchen",
          version: VERSION,
          updated_at: ISO,
        },
      };
    });
  }

  function handoff(order: KdsOrder, code: string) {
    log({
      handler: "onHandoff",
      orderId: order.order_id,
      code,
      syntheticCodeMatches: code === order.display_code,
    });
    if (code !== order.display_code) return;
    setDoneOrders((previous) => [...previous, completedFrom(order)]);
    setOrders((previous) => previous.filter((candidate) => candidate.order_id !== order.order_id));
  }

  function measure() {
    const cards = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-testid='kds-order-card'], [data-testid='kds-completed-order']",
      ),
    ];
    setGeometry(
      JSON.stringify(
        {
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            documentWidth: document.documentElement.scrollWidth,
          },
          layout: legacyRows ? "legacy rows" : "packed",
          cards: cards.map((card) => {
            const rect = card.getBoundingClientRect();
            return {
              id: card.dataset["orderId"],
              left: Math.round(rect.left),
              top: Math.round(rect.top + window.scrollY),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              row: getComputedStyle(card).gridRow,
              parentRow: card.parentElement ? getComputedStyle(card.parentElement).gridRow : "",
            };
          }),
        },
        null,
        2,
      ),
    );
  }

  function reset() {
    setOrders(makeOrders());
    setDoneOrders(makeDoneOrders());
    setConfirmingSeal(null);
    setEvents([]);
    setGeometry("");
    setResetKey((previous) => previous + 1);
    nextNumber.current = 9109;
    setFilter("all");
    setQuery("");
    setFulfilment("all");
    setSort("oldest");
    setView("tickets");
  }

  return (
    <main
      className={`md-ops qa-shell ${mobileNavigation ? "md-staff-has-mobile-nav" : ""} ${legacyRows ? "qa-legacy-rows" : ""}`}
    >
      <style>{STYLE}</style>
      <aside className="qa-banner" aria-label="Synthetic test fixture controls">
        <h1>UI TEST ONLY · MealDeck KDS</h1>
        <p>
          Synthetic orders and local interactions. Application network requests are disabled. No
          payments, printing, auth or kitchen changes.
        </p>
        <details open>
          <summary>QA fixture controls</summary>
          <div className="qa-controls">
            <button
              id="qa-remove-earliest"
              type="button"
              onClick={() => {
                const earliest = [...orders].sort(
                  (a, b) => Date.parse(a.released_at) - Date.parse(b.released_at),
                )[0];
                if (earliest) {
                  log({ handler: "removeEarliest", orderId: earliest.order_id });
                  setOrders((previous) =>
                    previous.filter((order) => order.order_id !== earliest.order_id),
                  );
                }
              }}
            >
              Remove earliest
            </button>
            <button
              id="qa-add-order"
              type="button"
              onClick={() => {
                const number = nextNumber.current++;
                const added = makeOrder(number, 1, {
                  accepted_at: null,
                  preparation_status: "queued",
                  order_status: "accepted",
                  items: [makeItem(number, 0, { status: "queued" })],
                  pass: null,
                  released_at: new Date(QA_NOW + (number - 9109) * 1000).toISOString(),
                });
                setOrders((previous) => [...previous, added]);
                log({ handler: "addOrder", orderId: added.order_id });
              }}
            >
              Add order
            </button>
            <button id="qa-reset" type="button" onClick={reset}>
              Reset fixture
            </button>
            <button
              id="qa-tickets"
              type="button"
              onClick={() => {
                setView("tickets");
                setFilter("all");
              }}
              aria-pressed={view === "tickets" && filter === "all"}
            >
              QA: Tickets
            </button>
            <button
              id="qa-stages"
              type="button"
              onClick={() => {
                setView("stages");
                setFilter("all");
              }}
              aria-pressed={view === "stages" && filter === "all"}
            >
              QA: Stages
            </button>
            <button
              id="qa-single-stage"
              type="button"
              onClick={() => {
                setView("stages");
                setFilter("preparing");
              }}
              aria-pressed={view === "stages" && filter === "preparing"}
            >
              QA: Preparing lane
            </button>
            <button
              id="qa-done"
              type="button"
              onClick={() => setFilter("done")}
              aria-pressed={filter === "done"}
            >
              QA: Done
            </button>
            <label>
              <input
                id="qa-mobile-navigation"
                type="checkbox"
                checked={mobileNavigation}
                onChange={(event) => setMobileNavigation(event.target.checked)}
              />
              Standalone mobile navigation
            </label>
            <label>
              <input
                id="qa-legacy-rows"
                type="checkbox"
                checked={legacyRows}
                onChange={(event) => setLegacyRows(event.target.checked)}
              />
              Legacy rows comparison
            </label>
            <button id="qa-measure" type="button" onClick={measure}>
              Measure layout
            </button>
          </div>
          <p>
            State check: order <strong>9102</strong>, synthetic handoff code <strong>2468</strong>.
            Enter 24, resize, remove 9101, then verify 24 remains.
          </p>
          {geometry && (
            <pre id="qa-geometry" className="qa-log">
              {geometry}
            </pre>
          )}
          <output
            id="qa-event-log"
            className="qa-log"
            aria-label="Local callback log"
            style={{ display: "block" }}
          >
            {events.length ? events.join("\n") : "Local callback log: no interactions yet."}
          </output>
        </details>
      </aside>
      <section
        key={resetKey}
        className="md-kds-workspace qa-board"
        data-mobile-navigation={mobileNavigation}
        aria-label="Synthetic kitchen board"
      >
        <KdsWorkspaceControls
          mobileNavigation={mobileNavigation}
          activeCount={orders.length}
          counts={counts}
          filter={filter}
          onFilterChange={setFilter}
          preferencesScope="temporary-kds-layout-qa"
          query={query}
          onQueryChange={setQuery}
          fulfilment={fulfilment}
          onFulfilmentChange={setFulfilment}
          sort={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
          visibleCount={filter === "done" ? visibleDone.length : visibleOrders.length}
          refreshing={false}
          refreshDisabled={false}
          onRefresh={() => log({ handler: "onRefresh", localOnly: true })}
          onClear={() => {
            setFilter("all");
            setQuery("");
            setFulfilment("all");
          }}
        />
        {filter === "done" ? (
          <>
            <p className="md-ops-muted">Synthetic completed orders · read-only UI check.</p>
            <KdsOrderNavigator
              orders={visibleDone.map((order) => ({
                id: order.order_id,
                headingId: `kds-completed-${order.order_id}`,
                reference: `Order ${order.order_number}`,
                stage: "Done",
                quantity: order.items.reduce((total, item) => total + item.quantity, 0),
              }))}
            />
            <KdsTicketGrid label="Completed kitchen orders">
              {visibleDone.map((order) => (
                <KdsCompletedCard key={order.order_id} order={order} />
              ))}
            </KdsTicketGrid>
          </>
        ) : (
          <KdsOrderCollection
            orders={visibleOrders}
            view={view}
            filter={filter}
            renderOrder={(order) => (
              <KitchenOrderCard
                key={order.order_id}
                order={order}
                stage={kdsOrderStage(order)}
                now={QA_NOW}
                action={nextKdsOrderAction(order)}
                disabled={false}
                saving={false}
                confirmingSeal={confirmingSeal === order.order_id}
                actionRef={NOOP_REF}
                cardRef={NOOP_REF}
                onAction={() => actionFor(order)}
                onConfirmSeal={() => {
                  log({ handler: "onConfirmSeal", orderId: order.order_id });
                  update(order.order_id, (current) => ({
                    ...current,
                    pass: { status: "ready_for_handoff", version: VERSION, updated_at: ISO },
                  }));
                  setConfirmingSeal(null);
                }}
                onCancelSeal={() => {
                  log({ handler: "onCancelSeal", orderId: order.order_id });
                  setConfirmingSeal(null);
                }}
                onItemReady={(itemId, ready) => itemReady(order, itemId, ready)}
                onHandoff={(code) => handoff(order, code)}
              />
            )}
          />
        )}
        {!visibleOrders.length && filter !== "done" && (
          <p>No synthetic orders match the current filters.</p>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
