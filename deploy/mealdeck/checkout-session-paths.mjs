import { readFileSync } from "node:fs";

export const checkoutSessionPathsMigration = new URL(
  "./post-install-migrations/20261106180458_mealdeck_checkout_session_paths.sql",
  import.meta.url,
);

/** Apply after the unchanged checkout-domain extension, as a separate migration. */
export function buildCheckoutSessionPathsSql() {
  return readFileSync(checkoutSessionPathsMigration, "utf8");
}

export function buildManagedCheckoutSessionPathsSql(options) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    options.runnerOwnsTransaction !== true ||
    options.singleMigration !== true ||
    Object.keys(options).some((key) => !["runnerOwnsTransaction", "singleMigration"].includes(key))
  )
    throw new Error(
      "Checkout path installation requires one runner-owned atomic transaction and one complete migration",
    );
  const lines = buildCheckoutSessionPathsSql().split("\n");
  const starts = lines.flatMap((line, index) => (line === "begin;" ? [index] : []));
  const ends = lines.flatMap((line, index) => (line === "commit;" ? [index] : []));
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0] >= ends[0] ||
    lines.slice(0, starts[0]).some((line) => line.trim() && !line.startsWith("--")) ||
    lines.slice(ends[0] + 1).some((line) => line.trim())
  )
    throw new Error("Unexpected checkout path transaction wrapper");
  return lines.filter((_, index) => index !== starts[0] && index !== ends[0]).join("\n");
}
