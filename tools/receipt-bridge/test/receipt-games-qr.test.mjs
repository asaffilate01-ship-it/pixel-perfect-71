import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import jsQR from "jsqr";
import { buildReceiptGamesQr } from "../build-games-qr.mjs";
import { receiptGamesQr as qr } from "../receipt-games-qr.mjs";
import {
  encodeReceipt,
  encodeReceiptGamesQr,
  validateReceipt,
  RECEIPT_LIMITS,
} from "../receipt.mjs";
import { fixture } from "./fixtures.mjs";

const TARGET = "https://mealdeck.co.uk/play/receipt";
const raster = Buffer.from(qr.rasterBase64, "base64");
const isBlack = (x, y) => Boolean(raster[y * qr.rowBytes + (x >> 3)] & (0x80 >> (x & 7)));

function drawRgba(paperWidth, imageWidth, pixel) {
  const height = imageWidth + 48;
  const left = Math.floor((paperWidth - imageWidth) / 2);
  const top = 24;
  assert.ok(left >= 0, "whole image fits within the printable paper width");
  const data = new Uint8ClampedArray(paperWidth * height * 4).fill(255);
  for (let y = 0; y < imageWidth; y++) {
    for (let x = 0; x < imageWidth; x++) {
      if (!pixel(x, y)) continue;
      const offset = ((y + top) * paperWidth + x + left) * 4;
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
    }
  }
  return { data, width: paperWidth, height };
}

function expectDecoded(image) {
  const decoded = jsQR(image.data, image.width, image.height, {
    inversionAttempts: "dontInvert",
  });
  assert.ok(decoded, "an independent decoder finds a complete QR code");
  assert.equal(decoded.data, TARGET);
  assert.deepEqual(decoded.binaryData, [...new TextEncoder().encode(TARGET)]);
  assert.equal(decoded.version, 4);
}

test("generated public QR, PNG and browser path reproduce exactly", async () => {
  const generated = await buildReceiptGamesQr();
  assert.equal(
    generated.module,
    await readFile(new URL("../receipt-games-qr.mjs", import.meta.url), "utf8"),
  );
  assert.deepEqual(
    generated.png,
    await readFile(new URL("../assets/mealdeck-games-qr.png", import.meta.url)),
  );
  assert.equal(qr.targetUrl, TARGET);
  assert.equal(qr.displayUrl, "mealdeck.co.uk/play");
  assert.equal(qr.heading, "Got a minute? Play MealDeck");
  assert.equal(qr.subtitle, "Scan for free food games");
  assert.equal(qr.errorCorrectionLevel, "Q");
  assert.equal(qr.quietZone, 4);
  assert.equal(qr.scale, 6);
  assert.equal(qr.width, 246);
  assert.equal(qr.height, 246);
  assert.equal(raster.length, 31 * 246);
  assert.equal(
    createHash("sha256").update(raster).digest("hex"),
    "63277bcfafd0e792b6d5d54befa95b9d4d8704ebbe184213b4c4fbca67e28229",
  );
  assert.equal(qr.rasterSha256, createHash("sha256").update(raster).digest("hex"));
  assert.ok(Object.isFrozen(qr));
  assert.ok(Object.isFrozen(qr.moduleRows));
});

test("thermal pixels preserve square modules, complete quiet zone and white byte padding", () => {
  let mismatches = 0;
  for (let y = 0; y < qr.height; y++) {
    for (let x = 0; x < qr.width; x++) {
      const expected = qr.moduleRows[Math.floor(y / 6) - 4]?.[Math.floor(x / 6) - 4] === "1";
      if (isBlack(x, y) !== expected) mismatches++;
    }
    assert.equal(raster[(y + 1) * qr.rowBytes - 1] & 3, 0, "unused right-hand bits are white");
  }
  assert.equal(mismatches, 0, "the same 33×33 QR has six-dot modules and 24-dot white borders");
  assert.equal(qr.moduleRows.length, 33);
  assert.ok(qr.moduleRows.every((row) => /^[01]{33}$/.test(row)));
});

test("independent decoder reads the actual thermal raster on 58mm and 80mm profiles", () => {
  // Common 203dpi printable widths: 48mm/384 dots and 72mm/576 dots.
  // This verifies digital framing/scale, not physical paper or device compatibility.
  for (const paperWidth of [384, 576]) expectDecoded(drawRgba(paperWidth, qr.width, isBlack));
});

test("browser SVG uses the identical bounded grid and decodes at screen and print sizes", () => {
  const cells = Array.from({ length: 41 }, () => Array(41).fill(false));
  const paths = [...qr.svgPath.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)];
  assert.equal(paths.map((match) => match[0]).join(""), qr.svgPath, "only fixed square runs");
  for (const match of paths) {
    const [x, y, width, back] = match.slice(1).map(Number);
    assert.equal(width, back);
    assert.ok(width > 0 && x >= 4 && y >= 4 && x + width <= 37 && y < 37);
    for (let column = x; column < x + width; column++) cells[y][column] = true;
  }
  for (let y = 0; y < 41; y++) {
    for (let x = 0; x < 41; x++) assert.equal(cells[y][x], qr.moduleRows[y - 4]?.[x - 4] === "1");
  }
  // 164px screen artwork; 41mm artwork is approximately 328 dots at 203dpi.
  for (const [paperWidth, scale] of [
    [164, 4],
    [384, 8],
    [576, 8],
  ])
    expectDecoded(
      drawRgba(
        paperWidth,
        41 * scale,
        (x, y) => cells[Math.floor(y / scale)][Math.floor(x / scale)],
      ),
    );
});

test("one fixed QR is fully framed after order instructions and before the legal footer", () => {
  const command = Buffer.from(encodeReceiptGamesQr());
  assert.deepEqual([...command.subarray(0, 6)], [27, 97, 1, 29, 40, 76]);
  assert.equal(command[6] + command[7] * 256, raster.length + 10);
  assert.deepEqual([...command.subarray(8, 18)], [48, 112, 48, 1, 1, 49, 246, 0, 246, 0]);
  assert.deepEqual(command.subarray(18, 18 + raster.length), raster);
  assert.deepEqual(
    [...command.subarray(18 + raster.length)],
    [29, 40, 76, 2, 0, 48, 50, 27, 97, 0],
  );
  const receipt = fixture();
  receipt.orderNotes = "Keep both bags together. Check every labelled extra.";
  const snapshot = JSON.stringify(validateReceipt(receipt));
  const original = JSON.stringify(receipt);
  for (const columns of [32, 42, 48]) {
    const result = encodeReceipt(receipt, { columns });
    const bytes = Buffer.from(result.bytes);
    const position = bytes.indexOf(command);
    assert.ok(position > 0);
    assert.equal(bytes.indexOf(command, position + 1), -1);
    const before = bytes.subarray(0, position).toString();
    const after = bytes.subarray(position + command.length).toString();
    assert.ok(before.endsWith(qr.subtitle + "\n"));
    assert.ok(before.includes(receipt.orderNotes.split(" ").at(-1)));
    assert.ok(before.indexOf("CUTLERY:") < before.indexOf(qr.heading));
    assert.ok(before.indexOf("Order note:") < before.indexOf(qr.heading));
    assert.ok(after.trimStart().startsWith(qr.displayUrl + "\n"));
    assert.ok(after.indexOf(qr.displayUrl) < after.indexOf("MealDeck is a trading name of"));
    assert.ok(after.endsWith("END OF RECEIPT\n\n\n\n"));
    assert.equal(result.text.match(/END OF RECEIPT/g)?.length, 1);
    assert.ok(result.text.split("\n").every((line) => line.length <= columns));
    assert.ok(result.bytes.length < RECEIPT_LIMITS.bytes);
  }
  assert.equal(JSON.stringify(validateReceipt(receipt)), snapshot);
  assert.equal(JSON.stringify(receipt), original);
});

test("QR targets or bytes cannot be supplied through receipt data", () => {
  for (const field of ["qr", "qrUrl", "qrBytes", "gamesUrl", "gamesQr", "receiptGamesQr"])
    assert.throws(
      () => encodeReceipt({ ...fixture(), [field]: "https://untrusted.invalid/order-secret" }),
      { code: "unexpected_receipt_fields" },
    );
  const receipt = fixture();
  receipt.customerName = "Different customer";
  receipt.displayCode = "9999";
  receipt.orderNotes = "https://untrusted.invalid/customer-note";
  const bytes = Buffer.from(encodeReceipt(receipt).bytes);
  const command = Buffer.from(encodeReceiptGamesQr());
  assert.ok(bytes.indexOf(command) > 0, "all valid orders receive exactly the same public QR");
  assert.equal(bytes.indexOf(command, bytes.indexOf(command) + 1), -1);
});

test("the signed H10S profile omits only fixed promotion and preserves canonical receipts", async () => {
  const golden = JSON.parse(
    await readFile(
      new URL(
        "../../../apps/mealdeck-printer/native/src/test/resources/receipt-golden.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const expected of golden.valid) {
    const snapshot = JSON.stringify(validateReceipt(expected.input));
    assert.equal(snapshot, expected.normalizedJson);
    assert.equal(createHash("sha256").update(snapshot).digest("hex"), expected.fingerprint);
    if (expected.renderError) {
      assert.throws(() => encodeReceipt(expected.input, { columns: 32, includeGamesQr: false }), {
        code: expected.renderError,
      });
      continue;
    }
    const native = encodeReceipt(expected.input, { columns: 32, includeGamesQr: false });
    assert.equal(native.text, expected.text, expected.name);
    assert.equal(Buffer.from(native.bytes).indexOf(Buffer.from(encodeReceiptGamesQr())), -1);
    assert.equal(JSON.stringify(validateReceipt(expected.input)), snapshot);
  }
  for (const columns of [32, 42, 48]) {
    const receipt = fixture();
    receipt.orderNotes = "Keep every bag and named extra together.";
    const current = encodeReceipt(receipt, { columns });
    const native = encodeReceipt(receipt, { columns, includeGamesQr: false });
    const lines = current.text.split("\n");
    const promotionStart = lines.findIndex((line) => line.trim() === qr.heading);
    assert.ok(promotionStart > 0);
    assert.equal(
      native.text,
      [...lines.slice(0, promotionStart), ...lines.slice(promotionStart + 4)].join("\n"),
      "only the fixed heading, subtitle, public URL and separator are omitted",
    );
    assert.ok(Buffer.from(native.bytes).subarray(-4).equals(Buffer.from("\n\n\n\n")));
  }
  assert.throws(() => encodeReceipt(fixture(), { includeGamesQr: "false" }), {
    code: "invalid_printer_profile",
  });
  assert.throws(() => encodeReceipt({ ...fixture(), includeGamesQr: false }), {
    code: "unexpected_receipt_fields",
  });
});
