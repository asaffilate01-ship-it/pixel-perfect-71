import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReceiptPreview } from "../src/components/ops/receipt-preview";
import { validateReceipt } from "../tools/receipt-bridge/receipt.mjs";
import { receiptLogoSource, waitForReceiptLogo } from "../src/lib/mealdeck-receipt-logo";
import {
  receiptSchema,
  parsePrinterBoard,
  parseClaim,
  receiptItemBags,
  type MealDeckReceipt,
} from "../src/lib/mealdeck-printer";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const time = "2026-11-05T12:00:00Z";
function receipt(): MealDeckReceipt {
  return {
    schemaVersion: 1,
    orderId: id(1),
    copyNumber: 1,
    reprintOf: null,
    reprintReason: null,
    displayCode: "0427",
    brand: "MealDeck",
    tradingName: "313 Brands Ltd",
    locationName: "Luton",
    createdAt: time,
    paidAt: time,
    acceptedAt: time,
    fulfilment: "curbside",
    customerName: "Fixture customer",
    car: { make: "Fixture car", colour: "Blue", registrationLast4: "AB12" },
    cutleryRequested: true,
    packingPlan: {
      version: 1,
      separateBags: true,
      cutleryRequested: true,
      bags: [
        {
          number: 1,
          allocations: [
            { lineId: "line-1", quantity: 1 },
            { lineId: "line-1-extra-drink", quantity: 1 },
          ],
        },
        {
          number: 2,
          allocations: [
            { lineId: "line-1", quantity: 1 },
            { lineId: "line-1-extra-drink", quantity: 1 },
          ],
        },
      ],
    },
    items: [
      {
        lineId: "line-1",
        parentLineId: null,
        brandName: "Skorch",
        name: "The Ace",
        quantity: 2,
        baseUnitPence: 399,
        unitPence: 598,
        linePence: 1196,
        notes: null,
        modifiers: [
          {
            name: "3 Onion rings",
            groupName: "Burger add-ons",
            quantityPerParent: 1,
            priceDeltaPence: 199,
          },
        ],
      },
      {
        lineId: "line-1-extra-drink",
        parentLineId: "line-1",
        brandName: "Moktl",
        name: "Mango Mirage",
        quantity: 2,
        baseUnitPence: 450,
        unitPence: 450,
        linePence: 900,
        notes: null,
        modifiers: [],
      },
    ],
    subtotalPence: 2096,
    discountPence: 629,
    totalPence: 1467,
    currency: "GBP",
    orderNotes: null,
  };
}
const job = () => ({
  jobId: id(2),
  orderId: id(1),
  copyNumber: 1,
  status: "queued",
  createdAt: time,
  updatedAt: time,
  resolution: null,
  receipt: receipt(),
});
describe("canonical receipt presentation", () => {
  test("prints the approved fixed logo and canonical meal contents without changing money or extras", () => {
    const legacy = receipt();
    expect(receiptSchema.parse(legacy).items[0]).not.toHaveProperty("mealComponents");
    const value = receipt();
    value.paymentMethod = "cash";
    value.items[0]!.mealComponents = [
      { slot: "side", name: "Fries with peri salt", quantityPerParent: 1, replacement: false },
      { slot: "drink", name: "Mango <Mirage>", quantityPerParent: 1, replacement: true },
    ];
    const parsed = receiptSchema.parse(value);
    expect(validateReceipt(parsed)).toEqual(validateReceipt(value));
    expect(parsed.totalPence).toBe(legacy.totalPence);
    expect(parsed.items[0]!.modifiers).toEqual(legacy.items[0]!.modifiers);
    const html = renderToStaticMarkup(createElement(ReceiptPreview, { receipt: parsed }));
    expect(html).toContain(`src="${receiptLogoSource}"`);
    expect(html).toContain('data-receipt-logo="true"');
    expect(html).toContain('alt="MealDeck"');
    expect(html).toContain("Meal includes");
    expect(html).toContain("2× Fries with peri salt");
    expect(html).toContain("2× Mango &lt;Mirage&gt;");
    expect(html).toContain("replaces standard drink");
    expect(html).toContain("CASH PAID");
    expect(html).toContain("extra with item above");
    expect(html).toContain("Burger add-ons: 1× 3 Onion rings per item");
    expect(html).toContain("£5.98 each");
    expect(html).toContain("£11.96");
    expect(html).toContain("£4.50 each");
    expect(html).toContain("£9.00");
    expect(html).not.toContain("£1.99");
    expect(html).toContain("£14.67");
    expect(renderToStaticMarkup(createElement(ReceiptPreview, { receipt: legacy }))).not.toContain(
      "Meal includes",
    );
  });

  test("legacy portion and meal adjustments retain all choices with full inclusive prices", () => {
    const value = receipt();
    const original = value.items[0]!;
    const wings = (lineId: string, choice: string) => ({
      ...original,
      lineId,
      brandName: "Tavo",
      name: "Fried Chicken Wings",
      quantity: 1,
      baseUnitPence: 299,
      unitPence: 350,
      linePence: 350,
      modifiers: [
        {
          name: choice,
          groupName: "Portion & flavour",
          quantityPerParent: 1,
          priceDeltaPence: 51,
        },
      ],
    });
    value.items = [
      wings("wings-korean", "Korean BBQ · 3 pcs"),
      wings("wings-chilli", "Fiery Sweet Chilli · 3 pcs"),
      {
        ...original,
        lineId: "burger-meal",
        quantity: 1,
        baseUnitPence: 399,
        unitPence: 649,
        linePence: 649,
        modifiers: [
          {
            name: "Make it a meal",
            groupName: "Meal",
            quantityPerParent: 1,
            priceDeltaPence: 250,
          },
          {
            name: "Rubicon Mango",
            groupName: "Included meal drink",
            quantityPerParent: 1,
            priceDeltaPence: 0,
          },
        ],
      },
    ];
    value.packingPlan.separateBags = false;
    value.packingPlan.bags = [
      { number: 1, allocations: value.items.map((item) => ({ lineId: item.lineId, quantity: 1 })) },
    ];
    value.subtotalPence = 1349;
    value.discountPence = 405;
    value.totalPence = 944;
    const canonical = JSON.stringify(validateReceipt(value));
    const parsed = receiptSchema.parse(value);
    const html = renderToStaticMarkup(createElement(ReceiptPreview, { receipt: parsed }));
    for (const label of [
      "Korean BBQ · 3 pcs",
      "Fiery Sweet Chilli · 3 pcs",
      "Make it a meal",
      "Rubicon Mango",
      "Choices included in item price",
      "£3.50 each",
      "£6.49 each",
      "£13.49",
      "£4.05",
      "£9.44",
    ])
      expect(html).toContain(label);
    for (const internalAmount of ["£0.51", "£2.99", "£2.50", "£3.99"])
      expect(html).not.toContain(internalAmount);
    expect(JSON.stringify(validateReceipt(value))).toBe(canonical);
    expect(JSON.stringify(validateReceipt(parsed))).toBe(canonical);
    expect(parsed.items[0]!.modifiers[0]!.priceDeltaPence).toBe(51);
    expect(parsed.items[2]!.modifiers[0]!.priceDeltaPence).toBe(250);
  });

  test("meal metadata rejects duplicate slots, prices and unsafe or missing contents", () => {
    const component = { slot: "side", name: "Fries", quantityPerParent: 1, replacement: false };
    for (const mealComponents of [
      [component, component],
      [{ ...component, name: "Fries\u202e" }],
      [{ ...component, quantityPerParent: 0 }],
      [{ ...component, name: "" }],
      [{ ...component, slot: "main", replacement: true }],
    ]) {
      const value = receipt();
      Object.assign(value.items[0]!, { mealComponents });
      expect(() => receiptSchema.parse(value)).toThrow();
      expect(() => validateReceipt(value)).toThrow();
    }
  });

  test("logo readiness waits for a real decoded image and rejects a failed load", async () => {
    const image = Object.assign(new EventTarget(), {
      complete: false,
      naturalWidth: 0,
      decoded: 0,
      async decode() {
        this.decoded++;
      },
    });
    let ready = false;
    const loading = waitForReceiptLogo(image as unknown as HTMLImageElement).then(() => {
      ready = true;
    });
    await Promise.resolve();
    expect(ready).toBe(false);
    image.naturalWidth = 1106;
    image.complete = true;
    image.dispatchEvent(new Event("load"));
    await loading;
    expect(ready).toBe(true);
    expect(image.decoded).toBe(1);
    const broken = Object.assign(new EventTarget(), { complete: false, naturalWidth: 0 });
    const failed = waitForReceiptLogo(broken as unknown as HTMLImageElement);
    broken.dispatchEvent(new Event("error"));
    await expect(failed).rejects.toThrow("receipt logo could not be loaded");
  });

  test("browser and hardware validators retain exactly the same optional order number", () => {
    const legacy = receipt();
    expect(receiptSchema.parse(legacy)).not.toHaveProperty("orderNumber");
    expect(validateReceipt(legacy)).not.toHaveProperty("orderNumber");
    for (const orderNumber of ["0001", "10000", "9223372036854775807", null]) {
      const value = { ...legacy, orderNumber };
      const browser = receiptSchema.parse(value);
      const hardware = validateReceipt(value);
      expect(browser.orderNumber).toBe(orderNumber);
      expect(hardware.orderNumber).toBe(orderNumber);
      expect(browser.displayCode).toBe("0427");
      expect(validateReceipt(browser)).toEqual(hardware);
      expect(browser.items).toEqual(legacy.items);
      expect(browser.packingPlan).toEqual(legacy.packingPlan);
      expect(browser.totalPence).toBe(legacy.totalPence);
    }
    for (const orderNumber of ["0000", "1", "00001", "0001\n", "0001\u202e", 1]) {
      const value = { ...legacy, orderNumber };
      expect(() => receiptSchema.parse(value)).toThrow();
      expect(() => validateReceipt(value)).toThrow();
    }
  });
  test("retains each person's name on parent and attached-extra allocations across both receipt parsers", () => {
    const value = receipt();
    value.packingPlan.bags[0]!.name = "Amer";
    value.packingPlan.bags[1]!.name = "Jay";
    const parsed = receiptSchema.parse(validateReceipt(value));
    for (const line of parsed.items)
      expect(receiptItemBags(parsed, line.lineId)).toEqual([
        { number: 1, name: "Amer", quantity: 1 },
        { number: 2, name: "Jay", quantity: 1 },
      ]);
    expect(parsed.items).toEqual(value.items);
    expect(parsed.totalPence).toBe(value.totalPence);
  });
  test("renders escaped packing names beside quantities while flavours and extras remain visible", () => {
    const value = receipt();
    value.packingPlan.bags[0]!.name = "<Amer & Jay>";
    value.packingPlan.bags[1]!.name = "Alex";
    const html = renderToStaticMarkup(createElement(ReceiptPreview, { receipt: value }));
    expect(html).toContain("&lt;Amer &amp; Jay&gt; · Bag 1: 1×");
    expect(html).not.toContain("<Amer & Jay>");
    expect(html).toContain("Alex · Bag 2: 1×");
    expect(html).toContain("3 Onion rings");
    expect(html).toContain("Mango Mirage");
    expect(html).toContain("extra with item above");
  });
  test("both receipt parsers reject changed or unsafe stored packing names", () => {
    for (const name of [
      "",
      "Amer ",
      "Amer  Khan",
      "Amer\u00a0Khan",
      "Amer\u3000Khan",
      "A".repeat(33),
      "Amer\n",
      "Amer\u202e",
      null,
    ]) {
      const value = receipt();
      Object.assign(value.packingPlan.bags[0]!, { name });
      expect(() => receiptSchema.parse(value)).toThrow();
      expect(() => validateReceipt(value)).toThrow();
    }
    const value = receipt();
    value.packingPlan.bags[0]!.name = "🧑".repeat(32);
    expect(receiptSchema.parse(validateReceipt(value)).packingPlan.bags[0]!.name).toBe(
      value.packingPlan.bags[0]!.name,
    );
  });
  test("keeps paid extras under the parent, all money and quantity splits", () => {
    const r = receiptSchema.parse(receipt());
    expect(r.items[0]?.modifiers[0]?.priceDeltaPence).toBe(199);
    expect(receiptItemBags(r, "line-1-extra-drink")).toEqual([
      { number: 1, quantity: 1 },
      { number: 2, quantity: 1 },
    ]);
    expect(r.cutleryRequested).toBe(true);
  });
  test("rejects a changed price, invalid paid chronology or mismatched modifier total", () => {
    for (const change of [
      (r: MealDeckReceipt) => {
        r.totalPence++;
      },
      (r: MealDeckReceipt) => {
        r.items[0]!.quantity++;
      },
      (r: MealDeckReceipt) => {
        r.items[0]!.modifiers[0]!.priceDeltaPence = 200;
      },
      (r: MealDeckReceipt) => {
        r.paidAt = "2026-11-04T12:00:00Z";
      },
    ]) {
      const r = receipt();
      change(r);
      expect(() => receiptSchema.parse(r)).toThrow();
    }
  });
  test("rejects dropped, duplicated, unknown and misallocated bags or parent extras", () => {
    for (const change of [
      (r: MealDeckReceipt) => {
        r.packingPlan.bags.pop();
      },
      (r: MealDeckReceipt) => {
        r.packingPlan.bags[1]!.number = 1;
      },
      (r: MealDeckReceipt) => {
        r.packingPlan.bags[0]!.allocations.push({ lineId: "unknown", quantity: 1 });
      },
      (r: MealDeckReceipt) => {
        r.items[1]!.parentLineId = "missing";
      },
      (r: MealDeckReceipt) => {
        r.packingPlan.bags[0]!.allocations[1]!.quantity = 2;
        r.packingPlan.bags[1]!.allocations.pop();
      },
    ]) {
      const r = receipt();
      change(r);
      expect(() => receiptSchema.parse(r)).toThrow();
    }
  });
  test("requires explicit copy provenance and scoped board identity", () => {
    const r = receipt();
    r.copyNumber = 2;
    expect(() => receiptSchema.parse(r)).toThrow();
    r.reprintOf = id(2);
    r.reprintReason = "Paper jam inspected";
    expect(receiptSchema.parse(r).copyNumber).toBe(2);
    const board = {
      schemaVersion: 1,
      tenantId: id(10),
      locationId: id(11),
      generatedAt: time,
      jobs: [job()],
    };
    expect(parsePrinterBoard(board, { tenantId: id(10), locationId: id(11) }).jobs).toHaveLength(1);
    expect(() => parsePrinterBoard(board, { tenantId: id(10), locationId: id(12) })).toThrow();
  });
  test("a receipt claim must match one claimed job and cannot turn sent state into a new print", () => {
    expect(
      parseClaim({ ...job(), status: "claimed", claimToken: id(3), replayed: false }, id(2))
        .claimToken,
    ).toBe(id(3));
    expect(() =>
      parseClaim({ ...job(), status: "sending", claimToken: id(3), replayed: true }, id(2)),
    ).toThrow();
    expect(() =>
      parseClaim({ ...job(), status: "claimed", claimToken: id(3), replayed: false }, id(9)),
    ).toThrow();
  });
});

import { confirmReceiptPaper } from "../src/lib/mealdeck-printer-recovery";
describe("printer paper confirmation recovery", () => {
  test("does not hide a paper check when the paired local journal is offline or unresolved", async () => {
    let serverCalls = 0;
    await expect(
      confirmReceiptPaper({
        resolveLocal: async () => {
          throw new Error("network interrupted");
        },
        confirmServer: async () => {
          serverCalls++;
        },
      }),
    ).rejects.toThrow("network interrupted");
    expect(serverCalls).toBe(0);
  });
  test("explicit absent local record supports browser-dialog printing; resolved local journal precedes server acknowledgement", async () => {
    const calls: string[] = [];
    await confirmReceiptPaper({
      resolveLocal: async () => {
        calls.push("local");
        return "resolved";
      },
      confirmServer: async () => {
        calls.push("server");
      },
    });
    expect(calls).toEqual(["local", "server"]);
    let browserConfirmed = false;
    await confirmReceiptPaper({
      resolveLocal: async () => "missing",
      confirmServer: async () => {
        browserConfirmed = true;
      },
    });
    expect(browserConfirmed).toBe(true);
  });
});
