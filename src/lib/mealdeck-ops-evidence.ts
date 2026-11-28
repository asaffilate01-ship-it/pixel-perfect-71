/** Presentation-only evidence checks. They never grant access or prove payment. */
export const OPS_EVIDENCE_MAX_AGE_MS = 60_000;
export const MARKETPLACE_HEARTBEAT_MAX_AGE_MS = 90_000;
const FUTURE_TOLERANCE_MS = 5_000;

export function operationalEvidenceFresh(
  checkedAt: string | null | undefined,
  now: number,
  maxAge = OPS_EVIDENCE_MAX_AGE_MS,
): boolean {
  if (typeof checkedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(checkedAt) ||
      !Number.isFinite(now) || !Number.isFinite(maxAge) || maxAge <= 0) return false;
  const age = now - Date.parse(checkedAt);
  return Number.isFinite(age) && age >= -FUTURE_TOLERANCE_MS && age < maxAge;
}

export type MarketplaceHealthEvidence = {
  enabled: boolean;
  commissioned_at: string | null;
  last_seen_at: string | null;
  health_status: "unconfigured" | "healthy" | "degraded";
  unresolved_commands: number;
};

/** A recent heartbeat is evidence of a response only, not of merchant acceptance. */
export function marketplaceHealthLabel(
  connection: MarketplaceHealthEvidence,
  runtimeEnabled: boolean,
  checkedAt: string,
  now: number,
): string {
  if (runtimeEnabled !== true) return "Bridge paused";
  if (connection.enabled !== true) return "Disabled";
  if (!connection.commissioned_at || !Number.isFinite(Date.parse(connection.commissioned_at)) ||
      Date.parse(connection.commissioned_at) > now + FUTURE_TOLERANCE_MS) return "Needs setup";
  if (!Number.isSafeInteger(connection.unresolved_commands) || connection.unresolved_commands < 0)
    return "Report not verified";
  if (connection.unresolved_commands > 0) return "Actions need checking";
  if (!operationalEvidenceFresh(checkedAt, now)) return "Report needs refresh";
  if (connection.health_status !== "healthy") return "Check merchant device";
  if (!operationalEvidenceFresh(connection.last_seen_at, now, MARKETPLACE_HEARTBEAT_MAX_AGE_MS))
    return "Heartbeat not verified";
  return "Recent heartbeat only";
}
