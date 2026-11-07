import { readFileSync } from "node:fs";

export const marketplaceConnectorsMigration = new URL(
  "./post-install-migrations/20261107114103_mealdeck_marketplace_connectors.sql",
  import.meta.url,
);

/** Additive independent-project upgrade. This function never contacts a database. */
export function buildMarketplaceConnectorsSql() {
  return readFileSync(marketplaceConnectorsMigration, "utf8");
}

export function buildManagedMarketplaceConnectorsSql(options) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    options.runnerOwnsTransaction !== true ||
    options.singleMigration !== true ||
    Object.keys(options).some((key) => !["runnerOwnsTransaction", "singleMigration"].includes(key))
  )
    throw new Error(
      "Marketplace connectors require one runner-owned atomic transaction and one complete migration",
    );
  const lines = buildMarketplaceConnectorsSql().split("\n");
  const starts = lines.flatMap((line, index) => (line === "begin;" ? [index] : []));
  const ends = lines.flatMap((line, index) => (line === "commit;" ? [index] : []));
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0] >= ends[0] ||
    lines.slice(0, starts[0]).some((line) => line.trim() && !line.startsWith("--")) ||
    lines.slice(ends[0] + 1).some((line) => line.trim())
  )
    throw new Error("Unexpected marketplace connector transaction wrapper");
  return lines.filter((_, index) => index !== starts[0] && index !== ends[0]).join("\n");
}
