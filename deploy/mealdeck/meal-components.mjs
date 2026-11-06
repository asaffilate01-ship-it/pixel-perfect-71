import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildLaunchCatalogueData } from "./catalogue-import.mjs";

export const mealComponentsMigration = new URL(
  "./post-install-migrations/20261106201311_mealdeck_meal_components.sql",
  import.meta.url,
);

/** Freeze reviewed source identities, never infer fulfilment from editable labels. */
export function buildMealComponentsManifest() {
  const catalogue = buildLaunchCatalogueData();
  const items = [];
  const options = [];
  const addOption = (group, option, role, replacement = false) => {
    const source = catalogue.modifierGroups.find((entry) => entry.id === group);
    if (!source?.options.some((entry) => entry.id === option))
      throw new Error("Unreviewed meal component source identity");
    options.push({
      group,
      option,
      role,
      replacement,
      kind: source.importKind === "cross-replacement" ? "cross" : "source",
    });
  };
  for (const brandId of ["tavo-chicken", "skorch-burgers"]) {
    const brand = catalogue.brands.find((entry) => entry.id === brandId);
    const mealGroup = `${brandId}-make-it-a-meal`;
    for (const section of brand.sections)
      for (const item of section.items) {
        const kids = ["kids-meal", "kids-meals"].includes(section.id);
        if (!kids && !item.optionGroupIds.includes(mealGroup)) continue;
        items.push({
          sku: item.id,
          kind: kids ? "kids" : "adult",
          mealGroup: kids ? null : mealGroup,
          upgradeGroup: `${brandId}-${kids ? "kids-meal-upgrades" : "meal-upgrades"}`,
          drinkGroup: `${brandId}-${kids ? "kids-included-drink" : "included-meal-drink"}`,
          sideGroup: null,
        });
      }
    addOption(mealGroup, `${mealGroup}-make-it-a-meal`, "meal");
    for (const group of [`${brandId}-meal-upgrades`, `${brandId}-kids-meal-upgrades`]) {
      const suffix = brandId === "tavo-chicken" ? "-upgrade" : "";
      addOption(group, `${group}-peri-salt`, "peri");
      for (const [choice, role] of [
        ["loaded-fries", "side"],
        ["loaded-mac-n-cheese", "side"],
        ["mocktail", "drink"],
        ["milkshake", "drink"],
      ])
        addOption(group, `${group}-${choice}${suffix}`, role, true);
    }
    for (const group of [`${brandId}-included-meal-drink`, `${brandId}-kids-included-drink`])
      for (const option of catalogue.modifierGroups.find((entry) => entry.id === group).options)
        addOption(group, option.id, "drink");
  }
  const souvano = catalogue.brands.find((entry) => entry.id === "souvano");
  for (const section of souvano.sections)
    for (const item of section.items) {
      const sideGroup = item.optionGroupIds.find((group) =>
        ["souvano-meal-side", "souvano-heatwave-base"].includes(group),
      );
      if (sideGroup)
        items.push({
          sku: item.id,
          kind: "side",
          sideGroup,
          mealGroup: null,
          upgradeGroup: null,
          drinkGroup: null,
        });
    }
  for (const group of ["souvano-meal-side", "souvano-heatwave-base"])
    for (const option of catalogue.modifierGroups.find((entry) => entry.id === group).options)
      addOption(group, option.id, "side");
  for (const role of ["side", "drink"]) {
    const group = `cross-${role}-replacement`;
    for (const option of catalogue.modifierGroups.find((entry) => entry.id === group).options)
      addOption(group, option.id, role, true);
  }
  if (
    items.length !== 16 ||
    options.length !== 73 ||
    new Set(items.map((item) => item.sku)).size !== 16 ||
    new Set(options.map((option) => option.option)).size !== 73
  )
    throw new Error("Review changes to the meal inclusion manifest before generating SQL");
  return { version: 1, items, options };
}

export function renderMealComponentsSql() {
  const manifest = JSON.stringify(buildMealComponentsManifest());
  let sql = readFileSync(new URL("./meal-components.template.sql", import.meta.url), "utf8")
    .replace("__SOURCE_SHA256__", createHash("sha256").update(manifest).digest("hex"))
    .replace("__SOURCE_MANIFEST__", "'" + manifest.replaceAll("'", "''") + "'");
  const names = {
    COMPONENTS: "mealdeck_private.meal_components",
    CARD: "mealdeck_ops_private.kds_order_card",
    RECEIPT: "mealdeck_ops_private.receipt_snapshot",
    PENDING: "public.mealdeck_printer_acceptance_board",
  };
  const hashes = new Map(
    [
      ...sql.matchAll(/create or replace function ([a-z_.]+)\([\s\S]*?\bas \$\$([\s\S]*?)\$\$;/g),
    ].map((match) => [match[1], createHash("md5").update(match[2]).digest("hex")]),
  );
  sql = sql.replace(/__BODY_([A-Z_]+)__/g, (_, key) => {
    const hash = hashes.get(names[key]);
    if (!hash) throw new Error("Missing meal component function hash");
    return hash;
  });
  return sql;
}

export function buildMealComponentsSql() {
  return readFileSync(mealComponentsMigration, "utf8");
}

export function buildManagedMealComponentsSql(options) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    options.runnerOwnsTransaction !== true ||
    options.singleMigration !== true ||
    Object.keys(options).some((key) => !["runnerOwnsTransaction", "singleMigration"].includes(key))
  )
    throw new Error(
      "Meal components require one runner-owned atomic transaction and one complete migration",
    );
  const lines = buildMealComponentsSql().split("\n");
  const starts = lines.flatMap((line, index) => (line === "begin;" ? [index] : []));
  const ends = lines.flatMap((line, index) => (line === "commit;" ? [index] : []));
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0] >= ends[0] ||
    lines.slice(0, starts[0]).some((line) => line.trim() && !line.startsWith("--")) ||
    lines.slice(ends[0] + 1).some((line) => line.trim())
  )
    throw new Error("Unexpected meal components transaction wrapper");
  return lines.filter((_, index) => index !== starts[0] && index !== ends[0]).join("\n");
}
