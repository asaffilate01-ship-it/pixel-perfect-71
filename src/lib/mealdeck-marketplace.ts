import { z } from "zod";
import { isOrderNumber, orderDisplayNumber } from "./mealdeck-order-number";

/** Staff presentation only. Connector identity and command authority live on the server. */
export const MARKETPLACE_LABELS = {
  uber_eats: "Uber Eats",
  just_eat: "Just Eat",
} as const;

export const marketplacePlatformSchema = z.enum(["uber_eats", "just_eat"]);
export const marketplaceActionSchema = z.enum(["accept", "preparing", "ready", "handover"]);
export const marketplaceStateSchema = z.enum([
  "unknown",
  "new",
  "accepted",
  "preparing",
  "ready",
  "handed_over",
  "cancelled",
]);
export const marketplaceSyncStateSchema = z.enum([
  "idle",
  "queued",
  "sending",
  "confirmed",
  "needs_checking",
  "unsupported",
  "unconfigured",
]);

// Do not parse a platform reference as a number, change case, remove punctuation
// or trim it. This is the exact reference shared with the customer and courier.
export const marketplaceReferenceSchema = z
  .string()
  .min(1)
  .max(160)
  .refine(
    (value) =>
      [...value].length <= 80 &&
      value.trim() === value &&
      !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value),
  );

const timestamp = z
  .string()
  .max(64)
  .refine((value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)));

export const marketplaceProjectionSchema = z
  .object({
    platform: marketplacePlatformSchema,
    display_reference: marketplaceReferenceSchema,
    platform_state: marketplaceStateSchema,
    confirmed_at: timestamp.nullable(),
    sync_state: marketplaceSyncStateSchema,
    pending_action: marketplaceActionSchema.nullable(),
    capabilities: z.object({
      accept: z.boolean(),
      preparing: z.boolean(),
      ready: z.boolean(),
      handover: z.boolean(),
    }),
  })
  .refine((value) => value.platform_state === "unknown" || value.confirmed_at !== null)
  .refine(
    (value) =>
      value.sync_state !== "confirmed" ||
      (value.confirmed_at !== null && value.platform_state !== "unknown"),
  );

export type MarketplacePlatform = z.infer<typeof marketplacePlatformSchema>;
export type MarketplaceAction = z.infer<typeof marketplaceActionSchema>;
export type MarketplaceProjection = z.infer<typeof marketplaceProjectionSchema>;

const cancellationAcknowledgementSchema = z.object({
  ok: z.literal(true),
  order_id: z.uuid(),
  acknowledged: z.literal(true),
  replayed: z.boolean(),
});

/** Cancellation acknowledgement removes an active card; it never means Done or refunded. */
export function parseMarketplaceCancellationAcknowledgement(value: unknown, orderId: string) {
  const parsed = cancellationAcknowledgementSchema.safeParse(value);
  if (!parsed.success || parsed.data.order_id !== orderId)
    throw new Error("mealdeck_marketplace_invalid_response");
  return parsed.data;
}

export const MARKETPLACE_STATE_LABELS: Record<MarketplaceProjection["platform_state"], string> = {
  unknown: "Not verified",
  new: "Awaiting acceptance",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready for collection",
  handed_over: "Handed over",
  cancelled: "Cancelled",
};

const actionLabels: Record<MarketplaceAction, string> = {
  accept: "Acceptance",
  preparing: "Preparing update",
  ready: "Ready update",
  handover: "Handover update",
};

type OrderReference = {
  display_code: string;
  order_number?: string | null | undefined;
  marketplace?: MarketplaceProjection | null | undefined;
};

export function kdsOrderReference(order: OrderReference): { label: string; value: string } {
  if (order.marketplace) {
    return {
      label: `${MARKETPLACE_LABELS[order.marketplace.platform]} order`,
      value: order.marketplace.display_reference,
    };
  }
  return {
    label: isOrderNumber(order.order_number) ? "Order" : "Collection code",
    value: orderDisplayNumber(order.order_number, order.display_code),
  };
}

/** A local staff acceptance is not evidence that the marketplace accepted it. */
export function marketplaceAcceptanceConfirmed(marketplace: MarketplaceProjection): boolean {
  return (
    marketplace.confirmed_at !== null &&
    ["accepted", "preparing", "ready", "handed_over"].includes(marketplace.platform_state)
  );
}

/** UI assistance only; the marketplace RPC independently enforces these checks. */
export function marketplaceKitchenBlockReason(order: {
  accepted_at?: string | null;
  blocked_reason?: "routing_incomplete" | "snapshot_hold" | null;
  marketplace?: MarketplaceProjection | null;
}): string | null {
  const marketplace = order.marketplace;
  if (!marketplace) return null;
  const platform = MARKETPLACE_LABELS[marketplace.platform];
  if (marketplace.platform_state === "cancelled")
    return `Cancelled on ${platform}. Check the order in the app before continuing.`;
  if (order.blocked_reason === "snapshot_hold")
    return `The order changed on ${platform}. Check the full order in the app before continuing.`;
  if (marketplaceAcceptanceConfirmed(marketplace)) return null;
  if (order.accepted_at)
    return `Waiting for ${platform} to confirm acceptance. Check the app before preparing.`;
  if (marketplace.sync_state === "queued" || marketplace.sync_state === "sending")
    return `Acceptance is waiting for ${platform}. Refresh to check the result.`;
  if (marketplace.sync_state === "needs_checking")
    return `Acceptance needs checking on ${platform}. Check the app before trying again.`;
  if (!marketplace.capabilities.accept || marketplace.sync_state === "unconfigured")
    return `Accept on ${platform} first, then refresh this ticket.`;
  return null;
}

export function marketplaceSyncPresentation(marketplace: MarketplaceProjection): {
  headline: string;
  detail: string | null;
  tone: "neutral" | "pending" | "warning" | "confirmed";
} {
  const platform = MARKETPLACE_LABELS[marketplace.platform];
  const action = marketplace.pending_action ? actionLabels[marketplace.pending_action] : "Update";
  if (marketplace.platform_state === "cancelled") {
    return {
      headline: `Cancelled on ${platform}`,
      detail: "Check the order in the platform app. Kitchen actions are paused.",
      tone: "warning",
    };
  }
  switch (marketplace.sync_state) {
    case "queued":
      return {
        headline: `Queued for ${platform}`,
        detail: `${action} is waiting to send. It has not been confirmed by ${platform}.`,
        tone: "pending",
      };
    case "sending":
      return {
        headline: `Sending to ${platform}`,
        detail: `${action} has not been confirmed by ${platform} yet.`,
        tone: "pending",
      };
    case "needs_checking":
      return {
        headline: `${platform} needs checking`,
        detail: `Check this order in the ${platform} app before retrying the update.`,
        tone: "warning",
      };
    case "unsupported":
      return {
        headline: `Update on ${platform}`,
        detail: `${action} was recorded in the kitchen only. Complete any available update in the ${platform} app.`,
        tone: "warning",
      };
    case "unconfigured":
      return {
        headline: `${platform} connection not configured`,
        detail: `Kitchen updates are not being sent. Use the ${platform} app.`,
        tone: "warning",
      };
    case "confirmed":
      return { headline: `Update confirmed on ${platform}`, detail: null, tone: "confirmed" };
    default:
      return {
        headline: marketplace.confirmed_at
          ? `${platform} status`
          : `${platform} status not verified`,
        detail: null,
        tone: "neutral",
      };
  }
}

export type MarketplaceKitchenAction = {
  target: "accept" | "order" | "pass" | "item" | "handoff";
  status: "accepted" | "preparing" | "ready" | "packing" | "sealed" | "completed";
  itemId?: string;
  ready?: boolean;
  code?: string;
};

/** Keep every marketplace mutation on its dedicated scoped order ledger. */
export function marketplaceTransitionParameters(
  scope: { tenantId: string; locationId: string; orderId: string; version: string },
  action: MarketplaceKitchenAction,
): Record<string, unknown> {
  let command: "accept" | "preparing" | "item_ready" | "packing" | "sealed" | "handover";
  if (action.target === "accept" && action.status === "accepted") command = "accept";
  else if (action.target === "order" && action.status === "preparing") command = "preparing";
  else if (
    action.target === "item" &&
    (action.status === "preparing" || action.status === "ready") &&
    action.itemId &&
    typeof action.ready === "boolean"
  )
    command = "item_ready";
  else if (action.target === "pass" && (action.status === "packing" || action.status === "sealed"))
    command = action.status;
  else if (action.target === "handoff" && action.status === "completed" && action.code)
    command = "handover";
  else throw new Error("mealdeck_marketplace_invalid_action");
  return {
    p_tenant: scope.tenantId,
    p_location: scope.locationId,
    p_order: scope.orderId,
    p_expected_version: scope.version,
    p_action: command,
    ...(command === "item_ready" ? { p_item: action.itemId, p_ready: action.ready } : {}),
    ...(command === "handover" ? { p_reference: action.code } : {}),
  };
}
