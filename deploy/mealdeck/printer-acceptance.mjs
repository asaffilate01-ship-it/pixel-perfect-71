import { readFileSync } from "node:fs";

export const printerAcceptanceMigration = new URL(
  "./post-install-migrations/20261106124655_mealdeck_printer_accept_order.sql",
  import.meta.url,
);
export function buildPrinterAcceptanceSql() {
  return readFileSync(printerAcceptanceMigration, "utf8");
}
export function buildManagedPrinterAcceptanceSql(options) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    options.runnerOwnsTransaction !== true ||
    options.singleMigration !== true ||
    Object.keys(options).some((key) => !["runnerOwnsTransaction", "singleMigration"].includes(key))
  )
    throw new Error(
      "Printer acceptance requires one runner-owned atomic transaction and one complete migration",
    );
  const lines = buildPrinterAcceptanceSql().split("\n");
  const starts = lines.flatMap((line, index) => (line === "begin;" ? [index] : []));
  const ends = lines.flatMap((line, index) => (line === "commit;" ? [index] : []));
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0] >= ends[0] ||
    lines.slice(0, starts[0]).some((line) => line.trim() && !line.startsWith("--")) ||
    lines.slice(ends[0] + 1).some((line) => line.trim())
  )
    throw new Error("Unexpected printer acceptance transaction wrapper");
  return lines.filter((_, index) => index !== starts[0] && index !== ends[0]).join("\n");
}
