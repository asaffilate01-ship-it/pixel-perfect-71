import { describe, expect, test } from "bun:test";
import { passwordOwnerAllowed, STAFF_PASSWORD_ACCOUNTS, staffPasswordSchema } from "../src/lib/mealdeck-staff-passwords";

describe("internal password setup", () => {
  const owner = { tenant_id: "mealdeck", location_id: null, role: "owner", deny_permissions: [] };
  test("only a global owner in the current tenant can reset", () => {
    expect(passwordOwnerAllowed([owner], "mealdeck")).toBe(true);
    for (const role of ["admin", "kitchen", "menu", "viewer"]) expect(passwordOwnerAllowed([{ ...owner, role }], "mealdeck")).toBe(false);
    expect(passwordOwnerAllowed([{ ...owner, location_id: "luton" }], "mealdeck")).toBe(false);
    expect(passwordOwnerAllowed([owner], "other")).toBe(false);
    expect(passwordOwnerAllowed([owner, { ...owner, deny_permissions: ["staff.manage"] }], "mealdeck")).toBe(false);
  });
  for (const email of ["superadmin@mealdeck.co.uk", "kitchen@mealdeck.co.uk", "menu@mealdeck.co.uk", "printer@mealdeck.co.uk", "test@mealdeck.co.uk"]) {
    test(`allows only the approved ${email} account`, () => {
      expect(STAFF_PASSWORD_ACCOUNTS.some((a) => a.email === email)).toBe(true);
      expect(staffPasswordSchema.safeParse({ email, password: "fixture-password-only", confirmEmailOwnership: false }).success).toBe(true);
    });
  }
  test("rejects arbitrary accounts and injected privileges", () => {
    expect(staffPasswordSchema.safeParse({ email: "other@mealdeck.co.uk", password: "fixture-password-only", confirmEmailOwnership: false }).success).toBe(false);
    expect(staffPasswordSchema.safeParse({ email: STAFF_PASSWORD_ACCOUNTS[0].email, password: "fixture-password-only", confirmEmailOwnership: false, role: "owner" }).success).toBe(false);
  });
});