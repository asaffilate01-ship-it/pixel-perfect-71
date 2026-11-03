import { describe, expect, test } from "bun:test";
import {
  presentMealDeckTracking, type TrackingSnapshot,
} from "../src/lib/mealdeck-tracking-presentation";

const base = (overrides: Partial<TrackingSnapshot> = {}): TrackingSnapshot => ({
  orderStatus: "payment_pending", fulfilment: "delivery",
  updatedAt: "2026-11-03T14:03:00+00:00",
  ...overrides,
});
const states = (input: TrackingSnapshot) =>
  presentMealDeckTracking(input).stages.map(stage => stage.state);
const labels = (input: TrackingSnapshot) =>
  presentMealDeckTracking(input).stages.map(stage => stage.title);

describe("MealDeck tracking: trustworthy server statuses only", () => {
  test("keeps KDS and courier pending while payment has not been verified", () => {
    const p = presentMealDeckTracking(base());
    expect(p.headline).toBe("Awaiting payment");
    expect(states(base())).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
    expect(p.canOpenCourierTracking).toBe(false);
    expect(p.updatedAtIso).toBe("2026-11-03T14:03:00.000Z");
    expect(p.description).toContain("payment is verified");
  });
  test("detects a contradictory kitchen release when payment is pending", () => {
    const p = presentMealDeckTracking(base({
      passStatus: "sealed", deliveryStatus: "delivered",
    }));
    expect(p.tone).toBe("review");
    expect(p.canOpenCourierTracking).toBe(false);
    expect(p.stages.every(s => s.state !== "done")).toBe(true);
  });
  test("paid order does not imply every brand has finished", () => {
    const p = presentMealDeckTracking(base({ orderStatus: "paid" }));
    expect(states(base({ orderStatus: "paid" }))).toEqual(
      ["done", "current", "upcoming", "upcoming"],
    );
    expect(p.headline).toContain("brands");
  });
  test("pass confirmation advances kitchen and packing, not courier", () => {
    const p = presentMealDeckTracking(base({ orderStatus: "preparing", passStatus: "packing" }));
    expect(p.stages.map(s => s.state)).toEqual(
      ["done", "done", "current", "upcoming"],
    );
    expect(p.canOpenCourierTracking).toBe(false);
    expect(p.headline).toContain("Packing");
  });
  test("a packed basket can await courier without inventing a booking", () => {
    const p = presentMealDeckTracking(base({
      orderStatus: "ready", passStatus: "ready_for_handoff",
      deliveryStatus: "pending_quote",
    }));
    expect(p.headline).toBe("Packed and ready for dispatch");
    expect(p.stages.map(s => s.state)).toEqual(
      ["done", "done", "done", "current"],
    );
    expect(p.canOpenCourierTracking).toBe(false);
  });
  test("courier collected after a verified pack is one active delivery", () => {
    const p = presentMealDeckTracking(base({
      orderStatus: "ready", passStatus: "sealed", deliveryStatus: "picked_up",
    }));
    expect(p.headline).toContain("on its way");
    expect(p.canOpenCourierTracking).toBe(true);
    expect(p.stages.at(-1)?.state).toBe("current");
  });
  test("courier delivered is reported, never declared an independently verified receipt", () => {
    const p = presentMealDeckTracking(base({
      orderStatus: "fulfilled", passStatus: "ready_for_handoff",
      deliveryStatus: "delivered",
    }));
    expect(p.headline).toBe("Courier reports delivery");
    expect(p.tone).toBe("reported");
    expect(p.description).toContain("not independent proof");
    expect(p.stages.at(-1)?.state).toBe("done");
  });
  test("courier finished but kitchen pack is missing remains under review", () => {
    const p = presentMealDeckTracking(base({
      orderStatus: "fulfilled", deliveryStatus: "delivered",
    }));
    expect(p.tone).toBe("review");
    expect(p.canOpenCourierTracking).toBe(false);
  });
  test("cancelled or failed delivery does not display a completed order", () => {
    for (const deliveryStatus of ["cancelled", "failed"]) {
      const p = presentMealDeckTracking(base({
        orderStatus: "paid", passStatus: "sealed", deliveryStatus,
      }));
      expect(p.tone).toBe("review");
      expect(p.canOpenCourierTracking).toBe(false);
    }
    for (const orderStatus of ["cancelled", "refunded", "failed"]) {
      const p = presentMealDeckTracking(base({ orderStatus }));
      expect(p.tone).toBe("review");
      expect(p.stages.every(step => step.state !== "done")).toBe(true);
    }
  });
  test("courier booking before a complete pack is flagged, not shown as ready", () => {
    const p = presentMealDeckTracking(base({
      orderStatus: "preparing", deliveryStatus: "driver_assigned",
    }));
    expect(p.tone).toBe("review");
    expect(p.canOpenCourierTracking).toBe(false);
  });
  test("pickup and kerbside use distinct handoff labels; never show courier link", () => {
    for (const mode of ["pickup", "curbside"] as const) {
      const pending = presentMealDeckTracking(base({
        orderStatus: "ready", passStatus: "ready_for_handoff", fulfilment: mode,
        deliveryStatus: undefined,
      }));
      expect(pending.stages.at(-1)?.state).toBe("current");
      expect(pending.canOpenCourierTracking).toBe(false);
      const done = presentMealDeckTracking(base({
        orderStatus: "fulfilled", passStatus: "ready_for_handoff", fulfilment: mode,
        deliveryStatus: undefined,
      }));
      expect(done.tone).toBe("reported");
      expect(done.stages.at(-1)?.state).toBe("done");
      expect(labels(base({ fulfilment: mode })).at(-1))
        .toBe(mode === "pickup" ? "Collection" : "Kerbside handoff");
    }
  });
  test("unknown codes and impossible fulfilment never leak raw provider text", () => {
    for (const overrides of [
      { orderStatus: "<script>" }, { deliveryStatus: "<svg>", orderStatus: "paid" },
      { passStatus: "unexpected_status", orderStatus: "paid" },
      { fulfilment: "external" },
    ]) {
      const p = presentMealDeckTracking(base(overrides));
      expect(p.tone).toBe("review");
      expect(p.canOpenCourierTracking).toBe(false);
      expect(p.headline).not.toContain("<");
      expect(p.stages.map(s => s.detail).join(" ")).not.toContain("script");
    }
  });
  test("a timestamp without an explicit offset is not presented as authoritative", () => {
    const p = presentMealDeckTracking(base({ updatedAt: "2026-11-03 14:03:00" }));
    expect(p.updatedAtIso).toBeNull();
  });
  test("inconsistent fulfilled courier status remains under review", () => {
    const p = presentMealDeckTracking(base({
      orderStatus: "completed", passStatus: "sealed",
      deliveryStatus: "driver_assigned",
    }));
    expect(p.tone).toBe("review");
    expect(p.canOpenCourierTracking).toBe(false);
  });
});
