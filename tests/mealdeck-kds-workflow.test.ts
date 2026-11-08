import { describe, expect, test } from "bun:test";
import { parseKdsWorkflowBoard } from "../src/lib/mealdeck-kds-workflow";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { tenantId: id(1), locationId: id(2) };
function fixture() {
  return {
    schema_version: 1,
    tenant_id: scope.tenantId,
    location_id: scope.locationId,
    generated_at: "2026-11-06T12:00:00Z",
    readiness: "ready",
    held_order_count: 0,
    remaining_order_count: 0,
    stations: [],
    orders: [],
    completed_remaining_order_count: 0,
    completed_window_hours: 12,
    completed_orders: [
      {
        order_id: id(10),
        display_code: "1234",
        order_status: "fulfilled",
        handoff_status: "handed_off",
        accepted_at: "2026-11-06T10:00:00Z",
        completed_at: "2026-11-06T10:30:00Z",
        fulfilment: "pickup",
        group_order: true,
        cutlery_requested: true,
        notes: "Keep bags separate",
        items: [
          {
            order_item_id: id(11),
            item_name: "Chicken meal",
            brand_name: "Tavo Chicken",
            quantity: 1,
            modifiers: ["Korean BBQ", "Strawberry milkshake", "Garlic sauce"],
            notes: "No onions",
            participant_name: "Amer",
            bags: [{ number: 1, name: "Amer", quantity: 1 }],
          },
        ],
      },
    ],
  };
}
describe("durable Done history", () => {
  test("retains only an optional canonical unit price and rejects malformed prices", () => {
    const value = fixture();
    Object.assign(value.completed_orders[0]!.items[0]!, { unit_pence: 350, base_unit_pence: 299 });
    const parsed = parseKdsWorkflowBoard(value, scope).completed_orders[0]!.items[0]!;
    expect(parsed.unit_pence).toBe(350);
    expect(parsed).not.toHaveProperty("base_unit_pence");
    for (const unit_pence of [undefined, null]) {
      Object.assign(value.completed_orders[0]!.items[0]!, { unit_pence });
      expect(parseKdsWorkflowBoard(value, scope).completed_orders[0]!.items[0]!.unit_pence).toBe(
        unit_pence,
      );
    }
    for (const unit_pence of [-1, 3.5, "350", NaN, Infinity]) {
      Object.assign(value.completed_orders[0]!.items[0]!, { unit_pence });
      expect(() => parseKdsWorkflowBoard(value, scope)).toThrow("mealdeck_kds_invalid_response");
    }
  });

  test("completed meal instructions retain canonical side replacements and reject malformed components", () => {
    const value = fixture();
    const mealComponents = [
      { slot: "side", name: "Loaded tots", quantityPerParent: 1, replacement: true },
      { slot: "drink", name: "Pepsi", quantityPerParent: 1, replacement: false },
    ];
    Object.assign(value.completed_orders[0]!.items[0]!, { mealComponents });
    expect(
      parseKdsWorkflowBoard(value, scope).completed_orders[0]!.items[0]!.mealComponents,
    ).toEqual(mealComponents);
    Object.assign(value.completed_orders[0]!.items[0]!, {
      mealComponents: [...mealComponents, { ...mealComponents[0], name: "Fries" }],
    });
    expect(() => parseKdsWorkflowBoard(value, scope)).toThrow("mealdeck_kds_invalid_response");
    expect(
      parseKdsWorkflowBoard(fixture(), scope).completed_orders[0]!.items[0]!.mealComponents,
    ).toBeUndefined();
  });

  test("keeps sanitized pickup and kerbside contacts on completed tickets only", () => {
    for (const fulfilment of ["pickup", "curbside"]) {
      const value = fixture();
      Object.assign(value.completed_orders[0], {
        fulfilment,
        pickupContact: {
          name: "  آمنہ O’Neill  ",
          phone: "+447700900123",
          email: "private@example.invalid",
        },
      });
      const order = parseKdsWorkflowBoard(value, scope).completed_orders[0]!;
      expect(order.pickupContact).toEqual({ name: "آمنہ O’Neill", phone: "+447700900123" });
      expect(JSON.stringify(order)).not.toContain("private@example.invalid");
      for (const pickupContact of [
        { name: "Sam\n", phone: "+447700900123" },
        { name: "Sam", phone: "07700900123" },
        { name: "Sam\u202e", phone: "+447700900123" },
      ]) {
        Object.assign(value.completed_orders[0], { pickupContact });
        expect(() => parseKdsWorkflowBoard(value, scope)).toThrow("mealdeck_kds_invalid_response");
      }
    }
    for (const fulfilment of ["dine_in"]) {
      const value = fixture();
      Object.assign(value.completed_orders[0], {
        fulfilment,
        pickupContact: { name: "Private", phone: "+447700900123" },
      });
      expect(parseKdsWorkflowBoard(value, scope).completed_orders[0]!.pickupContact).toBeNull();
    }
  });
  test("retains a completed own-driver delivery address, contact and verified delivery timestamps", () => {
    const value = fixture();
    Object.assign(value.completed_orders[0], {
      fulfilment: "delivery",
      pickupContact: null,
      deliveryAddress: {
        postcode: "LU4 8NU",
        doorNumber: "14",
        roadName: "Test Road",
        addressLine2: "Flat 2",
      },
      deliveryContact: { name: "Sam Driver Customer", phone: "+447700900123", email: "omit@example.invalid" },
      driverStatus: "delivered",
      deliveryDeadlineAt: "2026-11-06T11:00:00Z",
      driverHandoverAt: "2026-11-06T10:15:00Z",
      deliveredAt: "2026-11-06T10:30:00Z",
    });
    const order = parseKdsWorkflowBoard(value, scope).completed_orders[0]!;
    expect(order.deliveryAddress?.postcode).toBe("LU4 8NU");
    expect(order.deliveryAddress?.roadName).toBe("Test Road");
    expect(order.deliveryContact).toEqual({ name: "Sam Driver Customer", phone: "+447700900123" });
    expect(order.driverStatus).toBe("delivered");
    expect(order.completed_at).toBe(order.deliveredAt);
    expect(JSON.stringify(order)).not.toContain("omit@example.invalid");
    for (const bad of [
      { driverStatus: "awaiting_driver" },
      { deliveredAt: null },
      { deliveryAddress: { postcode: "NOT VALID", doorNumber: "1", roadName: "Test Road" } },
      { deliveryContact: { name: "Sam", phone: "invalid" } },
    ]) {
      const invalid = fixture();
      Object.assign(invalid.completed_orders[0], value.completed_orders[0], bad);
      expect(() => parseKdsWorkflowBoard(invalid, scope)).toThrow("mealdeck_kds_invalid_response");
    }
  });

  test("retains the same canonical number after handover without replacing the collection code", () => {
    for (const order_number of ["0001", "10000", null]) {
      const value = fixture();
      Object.assign(value.completed_orders[0], { order_number });
      const order = parseKdsWorkflowBoard(value, scope).completed_orders[0]!;
      expect(order.order_number).toBe(order_number);
      expect(order.display_code).toBe("1234");
    }
    const value = fixture();
    Object.assign(value.completed_orders[0], { order_number: "0000" });
    expect(() => parseKdsWorkflowBoard(value, scope)).toThrow("mealdeck_kds_invalid_response");
  });
  test("retains named bags, exact choices and handover time", () => {
    const result = parseKdsWorkflowBoard(fixture(), scope);
    expect(result.completed_orders[0].items[0].bags?.[0].name).toBe("Amer");
    expect(result.completed_orders[0].items[0].modifiers).toEqual([
      "Korean BBQ",
      "Strawberry milkshake",
      "Garlic sauce",
    ]);
    expect(result.completed_orders[0].completed_at).toBe("2026-11-06T10:30:00Z");
    expect(result.orders).toEqual([]);
  });
  test("rejects payment-only, packing-only and missing handover evidence", () => {
    for (const patch of [
      { order_status: "ready" },
      { handoff_status: "ready_for_handoff" },
      { completed_at: null },
      { accepted_at: null },
    ]) {
      const value = fixture();
      Object.assign(value.completed_orders[0], patch);
      expect(() => parseKdsWorkflowBoard(value, scope)).toThrow();
    }
  });
  test("rejects a different kitchen, duplicate history and invalid timestamps", () => {
    expect(() => parseKdsWorkflowBoard(fixture(), { ...scope, locationId: id(99) })).toThrow();
    const duplicate = fixture();
    duplicate.completed_orders.push(duplicate.completed_orders[0]);
    expect(() => parseKdsWorkflowBoard(duplicate, scope)).toThrow();
    for (const completed_at of [
      "bad",
      "2026-11-06T12:01:00Z",
      "2026-11-05T23:59:59Z",
      "2026-11-06T09:59:59Z",
    ]) {
      const value = fixture();
      value.completed_orders[0].completed_at = completed_at;
      expect(() => parseKdsWorkflowBoard(value, scope)).toThrow();
    }
  });
  test("missing completed feed is not misreported as an empty Done queue", () => {
    const value = fixture() as Record<string, unknown>;
    delete value.completed_orders;
    expect(() => parseKdsWorkflowBoard(value, scope)).toThrow();
  });
  test("strips unreviewed contact and provider fields", () => {
    const value = fixture();
    Object.assign(value.completed_orders[0], {
      email: "secret@example.invalid",
      token: "sensitive",
    });
    const json = JSON.stringify(parseKdsWorkflowBoard(value, scope));
    expect(json).not.toContain("secret@example.invalid");
    expect(json).not.toContain("sensitive");
  });
  test("a setup-required board must never expose completed records", () => {
    const value = fixture();
    value.readiness = "setup_required";
    expect(() => parseKdsWorkflowBoard(value, scope)).toThrow();
  });
});
