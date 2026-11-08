import { readFileSync } from "node:fs";

export const milkcakeOfferOperation = new URL(
  "./operations/20261108_milkcake_99p_offer.sql",
  import.meta.url,
);

export function buildMilkcakeOfferSql() {
  return readFileSync(milkcakeOfferOperation, "utf8");
}

/** Submit the complete operation once in the runner's atomic transaction. */
export function buildManagedMilkcakeOfferSql(options) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    options.runnerOwnsTransaction !== true ||
    options.singleMigration !== true ||
    Object.keys(options).some((key) => !["runnerOwnsTransaction", "singleMigration"].includes(key))
  )
    throw new Error(
      "Milkcake offer requires one runner-owned atomic transaction and one complete operation",
    );
  const lines = buildMilkcakeOfferSql().split("\n");
  const starts = lines.flatMap((line, index) => (line === "begin;" ? [index] : []));
  const ends = lines.flatMap((line, index) => (line === "commit;" ? [index] : []));
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0] >= ends[0] ||
    lines.slice(0, starts[0]).some((line) => line.trim() && !line.startsWith("--")) ||
    lines.slice(ends[0] + 1).some((line) => line.trim())
  )
    throw new Error("Unexpected milkcake offer transaction wrapper");
  return lines.filter((_, index) => index !== starts[0] && index !== ends[0]).join("\n");
}
