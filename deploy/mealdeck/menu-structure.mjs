import { readFileSync } from "node:fs";

export const menuStructureMigration = new URL(
  "./post-install-migrations/20261106113333_mealdeck_menu_structure_editing.sql",
  import.meta.url,
);

/** Complete owner-run standalone extension. Never contacts a database. */
export function buildMenuStructureSql() {
  return readFileSync(menuStructureMigration, "utf8");
}

/** One complete runner-owned transaction; only the known outer wrapper is removed. */
export function buildManagedMenuStructureSql(options) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    options.runnerOwnsTransaction !== true ||
    options.singleMigration !== true ||
    Object.keys(options).some((key) => !["runnerOwnsTransaction", "singleMigration"].includes(key))
  ) {
    throw new Error(
      "Menu structure installation requires one runner-owned atomic transaction and one complete migration; split or autocommit execution is not supported",
    );
  }
  const source = buildMenuStructureSql();
  const lines = source.split("\n");
  const starts = lines.flatMap((line, index) => (line === "begin;" ? [index] : []));
  const ends = lines.flatMap((line, index) => (line === "commit;" ? [index] : []));
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0] >= ends[0] ||
    lines.slice(0, starts[0]).some((line) => line.trim() && !line.startsWith("--")) ||
    lines.slice(ends[0] + 1).some((line) => line.trim())
  ) {
    throw new Error("Unexpected menu structure migration transaction wrapper");
  }
  return lines.filter((_, index) => index !== starts[0] && index !== ends[0]).join("\n");
}
