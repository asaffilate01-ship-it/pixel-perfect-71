import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { Journal } from "../src/journal.mjs";

const binding = {
  connectorId: "offline-test",
  platform: "uber_eats",
  externalStoreId: "synthetic-store",
};
const record = {
  fingerprint: "a".repeat(64),
  dispatched: true,
  outcome: "uncertain",
  updatedAt: new Date().toISOString(),
};

test("journal survives close/reopen and never clears a possible dispatch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mealdeck-journal-test-"));
  let journal;
  try {
    journal = await Journal.open(directory, binding);
    const id = randomUUID();
    await journal.put(id, record);
    await journal.close();
    journal = null;
    journal = await Journal.open(directory, binding);
    assert.equal(journal.get(id).dispatched, true);
    await journal.put(id, { ...record, dispatched: false, outcome: "not_applied" });
    assert.equal(journal.get(id).dispatched, true);
    await assert.rejects(
      journal.put(id, { ...record, fingerprint: "b".repeat(64) }),
      /identity_mismatch/,
    );
    const bytes = await readFile(join(directory, "commands.sqlite"));
    assert.equal(bytes.includes(Buffer.from("synthetic-store")), false);
  } finally {
    await journal?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("second worker cannot own the same directory; connector binding cannot be swapped", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mealdeck-journal-test-"));
  let journal;
  try {
    journal = await Journal.open(directory, binding);
    await assert.rejects(Journal.open(directory, binding));
    await journal.close();
    journal = null;
    await assert.rejects(
      Journal.open(directory, { ...binding, externalStoreId: "other" }),
      /identity_mismatch/,
    );
    journal = await Journal.open(directory, binding);
  } finally {
    await journal?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  "OS releases ownership after a killed process and committed dispatch remains recoverable",
  { timeout: 15_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "mealdeck-journal-crash-"));
    const id = randomUUID();
    const moduleUrl = new URL("../src/journal.mjs", import.meta.url).href;
    const script = `import { Journal } from ${JSON.stringify(moduleUrl)};
    const journal=await Journal.open(process.argv[1],JSON.parse(process.argv[2]));
    await journal.put(process.argv[3],JSON.parse(process.argv[4]));
    process.stdout.write('ready\\n'); process.stdin.resume();`;
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        script,
        directory,
        JSON.stringify(binding),
        id,
        JSON.stringify(record),
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let reopened;
    try {
      await new Promise((resolve, reject) => {
        let output = "";
        child.stdout.on("data", (chunk) => {
          output += chunk;
          if (output.includes("ready\n")) resolve();
        });
        child.once("error", reject);
        child.once("exit", (code) => reject(new Error(`fixture exited ${code}`)));
      });
      await assert.rejects(Journal.open(directory, binding));
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
      reopened = await Journal.open(directory, binding);
      assert.equal(reopened.get(id).dispatched, true);
      assert.equal(reopened.get(id).outcome, "uncertain");
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await reopened?.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
