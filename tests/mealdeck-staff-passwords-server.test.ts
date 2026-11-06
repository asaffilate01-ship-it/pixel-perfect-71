import { expect, test } from "bun:test";
import { updateStaffPassword } from "../src/lib/mealdeck-staff-passwords.server";
import { STAFF_PASSWORD_ACCOUNTS } from "../src/lib/mealdeck-staff-passwords";

const tenant = "40000000-0000-4000-8000-000000000001";
const env = {
  MEALDECK_SUPABASE_URL: "https://passwordfixture.supabase.co",
  MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_password_fixture_public",
  MEALDECK_CHECKOUT_SERVER_KEY: "sb_secret_password_fixture_server",
  MEALDECK_TENANT_ID: tenant,
  MEALDECK_LUTON_LOCATION_ID: "40000000-0000-4000-8000-000000000002",
};
const request = () => new Request("https://mealdeck.co.uk/", { headers: { Authorization: "Bearer fixture-staff-token-123456789" } });
const input = { email: "kitchen@mealdeck.co.uk", password: "fixture-password-only", confirmEmailOwnership: false };
function fixture(role = "owner", email = "kitchen@mealdeck.co.uk") {
  const writes: Record<string, unknown>[] = [];
  const fetcher = (async (arg: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(typeof arg === "string" ? arg : arg instanceof URL ? arg.href : arg.url).pathname;
    if (path === "/auth/v1/user") return Response.json({ id: "40000000-0000-4000-8000-000000000003", email: "owner@example.invalid", email_confirmed_at: "2026-11-01", factors: [] });
    if (path.endsWith("mealdeck_ops_my_access")) return Response.json([{ tenant_id: tenant, location_id: null, role, deny_permissions: [] }]);
    if (path.endsWith("mealdeck_ops_staff_list")) return Response.json([]);
    if (path.includes("/admin/users/")) {
      if (init?.method === "PUT") writes.push(JSON.parse(String(init.body)));
      return Response.json({ id: STAFF_PASSWORD_ACCOUNTS[1].id, email, email_confirmed_at: null });
    }
    throw new Error("Unexpected request");
  }) as typeof fetch;
  return { fetcher, writes };
}
test("owner resets exact account without changing roles or automatically confirming email", async () => {
  const f = fixture();
  const result = await updateStaffPassword(request(), input, env, f.fetcher);
  expect(result.passwordSet).toBe(true);
  expect(f.writes).toEqual([{ password: "fixture-password-only" }]);
});
test("email confirmation requires explicit owner approval", async () => {
  const f = fixture();
  await updateStaffPassword(request(), { ...input, confirmEmailOwnership: true }, env, f.fetcher);
  expect(f.writes).toEqual([{ password: "fixture-password-only", email_confirm: true }]);
});
test("non-owner and mismatched Auth identity cannot reset", async () => {
  for (const f of [fixture("kitchen"), fixture("owner", "wrong@example.invalid")]) {
    await expect(updateStaffPassword(request(), input, env, f.fetcher)).rejects.toThrow();
    expect(f.writes.length).toBe(0);
  }
});