import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  launchMenuBrands,
  LAUNCH_ITEM_PRICE_PENCE,
  LAUNCH_UPGRADE_PRICE_PENCE,
  LAUNCH_CROSS_UPGRADE_PRICE_PENCE,
} from "../../src/lib/launch-menu-catalogue.ts";

const expectedBrands = ["loadd", "moktl", "skorch-burgers", "souvano", "tavo-chicken"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sourceIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const template = new URL("./catalogue-import.template.sql", import.meta.url);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sqlString = (value) => "'" + value.replaceAll("'", "''") + "'";

function requireValue(condition, message) {
  if (!condition) throw new Error("MealDeck launch catalogue: " + message);
}

function text(value, max, label) {
  requireValue(typeof value === "string" && value.trim().length > 0 && value.length <= max, label);
}

/** Stable RFC 9562 UUIDv5, scoped by the actual existing tenant UUID. */
export function launchModifierDatabaseId(tenantId, kind, sourceId) {
  requireValue(uuidPattern.test(tenantId), "a real tenant UUID is required");
  requireValue(["group", "option"].includes(kind), "unknown modifier record kind");
  requireValue(
    typeof sourceId === "string" && sourceIdPattern.test(sourceId),
    "invalid stable source ID",
  );
  const namespace = Buffer.from(tenantId.replaceAll("-", ""), "hex");
  const bytes = createHash("sha1")
    .update(namespace)
    .update("mealdeck-launch-v1:" + kind + ":" + sourceId)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

/** All names, item prices and source modifiers come from the website catalogue. */
export function buildLaunchCatalogueData() {
  const source = structuredClone(launchMenuBrands);
  requireValue(
    JSON.stringify(source.map((brand) => brand.id).sort()) === JSON.stringify(expectedBrands),
    "exactly the five approved launch brands are required",
  );
  const seen = new Set();
  const unique = (id) => {
    requireValue(
      typeof id === "string" && sourceIdPattern.test(id) && !seen.has(id),
      "duplicate or invalid source ID",
    );
    seen.add(id);
  };
  const modifierGroups = [];
  const brands = source.map((brand) => {
    text(brand.name, 140, "invalid brand name");
    const groupIds = new Set(brand.optionGroups.map((group) => group.id));
    for (const group of brand.optionGroups) {
      unique(group.id);
      requireValue(group.options.length > 0 && group.options.length <= 100, "invalid option count");
      const name =
        brand.name + " · " + group.label + (group.id.includes("-kids-") ? " (kids meals)" : "");
      text(name, 140, "modifier group name too long");
      for (const option of group.options) {
        unique(option.id);
        text(option.label, 140, "invalid option label");
        requireValue(
          Number.isSafeInteger(option.pricePence) &&
            [0, LAUNCH_UPGRADE_PRICE_PENCE].includes(option.pricePence),
          "unapproved modifier price",
        );
      }
      if (group.when) {
        const parent = brand.optionGroups.find((entry) => entry.id === group.when.groupId);
        requireValue(
          parent &&
            group.when.optionIds.every((id) => parent.options.some((option) => option.id === id)),
          "unresolved conditional choice",
        );
      }
      modifierGroups.push({
        ...group,
        name,
        brandId: brand.id,
        importKind: "source",
        minSelect: group.required && !group.when ? 1 : 0,
        maxSelect: group.kind === "single" ? 1 : group.options.length,
      });
    }
    const sectionIds = new Set();
    const sections = brand.sections.map((section) => {
      requireValue(
        sourceIdPattern.test(section.id) && !sectionIds.has(section.id),
        "duplicate or invalid section ID",
      );
      sectionIds.add(section.id);
      text(section.title, 140, "invalid category name");
      const items = section.items.map((item) => {
        unique(item.id);
        text(item.name, 140, "invalid item name");
        requireValue(
          Number.isSafeInteger(item.pricePence) && item.pricePence === LAUNCH_ITEM_PRICE_PENCE,
          "unapproved initial item price",
        );
        requireValue(
          item.optionGroupIds.every((id) => groupIds.has(id)),
          "unresolved item modifier group",
        );
        const description = [section.description, item.description].filter(Boolean).join("\n\n");
        requireValue(description.length <= 2000, "combined item description too long");
        return {
          ...item,
          importDescription: description,
          prepKind: brand.id === "moktl" || section.id === "cans-drinks" ? "drink" : "prep",
        };
      });
      return { ...section, items };
    });
    const { optionGroups: _groups, ...record } = brand;
    return { ...record, sections };
  });

  // Named replacement choices are draft price records only. They are not linked
  // unconditionally to dishes: the server must enforce the existing replacement
  // and included-side rules before these can become live checkout modifiers.
  for (const target of [
    {
      brandId: "loadd",
      slot: "side",
      sections: ["loaded-fries", "loaded-mac-cheese"],
      name: "Load’d side replacements",
    },
    {
      brandId: "moktl",
      slot: "drink",
      sections: ["mocktail-lounge"],
      name: "Moktl drink replacements",
    },
  ]) {
    const brand = source.find((entry) => entry.id === target.brandId);
    const id = "cross-" + target.slot + "-replacement";
    unique(id);
    const options = brand.sections
      .filter((section) => target.sections.includes(section.id))
      .flatMap((section) =>
        section.items.map((item) => ({
          id: id + "-" + item.id,
          label: item.name + (target.slot === "side" ? " · " + section.title : ""),
          pricePence: LAUNCH_CROSS_UPGRADE_PRICE_PENCE,
          targetBrandId: brand.id,
          targetItemId: item.id,
          sourceRefs: item.sourceRefs,
        })),
      );
    for (const option of options) {
      unique(option.id);
      text(option.label, 140, "invalid replacement option label");
    }
    modifierGroups.push({
      id,
      name: target.name,
      label: target.name,
      importKind: "cross-replacement",
      kind: "single",
      required: false,
      minSelect: 0,
      maxSelect: 1,
      slot: target.slot,
      options,
      sourceRefs: brand.sourceRefs,
    });
  }
  return {
    schemaVersion: 1,
    profile: "mealdeck-independent-v1",
    currency: "GBP",
    approvedOn: "2026-11-05",
    initialItemPricePence: LAUNCH_ITEM_PRICE_PENCE,
    optionalUpgradePricePence: LAUNCH_UPGRADE_PRICE_PENCE,
    crossBrandReplacementPricePence: LAUNCH_CROSS_UPGRADE_PRICE_PENCE,
    publication: "draft",
    conditionalRulesModule: "src/lib/launch-menu-upsells.ts",
    crossReplacementLinks: "not imported; requires the verified server substitution adapter",
    brands,
    modifierGroups,
  };
}

export function launchCatalogueCounts(data = buildLaunchCatalogueData()) {
  return {
    brands: data.brands.length,
    categories: data.brands.reduce((count, brand) => count + brand.sections.length, 0),
    items: data.brands.reduce(
      (count, brand) =>
        count + brand.sections.reduce((sum, section) => sum + section.items.length, 0),
      0,
    ),
    modifierGroups: data.modifierGroups.length,
    modifierOptions: data.modifierGroups.reduce((count, group) => count + group.options.length, 0),
    itemGroupLinks: data.brands.reduce(
      (count, brand) =>
        count +
        brand.sections.reduce(
          (sum, section) =>
            sum + section.items.reduce((total, item) => total + item.optionGroupIds.length, 0),
          0,
        ),
      0,
    ),
  };
}

export function buildLaunchCatalogueJson() {
  return JSON.stringify(buildLaunchCatalogueData(), null, 2) + "\n";
}

function importBody(options) {
  requireValue(
    options && typeof options === "object" && !Array.isArray(options),
    "explicit existing tenant, kitchen and station UUIDs are required",
  );
  for (const key of ["tenantId", "locationId", "stationId"])
    requireValue(
      typeof options[key] === "string" && uuidPattern.test(options[key]),
      "invalid or missing " + key,
    );
  const data = buildLaunchCatalogueData();
  const sourceHash = sha256(JSON.stringify(data));
  for (const group of data.modifierGroups) {
    group.databaseId = launchModifierDatabaseId(options.tenantId, "group", group.id);
    for (const option of group.options)
      option.databaseId = launchModifierDatabaseId(options.tenantId, "option", option.id);
  }
  const json = JSON.stringify(data);
  const tag = "$md_catalogue_" + sourceHash.slice(0, 16) + "$";
  requireValue(!json.includes(tag), "SQL block delimiter conflicts with source content");
  const replacements = {
    __TARGET_TENANT_UUID__: sqlString(options.tenantId.toLowerCase()),
    __TARGET_KITCHEN_UUID__: sqlString(options.locationId.toLowerCase()),
    __TARGET_STATION_UUID__: sqlString(options.stationId.toLowerCase()),
    __SOURCE_JSON_SQL_LITERAL__: sqlString(json),
    __SOURCE_SHA256_SQL_LITERAL__: sqlString(sourceHash),
    __BLOCK_TAG__: tag,
  };
  return readFileSync(template, "utf8").replace(/__[A-Z0-9_]+__/g, (key) => {
    requireValue(Object.hasOwn(replacements, key), "unknown SQL template token " + key);
    return replacements[key];
  });
}

export function buildLaunchCatalogueImportSql(options) {
  requireValue(
    !options ||
      Object.keys(options).every((key) => ["tenantId", "locationId", "stationId"].includes(key)),
    "unsupported import option",
  );
  return (
    "-- MealDeck approved launch catalogue; database owner only, draft insert-only import.\nbegin;\n" +
    importBody(options) +
    "commit;\n"
  );
}

export function buildManagedLaunchCatalogueImportSql(options) {
  requireValue(
    options &&
      options.runnerOwnsTransaction === true &&
      options.singleMigration === true &&
      Object.keys(options).every((key) =>
        [
          "tenantId",
          "locationId",
          "stationId",
          "runnerOwnsTransaction",
          "singleMigration",
        ].includes(key),
      ),
    "managed execution requires one runner-owned atomic transaction and one complete migration",
  );
  return (
    "-- The runner must execute this complete import in one atomic transaction.\n-- Do not split requests or use an autocommit query tool.\n" +
    importBody(options)
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (["--json", "--check", "--managed-transaction"].includes(arg)) {
      requireValue(!flags.has(arg), "repeated CLI flag");
      flags.add(arg);
    } else {
      requireValue(
        ["--tenant", "--kitchen", "--station", "--out"].includes(arg) &&
          !values.has(arg) &&
          args[index + 1] &&
          !args[index + 1].startsWith("--"),
        "invalid CLI argument; see docs/mealdeck-launch-catalogue-import.md",
      );
      values.set(arg, args[++index]);
    }
  }
  requireValue(!(flags.has("--check") && flags.has("--json")), "choose check or JSON output");
  let output;
  if (flags.has("--json") || flags.has("--check")) {
    requireValue(
      !flags.has("--managed-transaction") && [...values.keys()].every((key) => key === "--out"),
      "JSON/check output does not take database bindings",
    );
    output = flags.has("--json")
      ? buildLaunchCatalogueJson()
      : JSON.stringify(
          {
            ...launchCatalogueCounts(),
            initialItemPricePence: LAUNCH_ITEM_PRICE_PENCE,
            optionalUpgradePricePence: LAUNCH_UPGRADE_PRICE_PENCE,
            publication: "draft",
            sourceSha256: sha256(JSON.stringify(buildLaunchCatalogueData())),
          },
          null,
          2,
        ) + "\n";
  } else {
    const binding = {
      tenantId: values.get("--tenant"),
      locationId: values.get("--kitchen"),
      stationId: values.get("--station"),
    };
    output = flags.has("--managed-transaction")
      ? buildManagedLaunchCatalogueImportSql({
          ...binding,
          runnerOwnsTransaction: true,
          singleMigration: true,
        })
      : buildLaunchCatalogueImportSql(binding);
  }
  const destination = values.get("--out");
  if (destination) {
    const target = resolve(destination);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, output, { flag: "wx", mode: 0o600 });
    console.log(
      JSON.stringify({ path: target, bytes: Buffer.byteLength(output), sha256: sha256(output) }),
    );
  } else process.stdout.write(output);
}
