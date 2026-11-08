import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReceiptPreview } from "../src/components/ops/receipt-preview";
import { ReceiptQueueList } from "../src/components/ops/printer-receipt-list";
import { validateReceipt } from "../tools/receipt-bridge/receipt.mjs";
import { receiptLogoSource, waitForReceiptLogo } from "../src/lib/mealdeck-receipt-logo";
import { receiptPromotions, receiptPromotionForOrder } from "../src/lib/mealdeck-receipt-games";
import { printerQueueView } from "../src/lib/mealdeck-printer-queue";
import {
  receiptSchema,
  parsePrinterBoard,
  parseClaim,
  receiptItemBags,
  type MealDeckReceipt,
  type PrinterJob,
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
  test("places the first rotation slot after the full order and before the footer without changing the snapshot", () => {
    const value = receipt();
    value.orderNumber = "0001";
    const promotion = receiptPromotions[0]!;
    value.orderNotes = "Keep the labelled bags together.";
    value.packingPlan.bags[0]!.name = "Amer";
    value.packingPlan.bags[1]!.name = "Jay";
    const snapshot = JSON.stringify(validateReceipt(value));
    const original = JSON.stringify(value);
    const html = renderToStaticMarkup(createElement(ReceiptPreview, { receipt: value }));
    const qrPosition = html.indexOf("data-receipt-games-qr");
    expect(qrPosition).toBeGreaterThan(html.indexOf("£14.67"));
    expect(qrPosition).toBeGreaterThan(html.indexOf(value.orderNotes));
    expect(qrPosition).toBeGreaterThan(html.indexOf("Amer · Bag 1"));
    expect(qrPosition).toBeGreaterThan(html.indexOf("Jay · Bag 2"));
    expect(html).toContain("Amer · Bag 1");
    expect(html).toContain("Jay · Bag 2");
    expect(qrPosition).toBeLessThan(html.indexOf("<footer"));
    expect(html.match(/data-receipt-games-qr/g)).toHaveLength(1);
    expect(html).toContain("Got a minute? Play MealDeck.");
    expect(html).toContain("Scan for free food games");
    expect(html).toContain('href="https://mealdeck.co.uk/play"');
    expect(html).toContain(">mealdeck.co.uk/play</a>");
    expect(html).toContain('viewBox="0 0 41 41"');
    expect(html).toContain('shape-rendering="crispEdges"');
    expect(html).toContain(`<path d="${promotion.svgPath}" fill="#000"`);
    expect(html).toContain(`src="${receiptLogoSource}"`);
    expect(html).toContain("313 Brands Ltd.");
    expect(html).toContain("Powered by Dishbee");
    expect(html).toContain("INCLUDE CUTLERY");
    expect(html).toContain("Mango Mirage");
    expect(JSON.stringify(validateReceipt(value))).toBe(snapshot);
    expect(JSON.stringify(value)).toBe(original);
    const untrusted = { ...value, qrUrl: "https://untrusted.invalid/private", qrBytes: "abc" };
    expect(renderToStaticMarkup(createElement(ReceiptPreview, { receipt: untrusted }))).toBe(html);
  });

  test("rotates one public promotion after PAID in the requested order and repeats after eight receipts", () => {
    const slots = [
      "play",
      "tiktok",
      "instagram",
      "skorch",
      "tavo-chicken",
      "loadd",
      "moktl",
      "souvano",
    ];
    const targets = [
      "https://mealdeck.co.uk/play",
      "https://www.tiktok.com/@mealdeckofficial",
      "https://www.instagram.com/mealdeckofficial/",
    ];
    for (let order = 1; order <= 16; order++) {
      const value = receipt();
      value.orderNumber = String(order).padStart(4, "0");
      value.orderNotes = "Keep both bags together.";
      const original = JSON.stringify(value);
      const html = renderToStaticMarkup(
        createElement(ReceiptPreview, {
          receipt: value,
          customerPhone: "+447700900123",
        }),
      );
      const slot = (order - 1) % 8;
      const marker = `data-receipt-promotion="${slots[slot]}"`;
      const start = html.indexOf(marker);
      expect(start).toBeGreaterThan(html.indexOf("£14.67"));
      expect(start).toBeGreaterThan(html.indexOf(value.orderNotes));
      expect(start).toBeLessThan(html.indexOf("<footer"));
      expect(html.match(/data-receipt-promotion="/g)).toHaveLength(1);
      expect(html.match(/data-receipt-promotion-art="/g)).toHaveLength(1);
      expect(html).toContain(`md-receipt-promotion__art--${slot < 3 ? "qr" : "brand"}`);
      if (slot < 3) expect(html).toContain(`href="${targets[slot]}"`);
      else expect(html.slice(start, html.indexOf("<footer"))).not.toContain("href=");
      expect(html).not.toContain("/play/receipt");
      expect(html).toContain("COLLECTION CODE");
      expect(html).toContain('font-black tabular-nums">0427</strong>');
      expect(html).toContain("Fixture customer</p>");
      expect(html).toContain("+447700900123</p>");
      expect(html).toContain("Burger add-ons: 1× 3 Onion rings per item");
      expect(html).toContain("INCLUDE CUTLERY");
      expect(html).toContain("Powered by Dishbee");
      expect(html).toContain("ONE ORDER. EVERY CRAVING.");
      if (slot === 7) expect(html).toContain("Souvano’s Greek &amp; Turkish favourites.");
      expect(JSON.stringify(value)).toBe(original);
    }
  });

  test("numbered reprints and historical receipts retain the same promotion without payload changes", () => {
    const promotionMarkup = (html: string) =>
      html.match(/<section class="md-receipt-promotion"[\s\S]*?<\/section>/)?.[0];
    for (const value of [
      receipt(),
      { ...receipt(), orderNumber: "0008" },
      { ...receipt(), orderNumber: "9223372036854775807" },
    ]) {
      const before = JSON.stringify(validateReceipt(value));
      const original = renderToStaticMarkup(createElement(ReceiptPreview, { receipt: value }));
      const copy = {
        ...value,
        copyNumber: 2,
        reprintOf: id(99),
        reprintReason: "Paper was incomplete",
        customerName: "A changed display name cannot select another advert",
        displayCode: "9876",
      };
      const reprinted = renderToStaticMarkup(createElement(ReceiptPreview, { receipt: copy }));
      expect(promotionMarkup(original)).toBeDefined();
      expect(promotionMarkup(reprinted)).toBe(promotionMarkup(original));
      expect(receiptPromotionForOrder(copy)).toBe(receiptPromotionForOrder(value));
      expect(JSON.stringify(validateReceipt(value))).toBe(before);
    }
  });

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
  test("retains saved contact outside the legacy receipt and binds it to the same order", () => {
    const canonical = JSON.stringify(validateReceipt(receipt()));
    const claim = { ...job(), status: "claimed", claimToken: id(3), replayed: false };
    const contact = { schemaVersion: 1, orderId: id(1), customerPhone: "+447700900123" };
    const parsed = parseClaim({ ...claim, receiptContact: contact }, id(2));
    expect(parsed.receiptContact).toEqual(contact);
    expect(JSON.stringify(validateReceipt(parsed.receipt))).toBe(canonical);
    expect(parsed.receipt).not.toHaveProperty("customerPhone");
    expect(parsed.receipt).not.toHaveProperty("receiptContact");
    expect(parseClaim(claim, id(2))).not.toHaveProperty("receiptContact");
    expect(parseClaim({ ...claim, receiptContact: null }, id(2)).receiptContact).toBeNull();
    expect(
      parseClaim({ ...claim, receiptContact: { ...contact, customerPhone: null } }, id(2))
        .receiptContact?.customerPhone,
    ).toBeNull();
    const board = {
      schemaVersion: 1,
      tenantId: id(10),
      locationId: id(11),
      generatedAt: time,
      jobs: [{ ...job(), receiptContact: contact }],
    };
    expect(
      parsePrinterBoard(board, { tenantId: id(10), locationId: id(11) }).jobs[0]!.receiptContact,
    ).toEqual(contact);
    for (const bad of [
      { ...contact, orderId: id(7) },
      { ...contact, schemaVersion: 2 },
      { ...contact, customerPhone: "07700900123" },
      { ...contact, customerPhone: "+447700900123\n" },
      { ...contact, customerPhone: "+447700900123\u202e" },
      { ...contact, customerPhone: 447700900123 },
      { ...contact, email: "private@example.invalid" },
    ])
      expect(() => parseClaim({ ...claim, receiptContact: bad }, id(2))).toThrow();
  });
});

describe("printer queue and completed history", () => {
  function queueJob(number: number, status: PrinterJob["status"]): PrinterJob {
    const value = job();
    const orderId = id(3000 + number);
    return {
      ...value,
      jobId: id(2000 + number),
      orderId,
      status,
      receipt: {
        ...value.receipt,
        orderId,
        orderNumber: String(number).padStart(4, "0"),
      },
    };
  }

  function queueMarkup(view: ReturnType<typeof printerQueueView>, fresh = true) {
    return renderToStaticMarkup(
      createElement(ReceiptQueueList, {
        view,
        fresh,
        renderJob: (entry) =>
          createElement(
            "article",
            { key: entry.jobId, "data-receipt-job": entry.jobId },
            `Order ${entry.receipt.orderNumber} · ${entry.status} · copy ${entry.copyNumber}`,
          ),
      }),
    );
  }

  test("a confirmed replacement leaves the active queue and remains in closed printed history", () => {
    const printed = queueJob(18, "printed");
    printed.copyNumber = 3;
    printed.receipt = {
      ...printed.receipt,
      copyNumber: 3,
      reprintOf: id(2017),
      reprintReason: "Replacement requested after inspecting the paper.",
    };
    const view = printerQueueView([printed], []);
    expect(view.activeJobs).toEqual([]);
    expect(view.printedJobs).toEqual([printed]);
    expect(view.actionCount).toBe(0);
    expect(view.hasLocalHolds).toBe(false);

    const html = queueMarkup(view);
    const historyPosition = html.indexOf("<details");
    expect(historyPosition).toBeGreaterThan(-1);
    expect(html.slice(0, historyPosition)).toContain("Receipt queue clear");
    expect(html.slice(0, historyPosition)).not.toContain(printed.jobId);
    expect(html.slice(historyPosition)).toContain("Recently printed");
    expect(html.slice(historyPosition)).toContain("Order 0018 · printed · copy 3");
    expect(html.match(/<details\b/g)).toHaveLength(1);
    expect(html.match(/<details\b[^>]*>/)?.[0]).not.toMatch(/\bopen(?:=|\s|>)/);
  });

  test("an empty or completed-only stale board never claims the queue is clear", () => {
    for (const jobs of [[], [queueJob(18, "printed")]]) {
      const view = printerQueueView(jobs, []);
      expect(view.actionCount).toBe(0);
      expect(queueMarkup(view, false)).not.toContain("Receipt queue clear");
      expect(queueMarkup(view, true)).toContain("Receipt queue clear");
      if (jobs.length) expect(queueMarkup(view, false)).toContain("Recently printed");
    }
  });

  test("printed paper with a local hold stays active until the local record is resolved", () => {
    const printed = queueJob(18, "printed");
    const jobs = Object.freeze([printed]);
    const holds = Object.freeze([{ jobId: printed.jobId }]);
    const view = printerQueueView(jobs, holds);
    expect(view.activeJobs).toEqual([printed]);
    expect(view.printedJobs).toEqual([]);
    expect(view.actionCount).toBe(1);
    expect(view.hasLocalHolds).toBe(true);
    const html = queueMarkup(view);
    expect(html).toContain('aria-label="Receipts needing attention"');
    expect(html).toContain(printed.jobId);
    expect(html).not.toContain("Receipt queue clear");
    expect(html).not.toContain("Recently printed");

    const resolved = printerQueueView(jobs, []);
    expect(resolved.activeJobs).toEqual([]);
    expect(resolved.printedJobs).toEqual([printed]);
    expect(resolved.actionCount).toBe(0);
    expect(resolved.hasLocalHolds).toBe(false);
    expect(view.activeJobs).toEqual([printed]);
    expect(holds).toEqual([{ jobId: printed.jobId }]);
  });

  test("failed and unfinished receipts retain their order while the full auto-print input remains intact", () => {
    const statuses: PrinterJob["status"][] = [
      "printed",
      "queued",
      "failed",
      "claimed",
      "sending",
      "sent_unconfirmed",
      "held",
      "printed",
    ];
    const jobs = Object.freeze(statuses.map((status, index) => queueJob(index + 20, status)));
    const snapshot = JSON.stringify(jobs);
    const nextQueued = jobs.find((entry) => entry.status === "queued");
    const view = printerQueueView(jobs, []);
    expect(view.activeJobs).toEqual(jobs.slice(1, 7));
    expect(view.printedJobs).toEqual([jobs[0]!, jobs[7]!]);
    expect(view.actionCount).toBe(6);
    expect(view.hasLocalHolds).toBe(false);
    for (let index = 0; index < view.activeJobs.length; index++)
      expect(view.activeJobs[index]).toBe(jobs[index + 1]);
    expect(jobs.find((entry) => entry.status === "queued")).toBe(nextQueued);
    expect(JSON.stringify(jobs)).toBe(snapshot);

    const html = queueMarkup(view);
    const activeMarkup = html.slice(0, html.indexOf("<details"));
    expect(activeMarkup).toContain(jobs[2]!.jobId);
    expect(activeMarkup).toContain("Order 0022 · failed · copy 1");
    expect(html).not.toContain("Receipt queue clear");
    for (const entry of jobs)
      expect(html.match(new RegExp(`data-receipt-job="${entry.jobId}"`, "g"))).toHaveLength(1);
  });

  test("the action count deduplicates active jobs and local holds without dropping orphan recovery", () => {
    const queued = queueJob(30, "queued");
    const failed = queueJob(31, "failed");
    const printed = queueJob(32, "printed");
    const orphanId = id(2999);
    const holds = Object.freeze([
      { jobId: queued.jobId },
      { jobId: queued.jobId },
      { jobId: printed.jobId },
      { jobId: orphanId },
      { jobId: orphanId },
    ]);
    const snapshot = JSON.stringify(holds);
    const view = printerQueueView([queued, failed, printed], holds);
    expect(view.activeJobs).toEqual([queued, failed, printed]);
    expect(view.printedJobs).toEqual([]);
    expect(view.actionCount).toBe(4);
    expect(view.hasLocalHolds).toBe(true);
    expect(JSON.stringify(holds)).toBe(snapshot);
    expect(queueMarkup(view)).not.toContain("Receipt queue clear");
  });

  test("an unresolved local receipt prevents a clear message even when every server receipt is printed", () => {
    const printed = queueJob(18, "printed");
    const view = printerQueueView([printed], [{ jobId: id(2999) }]);
    expect(view.activeJobs).toEqual([]);
    expect(view.printedJobs).toEqual([printed]);
    expect(view.actionCount).toBe(1);
    expect(view.hasLocalHolds).toBe(true);
    const html = queueMarkup(view);
    expect(html).toContain("Recently printed");
    expect(html).toContain(printed.jobId);
    expect(html).not.toContain("Receipt queue clear");
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
