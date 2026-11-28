import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KdsMarketplaceStatus } from "../src/components/ops/kds-marketplace-status";
import { marketplaceProjectionSchema, marketplaceOrderReference, marketplaceSyncPresentation } from "../src/lib/mealdeck-marketplace";

const now = Date.parse("2026-11-28T07:00:00Z");
const stamp = new Date(now).toISOString();
const fixture = {
  platform: "uber_eats", display_reference: "00Ab-19", platform_state: "accepted",
  confirmed_at: stamp, sync_state: "confirmed", pending_action: null,
  capabilities: { accept: true, preparing: false, ready: true, handover: false },
};

test("marketplace reference is preserved independently of direct order numbers", () => {
  const order = marketplaceProjectionSchema.parse(fixture);
  expect(marketplaceOrderReference(order)).toEqual({ label: "Uber Eats order", value: "00Ab-19" });
  expect(marketplaceOrderReference(marketplaceProjectionSchema.parse({ ...fixture, platform: "just_eat" })).label).toBe("Just Eat order");
  for (const display_reference of [123, " 00Ab-19", "00Ab\u202819", "00Ab\u200b19", "x".repeat(81)]) {
    expect(marketplaceProjectionSchema.safeParse({ ...fixture, display_reference }).success).toBe(false);
  }
});

test("strict projection rejects private fields, contradictory confirmation and missing pending action", () => {
  for (const patch of [{ paid: true }, { token_hash: "fixture" }, { confirmed_at: null },
    { platform_state: "unknown" }, { platform_state: "new" }, { platform_state: "cancelled" },
    { sync_state: "queued", pending_action: null }]) {
    expect(marketplaceProjectionSchema.safeParse({ ...fixture, ...patch }).success).toBe(false);
  }
});

test("cancellation, uncertain action, pending updates and stale evidence take precedence", () => {
  const present = (patch: Record<string, unknown>) => marketplaceSyncPresentation(marketplaceProjectionSchema.parse({ ...fixture, ...patch }), now);
  expect(present({}).tone).toBe("confirmed");
  expect(present({ platform_state: "cancelled", sync_state: "idle" }).headline).toContain("Cancelled");
  expect(present({ sync_state: "needs_checking" }).tone).toBe("warning");
  expect(present({ sync_state: "sending", pending_action: "ready" }).tone).toBe("pending");
  expect(present({ confirmed_at: new Date(now - 90_000).toISOString() }).headline).toContain("Refresh");
  expect(present({ confirmed_at: new Date(now + 6000).toISOString() }).tone).toBe("warning");
});

test("read-only card exposes the exact source and handover limitation without actions", () => {
  const order = marketplaceProjectionSchema.parse({ ...fixture, platform: "just_eat", platform_state: "handed_over" });
  const html = renderToStaticMarkup(createElement(KdsMarketplaceStatus, { marketplace: order, now }));
  expect(html).toContain("Just Eat order");
  expect(html).toContain("00Ab-19");
  expect(html).toContain("not proof of completed customer delivery");
  expect(html).not.toContain("<button");
  expect(html).not.toContain("token_hash");
});
