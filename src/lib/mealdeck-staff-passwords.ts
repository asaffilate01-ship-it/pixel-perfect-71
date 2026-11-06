import { z } from "zod";

export const STAFF_PASSWORD_ACCOUNTS = [
  { email: "superadmin@mealdeck.co.uk", id: "35c23ce5-d169-4db7-a4c4-090142b08da3" },
  { email: "kitchen@mealdeck.co.uk", id: "d4b45fa9-b8fa-4652-a17a-f871bdf7a009" },
  { email: "menu@mealdeck.co.uk", id: "3488e8e2-f981-4ef7-b242-7044125e0326" },
  { email: "printer@mealdeck.co.uk", id: "835b3ff7-a2da-46a7-b4b9-c9f7fd1c0d59" },
  { email: "test@mealdeck.co.uk", id: "d5485abe-fc34-40cf-aa1f-9765307a2c51" },
] as const;

export const staffPasswordSchema = z.strictObject({
  email: z.enum(STAFF_PASSWORD_ACCOUNTS.map((account) => account.email)),
  password: z.string().min(12).max(128),
  confirmEmailOwnership: z.boolean(),
});

/**
 * Cheap pre-check used before any privileged account lookup: the caller must hold
 * an enabled global owner row. The tenant binding in passwordOwnerAllowed still
 * decides which MealDeck tenant that ownership applies to.
 */
export function hasGlobalOwner(accesses: unknown): boolean {
  const result = z.array(z.object({
    tenant_id: z.string(), location_id: z.string().nullable(), role: z.string(),
    deny_permissions: z.array(z.string()),
  })).safeParse(accesses);
  return result.success &&
    result.data.some((a) => a.location_id === null && a.role === "owner") &&
    !result.data.some((a) => a.deny_permissions.includes("staff.manage"));
}

export function passwordOwnerAllowed(accesses: unknown, tenantId: string): boolean {
  const result = z.array(z.object({
    tenant_id: z.string(), location_id: z.string().nullable(), role: z.string(),
    deny_permissions: z.array(z.string()),
  })).safeParse(accesses);
  return result.success &&
    result.data.some((a) => a.tenant_id === tenantId && a.location_id === null && a.role === "owner") &&
    !result.data.some((a) => a.tenant_id === tenantId && a.deny_permissions.includes("staff.manage"));
}