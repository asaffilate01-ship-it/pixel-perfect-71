import { readFileSync } from "node:fs";

export const localDriverDeliveryMigration = new URL(
  "./post-install-migrations/20261107230000_mealdeck_local_driver_delivery.sql",
  import.meta.url,
);

/** Source-only installer; this never connects to or mutates a hosted database. */
export function buildLocalDriverDeliverySql() {
  return readFileSync(localDriverDeliveryMigration, "utf8");
}

/** Use exactly one transaction-owned migration runner, never split DDL calls. */
export function buildManagedLocalDriverDeliverySql(options) {
  if (!options || typeof options !== "object" || Array.isArray(options) ||
    options.runnerOwnsTransaction !== true || options.singleMigration !== true ||
    Object.keys(options).some((key) => !["runnerOwnsTransaction", "singleMigration"].includes(key))) {
    throw new Error("Own-driver delivery requires one atomic, runner-owned migration");
  }
  const lines = buildLocalDriverDeliverySql().split("\n");
  const boundaries = lines.map((line, index) => ({line,index})).filter((entry) =>
    entry.line === "begin;" || entry.line === "commit;");
  if (boundaries.length !== 2 || boundaries[0].line !== "begin;" ||
    boundaries[1].line !== "commit;" ||
    lines.slice(0, boundaries[0].index).some((line) => line.trim() && !line.startsWith("--")) ||
    lines.slice(boundaries[1].index + 1).some((line) => line.trim())) {
    throw new Error("Unexpected own-driver delivery transaction boundary");
  }
  return lines.filter((_, index) =>
    index !== boundaries[0].index && index !== boundaries[1].index).join("\n");
}
