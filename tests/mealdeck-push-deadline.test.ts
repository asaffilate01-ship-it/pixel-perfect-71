import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { withCustomerPushDeadline } from "../src/lib/mealdeck-customer-notifications";

describe("MealDeck phone push approval must not hang", () => {
  test("returns successful browser operation within its bounded wait", async () => {
    expect(await withCustomerPushDeadline(Promise.resolve("saved"), "Device registration", 200))
      .toBe("saved");
  });
  test("reports a recoverable browser/network timeout", async () => {
    await expect(
      withCustomerPushDeadline(new Promise<never>(() => {}), "Push subscription", 40),
    ).rejects.toThrow("Push subscription is taking too long");
  });
  test("does not swallow an explicit rejected browser permission", async () => {
    await expect(withCustomerPushDeadline(
      Promise.reject(new Error("Notifications denied")), "Permission", 100,
    )).rejects.toThrow("Notifications denied");
  });
  test("rejects invalid timeout parameters instead of disabling the guard", async () => {
    await expect(withCustomerPushDeadline(Promise.resolve(true), "Unsafe", 0))
      .rejects.toThrow("Invalid push deadline");
  });
  test("customer screen shows every stage and verifies the saved server endpoint", () => {
    const source = readFileSync(
      new URL("../src/components/customer-account.tsx", import.meta.url),
      "utf8",
    );
    for (const stage of ['"permission"', '"worker"', '"subscription"', '"saving"', '"verifying"'])
      expect(source).toContain(stage);
    expect(source).toContain("setPushStage");
    expect(source).toContain("withCustomerPushDeadline(");
    expect(source).toContain('readCustomerDeviceNotifications()');
    expect(source).toContain('!== "connected"');
    expect(source).toContain("role=\"status\" aria-live=\"polite\"");
  });
});
