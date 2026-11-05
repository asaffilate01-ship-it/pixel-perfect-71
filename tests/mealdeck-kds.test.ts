import { describe, expect, test } from "bun:test";
import {
  nextKdsOrderStatus,
  nextKdsPassStatus,
  parseKdsBoard,
  parseKdsMutation,
  type KdsBoard,
  type KdsOrderItem,
} from "../src/lib/mealdeck-kds";

const id = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-11-04T20:00:00+00:00";
const version = "a".repeat(32);
const scope = { tenantId: id(1), locationId: id(2) };
const item = (): KdsOrderItem => ({
  order_item_id: id(4),
  brand_id: id(5),
  brand_name: "Skorch",
  item_name: "Double Deal",
  quantity: 2,
  modifiers: ["No gherkin", "Extra cheese"],
  notes: "Keep sauces separate",
  participant_name: "Alex",
  status: "queued",
});

function board(): KdsBoard {
  return {
    schema_version: 1,
    tenant_id: scope.tenantId,
    location_id: scope.locationId,
    generated_at: now,
    readiness: "ready",
    held_order_count: 0,
    remaining_order_count: 0,
    stations: [{ station_id: id(6), name: "Shared kitchen", code: "main", active: true }],
    orders: [
      {
        order_id: id(3),
        version,
        preparation_status: "queued",
        display_code: "0438",
        created_at: now,
        released_at: now,
        order_status: "accepted",
        fulfilment: "delivery",
        notes: "Pack the whole order together",
        group_order: true,
        routing_complete: true,
        blocked_reason: null,
        items: [item()],
        tickets: [
          {
            ticket_id: id(7),
            station_id: id(6),
            station_name: "Shared kitchen",
            status: "queued",
            version,
            created_at: now,
            started_at: null,
            ready_at: null,
            items: [{ ...item(), ticket_item_id: id(8) }],
          },
        ],
        pass: { status: "waiting_for_kitchen", version, updated_at: now },
      },
    ],
  };
}

describe("MealDeck canonical KDS response boundaries", () => {
  test("retains exact food instructions in one purchased master line", () => {
    const result = parseKdsBoard(board(), scope);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]!.items).toEqual([
      {
        ...item(),
        checkout_line_id: null,
        parent_checkout_line_id: null,
        base_unit_pence: null,
        unit_pence: null,
        modifier_details: [],
        bags: [],
      },
    ]);
    expect(result.orders[0]!.display_code).toBe("0438");
  });

  test("preserves the end of long kitchen notes and modifier labels", () => {
    const value = board();
    const note =
      "Please follow these prep instructions. ".repeat(20) + "Final instruction: no sesame.";
    const modifier = "Keep separate ".repeat(20) + "sauce";
    value.orders[0]!.notes = note;
    value.orders[0]!.items[0]!.notes = note;
    value.orders[0]!.items[0]!.modifiers = [modifier];
    value.orders[0]!.tickets[0]!.items[0]!.notes = note;
    value.orders[0]!.tickets[0]!.items[0]!.modifiers = [modifier];
    const result = parseKdsBoard(value, scope).orders[0]!;
    expect(result.notes).toBe(note);
    expect(result.items[0]!.notes).toBe(note);
    expect(result.items[0]!.modifiers).toEqual([modifier]);
    value.orders[0]!.notes = "x".repeat(20001);
    expect(() => parseKdsBoard(value, scope)).toThrow();
  });

  test("rejects a late response from the previous tenant or kitchen", () => {
    expect(() => parseKdsBoard(board(), { ...scope, tenantId: id(99) })).toThrow();
    expect(() => parseKdsBoard(board(), { ...scope, locationId: id(99) })).toThrow();
  });

  test("copies only reviewed prep fields, never contact, payment or delivery data", () => {
    const value = board();
    Object.assign(value, { provider_secret: "do-not-return" });
    Object.assign(value.orders[0]!, {
      customer_phone: "private-phone",
      delivery_address: { street: "private-street" },
      total_pence: 1234,
      payment_reference: "private-reference",
    });
    const serialised = JSON.stringify(parseKdsBoard(value, scope));
    expect(serialised).not.toContain("private");
    expect(serialised).not.toContain("do-not-return");
    expect(serialised).not.toContain("total_pence");
  });

  test("rejects invalid scope IDs, unknown statuses and optimistic boolean strings", () => {
    for (const change of [
      { order_id: "sample-order" },
      { order_status: "paid" },
      { preparation_status: "fulfilled" },
      { routing_complete: "true" },
      { version: "client-can-set-this" },
      { created_at: "yesterday" },
    ]) {
      const value = board();
      Object.assign(value.orders[0]!, change);
      expect(() => parseKdsBoard(value, scope)).toThrow("mealdeck_kds_invalid_response");
    }
  });

  test("setup state contains no actionable kitchen orders", () => {
    const value = board();
    value.readiness = "setup_required";
    expect(() => parseKdsBoard(value, scope)).toThrow();
    value.orders = [];
    value.held_order_count = 2;
    expect(parseKdsBoard(value, scope).held_order_count).toBe(2);
  });

  test("unrouted purchased lines remain visible while every action is blocked", () => {
    const value = board();
    const order = value.orders[0]!;
    order.routing_complete = false;
    order.blocked_reason = "routing_incomplete";
    order.tickets = [];
    const result = parseKdsBoard(value, scope).orders[0]!;
    expect(result.items[0]!.item_name).toBe("Double Deal");
    expect(result.routing_complete).toBe(false);
    expect(result.preparation_status).toBe("queued");
  });

  test("empty or missing routed lines cannot masquerade as ready", () => {
    for (const missing of ["tickets", "items"] as const) {
      const value = board();
      value.orders[0]![missing] = [];
      value.orders[0]!.preparation_status = "ready";
      expect(() => parseKdsBoard(value, scope)).toThrow();
    }
  });

  test("one purchased item can route to two stations without double quantity", () => {
    const value = board();
    value.stations.push({ station_id: id(9), name: "Finish", code: "finish", active: true });
    value.orders[0]!.tickets.push({
      ...value.orders[0]!.tickets[0]!,
      ticket_id: id(10),
      station_id: id(9),
      station_name: "Finish",
      items: [{ ...item(), ticket_item_id: id(11) }],
    });
    const result = parseKdsBoard(value, scope).orders[0]!;
    expect(result.tickets).toHaveLength(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.quantity).toBe(2);
  });

  test("conflicting station copies of a purchased line fail closed", () => {
    for (const change of [
      { quantity: 3 },
      { notes: "Add gherkins" },
      { brand_id: id(99) },
      { modifiers: ["No cheese"] },
      { participant_name: "Someone else" },
    ]) {
      const value = board();
      Object.assign(value.orders[0]!.tickets[0]!.items[0]!, change);
      expect(() => parseKdsBoard(value, scope)).toThrow();
    }
  });

  test("unknown stations and duplicated order or line IDs are rejected", () => {
    const wrongStation = board();
    wrongStation.orders[0]!.tickets[0]!.station_id = id(99);
    expect(() => parseKdsBoard(wrongStation, scope)).toThrow();
    const duplicateOrder = board();
    duplicateOrder.orders.push(duplicateOrder.orders[0]!);
    expect(() => parseKdsBoard(duplicateOrder, scope)).toThrow();
    const duplicateItem = board();
    duplicateItem.orders[0]!.items.push(item());
    expect(() => parseKdsBoard(duplicateItem, scope)).toThrow();
  });

  test("a ready pass requires every routed line to be ready", () => {
    const value = board();
    value.orders[0]!.pass!.status = "packing";
    expect(() => parseKdsBoard(value, scope)).toThrow();
    value.orders[0]!.preparation_status = "ready";
    value.orders[0]!.order_status = "ready";
    value.orders[0]!.tickets[0]!.status = "ready";
    value.orders[0]!.tickets[0]!.items[0]!.status = "ready";
    value.orders[0]!.items[0]!.status = "ready";
    expect(parseKdsBoard(value, scope).orders[0]!.pass!.status).toBe("packing");
  });

  test("counts distinguish held evidence from a larger eligible queue", () => {
    const value = board();
    value.held_order_count = 3;
    value.remaining_order_count = 12;
    const result = parseKdsBoard(value, scope);
    expect(result.held_order_count).toBe(3);
    expect(result.remaining_order_count).toBe(12);
    expect(() => parseKdsBoard({ ...value, remaining_order_count: -1 }, scope)).toThrow();
  });
});

describe("MealDeck one-card cooking and packing controls", () => {
  test("only advances one master order through cooking, packing and sealing", () => {
    expect(nextKdsOrderStatus("queued")).toBe("preparing");
    expect(nextKdsOrderStatus("preparing")).toBe("ready");
    expect(nextKdsOrderStatus("ready")).toBeNull();
    expect(nextKdsPassStatus("waiting_for_kitchen")).toBeNull();
    expect(nextKdsPassStatus("ready_to_pack")).toBe("packing");
    expect(nextKdsPassStatus("packing")).toBe("sealed");
    expect(nextKdsPassStatus("sealed")).toBeNull();
    expect(nextKdsPassStatus("ready_for_handoff")).toBeNull();
  });

  test("a mutation must acknowledge the exact order and requested state", () => {
    const value = { ok: true, replayed: false, order_id: id(3), status: "preparing" };
    const expected = { orderId: id(3), status: "preparing" as const };
    expect(parseKdsMutation(value, expected).replayed).toBe(false);
    expect(parseKdsMutation({ ...value, replayed: true }, expected).replayed).toBe(true);
    expect(() => parseKdsMutation({ ...value, order_id: id(99) }, expected)).toThrow();
    expect(() => parseKdsMutation({ ...value, status: "ready" }, expected)).toThrow();
    expect(() => parseKdsMutation({ ...value, ok: "true" }, expected)).toThrow();
    expect(() => parseKdsMutation({ ...value, replayed: "false" }, expected)).toThrow();
  });
});
