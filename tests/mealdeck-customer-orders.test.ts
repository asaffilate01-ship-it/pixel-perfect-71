import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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
describe("member delivery status SQL boundary", () => {
  test("preserves customer authentication and denies public status/GPS access", () => {
    const sql = readFileSync(
      new URL(
        "../deploy/mealdeck/post-install-migrations/20261110120000_mealdeck_member_local_driver_status.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain("customer uuid:=auth.uid()");
    expect(sql).toContain("customer_registration_authority(customer)");
    expect(sql).toContain("owned.customer_id=customer");
    expect(sql).toContain("d.tenant_id=owned.tenant_id and d.location_id=owned.location_id");
    expect(sql).toContain("receipt->>'verifiedPaid'='true'");
    expect(sql).toContain("receipt->>'held'='false'");
    expect(sql).toContain("end $function$;");
    expect(sql).toContain("from public,anon,service_role;");
    expect(sql).not.toContain("latitude");
    expect(sql).not.toContain("longitude");
    expect(sql).not.toContain("trackingUrl");
  });
});

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
  test("only paid private delivery orders show safe staff-verified driver handoff", () => {
    const delivery = { ...order, fulfilment: "delivery", readyForCollectionAt: order.createdAt };
    for (const [status, label] of [
      ["awaiting_driver", "Packed · awaiting driver"],
      ["with_driver", "With your driver"],
      ["delivered", "Delivery confirmation pending"],
    ] as const) {
      const parsed = parseCustomerOrders({
        orders: [{ ...delivery, localDriverStatus: status, latitude: 51.88, route: "private" }],
      });
      expect(parsed).not.toBeNull();
      expect(customerOrderStatus(parsed![0]!)).toBe(label);
      expect(parsed![0]).not.toHaveProperty("latitude");
      expect(parsed![0]).not.toHaveProperty("route");
    }
    const done = parseCustomerOrders({
      orders: [{ ...delivery, localDriverStatus: "delivered", completedAt: order.createdAt }],
    })![0]!;
    expect(customerOrderStatus(done)).toBe("Delivered");
    expect(customerOrderStatus({ ...done, held: true })).toBe("Needs team review");
    expect(customerOrderStatus({ ...done, verifiedPaid: false })).toBe("Awaiting payment");
    // A driver status alone never asserts collection without the canonical pass.
    expect(customerOrderStatus({ ...done, completedAt: null, readyForCollectionAt: null })).not.toBe(
      "With your driver",
    );
  });
  test("rejects fake driver progress on collection, pending, held and malformed orders", () => {
    for (const value of [
      { ...order, localDriverStatus: "with_driver" },
      { ...order, fulfilment: "delivery", localDriverStatus: "driver_on_map" },
      { ...order, fulfilment: "delivery", localDriverStatus: 1 },
      { ...order, fulfilment: "delivery", localDriverStatus: "with_driver", held: true },
      {
        ...order,
        fulfilment: "delivery",
        localDriverStatus: "with_driver",
        verifiedPaid: false,
        paidAt: null,
        handoffCode: null,
      },
    ])
      expect(parseCustomerOrders({ orders: [value] })).toBeNull();
    expect(
      parseCustomerOrders({ orders: [{ ...order, localDriverStatus: null }] })?.[0]
        ?.localDriverStatus,
    ).toBeNull();
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
