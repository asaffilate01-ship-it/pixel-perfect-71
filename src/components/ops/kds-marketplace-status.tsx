import { AlertCircle, Check, Clock3, Store } from "lucide-react";
import {
  MARKETPLACE_LABELS,
  MARKETPLACE_STATE_LABELS,
  marketplaceSyncPresentation,
  type MarketplaceProjection,
} from "@/lib/mealdeck-marketplace";
import { kdsClockTime } from "@/lib/mealdeck-kds-view";

export function KdsMarketplaceSource({ marketplace }: { marketplace: MarketplaceProjection }) {
  return (
    <span
      className="md-kds-marketplace-source"
      aria-label={`Order source: ${MARKETPLACE_LABELS[marketplace.platform]}`}
    >
      <Store className="size-3.5 shrink-0" aria-hidden="true" />
      {MARKETPLACE_LABELS[marketplace.platform]}
    </span>
  );
}

/** This reports read-back evidence, never infers a platform status from a kitchen stage. */
export function KdsMarketplaceStatus({
  marketplace,
  completed = false,
}: {
  marketplace: MarketplaceProjection;
  completed?: boolean;
}) {
  const status = marketplaceSyncPresentation(marketplace);
  const Icon =
    status.tone === "warning" ? AlertCircle : status.tone === "confirmed" ? Check : Clock3;
  return (
    <div
      className="md-kds-marketplace-status"
      data-tone={status.tone}
      data-sync-state={marketplace.sync_state}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="md-kds-marketplace-status-heading">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <strong>{status.headline}</strong>
      </p>
      {status.detail && <p>{status.detail}</p>}
      {marketplace.confirmed_at && marketplace.platform_state !== "unknown" && (
        <p>
          Last seen on {MARKETPLACE_LABELS[marketplace.platform]}:{" "}
          {MARKETPLACE_STATE_LABELS[marketplace.platform_state]}
          {" · "}
          <time dateTime={marketplace.confirmed_at}>{kdsClockTime(marketplace.confirmed_at)}</time>
          {" UK"}
        </p>
      )}
      {completed && (
        <p>Handover is recorded in this kitchen. Customer delivery is confirmed by the platform.</p>
      )}
    </div>
  );
}
