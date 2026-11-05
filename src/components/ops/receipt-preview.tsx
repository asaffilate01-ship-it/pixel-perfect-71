import {
  formatReceiptMoney as money,
  receiptItemBags,
  type MealDeckReceipt,
} from "@/lib/mealdeck-printer";
export function ReceiptPreview({ receipt: r }: { receipt: MealDeckReceipt }) {
  const ordered = r.items
    .filter((i) => !i.parentLineId)
    .flatMap((parent) => [parent, ...r.items.filter((i) => i.parentLineId === parent.lineId)]);
  return (
    <section
      className="md-receipt-preview space-y-3 bg-white p-5 text-black"
      aria-label={`Receipt for order ${r.displayCode}`}
    >
      <header className="border-b border-dashed border-black pb-3 text-center">
        <h3 className="text-2xl font-black">MEALDECK</h3>
        <p className="text-sm">{r.locationName}</p>
        <p className="my-2 text-3xl font-black">{r.displayCode}</p>
        <p className="font-bold">
          {r.fulfilment === "curbside" ? "KERBSIDE" : "COLLECTION"} · PAID
        </p>
        {r.copyNumber > 1 && (
          <p className="mt-2 border-2 border-black p-2 font-black">
            COPY {r.copyNumber} — {r.reprintReason}
          </p>
        )}
        <p className="mt-2 text-sm">
          {r.customerName} · {new Date(r.paidAt).toLocaleString("en-GB")}
        </p>
        {r.car && (
          <p className="mt-1 text-sm font-bold">
            {r.car.colour} {r.car.make} · Reg ends {r.car.registrationLast4}
          </p>
        )}
      </header>
      <p className="text-sm font-bold">
        {r.cutleryRequested ? "INCLUDE CUTLERY" : "NO CUTLERY REQUESTED"}
        {r.packingPlan.separateBags ? ` · ${r.packingPlan.bags.length} numbered bags` : ""}
      </p>
      <ul className="space-y-3">
        {ordered.map((item) => (
          <li
            key={item.lineId}
            className={item.parentLineId ? "ml-4 border-l border-black pl-3" : ""}
          >
            <div className="flex justify-between gap-3 text-sm font-bold">
              <span>
                {item.quantity}× {item.name}
              </span>
              <span className="shrink-0 tabular-nums">{money(item.linePence)}</span>
            </div>
            <p className="text-xs">
              {item.brandName}
              {item.parentLineId ? " · extra with item above" : ""} · {money(item.unitPence)} each
            </p>
            <p className="mt-1 text-xs font-bold">
              {receiptItemBags(r, item.lineId)
                .map((b) => `Bag ${b.number}: ${b.quantity}×`)
                .join(" · ")}
            </p>
            {item.modifiers.length > 0 && (
              <ul className="mt-1 space-y-1 text-xs">
                {item.modifiers.map((m, n) => (
                  <li key={n}>
                    {m.quantityPerParent}× {m.name} per item ·{" "}
                    {m.priceDeltaPence
                      ? `${money(m.priceDeltaPence)} included in item price`
                      : "included"}
                  </li>
                ))}
              </ul>
            )}
            {item.notes && (
              <p className="mt-1 whitespace-pre-wrap text-sm font-bold">Note: {item.notes}</p>
            )}
          </li>
        ))}
      </ul>
      {r.orderNotes && (
        <p className="whitespace-pre-wrap border-y border-dashed border-black py-2 text-sm font-bold">
          Order note: {r.orderNotes}
        </p>
      )}
      <dl className="space-y-1 border-t border-dashed border-black pt-3 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{money(r.subtotalPence)}</dd>
        </div>
        {r.discountPence > 0 && (
          <div className="flex justify-between">
            <dt>Opening offer</dt>
            <dd>−{money(r.discountPence)}</dd>
          </div>
        )}
        <div className="flex justify-between text-lg font-black">
          <dt>PAID</dt>
          <dd>{money(r.totalPence)}</dd>
        </div>
      </dl>
      <footer className="border-t border-dashed border-black pt-3 text-center text-xs">
        <p>MealDeck is a trading name of 313 Brands Ltd.</p>
        <p>mealdeck.co.uk · Powered by Dishbee</p>
        <p className="mt-2 font-bold">ONE ORDER. EVERY CRAVING.</p>
      </footer>
    </section>
  );
}
