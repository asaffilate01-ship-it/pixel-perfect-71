import { describe, expect, test } from "bun:test";
import { parseKdsBoard, type KdsBoard, type KdsOrderItem } from "../src/lib/mealdeck-kds";
import { groupKdsItems, nextKdsOrderAction } from "../src/lib/mealdeck-kds-presentation";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-11-05T12:00:00Z",
  version = "a".repeat(32),
  scope = { tenantId: id(1), locationId: id(2) };
function item(n: number, parent: string | null = null): KdsOrderItem {
  return {
    order_item_id: id(n),
    brand_id: id(parent ? 51 : 50),
    brand_name: parent ? "Moktl" : "Skorch",
    item_name: parent ? "Mango Mirage" : "The Ace",
    quantity: 2,
    modifiers: ["Fixture flavour"],
    notes: null,
    participant_name: null,
    status: "preparing",
    checkout_line_id: parent ? "line-1-extra-drink" : "line-1",
    parent_checkout_line_id: parent,
    unit_pence: 450,
    base_unit_pence: 450,
    modifier_details: [
      {
        name: "Fixture flavour",
        group_name: "Flavour",
        price_delta_pence: 0,
        quantity_per_parent: 1,
      },
    ],
    bags: [
      { number: 1, quantity: 1 },
      { number: 2, quantity: 1 },
    ],
  };
}
function fixture(): KdsBoard {
  const items = [item(10), item(11, "line-1")];
  return {
    schema_version: 1,
    tenant_id: scope.tenantId,
    location_id: scope.locationId,
    generated_at: now,
    readiness: "ready",
    held_order_count: 0,
    remaining_order_count: 0,
    stations: [{ station_id: id(3), name: "Shared kitchen", code: "main", active: true }],
    orders: [
      {
        order_id: id(4),
        version,
        preparation_status: "preparing",
        display_code: "0042",
        created_at: now,
        released_at: now,
        accepted_at: now,
        order_status: "preparing",
        fulfilment: "curbside",
        notes: null,
        group_order: false,
        routing_complete: true,
        blocked_reason: null,
        items,
        cutlery_requested: true,
        vehicle: { make: "Fixture", colour: "Blue", registrationLast4: "AB12" },
        tickets: [
          {
            ticket_id: id(5),
            station_id: id(3),
            station_name: "Shared kitchen",
            status: "preparing",
            version,
            created_at: now,
            started_at: now,
            ready_at: null,
            items: items.map((i, n) => ({ ...i, ticket_item_id: id(20 + n) })),
          },
        ],
        pass: null,
      },
    ],
  };
}
describe("individual kitchen readiness and packing presentation", () => {
  test("keeps cross-brand extras with their parent while preserving their own ready tick and bags", () => {
    const order = parseKdsBoard(fixture(), scope).orders[0]!;
    const groups = groupKdsItems(order);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => i.brand_name)).toEqual(["Skorch", "Moktl"]);
    expect(groups[0]!.items[1]!.bags).toEqual([
      { number: 1, quantity: 1 },
      { number: 2, quantity: 1 },
    ]);
    expect(order.cutlery_requested).toBe(true);
    expect(order.vehicle?.registrationLast4).toBe("AB12");
    expect(nextKdsOrderAction(order)).toBeNull();
  });
  test("explicitly unaccepted orders cannot masquerade as preparing", () => {
    const b = fixture();
    b.orders[0]!.accepted_at = null;
    expect(() => parseKdsBoard(b, scope)).toThrow();
    b.orders[0]!.preparation_status = "queued";
    for (const t of b.orders[0]!.tickets) {
      t.status = "queued";
      t.items.forEach((i) => (i.status = "queued"));
    }
    b.orders[0]!.items.forEach((i) => (i.status = "queued"));
    expect(nextKdsOrderAction(parseKdsBoard(b, scope).orders[0]!)).toEqual({
      target: "accept",
      status: "accepted",
      label: "Accept order",
    });
  });
  test("rejects missing, duplicated or orphaned packing instructions", () => {
    for (const change of [
      (b: KdsBoard) => {
        b.orders[0]!.items[0]!.bags = [];
      },
      (b: KdsBoard) => {
        b.orders[0]!.items[0]!.bags = [
          { number: 1, quantity: 1 },
          { number: 1, quantity: 1 },
        ];
      },
      (b: KdsBoard) => {
        b.orders[0]!.items[1]!.parent_checkout_line_id = "missing";
      },
    ]) {
      const b = fixture();
      change(b);
      expect(() => parseKdsBoard(b, scope)).toThrow();
    }
  });
  test("a ready label cannot omit another line or routed copy", () => {
    const b = fixture();
    b.orders[0]!.preparation_status = "ready";
    b.orders[0]!.items[0]!.status = "ready";
    b.orders[0]!.tickets[0]!.status = "ready";
    b.orders[0]!.tickets[0]!.items[0]!.status = "ready";
    expect(() => parseKdsBoard(b, scope)).toThrow();
  });
});
