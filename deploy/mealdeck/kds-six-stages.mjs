import { readFileSync } from "node:fs";
export const kdsSixStagesMigration = new URL(
  "./post-install-migrations/20261106093358_mealdeck_kds_six_stages.sql",
  import.meta.url,
);
export function buildKdsSixStagesSql() {
  return readFileSync(kdsSixStagesMigration, "utf8");
}
export function buildManagedKdsSixStagesSql(options) {
  if (
    !options ||
    options.runnerOwnsTransaction !== true ||
    options.singleMigration !== true ||
    Object.keys(options).some((key) => !["runnerOwnsTransaction", "singleMigration"].includes(key))
  )
    throw new Error(
      "KDS history requires one runner-owned atomic transaction and one complete migration",
    );
  const lines = buildKdsSixStagesSql().split("\n");
  if (
    lines.filter((l) => l === "begin;").length !== 1 ||
    lines.filter((l) => l === "commit;").length !== 1
  )
    throw new Error("Unexpected KDS history transaction wrapper");
  return lines.filter((l) => l !== "begin;" && l !== "commit;").join("\n");
}
