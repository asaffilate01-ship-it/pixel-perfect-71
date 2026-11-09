import { describe, expect, test } from "bun:test";
import {
  mealDeckScheduledSlots,
  verifiedScheduledSlot,
  scheduledKdsHeadline,
  scheduledTimeLabel,
} from "../src/lib/mealdeck-scheduled-orders";

describe("MealDeck scheduled order release policy", () => {
  test("opens at 1pm UK with correct 45/75 minute lead and 15 minute slots", () => {
    for (const season of ["2026-11-09T13:00:00Z", "2027-07-09T12:00:00Z"]) {
      const collection = mealDeckScheduledSlots(season, "pickup");
      const curbside = mealDeckScheduledSlots(season, "curbside");
      const delivery = mealDeckScheduledSlots(season, "delivery");
      expect(scheduledTimeLabel(collection[0]!.fulfilmentAt)).toBe("13:45");
      expect(scheduledTimeLabel(delivery[0]!.fulfilmentAt)).toBe("14:15");
      expect(scheduledTimeLabel(collection.at(-1)!.fulfilmentAt)).toBe("22:45");
      expect(scheduledTimeLabel(delivery.at(-1)!.fulfilmentAt)).toBe("22:15");
      expect(curbside).toEqual(collection);
      expect(collection).toHaveLength(37);
      expect(delivery).toHaveLength(33);
      for (const slot of [...collection, ...delivery]) {
        expect(Number.isFinite(Date.parse(slot.fulfilmentAt))).toBe(true);
        expect(new Date(slot.fulfilmentAt).toISOString()).toBe(slot.fulfilmentAt);
      }
    }
  });

  test("payment time, not initial quote or room invitation, controls the lead time", () => {
    expect(mealDeckScheduledSlots("2026-11-09T12:59:59Z", "pickup")).toEqual([]);
    expect(scheduledTimeLabel(mealDeckScheduledSlots("2026-11-09T13:00:01Z", "pickup")[0]!.fulfilmentAt)).toBe("14:00");
    expect(scheduledTimeLabel(mealDeckScheduledSlots("2026-11-09T13:01:00Z", "delivery")[0]!.fulfilmentAt)).toBe("14:30");
    expect(mealDeckScheduledSlots("2026-11-09T22:00:00Z", "delivery")).toEqual([]);
    expect(mealDeckScheduledSlots("2026-11-09T22:00:01Z", "pickup")).toEqual([]);
    expect(mealDeckScheduledSlots("2026-11-09T22:00:00Z", "pickup").map(
      (slot) => scheduledTimeLabel(slot.fulfilmentAt),
    )).toEqual(["22:45"]);
    expect(mealDeckScheduledSlots("2026-11-09T21:59:59Z", "pickup").map(
      (slot) => scheduledTimeLabel(slot.fulfilmentAt),
    )).toEqual(["22:45"]);
    expect(mealDeckScheduledSlots("2026-11-09T21:45:00Z", "pickup").map(
      (slot) => scheduledTimeLabel(slot.fulfilmentAt),
    )).toEqual(["22:30", "22:45"]);
  });

  test("rejects late paid, invalid or off-grid checkout claims", () => {
    const date = "2026-11-09T13:00:00Z";
    const choice = mealDeckScheduledSlots(date, "pickup")[0]!;
    expect(verifiedScheduledSlot(date, "pickup", choice.fulfilmentAt)).toEqual(choice);
    expect(verifiedScheduledSlot("2026-11-09T13:00:01Z", "pickup", choice.fulfilmentAt)).toBeNull();
    expect(verifiedScheduledSlot(date, "pickup", "2026-11-09T13:52:00Z")).toBeNull();
    expect(verifiedScheduledSlot(date, "pickup", "2026-11-09T12:45:00Z")).toBeNull();
    expect(verifiedScheduledSlot(date, "pickup", "2026-11-10T13:45:00Z")).toBeNull();
    expect(verifiedScheduledSlot(date, "pickup", "2026-11-09T13:45:00")).toBeNull();
    expect(mealDeckScheduledSlots(Number.NaN, "pickup")).toEqual([]);
  });

  test("kitchen header is explicit and derives preparation deadline from 30/60 minutes", () => {
    const collection = mealDeckScheduledSlots("2026-11-09T13:00:00Z", "pickup")[0]!;
    const delivery = mealDeckScheduledSlots("2026-11-09T13:00:00Z", "delivery")[0]!;
    expect(scheduledKdsHeadline("pickup", collection.fulfilmentAt, collection.prepStartAt))
      .toBe("SCHEDULED COLLECTION 13:45 · PREP FROM 13:15 (30 MIN)");
    expect(scheduledKdsHeadline("delivery", delivery.fulfilmentAt, delivery.prepStartAt))
      .toBe("SCHEDULED DELIVERY 14:15 · PREP FROM 13:15 (60 MIN)");
    expect(scheduledKdsHeadline("delivery", collection.fulfilmentAt, collection.prepStartAt)).toBeNull();
    expect(scheduledKdsHeadline("curbside", null, null)).toBeNull();
  });
});
