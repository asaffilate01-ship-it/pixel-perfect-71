import { readFileSync } from "node:fs";
export const kdsWorkflowMigration = new URL(
  "./post-install-migrations/20261106093151_mealdeck_kds_done_history.sql",
  import.meta.url,
);
export function buildKdsWorkflowSql() {
  return readFileSync(kdsWorkflowMigration, "utf8");
}
