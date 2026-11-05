/**
 * The customer placed clock starts at verified payment, never the earlier time
 * at which a pending Checkout session was opened. Advance the server clock by
 * a monotonic browser duration so changing a device clock cannot jump the UI.
 */
export function customerOrderElapsedMinutes(
  paidAt: string | null,
  serverNow: string,
  millisecondsSinceRefresh = 0,
): number | null {
  if (!paidAt) return null;
  const paid = Date.parse(paidAt);
  const observed = Date.parse(serverNow);
  if (
    !Number.isFinite(paid) ||
    !Number.isFinite(observed) ||
    !Number.isFinite(millisecondsSinceRefresh) ||
    millisecondsSinceRefresh < 0
  )
    return null;
  return Math.max(0, Math.floor((observed + millisecondsSinceRefresh - paid) / 60_000));
}
