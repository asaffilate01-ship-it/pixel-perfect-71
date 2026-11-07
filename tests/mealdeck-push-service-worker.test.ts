import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Script, createContext } from "node:vm";

const uid = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const orderId = uid(1);
const now = Date.parse("2026-11-07T12:00:00Z");
const richOrder = {
  type: "order_update",
  stage: "preparing",
  orderId,
  notificationId: uid(2),
  fulfilment: "pickup",
  checkoutMode: "guest",
  occurredAt: "2026-11-07T11:59:50Z",
  expiresAt: "2026-11-07T12:01:00Z",
};
const richOffer = {
  type: "offer",
  campaignId: uid(3),
  notificationId: uid(4),
  title: "Weekend offers",
  body: "Explore the current offers and terms.",
  path: "/offers",
  occurredAt: "2026-11-07T11:59:50Z",
  expiresAt: "2026-11-07T13:00:00Z",
};
type Json = Record<string, unknown>;

function fixture() {
  const origin = "https://mealdeck.example.test";
  const handlers = new Map<string, (event: Json) => void>();
  const shown: { title: string; options: Json }[] = [];
  const visible = new Map<string, Json>();
  const opened: string[] = [];
  const navigated: string[] = [];
  const focused: string[] = [];
  const windows: {
    url: string;
    navigate: (url: string) => Promise<void>;
    focus: () => Promise<void>;
  }[] = [];
  class FixedDate extends Date {
    static now() {
      return now;
    }
  }
  const context = createContext({
    URL,
    Set,
    Promise,
    Date: FixedDate,
    self: {
      location: { origin },
      addEventListener: (type: string, handler: (event: Json) => void) =>
        handlers.set(type, handler),
      registration: {
        getNotifications: async ({ tag }: { tag: string }) =>
          [...visible.values()].filter((notification) => notification["tag"] === tag),
        showNotification: async (title: string, options: Json) => {
          shown.push({ title, options });
          visible.set(String(options["tag"]), { title, ...options });
        },
      },
      clients: {
        matchAll: async () => windows,
        openWindow: async (url: string) => {
          opened.push(url);
        },
      },
    },
  });
  new Script(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8")).runInContext(
    context,
  );
  async function event(type: string, fields: Json) {
    const pending: Promise<unknown>[] = [];
    handlers.get(type)?.({
      ...fields,
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });
    await Promise.all(pending);
  }
  const push = (payload: unknown) => event("push", { data: { json: () => payload } });
  const click = (data: unknown, action?: string) =>
    event("notificationclick", {
      action,
      notification: { data, close: () => {} },
    });
  function window(url: string) {
    windows.push({
      url,
      navigate: async (target) => {
        navigated.push(target);
      },
      focus: async () => {
        focused.push(url);
      },
    });
  }
  return { origin, shown, visible, opened, navigated, focused, push, click, window };
}

describe("Customer mobile push display and navigation", () => {
  test("valid kitchen stages use fixed copy while ignoring customer details and handover codes", async () => {
    const f = fixture();
    for (const stage of ["accepted", "preparing", "ready_for_handover", "completed"]) {
      await f.push({
        ...richOrder,
        stage,
        title: "Private Customer AB12",
        body: "Paid £50, handover 1234",
        handoffCode: "1234",
        customerName: "Private Customer",
        url: "https://evil.example/",
      });
    }
    expect(f.shown.map((notification) => notification.title)).toEqual([
      "MealDeck · Order accepted",
      "MealDeck · Preparing your order",
      "MealDeck · Ready for handover",
      "MealDeck · Order handed over",
    ]);
    expect(f.shown[2]!.options["body"]).toContain("ready to collect");
    expect(f.shown[2]!.options["body"]).toContain("tap to view it");
    const exposed = JSON.stringify(f.shown);
    for (const secret of ["Private Customer", "AB12", "£50", "1234", "evil.example"])
      expect(exposed).not.toContain(secret);
    expect(f.shown.every((notification) => notification.options["renotify"] === true)).toBe(true);
  });

  test("handover wording follows the actual collection, kerbside or delivery fulfilment", async () => {
    const f = fixture();
    for (const fulfilment of ["pickup", "curbside", "delivery"])
      await f.push({ ...richOrder, stage: "ready_for_handover", fulfilment });
    expect(f.shown[0]!.options["body"]).toContain("ready to collect");
    expect(f.shown[1]!.options["body"]).toContain("kerbside handover");
    expect(f.shown[2]!.options["body"]).toContain("ready for your driver");
    expect(f.shown[2]!.options["body"]).not.toContain("ready to collect");
  });

  test("collection orders cannot announce a driver and unknown stages cannot imply progress", async () => {
    const f = fixture();
    await f.push({ ...richOrder, stage: "with_driver", fulfilment: "pickup" });
    await f.push({ ...richOrder, stage: "on_the_way", fulfilment: "curbside" });
    await f.push({ ...richOrder, stage: "__proto__" });
    for (const notification of f.shown) {
      expect(notification.title).toBe("MealDeck");
      expect(notification.options["body"]).toBe("There’s an update in your MealDeck account.");
    }
    await f.push({ ...richOrder, stage: "with_driver", fulfilment: "delivery" });
    await f.push({ ...richOrder, stage: "on_the_way", fulfilment: "delivery" });
    expect(f.shown[3]!.title).toBe("MealDeck · With your driver");
    expect(f.shown[4]!.title).toBe("MealDeck · On the way");
  });

  test("later stages replace the same order's notification without merging unrelated orders", async () => {
    const f = fixture();
    await f.push(richOrder);
    await f.push({ ...richOrder, notificationId: uid(5), stage: "ready_for_handover" });
    await f.push({ ...richOrder, orderId: uid(6), notificationId: uid(7) });
    expect(f.shown[0]!.options["tag"]).toBe(f.shown[1]!.options["tag"]);
    expect(f.shown[2]!.options["tag"]).not.toBe(f.shown[0]!.options["tag"]);
    expect(f.shown[0]!.options["data"]).toEqual({
      type: "order_update",
      orderId,
      checkoutMode: "guest",
      stage: "preparing",
      fulfilment: "pickup",
      occurredAt: "2026-11-07T11:59:50.000Z",
      expiresAt: "2026-11-07T12:01:00.000Z",
    });
  });

  test("out-of-order pushes retain the newest visible stage without alerting again", async () => {
    const f = fixture();
    await f.push({ ...richOrder, stage: "ready_for_handover", occurredAt: "2026-11-07T12:00:00Z" });
    await f.push({ ...richOrder, stage: "accepted", occurredAt: "2026-11-07T11:59:00Z" });
    expect(f.shown).toHaveLength(2);
    expect(f.shown[1]!.title).toBe("MealDeck · Ready for handover");
    expect(f.shown[1]!.options["body"]).toContain("ready to collect");
    expect(f.shown[1]!.options["renotify"]).toBe(false);
    expect(f.shown[1]!.options["data"]).toMatchObject({
      type: "order_update",
      orderId,
      stage: "ready_for_handover",
      checkoutMode: "guest",
      occurredAt: "2026-11-07T12:00:00.000Z",
    });
    await f.push({ ...richOrder, stage: "completed", occurredAt: "2026-11-07T12:00:10Z" });
    expect(f.shown[2]!.title).toBe("MealDeck · Order handed over");
    expect(f.shown[2]!.options["renotify"]).toBe(true);
  });

  test("concurrent older pushes cannot race the newer visible stage", async () => {
    const f = fixture();
    await Promise.all([
      f.push({ ...richOrder, stage: "ready_for_handover", occurredAt: "2026-11-07T12:00:00Z" }),
      f.push({ ...richOrder, stage: "accepted", occurredAt: "2026-11-07T11:59:00Z" }),
    ]);
    expect(f.shown).toHaveLength(2);
    expect(f.shown.at(-1)!.title).toBe("MealDeck · Ready for handover");
    expect(f.shown.at(-1)!.options["renotify"]).toBe(false);
  });

  test("retained status is rebuilt from validated metadata rather than old raw display text", async () => {
    const f = fixture();
    const tag = `mealdeck-order-${orderId}`;
    f.visible.set(tag, {
      tag,
      title: "Private Customer",
      body: "Collection code 1234",
      data: { ...richOrder, stage: "ready_for_handover", occurredAt: "2026-11-07T12:00:00Z" },
    });
    await f.push({ ...richOrder, stage: "accepted" });
    expect(f.shown[0]!.title).toBe("MealDeck · Ready for handover");
    expect(f.shown[0]!.options["body"]).toContain("ready to collect");
    expect(JSON.stringify(f.shown)).not.toContain("Private Customer");
    expect(JSON.stringify(f.shown)).not.toContain("1234");
  });

  test("invalid or unrelated visible metadata cannot displace the current order", async () => {
    for (const patch of [
      { stage: "__proto__" },
      { stage: "with_driver", fulfilment: "pickup" },
      { checkoutMode: "member" },
      { orderId: uid(99) },
      { occurredAt: "not-a-date" },
      { expiresAt: "not-a-date" },
    ]) {
      const f = fixture();
      const tag = `mealdeck-order-${orderId}`;
      f.visible.set(tag, {
        tag,
        data: {
          ...richOrder,
          stage: "ready_for_handover",
          occurredAt: "2026-11-07T12:00:00Z",
          ...patch,
        },
      });
      await f.push(richOrder);
      expect(f.shown[0]!.title).toBe("MealDeck · Preparing your order");
      expect(f.shown[0]!.options["renotify"]).toBe(true);
    }
  });

  test("dismissed notification history is not retained in private browser storage", async () => {
    const f = fixture();
    await f.push({ ...richOrder, stage: "ready_for_handover", occurredAt: "2026-11-07T12:00:00Z" });
    f.visible.clear();
    await f.push({ ...richOrder, stage: "accepted" });
    expect(f.shown[1]!.title).toBe("MealDeck · Order accepted");
    expect(f.shown[1]!.options["renotify"]).toBe(true);
  });

  test("order clicks open a validated private receipt route with its original access mode", async () => {
    const f = fixture();
    for (const checkoutMode of ["guest", "member"]) {
      await f.push({ ...richOrder, checkoutMode, url: "https://evil.example/", path: "/ops" });
      await f.click(f.shown.at(-1)!.options["data"]);
    }
    expect(f.opened).toEqual([
      `${f.origin}/checkout?order=${orderId}&notificationMode=guest`,
      `${f.origin}/checkout?order=${orderId}&notificationMode=member`,
    ]);
    expect(f.opened.every((url) => !/[?#&](code|token|key)=/.test(url))).toBe(true);
  });

  test("offers have a bounded public destination and a separate preferences action", async () => {
    const f = fixture();
    await f.push(richOffer);
    const notification = f.shown[0]!;
    expect(notification.title).toBe("MealDeck · Weekend offers");
    expect(notification.options["body"]).toBe(richOffer.body);
    expect(notification.options["data"]).toEqual({ type: "offer", path: "/offers" });
    expect(notification.options["actions"]).toEqual([
      { action: "preferences", title: "Manage offers" },
    ]);
    expect(notification.options["renotify"]).toBe(false);
    await f.click(notification.options["data"]);
    await f.click(notification.options["data"], "preferences");
    expect(f.opened).toEqual([f.origin + "/offers", f.origin + "/account"]);
  });

  test("malformed promotion copy is replaced by the generic notification", async () => {
    const f = fixture();
    for (const patch of [
      { title: "x".repeat(61) },
      { body: "x".repeat(181) },
      { title: "Promo\u202eHidden" },
      { body: "Promo\nHidden" },
      { path: "https://evil.example/" },
      { path: "/offers?token=private" },
    ])
      await f.push({ ...richOffer, ...patch });
    for (const notification of f.shown) {
      expect(notification.title).toBe("MealDeck");
      expect(notification.options["body"]).toBe("There’s a new MealDeck offer to explore.");
      expect(notification.options["data"]).toEqual({ path: "/menus" });
    }
  });

  test("delayed pushes remain visible but cannot advertise expired order or offer content", async () => {
    const f = fixture();
    await f.push({ ...richOrder, stage: "ready_for_handover", expiresAt: "2026-11-07T11:59:59Z" });
    await f.push({
      ...richOffer,
      title: "Expired promotion",
      body: "Private old offer text",
      expiresAt: "2026-11-07T11:59:59Z",
    });
    expect(f.shown).toHaveLength(2);
    expect(f.shown[0]!.options["body"]).toBe("Open your order for its latest status.");
    expect(f.shown[0]!.title).not.toContain("Ready");
    expect(f.shown[0]!.options["data"]).toMatchObject({
      type: "order_update",
      orderId,
      checkoutMode: "guest",
    });
    expect(f.shown[1]!.options["body"]).toBe("View the current MealDeck offers.");
    expect(JSON.stringify(f.shown)).not.toContain("Expired promotion");
    expect(JSON.stringify(f.shown)).not.toContain("Private old offer text");
  });

  test("hostile click metadata cannot escape to another site or inject an order query", async () => {
    const f = fixture();
    for (const data of [
      { path: "https://evil.example/" },
      { path: "//evil.example/" },
      { path: "/ops" },
      { path: "/account?token=private" },
      { type: "order_update", orderId: `${orderId}&token=private`, checkoutMode: "guest" },
      { type: "order_update", orderId, checkoutMode: "guest&token=private" },
    ])
      await f.click(data);
    expect(f.opened).toEqual(Array(6).fill(f.origin + "/account"));
  });

  test("a notification never repurposes staff, printer, kitchen or cross-origin windows", async () => {
    const f = fixture();
    for (const path of ["/ops", "/printer/", "/kds", "/ops/finance"]) f.window(f.origin + path);
    f.window("https://other.example/checkout");
    await f.click({ type: "order_update", orderId, checkoutMode: "guest" });
    expect(f.navigated).toEqual([]);
    expect(f.focused).toEqual([]);
    expect(f.opened).toEqual([`${f.origin}/checkout?order=${orderId}&notificationMode=guest`]);
    f.window(f.origin + "/menus");
    await f.click({ type: "offer", path: "/offers" });
    expect(f.navigated).toEqual([f.origin + "/offers"]);
    expect(f.focused).toEqual([f.origin + "/menus"]);
    expect(f.opened).toHaveLength(1);
  });
});
