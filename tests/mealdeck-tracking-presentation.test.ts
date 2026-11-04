import { describe, expect, test } from "bun:test";
import {
  formatTrackingElapsed,
  presentMealDeckTracking,
  trackingElapsedSeconds,
  type TrackingSnapshot,
  type TrackingStepId,
} from "../src/lib/mealdeck-tracking-presentation";

const base = (overrides: Partial<TrackingSnapshot> = {}): TrackingSnapshot => ({
  orderStatus: "payment_pending",
  fulfilment: "delivery",
  createdAt: "2026-11-03T14:00:00Z",
  updatedAt: "2026-11-03T14:03:00+00:00",
  observedAt: "2026-11-03T14:03:00Z",
  ...overrides,
});
const step = (input: TrackingSnapshot, id: TrackingStepId) =>
  presentMealDeckTracking(input).stages.find((value) => value.id === id)!;

describe("MealDeck customer milestones use recorded states", () => {
  test("pending payment has no confirmed order or kitchen progress", () => {
    const p = presentMealDeckTracking(base());
    expect(p.headline).toBe("Awaiting payment");
    expect(p.paymentRecorded).toBe(false);
    expect(p.stages.every((value) => value.state === "upcoming")).toBe(true);
    expect(p.progress.reached).toBe(0);
    expect(p.progress.percent).toBe(0);
    expect(p.canOpenCourierTracking).toBe(false);
    expect(p.description).toContain("payment is verified");
  });

  test("pass or courier evidence cannot override pending payment", () => {
    for (const overrides of [
      { passStatus: "sealed" },
      { deliveryStatus: "driver_assigned" },
      { passStatus: "ready_for_handoff", deliveryStatus: "delivered" },
    ]) {
      const p = presentMealDeckTracking(base(overrides));
      expect(p.tone).toBe("review");
      expect(p.paymentRecorded).toBe(false);
      expect(p.progress.reached).toBe(0);
      expect(p.canOpenCourierTracking).toBe(false);
    }
  });

  test("paid means placed, not accepted or preparing", () => {
    const input = base({ orderStatus: "paid" });
    const p = presentMealDeckTracking(input);
    expect(p.headline).toBe("Order placed");
    expect(p.paymentRecorded).toBe(true);
    expect(step(input, "placed").state).toBe("done");
    expect(step(input, "accepted").state).toBe("upcoming");
    expect(step(input, "preparing").state).toBe("upcoming");
    expect(p.progress.reached).toBe(1);
    expect(p.description).toContain("waiting for the kitchen to accept");
  });

  test("accepted and preparing are separate confirmed milestones", () => {
    const accepted = base({ orderStatus: "accepted" });
    expect(presentMealDeckTracking(accepted).headline).toBe("Order accepted");
    expect(step(accepted, "accepted").state).toBe("done");
    expect(step(accepted, "preparing").state).toBe("upcoming");
    const preparing = base({ orderStatus: "preparing" });
    expect(step(preparing, "preparing").state).toBe("current");
    expect(step(preparing, "packing").state).toBe("upcoming");
    expect(presentMealDeckTracking(preparing).progress.reached).toBe(3);
  });

  test("kitchen ready without pass evidence does not imply a packed or collectable order", () => {
    const input = base({ orderStatus: "ready" });
    expect(step(input, "preparing").state).toBe("done");
    expect(step(input, "packing").state).toBe("upcoming");
    expect(step(input, "ready").state).toBe("upcoming");
    expect(presentMealDeckTracking(input).canOpenCourierTracking).toBe(false);
  });

  test("ready to pack is distinct from packing started and sealed", () => {
    const waiting = base({ orderStatus: "preparing", passStatus: "ready_to_pack" });
    expect(step(waiting, "preparing").state).toBe("done");
    expect(step(waiting, "packing").state).toBe("upcoming");
    const packing = base({ orderStatus: "preparing", passStatus: "packing" });
    expect(step(packing, "packing").state).toBe("current");
    expect(presentMealDeckTracking(packing).headline).toContain("Packing");
    expect(step(packing, "ready").state).toBe("upcoming");
    const packed = base({ orderStatus: "ready", passStatus: "sealed" });
    expect(step(packed, "packing").state).toBe("done");
    expect(step(packed, "ready").state).toBe("upcoming");
    expect(step(packed, "handoff").state).toBe("upcoming");
    expect(presentMealDeckTracking(packed).canOpenCourierTracking).toBe(false);
  });

  test("collection and kerbside need explicit readiness, then a recorded handoff", () => {
    for (const fulfilment of ["pickup", "curbside"]) {
      const packed = base({ orderStatus: "ready", passStatus: "sealed", fulfilment });
      expect(step(packed, "ready").state).toBe("upcoming");
      const ready = { ...packed, passStatus: "ready_for_handoff" };
      const p = presentMealDeckTracking(ready);
      expect(p.stages).toHaveLength(6);
      expect(step(ready, "ready").state).toBe("current");
      expect(step(ready, "handoff").state).toBe("upcoming");
      expect(step(ready, "ready").title).toBe(
        fulfilment === "pickup" ? "Ready for collection" : "Ready for kerbside",
      );
      expect(p.canOpenCourierTracking).toBe(false);
      expect(p.isFinalStatus).toBe(false);
      const done = presentMealDeckTracking({ ...ready, orderStatus: "fulfilled" });
      expect(done.tone).toBe("reported");
      expect(done.stages.every((value) => value.state === "done")).toBe(true);
      expect(done.progress.percent).toBe(100);
      expect(done.isFinalStatus).toBe(true);
    }
  });

  test("a collection completion without a confirmed pack stays under review", () => {
    const p = presentMealDeckTracking(base({ orderStatus: "fulfilled", fulfilment: "pickup" }));
    expect(p.tone).toBe("review");
    expect(p.progress.percent).toBeLessThan(100);
    expect(p.canOpenCourierTracking).toBe(false);
  });

  test("courier booking is distinct from readiness and actual collection", () => {
    const booked = base({
      orderStatus: "ready",
      passStatus: "sealed",
      deliveryStatus: "driver_assigned",
    });
    expect(presentMealDeckTracking(booked).headline).toBe("Courier arranged");
    expect(step(booked, "ready").state).toBe("upcoming");
    expect(step(booked, "handoff").state).toBe("upcoming");
    expect(presentMealDeckTracking(booked).canOpenCourierTracking).toBe(true);
    const ready = { ...booked, passStatus: "ready_for_handoff", deliveryStatus: "pending_quote" };
    expect(presentMealDeckTracking(ready).headline).toBe("Packed and ready for dispatch");
    expect(step(ready, "ready").state).toBe("current");
    expect(step(ready, "handoff").state).toBe("upcoming");
    expect(presentMealDeckTracking(ready).canOpenCourierTracking).toBe(false);
  });

  test("courier activity without a complete pack is not presented as delivery progress", () => {
    for (const deliveryStatus of [
      "driver_assigned",
      "picked_up",
      "arriving_customer",
      "delivered",
    ]) {
      const p = presentMealDeckTracking(base({ orderStatus: "preparing", deliveryStatus }));
      expect(p.tone).toBe("review");
      expect(p.canOpenCourierTracking).toBe(false);
      expect(p.stages.at(-1)?.state).toBe("upcoming");
    }
  });

  test("actual courier pickup advances out for delivery, not delivered", () => {
    for (const deliveryStatus of ["picked_up", "arriving_customer"]) {
      const input = base({ orderStatus: "ready", passStatus: "sealed", deliveryStatus });
      const p = presentMealDeckTracking(input);
      expect(p.stages).toHaveLength(7);
      expect(p.headline).toContain("on its way");
      expect(step(input, "handoff").state).toBe("current");
      expect(step(input, "delivered").state).toBe("upcoming");
      expect(p.progress.reached).toBe(6);
      expect(p.canOpenCourierTracking).toBe(true);
      expect(p.isFinalStatus).toBe(false);
    }
  });

  test("provider delivered remains a report rather than independent customer receipt", () => {
    const p = presentMealDeckTracking(
      base({
        orderStatus: "fulfilled",
        passStatus: "ready_for_handoff",
        deliveryStatus: "delivered",
      }),
    );
    expect(p.headline).toBe("Courier reports delivery");
    expect(p.description).toContain("Your courier has marked this order as delivered");
    expect(p.description).toContain("If it hasn’t arrived, contact MealDeck support");
    expect(p.tone).toBe("reported");
    expect(p.isFinalStatus).toBe(true);
    expect(p.progress.percent).toBe(100);
  });

  test("fulfilled order with no delivered courier evidence remains under review", () => {
    const p = presentMealDeckTracking(
      base({
        orderStatus: "completed",
        passStatus: "sealed",
        deliveryStatus: "driver_assigned",
      }),
    );
    expect(p.tone).toBe("review");
    expect(p.canOpenCourierTracking).toBe(false);
    expect(p.progress.percent).toBeLessThan(100);
  });

  test("courier problems preserve known milestones without claiming a completed delivery", () => {
    for (const deliveryStatus of ["cancelled", "failed"]) {
      const p = presentMealDeckTracking(
        base({ orderStatus: "paid", passStatus: "sealed", deliveryStatus }),
      );
      expect(p.tone).toBe("review");
      expect(p.paymentRecorded).toBe(true);
      expect(p.stages[0]?.state).toBe("done");
      expect(p.stages.find((value) => value.id === "ready")?.state).toBe("review");
      expect(p.canOpenCourierTracking).toBe(false);
    }
  });

  test("closed orders do not show fresh confirmation or continue automatic progress", () => {
    for (const orderStatus of ["cancelled", "refunded", "failed"]) {
      const p = presentMealDeckTracking(base({ orderStatus }));
      expect(p.tone).toBe("review");
      expect(p.paymentRecorded).toBe(false);
      expect(p.stages.every((value) => value.state !== "done")).toBe(true);
      expect(p.isFinalStatus).toBe(true);
    }
  });

  test("unknown codes, unsupported modes and contradictory courier fields fail closed", () => {
    for (const overrides of [
      { orderStatus: "<script>" },
      { deliveryStatus: "<svg>", orderStatus: "paid" },
      { passStatus: "unexpected_status", orderStatus: "paid" },
      { fulfilment: "external" },
      { orderStatus: "paid", fulfilment: "pickup", deliveryStatus: "picked_up" },
      { orderStatus: "authorised_tab" },
    ]) {
      const p = presentMealDeckTracking(base(overrides));
      expect(p.tone).toBe("review");
      expect(p.canOpenCourierTracking).toBe(false);
      expect(p.progress.reached).toBe(0);
      expect(p.stages.map((value) => value.detail).join(" ")).not.toContain("script");
    }
  });
});

describe("canonical kitchen handoff states remain distinct", () => {
  test("waiting for kitchen does not imply preparation has started", () => {
    const input = base({ orderStatus: "paid", passStatus: "waiting_for_kitchen" });
    const p = presentMealDeckTracking(input);
    expect(p.headline).toBe("Order placed");
    expect(p.progress.reached).toBe(1);
    expect(step(input, "preparing").state).toBe("upcoming");
    expect(presentMealDeckTracking(base({ passStatus: "waiting_for_kitchen" })).tone).toBe(
      "review",
    );
  });

  test("cancelled pass requires assistance and never completes delivery", () => {
    const p = presentMealDeckTracking(
      base({
        orderStatus: "ready",
        passStatus: "cancelled",
        deliveryStatus: "delivered",
      }),
    );
    expect(p.tone).toBe("review");
    expect(p.paymentRecorded).toBe(true);
    expect(p.progress.percent).toBeLessThan(100);
    expect(p.canOpenCourierTracking).toBe(false);
  });

  test("canonical handed-off pass plus fulfilled collection completes the six-step journey", () => {
    for (const fulfilment of ["pickup", "curbside"]) {
      const p = presentMealDeckTracking(
        base({
          orderStatus: "fulfilled",
          fulfilment,
          passStatus: "handed_off",
        }),
      );
      expect(p.tone).toBe("reported");
      expect(p.paymentRecorded).toBe(true);
      expect(p.isFinalStatus).toBe(true);
      expect(p.progress.reached).toBe(6);
      expect(p.stages.every((value) => value.state === "done")).toBe(true);
      const inconsistent = presentMealDeckTracking(
        base({
          orderStatus: "ready",
          fulfilment,
          passStatus: "handed_off",
        }),
      );
      expect(inconsistent.tone).toBe("review");
      expect(inconsistent.stages.at(-1)?.state).toBe("upcoming");
    }
  });

  test("a delivery kitchen handoff does not substitute for courier pickup or delivery", () => {
    const handed = base({ orderStatus: "ready", passStatus: "handed_off" });
    const pending = presentMealDeckTracking(handed);
    expect(pending.headline).toBe("Kitchen handoff recorded");
    expect(step(handed, "ready").state).toBe("done");
    expect(step(handed, "handoff").state).toBe("upcoming");
    expect(step(handed, "delivered").state).toBe("upcoming");
    expect(pending.canOpenCourierTracking).toBe(false);
    const collected = { ...handed, deliveryStatus: "picked_up" };
    expect(step(collected, "handoff").state).toBe("current");
    expect(step(collected, "delivered").state).toBe("upcoming");
    const delivered = presentMealDeckTracking({
      ...handed,
      orderStatus: "fulfilled",
      deliveryStatus: "delivered",
    });
    expect(delivered.tone).toBe("reported");
    expect(delivered.progress.reached).toBe(7);
    expect(delivered.isFinalStatus).toBe(true);
    expect(
      presentMealDeckTracking(
        base({
          passStatus: "handed_off",
          deliveryStatus: "delivered",
        }),
      ).paymentRecorded,
    ).toBe(false);
  });
});

describe("MealDeck order time is a real placement timestamp", () => {
  test("server observation anchors elapsed time despite a wrong device clock", () => {
    const input = base({ orderStatus: "preparing" });
    for (const now of [0, Date.parse("2099-01-01T00:00:00Z")]) {
      const p = presentMealDeckTracking(input, now);
      expect(p.createdAtIso).toBe("2026-11-03T14:00:00.000Z");
      expect(p.updatedAtIso).toBe("2026-11-03T14:03:00.000Z");
      expect(p.elapsedAtObservationSeconds).toBe(180);
      expect(trackingElapsedSeconds(p, 5500)).toBe(185);
      expect(p.progress.reached).toBe(3);
    }
  });

  test("missing placement time never falls back to updated_at or lookup time", () => {
    const p = presentMealDeckTracking(base({ createdAt: undefined }));
    expect(p.updatedAtIso).not.toBeNull();
    expect(p.createdAtIso).toBeNull();
    expect(p.elapsedAtObservationSeconds).toBeNull();
    expect(trackingElapsedSeconds(p, 60000)).toBeNull();
  });

  test("invalid dates, missing offsets and future placement times hide the clock", () => {
    for (const createdAt of [
      "2026-11-03 14:00:00",
      "2026-11-03T14:00:00",
      "2026-02-30T14:00:00Z",
      "2026-13-03T14:00:00Z",
      "2026-11-03T24:00:00Z",
      "2026-11-03T14:00:00+25:00",
      "not a date",
      "2026-11-03T14:03:01Z",
    ]) {
      const p = presentMealDeckTracking(base({ createdAt, orderStatus: "paid" }));
      expect(p.createdAtIso).toBeNull();
      expect(p.elapsedAtObservationSeconds).toBeNull();
      expect(p.headline).toBe("Order placed");
    }
  });

  test("explicit offsets and leap dates are parsed without changing their meaning", () => {
    const offset = presentMealDeckTracking(base({ createdAt: "2026-11-03T15:00:00+01:00" }));
    expect(offset.createdAtIso).toBe("2026-11-03T14:00:00.000Z");
    const leap = presentMealDeckTracking(
      base({
        createdAt: "2024-02-29T23:59:59.123456Z",
        observedAt: "2024-03-01T00:00:01Z",
        updatedAt: undefined,
      }),
    );
    expect(leap.createdAtIso).toBe("2024-02-29T23:59:59.123Z");
    expect(leap.elapsedAtObservationSeconds).toBe(1);
  });

  test("future, pre-order and malformed update timestamps are not displayed as recent facts", () => {
    for (const updatedAt of ["2026-11-03T14:03:01Z", "2026-11-03T13:59:00Z", "2026-11-03 14:01:00"])
      expect(presentMealDeckTracking(base({ updatedAt })).updatedAtIso).toBeNull();
    const invalidAnchor = presentMealDeckTracking(base({ observedAt: "not a date" }));
    expect(invalidAnchor.createdAtIso).toBeNull();
    expect(invalidAnchor.elapsedAtObservationSeconds).toBeNull();
  });

  test("legacy replies may use local now but never make a future or unknown start time valid", () => {
    const p = presentMealDeckTracking(
      base({ observedAt: undefined }),
      Date.parse("2026-11-03T14:03:00Z"),
    );
    expect(p.elapsedAtObservationSeconds).toBe(180);
    expect(presentMealDeckTracking(base({ observedAt: undefined }), 0).createdAtIso).toBeNull();
  });

  test("final report freezes age at the status check without claiming a delivery duration", () => {
    const p = presentMealDeckTracking(
      base({
        orderStatus: "fulfilled",
        passStatus: "sealed",
        deliveryStatus: "delivered",
        observedAt: "2026-11-03T14:10:00Z",
        updatedAt: "2026-11-03T14:06:00Z",
      }),
    );
    expect(p.elapsedAtObservationSeconds).toBe(600);
    expect(trackingElapsedSeconds(p, 60000)).toBe(600);
    expect(p.updatedAtIso).toBe("2026-11-03T14:06:00.000Z");
  });

  test("elapsed time is bounded numeric data and cannot alter any milestone", () => {
    const p = presentMealDeckTracking(base({ orderStatus: "paid" }));
    expect(trackingElapsedSeconds(p, 24 * 3600 * 1000)).toBe(86580);
    expect(p.headline).toBe("Order placed");
    expect(p.progress.reached).toBe(1);
    for (const milliseconds of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(trackingElapsedSeconds(p, milliseconds)).toBeNull();
    }
    expect(formatTrackingElapsed(0)).toBe("0m 00s");
    expect(formatTrackingElapsed(185)).toBe("3m 05s");
    expect(formatTrackingElapsed(3665)).toBe("1h 1m 05s");
    expect(formatTrackingElapsed(90061)).toBe("1d 1h 1m 01s");
    expect(formatTrackingElapsed(null)).toBeNull();
    expect(formatTrackingElapsed(-1)).toBeNull();
    expect(formatTrackingElapsed(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
