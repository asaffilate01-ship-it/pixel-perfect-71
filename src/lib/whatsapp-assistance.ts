/**
 * A customer-authored WhatsApp enquiry, never an order or payment instruction.
 * Only dish labels, quantities and chosen modifier names leave this app.
 * Dishbee remains authoritative for menu prices, availability and paid KDS release.
 */

export type WhatsAppLocation = "luton" | "stalbans";
export type WhatsAppFulfilment = "delivery" | "pickup" | "curbside" | "dinein";

export type WhatsAppBasketLine = {
  brandName: string;
  name: string;
  quantity: number;
  selectedModifiers?: readonly { name: string }[];
};

export type WhatsAppBasketDraft = {
  location: WhatsAppLocation;
  fulfilment: WhatsAppFulfilment;
  lines: readonly WhatsAppBasketLine[];
};

const LOCATION_NAMES: Record<WhatsAppLocation, string> = {
  luton: "Luton",
  stalbans: "St Albans",
};

const FULFILMENT_NAMES: Record<WhatsAppFulfilment, string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  curbside: "Kerbside",
  dinein: "Dine in",
};

function safeLabel(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

/** Requires an E.164 official business number; no guessed or user-supplied number. */
export function normaliseBusinessWhatsAppNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const number = value.trim();
  return /^\+[1-9]\d{7,14}$/.test(number) ? number : null;
}

export function createWhatsAppBasketDraft(input: WhatsAppBasketDraft): string | null {
  if (!input || !Object.hasOwn(LOCATION_NAMES, input.location)) return null;
  if (!Object.hasOwn(FULFILMENT_NAMES, input.fulfilment)) return null;
  if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 15) return null;

  const entries: string[] = [];
  for (const line of input.lines) {
    if (!line || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 50) {
      return null;
    }
    const brand = safeLabel(line.brandName, 65);
    const dish = safeLabel(line.name, 95);
    if (!brand || !dish) return null;
    if (line.selectedModifiers && (!Array.isArray(line.selectedModifiers) || line.selectedModifiers.length > 8)) {
      return null;
    }
    const modifiers: readonly { name: string }[] = line.selectedModifiers ?? [];
    const options = modifiers.map((modifier) =>
      safeLabel(modifier?.name, 55),
    ).filter(Boolean);
    const suffix = options.length ? " (" + options.join(", ") + ")" : "";
    entries.push(line.quantity + " × " + dish + " — " + brand + suffix);
  }

  const message = [
    "Hello MealDeck, can you help me with this basket?",
    "Location: " + LOCATION_NAMES[input.location],
    "Preferred fulfilment: " + FULFILMENT_NAMES[input.fulfilment],
    "",
    ...entries,
    "",
    "This is an enquiry, not a placed or paid order.",
    "Please confirm current availability, final prices, delivery fees and an official secure payment link before preparation.",
  ].join("\n");

  return message.length <= 1900 ? message : null;
}

/** Openable only when a separately verified, server-configured channel is enabled. */
export function createWhatsAppBasketUrl(
  businessNumber: unknown,
  input: WhatsAppBasketDraft,
): string | null {
  const phone = normaliseBusinessWhatsAppNumber(businessNumber);
  const message = createWhatsAppBasketDraft(input);
  if (!phone || !message) return null;
  return "https://wa.me/" + phone.slice(1) + "?text=" + encodeURIComponent(message);
}
