import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildLaunchCatalogueData } from "./catalogue-import.mjs";

export const includedDrinkStockMigration = new URL(
  "./post-install-migrations/20261106190457_mealdeck_included_drink_stock.sql",
  import.meta.url,
);

/** Reviewed stable IDs, never runtime product-name matching or caller-provided targets. */
export function buildIncludedDrinkStockManifest() {
  const catalogue = buildLaunchCatalogueData();
  const bindings = [];
  for (const brandId of ["tavo-chicken", "skorch-burgers"]) {
    const brand = catalogue.brands.find((row) => row.id === brandId);
    if (!brand) throw new Error("Included drink brand missing");
    const items = new Set(
      brand.sections.flatMap((section) => section.items.map((item) => item.id)),
    );
    for (const suffix of ["included-meal-drink", "kids-included-drink"]) {
      const groupId = `${brandId}-${suffix}`;
      const group = catalogue.modifierGroups.find((row) => row.id === groupId);
      if (!group?.options.length) throw new Error("Included drink group missing");
      for (const option of group.options) {
        if (!option.id.startsWith(groupId + "-"))
          throw new Error("Unexpected included drink source ID");
        const sku = `${brandId}-cans-drinks-${option.id.slice(groupId.length + 1)}`;
        if (!items.has(sku))
          throw new Error("Included drink has no reviewed standalone stock item");
        bindings.push({ option: option.id, group: groupId, sku, brand: brandId });
      }
    }
  }
  if (bindings.length !== 30 || new Set(bindings.map((row) => row.option)).size !== bindings.length)
    throw new Error("Review changes to included drink stock bindings before generating SQL");
  return { version: 1, bindings };
}

export function renderIncludedDrinkStockSql() {
  const manifest = JSON.stringify(buildIncludedDrinkStockManifest());
  let sql = readFileSync(new URL("./included-drink-stock.template.sql", import.meta.url), "utf8")
    .replace("__SOURCE_SHA256__", createHash("sha256").update(manifest).digest("hex"))
    .replace("__SOURCE_MANIFEST__", "'" + manifest.replaceAll("'", "''") + "'");
  const functions = new Map(
    [
      ...sql.matchAll(/create or replace function ([a-z_.]+)\([\s\S]*?\bas \$\$([\s\S]*?)\$\$;/g),
    ].map((match) => [match[1], createHash("md5").update(match[2]).digest("hex")]),
  );
  sql = sql.replace(/__BODY_([A-Z_]+)__/g, (_, key) => {
    const names = {
      BINDINGS: "mealdeck_private.included_drink_stock_bindings",
      AVAILABLE: "mealdeck_private.included_drink_stock_available",
      PRICE: "mealdeck_private.price_checkout_lines",
      PUBLIC: "public.mealdeck_public_menu",
    };
    const hash = functions.get(names[key]);
    if (!hash) throw new Error("Missing included drink function hash");
    return hash;
  });
  return sql;
}

export function buildIncludedDrinkStockSql() {
  return readFileSync(includedDrinkStockMigration, "utf8");
}

export function buildManagedIncludedDrinkStockSql(options) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    options.runnerOwnsTransaction !== true ||
    options.singleMigration !== true ||
    Object.keys(options).some((key) => !["runnerOwnsTransaction", "singleMigration"].includes(key))
  )
    throw new Error(
      "Included drink stock requires one runner-owned atomic transaction and one complete migration",
    );
  const lines = buildIncludedDrinkStockSql().split("\n");
  const starts = lines.flatMap((line, index) => (line === "begin;" ? [index] : []));
  const ends = lines.flatMap((line, index) => (line === "commit;" ? [index] : []));
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0] >= ends[0] ||
    lines.slice(0, starts[0]).some((line) => line.trim() && !line.startsWith("--")) ||
    lines.slice(ends[0] + 1).some((line) => line.trim())
  )
    throw new Error("Unexpected included drink stock transaction wrapper");
  return lines.filter((_, index) => index !== starts[0] && index !== ends[0]).join("\n");
}
