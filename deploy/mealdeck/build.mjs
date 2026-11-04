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

/**
 * Build the SAME installation for a migration runner that owns the transaction.
 * This is an explicit execution contract, not a transaction detection mechanism:
 * the entire result must be one migration request inside one runner-owned
 * transaction. Autocommit, per-source requests and chunked execution are refused.
 * No source SQL, permissions, guards, or SET LOCAL statements are rewritten.
 */
export function buildManagedMigrationSql(options) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    options.runnerOwnsTransaction !== true ||
    options.singleMigration !== true ||
    Object.keys(options).some((key) => !["runnerOwnsTransaction", "singleMigration"].includes(key))
  ) {
    throw new Error(
      "Managed installation requires one runner-owned atomic transaction and one complete migration; split or autocommit execution is not supported",
    );
  }
  const standalone = buildStandaloneSql();
  const lines = standalone.split("\n");
  if (
    lines[2] !== "begin;" ||
    lines.at(-2) !== "commit;" ||
    lines.at(-1) !== "" ||
    (standalone.match(/^[\t ]*(?:begin|commit);[\t ]*$/gim) ?? []).length !== 2
  ) {
    throw new Error("Unexpected builder-owned standalone transaction boundaries");
  }
  // Remove only the known builder-owned lines. Never strip transaction words
  // from SQL bodies or split the reviewed installation into separate sources.
  const body = [...lines.slice(0, 2), ...lines.slice(3, -2), ""].join("\n");
  return [
    "-- MANAGED TRANSACTION ONLY: the migration runner must own ONE atomic transaction.",
    "-- Submit this ENTIRE file as ONE migration; the runner commits only after all SQL succeeds.",
    "-- Do not run with autocommit, split requests, individual source files, or per-statement commits.",
    body,
  ].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const supplied = process.argv.slice(2);
  const managedFlags = supplied.filter((argument) => argument === "--managed-transaction");
  if (managedFlags.length > 1) throw new Error("Specify --managed-transaction only once");
  const managed = managedFlags.length === 1;
  const args = supplied.filter((argument) => argument !== "--managed-transaction");
  const sql = managed
    ? buildManagedMigrationSql({ runnerOwnsTransaction: true, singleMigration: true })
    : buildStandaloneSql();
  if (args.length === 0 || (args.length === 1 && args[0] === "--check")) {
    process.stdout.write(
      managed
        ? `Verified MealDeck managed profile: 9 sources, ONE runner-owned atomic migration required, ${Buffer.byteLength(sql)} bytes.\n`
        : `Verified MealDeck standalone profile: 9 sources, one transaction, ${Buffer.byteLength(sql)} bytes.\n`,
    );
  } else if (args.length === 2 && args[0] === "--out" && args[1]) {
    const target = resolve(args[1]);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, sql, { flag: "wx", mode: 0o600 });
    process.stdout.write(
      `Wrote ${managed ? "managed-transaction" : "standalone"} installer to ${target}\nSHA-256: ${digest(sql)}\n`,
    );
    if (managed) {
      process.stdout.write(
        "Execution contract: submit the ENTIRE file to ONE migration call whose runner owns the atomic transaction. Never use autocommit or split requests.\n",
      );
    }
  } else {
    throw new Error(
      "Usage: node deploy/mealdeck/build.mjs [--managed-transaction] [--check | --out <new-file.sql>]",
    );
  }
}
