import { readFileSync } from "node:fs";

export const kerbsideContactMigration = new URL(
  "./post-install-migrations/20261106173037_mealdeck_kerbside_pickup_contact.sql",
  import.meta.url,
);

export function buildKerbsideContactSql() {
  return readFileSync(kerbsideContactMigration, "utf8");
}

export function buildManagedKerbsideContactSql(options) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    options.runnerOwnsTransaction !== true ||
    options.singleMigration !== true ||
    Object.keys(options).some((key) => !["runnerOwnsTransaction", "singleMigration"].includes(key))
  )
    throw new Error(
      "Kerbside contact requires one runner-owned atomic transaction and one complete migration",
    );
  const lines = buildKerbsideContactSql().split("\n");
  const starts = lines.flatMap((line, index) => (line === "begin;" ? [index] : []));
  const ends = lines.flatMap((line, index) => (line === "commit;" ? [index] : []));
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0] >= ends[0] ||
    lines.slice(0, starts[0]).some((line) => line.trim() && !line.startsWith("--")) ||
    lines.slice(ends[0] + 1).some((line) => line.trim())
  )
    throw new Error("Unexpected kerbside contact transaction wrapper");
  return lines.filter((_, index) => index !== starts[0] && index !== ends[0]).join("\n");
}
