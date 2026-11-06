import { z } from "zod";

// Printed names cannot contain terminal controls, bidi overrides or line breaks.
// Count Unicode code points, matching the database's 32-character nickname limit.
const unsafeNameCharacters = /[\p{Cc}\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/u;
// Keep this explicit set aligned with ordering_person_name in the database and
// the standalone receipt bridge. Pasted non-breaking/wide spaces canonicalise
// before a name is saved, while read-side snapshots must already be canonical.
const canonicalSpacing = (value: string) =>
  value.replace(/[ \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]+/gu, " ").trim();

/** Read-side names are immutable server snapshots, never silently rewritten. */
export const packingPersonNameSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => [...value].length <= 32, "Use a name of 32 characters or fewer.")
  .refine((value) => !unsafeNameCharacters.test(value), "Use a name without control characters.")
  .refine((value) => value === canonicalSpacing(value), "Use a name without extra spaces.");

/** Only room create/join input may normalise spacing before storing a name. */
export function normalisePackingPersonName(value: string): string {
  // Reject controls before trimming so a leading newline cannot be hidden.
  if (unsafeNameCharacters.test(value)) return packingPersonNameSchema.parse(value);
  return packingPersonNameSchema.parse(canonicalSpacing(value));
}

export function formatPackingBagName(bag: { number: number; name?: string | undefined }): string {
  return bag.name === undefined ? `Bag ${bag.number}` : `${bag.name} · Bag ${bag.number}`;
}
