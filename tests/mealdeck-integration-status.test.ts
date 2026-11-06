import { describe, expect, test } from "bun:test";
import { handleIntegrationStatusRequest } from "../src/lib/mealdeck-integration-status.server";
import { integrationStatusSchema } from "../src/lib/mealdeck-integration-status";
import type { MealDeckRuntimeEnv } from "../src/lib/mealdeck-runtime-config";
import {
  readMealDeckStripeConfig,
  readMealDeckStripeSettingIssues,
} from "../src/lib/mealdeck-stripe.server";

const uid = (n: number) => "40000000-0000-4000-8000-" + String(n).padStart(12, "0");
const token = "fixture-staff-access-token-123456789";
const env = {
  MEALDECK_SUPABASE_URL: "https://integrationfixture.supabase.co",
  MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_integration_fixture_public",
  MEALDECK_CHECKOUT_SERVER_KEY: "sb_secret_integration_fixture_server",
  MEALDECK_TENANT_ID: uid(1),
  MEALDECK_LUTON_LOCATION_ID: uid(2),
  MEALDECK_STRIPE_SECRET_KEY: "sk_test_" + "a".repeat(32),
  MEALDECK_STRIPE_WEBHOOK_SECRET: "whsec_" + "b".repeat(32),
  MEALDECK_STRIPE_ACCOUNT_ID: "acct_fixture",
  MEALDECK_STRIPE_MODE: "test",
  MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "signed-off",
  MEALDECK_ONLINE_CHECKOUT_ENABLED: "true",
  MEALDECK_SHARED_PAYMENTS_ENABLED: "true",
  MEALDECK_GROUP_LINK_SECRET: "c".repeat(43),
  MEALDECK_TERMINAL_ENABLED: "true",
  MEALDECK_TERMINAL_INTEGRATION_APPROVED: "signed-off",
  MEALDECK_STRIPE_TERMINAL_LOCATION_ID: "tml_fixture",
  MEALDECK_STRIPE_CHECKOUT_HOST: "pay.mealdeck.co.uk",
};
function request(
  overrides: {
    origin?: string;
    authorization?: string;
    tenantId?: string;
    locationId?: string;
    extra?: object;
    method?: string;
  } = {},
) {
  return new Request("https://mealdeck.co.uk/api/ops/integrations", {
    method: overrides.method ?? "POST",
    headers: {
      Origin: overrides.origin ?? "https://mealdeck.co.uk",
      "Content-Type": "application/json",
      Authorization: overrides.authorization ?? "Bearer " + token,
    },
    ...(overrides.method === "GET"
      ? {}
      : {
          body: JSON.stringify({
            action: "status",
            tenantId: overrides.tenantId ?? uid(1),
            locationId: overrides.locationId ?? uid(2),
            ...overrides.extra,
          }),
        }),
  });
}
function fixture() {
  const calls: { host: string; path: string; method: string; body: string }[] = [];
  const state = {
    verified: true,
    anonymous: false,
    role: "owner",
    accessLocation: null as string | null,
    accessTenant: uid(1),
    denied: false,
    accountId: "acct_fixture",
    charges: true,
    country: "GB",
    locationMode: false,
    kitchenOpen: true,
    locationFails: false,
    accountFails: false,
    mfa: false,
  };
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const path = url.pathname;
    const headers = new Headers(init?.headers);
    calls.push({
      host: url.hostname,
      path,
      method: init?.method ?? "GET",
      body: String(init?.body ?? ""),
    });
    if (path === "/auth/v1/user")
      return state.verified
        ? Response.json({
            id: uid(3),
            email: "owner@example.invalid",
            email_confirmed_at: "2026-11-01T12:00:00Z",
            is_anonymous: state.anonymous,
            factors: state.mfa ? [{ id: uid(6), factor_type: "totp", status: "verified" }] : [],
            user_metadata: { role: "owner", tenant_id: uid(1) },
          })
        : Response.json({ message: "Invalid token" }, { status: 401 });
    if (path === "/rest/v1/rpc/mealdeck_ops_my_access") {
      expect(headers.get("Authorization")).toBe("Bearer " + token);
      return Response.json([
        { tenant_id: state.accessTenant, location_id: state.accessLocation, role: state.role },
      ]);
    }
    if (path === "/rest/v1/rpc/mealdeck_ops_checkout_settings") {
      expect(headers.get("Authorization")).toBe("Bearer " + token);
      expect(JSON.parse(String(init?.body))).toEqual({ p_tenant: uid(1), p_location: uid(2) });
      return state.denied
        ? Response.json({ message: "mealdeck_ops_forbidden" }, { status: 403 })
        : Response.json({ enabled: true });
    }
    if (path === "/rest/v1/rpc/mealdeck_online_checkout_status")
      return Response.json({
        channelOpen: state.kitchenOpen,
        guestCheckoutEligible: true,
        kitchen: { state: state.kitchenOpen ? "online" : "closed", collectionEstimateMinutes: 25 },
        openingOffer: {
          status: "active",
          startsAt: "2026-11-06T15:00:00Z",
          endsAt: "2026-11-08T23:00:00Z",
          timezone: "Europe/London",
          serverNow: "2026-11-06T16:00:00Z",
        },
      });
    if (url.hostname === "api.stripe.com") {
      expect(init?.method).toBe("GET");
      if (path === "/v1/account") {
        if (state.accountFails)
          throw new Error("fixture account read unavailable: " + env.MEALDECK_STRIPE_SECRET_KEY);
        return Response.json({
          id: state.accountId,
          charges_enabled: state.charges,
          country: state.country,
        });
      }
      if (path === "/v1/terminal/locations/tml_fixture") {
        if (state.locationFails) throw new Error("fixture location read unavailable");
        return Response.json({
          id: "tml_fixture",
          livemode: state.locationMode,
          address: { country: "GB" },
        });
      }
    }
    throw new Error("Unexpected request: " + url.href);
  }) as typeof fetch;
  return { fetcher, calls, state };
}
async function inspect(f: ReturnType<typeof fixture>, settings: MealDeckRuntimeEnv = env) {
  const response = await handleIntegrationStatusRequest(request(), settings, f.fetcher);
  expect(response.status).toBe(200);
  const report = integrationStatusSchema.parse(await response.json());
  const check = (id: string) => report.checks.find((row) => row.id === id)!;
  return { response, report, check };
}
describe("private payment and email setup checks", () => {
  test("public acceptance requires live mode while sandbox diagnostics remain readable", async () => {
    const f = fixture();
    expect((await inspect(f)).report.acceptingOnlineOrders).toBe(false);
    f.state.locationMode = true;
    const live = {
      ...env,
      MEALDECK_STRIPE_MODE: "live",
      MEALDECK_STRIPE_SECRET_KEY: "sk_live_" + "a".repeat(32),
    };
    expect((await inspect(f, live)).report.acceptingOnlineOrders).toBe(true);
    expect(
      (await inspect(f, { ...live, MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "" })).report
        .acceptingOnlineOrders,
    ).toBe(false);
  });
  test("rejects cross-site, oversized, unknown, unauthenticated and wrong-kitchen requests before provider inspection", async () => {
    for (const [req, status] of [
      [request({ origin: "https://other.invalid" }), 403],
      [request({ authorization: "" }), 401],
      [request({ tenantId: uid(8) }), 403],
      [request({ locationId: uid(9) }), 403],
      [request({ extra: { accountId: "acct_other" } }), 400],
      [request({ extra: { padding: "x".repeat(5000) } }), 413],
      [request({ method: "GET" }), 405],
    ] as const) {
      const f = fixture();
      const response = await handleIntegrationStatusRequest(req, env, f.fetcher);
      expect(response.status).toBe(status);
      expect(f.calls.some((call) => call.host === "api.stripe.com")).toBe(false);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect(await response.text()).not.toContain("MEALDECK_STRIPE_SECRET_KEY");
    }
  });
  test("server identity, current owner/admin role, exact scope and database denials control access", async () => {
    for (const change of [
      { verified: false },
      { anonymous: true },
      { role: "finance" },
      { role: "kitchen" },
      { accessTenant: uid(8) },
      { accessLocation: uid(9) },
      { denied: true },
      { mfa: true },
    ]) {
      const f = fixture();
      Object.assign(f.state, change);
      const response = await handleIntegrationStatusRequest(request(), env, f.fetcher);
      expect(response.status).toBe("verified" in change || "anonymous" in change ? 401 : 403);
      expect(f.calls.some((call) => call.host === "api.stripe.com")).toBe(false);
    }
  });
  test("returns a scoped report without any credential, payment creation, email send or financial write", async () => {
    const f = fixture();
    const { response, report, check } = await inspect(f);
    expect(report.acceptingOnlineOrders).toBe(false);
    expect(check("stripe").state).toBe("checked");
    expect(check("terminal").state).toBe("configured");
    expect(check("domain").state).toBe("unverified");
    expect(check("email").state).toBe("unverified");
    expect(response.headers.get("Vary")).toContain("Authorization");
    const text = JSON.stringify(report);
    for (const secret of [
      env.MEALDECK_STRIPE_SECRET_KEY,
      env.MEALDECK_STRIPE_WEBHOOK_SECRET,
      env.MEALDECK_CHECKOUT_SERVER_KEY,
      env.MEALDECK_GROUP_LINK_SECRET,
      token,
    ])
      expect(text).not.toContain(secret);
    expect(
      f.calls
        .filter((call) => call.method !== "GET")
        .every((call) =>
          [
            "/rest/v1/rpc/mealdeck_ops_my_access",
            "/rest/v1/rpc/mealdeck_ops_checkout_settings",
            "/rest/v1/rpc/mealdeck_online_checkout_status",
          ].includes(call.path),
        ),
    ).toBe(true);
    expect(
      f.calls.every((call) =>
        ["integrationfixture.supabase.co", "api.stripe.com"].includes(call.host),
      ),
    ).toBe(true);
  });
  test("a missing checkout service key can be diagnosed by an authorised owner without using it to authorise", async () => {
    const { check, report } = await inspect(fixture(), {
      ...env,
      MEALDECK_CHECKOUT_SERVER_KEY: undefined,
    });
    expect(check("database").state).toBe("checked");
    expect(check("checkout").state).toBe("needs_setup");
    expect(check("checkout").settings).toEqual(["MEALDECK_CHECKOUT_SERVER_KEY"]);
    expect(check("checkout").detail).toContain("MEALDECK_CHECKOUT_SERVER_KEY: missing or invalid");
    expect(report.acceptingOnlineOrders).toBe(false);
  });
  test("only the missing Stripe setting is listed after owner authorisation", async () => {
    for (const setting of [
      "MEALDECK_STRIPE_SECRET_KEY",
      "MEALDECK_STRIPE_WEBHOOK_SECRET",
      "MEALDECK_STRIPE_ACCOUNT_ID",
      "MEALDECK_STRIPE_MODE",
    ]) {
      const f = fixture();
      const runtime = { ...env, [setting]: undefined };
      const { report, check } = await inspect(f, runtime);
      expect(check("stripe").settings).toEqual([setting]);
      expect(check("stripe").detail).toBe(`${setting}: missing.`);
      expect(readMealDeckStripeSettingIssues(runtime)).toEqual([{ setting, status: "missing" }]);
      expect(readMealDeckStripeConfig(runtime)).toBeNull();
      expect(report.mode).toBe("unconfigured");
      expect(f.calls.some((call) => call.host === "api.stripe.com")).toBe(false);
    }
  });
  test("invalid Stripe settings report fixed names and statuses without echoing values", async () => {
    for (const [setting, value] of [
      ["MEALDECK_STRIPE_SECRET_KEY", "pk_live_fixture_value_must_not_be_echoed"],
      ["MEALDECK_STRIPE_WEBHOOK_SECRET", "wrong_webhook_value_must_not_be_echoed"],
      ["MEALDECK_STRIPE_ACCOUNT_ID", "wrong_account_value_must_not_be_echoed"],
      ["MEALDECK_STRIPE_MODE", "wrong_mode_value_must_not_be_echoed"],
    ]) {
      const f = fixture();
      const runtime = { ...env, [setting!]: value };
      const { report, check } = await inspect(f, runtime);
      expect(check("stripe").settings).toEqual([setting]);
      expect(check("stripe").detail).toBe(`${setting}: invalid.`);
      expect(readMealDeckStripeConfig(runtime)).toBeNull();
      const rendered = JSON.stringify(report);
      for (const forbidden of [
        value!,
        env.MEALDECK_STRIPE_SECRET_KEY,
        env.MEALDECK_STRIPE_WEBHOOK_SECRET,
        env.MEALDECK_STRIPE_ACCOUNT_ID,
        env.MEALDECK_CHECKOUT_SERVER_KEY,
        token,
      ])
        expect(rendered).not.toContain(forbidden);
      expect(f.calls.some((call) => call.host === "api.stripe.com")).toBe(false);
    }
  });
  test("key/mode mismatch identifies the pair and preserves exact mode validation", async () => {
    const mismatch = { ...env, MEALDECK_STRIPE_MODE: "live" };
    const { check } = await inspect(fixture(), mismatch);
    expect(check("stripe").settings).toEqual([
      "MEALDECK_STRIPE_SECRET_KEY",
      "MEALDECK_STRIPE_MODE",
    ]);
    expect(check("stripe").detail).toBe(
      "MEALDECK_STRIPE_SECRET_KEY: invalid (key/mode mismatch). MEALDECK_STRIPE_MODE: invalid (key/mode mismatch).",
    );
    expect(readMealDeckStripeConfig(mismatch)).toBeNull();
    for (const mode of [" test ", "TEST"]) {
      const runtime = { ...env, MEALDECK_STRIPE_MODE: mode };
      expect(readMealDeckStripeSettingIssues(runtime)).toEqual([
        { setting: "MEALDECK_STRIPE_MODE", status: "invalid" },
      ]);
      expect(readMealDeckStripeConfig(runtime)).toBeNull();
    }
    const trimmed = {
      ...env,
      MEALDECK_STRIPE_SECRET_KEY: ` ${env.MEALDECK_STRIPE_SECRET_KEY} `,
      MEALDECK_STRIPE_WEBHOOK_SECRET: ` ${env.MEALDECK_STRIPE_WEBHOOK_SECRET} `,
      MEALDECK_STRIPE_ACCOUNT_ID: ` ${env.MEALDECK_STRIPE_ACCOUNT_ID} `,
    };
    expect(readMealDeckStripeSettingIssues(trimmed)).toEqual([]);
    expect(readMealDeckStripeConfig(trimmed)).toMatchObject({
      secretKey: env.MEALDECK_STRIPE_SECRET_KEY,
      webhookSecret: env.MEALDECK_STRIPE_WEBHOOK_SECRET,
      accountId: env.MEALDECK_STRIPE_ACCOUNT_ID,
      livemode: false,
    });
  });
  test("pending public approval is separate from valid live payment setup", async () => {
    const f = fixture();
    f.state.locationMode = true;
    const { check, report } = await inspect(f, {
      ...env,
      MEALDECK_STRIPE_SECRET_KEY: "sk_live_" + "d".repeat(32),
      MEALDECK_STRIPE_MODE: "live",
      MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "pending",
    });
    expect(check("stripe").state).toBe("checked");
    expect(check("stripe").settings).toEqual([]);
    expect(check("checkout").state).toBe("unverified");
    expect(check("checkout").settings).toEqual([]);
    expect(check("checkout").detail).toContain("Public checkout approval is pending");
    expect(check("checkout").detail).toContain("Keep it pending");
    expect(check("checkout").detail).not.toContain("MEALDECK_CHECKOUT_SERVER_KEY");
    expect(report.mode).toBe("live");
    expect(report.acceptingOnlineOrders).toBe(false);
  });
  test("real checkout faults remain specific while public approval stays pending", async () => {
    for (const [setting, value, status] of [
      ["MEALDECK_CHECKOUT_SERVER_KEY", undefined, "missing or invalid"],
      ["MEALDECK_ONLINE_CHECKOUT_ENABLED", "false", "disabled"],
      ["MEALDECK_ONLINE_CHECKOUT_ENABLED", undefined, "missing"],
      ["MEALDECK_ONLINE_CHECKOUT_ENABLED", "TRUE", "invalid"],
      ["MEALDECK_STRIPE_CHECKOUT_HOST", "unapproved.invalid", "invalid"],
    ] as const) {
      const { check } = await inspect(fixture(), {
        ...env,
        MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "pending",
        [setting]: value,
      });
      expect(check("checkout").state).toBe("needs_setup");
      expect(check("checkout").settings).toEqual([setting]);
      expect(check("checkout").detail).toContain(`${setting}: ${status}.`);
      expect(check("checkout").detail).toContain("Public checkout approval is pending");
      expect(check("checkout").settings).not.toContain("MEALDECK_CHECKOUT_INTEGRATION_APPROVED");
    }
  });
  test("disabled or mismatched Stripe configuration never makes provider calls or reports readiness", async () => {
    for (const change of [
      { MEALDECK_STRIPE_WEBHOOK_SECRET: undefined },
      { MEALDECK_STRIPE_MODE: "live" },
      { MEALDECK_STRIPE_SECRET_KEY: "invalid" },
    ]) {
      const f = fixture();
      const { report, check } = await inspect(f, { ...env, ...change });
      expect(check("stripe").state).toBe("needs_setup");
      expect(report.mode).toBe("unconfigured");
      expect(report.acceptingOnlineOrders).toBe(false);
      expect(f.calls.some((call) => call.host === "api.stripe.com")).toBe(false);
    }
  });
  test("account mismatch, disabled charges and failed reads block the status even with valid configuration", async () => {
    for (const change of [
      { accountId: "acct_other" },
      { charges: false },
      { accountFails: true },
    ]) {
      const f = fixture();
      Object.assign(f.state, change);
      const { check, report } = await inspect(f);
      expect(check("stripe").state).toBe("needs_setup");
      expect(report.acceptingOnlineOrders).toBe(false);
      expect(JSON.stringify(report)).not.toContain(env.MEALDECK_STRIPE_SECRET_KEY);
    }
  });
  test("a closed kitchen remains closed when provider configuration is complete", async () => {
    const f = fixture();
    f.state.kitchenOpen = false;
    const { report, check } = await inspect(f);
    expect(check("stripe").state).toBe("checked");
    expect(report.acceptingOnlineOrders).toBe(false);
    expect(check("kitchen").state).toBe("needs_setup");
  });
  test("a wrong-mode or unreadable Terminal location does not erase a successful account check", async () => {
    for (const change of [{ locationMode: true }, { locationFails: true }, { country: "US" }]) {
      const f = fixture();
      Object.assign(f.state, change);
      const { check } = await inspect(f);
      expect(check("stripe").state).toBe("checked");
      expect(check("terminal").state).toBe("needs_setup");
    }
  });
  test("live-mode simulated readers are never reported configured", async () => {
    const f = fixture();
    f.state.locationMode = true;
    const { check, report } = await inspect(f, {
      ...env,
      MEALDECK_STRIPE_MODE: "live",
      MEALDECK_STRIPE_SECRET_KEY: "sk_live_" + "d".repeat(32),
      MEALDECK_TERMINAL_SIMULATED: "true",
    });
    expect(report.mode).toBe("live");
    expect(check("terminal").state).toBe("needs_setup");
  });
  test("configured Resend hook is described without claiming delivery or contacting Resend", async () => {
    const f = fixture();
    const { check } = await inspect(f, {
      ...env,
      MEALDECK_AUTH_EMAIL_ENABLED: "true",
      RESEND_API_KEY: "re_" + "e".repeat(32),
      MEALDECK_AUTH_EMAIL_FROM: "accounts@mealdeck.co.uk",
      MEALDECK_AUTH_EMAIL_HOOK_SECRET: "whsec_" + Buffer.alloc(32, 4).toString("base64"),
    });
    expect(check("email").state).toBe("configured");
    expect(check("email").detail).toContain("No email was sent");
    expect(f.calls.some((call) => call.host.includes("resend"))).toBe(false);
  });
  test("missing independent backend and conflicting project configuration cannot expose settings", async () => {
    for (const settings of [
      {},
      {
        ...env,
        DISHBEE_SUPABASE_URL: "https://other.supabase.co",
        DISHBEE_SUPABASE_ANON_KEY: "sb_publishable_other_project_key",
      },
    ]) {
      const f = fixture();
      const response = await handleIntegrationStatusRequest(request(), settings, f.fetcher);
      expect(response.status).toBe(503);
      expect(f.calls.length).toBe(0);
    }
  });
});
