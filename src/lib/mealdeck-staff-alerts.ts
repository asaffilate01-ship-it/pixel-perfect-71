export type StaffAlertKind = "kds" | "printer";
export const staffAlertTones = {
  kds: [
    { frequency: 660, at: 0, duration: 0.16 },
    { frequency: 880, at: 0.23, duration: 0.22 },
  ],
  printer: [
    { frequency: 1100, at: 0, duration: 0.09 },
    { frequency: 1320, at: 0.15, duration: 0.09 },
    { frequency: 1568, at: 0.3, duration: 0.13 },
  ],
} as const;
/** In-memory only: no private order IDs or jobs are written to browser storage. */
export function createStaffAlertLedger(limit = 1500) {
  let seeded = false;
  const seen = new Set<string>();
  function remember(ids: readonly string[]) {
    for (const id of ids) seen.add(id);
    while (seen.size > limit) seen.delete(seen.values().next().value!);
  }
  return {
    observe(ids: readonly string[], fresh: boolean): string[] {
      if (!fresh) return [];
      const next = seeded ? [...new Set(ids)].filter((id) => !seen.has(id)) : [];
      remember(ids);
      seeded = true;
      return next;
    },
    remember,
  };
}
