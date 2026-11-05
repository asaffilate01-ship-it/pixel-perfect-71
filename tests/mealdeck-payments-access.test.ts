import { describe, expect, it } from "bun:test";
import { effectiveOpsPermissions, OPS_ROLE_PERMISSIONS } from "../src/lib/mealdeck-ops-access";
import type { OpsAccess } from "../src/lib/mealdeck-ops-browser";

const tenant = "00000000-0000-4000-8000-000000000001";
const location = "00000000-0000-4000-8000-000000000002";
const otherLocation = "00000000-0000-4000-8000-000000000003";
const access = (
  role: OpsAccess["role"],
  scope: string | null = location,
  grants: string[] = [],
  denies: string[] = [],
): OpsAccess => ({
  access_id: "fixture",
  tenant_id: tenant,
  tenant_name: "Fixture",
  location_id: scope,
  role,
  grant_permissions: grants,
  deny_permissions: denies,
});

describe("Terminal payment permission hints match the scoped database authority", () => {
  it("makes collection an owner/admin default without adding it to kitchen or finance roles", () => {
    expect(OPS_ROLE_PERMISSIONS.owner).toContain("payments.collect");
    expect(OPS_ROLE_PERMISSIONS.admin).toContain("payments.collect");
    for (const role of ["operations", "kitchen", "menu", "finance", "analyst", "viewer"] as const) {
      expect(OPS_ROLE_PERMISSIONS[role]).not.toContain("payments.collect");
    }
  });
  it("honours an explicit grant only in its tenant and kitchen", () => {
    const scoped = [access("kitchen", location, ["payments.collect"])];
    expect(effectiveOpsPermissions(scoped, tenant, location).has("payments.collect")).toBe(true);
    expect(effectiveOpsPermissions(scoped, tenant, otherLocation).has("payments.collect")).toBe(
      false,
    );
    expect(effectiveOpsPermissions(scoped, otherLocation, location).has("payments.collect")).toBe(
      false,
    );
    expect(effectiveOpsPermissions(scoped, tenant, null).has("payments.collect")).toBe(false);
  });
  it("lets an explicit location denial override an owner's tenant-wide permission", () => {
    const scoped = [access("owner", null), access("viewer", location, [], ["payments.collect"])];
    expect(effectiveOpsPermissions(scoped, tenant, location).has("payments.collect")).toBe(false);
    expect(effectiveOpsPermissions(scoped, tenant, otherLocation).has("payments.collect")).toBe(
      true,
    );
  });
});
