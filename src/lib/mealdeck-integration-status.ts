import { z } from "zod";

export const integrationStatusSchema = z
  .strictObject({
    checkedAt: z.iso.datetime(),
    tenantId: z.uuid(),
    locationId: z.uuid(),
    mode: z.enum(["test", "live", "unconfigured"]),
    acceptingOnlineOrders: z.boolean(),
    checks: z
      .array(
        z.strictObject({
          id: z.enum([
            "database",
            "stripe",
            "checkout",
            "domain",
            "shared",
            "terminal",
            "email",
            "kitchen",
          ]),
          label: z.string().min(1).max(80),
          state: z.enum(["checked", "configured", "needs_setup", "unverified"]),
          detail: z.string().min(1).max(800),
          settings: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{1,80}$/)).max(12),
        }),
      )
      .length(8),
  })
  .refine((value) => new Set(value.checks.map((check) => check.id)).size === 8);

export type MealDeckIntegrationStatus = z.infer<typeof integrationStatusSchema>;
export type MealDeckIntegrationCheck = MealDeckIntegrationStatus["checks"][number];

export const INTEGRATION_STATE_LABELS = {
  checked: "Checked",
  configured: "Configured",
  needs_setup: "Needs setup",
  unverified: "Not verified",
} as const;
