import { z } from "zod";
import {
  normalizeCustomerEmail,
  normalizeCustomerName,
  normalizeCustomerPhone,
} from "./mealdeck-customer";

export const GUEST_PRIVACY_VERSION = "mealdeck-guest-2026-11-05";
export class GuestInputError extends Error {}

export type GuestSession = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
};

export type GuestCheckoutState = { eligible: boolean; session: GuestSession | null };

const guestInput = z
  .object({
    action: z.literal("guest"),
    name: z.string().max(240),
    email: z.string().max(254).nullable().optional(),
    phone: z.string().max(40),
    privacyVersion: z.literal(GUEST_PRIVACY_VERSION),
  })
  .strict();

/** Guest details are contact details, never proof of identity or membership. */
export function normaliseGuestInput(value: unknown) {
  const parsed = guestInput.safeParse(value);
  if (!parsed.success)
    throw new GuestInputError("Please check your guest details and privacy notice.");
  const name = normalizeCustomerName(parsed.data.name);
  const rawEmail = parsed.data.email?.trim() ?? "";
  const email = rawEmail ? normalizeCustomerEmail(rawEmail) : null;
  const phone = normalizeCustomerPhone(parsed.data.phone);
  if (!name || (rawEmail !== "" && !email) || !phone)
    throw new GuestInputError("Enter your name and WhatsApp number, including its country code.");
  return { name, email, phone };
}

export function parseGuestSession(value: unknown): GuestSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (
    !z.uuid().safeParse(entry["id"]).success ||
    typeof entry["name"] !== "string" ||
    !normalizeCustomerName(entry["name"]) ||
    !(
      entry["email"] === null ||
      (typeof entry["email"] === "string" && normalizeCustomerEmail(entry["email"]))
    ) ||
    typeof entry["phone"] !== "string" ||
    !normalizeCustomerPhone(entry["phone"])
  )
    return null;
  return {
    id: entry["id"] as string,
    name: entry["name"],
    email: entry["email"],
    phone: entry["phone"],
  };
}

export function parseGuestCheckoutState(value: unknown): GuestCheckoutState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry["eligible"] !== "boolean") return null;
  const session = entry["session"] === null ? null : parseGuestSession(entry["session"]);
  if (entry["session"] !== null && session === null) return null;
  return { eligible: entry["eligible"], session };
}
