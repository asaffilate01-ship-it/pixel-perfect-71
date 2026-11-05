import test from "node:test";
import assert from "node:assert/strict";
import { validateReceipt, encodeReceipt, RECEIPT_LIMITS } from "../receipt.mjs";
import { fixture, JOB } from "./fixtures.mjs";

test("same-named meals with different flavours print their own bag allocation beside the full choices", () => {
  const r = fixture();
  const first = { ...r.items[0], quantity: 1, linePence: 849 };
  const second = structuredClone(first);
  second.lineId = "second-burger";
  first.modifiers[1].name = "Korean BBQ";
  second.modifiers[1].name = "Dynamite";
  r.items = [first, second];
  r.subtotalPence = 1698;
  r.discountPence = 0;
  r.totalPence = 1698;
  r.packingPlan.bags = [
    { number: 1, allocations: [{ lineId: first.lineId, quantity: 1 }] },
    { number: 2, allocations: [{ lineId: second.lineId, quantity: 1 }] },
  ];
  const result = encodeReceipt(r).text.split("1 x Cruncher");
  assert.equal(result.length, 3);
  assert.match(result[1], /Packing: Bag 1 x1/);
  assert.match(result[1], /Korean BBQ/);
  assert.doesNotMatch(result[1], /Dynamite/);
  assert.match(result[2], /Packing: Bag 2 x1/);
  assert.match(result[2], /Dynamite/);
});

test("one receipt prints exact paid time, flavours, extras, amounts, bags and cutlery", () => {
  const result = encodeReceipt(fixture());
  const text = result.text.replace(/\n\s*/g, " ");
  for (const expected of [
    "ORDER 0427",
    "Placed / paid: 05/11/2026, 16:05",
    "Accepted: 05/11/2026, 16:06",
    "KERBSIDE PICKUP",
    "Blue Ford / last 4: AB12",
    "TAVO",
    "Fiery Sweet Chilli",
    "GBP 1.50 each item",
    "No gherkin",
    "LOAD'D",
    "King of Hearts loaded fries",
    "MOKTL",
    "Mango Mirage",
    "Mocktail flavour",
    "included",
    "GBP 28.94",
    "GBP 8.68",
    "GBP 20.26",
    "BAG 1 OF 2",
    "BAG 2 OF 2",
    "CUTLERY: REQUESTED",
    "313 Brands Ltd",
    "END OF RECEIPT",
  ])
    assert.ok(text.includes(expected), expected);
  assert.equal(
    text.includes("15:55"),
    false,
    "checkout draft time must not be printed as placed time",
  );
  assert.deepEqual([...result.bytes.slice(0, 2)], [27, 64]);
  assert.equal([...result.bytes].filter((byte) => byte === 27).length, 1);
  assert.equal(
    [...result.bytes].filter((byte) => byte === 29).length,
    0,
    "cutter disabled by default",
  );
  assert.equal(result.text.match(/END OF RECEIPT/g)?.length, 1);
  assert.deepEqual([...result.bytes.slice(-4)], [10, 10, 10, 10]);
  assert.ok(result.text.split("\n").every((line) => line.length <= 42));
  assert.ok(result.bytes.length < RECEIPT_LIMITS.bytes);
});

test("configured cutter is exactly one final command, with bounded feed and no repeat command", () => {
  for (const [cut, code] of [
    ["partial", 1],
    ["full", 0],
  ]) {
    const result = encodeReceipt(fixture(), { cut, feedLines: 2, columns: 32 });
    assert.deepEqual([...result.bytes.slice(-6)], [10, 10, 10, 29, 86, code]);
    assert.equal([...result.bytes].filter((byte) => byte === 29).length, 1);
    assert.equal(result.text.match(/END OF RECEIPT/g)?.length, 1);
    assert.ok(result.text.split("\n").every((line) => line.length <= 32));
  }
  for (const profile of [{ cut: "drawer" }, { feedLines: 99 }, { columns: 80 }])
    assert.throws(() => encodeReceipt(fixture(), profile), { code: "invalid_printer_profile" });
});

test("rejects tampered totals, omitted modifiers, duplicate lines and inconsistent packing before rendering", () => {
  const changes = [
    (r) => r.items[0].modifiers.pop(),
    (r) => r.items[0].linePence++,
    (r) => r.totalPence++,
    (r) => (r.items[1].lineId = r.items[0].lineId),
    (r) => r.packingPlan.bags[0].allocations.pop(),
    (r) => (r.packingPlan.bags[1].number = 4),
    (r) => (r.packingPlan.cutleryRequested = false),
    (r) => (r.items[1].parentLineId = "missing"),
    (r) => (r.items[1].quantity = 3),
    (r) => (r.packingPlan.separateBags = false),
    (r) => (r.paidAt = "2026-11-05T16:07:00Z"),
    (r) => delete r.paidAt,
    (r) => (r.orderId = r.orderId.toUpperCase()),
  ];
  for (const change of changes) {
    const receipt = fixture();
    change(receipt);
    assert.throws(() => encodeReceipt(receipt));
  }
});

test("control bytes, bidi controls, printer addresses and raw commands cannot enter the DTO", () => {
  for (const value of ["Name\x1b@", "Name\x1dV\0", "Name\u202Efake", "Name\x0c"]) {
    const r = fixture();
    r.customerName = value;
    assert.throws(() => encodeReceipt(r), { code: "invalid_receipt_text" });
  }
  for (const key of ["rawBytes", "printerHost", "copies", "command"]) {
    assert.throws(() => encodeReceipt({ ...fixture(), [key]: "anything" }), {
      code: "unexpected_receipt_fields",
    });
  }
  const r = fixture();
  r.items[0].notes = "No gherkin\nPlease\tcheck";
  assert.equal(validateReceipt(r).items[0].notes, "No gherkin Please check");
});

test("unicode fallback is explicit, and an oversized order is rejected whole", () => {
  const r = fixture();
  r.items[0].name = "Bürgér 🍔";
  const result = encodeReceipt(r);
  assert.match(result.text, /Burger \?\?/);
  assert.deepEqual(result.warnings, ["ascii_replacement_characters"]);
  assert.match(result.text, /Some characters shown as \?/);
  r.orderNotes = "x".repeat(20000);
  r.items[0].notes = "y".repeat(20000);
  assert.throws(() => encodeReceipt(r), { code: "receipt_too_long" });
});

test("explicit copies require original reference and reason; a signed modifier remains itemised", () => {
  const r = fixture();
  r.copyNumber = 2;
  assert.throws(() => validateReceipt(r), { code: "invalid_reprint_receipt" });
  r.reprintOf = JOB;
  r.reprintReason = "Original paper damaged";
  assert.match(encodeReceipt(r).text, /REPRINT - COPY 2/);
  r.items[0].baseUnitPence += 50;
  r.items[0].modifiers.push({
    name: "Approved discount",
    groupName: "Adjustment",
    quantityPerParent: 1,
    priceDeltaPence: -50,
  });
  assert.match(encodeReceipt(r).text.replace(/\n\s*/g, " "), /GBP -0.50 each item/);
});
