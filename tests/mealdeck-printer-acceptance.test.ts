import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  acceptPrinterPendingOrder,
  parsePrinterAcceptance,
  parsePrinterAcceptanceBoard,
  printerAcceptanceAction,
  printerArrivalKeys,
  type PrinterPendingOrder,
} from "../src/lib/mealdeck-printer-acceptance";
import {
  PrinterConnectionStatus,
  PrinterPendingOrderCard,
} from "../src/components/ops/printer-pending-orders";
import { StaffAlertControls } from "../src/components/ops/staff-alerts";
import { createStaffAlertLedger } from "../src/lib/mealdeck-staff-alerts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { tenantId: id(10), locationId: id(11) };
const time = "2026-11-06T12:00:00Z";
function pending(): PrinterPendingOrder {
  return {
    orderId: id(1),
    version: "a".repeat(32),
    displayCode: "0427",
    paidAt: time,
    fulfilment: "pickup",
    totalPence: 1467,
    cutleryRequested: true,
    notes: "Keep the bags together.",
    packingPlan: {
      version: 1,
      separateBags: true,
      cutleryRequested: true,
      bags: [
        {
          number: 1,
          name: "<Amer & Jay>",
          allocations: [
            { lineId: "meal", quantity: 1 },
            { lineId: "extra", quantity: 1 },
          ],
        },
        {
          number: 2,
          name: "Alex",
          allocations: [
            { lineId: "meal", quantity: 1 },
            { lineId: "extra", quantity: 1 },
          ],
        },
      ],
    },
    items: [
      {
        lineId: "meal",
        parentLineId: null,
        name: "The Ace",
        brandName: "Skorch",
        quantity: 2,
        unitPence: 598,
        modifiers: ["3 Onion rings", "Spicy sauce"],
        notes: "No ice <please>",
        bags: [
          { number: 1, quantity: 1 },
          { number: 2, quantity: 1 },
        ],
      },
      {
        lineId: "extra",
        parentLineId: "meal",
        name: "Mango Mirage",
        brandName: "Moktl",
        quantity: 2,
        unitPence: 450,
        modifiers: ["No ice"],
        notes: null,
        bags: [
          { number: 1, quantity: 1 },
          { number: 2, quantity: 1 },
        ],
      },
    ],
  };
}
const board = () => ({
  schemaVersion: 1,
  ...scope,
  generatedAt: time,
  orders: [pending()],
  remainingOrderCount: 0,
});
const accepted = (replayed = false) => ({
  schemaVersion: 1,
  orderId: id(1),
  accepted: true,
  replayed,
  receiptJobId: id(2),
});

describe("printer paid-order acceptance projection", () => {
  test("retains a separate display number while preserving the authoritative order and version", () => {
    for (const orderNumber of ["0001", "10000", null]) {
      const value = board();
      value.orders[0]!.orderNumber = orderNumber;
      const parsed = parsePrinterAcceptanceBoard(value, scope).orders[0]!;
      expect(parsed.orderNumber).toBe(orderNumber);
      expect(parsed.displayCode).toBe("0427");
      expect(parsed.orderId).toBe(id(1));
      expect(parsed.version).toBe("a".repeat(32));
    }
    const value = board();
    value.orders[0]!.orderNumber = "0000";
    expect(() => parsePrinterAcceptanceBoard(value, scope)).toThrow();
  });
  test("keeps purchased choices and named bags without constructing a preaccept receipt", () => {
    const result = parsePrinterAcceptanceBoard(board(), scope);
    expect(result.orders).toEqual([pending()]);
    expect(result.orders[0]).not.toHaveProperty("acceptedAt");
    expect(result.orders[0]).not.toHaveProperty("receipt");
    expect(result.orders[0]).not.toHaveProperty("claimToken");
  });

  test("rejects another kitchen, duplicate orders, legacy empty data and missing versions", () => {
    expect(() => parsePrinterAcceptanceBoard(board(), { ...scope, locationId: id(12) })).toThrow();
    for (const invalid of [
      { ...board(), tenantId: id(20) },
      { ...board(), orders: [pending(), pending()] },
      { schemaVersion: 1, ...scope, generatedAt: time, jobs: [] },
      { ...board(), orders: [{ ...pending(), version: "" }] },
      { ...board(), remainingOrderCount: -1 },
    ])
      expect(() => parsePrinterAcceptanceBoard(invalid, scope)).toThrow();
  });

  test("rejects incomplete or inconsistent quantities and parent-extra packing", () => {
    for (const change of [
      (order: PrinterPendingOrder) => {
        order.packingPlan.bags.pop();
      },
      (order: PrinterPendingOrder) => {
        order.items[0]!.bags[0]!.quantity = 2;
      },
      (order: PrinterPendingOrder) => {
        order.items[1]!.parentLineId = "unknown";
      },
      (order: PrinterPendingOrder) => {
        order.items.push(order.items[0]!);
      },
      (order: PrinterPendingOrder) => {
        order.packingPlan.bags[0]!.name = "Alex\n";
      },
      (order: PrinterPendingOrder) => {
        order.cutleryRequested = false;
      },
    ]) {
      const order = pending();
      change(order);
      expect(() => parsePrinterAcceptanceBoard({ ...board(), orders: [order] }, scope)).toThrow();
    }
  });

  test("acceptance must identify the clicked order and a canonical receipt job", () => {
    expect(parsePrinterAcceptance(accepted(true), id(1)).replayed).toBe(true);
    for (const invalid of [
      { ...accepted(), orderId: id(3) },
      { ...accepted(), accepted: false },
      { ...accepted(), receiptJobId: null },
      { ...accepted(), schemaVersion: 2 },
    ])
      expect(() => parsePrinterAcceptance(invalid, id(1))).toThrow();
  });
});

describe("explicit printer acceptance transport", () => {
  test("sends only current scope/order/version once, without claiming or printing", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const mutation = { current: false };
    const result = await acceptPrinterPendingOrder({
      order: pending(),
      scope,
      mutation,
      readCurrent: () => ({ fresh: true, orders: [pending()] }),
      request: async (name, args) => {
        calls.push({ name, args });
        return accepted(true);
      },
    });
    expect(calls).toEqual([
      {
        name: "mealdeck_printer_accept_order",
        args: {
          p_tenant: scope.tenantId,
          p_location: scope.locationId,
          p_order: id(1),
          p_expected_version: "a".repeat(32),
        },
      },
    ]);
    expect(result).toEqual(accepted(true));
    expect(mutation.current).toBe(false);
  });

  test("rejects stale, offline, removed or updated cards before any request", async () => {
    let requests = 0;
    for (const current of [
      { fresh: false, orders: [pending()] },
      { fresh: true, orders: [] },
      { fresh: true, orders: [{ ...pending(), version: "b".repeat(32) }] },
    ])
      await expect(
        acceptPrinterPendingOrder({
          order: pending(),
          scope,
          mutation: { current: false },
          readCurrent: () => current,
          request: async () => {
            requests++;
            return accepted();
          },
        }),
      ).rejects.toThrow("Refresh before accepting");
    expect(requests).toBe(0);
  });

  test("shares a synchronous mutation lock with printing and rejects a second click", async () => {
    let resolve!: (value: unknown) => void;
    const deferred = new Promise<unknown>((done) => {
      resolve = done;
    });
    const mutation = { current: false };
    let requests = 0;
    let started = 0;
    const options = {
      order: pending(),
      scope,
      mutation,
      readCurrent: () => ({ fresh: true, orders: [pending()] }),
      request: async () => {
        requests++;
        return deferred;
      },
      onStart: () => {
        started++;
      },
    };
    const first = acceptPrinterPendingOrder(options);
    expect(mutation.current).toBe(true);
    await expect(acceptPrinterPendingOrder(options)).rejects.toThrow("in progress");
    expect(requests).toBe(1);
    expect(started).toBe(1);
    resolve(accepted());
    await first;
    expect(mutation.current).toBe(false);
  });

  test("unknown outcomes and wrong-order responses release the lock without a retry", async () => {
    for (const outcome of ["offline", "wrong-order"]) {
      const mutation = { current: false };
      let requests = 0;
      await expect(
        acceptPrinterPendingOrder({
          order: pending(),
          scope,
          mutation,
          readCurrent: () => ({ fresh: true, orders: [pending()] }),
          request: async () => {
            requests++;
            if (outcome === "offline") throw new Error("network interrupted");
            return { ...accepted(), orderId: id(9) };
          },
        }),
      ).rejects.toThrow();
      expect(requests).toBe(1);
      expect(mutation.current).toBe(false);
    }
  });
});

describe("printer acceptance presentation and arrivals", () => {
  test("pending meal contents remain visible and canonical without constructing a receipt", () => {
    const order = pending();
    order.items[0]!.mealComponents = [
      { slot: "side", name: "Loaded tots", quantityPerParent: 1, replacement: true },
      { slot: "drink", name: "Pepsi", quantityPerParent: 1, replacement: false },
    ];
    const parsed = parsePrinterAcceptanceBoard(
      { schemaVersion: 1, ...scope, generatedAt: time, orders: [order], remainingOrderCount: 0 },
      scope,
    );
    expect(parsed.orders[0]!.items[0]!.mealComponents).toEqual(order.items[0]!.mealComponents);
    const markup = renderToStaticMarkup(
      createElement(PrinterPendingOrderCard, {
        order: parsed.orders[0]!,
        fresh: true,
        paired: false,
        automatic: false,
        busy: false,
        accepting: false,
        onAccept: () => {},
      }),
    );
    const visible = markup.slice(0, markup.indexOf("<details"));
    expect(visible).toContain("Meal includes");
    expect(visible).toContain("totals for 2 items");
    expect(visible).toContain("<strong>2×</strong> Loaded tots");
    expect(visible).toContain("Replaces the standard side");
    expect(visible).toContain("<strong>2×</strong> Pepsi");
    expect(visible).not.toContain("Fries");
    expect(markup).toContain("Accept &amp; queue receipt");
    expect(markup).not.toContain("Receipt printed");
    Object.assign(order.items[0]!, {
      mealComponents: [{ slot: "side", name: "Fries", quantityPerParent: 0, replacement: false }],
    });
    expect(() =>
      parsePrinterAcceptanceBoard(
        { schemaVersion: 1, ...scope, generatedAt: time, orders: [order], remainingOrderCount: 0 },
        scope,
      ),
    ).toThrow();
  });

  test("paid-order arrivals do not claim a receipt already exists and KDS wording stays unchanged", () => {
    const alerts = {
      enabled: false,
      volume: 0.8,
      notice: 1,
      audioError: "",
      waitingForGesture: false,
      toggle: async () => {},
      setVolume: () => {},
      observe: () => {},
      clearNotice: () => {},
      test: async () => {},
    };
    const printer = renderToStaticMarkup(
      createElement(StaffAlertControls, {
        alerts,
        kind: "printer",
        noticeLabels: { singular: "order or receipt", plural: "orders or receipts" },
      }),
    );
    expect(printer).toContain("1 new order or receipt");
    expect(printer).toContain("Enable sound");
    expect(printer).toContain("Set to loudest");
    expect(printer).toContain("Two rising chimes when new orders or receipts arrive.");
    expect(printer).not.toContain("Test printer sound");
    const enabledPrinter = renderToStaticMarkup(
      createElement(StaffAlertControls, { alerts: { ...alerts, enabled: true }, kind: "printer" }),
    );
    expect(enabledPrinter).toContain("Test printer sound");
    expect(enabledPrinter).toContain("Mute sound");
    const waitingPrinter = renderToStaticMarkup(
      createElement(StaffAlertControls, {
        alerts: { ...alerts, waitingForGesture: true },
        kind: "printer",
      }),
    );
    expect(waitingPrinter).toContain("Sound is waiting for your first interaction");
    expect(waitingPrinter).toContain('aria-pressed="false"');
    expect(waitingPrinter).not.toContain("Test printer sound");
    const kitchen = renderToStaticMarkup(
      createElement(StaffAlertControls, { alerts, kind: "kds" }),
    );
    expect(kitchen).toContain("1 new order");
    expect(kitchen).not.toContain("order or receipt");
  });
  test("Accept & print requires pairing, Auto and a fresh queue", () => {
    expect(printerAcceptanceAction({ fresh: true, paired: true, automatic: true })).toBe(
      "Accept & print",
    );
    for (const state of [
      { fresh: false, paired: true, automatic: true },
      { fresh: true, paired: false, automatic: true },
      { fresh: true, paired: true, automatic: false },
    ])
      expect(printerAcceptanceAction(state)).toBe("Accept & queue receipt");
  });

  test("pending to original receipt is one arrival; an explicit copy remains distinct", () => {
    const original = { orderId: id(1), jobId: id(2), copyNumber: 1 };
    expect(printerArrivalKeys([pending()], [])).toEqual([`order:${id(1)}`]);
    expect(printerArrivalKeys([pending()], [original])).toEqual([`order:${id(1)}`]);
    expect(printerArrivalKeys([], [original])).toEqual([`order:${id(1)}`]);
    expect(
      printerArrivalKeys([], [original, { ...original, jobId: id(3), copyNumber: 2 }]),
    ).toEqual([`order:${id(1)}`, `copy:${id(3)}`]);
  });

  test("printer alerts observe paid arrivals and receipt-only arrivals without an acceptance replay", () => {
    const ledger = createStaffAlertLedger();
    expect(ledger.observe(printerArrivalKeys([], []), true)).toEqual([]);
    expect(ledger.observe(printerArrivalKeys([pending()], []), true)).toEqual([`order:${id(1)}`]);
    const original = { orderId: id(1), jobId: id(2), copyNumber: 1 };
    expect(ledger.observe(printerArrivalKeys([], [original]), true)).toEqual([]);
    const other = { orderId: id(4), jobId: id(5), copyNumber: 1 };
    expect(ledger.observe(printerArrivalKeys([], [original, other]), false)).toEqual([]);
    expect(ledger.observe(printerArrivalKeys([], [original, other]), true)).toEqual([
      `order:${id(4)}`,
    ]);
    const copy = { ...original, jobId: id(6), copyNumber: 2 };
    expect(ledger.observe(printerArrivalKeys([], [original, other, copy]), true)).toEqual([
      `copy:${id(6)}`,
    ]);
    expect(ledger.observe(printerArrivalKeys([], [original, other, copy]), true)).toEqual([]);
  });

  test("an unpaired built-in printer has an honest connection explanation and cannot enable Auto", () => {
    const status = renderToStaticMarkup(
      createElement(PrinterConnectionStatus, {
        fresh: true,
        paired: false,
        automatic: false,
        busy: false,
        onAutomaticChange: () => {},
      }),
    );
    expect(status).toContain("Automatic printing needs a connection");
    expect(status).toContain("Built-in Android printers need a compatible device connection");
    expect(status).toContain("installing this PWA does not connect the printer");
    expect(status).toContain('disabled=""');
    expect(status).not.toContain("Automatic printing is on");
  });

  test("shows paid details and escaped instructions with truthful queued status", () => {
    const markup = renderToStaticMarkup(
      createElement(PrinterPendingOrderCard, {
        order: pending(),
        fresh: true,
        paired: false,
        automatic: false,
        busy: false,
        accepting: false,
        onAccept: () => {},
      }),
    );
    for (const text of [
      "0427",
      "£14.67",
      "3 Onion rings",
      "Mango Mirage",
      "Include cutlery",
      "&lt;Amer &amp; Jay&gt; · Bag 1: 1×",
      "Alex · Bag 2: 1×",
      "No ice &lt;please&gt;",
      "Accept &amp; queue receipt",
      "Queues one receipt.",
    ])
      expect(markup).toContain(text);
    expect(markup).not.toContain('disabled=""');
    expect(markup).not.toContain("<Amer & Jay>");
  });

  test("stale cards cannot accept and automatic status does not claim physical output", () => {
    const markup = renderToStaticMarkup(
      createElement(PrinterPendingOrderCard, {
        order: pending(),
        fresh: false,
        paired: true,
        automatic: true,
        busy: false,
        accepting: false,
        onAccept: () => {},
      }),
    );
    expect(markup).toContain('disabled=""');
    expect(markup).toContain("Refresh the live queue");
    const status = renderToStaticMarkup(
      createElement(PrinterConnectionStatus, {
        fresh: true,
        paired: true,
        automatic: true,
        busy: false,
        onAutomaticChange: () => {},
      }),
    );
    expect(status).toContain("Local bridge paired");
    expect(status).toContain("Automatic printing is on");
    expect(status).toContain("check the paper");
    expect(status).not.toContain("Receipt printed");
  });
});
