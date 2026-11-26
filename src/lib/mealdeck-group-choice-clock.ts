/**
 * Display-only countdown for the server-owned expiry of saved, unpaid
 * participant food choices. The browser clock never grants or revokes access.
 */
export function groupChoiceSecondsRemaining(
  expiresAt: string | null | undefined,
  serverAlignedNow: number,
): number | null {
  if (!expiresAt || !Number.isFinite(serverAlignedNow) || serverAlignedNow <= 0) return null;
  const deadline = Date.parse(expiresAt);
  if (!Number.isFinite(deadline)) return null;
  return Math.max(0, Math.ceil((deadline - serverAlignedNow) / 1000));
}

export function formatGroupChoiceCountdown(seconds: number | null): string | null {
  if (seconds === null || !Number.isSafeInteger(seconds) || seconds < 0) return null;
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
}
