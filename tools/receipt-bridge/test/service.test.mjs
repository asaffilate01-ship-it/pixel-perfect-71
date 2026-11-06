import test from "node:test";
import assert from "node:assert/strict";
import { readFile, unlink, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { Journal } from "../journal.mjs";
import { TransportError } from "../transport.mjs";
import { fixture, job, harness, ORIGIN, JOB, NEXT_JOB } from "./fixtures.mjs";

test("pairing requires the trusted origin and one-use code; only token hashes persist", async (t) => {
  const h = await harness(t);
  const code = h.bridge.openPairing();
  await assert.rejects(h.bridge.pair("https://attacker.test", code), {
    code: "origin_not_allowed",
  });
  await assert.rejects(h.bridge.pair(ORIGIN, "wrong"), { code: "pairing_code_invalid" });
  const { token } = await h.bridge.pair(ORIGIN, code);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(h.bridge.authorize(ORIGIN, "Bearer " + token));
  assert.throws(() => h.bridge.authorize(ORIGIN, "Bearer forged"), { code: "pairing_required" });
  assert.throws(() => h.bridge.authorize("https://www.mealdeck.co.uk", "Bearer " + token), {
    code: "origin_not_allowed",
  });
  await assert.rejects(h.bridge.pair(ORIGIN, code), { code: "pairing_closed" });
  const state = await readFile(join(h.directory, "state.json"), "utf8");
  assert.equal(state.includes(token), false);
  assert.equal(state.includes(code), false);
  await h.journal.revokePairs();
  assert.throws(() => h.bridge.authorize(ORIGIN, "Bearer " + token), { code: "pairing_required" });
  h.bridge.openPairing();
  h.bridge.pairing.expires = 0;
  await assert.rejects(h.bridge.pair(ORIGIN, "anything"), { code: "pairing_closed" });
  h.bridge.openPairing();
  for (let n = 0; n < 5; n++) await assert.rejects(h.bridge.pair(ORIGIN, "wrong"));
  await assert.rejects(h.bridge.pair(ORIGIN, "wrong"), { code: "pairing_closed" });
});

test("canonical verified receipt sends once; replay, reconnect and new id cannot print same copy again", async (t) => {
  const h = await harness(t);
  const result = await h.bridge.submit(job(), "pair-hash", "ephemeral-staff-token");
  assert.equal(result.status, "sent_unconfirmed");
  assert.equal(h.writes.length, 1);
  assert.equal(h.lookups[0].accessToken, "ephemeral-staff-token");
  assert.equal((await h.bridge.submit(job(), "pair-hash")).replayed, true);
  assert.equal(h.lookups.length, 1);
  assert.equal(h.writes.length, 1);
  await h.restart();
  assert.equal(h.bridge.get(JOB).status, "sent_unconfirmed");
  await h.bridge.submit(job(), "pair-hash");
  assert.equal(h.writes.length, 1);
  await assert.rejects(h.bridge.submit(job(fixture(), NEXT_JOB), "pair-hash", "token"), {
    code: "receipt_copy_already_attempted",
  });
  const changed = fixture();
  changed.customerName = "Edited";
  await assert.rejects(h.bridge.submit(job(changed), "pair-hash"), {
    code: "job_payload_conflict",
  });
  await assert.rejects(h.bridge.submit(job(fixture(), JOB.toUpperCase()), "pair-hash"), {
    code: "invalid_print_job",
  });
  const persisted = await readFile(join(h.directory, "state.json"), "utf8");
  for (const forbidden of [
    "ephemeral-staff-token",
    "Test Customer",
    "Ford",
    "Cruncher",
    "No gherkin",
  ])
    assert.equal(persisted.includes(forbidden), false, forbidden);
});

test("browser-edited receipt and a rejected claim never reach the writer", async (t) => {
  const h = await harness(t);
  const changed = fixture();
  changed.customerName = "Fake paid receipt";
  await assert.rejects(h.bridge.submit(job(changed), "pair-hash", "token"), {
    code: "canonical_receipt_mismatch",
  });
  assert.equal(h.writes.length, 0);
  assert.equal(h.journal.get(JOB), null);
  h.bridge.fetchClaimedReceipt = async () => {
    throw new Error("Backend unavailable");
  };
  await assert.rejects(h.bridge.submit(job(), "pair-hash", "token"));
  assert.equal(h.writes.length, 0);
  assert.equal(h.journal.get(JOB), null);
});

test("canonical order numbering participates in payload matching and one-copy replay protection", async (t) => {
  const h = await harness(t);
  h.canonical.orderNumber = "0001";
  for (const value of ["0002", null, undefined]) {
    const altered = structuredClone(h.canonical);
    if (value === undefined) delete altered.orderNumber;
    else altered.orderNumber = value;
    await assert.rejects(h.bridge.submit(job(altered), "pair-hash", "token"), {
      code: "canonical_receipt_mismatch",
    });
  }
  assert.equal(h.writes.length, 0);
  assert.equal(h.journal.get(JOB), null);
  await h.bridge.submit(job(h.canonical), "pair-hash", "token");
  assert.equal(h.writes.length, 1);
  assert.match(h.writes[0].toString("ascii"), /ORDER 0001/);
  assert.match(h.writes[0].toString("ascii"), /Collection code: 0427/);
  assert.equal((await h.bridge.submit(job(h.canonical), "pair-hash", "token")).replayed, true);
  assert.equal(h.writes.length, 1);
  await assert.rejects(
    h.bridge.submit(job({ ...h.canonical, orderNumber: "0002" }), "pair-hash", "token"),
    {
      code: "job_payload_conflict",
    },
  );
  assert.equal(h.writes.length, 1);
});

test("dropping or changing a person's canonical packing name cannot print a different receipt", async (t) => {
  const h = await harness(t);
  h.canonical.packingPlan.bags[0].name = "Amer";
  for (const name of ["Jay", undefined]) {
    const changed = structuredClone(h.canonical);
    if (name === undefined) delete changed.packingPlan.bags[0].name;
    else changed.packingPlan.bags[0].name = name;
    await assert.rejects(h.bridge.submit(job(changed), "pair-hash", "token"), {
      code: "canonical_receipt_mismatch",
    });
  }
  assert.equal(h.writes.length, 0);
  assert.equal(h.journal.get(JOB), null);
  await h.bridge.submit(job(h.canonical), "pair-hash", "token");
  assert.equal(h.writes.length, 1);
  assert.match(h.writes[0].toString("ascii"), /For: Amer/);
  const persisted = await readFile(join(h.directory, "state.json"), "utf8");
  assert.equal(persisted.includes("Amer"), false);
});

test("uncertain send is held and blocks further work until an explicit audited resolution", async (t) => {
  let attempts = 0;
  const h = await harness(t, {
    writer: async (_bytes, beforeWrite) => {
      await beforeWrite();
      attempts++;
      throw new TransportError(true);
    },
  });
  assert.equal((await h.bridge.submit(job(), "pair-hash", "token")).status, "held");
  await h.restart();
  await h.bridge.submit(job(), "pair-hash");
  assert.equal(attempts, 1);
  assert.equal(h.bridge.recovery().jobs[0].jobId, JOB);
  assert.equal(h.bridge.recovery().jobs[0].status, "held");
  assert.equal(Object.hasOwn(h.bridge.recovery().jobs[0], "receipt"), false);
  const other = fixture();
  other.orderId = "eeeeeeee-5555-4555-8555-555555555555";
  h.canonical = other;
  await assert.rejects(h.bridge.submit(job(other, NEXT_JOB), "pair-hash", "token"), {
    code: "printer_recovery_required",
  });
  await assert.rejects(h.bridge.resolve(JOB, { outcome: "not_printed", reason: "" }, "pair-hash"), {
    code: "operator_reason_required",
  });
  assert.equal(
    (
      await h.bridge.resolve(
        JOB,
        { outcome: "not_printed", reason: "Inspected paper; order did not print" },
        "pair-hash",
      )
    ).status,
    "failed",
  );
  assert.equal(attempts, 1, "resolution must never itself write to a printer");
  assert.deepEqual(h.bridge.recovery(), { jobs: [] });
  const history = h.journal.get(JOB).history.at(-1);
  assert.equal(history.event, "operator_resolution");
  assert.equal(history.pairId, "pair-hash");
  await assert.rejects(
    h.bridge.resolve(JOB, { outcome: "printed", reason: "Change my mind" }, "pair-hash"),
    { code: "print_resolution_already_recorded" },
  );
});

test("one explicit new copy follows paper confirmation; unresolved original cannot be reprinted", async (t) => {
  const h = await harness(t);
  await h.bridge.submit(job(), "pair-hash", "token");
  const copy = fixture();
  copy.copyNumber = 2;
  copy.reprintOf = JOB;
  copy.reprintReason = "Original damaged";
  h.canonical = copy;
  await assert.rejects(h.bridge.submit(job(copy, NEXT_JOB), "pair-hash", "token"), {
    code: "reprint_requires_resolved_original",
  });
  await h.bridge.resolve(
    JOB,
    { outcome: "printed", reason: "Paper seen and checked" },
    "pair-hash",
  );
  assert.equal(
    (await h.bridge.submit(job(copy, NEXT_JOB), "pair-hash", "token")).status,
    "sent_unconfirmed",
  );
  assert.equal(h.writes.length, 2);
  assert.match(h.writes[1].toString(), /REPRINT - COPY 2/);
  await h.bridge.submit(job(copy, NEXT_JOB), "pair-hash");
  assert.equal(h.writes.length, 2);
});

test("a connection failure cannot be marked printed or automatically retried", async (t) => {
  let attempts = 0;
  const h = await harness(t, {
    writer: async () => {
      attempts++;
      throw new TransportError(false);
    },
  });
  assert.equal((await h.bridge.submit(job(), "pair-hash", "token")).status, "failed");
  await h.bridge.submit(job(), "pair-hash");
  assert.equal(attempts, 1);
  await assert.rejects(
    h.bridge.resolve(JOB, { outcome: "printed", reason: "Unproven print" }, "pair-hash"),
    { code: "print_resolution_not_allowed" },
  );
});

test("exclusive private journal recovers incomplete writes to held and never silently resets missing state", async (t) => {
  const h = await harness(t);
  await assert.rejects(Journal.open(h.directory), { code: "bridge_already_running_or_stale_lock" });
  await h.bridge.submit(job(), "pair-hash", "token");
  await h.journal.mutate((state) => {
    state.jobs[JOB].status = "sending";
  });
  await h.restart();
  assert.equal(h.bridge.get(JOB).status, "held");
  assert.equal(h.writes.length, 1);
  assert.equal(h.journal.get(JOB).history.at(-1).event, "restart_hold");
  await h.journal.close();
  h.journal = null;
  await unlink(join(h.directory, "state.json"));
  await assert.rejects(Journal.open(h.directory), { code: "journal_missing_do_not_reinitialize" });
});

test("corrupt or public-readable journal stops startup", async (t) => {
  const h = await harness(t);
  await h.journal.close();
  h.journal = null;
  await writeFile(join(h.directory, "state.json"), "{broken", { mode: 0o600 });
  await assert.rejects(Journal.open(h.directory), { code: "journal_corrupt" });
  await chmod(h.directory, 0o755);
  await assert.rejects(Journal.open(h.directory), { code: "journal_path_must_be_private" });
  await chmod(h.directory, 0o700);
});

test("an unexpected adapter failure leaves an explicit hold rather than permitting a blind retry", async (t) => {
  const h = await harness(t, {
    writer: async (_bytes, beforeWrite) => {
      await beforeWrite();
      throw new Error("unexpected adapter issue");
    },
  });
  await assert.rejects(h.bridge.submit(job(), "pair-hash", "token"), {
    code: "print_outcome_uncertain",
  });
  assert.equal(h.bridge.get(JOB).status, "held");
});
