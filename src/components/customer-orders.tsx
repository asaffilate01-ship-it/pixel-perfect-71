import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, RefreshCw, ShoppingBag } from "lucide-react";
import { CustomerDriverPosition } from "@/components/customer-driver-position";
import { customerRpc } from "@/lib/mealdeck-customer-browser";
import { orderDisplayNumber } from "@/lib/mealdeck-order-number";
import { visibleCustomerConfirmationCode } from "@/lib/mealdeck-customer-confirmation";
import {
  customerOrderStatus,
  parseCustomerOrders,
  type CustomerOrderSummary,
} from "@/lib/mealdeck-customer-orders";

const DRIVER_LOCATION_BETA = import.meta.env?.["VITE_MEALDECK_DRIVER_LOCATION_BETA"] === "true";

/** Private, network-only account history. The RPC derives the signed-in user. */
export function CustomerOrders() {
  const [orders, setOrders] = useState<CustomerOrderSummary[] | null>(null);
  const [issue, setIssue] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true,
      reading = false;
    const refresh = async () => {
      if (reading || document.visibilityState === "hidden") return;
      reading = true;
      try {
        const response = parseCustomerOrders(await customerRpc("mealdeck_customer_orders"));
        if (response === null) throw new Error("Invalid order history");
        if (active) {
          setOrders(response);
          setIssue(false);
        }
      } catch {
        if (active) setIssue(true);
      } finally {
        reading = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20_000);
    const visible = () => void refresh();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
    };
  }, [retry]);
  const money = (amount: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount / 100);
  const date = (value: string) =>
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/London",
    }).format(new Date(value));
  return (
    <section className="md-account-panel md-account-orders" aria-labelledby="customer-orders-title">
      <div className="md-account-section-heading">
        <ShoppingBag size={22} aria-hidden="true" />
        <h2 id="customer-orders-title">Your orders</h2>
      </div>
      <p>
        Open an order to see its progress, numbered bags and full receipt. Delivery progress
        updates from the kitchen and driver handoff; live GPS maps and arrival times are not yet
        available.
      </p>
      {issue && (
        <p className="md-account-fine" role="status">
          We couldn’t refresh your orders just now.{" "}
          {orders?.length
            ? "The list below may have changed."
            : "If you have just paid, keep your confirmation page open."}{" "}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            <RefreshCw size={14} aria-hidden="true" />
            Try again
          </button>
        </p>
      )}
      {!orders && !issue && <p role="status">Checking your orders…</p>}
      {orders?.length === 0 && (
        <div className="md-account-orders-empty">
          <p>No orders yet. Your paid orders and payment attempts will appear here.</p>
          <Link to="/menus">
            Explore the menus <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      )}
      {DRIVER_LOCATION_BETA && orders?.some(order =>
        order.verifiedPaid && !order.held && !order.completedAt &&
        order.fulfilment === "delivery" && order.localDriverStatus === "with_driver"
      ) && <CustomerDriverPosition orderId={orders.find(order =>
        order.verifiedPaid && !order.held && !order.completedAt &&
        order.fulfilment === "delivery" && order.localDriverStatus === "with_driver"
      )!.orderId} />}
      {!!orders?.length && (
        <ul>
          {orders.map((order) => (
            <li key={order.orderId}>
              <Link to="/checkout" search={{ order: order.orderId }}>
                <div>
                  <strong>
                    {order.verifiedPaid
                      ? orderDisplayNumber(order.orderNumber, "")
                        ? "Order " + orderDisplayNumber(order.orderNumber, "")
                        : "MealDeck order"
                      : "MealDeck checkout"}
                  </strong>
                  <span>
                    {date(order.paidAt ?? order.createdAt)} ·{" "}
                    {order.fulfilment === "delivery"
                      ? "Delivery"
                      : order.fulfilment === "curbside"
                        ? "Kerbside"
                        : "Collection"}
                  </span>
                  {visibleCustomerConfirmationCode(order) && (
                    <span className="md-account-confirmation-code">
                      Confirmation code <strong>{visibleCustomerConfirmationCode(order)}</strong>
                    </span>
                  )}
                  <b
                    data-ready={
                      order.verifiedPaid && !!order.readyForCollectionAt && !order.completedAt
                    }
                  >
                    {customerOrderStatus(order)}
                  </b>
                </div>
                <span className="md-account-order-total">
                  {money(order.totalPence)}
                  <ArrowRight size={18} aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
