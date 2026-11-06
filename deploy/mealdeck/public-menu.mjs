import { readFileSync } from "node:fs";

export const publicMenuMigration = new URL(
  "./post-install-migrations/20261106105124_mealdeck_public_launch_catalogue.sql",
  import.meta.url,
);
export function buildPublicMenuSql() {
  return readFileSync(publicMenuMigration, "utf8");
}
