import { readFileSync } from "node:fs";
export const kitchenPrinterMigration = new URL(
  "./post-install-migrations/20261105090147_mealdeck_kitchen_printer.sql",
  import.meta.url,
);
export function buildKitchenPrinterSql() {
  return readFileSync(kitchenPrinterMigration, "utf8");
}
export function buildManagedKitchenPrinterSql(options) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    options.runnerOwnsTransaction !== true ||
    options.singleMigration !== true ||
    Object.keys(options).some((k) => !["runnerOwnsTransaction", "singleMigration"].includes(k))
  ) {
    throw new Error(
      "Kitchen/printer installation requires one runner-owned atomic transaction and one complete migration",
    );
  }
  const lines = buildKitchenPrinterSql().split("\n");
  if (
    lines.filter((l) => l === "begin;").length !== 1 ||
    lines.filter((l) => l === "commit;").length !== 1
  )
    throw new Error("Unexpected kitchen/printer transaction wrapper");
  return lines.filter((l) => l !== "begin;" && l !== "commit;").join("\n");
}
