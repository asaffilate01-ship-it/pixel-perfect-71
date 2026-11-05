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
