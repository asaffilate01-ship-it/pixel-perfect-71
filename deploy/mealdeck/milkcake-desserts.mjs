import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildLaunchCatalogueData } from "./catalogue-import.mjs";

const template = new URL("./milkcake-desserts.template.sql", import.meta.url);
const expectedBrands = ["loadd", "moktl", "skorch-burgers", "souvano", "tavo-chicken"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sqlString = (value) => "'" + value.replaceAll("'", "''") + "'";

function requireValue(condition, message) {
  if (!condition) throw new Error("MealDeck milkcake desserts: " + message);
}

/** Only the ten explicitly approved standalone desserts; no full-catalogue rerun. */
export function buildMilkcakeDessertsData() {
  const catalogue = buildLaunchCatalogueData();
  requireValue(
    JSON.stringify(catalogue.brands.map((brand) => brand.id).sort()) ===
      JSON.stringify(expectedBrands),
    "exactly the five launch brands are required",
  );
  const brands = catalogue.brands.map((brand) => {
    const section = brand.sections.find((entry) => entry.id === "desserts");
    requireValue(
      section?.title === "Desserts" && section.items.length === 2,
      "dessert section missing",
    );
    const items = ["biscoff", "oreo"].map((flavour) => {
      const item = section.items.find(
        (entry) => entry.id === `${brand.id}-desserts-${flavour}-milkcake`,
      );
      requireValue(
        item &&
          item.name === `${flavour === "biscoff" ? "Biscoff" : "Oreo"} Milkcake` &&
          item.pricePence === 399 &&
          item.canonicalOptionGroupIds.length === 0 &&
          !item.priceVariants?.length &&
          item.prepKind === "prep",
        "only the approved £3.99 standalone milkcakes may be imported",
      );
      return {
        sku: item.id,
        name: item.name,
        description: item.importDescription,
        pricePence: item.pricePence,
      };
    });
    return { id: brand.id, category: { slug: section.id, name: section.title }, items };
  });
  return {
    profile: "mealdeck-independent-v1",
    currency: "GBP",
    approvedOn: "2026-11-06",
    revision: "owner-desserts-20261106",
    brands,
  };
}

function importBody(options) {
  requireValue(
    options && typeof options === "object" && !Array.isArray(options),
    "explicit existing tenant, kitchen and station UUIDs are required",
  );
  for (const key of ["tenantId", "locationId", "stationId"])
    requireValue(
      typeof options[key] === "string" && uuidPattern.test(options[key]),
      "invalid " + key,
    );
  const data = JSON.stringify(buildMilkcakeDessertsData());
  const sourceHash = createHash("sha256").update(data).digest("hex");
  const tag = "$md_milkcakes_" + sourceHash.slice(0, 16) + "$";
  requireValue(!data.includes(tag), "unexpected SQL block delimiter in source");
  const replacements = {
    __TARGET_TENANT_UUID__: sqlString(options.tenantId.toLowerCase()),
    __TARGET_KITCHEN_UUID__: sqlString(options.locationId.toLowerCase()),
    __TARGET_STATION_UUID__: sqlString(options.stationId.toLowerCase()),
    __SOURCE_JSON_SQL_LITERAL__: sqlString(data),
    __SOURCE_SHA256_SQL_LITERAL__: sqlString(sourceHash),
    __BLOCK_TAG__: tag,
  };
  return readFileSync(template, "utf8").replace(/__[A-Z0-9_]+__/g, (key) => {
    requireValue(Object.hasOwn(replacements, key), "unexpected SQL template token " + key);
    return replacements[key];
  });
}

export function buildMilkcakeDessertsImportSql(options) {
  requireValue(
    !options ||
      Object.keys(options).every((key) => ["tenantId", "locationId", "stationId"].includes(key)),
    "unsupported import option",
  );
  return (
    "-- MealDeck approved milkcakes; bounded insert-only publication.\nbegin;\n" +
    importBody(options) +
    "commit;\n"
  );
}

/** The caller must submit this entire result in one runner-owned transaction. */
export function buildManagedMilkcakeDessertsImportSql(options) {
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
    "-- Execute this complete reviewed dessert addition in one atomic transaction.\n" +
    importBody(options)
  );
}
