import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Script, createContext } from "node:vm";
import {
  EMPTY_CUSTOMER_PREFERENCES,
  normalizeCustomerPhone,
  normalizeCustomerEmail,
  normalizeCustomerName,
  parseCustomerProfile,
  parseCustomerCapabilities,
  parseCustomerPreferences,
  validateCustomerRegistration,
  isWebPushPublicKey,
  safeCustomerNotificationPath,
} from "../src/lib/mealdeck-customer";

const profile = {
  registered: true,
  userId: "00000000-0000-4000-8000-000000000001",
  email: "member@example.test",
  emailConfirmedAt: "2026-11-05T08:00:00.000Z",
  name: "Test Customer",
  phone: "+447700900123",
  updatedAt: "2026-11-05T08:30:00.000123Z",
  preferences: { ...EMPTY_CUSTOMER_PREFERENCES },
  loyalty: { enabled: false, points: 0, terms: null },
};

describe("MealDeck customer contracts", () => {
  test("normalises contact details without requiring an address", () => {
    expect(normalizeCustomerPhone("07700 900123")).toBe("+447700900123");
    expect(normalizeCustomerPhone("+44 (7700) 900-123")).toBe("+447700900123");
    expect(normalizeCustomerPhone("0044 7700 900123")).toBe("+447700900123");
    expect(normalizeCustomerPhone("+353871234567")).toBe("+353871234567");
    expect(normalizeCustomerEmail(" Member@Example.Test ")).toBe("member@example.test");
    expect(normalizeCustomerName("  Sam  O’Neill  ")).toBe("Sam O’Neill");
    const clean = validateCustomerRegistration({
      name: "Sam",
      email: "Member@Example.Test",
      phone: "07700 900123",
      preferences: { ...EMPTY_CUSTOMER_PREFERENCES },
    });
    expect(clean).toEqual({
      name: "Sam",
      email: "member@example.test",
      phone: "+447700900123",
      preferences: EMPTY_CUSTOMER_PREFERENCES,
    });
    expect("address" in clean).toBe(false);
  });
  test("rejects invalid phones, emails, missing names and control characters", () => {
    for (const invalid of [
      "07700",
      "0123",
      "+00 123456789",
      "7700900123",
      "call 07700900123",
      "+44+7700900123",
      "+4" + "1".repeat(20),
    ])
      expect(normalizeCustomerPhone(invalid)).toBeNull();
    for (const invalid of [
      "a@b",
      "member@example.test\nBCC:other@example.test",
      "a b@example.test",
      "@example.test",
    ])
      expect(normalizeCustomerEmail(invalid)).toBeNull();
    for (const invalid of [
      "",
      " ",
      "Sam\nAdmin",
      "Sam\u0000",
      "Sam\u0085",
      "Sam\u202e",
      "Sam\u200e",
      "\u200b",
      "Sam\ufeff",
      "a".repeat(121),
    ])
      expect(normalizeCustomerName(invalid)).toBeNull();
  });
  test("marketing and order alert choices default off and accept only explicit booleans", () => {
    expect(EMPTY_CUSTOMER_PREFERENCES).toEqual({
      emailMarketing: false,
      pushMarketing: false,
      orderNotifications: false,
    });
    expect(Object.isFrozen(EMPTY_CUSTOMER_PREFERENCES)).toBe(true);
    expect(
      parseCustomerPreferences({
        emailMarketing: "false",
        pushMarketing: false,
        orderNotifications: false,
      }),
    ).toBeNull();
    expect(parseCustomerPreferences({ emailMarketing: true })).toBeNull();
    expect(
      parseCustomerPreferences({ ...EMPTY_CUSTOMER_PREFERENCES, orderNotifications: true }),
    ).toEqual({ emailMarketing: false, pushMarketing: false, orderNotifications: true });
  });
  test("profile parser fails closed for malformed registration and does not fill verification from metadata", () => {
    expect(parseCustomerProfile(profile)).toEqual(profile);
    expect(
      parseCustomerProfile({
        ...profile,
        emailConfirmedAt: null,
        user_metadata: { emailConfirmedAt: profile.emailConfirmedAt },
      }),
    ).toBeNull();
    expect(parseCustomerProfile({ ...profile, emailConfirmedAt: "not-a-date" })).toBeNull();
    expect(parseCustomerProfile({ ...profile, phone: null })).toBeNull();
    expect(parseCustomerProfile({ ...profile, name: "" })).toBeNull();
    expect(parseCustomerProfile({ ...profile, updatedAt: null })).toBeNull();
    expect(
      parseCustomerProfile({
        ...profile,
        loyalty: { enabled: true, points: 0.5, terms: "Example" },
      }),
    ).toBeNull();
    expect(
      parseCustomerProfile({ ...profile, loyalty: { enabled: false, points: -1, terms: null } }),
    ).toBeNull();
    expect(
      parseCustomerProfile({
        ...profile,
        registered: false,
        name: null,
        phone: null,
        updatedAt: null,
      })?.registered,
    ).toBe(false);
  });
  test("capabilities never infer registration or push readiness from a key alone", () => {
    expect(
      parseCustomerCapabilities({
        schemaVersion: 1,
        registration: true,
        pushReady: false,
        loyaltyReady: false,
      }),
    ).toEqual({ registration: true, pushReady: false, loyaltyReady: false });
    expect(
      parseCustomerCapabilities({
        schemaVersion: 1,
        registration: true,
        pushReady: "true",
        loyaltyReady: false,
      }),
    ).toBeNull();
    expect(parseCustomerCapabilities({ registration: true })).toBeNull();
    const valid = Buffer.from([4, ...Array(64).fill(3)]).toString("base64url");
    expect(isWebPushPublicKey(valid)).toBe(true);
    for (const invalid of [
      "",
      "sb_secret_bad",
      Buffer.from([5, ...Array(64).fill(3)]).toString("base64url"),
      "B" + "A".repeat(85),
    ])
      expect(isWebPushPublicKey(invalid)).toBe(false);
  });
  test("notification destinations allow only public same-origin screens without tokens", () => {
    expect(safeCustomerNotificationPath("/menus")).toBe("/menus");
    expect(safeCustomerNotificationPath("/account")).toBe("/account");
    for (const value of [
      "https://evil.test",
      "//evil.test",
      "/ops",
      "/kds",
      "/track?token=private",
      "/account?returnTo=https://evil.test",
      null,
    ])
      expect(safeCustomerNotificationPath(value)).toBe("/account");
  });
});

describe("Customer push service worker", () => {
  function fixture() {
    const handlers = new Map<string, (event: Record<string, unknown>) => void>();
    const shown: { title: string; options: Record<string, unknown> }[] = [];
    const opened: string[] = [];
    const focused: string[] = [];
    const existing: {
      url: string;
      navigate: (url: string) => Promise<void>;
      focus: () => Promise<void>;
    }[] = [];
    const origin = "https://mealdeck.example.test";
    const context = createContext({
      URL,
      Set,
      Promise,
      self: {
        location: { origin },
        addEventListener: (type: string, handler: (event: Record<string, unknown>) => void) =>
          handlers.set(type, handler),
        registration: {
          showNotification: async (title: string, options: Record<string, unknown>) => {
            shown.push({ title, options });
          },
        },
        clients: {
          matchAll: async () => existing,
          openWindow: async (url: string) => {
            opened.push(url);
          },
        },
      },
    });
    new Script(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8")).runInContext(
      context,
    );
    async function event(type: string, payload: Record<string, unknown>) {
      const pending: Promise<unknown>[] = [];
      handlers.get(type)?.({
        ...payload,
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      });
      await Promise.all(pending);
    }
    return { event, shown, opened, focused, existing, origin };
  }
  test("push payloads cannot expose customer details on the lock screen", async () => {
    const f = fixture();
    await f.event("push", {
      data: {
        json: () => ({
          type: "order_update",
          title: "Jane at AB12",
          body: "Card paid £50",
          url: "https://evil.test",
        }),
      },
    });
    expect(f.shown).toHaveLength(1);
    expect(f.shown[0]?.title).toBe("MealDeck");
    expect(f.shown[0]?.options["body"]).toBe("There’s an update in your MealDeck account.");
    expect(JSON.stringify(f.shown)).not.toContain("AB12");
    expect(JSON.stringify(f.shown)).not.toContain("£50");
    await f.event("push", { data: { json: () => ({ type: "offer" }) } });
    expect(f.shown[1]?.options["data"]).toEqual({ path: "/menus" });
  });
  test("unknown or broken payloads produce no misleading message", async () => {
    const f = fixture();
    await f.event("push", {
      data: {
        json: () => {
          throw new Error("not JSON");
        },
      },
    });
    await f.event("push", { data: { json: () => ({ type: "paid" }) } });
    expect(f.shown).toHaveLength(0);
  });
  test("notification clicks never follow an arbitrary payload URL", async () => {
    const f = fixture();
    let closed = 0;
    await f.event("notificationclick", {
      notification: {
        data: { path: "https://evil.test" },
        close: () => {
          closed++;
        },
      },
    });
    expect(f.opened).toEqual([f.origin + "/account"]);
    expect(closed).toBe(1);
    f.existing.push({
      url: f.origin + "/menus",
      navigate: async (url) => {
        f.focused.push(url);
      },
      focus: async () => {
        f.focused.push("focused");
      },
    });
    await f.event("notificationclick", {
      notification: {
        data: { path: "/menus" },
        close: () => {
          closed++;
        },
      },
    });
    expect(f.focused).toEqual([f.origin + "/menus", "focused"]);
    expect(f.opened).toHaveLength(1);
  });
  test("customer alerts never navigate a KDS, printer or staff app window", async () => {
    const f = fixture();
    for (const path of ["/kds", "/printer/", "/ops"])
      f.existing.push({
        url: f.origin + path,
        navigate: async (url) => {
          f.focused.push(url);
        },
        focus: async () => {
          f.focused.push("focused");
        },
      });
    await f.event("notificationclick", {
      notification: { data: { path: "/menus" }, close: () => {} },
    });
    expect(f.focused).toEqual([]);
    expect(f.opened).toEqual([f.origin + "/menus"]);
  });
});
