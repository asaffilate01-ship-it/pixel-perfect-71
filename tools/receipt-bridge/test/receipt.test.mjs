import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  validateReceipt,
  encodeReceipt,
  encodeReceiptLogo,
  encodeReceiptGamesQr,
  RECEIPT_LIMITS,
} from "../receipt.mjs";
import { receiptLogo } from "../receipt-logo.mjs";
import { fixture, JOB } from "./fixtures.mjs";

// Printer commands are checked outside the two trusted, length-framed graphics.
// Pixel bytes can contain every byte value without becoming ESC/POS commands.
const receiptBodyBytes = (result) => {
  const body = Buffer.from(result.bytes.slice(2 + encodeReceiptLogo().length));
  const qr = Buffer.from(encodeReceiptGamesQr());
  const position = body.indexOf(qr);
  assert.ok(position > 0, "the fixed games QR is present after the order");
  assert.equal(body.indexOf(qr, position + 1), -1, "exactly one fixed games QR");
  return Buffer.concat([body.subarray(0, position), body.subarray(position + qr.length)]);
};

test("one approved logo retains its exact fixed raster before the receipt body", () => {
  const logo = encodeReceiptLogo();
  assert.deepEqual([...logo.slice(0, 3)], [27, 97, 1]);
  assert.deepEqual([...logo.slice(3, 18)], [29, 40, 76, 74, 32, 48, 112, 48, 1, 1, 49, 0, 1, 2, 1]);
  const raster = logo.slice(18, 18 + 8256);
  assert.equal(raster.length, 32 * 258);
  assert.equal(
    createHash("sha256").update(raster).digest("hex"),
    "c0fbaa3f0d4df08e0ab3841f1489868b4bb17a3ad213b6da745a95d64db233d0",
  );
  assert.equal(
    receiptLogo.sourceRgbaSha256,
    "189f6d001fc02fae56197c6f9d771892ca1f6fae79625600c5596ad4f47639c3",
  );
  assert.deepEqual([...logo.slice(18 + 8256)], [29, 40, 76, 2, 0, 48, 50, 27, 97, 0]);
  const value = fixture();
  const before = JSON.stringify(validateReceipt(value));
  const result = encodeReceipt(value);
  assert.deepEqual(result.bytes.slice(2, 2 + logo.length), logo);
  assert.equal(new TextDecoder().decode(receiptBodyBytes(result)), result.text + "\n\n\n\n");
  assert.equal(JSON.stringify(validateReceipt(value)), before);
  assert.equal(result.text.match(/END OF RECEIPT/g)?.length, 1);
  for (const key of ["logo", "logoUrl", "raster", "image"])
    assert.throws(() => encodeReceipt({ ...value, [key]: "https://untrusted.invalid/logo" }), {
      code: "unexpected_receipt_fields",
    });
});

test("canonical order number prints separately from the unchanged collection credential", () => {
  const legacy = fixture();
  assert.equal(Object.hasOwn(validateReceipt(legacy), "orderNumber"), false);
  assert.match(encodeReceipt(legacy).text, /ORDER 0427/);
  for (const orderNumber of ["0001", "0002", "10000", "9223372036854775807"]) {
    const value = { ...legacy, orderNumber };
    const normalized = validateReceipt(value);
    assert.equal(normalized.orderNumber, orderNumber);
    assert.equal(normalized.displayCode, "0427");
    assert.deepEqual(normalized.items, validateReceipt(legacy).items);
    assert.deepEqual(normalized.packingPlan, validateReceipt(legacy).packingPlan);
    assert.equal(normalized.totalPence, legacy.totalPence);
    const printed = encodeReceipt(value).text;
    assert.ok(printed.includes("ORDER " + orderNumber));
    assert.match(printed, /Collection code: 0427/);
    assert.equal(printed.match(/END OF RECEIPT/g)?.length, 1);
  }
  assert.equal(validateReceipt({ ...legacy, orderNumber: null }).orderNumber, null);
  for (const orderNumber of [
    undefined,
    "",
    "0000",
    "1",
    "00001",
    "0001\n",
    "0001\x1b@",
    "0001\u202e",
    "9".repeat(20),
    1,
  ])
    assert.throws(() => encodeReceipt({ ...legacy, orderNumber }), {
      code: "invalid_receipt_order_number",
    });
});

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
  r.packingPlan.bags[0].name = "Amer";
  r.packingPlan.bags[1].name = "Jay";
  const named = encodeReceipt(r).text.split("1 x Cruncher");
  assert.match(named[1], /Packing: Amer - Bag 1 x1/);
  assert.match(named[1], /Korean BBQ/);
  assert.doesNotMatch(named[1], /Dynamite/);
  assert.match(named[2], /Packing: Jay - Bag 2 x1/);
  assert.match(named[2], /Dynamite/);
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
    "Choices included in item price:",
    "Each, including choices",
    "GBP 8.49",
    "No gherkin",
    "LOAD'D",
    "King of Hearts loaded fries",
    "MOKTL",
    "Mango Mirage",
    "Mocktail flavour",
    "per item",
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
  assert.equal([...receiptBodyBytes(result)].filter((byte) => byte === 27).length, 0);
  assert.equal(
    [...receiptBodyBytes(result)].filter((byte) => byte === 29).length,
    0,
    "cutter disabled by default",
  );
  assert.equal(result.text.match(/END OF RECEIPT/g)?.length, 1);
  assert.deepEqual([...result.bytes.slice(-4)], [10, 10, 10, 10]);
  assert.ok(result.text.split("\n").every((line) => line.length <= 42));
  assert.ok(result.bytes.length < RECEIPT_LIMITS.bytes);
});

test("legacy portion and meal deltas never print as extra charges while inclusive prices and fingerprints remain", () => {
  const r = fixture();
  const original = r.items[0];
  const wings = (lineId, choice) => ({
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
  r.items = [
    wings("wings-korean", "Korean BBQ · 3 pcs"),
    wings("wings-chilli", "Fiery Sweet Chilli · 3 pcs"),
    {
      ...original,
      lineId: "burger-meal",
      brandName: "Skorch",
      name: "The Ace",
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
  r.packingPlan.separateBags = false;
  r.packingPlan.bags = [
    { number: 1, allocations: r.items.map((item) => ({ lineId: item.lineId, quantity: 1 })) },
  ];
  r.subtotalPence = 1349;
  r.discountPence = 405;
  r.totalPence = 944;
  const canonical = JSON.stringify(validateReceipt(r));
  const fingerprint = createHash("sha256").update(canonical).digest("hex");
  for (const columns of [32, 42]) {
    const rendered = encodeReceipt(r, { columns });
    const text = rendered.text.replace(/\n\s*/g, " ");
    for (const label of [
      "Korean BBQ - 3 pcs x1 per item",
      "Fiery Sweet Chilli - 3 pcs x1 per item",
      "Make it a meal x1 per item",
      "Rubicon Mango x1 per item",
      "Choices included in item price:",
      "GBP 3.50",
      "GBP 6.49",
      "GBP 13.49",
      "GBP 4.05",
      "GBP 9.44",
    ])
      assert.ok(text.includes(label), label);
    for (const internalAmount of ["GBP 0.51", "GBP 2.99", "GBP 2.50", "GBP 3.99", "Base each"])
      assert.equal(text.includes(internalAmount), false, internalAmount);
    assert.deepEqual(rendered.bytes.slice(2, 2 + encodeReceiptLogo().length), encodeReceiptLogo());
    assert.ok(rendered.text.split("\n").every((line) => line.length <= columns));
  }
  assert.equal(JSON.stringify(validateReceipt(r)), canonical);
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(validateReceipt(r)))
      .digest("hex"),
    fingerprint,
  );
  assert.equal(r.items[0].modifiers[0].priceDeltaPence, 51);
  assert.equal(r.items[2].modifiers[0].priceDeltaPence, 250);
  const extras = encodeReceipt(fixture()).text.replace(/\n\s*/g, " ");
  assert.match(extras, /King of Hearts loaded fries/);
  assert.match(extras, /Mango Mirage/);
  assert.equal(extras.match(/GBP 5\.98/g)?.length, 2);
  assert.doesNotMatch(extras, /GBP 1\.50 each item/);
});

test("names survive canonical validation and print beside food choices and each packing bag", () => {
  const r = fixture();
  r.packingPlan.bags[0].name = "Amer";
  r.packingPlan.bags[1].name = "Jay";
  assert.deepEqual(validateReceipt(r).packingPlan.bags, r.packingPlan.bags);
  const result = encodeReceipt(r, { columns: 32 });
  const text = result.text.replace(/\n\s*/g, " ");
  assert.match(text, /Packing: Amer - Bag 1 x1, Jay - Bag 2 x1/);
  assert.match(text, /BAG 1 OF 2 For: Amer/);
  assert.match(text, /BAG 2 OF 2 For: Jay/);
  for (const expected of [
    "Fiery Sweet Chilli",
    "King of Hearts loaded fries",
    "Mocktail flavour",
    "Mango Mirage",
    "GBP 20.26",
  ])
    assert.ok(text.includes(expected), expected);
  assert.ok(result.text.split("\n").every((line) => line.length <= 32));
  assert.equal([...receiptBodyBytes(result)].filter((byte) => byte === 27).length, 0);
  assert.equal([...receiptBodyBytes(result)].filter((byte) => byte === 29).length, 0);
});

test("packing names reject all C0/C1, bidi, noncanonical and unknown fields before any print", () => {
  const controls = [
    ...Array.from({ length: 32 }, (_, index) => index),
    ...Array.from({ length: 33 }, (_, index) => 127 + index),
    0x061c,
    0x200e,
    0x200f,
    0x2028,
    0x2029,
    0x202a,
    0x202e,
    0x2066,
    0x2069,
  ];
  for (const name of [
    "",
    "Amer ",
    "Amer  Khan",
    "Amer\u00a0Khan",
    "Amer\u3000Khan",
    "A".repeat(33),
    null,
    ...controls.map((code) => "Amer" + String.fromCodePoint(code)),
  ]) {
    const r = fixture();
    r.packingPlan.bags[0].name = name;
    assert.throws(() => encodeReceipt(r), { code: "invalid_packing_name" });
  }
  const r = fixture();
  r.packingPlan.bags[0].name = "Amer";
  r.packingPlan.bags[0].rawBytes = "anything";
  assert.throws(() => encodeReceipt(r), { code: "unexpected_receipt_fields" });
});

test("Unicode packing names stay in the snapshot with an explicit printer fallback and a numbered label", () => {
  const r = fixture();
  r.packingPlan.bags[0].name = "أمير 👩‍🍳";
  assert.equal(validateReceipt(r).packingPlan.bags[0].name, r.packingPlan.bags[0].name);
  const result = encodeReceipt(r);
  assert.deepEqual(result.warnings, ["ascii_replacement_characters"]);
  assert.match(result.text, /BAG 1 OF 2/);
  assert.match(result.text, /For: \?/);
  assert.match(result.text, /Some characters shown as \?/);
});

test("configured cutter is exactly one final command, with bounded feed and no repeat command", () => {
  for (const [cut, code] of [
    ["partial", 1],
    ["full", 0],
  ]) {
    const result = encodeReceipt(fixture(), { cut, feedLines: 2, columns: 32 });
    assert.deepEqual([...result.bytes.slice(-6)], [10, 10, 10, 29, 86, code]);
    assert.equal([...receiptBodyBytes(result)].filter((byte) => byte === 29).length, 1);
    assert.equal(result.text.match(/END OF RECEIPT/g)?.length, 1);
    assert.ok(result.text.split("\n").every((line) => line.length <= 32));
  }
  for (const profile of [{ cut: "drawer" }, { feedLines: 99 }, { columns: 80 }])
    assert.throws(() => encodeReceipt(fixture(), profile), { code: "invalid_printer_profile" });
});

test("canonical meal contents and cash label preserve amounts, extras and copy identity", () => {
  const r = fixture();
  const legacy = validateReceipt(r);
  assert.equal(Object.hasOwn(legacy, "paymentMethod"), false);
  assert.equal(Object.hasOwn(legacy.items[0], "mealComponents"), false);
  r.paymentMethod = "cash";
  r.items[0].mealComponents = [
    {
      slot: "side",
      name: "King of Hearts · Loaded Fries",
      quantityPerParent: 1,
      replacement: true,
    },
    { slot: "drink", name: "Pepsi", quantityPerParent: 1, replacement: false },
  ];
  const normalized = validateReceipt(r);
  assert.equal(normalized.totalPence, legacy.totalPence);
  assert.deepEqual(normalized.items[0].modifiers, legacy.items[0].modifiers);
  assert.equal(normalized.copyNumber, legacy.copyNumber);
  assert.equal(normalized.orderId, legacy.orderId);
  const output = encodeReceipt(r).text.replace(/\n\s*/g, " ");
  assert.match(output, /PAYMENT: CASH PAID/);
  assert.match(
    output,
    /MEAL INCLUDES: 2 x King of Hearts - Loaded Fries - replaces standard side 2 x Pepsi/,
  );
  assert.match(output, /Extra for Cruncher/);
  for (const change of [
    (v) => {
      v.items[0].mealComponents.push(v.items[0].mealComponents[0]);
    },
    (v) => {
      v.items[0].mealComponents[0].name = "Fries\x1b@";
    },
    (v) => {
      v.items[0].mealComponents[0].quantityPerParent = 0;
    },
    (v) => {
      v.items[0].mealComponents[0].pricePence = 1;
    },
    (v) => {
      v.items[0].mealComponents[0].slot = "main";
    },
    (v) => {
      v.paymentMethod = "bank";
    },
  ]) {
    const invalid = structuredClone(r);
    change(invalid);
    assert.throws(() => validateReceipt(invalid));
  }
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

test("explicit copies require provenance and signed adjustments retain their label and inclusive price", () => {
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
  const text = encodeReceipt(r).text.replace(/\n\s*/g, " ");
  assert.match(text, /Adjustment: Approved discount x1 per item/);
  assert.match(text, /Each, including choices\s+GBP 8\.49/);
  assert.doesNotMatch(text, /GBP -0\.50/);
  assert.equal(validateReceipt(r).items[0].modifiers.at(-1).priceDeltaPence, -50);
});
