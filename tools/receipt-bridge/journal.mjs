import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { mkdir, lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

export class BridgeError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "BridgeError";
    this.code = code;
    this.status = status;
  }
}
export const hash = (value) => createHash("sha256").update(value).digest("hex");
const states = new Set(["reserved", "sending", "sent_unconfirmed", "printed", "held", "failed"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const now = () => new Date().toISOString();

async function privatePath(path, directory = false) {
  const stat = await lstat(path);
  if (
    stat.isSymbolicLink() ||
    (directory ? !stat.isDirectory() : !stat.isFile()) ||
    (stat.mode & 0o077) !== 0
  )
    throw new BridgeError("journal_path_must_be_private", 503);
  if (typeof process.getuid === "function" && stat.uid !== process.getuid())
    throw new BridgeError("journal_owner_mismatch", 503);
}

/** fsync file, atomic rename, fsync directory. Failure stops printing. */
async function persist(directory, state) {
  const path = join(directory, "state.json");
  const temporary = join(directory, ".state-" + randomUUID() + ".tmp");
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(JSON.stringify(state) + "\n", "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } finally {
    if (handle) await handle.close();
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

function validateState(state) {
  if (
    !state ||
    state.schemaVersion !== 1 ||
    !uuid.test(state.bridgeId) ||
    !Array.isArray(state.pairs) ||
    state.pairs.length > 20 ||
    !state.jobs ||
    typeof state.jobs !== "object" ||
    Array.isArray(state.jobs) ||
    Object.keys(state.jobs).length > 50000
  )
    throw new BridgeError("journal_corrupt", 503);
  for (const pair of state.pairs)
    if (!/^[a-f0-9]{64}$/.test(pair.tokenHash) || typeof pair.origin !== "string")
      throw new BridgeError("journal_corrupt", 503);
  for (const [key, job] of Object.entries(state.jobs))
    if (
      !uuid.test(key) ||
      key !== job.jobId ||
      !uuid.test(job.orderId) ||
      !/^[a-f0-9]{64}$/.test(job.payloadHash) ||
      !states.has(job.status) ||
      !Number.isInteger(job.copyNumber) ||
      job.copyNumber < 1 ||
      job.copyNumber > 100 ||
      !Array.isArray(job.history) ||
      job.history.length > 12
    )
      throw new BridgeError("journal_corrupt", 503);
  return state;
}

export class Journal {
  static async open(directory) {
    const root = resolve(directory);
    await mkdir(root, { recursive: true, mode: 0o700 });
    await privatePath(root, true);
    const lockPath = join(root, "bridge.lock");
    let lock;
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if (error.code === "EEXIST")
        throw new BridgeError("bridge_already_running_or_stale_lock", 503);
      throw error;
    }
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: now() }) + "\n");
      await lock.sync();
      let state;
      let identity;
      try {
        await privatePath(join(root, "identity.json"));
        identity = JSON.parse(await readFile(join(root, "identity.json"), "utf8"));
        if (identity.schemaVersion !== 1 || !uuid.test(identity.bridgeId))
          throw new BridgeError("journal_identity_corrupt", 503);
      } catch (error) {
        if (error.code !== "ENOENT")
          throw error instanceof BridgeError
            ? error
            : new BridgeError("journal_identity_corrupt", 503);
      }
      try {
        await privatePath(join(root, "state.json"));
        if ((await lstat(join(root, "state.json"))).size > 64 * 1024 * 1024)
          throw new BridgeError("journal_too_large", 503);
        const data = await readFile(join(root, "state.json"), "utf8");
        if (Buffer.byteLength(data) > 64 * 1024 * 1024)
          throw new BridgeError("journal_too_large", 503);
        state = validateState(JSON.parse(data));
      } catch (error) {
        if (error.code !== "ENOENT")
          throw error instanceof BridgeError ? error : new BridgeError("journal_corrupt", 503);
        if (identity) throw new BridgeError("journal_missing_do_not_reinitialize", 503);
        state = { schemaVersion: 1, bridgeId: randomUUID(), pairs: [], jobs: {} };
      }
      if (identity && identity.bridgeId !== state.bridgeId)
        throw new BridgeError("journal_identity_mismatch", 503);
      if (!identity) {
        if (Object.keys(state.jobs).length || state.pairs.length)
          throw new BridgeError("journal_identity_missing", 503);
        const marker = await open(join(root, "identity.json"), "wx", 0o600);
        try {
          await marker.writeFile(
            JSON.stringify({ schemaVersion: 1, bridgeId: state.bridgeId }) + "\n",
          );
          await marker.sync();
        } finally {
          await marker.close();
        }
      }
      const journal = new Journal(root, lock, state);
      // Neither a restart nor reconnect may replay work that might have reached
      // a printer. Even reserved-but-incomplete jobs require operator review.
      for (const job of Object.values(state.jobs))
        if (job.status === "reserved" || job.status === "sending") {
          job.status = "held";
          job.updatedAt = now();
          job.resolution = null;
          job.history.push({
            at: job.updatedAt,
            event: "restart_hold",
            reason: "The previous send did not finish durably.",
          });
        }
      await persist(root, state);
      return journal;
    } catch (error) {
      await lock.close();
      await unlink(lockPath).catch(() => {});
      throw error;
    }
  }
  constructor(directory, lock, state) {
    this.directory = directory;
    this.lock = lock;
    this.state = state;
    this.tail = Promise.resolve();
    this.failed = false;
  }
  async mutate(action) {
    const result = this.tail.then(async () => {
      if (this.failed) throw new BridgeError("journal_unavailable_restart_required", 503);
      const next = structuredClone(this.state);
      const value = action(next);
      try {
        await persist(this.directory, next);
      } catch (error) {
        this.failed = true;
        throw new BridgeError("journal_write_failed_printing_stopped", 503);
      }
      this.state = next;
      return value;
    });
    this.tail = result.catch(() => {});
    return result;
  }
  get bridgeId() {
    return this.state.bridgeId;
  }
  get(jobId) {
    return this.state.jobs[jobId] ? structuredClone(this.state.jobs[jobId]) : null;
  }
  all() {
    return Object.values(this.state.jobs).map((job) => structuredClone(job));
  }
  authenticate(token, origin) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const digest = Buffer.from(hash(token), "hex");
    const pair = this.state.pairs.find(
      (entry) =>
        entry.origin === origin && timingSafeEqual(Buffer.from(entry.tokenHash, "hex"), digest),
    );
    return pair ? pair.tokenHash : null;
  }
  async pair(origin) {
    const token = randomBytes(32).toString("base64url");
    await this.mutate((state) => {
      if (state.pairs.length >= 20) throw new BridgeError("pair_limit_reached", 409);
      state.pairs.push({ tokenHash: hash(token), origin, createdAt: now() });
    });
    return token;
  }
  async revokePairs() {
    await this.mutate((state) => {
      state.pairs = [];
    });
  }
  async close() {
    await this.tail;
    await this.lock.close();
    await unlink(join(this.directory, "bridge.lock"));
  }
}
