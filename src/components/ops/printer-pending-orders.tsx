import { Check, Printer, ShieldCheck } from "lucide-react";
import { formatReceiptMoney } from "@/lib/mealdeck-printer";
import { formatPackingBagName } from "@/lib/mealdeck-packing-name";
import { orderDisplayNumber } from "@/lib/mealdeck-order-number";
import {
  printerAcceptanceAction,
  type PrinterPendingOrder,
} from "@/lib/mealdeck-printer-acceptance";

export function PrinterConnectionStatus({
  fresh,
  paired,
  automatic,
  busy,
  onAutomaticChange,
}: {
  fresh: boolean;
  paired: boolean;
  automatic: boolean;
  busy: boolean;
  onAutomaticChange: (enabled: boolean) => void;
}) {
  const ready = fresh && paired && automatic;
  return (
    <section className="md-ops-card md-printer-connection" aria-label="Receipt printing status">
      <div className="md-printer-connection-copy">
        <p className="text-xs font-bold uppercase tracking-[.14em] md-ops-muted">
          This browser’s printer bridge
        </p>
        <h3 className="mt-1 text-lg font-black">
          {ready
            ? "Automatic printing is on"
            : !paired
              ? "Automatic printing needs a connection"
              : automatic
                ? "Automatic printing is paused"
                : "Automatic printing is off"}
        </h3>
        <p className="mt-2 text-sm leading-6 md-ops-muted">
          {ready
            ? "Accept here or on the KDS. This terminal sends each waiting receipt once; check the paper after it is sent."
            : !paired
              ? "Accept orders to queue their receipts. Connect a supported printer to enable automatic receipts. Built-in Android printers need a compatible device connection; installing this PWA does not connect the printer."
              : !fresh
                ? "Waiting for a verified live queue. Acceptance and printing resume when the connection is restored."
                : "Accepted orders keep their place in the receipt queue. Turn on automatic printing or print a waiting receipt manually."}
        </p>
        {!paired && (
          <p className="mt-2 text-sm leading-6 md-ops-muted">
            For the H10S, start auto-print in the MealDeck Printer APK. Its running status is shown
            in the app; this browser’s switch controls only a paired network-printer bridge.
          </p>
        )}
      </div>
      <div className="md-printer-connection-controls">
        <div className="md-printer-status-chips" aria-label="Connection checks">
          <span className={`md-printer-status-chip ${fresh ? "is-ready" : "is-waiting"}`}>
            {fresh ? "Queue live" : "Queue paused"}
          </span>
          <span className={`md-printer-status-chip ${paired ? "is-ready" : "is-waiting"}`}>
            {paired ? "Local bridge paired" : "Bridge not paired"}
          </span>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm font-bold">
          <input
            type="checkbox"
            className="size-5"
            checked={automatic}
            disabled={busy || !paired}
            onChange={(event) => onAutomaticChange(event.target.checked)}
          />
          Print waiting receipts automatically
        </label>
      </div>
    </section>
  );
}

export function PrinterPendingOrderCard({
  order,
  fresh,
  paired,
  automatic,
  busy,
  accepting,
  onAccept,
}: {
  order: PrinterPendingOrder;
  fresh: boolean;
  paired: boolean;
  automatic: boolean;
  busy: boolean;
  accepting: boolean;
  onAccept: () => void;
}) {
  const items = order.items
    .filter((item) => !item.parentLineId)
    .flatMap((parent) => [
      parent,
      ...order.items.filter((item) => item.parentLineId === parent.lineId),
    ]);
  const action = printerAcceptanceAction({ fresh, paired, automatic });
  const number = orderDisplayNumber(order.orderNumber, "");
  return (
    <article
      className="md-ops-card md-printer-pending-card"
      aria-label={`Paid ${number ? `order ${number}` : `collection ${order.displayCode}`} awaiting acceptance`}
    >
      <header className="md-printer-pending-header">
        <div>
          <p className="md-printer-new-label">
            <ShieldCheck className="size-4" aria-hidden="true" /> Paid · awaiting acceptance
          </p>
          <h4 className="md-printer-order-number">{number ? `Order ${number}` : "Paid order"}</h4>
          <p className="mt-1 text-sm md-ops-muted">
            Collection code <strong className="tabular-nums">{order.displayCode}</strong>
          </p>
          <p className="text-sm font-bold">
            {order.fulfilment === "delivery"
              ? "Own-driver delivery"
              : order.fulfilment === "curbside"
                ? "Kerbside"
                : "Collection"}{" "}
            · paid{" "}
            {new Date(order.paidAt).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/London",
            })}
          </p>
        </div>
        <p className="md-printer-paid-total">
          {formatReceiptMoney(order.totalPence)}
          <span>paid</span>
        </p>
      </header>
      <div className="space-y-3 p-4">
        <p className="text-sm font-bold">
          {order.items.reduce((count, item) => count + item.quantity, 0)} items ·{" "}
          {order.packingPlan.bags.length} {order.packingPlan.bags.length === 1 ? "bag" : "bags"} ·{" "}
          {order.cutleryRequested ? "Include cutlery" : "No cutlery"}
        </p>
        <ul className="md-printer-order-items">
          {items.map((item) => (
            <li
              key={item.lineId}
              className={item.parentLineId ? "md-printer-attached-item" : undefined}
            >
              <p className="font-bold">
                {item.quantity}× {item.name}
              </p>
              <p className="text-xs md-ops-muted">
                {item.brandName}
                {item.parentLineId ? " · extra with the item above" : ""}
              </p>
              <p className="mt-1 text-xs md-ops-muted">
                <strong>{formatReceiptMoney(item.unitPence)} each</strong>
                {" · selected choices included"}
                {item.quantity > 1 && (
                  <span>
                    {" · "}
                    {formatReceiptMoney(item.quantity * item.unitPence)} line total
                  </span>
                )}
              </p>
              {!!item.mealComponents?.length && (
                <div className="mt-2 border-l-2 md-ops-border pl-2 text-sm">
                  <p className="text-xs font-bold">
                    Meal includes{item.quantity > 1 ? ` · totals for ${item.quantity} items` : ""}
                  </p>
                  <ul aria-label="Meal contents" className="mt-1 space-y-1 break-words">
                    {item.mealComponents.map((component) => (
                      <li key={component.slot}>
                        <strong>{item.quantity * component.quantityPerParent}×</strong>{" "}
                        {component.name}
                        {component.replacement && (
                          <span className="block text-xs md-ops-muted">
                            Replaces the standard {component.slot === "drink" ? "drink" : "side"}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
        {order.notes && <p className="md-printer-order-note">Order note: {order.notes}</p>}
        <details className="md-printer-choice-details">
          <summary>Choices, notes and packing</summary>
          <ul className="space-y-4 pb-3">
            {items.map((item) => (
              <li
                key={item.lineId}
                className={item.parentLineId ? "md-printer-attached-item" : undefined}
              >
                <p className="text-sm font-bold">
                  {item.quantity}× {item.name}
                </p>
                <p className="mt-1 text-xs font-bold">
                  {item.bags
                    .map((bag) => {
                      const packingBag = order.packingPlan.bags.find(
                        (entry) => entry.number === bag.number,
                      )!;
                      return `${formatPackingBagName(packingBag)}: ${bag.quantity}×`;
                    })
                    .join(" · ")}
                </p>
                {item.modifiers.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm md-ops-muted">
                    {item.modifiers.map((modifier, index) => (
                      <li key={index}>{modifier}</li>
                    ))}
                  </ul>
                )}
                {item.notes && (
                  <p className="mt-2 whitespace-pre-wrap text-sm font-bold">Note: {item.notes}</p>
                )}
              </li>
            ))}
          </ul>
        </details>
        <button
          type="button"
          className="md-ops-button md-ops-primary w-full"
          disabled={busy || !fresh}
          onClick={onAccept}
        >
          {action === "Accept & print" ? (
            <Printer className="size-4" aria-hidden="true" />
          ) : (
            <Check className="size-4" aria-hidden="true" />
          )}
          {accepting ? "Accepting order…" : action}
        </button>
        <p className="text-xs leading-5 md-ops-muted">
          {!fresh
            ? "Refresh the live queue before accepting this order."
            : action === "Accept & print"
              ? "Queues one receipt for automatic printing. Confirm the actual paper after it is sent."
              : "Queues one receipt for the kitchen printer. On the H10S, check that MealDeck Printer shows auto-print running."}
        </p>
      </div>
    </article>
  );
}
