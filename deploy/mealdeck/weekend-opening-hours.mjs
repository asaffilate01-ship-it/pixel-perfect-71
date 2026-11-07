import { readFileSync } from "node:fs";

export const weekendOpeningHoursMigration = new URL(
  "./post-install-migrations/20261107105708_mealdeck_weekend_3pm_opening.sql",
  import.meta.url,
);

export function buildWeekendOpeningHoursSql() {
  return readFileSync(weekendOpeningHoursMigration, "utf8");
}

export function buildManagedWeekendOpeningHoursSql(options) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    options.runnerOwnsTransaction !== true ||
    options.singleMigration !== true ||
    Object.keys(options).some((key) => !["runnerOwnsTransaction", "singleMigration"].includes(key))
  )
    throw new Error(
      "Weekend opening hours require one runner-owned atomic transaction and one complete migration",
    );
  const lines = buildWeekendOpeningHoursSql().split("\n");
  const starts = lines.flatMap((line, index) => (line === "begin;" ? [index] : []));
  const ends = lines.flatMap((line, index) => (line === "commit;" ? [index] : []));
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0] >= ends[0] ||
    lines.slice(0, starts[0]).some((line) => line.trim() && !line.startsWith("--")) ||
    lines.slice(ends[0] + 1).some((line) => line.trim())
  )
    throw new Error("Unexpected weekend opening hours transaction wrapper");
  return lines.filter((_, index) => index !== starts[0] && index !== ends[0]).join("\n");
}
