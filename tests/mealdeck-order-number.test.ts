import { describe, expect, test } from "bun:test";
import {
  isOrderNumber,
  orderDisplayNumber,
  orderNumberSchema,
} from "../src/lib/mealdeck-order-number";

describe("canonical display order numbers", () => {
  test("preserves leading padding and grows beyond four digits without truncation", () => {
    for (const number of ["0001", "0002", "0099", "1000", "9999", "10000", "9223372036854775807"]) {
      expect(isOrderNumber(number)).toBe(true);
      expect(orderNumberSchema.parse(number)).toBe(number);
      expect(orderDisplayNumber(number, "4601")).toBe(number);
    }
  });

  test("rejects invented, unpadded, zero, noncanonical and unsafe references", () => {
    for (const value of [
      null,
      undefined,
      1,
      "",
      "1",
      "0000",
      "00001",
      "010000",
      "-001",
      "1.00",
      "1e03",
      "0001 ",
      "0001\n",
      "0001\u202e",
      "１２３４",
      "9".repeat(20),
    ]) {
      expect(isOrderNumber(value)).toBe(false);
      expect(orderNumberSchema.safeParse(value).success).toBe(false);
    }
  });

  test("legacy display fallback remains unchanged and never generates a number", () => {
    for (const value of [undefined, null, "", "0000", " 0001", "wrong"]) {
      expect(orderDisplayNumber(value, "4601")).toBe("4601");
      expect(orderDisplayNumber(value, "15E1228C")).toBe("15E1228C");
    }
  });
});
