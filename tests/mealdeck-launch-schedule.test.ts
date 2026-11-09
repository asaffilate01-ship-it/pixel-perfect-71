import { describe, expect, test } from "bun:test";
import {
  isMealDeckGuestCheckoutWindow,
  mealDeckLaunchWindowAt,
  isMealDeckSundayDeliveryPreopen,
  isMealDeckSundayDeliveryService,
  MEALDECK_LAUNCH_DAYS,
  MEALDECK_LAUNCH_TIME_ZONE,
  isMealDeckLutonRegularHoursAt,
  MEALDECK_LUTON_HOURS_LABEL,
} from "../src/lib/mealdeck-launch-schedule";

describe("MealDeck's confirmed Luton launch hours", () => {
  test("announces Sunday delivery only before 3pm without opening checkout", () => {
    expect(isMealDeckSundayDeliveryPreopen(Date.parse("2026-11-07T23:59:59Z"))).toBe(false);
    expect(isMealDeckSundayDeliveryPreopen(Date.parse("2026-11-08T00:00:00Z"))).toBe(true);
    expect(isMealDeckSundayDeliveryPreopen(Date.parse("2026-11-08T14:59:59Z"))).toBe(true);
    expect(isMealDeckSundayDeliveryPreopen(Date.parse("2026-11-08T15:00:00Z"))).toBe(false);
    expect(isMealDeckSundayDeliveryPreopen(Date.parse("2026-11-09T00:00:00Z"))).toBe(false);
    expect(isMealDeckSundayDeliveryPreopen(Number.NaN)).toBe(false);
    expect(isMealDeckGuestCheckoutWindow("2026-11-08T14:59:59Z")).toBe(false);
  });

  test("Sunday delivery marketing uses exact 3pm–11pm window without granting checkout", () => {
    expect(isMealDeckSundayDeliveryService(Date.parse("2026-11-08T14:59:59Z"))).toBe(false);
    expect(isMealDeckSundayDeliveryService(Date.parse("2026-11-08T15:00:00Z"))).toBe(true);
    expect(isMealDeckSundayDeliveryService(Date.parse("2026-11-08T22:59:59Z"))).toBe(true);
    expect(isMealDeckSundayDeliveryService(Date.parse("2026-11-08T23:00:00Z"))).toBe(false);
    expect(isMealDeckSundayDeliveryService(Date.parse("2026-11-09T15:00:00Z"))).toBe(false);
    expect(isMealDeckSundayDeliveryService(Number.NaN)).toBe(false);
  });

  test("opens at 3pm each day and closes at midnight Friday/Saturday and 11pm Sunday", () => {
    expect(MEALDECK_LAUNCH_DAYS.map((day) => [day.date, day.opensAt, day.closesAt])).toEqual([
      ["2026-11-06", "2026-11-06T15:00:00Z", "2026-11-07T00:00:00Z"],
      ["2026-11-07", "2026-11-07T15:00:00Z", "2026-11-08T00:00:00Z"],
      ["2026-11-08", "2026-11-08T15:00:00Z", "2026-11-08T23:00:00Z"],
    ]);
    for (const day of MEALDECK_LAUNCH_DAYS) {
      const opening = Date.parse(day.opensAt);
      const closing = Date.parse(day.closesAt);
      expect(mealDeckLaunchWindowAt(opening - 1)).toBeNull();
      expect(mealDeckLaunchWindowAt(opening)).toEqual(day);
      expect(mealDeckLaunchWindowAt(closing - 1)).toEqual(day);
      expect(mealDeckLaunchWindowAt(closing)).toBeNull();
    }
  });

  test("keeps the kitchen closed before 3pm and between opening days", () => {
    expect(isMealDeckGuestCheckoutWindow("2026-11-06T13:00:00Z")).toBe(false);
    expect(isMealDeckGuestCheckoutWindow("2026-11-06T14:59:59.999Z")).toBe(false);
    expect(isMealDeckGuestCheckoutWindow("2026-11-06T15:00:00Z")).toBe(true);
    expect(isMealDeckGuestCheckoutWindow("2026-11-06T23:00:00Z")).toBe(true);
    expect(isMealDeckGuestCheckoutWindow("2026-11-06T23:59:59.999Z")).toBe(true);
    expect(isMealDeckGuestCheckoutWindow("2026-11-07T00:00:00Z")).toBe(false);
    expect(isMealDeckGuestCheckoutWindow("2026-11-07T12:59:59.999Z")).toBe(false);
    expect(isMealDeckGuestCheckoutWindow("2026-11-07T13:00:00Z")).toBe(false);
    expect(isMealDeckGuestCheckoutWindow("2026-11-07T14:59:59.999Z")).toBe(false);
    expect(isMealDeckGuestCheckoutWindow("2026-11-07T15:00:00Z")).toBe(true);
    expect(isMealDeckGuestCheckoutWindow("2026-11-07T23:00:00Z")).toBe(true);
    expect(isMealDeckGuestCheckoutWindow("2026-11-07T23:59:59.999Z")).toBe(true);
    expect(isMealDeckGuestCheckoutWindow("2026-11-08T00:00:00Z")).toBe(false);
    expect(isMealDeckGuestCheckoutWindow("2026-11-08T13:00:00Z")).toBe(false);
    expect(isMealDeckGuestCheckoutWindow("2026-11-08T14:59:59.999Z")).toBe(false);
    expect(isMealDeckGuestCheckoutWindow("2026-11-08T15:00:00Z")).toBe(true);
    expect(isMealDeckGuestCheckoutWindow("2026-11-08T22:59:59.999Z")).toBe(true);
    expect(isMealDeckGuestCheckoutWindow("2026-11-08T23:00:00Z")).toBe(false);
    expect(isMealDeckGuestCheckoutWindow("2026-11-09T13:00:00Z")).toBe(false);
  });

  test("is independent of visitor timezone and never creates a personal rolling window", () => {
    expect(MEALDECK_LAUNCH_TIME_ZONE).toBe("Europe/London");
    expect(mealDeckLaunchWindowAt("2026-11-06T16:00:00+01:00")?.date).toBe("2026-11-06");
    expect(mealDeckLaunchWindowAt("2026-11-06T10:00:00-05:00")?.date).toBe("2026-11-06");
    expect(mealDeckLaunchWindowAt(new Date("2026-11-07T15:00:00Z"))?.date).toBe("2026-11-07");
    for (const date of ["2026-11-05T15:00:00Z", "2026-11-09T15:00:00Z", "2027-11-06T15:00:00Z"])
      expect(isMealDeckGuestCheckoutWindow(date)).toBe(false);
  });

  test("rejects missing timezone, invalid dates and non-finite timestamps", () => {
    for (const invalid of [
      "",
      "2026-11-06",
      "2026-11-06T15:00:00",
      "invalidZ",
      Number.NaN,
      Infinity,
      new Date(Number.NaN),
    ])
      expect(isMealDeckGuestCheckoutWindow(invalid)).toBe(false);
  });
});


describe("regular Luton hours (owner update 9 Nov 2026)", () => {
  test("Monday to Thursday opens 5pm and closes 11pm UK time", () => {
    // Mon 9 Nov 2026 (GMT)
    expect(isMealDeckLutonRegularHoursAt(Date.parse("2026-11-09T16:59:59Z"))).toBe(false);
    expect(isMealDeckLutonRegularHoursAt(Date.parse("2026-11-09T17:00:00Z"))).toBe(true);
    expect(isMealDeckLutonRegularHoursAt(Date.parse("2026-11-12T22:59:59Z"))).toBe(true);
    expect(isMealDeckLutonRegularHoursAt(Date.parse("2026-11-12T23:00:00Z"))).toBe(false);
    expect(isMealDeckLutonRegularHoursAt(Date.parse("2026-11-12T16:30:00Z"))).toBe(false);
  });
  test("Friday to Sunday opens 4pm and closes 11pm UK time", () => {
    expect(isMealDeckLutonRegularHoursAt(Date.parse("2026-11-13T15:59:59Z"))).toBe(false);
    expect(isMealDeckLutonRegularHoursAt(Date.parse("2026-11-13T16:00:00Z"))).toBe(true);
    expect(isMealDeckLutonRegularHoursAt(Date.parse("2026-11-15T16:30:00Z"))).toBe(true);
    expect(isMealDeckLutonRegularHoursAt(Date.parse("2026-11-15T23:00:00Z"))).toBe(false);
  });
  test("uses UK summer time", () => {
    // Fri 5 Jun 2026, BST: 4pm local = 15:00Z
    expect(isMealDeckLutonRegularHoursAt(Date.parse("2026-06-05T15:00:00Z"))).toBe(true);
    expect(isMealDeckLutonRegularHoursAt(Date.parse("2026-06-05T14:59:59Z"))).toBe(false);
  });
  test("shows the confirmed label", () => {
    expect(MEALDECK_LUTON_HOURS_LABEL).toBe("Mon–Thu 5pm–11pm · Fri–Sun 4pm–11pm · UK time");
  });
});
