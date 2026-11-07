import { useId } from "react";
import { ListOrdered } from "lucide-react";

export type KdsNavigationOrder = {
  id: string;
  headingId: string;
  reference: string;
  stage: string;
  quantity: number;
};

/** A screen shortcut only: it never changes the queue, filters or an order. */
export function KdsOrderNavigator({ orders }: { orders: KdsNavigationOrder[] }) {
  const selectId = useId();
  if (orders.length < 2) return null;

  return (
    <nav className="md-kds-order-navigator" aria-label="Order shortcuts">
      <label htmlFor={selectId}>
        <ListOrdered className="size-4 shrink-0" aria-hidden="true" />
        <span>Jump to order</span>
      </label>
      <select
        id={selectId}
        className="md-ops-field"
        aria-label="Jump to a kitchen order"
        value=""
        onChange={(event) => {
          const order = orders.find((candidate) => candidate.id === event.target.value);
          if (!order) return;
          const card = document
            .getElementById(order.headingId)
            ?.closest<HTMLElement>(".md-kds-ticket");
          if (!card) return;
          card.focus({ preventScroll: true });
          card.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
        }}
      >
        <option value="" disabled>
          {orders.length} orders in view
        </option>
        {orders.map((order) => (
          <option key={order.id} value={order.id}>
            {order.reference} · {order.stage} · {order.quantity}{" "}
            {order.quantity === 1 ? "item" : "items"}
          </option>
        ))}
      </select>
    </nav>
  );
}
