import { DatabaseSync } from "node:sqlite";
import { chmod, lstat, mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { UUID, hash, requireThat } from "./contracts.mjs";

async function privateFile(path) {
  try {
    const stat = await lstat(path);
    requireThat(stat.isFile() && !stat.isSymbolicLink(), "bridge_error");
    await chmod(path, 0o600);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

/** FULL synchronous SQLite commits precede external clicks; holds survive a process/power restart. */
export class Journal {
  static async open(directory, binding) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    requireThat(
      (await lstat(directory)).isDirectory() && !(await lstat(directory)).isSymbolicLink(),
      "bridge_error",
    );
    await chmod(directory, 0o700);
    // A separate rollback-journal database supplies a process lifetime lock. SQLite/the OS
    // releases it on a crash; never unlink another process's lock using a racy PID check.
    const ownerPath = join(directory, "ownership.sqlite");
    await privateFile(ownerPath);
    const owner = new DatabaseSync(ownerPath);
    await chmod(ownerPath, 0o600);
    let database;
    try {
      owner.exec("PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=0; BEGIN EXCLUSIVE;");
      const dbPath = join(directory, "commands.sqlite");
      await privateFile(dbPath);
      database = new DatabaseSync(dbPath);
      await chmod(dbPath, 0o600);
      database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        CREATE TABLE IF NOT EXISTS binding (id INTEGER PRIMARY KEY CHECK(id=1), fingerprint TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS commands (
          id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, dispatched INTEGER NOT NULL CHECK(dispatched IN(0,1)),
          outcome TEXT NOT NULL CHECK(outcome IN('confirmed','not_applied','uncertain','unsupported')),
          updated_at TEXT NOT NULL
        ) STRICT;
      `);
      const fingerprint = hash(binding);
      const existing = database.prepare("SELECT fingerprint FROM binding WHERE id=1").get();
      requireThat(!existing || existing.fingerprint === fingerprint, "identity_mismatch");
      if (!existing)
        database.prepare("INSERT INTO binding(id,fingerprint) VALUES(1,?)").run(fingerprint);
      return new Journal(directory, database, owner);
    } catch (error) {
      database?.close();
      owner.close();
      throw error;
    }
  }
  constructor(directory, database, owner) {
    this.directory = directory;
    this.database = database;
    this.owner = owner;
  }
  get(id) {
    requireThat(UUID.test(id), "bridge_error");
    const row = this.database
      .prepare("SELECT fingerprint, dispatched, outcome, updated_at FROM commands WHERE id=?")
      .get(id);
    return row
      ? {
          fingerprint: row.fingerprint,
          dispatched: row.dispatched === 1,
          outcome: row.outcome,
          updatedAt: row.updated_at,
        }
      : null;
  }
  async put(id, value) {
    requireThat(UUID.test(id) && /^[a-f0-9]{64}$/.test(value.fingerprint), "bridge_error");
    requireThat(
      ["confirmed", "not_applied", "uncertain", "unsupported"].includes(value.outcome),
      "bridge_error",
    );
    const prior = this.get(id);
    requireThat(!prior || prior.fingerprint === value.fingerprint, "identity_mismatch");
    // Once any dispatch was possible, neither a later error nor a profile change can clear that fact.
    const dispatched = prior?.dispatched === true || value.dispatched === true;
    this.database
      .prepare(
        `INSERT INTO commands(id,fingerprint,dispatched,outcome,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET dispatched=excluded.dispatched,outcome=excluded.outcome,updated_at=excluded.updated_at`,
      )
      .run(id, value.fingerprint, dispatched ? 1 : 0, value.outcome, value.updatedAt);
  }
  async health(value) {
    const path = join(this.directory, "health.json");
    const temporary = join(this.directory, `health-${randomUUID()}.tmp`);
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  }
  async close() {
    try {
      this.database.close();
    } finally {
      this.owner.close();
    }
  }
}

export async function readHealth(directory) {
  const raw = await readFile(join(directory, "health.json"), "utf8");
  requireThat(raw.length < 10_000, "bridge_error");
  return JSON.parse(raw);
}
