import { expect, test } from "bun:test";
import { confirmReceiptPaper } from "../src/lib/mealdeck-printer-recovery";
import { mealdeckOrderEarnsPoints, MEALDECK_LOYALTY_START } from "../src/lib/mealdeck-loyalty";
import { cleanDailySeries } from "../src/lib/mealdeck-ops-math";
import { authoriseAgentTool, type TrustedAgentContext } from "../src/lib/mealdeck-agent-guardrails";
import { marketplaceConnectionsReportSchema, marketplaceConnectionStatus } from "../src/lib/mealdeck-marketplace-connections";

test("ambiguous local receipt journal resolution cannot confirm server paper", async () => {
  let confirmed = 0;
  const confirmServer = async () => { confirmed++; };
  for (const invalid of [undefined, null, false, "held", "unknown"]) {
    const resolveLocal = async () => invalid as "resolved" | "missing";
    await expect(confirmReceiptPaper({ resolveLocal, confirmServer })).rejects.toThrow();
  }
  expect(confirmed).toBe(0);
  await confirmReceiptPaper({ resolveLocal: async () => "resolved", confirmServer });
  await confirmReceiptPaper({ resolveLocal: async () => "missing", confirmServer });
  expect(confirmed).toBe(2);
});

test("loyalty eligibility cannot be inferred from truthy or missing flags", () => {
  const eligible = { paidAt: MEALDECK_LOYALTY_START, registered: true, emailVerified: true,
    isGuest: false, paymentStatus: "paid" as const, cancelledOrDisputed: false };
  expect(mealdeckOrderEarnsPoints(eligible)).toBe(true);
  for (const patch of [{ registered: "true" }, { emailVerified: 1 }, { isGuest: undefined },
    { cancelledOrDisputed: null }, { paidAt: "2026-11-28" }]) {
    expect(mealdeckOrderEarnsPoints({ ...eligible, ...patch } as typeof eligible)).toBe(false);
  }
});

test("financial chart excludes impossible dates and preserves valid leap days", () => {
  const point = (date: string) => ({ date, orders: 2, grossPence: 1499 });
  expect(cleanDailySeries(["2026-02-29", "2026-13-01", "2026-11-31", "2024-02-29",
    "2026-11-30"].map(point))).toEqual([point("2024-02-29"), point("2026-11-30")]);
});

test("AI policy denies malformed trusted scopes and all sensitive operational actions", () => {
  const staff: TrustedAgentContext = { serverAuthenticated: true, role: "staff",
    tenantId: "tenant-1", allowedLocationIds: ["luton"], verifiedOrderIds: [],
    permissions: ["analytics.read"], remainingCalls: 10 };
  for (const tool of ["marketplace.connect", "marketplace.observe", "marketplace.claim",
    "marketplace.result", "marketplace.accept", "marketplace.ready", "marketplace.handover",
    "printer.resolve", "printer.reprint", "loyalty.issue", "loyalty.adjust"]) {
    expect(authoriseAgentTool({ tool }, staff).reason).toBe("tool_denied");
  }
  expect(authoriseAgentTool({ tool: "menu.public_catalogue" },
    { ...staff, allowedLocationIds: [123] as unknown as string[] }).reason).toBe("scope_denied");
});

test("marketplace report stays strict and a heartbeat never implies order acceptance", () => {
  const stamp = "2026-11-28T07:00:00Z";
  const id = "00000000-0000-4000-8000-000000000001";
  const report = { tenantId: id, locationId: id, checkedAt: stamp, runtimeEnabled: true,
    connections: [{ connector_id: id, platform: "uber_eats", external_store_id: "fixture-store",
      label: "Fixture", enabled: true, profile_id: "fixture", profile_version: "1",
      commissioned_at: stamp, last_seen_at: stamp, health_status: "healthy", health_error_code: null,
      capabilities: { accept: true, preparing: false, ready: false, handover: false }, unresolved_commands: 0 }] };
  const parsed = marketplaceConnectionsReportSchema.parse(report);
  expect(marketplaceConnectionStatus(parsed.connections[0]!, true, stamp, Date.parse(stamp))).toBe("Recent heartbeat only");
  expect(marketplaceConnectionsReportSchema.safeParse({ ...report, connections: [
    { ...report.connections[0], token_hash: "fixture" }] }).success).toBe(false);
});
