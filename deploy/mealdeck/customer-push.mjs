import { readFileSync } from "node:fs";

export const customerPushMigration = new URL(
  "./post-install-migrations/20261107083903_mealdeck_customer_push.sql",
  import.meta.url,
);

export function buildCustomerPushSql() {
  return readFileSync(customerPushMigration, "utf8");
}

export function buildManagedCustomerPushSql(options) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    options.runnerOwnsTransaction !== true ||
    options.singleMigration !== true ||
    Object.keys(options).some((key) => !["runnerOwnsTransaction", "singleMigration"].includes(key))
  )
    throw new Error(
      "Customer push requires one runner-owned atomic transaction and one complete migration",
    );
  const lines = buildCustomerPushSql().split("\n");
  const starts = lines.flatMap((line, i) => (line === "begin;" ? [i] : []));
  const ends = lines.flatMap((line, i) => (line === "commit;" ? [i] : []));
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0] >= ends[0] ||
    lines.slice(0, starts[0]).some((line) => line.trim() && !line.startsWith("--")) ||
    lines.slice(ends[0] + 1).some((line) => line.trim())
  )
    throw new Error("Unexpected customer push transaction wrapper");
  return lines.filter((_, i) => i !== starts[0] && i !== ends[0]).join("\n");
}
