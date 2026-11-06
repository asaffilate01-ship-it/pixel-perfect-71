import { describe, expect, test } from "bun:test";
import {
  formatPackingBagName,
  normalisePackingPersonName,
  packingPersonNameSchema,
} from "../src/lib/mealdeck-packing-name";

describe("canonical names for a person's packing bag", () => {
  test("normalises room input once while read snapshots retain exact canonical names", () => {
    expect(normalisePackingPersonName("  Amer   Khan  ")).toBe("Amer Khan");
    expect(packingPersonNameSchema.safeParse("  Amer   Khan  ").success).toBe(false);
    for (const name of ["Amer Khan", "O’Connor", "أمير", "李明", "👩‍🍳".repeat(10), "🧑".repeat(32)])
      expect(packingPersonNameSchema.parse(name)).toBe(name);
    expect(packingPersonNameSchema.safeParse("🧑".repeat(33)).success).toBe(false);
  });

  test("rejects empty, overlong, control and bidi names before normalization can hide them", () => {
    const unsafe = [
      "",
      " ",
      "A".repeat(33),
      "\nAmer",
      "Amer\t",
      "Amer\x1b@",
      "Amer\x7f",
      "Amer\x85",
      ...[0x061c, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202e, 0x2066, 0x2069].map(
        (code) => "Amer" + String.fromCodePoint(code),
      ),
    ];
    for (const name of unsafe) {
      expect(packingPersonNameSchema.safeParse(name).success).toBe(false);
      expect(() => normalisePackingPersonName(name)).toThrow();
    }
  });

  test("keeps a numbered fallback for historic orders and duplicate nicknames", () => {
    expect(formatPackingBagName({ number: 1, name: "Amer" })).toBe("Amer · Bag 1");
    expect(formatPackingBagName({ number: 2, name: "Amer" })).toBe("Amer · Bag 2");
    expect(formatPackingBagName({ number: 3 })).toBe("Bag 3");
  });

  test("pasted Unicode spaces follow the database normalization before names are frozen", () => {
    const spaces = [
      0x20,
      0x00a0,
      0x1680,
      ...Array.from({ length: 11 }, (_, index) => 0x2000 + index),
      0x202f,
      0x205f,
      0x3000,
      0xfeff,
    ].map((code) => String.fromCodePoint(code));
    for (const space of spaces) {
      const pasted = space + "Amer" + space + space + "Khan" + space;
      expect(normalisePackingPersonName(pasted)).toBe("Amer Khan");
      expect(packingPersonNameSchema.safeParse(pasted).success).toBe(false);
    }
    expect(normalisePackingPersonName("Amer" + "\u00a0".repeat(40) + "Khan")).toBe("Amer Khan");
  });
});
