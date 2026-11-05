import { describe, expect, test } from "bun:test";
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
