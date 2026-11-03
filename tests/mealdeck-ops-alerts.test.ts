import { describe, expect, test } from "bun:test";
import { reviewOrderExceptions } from "../src/lib/mealdeck-ops-alerts";
import type { OpsOrder } from "../src/lib/mealdeck-ops-types";

const now = "2026-11-03T12:00:00Z";
function order(id: string, status: string, minutes: number, paidAt: string | null = null): OpsOrder {
  return {
    order_id: id, source: "mealdeck", status, fulfilment: "delivery",
    created_at: new Date(Date.parse(now) - minutes * 60_000).toISOString(),
    paid_at: paidAt, total_pence: 1400, item_count: 2,
  };
}
describe("Phase 21: read-only staff exception review", () => {
  test("raises a review suggestion, never claims a provider failure", () => {
    const alerts = reviewOrderExceptions([
      order("o1", "payment_pending", 45),
      order("o2", "preparing", 60, "2026-11-03T11:00:00Z"),
    ], now);
    expect(alerts.map(a => a.reason)).toEqual(["preparation_review", "payment_pending"]);
    expect(alerts.every(a => !JSON.stringify(a).includes("customerPhone"))).toBe(true);
  });
  test("paid cancellation and contradictory pending status are prioritised", () => {
    const alerts = reviewOrderExceptions([
      order("o1", "cancelled", 80, "2026-11-03T11:00:00Z"),
      order("o2", "payment_pending", 90, "2026-11-03T10:50:00Z"),
      order("o3", "payment_pending", 100),
    ], now);
    expect(alerts.map(a => a.priority)).toEqual(["high", "high", "info"]);
    expect(alerts[0]?.detail).toContain("nothing has been refunded automatically");
  });
  test("never invents delay for fulfilled, future or invalid timestamps", () => {
    expect(reviewOrderExceptions([
      order("done", "fulfilled", 900, "2026-11-02T20:00:00Z"),
      { ...order("future", "preparing", 90), created_at: "2100-01-01T00:00:00Z" },
      { ...order("invalid", "payment_pending", 90), created_at: "not_a_date" },
    ], now)).toEqual([]);
  });
  test("only reports a single row per order and obeys the cap", () => {
    const a = order("same", "payment_pending", 90);
    expect(reviewOrderExceptions([a, a, order("other", "payment_pending", 90)], now,
      { limit: 1 })).toHaveLength(1);
  });
  test("invalid time and thresholds fail closed", () => {
    expect(reviewOrderExceptions([order("x", "payment_pending", 40)], "not_date")).toEqual([]);
    expect(reviewOrderExceptions([order("x", "payment_pending", 40)], now,
      { pendingAfterMinutes: -2 })).toEqual([]);
  });
});
