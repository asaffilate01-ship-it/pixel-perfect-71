import { AlertCircle, Check, Clock3, Store } from "lucide-react";
import { MARKETPLACE_STATE_LABELS, marketplaceOrderReference, marketplaceSyncPresentation, type MarketplaceProjection } from "@/lib/mealdeck-marketplace";

/** Read-only card for the future dedicated marketplace board; no mutation controls. */
export function KdsMarketplaceStatus({ marketplace, now }: { marketplace: MarketplaceProjection; now: number }) {
  const reference = marketplaceOrderReference(marketplace);
  const status = marketplaceSyncPresentation(marketplace, now);
  const Icon = status.tone === "warning" ? AlertCircle : status.tone === "confirmed" ? Check : Clock3;
  return (
    <section className="min-w-0 rounded-xl border border-current/20 p-3 text-sm" aria-label={reference.label}>
      <div className="flex flex-wrap items-center gap-2">
        <Store className="size-4 shrink-0" aria-hidden="true" />
        <span className="font-semibold">{reference.label}</span>
      </div>
      <p className="my-2 break-all font-mono text-xl font-black tabular-nums">{reference.value}</p>
      <div role="status" aria-atomic="true" data-tone={status.tone}>
        <p className="flex items-center gap-2 font-semibold">
          <Icon className="size-4 shrink-0" aria-hidden="true" />{status.headline}
        </p>
        <p className="mt-1 [overflow-wrap:anywhere]">{status.detail}</p>
        {marketplace.confirmed_at && <p className="mt-2 text-xs">
          Last observed: {MARKETPLACE_STATE_LABELS[marketplace.platform_state]} ·{" "}
          <time dateTime={marketplace.confirmed_at}>{new Date(marketplace.confirmed_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}</time> UK
        </p>}
      </div>
      <p className="mt-2 text-xs">Platform handover is not proof of completed customer delivery.</p>
    </section>
  );
}
