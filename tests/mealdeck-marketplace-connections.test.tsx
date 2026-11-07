import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { MarketplaceConnectionReport } from "../src/components/ops/marketplace-connections-panel";
import {
  marketplaceConnectionsReportSchema,
  marketplaceConnectionStatus,
  type MarketplaceConnectionsReport,
} from "../src/lib/mealdeck-marketplace-connections";
import { handleMarketplaceConnectionsRequest } from "../src/lib/mealdeck-marketplace-connections.server";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const report: MarketplaceConnectionsReport = {
  tenantId: id(1),
  locationId: id(2),
  checkedAt: "2026-11-07T12:00:00Z",
  runtimeEnabled: true,
  connections: [
    {
      connector_id: id(3),
      platform: "uber_eats",
      external_store_id: "fixture-store",
      label: "Fixture storefront",
      enabled: true,
      profile_id: "fixture-profile",
      profile_version: "1",
      commissioned_at: "2026-11-07T11:00:00Z",
      last_seen_at: "2026-11-07T12:00:00Z",
      health_status: "healthy",
      health_error_code: null,
      capabilities: { accept: true, preparing: false, ready: true, handover: false },
      unresolved_commands: 0,
    },
  ],
};
const env = {
  MEALDECK_SUPABASE_URL: "https://marketplacefixture.supabase.co",
  // Generated only for the injected fake transport; no issued provider key is stored.
  MEALDECK_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${randomBytes(24).toString("base64url")}`,
  MEALDECK_TENANT_ID: id(1),
  MEALDECK_LUTON_LOCATION_ID: id(2),
};
const token = "fixture-staff-token-marketplace-status";
function request(extra = {}, headers = {}) {
  return new Request("https://mealdeck.co.uk/api/ops/marketplaces", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://mealdeck.co.uk",
      Authorization: `Bearer ${token}`,
      ...headers,
    },
    body: JSON.stringify({ action: "status", tenantId: id(1), locationId: id(2), ...extra }),
  });
}
function fixture(options: { denied?: boolean; mfa?: boolean; rows?: unknown } = {}) {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    calls.push(path);
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${token}`);
    if (path === "/auth/v1/user")
      return Response.json({
        id: id(4),
        email: "owner@example.invalid",
        email_confirmed_at: "2026-11-01T12:00:00Z",
        is_anonymous: false,
        factors: options.mfa ? [{ id: id(5), factor_type: "totp", status: "verified" }] : [],
        user_metadata: { role: "owner" },
      });
    if (path === "/rest/v1/rpc/mealdeck_ops_marketplace_connections") {
      expect(JSON.parse(String(init?.body))).toEqual({ p_tenant: id(1), p_location: id(2) });
      return options.denied
        ? Response.json({ message: "mealdeck_ops_forbidden" }, { status: 403 })
        : Response.json(options.rows ?? report.connections);
    }
    throw new Error("Unexpected network call");
  }) as typeof fetch;
  return { fetcher, calls };
}

describe("marketplace connection diagnostics", () => {
  test("describes only actual configured capabilities and both platform setup states", () => {
    const html = renderToStaticMarkup(<MarketplaceConnectionReport report={report} />);
    expect(html).toContain("Uber Eats");
    expect(html).toContain("Just Eat");
    expect(html).toContain("Accept, Ready");
    expect(html).toContain("Needs setup");
    expect(html).not.toContain("Automatically delivered");
  });
  test("uncertainty, a stopped runtime, and missing contact override a healthy looking connection", () => {
    const connection = report.connections[0]!;
    expect(marketplaceConnectionStatus(connection, false)).toBe("Bridge paused");
    expect(marketplaceConnectionStatus({ ...connection, unresolved_commands: 1 }, true)).toBe(
      "Actions need checking",
    );
    expect(marketplaceConnectionStatus({ ...connection, health_status: "degraded" }, true)).toBe(
      "Check merchant device",
    );
    const html = renderToStaticMarkup(
      <MarketplaceConnectionReport report={{ ...report, runtimeEnabled: false }} />,
    );
    expect(html).toContain("original merchant screens");
  });
  test("uses verified staff identity and the scoped read-only RPC, even while runtime is off", async () => {
    const { fetcher, calls } = fixture();
    const response = await handleMarketplaceConnectionsRequest(request(), env, fetcher);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const parsed = marketplaceConnectionsReportSchema.parse(await response.json());
    expect(parsed.runtimeEnabled).toBe(false);
    expect(parsed.connections[0]?.platform).toBe("uber_eats");
    expect(calls).toEqual(["/auth/v1/user", "/rest/v1/rpc/mealdeck_ops_marketplace_connections"]);
  });
  test("rejects wrong kitchen and cross-site requests before inspecting connections", async () => {
    for (const req of [
      request({ locationId: id(8) }),
      request({}, { Origin: "https://elsewhere.invalid" }),
    ]) {
      const { fetcher, calls } = fixture();
      const response = await handleMarketplaceConnectionsRequest(req, env, fetcher);
      expect(response.status).toBe(403);
      expect(calls).toHaveLength(0);
    }
  });
  test("does not trust a user-editable owner claim when SQL denies access", async () => {
    const { fetcher } = fixture({ denied: true });
    const response = await handleMarketplaceConnectionsRequest(request(), env, fetcher);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("fixture-store");
  });
  test("enrolled MFA cannot be skipped and an unexpected secret field is never returned", async () => {
    const first = fixture({ mfa: true });
    const mfaResponse = await handleMarketplaceConnectionsRequest(request(), env, first.fetcher);
    expect(mfaResponse.status).toBe(403);
    expect(first.calls).not.toContain("/rest/v1/rpc/mealdeck_ops_marketplace_connections");
    const second = fixture({
      rows: [{ ...report.connections[0], token_hash: "never-return-this" }],
    });
    const response = await handleMarketplaceConnectionsRequest(request(), env, second.fetcher);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("never-return-this");
  });
});
