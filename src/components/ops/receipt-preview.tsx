import {
  formatReceiptMoney as money,
  receiptItemBags,
  type MealDeckReceipt,
} from "@/lib/mealdeck-printer";
import { formatPackingBagName } from "@/lib/mealdeck-packing-name";
import { orderDisplayNumber } from "@/lib/mealdeck-order-number";
import { receiptLogoSource } from "@/lib/mealdeck-receipt-logo";
export function ReceiptPreview({ receipt: r }: { receipt: MealDeckReceipt }) {
  const number = orderDisplayNumber(r.orderNumber, "");
  const ordered = r.items
    .filter((i) => !i.parentLineId)
    .flatMap((parent) => [parent, ...r.items.filter((i) => i.parentLineId === parent.lineId)]);
  return (
    <section
      className="md-receipt-preview space-y-3 bg-white p-5 text-black"
      aria-label={
        number ? `Receipt for order ${number}` : `Receipt with collection code ${r.displayCode}`
      }
    >
      <header className="border-b border-dashed border-black pb-3 text-center">
        <img
          data-receipt-logo
          src={receiptLogoSource}
          alt="MealDeck"
          width={1106}
          height={1116}
          loading="eager"
          className="mx-auto mb-2 block h-auto w-36 max-w-full"
        />
        <h3 className="text-2xl font-black">MEALDECK</h3>
        <p className="text-sm">{r.locationName}</p>
        {number && (
          <p className="my-2 break-words text-3xl font-black tabular-nums">ORDER {number}</p>
        )}
        <p className="my-2 text-sm font-bold">
          Collection code <strong className="tabular-nums">{r.displayCode}</strong>
        </p>
        <p className="font-bold">
          {r.fulfilment === "curbside" ? "KERBSIDE" : "COLLECTION"} ·{" "}
          {r.paymentMethod === "cash" ? "CASH PAID" : "PAID"}
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
                .map((b) => `${formatPackingBagName(b)}: ${b.quantity}×`)
                .join(" · ")}
            </p>
            {!!item.mealComponents?.length && (
              <div className="mt-2 border-l-2 border-black pl-2 text-xs">
                <p className="font-bold">Meal includes</p>
                <ul>
                  {item.mealComponents.map((component) => (
                    <li key={component.slot}>
                      {item.quantity * component.quantityPerParent}× {component.name}
                      {component.replacement
                        ? ` — replaces standard ${component.slot === "drink" ? "drink" : "side"}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {item.modifiers.length > 0 && (
              <div className="mt-1 text-xs">
                <p className="font-bold">Choices included in item price</p>
                <ul className="mt-1 space-y-1">
                  {item.modifiers.map((m, n) => (
                    <li key={n}>
                      {m.groupName}: {m.quantityPerParent}× {m.name} per item
                    </li>
                  ))}
                </ul>
              </div>
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
          <dt>{r.paymentMethod === "cash" ? "CASH PAID" : "PAID"}</dt>
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
