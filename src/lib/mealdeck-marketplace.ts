import { z } from "zod";
import { marketplacePlatformSchema, marketplaceActionSchema, marketplaceCapabilitiesSchema } from "./mealdeck-marketplace-protocol";
import { operationalEvidenceFresh, MARKETPLACE_HEARTBEAT_MAX_AGE_MS } from "./mealdeck-ops-evidence";

/** Read-only staff presentation. Never use this projection as payment or command authority. */
export const MARKETPLACE_LABELS = { uber_eats: "Uber Eats", just_eat: "Just Eat" } as const;
const state = z.enum(["unknown", "new", "accepted", "preparing", "ready", "handed_over", "cancelled"]);
const sync = z.enum(["idle", "queued", "sending", "confirmed", "needs_checking", "unsupported", "unconfigured"]);
const reference = z.string().min(1).max(160).refine(value =>
  [...value].length <= 80 && value.trim() === value && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value));

export const marketplaceProjectionSchema = z.strictObject({
  platform: marketplacePlatformSchema,
  display_reference: reference,
  platform_state: state,
  confirmed_at: z.iso.datetime({ offset: true }).nullable(),
  sync_state: sync,
  pending_action: marketplaceActionSchema.nullable(),
  capabilities: marketplaceCapabilitiesSchema,
}).refine(value => (value.platform_state === "unknown") === (value.confirmed_at === null))
  .refine(value => value.sync_state !== "confirmed" ||
    (value.confirmed_at !== null && ["accepted", "preparing", "ready", "handed_over"].includes(value.platform_state)))
  .refine(value => !["queued", "sending"].includes(value.sync_state) || value.pending_action !== null);

export type MarketplaceProjection = z.infer<typeof marketplaceProjectionSchema>;
export const MARKETPLACE_STATE_LABELS: Record<MarketplaceProjection["platform_state"], string> = {
  unknown: "Not verified", new: "Awaiting acceptance", accepted: "Accepted",
  preparing: "Preparing", ready: "Ready for collection", handed_over: "Handed over to courier or customer",
  cancelled: "Cancelled",
};

export function marketplaceOrderReference(value: MarketplaceProjection) {
  return { label: MARKETPLACE_LABELS[value.platform] + " order", value: value.display_reference };
}

export function marketplaceSyncPresentation(value: MarketplaceProjection, now: number): {
  headline: string; detail: string; tone: "neutral" | "pending" | "warning" | "confirmed";
} {
  const platform = MARKETPLACE_LABELS[value.platform];
  if (value.platform_state === "cancelled") return { headline: "Cancelled on " + platform,
    detail: "Check the original merchant screen. Do not prepare or hand over this order.", tone: "warning" };
  if (value.sync_state === "needs_checking") return { headline: platform + " needs checking",
    detail: "Verify the exact order in the merchant app before retrying any action.", tone: "warning" };
  if (value.sync_state === "queued" || value.sync_state === "sending") return {
    headline: (value.sync_state === "queued" ? "Queued for " : "Sending to ") + platform,
    detail: "The requested action is not confirmed by the platform.", tone: "pending" };
  if (value.sync_state === "unsupported" || value.sync_state === "unconfigured") return {
    headline: value.sync_state === "unsupported" ? "Update in " + platform + " app" : platform + " connection not configured",
    detail: "Use the original merchant screen; no successful update is inferred.", tone: "warning" };
  if (!operationalEvidenceFresh(value.confirmed_at, now, MARKETPLACE_HEARTBEAT_MAX_AGE_MS)) return {
    headline: "Refresh " + platform + " status",
    detail: "The last observation is missing or out of date. Current merchant status is not verified.", tone: "warning" };
  if (value.sync_state === "confirmed") return { headline: "Update confirmed on " + platform,
    detail: "Recent merchant readback only. This does not establish direct payment or customer delivery.", tone: "confirmed" };
  return { headline: "Last seen on " + platform, detail: MARKETPLACE_STATE_LABELS[value.platform_state], tone: "neutral" };
}
