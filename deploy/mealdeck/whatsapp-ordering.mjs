import { readFileSync } from "node:fs";

export function buildWhatsappOrderingSql() {
  return readFileSync(
    new URL(
      "./post-install-migrations/20261107071449_mealdeck_whatsapp_ordering.sql",
      import.meta.url,
    ),
    "utf8",
  );
}

export function buildManagedWhatsappOrderingSql(options) {
  if (
    !options ||
    options.runnerOwnsTransaction !== true ||
    options.singleMigration !== true ||
    Object.keys(options).some((key) => !["runnerOwnsTransaction", "singleMigration"].includes(key))
  ) {
    throw new Error(
      "WhatsApp installation requires one runner-owned atomic transaction and one complete migration",
    );
  }
  const lines = buildWhatsappOrderingSql().split("\n");
  const starts = lines.flatMap((line, i) => (line === "begin;" ? [i] : []));
  const ends = lines.flatMap((line, i) => (line === "commit;" ? [i] : []));
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0] >= ends[0] ||
    lines.slice(0, starts[0]).some((line) => line.trim() && !line.startsWith("--")) ||
    lines.slice(ends[0] + 1).some((line) => line.trim())
  ) {
    throw new Error("Unexpected WhatsApp transaction wrapper");
  }
  return lines.filter((_, i) => i !== starts[0] && i !== ends[0]).join("\n");
}
