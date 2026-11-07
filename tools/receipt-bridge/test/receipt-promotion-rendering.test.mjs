import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { receiptPromotions, receiptPromotionForOrder } from "../receipt-promotions.mjs";
import {
  encodeReceipt,
  encodeReceiptPromotion,
  validateReceipt,
  RECEIPT_LIMITS,
} from "../receipt.mjs";
import { fixture, JOB } from "./fixtures.mjs";

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
const orderNumber = (number) => String(number).padStart(4, "0");

test("every rotation slot has one complete bounded graphic after the total and before the full footer", () => {
  for (const columns of [32, 42, 48]) {
    for (let number = 1; number <= 16; number++) {
      const receipt = fixture();
      receipt.orderNumber = orderNumber(number);
      receipt.orderNotes = "Keep every named bag together.";
      receipt.packingPlan.bags[0].name = "Amer";
      receipt.packingPlan.bags[1].name = "Jay";
      const snapshot = JSON.stringify(validateReceipt(receipt));
      const fingerprint = createHash("sha256").update(snapshot).digest("hex");
      const promotion = receiptPromotionForOrder(receipt);
      assert.equal(promotion.id, slots[(number - 1) % 8]);

      const rendered = encodeReceipt(receipt, { columns });
      const graphic = Buffer.from(encodeReceiptPromotion(receipt));
      const bytes = Buffer.from(rendered.bytes);
      const position = bytes.indexOf(graphic);
      assert.ok(position > 0);
      assert.equal(bytes.indexOf(graphic, position + 1), -1, "exactly one promotion image");
      const pixels = Buffer.from(promotion.rasterBase64, "base64");
      assert.equal(graphic[6] + graphic[7] * 256, pixels.length + 10);
      assert.deepEqual(
        [...graphic.subarray(8, 18)],
        [
          48,
          112,
          48,
          1,
          1,
          49,
          promotion.width & 255,
          promotion.width >> 8,
          promotion.height & 255,
          promotion.height >> 8,
        ],
      );
      assert.deepEqual(graphic.subarray(18, 18 + pixels.length), pixels);
      assert.deepEqual(
        [...graphic.subarray(18 + pixels.length)],
        [29, 40, 76, 2, 0, 48, 50, 27, 97, 0],
      );

      for (let other = 0; other < slots.length; other++) {
        if (other === (number - 1) % 8) continue;
        const otherGraphic = Buffer.from(
          encodeReceiptPromotion({ ...receipt, orderNumber: orderNumber(other + 1) }),
        );
        assert.equal(bytes.indexOf(otherGraphic), -1, "no second promotion is inserted");
      }

      const before = bytes.subarray(0, position).toString();
      const after = bytes.subarray(position + graphic.length).toString();
      assert.ok(before.includes("CUTLERY: REQUESTED"));
      assert.ok(before.includes("For: Amer"));
      assert.ok(before.includes("For: Jay"));
      assert.ok(before.includes("Order note:"));
      const lines = rendered.text.split("\n");
      const total = lines.findIndex((line) => /^TOTAL\s+GBP /.test(line));
      assert.ok(total > lines.findIndex((line) => line.startsWith("Order note:")));
      assert.ok(lines[total + 1].trim(), "promotion follows the total without a blank spacer");
      assert.ok(before.lastIndexOf("TOTAL") < position);
      for (const footer of [
        "MealDeck is a trading name of",
        "313 Brands Ltd",
        "Powered by Dishbee",
        "mealdeck.co.uk",
        "END OF RECEIPT",
      ])
        assert.ok(after.includes(footer), footer);
      assert.ok(after.endsWith("END OF RECEIPT\n\n\n\n"));
      assert.equal(rendered.text.match(/END OF RECEIPT/g)?.length, 1);
      assert.ok(lines.every((line) => line.length <= columns));
      assert.ok(rendered.bytes.length < RECEIPT_LIMITS.bytes);
      assert.equal(JSON.stringify(validateReceipt(receipt)), snapshot);
      assert.equal(
        createHash("sha256")
          .update(JSON.stringify(validateReceipt(receipt)))
          .digest("hex"),
        fingerprint,
      );
    }
  }
});

test("reprints, large order numbers and legacy receipts keep their selected public artwork", () => {
  for (const receipt of [
    fixture(),
    { ...fixture(), orderNumber: "0008" },
    { ...fixture(), orderNumber: "9223372036854775807" },
  ]) {
    const copy = {
      ...receipt,
      copyNumber: 2,
      reprintOf: JOB,
      reprintReason: "Paper was incomplete",
      customerName: "Another name",
      displayCode: "9876",
      orderNotes: "Customer text never selects a promotion",
    };
    const originalGraphic = Buffer.from(encodeReceiptPromotion(receipt));
    assert.deepEqual(Buffer.from(encodeReceiptPromotion(copy)), originalGraphic);
    const result = encodeReceipt(copy);
    assert.ok(result.text.includes("REPRINT - COPY 2"));
    assert.ok(Buffer.from(result.bytes).indexOf(originalGraphic) > 0);
    assert.ok(
      Buffer.from(result.bytes).indexOf(
        originalGraphic,
        Buffer.from(result.bytes).indexOf(originalGraphic) + 1,
      ) === -1,
    );
  }
  assert.equal(
    receiptPromotionForOrder({ ...fixture(), orderNumber: "9223372036854775807" }).id,
    "moktl",
  );
});

test("receipt fields cannot inject promotional artwork or replace the fixed public links", () => {
  for (const field of [
    "promotion",
    "promotionUrl",
    "promotionId",
    "promotionPixels",
    "targetUrl",
    "rasterBase64",
    "svgPath",
  ])
    assert.throws(
      () => encodeReceipt({ ...fixture(), [field]: "https://untrusted.invalid/private" }),
      {
        code: "unexpected_receipt_fields",
      },
    );
  assert.deepEqual(
    receiptPromotions.filter((slot) => slot.kind === "qr").map((slot) => slot.targetUrl),
    [
      "https://mealdeck.co.uk/play",
      "https://www.tiktok.com/@mealdeckofficial",
      "https://www.instagram.com/mealdeckofficial/",
    ],
  );
  assert.ok(
    receiptPromotions
      .filter((slot) => slot.kind === "brand")
      .every((slot) => slot.targetUrl === null),
  );
});
