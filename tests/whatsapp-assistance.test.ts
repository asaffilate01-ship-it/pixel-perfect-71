import { describe, expect, test } from "bun:test";
import {
  createWhatsAppBasketDraft,
  createWhatsAppBasketUrl,
  normaliseBusinessWhatsAppNumber,
  type WhatsAppBasketDraft,
} from "../src/lib/whatsapp-assistance";

const basket: WhatsAppBasketDraft = {
  location: "luton",
  fulfilment: "delivery",
  lines: [
    {
      brandName: "Skorch Burgers",
      name: "Double Smash",
      quantity: 2,
      selectedModifiers: [{ name: "Extra cheese" }],
    },
    { brandName: "Icova", name: "Iced Latte", quantity: 1, selectedModifiers: [] },
  ],
};

describe("Official WhatsApp contact verification", () => {
  test("only canonical E.164 numbers are accepted", () => {
    expect(normaliseBusinessWhatsAppNumber("+447700900123")).toBe("+447700900123");
    expect(normaliseBusinessWhatsAppNumber(" +447700900123 ")).toBe("+447700900123");
    for (const invalid of ["07700 900123", "wa.me/447700900123", "+44 7700900123", "+0123456789", "+1", "", null]) {
      expect(normaliseBusinessWhatsAppNumber(invalid)).toBeNull();
    }
  });
});

describe("Multi-brand chat basket", () => {
  test("encodes location, fulfilment and items in one enquiry", () => {
    const draft = createWhatsAppBasketDraft(basket);
    expect(draft).toContain("Location: Luton");
    expect(draft).toContain("Preferred fulfilment: Delivery");
    expect(draft).toContain("2 × Double Smash — Skorch Burgers (Extra cheese)");
    expect(draft).toContain("1 × Iced Latte — Icova");
    expect(draft).toContain("not a placed or paid order");
    expect(draft).toContain("official secure payment link");
  });

  test("produces an HTTPS wa.me link for the verified configured number", () => {
    const url = createWhatsAppBasketUrl("+447700900123", basket);
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.hostname).toBe("wa.me");
    expect(parsed.pathname).toBe("/447700900123");
    expect(parsed.searchParams.get("text")).toContain("Iced Latte");
  });

  test("never imports client prices, personal data or payment status", () => {
    const example = {
      ...basket,
      customer: { name: "PRIVATE", phone: "PRIVATE_PHONE", address1: "PRIVATE_ADDRESS" },
      deliveryPence: 9999,
      status: "paid",
      lines: basket.lines.map((line) => ({
        ...line,
        pricePence: 9876,
        selectedModifiers: [...(line.selectedModifiers ?? []).map((option) => ({ ...option, priceDeltaPence: 1234 }))],
      })),
    };
    const draft = createWhatsAppBasketDraft(example);
    expect(draft).not.toContain("PRIVATE");
    expect(draft).not.toContain("9876");
    expect(draft).not.toContain("1234");
    expect(draft).not.toContain("9999");
    expect(draft).not.toContain("status: paid");
  });

  test("rejects empty, oversized or invalid carts instead of truncating an order", () => {
    expect(createWhatsAppBasketDraft({ ...basket, lines: [] })).toBeNull();
    expect(createWhatsAppBasketDraft({ ...basket, lines: Array(16).fill(basket.lines[0]) })).toBeNull();
    expect(createWhatsAppBasketDraft({ ...basket, lines: [{ ...basket.lines[0]!, quantity: 0 }] })).toBeNull();
    expect(createWhatsAppBasketDraft({ ...basket, lines: [{ ...basket.lines[0]!, quantity: 51 }] })).toBeNull();
    expect(createWhatsAppBasketDraft({ ...basket, lines: [{ ...basket.lines[0]!, name: "" }] })).toBeNull();
    expect(createWhatsAppBasketUrl("07700 900123", basket)).toBeNull();
  });

  test("strips newlines and control characters from item labels", () => {
    const draft = createWhatsAppBasketDraft({
      ...basket,
      location: "stalbans",
      fulfilment: "pickup",
      lines: [{ brandName: "Café1\nFAKE STATUS", name: "Toast\r\n-- paid --", quantity: 1 }],
    });
    expect(draft).toContain("Location: St Albans");
    expect(draft).toContain("1 × Toast -- paid -- — Café1 FAKE STATUS");
    expect(draft?.split("\n")).toHaveLength(8);
  });

  test("does not generate any URL for a missing contact", () => {
    expect(createWhatsAppBasketUrl(undefined, basket)).toBeNull();
  });
});
