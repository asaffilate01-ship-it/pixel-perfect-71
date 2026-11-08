import { describe, expect, test } from "bun:test";
import { customerOrderStatus, parseCustomerOrders } from "../src/lib/mealdeck-customer-orders";
const order = {
  orderId: "00000000-0000-4000-8000-000000000001",
  handoffCode: "4827",
  verifiedPaid: true,
  held: false,
  paymentSessionExpired: false,
  fulfilment: "pickup",
  totalPence: 599,
  createdAt: "2026-11-05T10:00:00Z",
  paidAt: "2026-11-05T10:30:00Z",
  acceptedAt: null,
  preparingAt: null,
  readyForCollectionAt: null,
  completedAt: null,
};
describe("private customer order summaries", () => {
  test("retains a validated display number separately from the collection credential", () => {
    for (const orderNumber of ["0001", "10000", null]) {
      const result = parseCustomerOrders({ orders: [{ ...order, orderNumber }] });
      expect(result?.[0]?.orderNumber).toBe(orderNumber);
      expect(result?.[0]?.handoffCode).toBe("4827");
    }
    for (const orderNumber of ["0000", "1", "00001", "0001\n", 1])
      expect(parseCustomerOrders({ orders: [{ ...order, orderNumber }] })).toBeNull();
    const pending = parseCustomerOrders({
      orders: [
        { ...order, orderNumber: "0001", verifiedPaid: false, paidAt: null, handoffCode: null },
      ],
    })![0]!;
    expect(customerOrderStatus(pending)).toBe("Awaiting payment");
  });
  test("keeps an explicit receipt whitelist and rejects invalid/duplicated order destinations", () => {
    const result = parseCustomerOrders({
      orders: [{ ...order, email: "private@example.test", vehicle: { make: "private" } }],
    });
    expect(result).toEqual([order]);
    expect(parseCustomerOrders({ orders: [order, order] })).toBeNull();
    expect(
      parseCustomerOrders({ orders: [{ ...order, orderId: "https://evil.example" }] }),
    ).toBeNull();
    expect(parseCustomerOrders({ orders: [{ ...order, verifiedPaid: "true" }] })).toBeNull();
    expect(parseCustomerOrders({ orders: [{ ...order, paidAt: null }] })).toBeNull();
    expect(parseCustomerOrders({ orders: [{ ...order, totalPence: 0.5 }] })).toBeNull();
    expect(parseCustomerOrders({ orders: [] })).toEqual([]);
  });
  test("includes paid delivery orders and keeps their existing code", () => {
    const delivery = parseCustomerOrders({
      orders: [{ ...order, fulfilment: "delivery", handoffCode: "0042", orderNumber: "0007" }],
    });
    expect(delivery?.[0]?.fulfilment).toBe("delivery");
    expect(delivery?.[0]?.handoffCode).toBe("0042");
    expect(delivery?.[0]?.orderNumber).toBe("0007");
    expect(customerOrderStatus({ ...delivery![0]!, readyForCollectionAt: order.createdAt })).toBe(
      "Packed for delivery",
    );
    expect(customerOrderStatus({ ...delivery![0]!, completedAt: order.createdAt })).toBe("Completed");
    expect(
      parseCustomerOrders({
        orders: [
          { ...order, fulfilment: "delivery", verifiedPaid: false, paidAt: null, handoffCode: null },
        ],
      })?.[0]?.handoffCode,
    ).toBeNull();
    expect(parseCustomerOrders({ orders: [{ ...order, fulfilment: "dine_in" }] })).toBeNull();
  });
  test("shows verified progress and gives payment holds precedence over stale readiness", () => {
    const base = parseCustomerOrders({ orders: [order] })![0]!;
    expect(customerOrderStatus(base)).toBe("Order placed");
    expect(
      customerOrderStatus({
        ...base,
        verifiedPaid: false,
        held: true,
        readyForCollectionAt: order.createdAt,
      }),
    ).toBe("Needs team review");
    expect(customerOrderStatus({ ...base, verifiedPaid: false, paymentSessionExpired: true })).toBe(
      "Payment session expired",
    );
    expect(customerOrderStatus({ ...base, readyForCollectionAt: order.createdAt })).toBe(
      "Ready to collect",
    );
    expect(
      customerOrderStatus({
        ...base,
        readyForCollectionAt: order.createdAt,
        completedAt: order.createdAt,
      }),
    ).toBe("Completed");
  });
});
