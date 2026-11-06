import { CheckCircle2, Clock3, Package } from "lucide-react";
import type { GroupOrderRoom } from "@/lib/mealdeck-group-rooms";
import type { SharedPaymentRoom } from "@/lib/mealdeck-shared-payments";
import { formatLaunchMenuPrice } from "@/lib/launch-menu-display-prices";
import { roomBagBill } from "@/components/group-order-room-state";

export function GroupRoomBilling({
  room,
  payment,
}: {
  room: GroupOrderRoom;
  payment: SharedPaymentRoom;
}) {
  const paid = payment.status === "paid";
  const closed = ["expired", "cancelled", "hold", "refund_review"].includes(payment.status);
  return (
    <>
      <section
        className={"md-room-card md-room-payment-summary" + (paid ? " is-paid" : "")}
        aria-labelledby="room-payment-heading"
      >
        <div className="md-room-section-title">
          {paid ? (
            <CheckCircle2 size={26} aria-hidden="true" />
          ) : (
            <Clock3 size={26} aria-hidden="true" />
          )}
          <h2 id="room-payment-heading">
            {paid
              ? "Paid. Sent to the kitchen."
              : closed
                ? "Your order’s payment record"
                : "One order. Nearly there."}
          </h2>
        </div>
        <p>
          {paid
            ? "All required payments are confirmed. Your food is together in one order, with a name beside each person’s choices."
            : closed
              ? "Keep this room to check the payment record and any further updates."
              : room.paymentMode === "organiser"
                ? "Everyone’s choices are locked. The organiser pays the full order."
                : "Everyone’s choices are locked. Each person pays their own bill here in the room."}
        </p>
        <dl className="md-room-funding">
          <div>
            <dt>Whole order</dt>
            <dd>{formatLaunchMenuPrice(payment.totalPence)}</dd>
          </div>
          <div>
            <dt>Paid</dt>
            <dd>{formatLaunchMenuPrice(payment.paidPence)}</dd>
          </div>
          <div>
            <dt>Still to pay</dt>
            <dd>{formatLaunchMenuPrice(payment.remainingPence)}</dd>
          </div>
        </dl>
        <progress
          max={Math.max(1, payment.totalPence)}
          value={Math.min(payment.totalPence, payment.paidPence)}
          aria-label={
            formatLaunchMenuPrice(payment.paidPence) +
            " confirmed of " +
            formatLaunchMenuPrice(payment.totalPence)
          }
        />
        {payment.message && (
          <p className="md-room-muted" role="status">
            {payment.message}
          </p>
        )}
        {paid ? (
          <>
            <p className="md-room-fine">
              The kitchen confirms acceptance and preparation separately. The organiser handles{" "}
              {room.fulfilment === "curbside" ? "kerbside collection" : "collection"}.
            </p>
            {payment.orderNumber && (
              <p className="md-room-handoff">Order <strong>{payment.orderNumber}</strong></p>
            )}
            {payment.handoffCode && (
              <p className="md-room-handoff">
                Collection code <strong>{payment.handoffCode}</strong>
              </p>
            )}
            {room.viewer.role === "organiser" && (
              <a
                className="md-room-button md-room-button-light"
                href={"/checkout?order=" + payment.orderId}
              >
                View kitchen progress
              </a>
            )}
          </>
        ) : !closed ? (
          <p className="md-room-fine">
            Once the full payment is verified, this order goes to the kitchen automatically. Payment
            window ends{" "}
            {new Intl.DateTimeFormat("en-GB", {
              timeZone: "Europe/London",
              hour: "2-digit",
              minute: "2-digit",
              day: "numeric",
              month: "short",
            }).format(new Date(payment.expiresAt))}{" "}
            UK time.
          </p>
        ) : null}
        {payment.status === "refund_review" && (
          <p className="md-room-notice">
            Payments need review. Any refund will appear here once the payment provider confirms it.
          </p>
        )}
        {["expired", "cancelled", "hold"].includes(payment.status) && (
          <p className="md-room-notice">
            This order is not accepting new payments. Keep this room to check existing payments and
            any further updates.
          </p>
        )}
      </section>
      <section className="md-room-card" aria-labelledby="room-itemised-bills">
        <span className="md-room-kicker">Named food. Clear totals.</span>
        <h2 id="room-itemised-bills">
          {room.viewer.role === "organiser" ? "Everyone’s itemised bill" : "Your itemised bill"}
        </h2>
        <p className="md-room-muted">
          These are the kitchen’s final prices. Each total covers the food in that person’s bag.
        </p>
        <div className="md-room-bills">
          {payment.bags.map((bag) => {
            const bill = roomBagBill(payment, bag.number);
            if (!bill) return null;
            const person = room.people.find((entry) => entry.bagNumber === bag.number);
            const name =
              person?.name ?? ("name" in bag ? bag.name : undefined) ?? "Bag " + bag.number;
            const own = person?.participantId === room.viewer.participantId;
            return (
              <article key={bag.number} className={"md-room-bill" + (own ? " is-own" : "")}>
                <div className="md-room-section-title">
                  <Package size={21} aria-hidden="true" />
                  <h3>
                    {name}
                    {own ? " · You" : ""}
                  </h3>
                  <span className="md-room-bag-number">Bag {bag.number}</span>
                </div>
                <ul className="md-room-bill-lines">
                  {bill.lines.map((line) => (
                    <li key={line.lineId}>
                      <div>
                        <strong>
                          {line.quantity} × {line.name}
                        </strong>
                        {line.description && <p>{line.description}</p>}
                      </div>
                      {line.allocatedPence !== null && (
                        <span>{formatLaunchMenuPrice(line.allocatedPence)}</span>
                      )}
                    </li>
                  ))}
                </ul>
                <dl className="md-room-bill-totals">
                  {bill.grossPence !== null && (
                    <div>
                      <dt>Items</dt>
                      <dd>{formatLaunchMenuPrice(bill.grossPence)}</dd>
                    </div>
                  )}
                  {!!bill.discountPence && (
                    <div>
                      <dt>Eligible offer</dt>
                      <dd>−{formatLaunchMenuPrice(bill.discountPence)}</dd>
                    </div>
                  )}
                  <div className="is-total">
                    <dt>{name}’s total</dt>
                    <dd>{formatLaunchMenuPrice(bill.totalPence)}</dd>
                  </div>
                  {bill.share.paidPence > 0 && (
                    <div>
                      <dt>Payment confirmed</dt>
                      <dd>{formatLaunchMenuPrice(bill.share.paidPence)}</dd>
                    </div>
                  )}
                </dl>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
