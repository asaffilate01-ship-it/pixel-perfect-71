import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { COMING_SOON } from "./launch-status";
import { normaliseBusinessWhatsAppNumber } from "./whatsapp-assistance";

const contactSchema = z.object({
  location: z.enum(["luton", "stalbans"]),
});

type WhatsAppContact =
  | { available: false }
  | { available: true; phone: string };

/**
 * Returns a PUBLIC business number, not an Omniqora access token.
 *
 * Enabling the channel requires:
 * 1. An explicit feature flag.
 * 2. A verified, individually configured number for the requested kitchen.
 * 3. The separate launch gate to be open.
 *
 * No payment, WhatsApp session, or Dishbee order is created by this endpoint.
 */
export const getWhatsAppHandoffContact = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => contactSchema.parse(input))
  .handler(async ({ data }): Promise<WhatsAppContact> => {
    if (COMING_SOON || process.env["MEALDECK_WHATSAPP_ASSISTANCE_ENABLED"] !== "true") {
      return { available: false };
    }

    const prefix = data.location === "luton" ? "MEALDECK_LUTON" : "MEALDECK_STALBANS";
    if (process.env[prefix + "_WHATSAPP_VERIFIED"] !== "true") {
      return { available: false };
    }

    const phone = normaliseBusinessWhatsAppNumber(
      process.env[prefix + "_WHATSAPP_BUSINESS_NUMBER"],
    );
    if (!phone) return { available: false };

    return { available: true, phone };
  });
