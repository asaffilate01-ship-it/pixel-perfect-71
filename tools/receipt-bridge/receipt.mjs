/** Browser-safe receipt validation and bounded ESC/POS rendering. No raw bytes from callers. */
import { receiptLogo } from "./receipt-logo.mjs";
import { receiptGamesQr } from "./receipt-games-qr.mjs";
import { receiptPromotions, receiptPromotionForOrder } from "./receipt-promotions.mjs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const lineId = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,99}$/;
export const RECEIPT_LIMITS = Object.freeze({
  items: 180,
  bags: 10,
  modifiers: 100,
  lines: 600,
  bytes: 32768,
});

export class ReceiptError extends Error {
  constructor(code) {
    super(code);
    this.name = "ReceiptError";
    this.code = code;
  }
}
function requireValue(condition, code = "invalid_receipt") {
  if (!condition) throw new ReceiptError(code);
}
function object(value, keys, optionalKeys = []) {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value));
  requireValue(
    keys.every((key) => Object.hasOwn(value, key)) &&
      Object.keys(value).every((key) => keys.includes(key) || optionalKeys.includes(key)),
    "unexpected_receipt_fields",
  );
  return value;
}
function text(value, maximum = 140, allowEmpty = false) {
  requireValue(typeof value === "string" && value.length <= maximum);
  // Line breaks in staff/customer notes become spaces. Other control/bidi
  // characters cannot introduce commands or conceal printed content.
  const spaces = value.replace(/[\t\n\r]/g, " ");
  requireValue(!/[\p{Cc}\p{Cf}]/u.test(spaces), "invalid_receipt_text");
  const clean = spaces.trim();
  requireValue(allowEmpty || clean.length > 0, "invalid_receipt_text");
  return clean;
}
function nullableText(value, max = 20000) {
  return value === null ? null : text(value, max, true);
}
function packingPersonName(value) {
  // Mirrors mealdeck-packing-name.ts without making the standalone bridge depend
  // on the app runtime. Preserve the canonical nickname, including Unicode.
  requireValue(
    typeof value === "string" &&
      value.length > 0 &&
      [...value].length <= 32 &&
      value ===
        value.replace(/[ \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]+/gu, " ").trim() &&
      !/[\p{Cc}\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/u.test(value),
    "invalid_packing_name",
  );
  return value;
}
function packingBagName(bag) {
  return bag.name === undefined ? `Bag ${bag.number}` : `${bag.name} · Bag ${bag.number}`;
}
function identifier(value, pattern = uuid) {
  requireValue(typeof value === "string" && pattern.test(value), "invalid_receipt_identifier");
  return value;
}
function integer(value, min = 0, max = 10000000) {
  requireValue(
    Number.isSafeInteger(value) && value >= min && value <= max,
    "invalid_receipt_number",
  );
  return value;
}
function bool(value) {
  requireValue(typeof value === "boolean");
  return value;
}
function timestamp(value) {
  requireValue(
    typeof value === "string" &&
      value.length <= 40 &&
      /^\d{4}-\d{2}-\d{2}T/.test(value) &&
      Number.isFinite(Date.parse(value)),
    "invalid_receipt_timestamp",
  );
  return new Date(value).toISOString();
}
function list(value, min, max) {
  requireValue(
    Array.isArray(value) && value.length >= min && value.length <= max,
    "receipt_bounds_exceeded",
  );
  return value;
}

/** Normalizes a receipt snapshot; throws before any transport/write on invalid input. */
export function validateReceipt(input) {
  const r = object(
    input,
    [
      "schemaVersion",
      "orderId",
      "copyNumber",
      "reprintOf",
      "reprintReason",
      "displayCode",
      "brand",
      "tradingName",
      "locationName",
      "createdAt",
      "paidAt",
      "acceptedAt",
      "fulfilment",
      "customerName",
      "car",
      "cutleryRequested",
      "packingPlan",
      "items",
      "subtotalPence",
      "discountPence",
      "totalPence",
      "currency",
      "orderNotes",
    ],
    ["orderNumber", "paymentMethod"],
  );
  requireValue(
    r.schemaVersion === 1 &&
      r.brand === "MealDeck" &&
      r.tradingName === "313 Brands Ltd" &&
      r.currency === "GBP",
    "unsupported_receipt_schema",
  );
  requireValue(
    ["pickup", "curbside", "delivery"].includes(r.fulfilment),
    "unsupported_receipt_fulfilment",
  );
  const copyNumber = integer(r.copyNumber, 1, 100);
  const reprintOf = r.reprintOf === null ? null : identifier(r.reprintOf);
  const reprintReason = nullableText(r.reprintReason, 300);
  requireValue(
    copyNumber === 1
      ? reprintOf === null && reprintReason === null
      : reprintOf !== null && !!reprintReason,
    "invalid_reprint_receipt",
  );
  const items = list(r.items, 1, RECEIPT_LIMITS.items).map((inputItem) => {
    const item = object(
      inputItem,
      [
        "lineId",
        "parentLineId",
        "brandName",
        "name",
        "quantity",
        "baseUnitPence",
        "unitPence",
        "linePence",
        "notes",
        "modifiers",
      ],
      ["mealComponents"],
    );
    const quantity = integer(item.quantity, 1, 999);
    const baseUnitPence = integer(item.baseUnitPence);
    const unitPence = integer(item.unitPence);
    const linePence = integer(item.linePence);
    const modifiers = list(item.modifiers, 0, RECEIPT_LIMITS.modifiers).map((inputModifier) => {
      const modifier = object(inputModifier, [
        "name",
        "groupName",
        "quantityPerParent",
        "priceDeltaPence",
      ]);
      return {
        name: text(modifier.name, 1000),
        groupName: text(modifier.groupName, 1000, true),
        quantityPerParent: integer(modifier.quantityPerParent, 1, 999),
        priceDeltaPence: integer(modifier.priceDeltaPence, -1000000, 1000000),
      };
    });
    const mealComponents = Object.hasOwn(item, "mealComponents")
      ? list(item.mealComponents, 0, 3).map((inputComponent) => {
          const component = object(inputComponent, [
            "slot",
            "name",
            "quantityPerParent",
            "replacement",
          ]);
          requireValue(
            ["main", "side", "drink"].includes(component.slot),
            "invalid_meal_component",
          );
          const name = text(component.name, 1000);
          requireValue(name === component.name, "invalid_meal_component");
          const replacement = bool(component.replacement);
          requireValue(component.slot !== "main" || !replacement, "invalid_meal_component");
          return {
            slot: component.slot,
            name,
            quantityPerParent: integer(component.quantityPerParent, 1, 999),
            replacement,
          };
        })
      : undefined;
    requireValue(
      mealComponents === undefined ||
        new Set(mealComponents.map((component) => component.slot)).size === mealComponents.length,
      "invalid_meal_component",
    );
    requireValue(
      baseUnitPence +
        modifiers.reduce((sum, m) => sum + m.priceDeltaPence * m.quantityPerParent, 0) ===
        unitPence && unitPence * quantity === linePence,
      "receipt_line_total_mismatch",
    );
    return {
      lineId: identifier(item.lineId, lineId),
      parentLineId: item.parentLineId === null ? null : identifier(item.parentLineId, lineId),
      brandName: text(item.brandName, 140),
      name: text(item.name, 1000),
      quantity,
      baseUnitPence,
      unitPence,
      linePence,
      notes: nullableText(item.notes),
      modifiers,
      ...(mealComponents === undefined ? {} : { mealComponents }),
    };
  });
  const byLine = new Map(items.map((item) => [item.lineId, item]));
  requireValue(byLine.size === items.length, "duplicate_receipt_line");
  for (const item of items)
    if (item.parentLineId !== null) {
      const parent = byLine.get(item.parentLineId);
      requireValue(
        parent &&
          parent.parentLineId === null &&
          parent.lineId !== item.lineId &&
          parent.quantity === item.quantity,
        "invalid_receipt_parent",
      );
    }
  const plan = object(r.packingPlan, ["version", "separateBags", "cutleryRequested", "bags"]);
  requireValue(plan.version === 1, "unsupported_packing_plan");
  const cutleryRequested = bool(r.cutleryRequested);
  requireValue(bool(plan.cutleryRequested) === cutleryRequested, "cutlery_mismatch");
  const allocated = new Map();
  const bags = list(plan.bags, 1, RECEIPT_LIMITS.bags).map((inputBag, index) => {
    const bag = object(inputBag, ["number", "allocations"], ["name"]);
    const name = Object.hasOwn(bag, "name") ? packingPersonName(bag.name) : undefined;
    requireValue(integer(bag.number, 1, 10) === index + 1, "invalid_bag_number");
    const perBag = new Map();
    const allocations = list(bag.allocations, 1, RECEIPT_LIMITS.items).map((inputAllocation) => {
      const allocation = object(inputAllocation, ["lineId", "quantity"]);
      const id = identifier(allocation.lineId, lineId);
      const quantity = integer(allocation.quantity, 1, 999);
      requireValue(byLine.has(id) && !perBag.has(id), "invalid_bag_allocation");
      perBag.set(id, quantity);
      allocated.set(id, (allocated.get(id) ?? 0) + quantity);
      return { lineId: id, quantity };
    });
    for (const item of items)
      if (item.parentLineId !== null)
        requireValue(
          (perBag.get(item.lineId) ?? 0) === (perBag.get(item.parentLineId) ?? 0),
          "extra_bag_mismatch",
        );
    return { number: index + 1, ...(name === undefined ? {} : { name }), allocations };
  });
  for (const item of items)
    requireValue(allocated.get(item.lineId) === item.quantity, "packing_quantity_mismatch");
  const separateBags = bool(plan.separateBags);
  requireValue(separateBags || bags.length === 1, "packing_bag_count_mismatch");
  const subtotalPence = integer(r.subtotalPence);
  const discountPence = integer(r.discountPence);
  const totalPence = integer(r.totalPence);
  requireValue(
    items.reduce((sum, item) => sum + item.linePence, 0) === subtotalPence &&
      discountPence <= subtotalPence &&
      subtotalPence - discountPence === totalPence,
    "receipt_total_mismatch",
  );
  let car = null;
  if (r.car !== null) {
    const details = object(r.car, ["make", "colour", "registrationLast4"]);
    const registrationLast4 = text(details.registrationLast4, 4).toUpperCase();
    requireValue(/^[A-Z0-9]{4}$/.test(registrationLast4), "invalid_receipt_car");
    car = { make: text(details.make, 100), colour: text(details.colour, 100), registrationLast4 };
  }
  requireValue(
    r.fulfilment === "curbside" ? car !== null : car === null,
    "receipt_car_fulfilment_mismatch",
  );
  const createdAt = timestamp(r.createdAt),
    paidAt = timestamp(r.paidAt),
    acceptedAt = timestamp(r.acceptedAt);
  requireValue(
    Date.parse(paidAt) >= Date.parse(createdAt) && Date.parse(acceptedAt) >= Date.parse(paidAt),
    "receipt_time_mismatch",
  );
  requireValue(
    typeof r.displayCode === "string" && /^\d{4}$/.test(r.displayCode),
    "invalid_receipt_display_code",
  );
  requireValue(
    !Object.hasOwn(r, "orderNumber") ||
      r.orderNumber === null ||
      (typeof r.orderNumber === "string" &&
        /^(?!0000$)(?:[0-9]{4}|[1-9][0-9]{4,18})$/.test(r.orderNumber)),
    "invalid_receipt_order_number",
  );
  requireValue(
    !Object.hasOwn(r, "paymentMethod") || ["card", "cash"].includes(r.paymentMethod),
    "invalid_receipt_payment_method",
  );
  return {
    schemaVersion: 1,
    orderId: identifier(r.orderId),
    copyNumber,
    reprintOf,
    reprintReason,
    displayCode: r.displayCode,
    ...(Object.hasOwn(r, "orderNumber") ? { orderNumber: r.orderNumber } : {}),
    ...(Object.hasOwn(r, "paymentMethod") ? { paymentMethod: r.paymentMethod } : {}),
    brand: "MealDeck",
    tradingName: "313 Brands Ltd",
    locationName: text(r.locationName, 140),
    createdAt,
    paidAt,
    acceptedAt,
    fulfilment: r.fulfilment,
    customerName: text(r.customerName, 200),
    car,
    cutleryRequested,
    packingPlan: { version: 1, separateBags, cutleryRequested, bags },
    items,
    subtotalPence,
    discountPence,
    totalPence,
    currency: "GBP",
    orderNotes: nullableText(r.orderNotes),
  };
}

const money = (pence) => "GBP " + (pence / 100).toFixed(2);
/** Epson ESC/POS graphics functions 112 and 50. This is the fixed reviewed logo.
 * There is no caller-supplied raster, address or command. */
export function encodeReceiptLogo() {
  const pixels = Uint8Array.from(atob(receiptLogo.rasterBase64), (value) => value.charCodeAt(0));
  requireValue(
    receiptLogo.width === 256 &&
      receiptLogo.height === 258 &&
      pixels.length === receiptLogo.rowBytes * receiptLogo.height,
    "invalid_fixed_receipt_logo",
  );
  const length = pixels.length + 10;
  return Uint8Array.from([
    0x1b,
    0x61,
    1,
    0x1d,
    0x28,
    0x4c,
    length & 255,
    length >> 8,
    48,
    112,
    48,
    1,
    1,
    49,
    receiptLogo.width & 255,
    receiptLogo.width >> 8,
    receiptLogo.height & 255,
    receiptLogo.height >> 8,
    ...pixels,
    0x1d,
    0x28,
    0x4c,
    2,
    0,
    48,
    50,
    0x1b,
    0x61,
    0,
  ]);
}
/** Fixed public games QR, using the same bounded framing as the approved logo.
 * Six printer dots per module, including a complete four-module quiet zone.
 * No runtime QR library, network request, caller URL or order data is involved. */
export function encodeReceiptGamesQr() {
  const pixels = Uint8Array.from(atob(receiptGamesQr.rasterBase64), (value) => value.charCodeAt(0));
  requireValue(
    receiptGamesQr.targetUrl === "https://mealdeck.co.uk/play/receipt" &&
      receiptGamesQr.width === 246 &&
      receiptGamesQr.height === 246 &&
      receiptGamesQr.rowBytes === 31 &&
      receiptGamesQr.quietZone === 4 &&
      receiptGamesQr.scale === 6 &&
      pixels.length === receiptGamesQr.rowBytes * receiptGamesQr.height,
    "invalid_fixed_receipt_games_qr",
  );
  const length = pixels.length + 10;
  return Uint8Array.from([
    0x1b,
    0x61,
    1,
    0x1d,
    0x28,
    0x4c,
    length & 255,
    length >> 8,
    48,
    112,
    48,
    1,
    1,
    49,
    receiptGamesQr.width & 255,
    receiptGamesQr.width >> 8,
    receiptGamesQr.height & 255,
    receiptGamesQr.height >> 8,
    ...pixels,
    0x1d,
    0x28,
    0x4c,
    2,
    0,
    48,
    50,
    0x1b,
    0x61,
    0,
  ]);
}

/** The order identity selects one of eight committed public images. Callers
 * cannot provide pixels, commands, customer links or a remote image address. */
export function encodeReceiptPromotion(order) {
  const promotion = receiptPromotionForOrder(order);
  const pixels = Uint8Array.from(atob(promotion.rasterBase64), (value) => value.charCodeAt(0));
  requireValue(
    receiptPromotions.includes(promotion) &&
      Number.isInteger(promotion.width) &&
      promotion.width > 0 &&
      promotion.width <= 384 &&
      Number.isInteger(promotion.height) &&
      promotion.height > 0 &&
      promotion.height <= 384 &&
      promotion.rowBytes === Math.ceil(promotion.width / 8) &&
      pixels.length === promotion.rowBytes * promotion.height,
    "invalid_fixed_receipt_promotion",
  );
  const length = pixels.length + 10;
  return Uint8Array.from([
    0x1b,
    0x61,
    1,
    0x1d,
    0x28,
    0x4c,
    length & 255,
    length >> 8,
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
    ...pixels,
    0x1d,
    0x28,
    0x4c,
    2,
    0,
    48,
    50,
    0x1b,
    0x61,
    0,
  ]);
}
function ascii(value) {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/£/g, "GBP ")
    .replace(/[•·]/g, "-")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

/** One bounded receipt, one optional cutter command, no form-feed/macros/repeat commands. */
export function encodeReceipt(input, profile = {}) {
  const receipt = validateReceipt(input);
  const columns = profile.columns ?? 42;
  const cut = profile.cut ?? "none";
  const feedLines = profile.feedLines ?? 3;
  // Preserve the signed 0.2.0 legacy profile. The normal receipt now uses the
  // order's stable rotation slot rather than always selecting the games QR.
  const includePromotion = profile.includeGamesQr ?? true;
  requireValue(
    [32, 42, 48].includes(columns) &&
      ["none", "partial", "full"].includes(cut) &&
      Number.isInteger(feedLines) &&
      feedLines >= 0 &&
      feedLines <= 5 &&
      typeof includePromotion === "boolean",
    "invalid_printer_profile",
  );
  const lines = [];
  let replacedCharacters = false;
  function printable(raw) {
    if (
      /[^\x20-\x7e]/u.test(
        raw
          .replace(/[‘’“”–—…£•·]/g, "")
          .normalize("NFKD")
          .replace(/\p{M}/gu, ""),
      )
    )
      replacedCharacters = true;
    return ascii(raw);
  }
  function write(value = "", indent = "") {
    const raw = text(value, 20100, true);
    const valueAscii = printable(raw);
    const width = columns - indent.length;
    requireValue(width > 10, "invalid_printer_profile");
    let remaining = valueAscii;
    if (!remaining) lines.push("");
    while (remaining.length) {
      let length = Math.min(width, remaining.length);
      if (remaining.length > width) {
        const boundary = remaining.lastIndexOf(" ", width);
        if (boundary > Math.floor(width / 2)) length = boundary;
      }
      lines.push(indent + remaining.slice(0, length));
      remaining = remaining.slice(length).trimStart();
    }
    requireValue(lines.length <= RECEIPT_LIMITS.lines, "receipt_too_long");
  }
  function pair(label, value) {
    const a = printable(label),
      b = printable(value);
    if (a.length + b.length + 1 <= columns)
      write(a + " ".repeat(columns - a.length - b.length) + b);
    else {
      write(label);
      write(value, "  ");
    }
  }
  function totals() {
    pair("Subtotal", money(receipt.subtotalPence));
    if (receipt.discountPence) pair("Discount", "-" + money(receipt.discountPence));
    pair("TOTAL", money(receipt.totalPence));
  }
  const date = (iso) =>
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Europe/London",
    }).format(new Date(iso));
  const rule = "-".repeat(columns);
  write("MEALDECK");
  write(receipt.locationName);
  write("ORDER " + (receipt.orderNumber ?? receipt.displayCode));
  if (receipt.orderNumber) write((receipt.fulfilment === "delivery" ? "Delivery code: " : "Collection code: ") + receipt.displayCode);
  if (receipt.copyNumber > 1) {
    write("REPRINT - COPY " + receipt.copyNumber);
    write("Reason: " + receipt.reprintReason);
  }
  write("Placed / paid: " + date(receipt.paidAt));
  write("Accepted: " + date(receipt.acceptedAt));
  write(receipt.fulfilment === "delivery" ? "OWN DRIVER DELIVERY" : receipt.fulfilment === "curbside" ? "KERBSIDE PICKUP" : "COLLECTION");
  if (receipt.paymentMethod === "cash") write("PAYMENT: CASH PAID");
  write("Name: " + receipt.customerName);
  if (receipt.car)
    write(
      "Car: " +
        receipt.car.colour +
        " " +
        receipt.car.make +
        " / last 4: " +
        receipt.car.registrationLast4,
    );
  write(rule);
  for (const item of receipt.items) {
    write(item.brandName.toUpperCase());
    pair(item.quantity + " x " + item.name, money(item.linePence));
    const itemBags = receipt.packingPlan.bags.flatMap((bag) =>
      bag.allocations
        .filter((allocation) => allocation.lineId === item.lineId)
        // Names have already passed their dedicated control/bidi checks. Apply
        // the explicit printer fallback before the generic text writer so a
        // valid Unicode joiner cannot fail an otherwise printable receipt.
        .map((allocation) => printable(packingBagName(bag)) + " x" + allocation.quantity),
    );
    write("Packing: " + itemBags.join(", "), "  ");
    if (item.parentLineId)
      write(
        "Extra for " + receipt.items.find((parent) => parent.lineId === item.parentLineId).name,
        "  ",
      );
    if (item.mealComponents?.length) {
      write("MEAL INCLUDES:", "  ");
      for (const component of item.mealComponents)
        write(
          item.quantity * component.quantityPerParent +
            " x " +
            component.name +
            (component.replacement
              ? " - replaces standard " + (component.slot === "drink" ? "drink" : "side")
              : ""),
          "  ",
        );
    }
    if (item.modifiers.length) {
      // Stored receipts do not distinguish variants from add-ons. Show every
      // choice with its inclusive item price, never guess from editable labels.
      pair("  Each, including choices", money(item.unitPence));
      write("Choices included in item price:", "  ");
      for (const modifier of item.modifiers) {
        write(
          modifier.groupName +
            ": " +
            modifier.name +
            " x" +
            modifier.quantityPerParent +
            " per item",
          "  ",
        );
      }
    }
    if (item.notes) write("Note: " + item.notes, "  ");
    write();
  }
  write(rule);
  if (!includePromotion) {
    // Original signed-native text fixtures retain their exact historic order.
    totals();
    write(rule);
  }
  write(
    "PACKING - " +
      receipt.packingPlan.bags.length +
      " BAG" +
      (receipt.packingPlan.bags.length === 1 ? "" : "S"),
  );
  for (const bag of receipt.packingPlan.bags) {
    write("BAG " + bag.number + " OF " + receipt.packingPlan.bags.length);
    if (bag.name !== undefined) write("For: " + printable(bag.name));
    for (const allocation of bag.allocations) {
      const item = receipt.items.find((line) => line.lineId === allocation.lineId);
      write(allocation.quantity + " x " + item.brandName + " - " + item.name, "  ");
    }
  }
  write("CUTLERY: " + (receipt.cutleryRequested ? "REQUESTED" : "NOT REQUESTED"));
  if (receipt.orderNotes) {
    write(rule);
    write("Order note: " + receipt.orderNotes);
  }
  if (replacedCharacters) write("Some characters shown as ?. Check the order screen.");
  write(rule);
  // Keep every order/packing instruction before the totals, then one compact
  // promotion and the complete legal footer. Selection never changes a stored
  // receipt, its fingerprint, copy identity or journal delivery behavior.
  let promotionAfterLine = null;
  if (includePromotion) {
    totals();
    const promotion = receiptPromotionForOrder(receipt);
    for (const label of [promotion.heading, promotion.subtitle]) {
      if (label) write(label, " ".repeat(Math.max(0, Math.floor((columns - label.length) / 2))));
    }
    promotionAfterLine = lines.length;
    if (promotion.displayUrl)
      write(
        promotion.displayUrl,
        " ".repeat(Math.max(0, Math.floor((columns - promotion.displayUrl.length) / 2))),
      );
    write(rule);
  }
  write("MealDeck is a trading name of");
  write("313 Brands Ltd");
  write("Powered by Dishbee");
  write("mealdeck.co.uk");
  write("END OF RECEIPT");
  const encoder = new TextEncoder();
  const beforePromotion = encoder.encode(
    lines.slice(0, promotionAfterLine ?? lines.length).join("\n") + "\n",
  );
  const afterPromotion = encoder.encode(
    (promotionAfterLine === null ? "" : lines.slice(promotionAfterLine).join("\n") + "\n") +
      "\n".repeat(feedLines),
  );
  const ending = cut === "none" ? [] : [0x1d, 0x56, cut === "partial" ? 1 : 0];
  const bytes = Uint8Array.from([
    0x1b,
    0x40,
    ...encodeReceiptLogo(),
    ...beforePromotion,
    ...(includePromotion ? encodeReceiptPromotion(receipt) : []),
    ...afterPromotion,
    ...ending,
  ]);
  requireValue(bytes.length <= RECEIPT_LIMITS.bytes, "receipt_too_long");
  return {
    bytes,
    text: lines.join("\n"),
    lineCount: lines.length,
    warnings: replacedCharacters ? ["ascii_replacement_characters"] : [],
  };
}
