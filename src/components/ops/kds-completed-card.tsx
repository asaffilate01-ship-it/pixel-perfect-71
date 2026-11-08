import { Check, LockKeyhole, ShoppingBag, StickyNote, Users, Utensils } from "lucide-react";
import type { KdsCompletedOrder } from "@/lib/mealdeck-kds-workflow";
import { formatPackingBagName } from "@/lib/mealdeck-packing-name";
import { KDS_FULFILMENT_LABELS, kdsClockTime } from "@/lib/mealdeck-kds-view";
import { isOrderNumber, orderDisplayNumber } from "@/lib/mealdeck-order-number";
import { KdsPickupDetails } from "./kds-pickup-details";
import { KdsMealComponents } from "./kds-meal-components";
import { kdsModifierChoiceText, kdsSouvanoMainState } from "@/lib/mealdeck-kds-dish-clarity";

/** Read-only durable history. No checklist, mutation, payment or print action. */
export function KdsCompletedCard({ order }: { order: KdsCompletedOrder }) {
  const quantity = order.items.reduce((total, item) => total + item.quantity, 0);
  const bags = new Set(order.items.flatMap((item) => item.bags?.map((bag) => bag.number) ?? []));
  const orderNumber = orderDisplayNumber(order.order_number, order.display_code);
  const hasOrderNumber = isOrderNumber(order.order_number);
  const referenceLabel = hasOrderNumber ? "Order" : "Collection code";
  return (
    <article
      tabIndex={-1}
      className="md-ops-ticket md-kds-ticket min-w-0 overflow-hidden border md-ops-border border-t-4 md-ops-stage-ready md-ops-paper"
      data-testid="kds-completed-order"
      data-order-id={order.order_id}
      data-stage="done"
      aria-labelledby={`kds-completed-${order.order_id}`}
    >
      <header className="md-ops-ticket-heading md-kds-ticket-heading border-b md-ops-divider">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="md-kds-fulfilment">{KDS_FULFILMENT_LABELS[order.fulfilment]}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900">
            <Check size={16} aria-hidden="true" />
            Done
          </span>
        </div>
        <div className="md-kds-ticket-identity">
          <div className="min-w-0">
            <p className="md-kds-ticket-eyebrow">{referenceLabel}</p>
            <h3 id={`kds-completed-${order.order_id}`} className="md-kds-order-number">
              {orderNumber}
            </h3>
          </div>
          <div className="md-kds-ticket-timer">
            <span>{order.fulfilment === "delivery" ? "Delivered" : "Handed over"}</span>
            <strong>
              <time dateTime={order.completed_at}>{kdsClockTime(order.completed_at)}</time>
            </strong>
          </div>
        </div>
        {hasOrderNumber && (order.fulfilment === "pickup" || order.fulfilment === "curbside") && (
          <p className="md-kds-collection-code">
            <span>Collection code</span>
            <strong>{order.display_code}</strong>
          </p>
        )}
        <div className="md-kds-ticket-meta">
          <span>
            {quantity} {quantity === 1 ? "item" : "items"}
          </span>
          {bags.size > 0 && (
            <span>
              {bags.size} {bags.size === 1 ? "bag" : "bags"}
            </span>
          )}
          {order.group_order && (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" aria-hidden="true" />
              Group order
            </span>
          )}
        </div>
        <p className="mt-2 text-xs md-ops-muted">
          {order.fulfilment === "delivery" ? "Own-driver delivery confirmed" : "Handover confirmed"}{" "}
          ·{" "}
          {new Date(order.completed_at).toLocaleDateString("en-GB", {
            timeZone: "Europe/London",
            weekday: "short",
            day: "numeric",
            month: "short",
          })}{" "}
          · UK time
        </p>
      </header>
      <div className="md-kds-ticket-body">
        <KdsPickupDetails
          fulfilment={order.fulfilment}
          pickupContact={order.pickupContact ?? null}
          deliveryAddress={order.deliveryAddress ?? null}
          deliveryContact={order.deliveryContact ?? null}
        />
        {order.fulfilment === "delivery" && order.driverHandoverAt && (
          <p className="mb-3 rounded-lg border p-3 text-sm font-semibold md-ops-text">
            Driver collected: {kdsClockTime(order.driverHandoverAt)} · Delivered:{" "}
            {kdsClockTime(order.completed_at)}
          </p>
        )}
        <div className="md-kds-packing-flags">
          <span
            className={order.cutlery_requested ? "md-kds-cutlery-requested" : "md-kds-cutlery-none"}
          >
            <Utensils className="size-3.5 shrink-0" aria-hidden="true" />
            {order.cutlery_requested ? "Cutlery requested" : "No cutlery requested"}
          </span>
        </div>
        {order.notes && (
          <div className="md-kds-note flex items-start gap-2">
            <StickyNote className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-5">
              <strong>Order note: </strong>
              {order.notes}
            </p>
          </div>
        )}
        <ul
          className="md-kds-lines"
          aria-label={`Completed items for ${referenceLabel.toLowerCase()} ${orderNumber}`}
        >
          {order.items.map((item) => (
            <li
              key={item.order_item_id}
              className="md-kds-line min-w-0 break-words"
              data-ready="true"
            >
              <p className="mb-1 text-xs font-bold uppercase md-ops-accent">{item.brand_name}</p>
              <div className="md-kds-line-title">
                <span className="md-ops-ticket-quantity md-kds-quantity">{item.quantity}×</span>
                <p
                  className={kdsSouvanoMainState(item) ? "md-kds-souvano-main" : undefined}
                  data-main-state={kdsSouvanoMainState(item) ?? undefined}
                >
                  {kdsSouvanoMainState(item) && (
                    <span className="md-kds-souvano-main-label">
                      {kdsSouvanoMainState(item) === "verify-main"
                        ? "VERIFY MAIN — check order record"
                        : "MAIN DISH"}
                    </span>
                  )}
                  <span
                    className={kdsSouvanoMainState(item) ? "md-kds-souvano-main-name" : undefined}
                  >
                    {item.item_name}
                  </span>
                </p>
              </div>
              {item.unit_pence != null && (
                <p className="md-kds-line-price">
                  <strong>£{(item.unit_pence / 100).toFixed(2)} each</strong>
                  <span> · selected choices included</span>
                  {item.quantity > 1 && (
                    <span>
                      {" "}
                      · £{((item.quantity * item.unit_pence) / 100).toFixed(2)} line total
                    </span>
                  )}
                </p>
              )}
              <KdsMealComponents components={item.mealComponents ?? []} quantity={item.quantity} />
              {!!item.bags?.length && (
                <ul className="md-kds-bag-labels" aria-label={`Packing for ${item.item_name}`}>
                  {item.bags.map((bag) => (
                    <li key={bag.number}>
                      <ShoppingBag className="size-3 shrink-0" aria-hidden="true" />
                      <span>{formatPackingBagName(bag)}</span>
                      <strong>{bag.quantity}×</strong>
                    </li>
                  ))}
                </ul>
              )}
              {!item.bags?.length && item.participant_name && (
                <p className="text-sm md-ops-text">For {item.participant_name}</p>
              )}
              {!!item.modifiers.length && (
                <ul className="md-kds-choices" aria-label={`Choices for ${item.item_name}`}>
                  {item.modifiers.map((modifier, index) => (
                    <li key={index}>
                      <span className="md-kds-choice-mark" aria-hidden="true" />
                      <span>{kdsModifierChoiceText(item, modifier)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {item.notes && (
                <div className="md-kds-note mt-2 flex items-start gap-2">
                  <StickyNote className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-5">
                    <strong>Item note: </strong>
                    {item.notes}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
      <footer className="md-ops-ticket-footer flex items-center gap-2 border-t md-ops-divider px-4 py-3 text-sm font-semibold md-ops-muted">
        <LockKeyhole size={16} aria-hidden="true" />
        Completed · read-only
      </footer>
    </article>
  );
}
