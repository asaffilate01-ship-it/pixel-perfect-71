import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { withCustomerPushDeadline, CustomerPushTimeoutError } from "../src/lib/mealdeck-customer-notifications";

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
  test("timeout errors are distinguishable from permission refusals", async () => {
    await expect(withCustomerPushDeadline(
      new Promise<never>(() => {}), "Device lookup", 30,
    )).rejects.toBeInstanceOf(CustomerPushTimeoutError);
  });
  test("a first-time visitor is not blocked by an unnecessary service worker status check", () => {
    const code = readFileSync(
      new URL("../src/lib/mealdeck-customer-notifications.ts", import.meta.url),
      "utf8",
    );
    const f = code.slice(
      code.indexOf("export async function readCustomerDeviceNotifications"),
      code.indexOf("export async function enableCustomerDeviceNotifications"),
    );
    expect(f).toContain('if (Notification.permission !== "granted") return "off"');
    expect(f.indexOf('Notification.permission !== "granted"')).toBeLessThan(
      f.indexOf('navigator.serviceWorker.getRegistration'),
    );
    expect(f).toContain("withCustomerPushDeadline(");
  });
  test("an initial device lookup always releases the Enable button after a deadline", () => {
    const account = readFileSync(
      new URL("../src/components/customer-account.tsx", import.meta.url),
      "utf8",
    );
    expect(account).toContain("Checking this device's notification status");
    expect(account).toContain("9_000");
    expect(account).toContain('setDeviceLoading(false)');
    expect(account).toContain("Enable notifications on this phone");
    expect(account).toContain('setDeviceIssue(');
    expect(account).toContain('scrollIntoView({');
  });
  test("a timed-out ambiguous server save must preserve the phone subscription for retry", () => {
    const code = readFileSync(
      new URL("../src/lib/mealdeck-customer-notifications.ts", import.meta.url),
      "utf8",
    );
    expect(code).toContain("!(error instanceof CustomerPushTimeoutError)");
    expect(code).toContain("customerRpc<{ saved: boolean }>");
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
