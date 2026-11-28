import { z } from "zod";
import { marketplaceHealthLabel } from "./mealdeck-ops-evidence";
import {
  marketplaceCapabilitiesSchema,
  marketplaceHealthErrorSchema,
  marketplacePlatformSchema,
} from "./mealdeck-marketplace-protocol";

const boundedText = (limit: number) =>
  z
    .string()
    .min(1)
    .refine((value) => [...value].length <= limit);

export const marketplaceConnectionSchema = z.strictObject({
  connector_id: z.uuid(),
  platform: marketplacePlatformSchema,
  external_store_id: boundedText(200),
  label: boundedText(120),
  enabled: z.boolean(),
  profile_id: boundedText(120),
  profile_version: boundedText(80),
  commissioned_at: z.iso.datetime({ offset: true }).nullable(),
  last_seen_at: z.iso.datetime({ offset: true }).nullable(),
  health_status: z.enum(["unconfigured", "healthy", "degraded"]),
  health_error_code: marketplaceHealthErrorSchema.nullable(),
  capabilities: marketplaceCapabilitiesSchema,
  unresolved_commands: z.number().int().min(0),
});
export const marketplaceConnectionsReportSchema = z.strictObject({
  tenantId: z.uuid(),
  locationId: z.uuid(),
  checkedAt: z.iso.datetime(),
  runtimeEnabled: z.boolean(),
  connections: z.array(marketplaceConnectionSchema).max(100),
});
export type MarketplaceConnection = z.infer<typeof marketplaceConnectionSchema>;
export type MarketplaceConnectionsReport = z.infer<typeof marketplaceConnectionsReportSchema>;

export function marketplaceConnectionStatus(
  connection: MarketplaceConnection,
  runtimeEnabled: boolean,
  checkedAt: string,
  now: number,
) {
  return marketplaceHealthLabel(connection, runtimeEnabled, checkedAt, now);
}
