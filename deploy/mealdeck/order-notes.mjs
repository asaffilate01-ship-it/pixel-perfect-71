import { readFileSync } from "node:fs";

export const orderNotesMigration = new URL(
  "./post-install-migrations/20261106191342_mealdeck_order_notes.sql",
  import.meta.url,
);

export function buildOrderNotesSql() {
  return readFileSync(orderNotesMigration, "utf8");
}

export function buildManagedOrderNotesSql(options) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    options.runnerOwnsTransaction !== true ||
    options.singleMigration !== true ||
    Object.keys(options).some((key) => !["runnerOwnsTransaction", "singleMigration"].includes(key))
  )
    throw new Error(
      "Order notes require one runner-owned atomic transaction and one complete migration",
    );
  const lines = buildOrderNotesSql().split("\n");
  const starts = lines.flatMap((line, index) => (line === "begin;" ? [index] : []));
  const ends = lines.flatMap((line, index) => (line === "commit;" ? [index] : []));
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0] >= ends[0] ||
    lines.slice(0, starts[0]).some((line) => line.trim() && !line.startsWith("--")) ||
    lines.slice(ends[0] + 1).some((line) => line.trim())
  )
    throw new Error("Unexpected order notes transaction wrapper");
  return lines.filter((_, index) => index !== starts[0] && index !== ends[0]).join("\n");
}
