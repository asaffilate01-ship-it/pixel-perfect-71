import { z } from "zod";

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const notificationCampaignSchema = z.object({
  campaignId: z.uuid(),
  title: z.string().min(1).max(60),
  body: z.string().min(1).max(180),
  path: z.enum(["/offers", "/menus"]),
  expiresAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  createdAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  // Unknown future states can be displayed, but can never enable a send action.
  status: z.string().min(1).max(40),
  eligibleDevices: count,
  queued: count,
  accepted: count,
  failed: count,
  skipped: count,
});
export type NotificationCampaign = z.infer<typeof notificationCampaignSchema>;
type CampaignScope = { tenantId: string; locationId: string };
export type NotificationCampaignInput = CampaignScope &
  (
    | { action: "list" }
    | {
        action: "prepare";
        title: string;
        body: string;
        path: "/offers" | "/menus";
        expiresAt: string;
      }
    | { action: "confirm" | "cancel"; campaignId: string }
  );
export type NotificationCampaignResult = {
  available: boolean;
  campaigns: NotificationCampaign[];
  campaign: NotificationCampaign | null;
};

export function parseNotificationCampaignResult(
  action: NotificationCampaignInput["action"],
  value: unknown,
): NotificationCampaignResult {
  if (action === "list") {
    const parsed = z
      .object({
        available: z.boolean(),
        campaigns: z.array(notificationCampaignSchema).max(100),
      })
      .safeParse(value);
    if (parsed.success) return { ...parsed.data, campaign: null };
  } else {
    const parsed = notificationCampaignSchema.extend({ available: z.boolean() }).safeParse(value);
    if (parsed.success) {
      const { available, ...campaign } = parsed.data;
      return { available, campaigns: [campaign], campaign };
    }
  }
  throw new Error(
    "The notification campaign could not be verified. Refresh its status before trying again.",
  );
}

/** Fixed endpoint and authenticated transport; the server authorises every kitchen action. */
export async function requestNotificationCampaigns(
  input: NotificationCampaignInput,
  getAccessToken: () => Promise<string | null>,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<NotificationCampaignResult> {
  const token = await getAccessToken();
  if (!token) throw new Error("Sign in again to manage offer notifications.");
  if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  const response = await request("/api/ops/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(input),
    ...(signal ? { signal } : {}),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const safe = z.object({ message: z.string().min(1).max(400) }).safeParse(result);
    throw new Error(
      safe.success
        ? safe.data.message
        : response.status === 401
          ? "Sign in again to manage offer notifications."
          : response.status === 403
            ? "Your current permissions do not allow offer notifications."
            : "The notification request could not be completed. Refresh its status before trying again.",
    );
  }
  return parseNotificationCampaignResult(input.action, result);
}

/** Browser hints never turn an unknown or expired server draft into a sendable campaign. */
export function canConfirmNotificationCampaign(
  campaign: NotificationCampaign,
  available: boolean,
  now = Date.now(),
): boolean {
  return (
    available &&
    campaign.status === "draft" &&
    campaign.eligibleDevices > 0 &&
    Number.isFinite(now) &&
    Date.parse(campaign.createdAt) <= now &&
    Date.parse(campaign.createdAt) + 15 * 60_000 > now &&
    Date.parse(campaign.expiresAt) > now
  );
}
