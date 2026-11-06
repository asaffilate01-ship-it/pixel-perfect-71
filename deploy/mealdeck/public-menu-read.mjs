import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildLaunchCatalogueData } from "./catalogue-import.mjs";

export const publicMenuReadMigration = new URL(
  "./post-install-migrations/20261106170330_mealdeck_public_menu_milkcakes.sql",
  import.meta.url,
);
const template = new URL("./public-menu-read.template.sql", import.meta.url);

/** Reviewed identifiers only: names and prices always come from canonical records. */
export function buildPublicMenuReadManifest() {
  const catalogue = buildLaunchCatalogueData();
  const replacements = new Map();
  for (const group of catalogue.modifierGroups.filter((g) => g.importKind === "cross-replacement"))
    for (const option of group.options)
      replacements.set(option.targetItemId, { group: group.id, option: option.id });
  return {
    version: 1,
    priceRevision: catalogue.priceRevision,
    items: catalogue.brands.flatMap((brand) =>
      brand.sections.flatMap((section) =>
        section.items.map((item) => ({
          sku: item.id,
          brand: brand.id,
          groups: item.canonicalOptionGroupIds,
          ...(replacements.has(item.id) ? { replacement: replacements.get(item.id) } : {}),
        })),
      ),
    ),
    groups: catalogue.modifierGroups.map((group) => ({
      id: group.id,
      options: group.options.map((option) => ({
        id: option.id,
        allowed: option.available !== false,
      })),
    })),
  };
}

/** Generate a NEW migration for an explicitly reviewed source change, never a runtime allowlist. */
export function renderPublicMenuReadSql() {
  const manifest = JSON.stringify(buildPublicMenuReadManifest());
  const hash = createHash("sha256").update(manifest).digest("hex");
  const replacements = {
    __SOURCE_SHA256__: hash,
    __SOURCE_MANIFEST__: "'" + manifest.replaceAll("'", "''") + "'",
  };
  return readFileSync(template, "utf8")
    .replace(
      /^-- Template only[^\n]*/,
      "-- Generated with Supabase CLI: mealdeck_public_menu_milkcakes.",
    )
    .replace(/__SOURCE_[A-Z0-9_]+__/g, (key) => {
      if (!(key in replacements)) throw new Error("Unexpected public menu template placeholder");
      return replacements[key];
    });
}

/** Return the frozen, reviewed migration. Runtime catalogue edits never rewrite it. */
export function buildPublicMenuReadSql() {
  return readFileSync(publicMenuReadMigration, "utf8");
}

export function buildManagedPublicMenuReadSql(options) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    options.runnerOwnsTransaction !== true ||
    options.singleMigration !== true ||
    Object.keys(options).some((key) => !["runnerOwnsTransaction", "singleMigration"].includes(key))
  )
    throw new Error(
      "Public menu read installation requires one runner-owned atomic transaction and one complete migration",
    );
  const lines = buildPublicMenuReadSql().split("\n");
  const starts = lines.flatMap((line, index) => (line === "begin;" ? [index] : []));
  const ends = lines.flatMap((line, index) => (line === "commit;" ? [index] : []));
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0] >= ends[0] ||
    lines.slice(0, starts[0]).some((line) => line.trim() && !line.startsWith("--")) ||
    lines.slice(ends[0] + 1).some((line) => line.trim())
  )
    throw new Error("Unexpected public menu read migration transaction wrapper");
  return lines.filter((_, index) => index !== starts[0] && index !== ends[0]).join("\n");
}
