import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import jsQR from "jsqr";
import { buildReceiptPromotions } from "../build-receipt-promotions.mjs";
import {
  receiptPromotions,
  receiptPromotionForOrder,
  receiptPromotionIndex,
} from "../receipt-promotions.mjs";

const ORDER_ID = "dddddddd-4444-4444-8444-444444444444";
const IDS = ["play", "tiktok", "instagram", "skorch", "tavo-chicken", "loadd", "moktl", "souvano"];
const HEADINGS = [
  "Got a minute? Play MealDeck.",
  "Follow @mealdeckofficial on TikTok.",
  "Follow @mealdeckofficial on Instagram.",
  "Next time, try Skorch Burgers.",
  "Craving chicken? Try Tavo Chicken.",
  "Load up on fries and mac.",
  "Add a refreshing Moktl mocktail.",
  "Explore Souvano’s Greek & Turkish favourites.",
];
const URLS = [
  "https://mealdeck.co.uk/play",
  "https://www.tiktok.com/@mealdeckofficial",
  "https://www.instagram.com/mealdeckofficial/",
];

function rasterPixel(slot, raster, x, y) {
  return Boolean(raster[y * slot.rowBytes + (x >> 3)] & (0x80 >> (x & 7)));
}

test("canonical order sequence rotates all eight slots and reprints retain selection", () => {
  assert.deepEqual(
    receiptPromotions.map((slot) => slot.id),
    IDS,
  );
  for (let number = 1; number <= 32; number++) {
    const order = Object.freeze({
      orderNumber: String(number).padStart(4, "0"),
      orderId: ORDER_ID,
    });
    const slot = receiptPromotionForOrder(order);
    assert.equal(slot.id, IDS[(number - 1) % 8]);
    for (const copyNumber of [1, 2, 999]) {
      assert.equal(
        receiptPromotionForOrder({ ...order, copyNumber, reprintOf: "changed", jobId: "changed" }),
        slot,
      );
    }
  }
  // BigInt is an independent oracle: production never converts this decimal string to Number.
  for (const orderNumber of [
    "9999",
    "10000",
    "9007199254740992",
    "9007199254740993",
    "9223372036854775807",
    "9999999999999999999",
  ]) {
    assert.equal(
      receiptPromotionIndex(orderNumber, ORDER_ID),
      Number((BigInt(orderNumber) - 1n) % 8n),
    );
  }
});

test("legacy UUID fallback is stable across runtimes and does not use print-copy identity", () => {
  const vectors = [
    [ORDER_ID, 5],
    ["00000000-0000-4000-8000-000000000001", 2],
    ["00000000-0000-4000-8000-000000000002", 7],
    ["FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF", 1],
    ["12345678-1234-4234-8234-123456789abc", 6],
  ];
  for (const [orderId, index] of vectors) {
    for (const orderNumber of [undefined, null, "", "0000", "1", "00001", "1234x", "-1234"]) {
      assert.equal(receiptPromotionIndex(orderNumber, orderId), index);
      assert.equal(receiptPromotionIndex(orderNumber, orderId.toLowerCase()), index);
    }
  }
  for (const orderId of [undefined, "", "not-an-order", "https://example.invalid/"]) {
    assert.throws(() => receiptPromotionIndex(null, orderId), /canonical order identity/);
  }
});

test("catalogue contains only the eight immutable approved captions, images and destinations", () => {
  assert.ok(Object.isFrozen(receiptPromotions));
  assert.deepEqual(
    receiptPromotions.map((slot) => slot.heading),
    HEADINGS,
  );
  assert.deepEqual(
    receiptPromotions.slice(0, 3).map((slot) => slot.targetUrl),
    URLS,
  );
  assert.equal(receiptPromotions[0].subtitle, "Scan for free food games");
  for (const slot of receiptPromotions) {
    assert.ok(Object.isFrozen(slot));
    assert.match(slot.resourceName, /^receipt_promo_[a-z_]+$/);
    if (slot.kind === "brand") assert.equal(slot.targetUrl, null);
    if (slot.kind === "qr") assert.ok(Object.isFrozen(slot.moduleRows));
  }
});

test("all shared assets and native resources reproduce from the approved source catalogue", async () => {
  const generated = await buildReceiptPromotions();
  assert.equal(generated.outputs.length, 18);
  for (const [url, expected] of generated.outputs) {
    assert.deepEqual(await readFile(url), Buffer.from(expected), `Reproduce ${url.pathname}`);
  }
  const manifest = JSON.parse(
    await readFile(
      new URL("../../../src/assets/approved-logos/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  for (const slot of receiptPromotions.filter((entry) => entry.kind === "brand")) {
    const approved = manifest.logos.find((logo) => logo.id === slot.id);
    assert.ok(approved?.exact_rgba_match);
    assert.equal(slot.sourceRgbaSha256, approved.rgba_sha256);
    assert.ok(
      Math.abs(slot.width / slot.height - approved.width / approved.height) < 0.01,
      "Whole source aspect ratio is retained",
    );
  }
});

test("browser paths and thermal rasters represent the same bounded black pixels for every slot", () => {
  for (const slot of receiptPromotions) {
    const raster = Buffer.from(slot.rasterBase64, "base64");
    assert.equal(raster.length, slot.rowBytes * slot.height);
    assert.equal(slot.rowBytes, Math.ceil(slot.width / 8));
    assert.equal(createHash("sha256").update(raster).digest("hex"), slot.rasterSha256);
    const cells = Array.from({ length: slot.viewBoxHeight }, () =>
      Array(slot.viewBoxWidth).fill(false),
    );
    const paths = [...slot.svgPath.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)];
    assert.equal(paths.map((match) => match[0]).join(""), slot.svgPath);
    for (const match of paths) {
      const [x, y, width, back] = match.slice(1).map(Number);
      assert.equal(width, back);
      assert.ok(
        width > 0 && x >= 0 && y >= 0 && x + width <= slot.viewBoxWidth && y < slot.viewBoxHeight,
      );
      for (let column = x; column < x + width; column++) cells[y][column] = true;
    }
    const scale = slot.kind === "qr" ? slot.scale : 1;
    assert.equal(slot.viewBoxWidth * scale, slot.width);
    assert.equal(slot.viewBoxHeight * scale, slot.height);
    let mismatches = 0;
    let blackPixels = 0;
    for (let y = 0; y < slot.height; y++) {
      for (let x = 0; x < slot.width; x++) {
        const pixel = rasterPixel(slot, raster, x, y);
        if (pixel !== cells[Math.floor(y / scale)][Math.floor(x / scale)]) mismatches++;
        if (pixel) blackPixels++;
      }
      const unusedBits = slot.rowBytes * 8 - slot.width;
      assert.equal(raster[(y + 1) * slot.rowBytes - 1] & ((1 << unusedBits) - 1), 0);
    }
    assert.equal(mismatches, 0, slot.id);
    assert.ok(
      blackPixels > 1000 && blackPixels < slot.width * slot.height * 0.5,
      "Nonblank artwork retains its white background",
    );
  }
});

test("independent QR decoder reads all three exact destinations on both receipt widths", () => {
  for (const slot of receiptPromotions.filter((entry) => entry.kind === "qr")) {
    assert.equal(slot.version, 4);
    assert.equal(slot.errorCorrectionLevel, "Q");
    assert.equal(slot.quietZone, 4);
    assert.equal(slot.scale, 6);
    const raster = Buffer.from(slot.rasterBase64, "base64");
    for (const paperWidth of [384, 576]) {
      const height = slot.height + 48;
      const left = Math.floor((paperWidth - slot.width) / 2);
      const image = new Uint8ClampedArray(paperWidth * height * 4).fill(255);
      for (let y = 0; y < slot.height; y++) {
        for (let x = 0; x < slot.width; x++) {
          const black = rasterPixel(slot, raster, x, y);
          if (x < 24 || y < 24 || x >= slot.width - 24 || y >= slot.height - 24)
            assert.equal(black, false);
          if (!black) continue;
          const offset = ((y + 24) * paperWidth + x + left) * 4;
          image[offset] = image[offset + 1] = image[offset + 2] = 0;
        }
      }
      const decoded = jsQR(image, paperWidth, height, { inversionAttempts: "dontInvert" });
      assert.ok(decoded, `${slot.id} is complete at paper width ${paperWidth}`);
      assert.equal(decoded.data, slot.targetUrl);
      assert.deepEqual(decoded.binaryData, [...new TextEncoder().encode(slot.targetUrl)]);
    }
  }
});
