import { Check, PackageCheck } from "lucide-react";
import type { KdsCompletedOrder } from "@/lib/mealdeck-kds-workflow";
import { formatPackingBagName } from "@/lib/mealdeck-packing-name";

/** Read-only durable history. No checklist, mutation, payment or print action. */
export function KdsCompletedCard({ order }: { order: KdsCompletedOrder }) {
  return (
    <article
      className="md-ops-ticket min-w-0 overflow-hidden border md-ops-border border-t-4 md-ops-stage-ready md-ops-paper"
      data-testid="kds-completed-order"
      data-order-id={order.order_id}
    >
      <header className="md-ops-ticket-heading border-b md-ops-divider px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-2xl font-black md-ops-ink">{order.display_code}</h3>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900">
            <Check size={16} aria-hidden="true" />
            Done
          </span>
        </div>
        <p className="mt-1 text-sm md-ops-muted">
          Handover confirmed at{" "}
          <time dateTime={order.completed_at}>
            {new Date(order.completed_at).toLocaleTimeString("en-GB", {
              timeZone: "Europe/London",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>{" "}
          UK time
        </p>
      </header>
      <ul className="space-y-4 p-4" aria-label={`Completed items for ${order.display_code}`}>
        {order.items.map((item) => (
          <li key={item.order_item_id} className="min-w-0 break-words">
            <p className="text-xs font-bold uppercase md-ops-muted">{item.brand_name}</p>
            <p className="font-bold md-ops-ink">
              {item.quantity}× {item.item_name}
            </p>
            {!!item.bags?.length && (
              <p className="mt-1 text-sm font-semibold md-ops-text">
                {item.bags
                  .map((bag) => `${formatPackingBagName(bag)}: ${bag.quantity}×`)
                  .join(" · ")}
              </p>
            )}
            {!item.bags?.length && item.participant_name && (
              <p className="text-sm md-ops-text">For {item.participant_name}</p>
            )}
            {item.modifiers.map((modifier, index) => (
              <p key={index} className="mt-1 text-sm md-ops-text">
                {modifier}
              </p>
            ))}
            {item.notes && (
              <p className="mt-1 whitespace-pre-wrap text-sm md-ops-text">Note: {item.notes}</p>
            )}
          </li>
        ))}
      </ul>
      {order.notes && (
        <p className="px-4 pb-3 whitespace-pre-wrap text-sm md-ops-text">
          Order note: {order.notes}
        </p>
      )}
      <footer className="flex items-center gap-2 border-t md-ops-divider px-4 py-3 text-sm font-semibold md-ops-muted">
        <PackageCheck size={18} aria-hidden="true" />
        Completed · no further kitchen action
      </footer>
    </article>
  );
}
