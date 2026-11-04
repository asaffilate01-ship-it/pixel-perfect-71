import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const repository = resolve(directory, "../..");
const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
const digest = (source) => createHash("sha256").update(source).digest("hex");

/**
 * Assemble a fresh-project installer without contacting any database.
 * The seven historical migrations are hash-pinned and remain untouched.
 * Their sole explicit transaction wrapper is folded into ONE outer transaction
 * so an error in the final runtime overlay rolls back the whole installation.
 */
export function buildStandaloneSql() {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.profile !== "mealdeck-independent-v1" ||
    !Array.isArray(manifest.sources) ||
    manifest.sources.length !== 9
  ) {
    throw new Error("Unexpected MealDeck standalone manifest");
  }
  const seen = new Set();
  const parts = manifest.sources.map((entry) => {
    if (typeof entry.path !== "string" || seen.has(entry.path)) {
      throw new Error("Invalid or duplicate MealDeck profile source");
    }
    seen.add(entry.path);
    const path = resolve(repository, entry.path);
    if (!path.startsWith(repository + sep)) throw new Error("Profile source escaped repository");
    let source = readFileSync(path, "utf8");
    const sha = digest(source);
    const historical = entry.path.startsWith("supabase/migrations/");
    if (historical && (!entry.sha256 || entry.sha256 !== sha)) {
      throw new Error(`Historical migration differs from reviewed profile: ${entry.path}`);
    }
    const begins = source.match(/^[\t ]*begin;[\t ]*$/gim) ?? [];
    const commits = source.match(/^[\t ]*commit;[\t ]*$/gim) ?? [];
    if (entry.normalizeTopLevelTransaction === true) {
      if (
        entry.path !== "supabase/migrations/20261104210005_mealdeck_ops_kds_workspace.sql" ||
        begins.length !== 1 ||
        commits.length !== 1
      ) {
        throw new Error("Unexpected transaction wrapper in historical KDS source");
      }
      source = source.replace(
        /^[\t ]*(?:begin|commit);[\t ]*$/gim,
        "-- Top-level transaction boundary owned by the standalone installer.",
      );
    } else if (begins.length || commits.length) {
      throw new Error(`Unreviewed transaction boundary in ${entry.path}`);
    }
    if (entry.normalizeAnalyticsDayAlias === true) {
      if (
        entry.path !== "supabase/migrations/20261102191500_mealdeck_ops_recipe_finance.sql" ||
        !historical
      ) {
        throw new Error("Unreviewed historical analytics alias normalization");
      }
      const definitions =
        source.match(
          /create or replace function public\.mealdeck_ops_analytics\(\n[\s\S]*?\n\$\$;/g,
        ) ?? [];
      const originalAlias = "select o2.paid_at::date day,count(*) orders,sum(o2.total_pence) gross";
      if (
        definitions.length !== 1 ||
        definitions[0].split(originalAlias).length !== 2 ||
        source.split(originalAlias).length !== 2
      ) {
        throw new Error("Unexpected historical analytics definition");
      }
      // Preserve the historical file/hash. Normalize exactly one reserved-word
      // alias in the generated installer, with function validation always ON.
      source = source.replace(
        originalAlias,
        'select o2.paid_at::date as "day",count(*) orders,sum(o2.total_pence) gross',
      );
    }
    if (!source.trim()) throw new Error(`Empty MealDeck profile source: ${entry.path}`);
    return `-- Source: ${entry.path}\n-- SHA-256: ${sha}\n${source.trim()}\n`;
  });
  return [
    "-- MealDeck independent backend v1. FRESH dedicated Supabase projects only.",
    "-- Generated locally; no project, secret, connection or paid-order authority is inferred.",
    "begin;",
    "set local lock_timeout='5s';",
    "set local statement_timeout='120s';",
    "set local check_function_bodies=on;",
    ...parts,
    "commit;",
    "",
  ].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const sql = buildStandaloneSql();
  if (args.length === 0 || (args.length === 1 && args[0] === "--check")) {
    process.stdout.write(
      `Verified MealDeck standalone profile: 9 sources, one transaction, ${Buffer.byteLength(sql)} bytes.\n`,
    );
  } else if (args.length === 2 && args[0] === "--out" && args[1]) {
    const target = resolve(args[1]);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, sql, { flag: "wx", mode: 0o600 });
    process.stdout.write(`Wrote standalone installer to ${target}\nSHA-256: ${digest(sql)}\n`);
  } else {
    throw new Error("Usage: node deploy/mealdeck/build.mjs [--check | --out <new-file.sql>]");
  }
}
