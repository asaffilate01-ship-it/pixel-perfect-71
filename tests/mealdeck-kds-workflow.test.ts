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
