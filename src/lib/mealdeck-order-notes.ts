export const MAX_ORDER_NOTES_LENGTH = 1000;
export const ORDER_NOTES_ERROR_MESSAGE =
  "Use up to 1,000 characters of plain text for special requests.";

/** Plain kitchen instructions only; these never change catalogue choices or prices. */
export function normaliseOrderNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(ORDER_NOTES_ERROR_MESSAGE);
  const lines = value.replace(/\r\n?/g, "\n");
  // Match the receipt bridge: line breaks/tabs are permitted, but hidden control
  // or format characters must not turn an accepted note into an unprintable job.
  if (/[\p{Cc}\p{Cf}]/u.test(lines.replace(/[\n\t]/g, "")) || /[\uD800-\uDFFF]/u.test(lines))
    throw new Error(ORDER_NOTES_ERROR_MESSAGE);
  const notes = lines.trim();
  if ([...notes].length > MAX_ORDER_NOTES_LENGTH) throw new Error(ORDER_NOTES_ERROR_MESSAGE);
  return notes || null;
}

/** A quote must echo the saved instructions before the customer can pay for it. */
export function orderNotesMatch(requested: unknown, returned: unknown): boolean {
  try {
    return normaliseOrderNotes(requested) === normaliseOrderNotes(returned);
  } catch {
    return false;
  }
}
