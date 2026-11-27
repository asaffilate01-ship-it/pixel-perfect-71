import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { FixtureTransport, fixtureProfile } from "../demo/fixture.mjs";
import { UberEatsAdapter } from "../src/adapters.mjs";
import { CommandEngine } from "../src/engine.mjs";

function setup({ observe } = {}) {
  const fixture = new FixtureTransport();
  const profile = fixtureProfile("uber_eats");
  const adapter = new UberEatsAdapter(fixture, profile, "fixture-store");
  const records = new Map();
  const journal = {
    get: (id) => records.get(id),
    put: async (id, value) => records.set(id, structuredClone(value)),
  };
  const command = {
    commandId: randomUUID(),
    leaseToken: randomUUID(),
    leaseExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    mode: "execute",
    platform: "uber_eats",
    externalStoreId: fixture.store.text,
    externalOrderId: fixture.stableId.text,
    displayReference: fixture.reference.text,
    action: "accept",
    expectedState: "new",
  };
  const engine = new CommandEngine({
    adapter,
    journal,
    observe: observe ?? (async () => ({ ok: true, held: false })),
    readbackTimeoutMs: 0,
  });
  return { fixture, profile, adapter, records, journal, command, engine };
}

test("accept persists dispatch before click and confirms only the exact observed order", async () => {
  const s = setup();
  const click = s.fixture.click.bind(s.fixture);
  s.fixture.click = async (element) => {
    assert.equal(s.records.get(s.command.commandId).dispatched, true);
    await click(element);
  };
  const result = await s.engine.run(s.command);
  assert.equal(result.outcome, "confirmed");
  assert.equal(result.observedState, "accepted");
  assert.equal(result.externalOrderId, s.command.externalOrderId);
  assert.equal(result.displayReference, "0AB19");
  assert.equal(s.fixture.mutationClicks, 1);
});

test("already applied action confirms by reading and does not click", async () => {
  const s = setup();
  s.fixture.state.text = "Preparing";
  assert.equal((await s.engine.run(s.command)).outcome, "confirmed");
  assert.equal(s.fixture.mutationClicks, 0);
});

test("already accepted source never confirms a changed or held full food snapshot", async () => {
  let admissions = 0;
  const s = setup({
    observe: async () => {
      admissions++;
      return { ok: true, held: true };
    },
  });
  s.fixture.state.text = "Accepted";
  assert.notEqual((await s.engine.run(s.command)).outcome, "confirmed");
  assert.equal(admissions, 1);
  assert.equal(s.fixture.mutationClicks, 0);
});

test("food changed during click must pass admission again before confirmation", async () => {
  const s = setup();
  let admissions = 0;
  s.engine.observe = async () => ({ ok: true, held: ++admissions > 1 });
  const click = s.fixture.click.bind(s.fixture);
  s.fixture.click = async (element) => {
    await click(element);
    s.fixture.food.text = "Changed after acceptance";
  };
  assert.equal((await s.engine.run(s.command)).outcome, "uncertain");
  assert.equal(admissions, 2);
  assert.equal(s.fixture.mutationClicks, 1);
});

test("lost click response is held; same command reconciles without a second click", async () => {
  const s = setup();
  const click = s.fixture.click.bind(s.fixture);
  s.fixture.click = async (element) => {
    await click(element);
    throw new Error("lost reply");
  };
  assert.equal((await s.engine.run(s.command)).outcome, "uncertain");
  assert.equal(s.fixture.mutationClicks, 1);
  const recovered = new CommandEngine({
    adapter: s.adapter,
    journal: s.journal,
    observe: async () => ({ ok: true, held: false }),
  });
  assert.equal(
    (await recovered.run({ ...s.command, leaseToken: randomUUID(), mode: "reconcile" })).outcome,
    "confirmed",
  );
  assert.equal(s.fixture.mutationClicks, 1);
});

test("reconcile mode never clicks even after loss of the local journal", async () => {
  const s = setup();
  assert.equal((await s.engine.run({ ...s.command, mode: "reconcile" })).outcome, "uncertain");
  assert.equal(s.fixture.mutationClicks, 0);
});

test("a click with no confirming state stays held and is never replayed", async () => {
  const s = setup();
  s.fixture.click = async () => {
    s.fixture.mutationClicks++;
  };
  assert.equal((await s.engine.run(s.command)).outcome, "uncertain");
  assert.equal((await s.engine.run(s.command)).outcome, "uncertain");
  assert.equal(s.fixture.mutationClicks, 1);
});

test("new reconcile lease can carry an advanced expectedState without becoming a different command", async () => {
  const s = setup();
  s.fixture.state.text = "Accepted";
  const instruction = { ...s.command, action: "ready", expectedState: "accepted" };
  s.fixture.click = async () => {
    s.fixture.mutationClicks++;
  };
  assert.equal((await s.engine.run(instruction)).outcome, "uncertain");
  s.fixture.state.text = "Preparing";
  const lease = {
    ...instruction,
    mode: "reconcile",
    expectedState: "preparing",
    leaseToken: randomUUID(),
  };
  assert.equal((await s.engine.run(lease)).outcome, "uncertain");
  s.fixture.state.text = "Ready";
  assert.equal(
    (await s.engine.run({ ...lease, expectedState: "ready", leaseToken: randomUUID() })).outcome,
    "confirmed",
  );
  assert.equal(s.fixture.mutationClicks, 1);
});

test("expired lease is not dispatched", async () => {
  const s = setup();
  assert.equal(
    (await s.engine.run({ ...s.command, leaseExpiresAt: new Date(Date.now() - 1).toISOString() }))
      .outcome,
    "not_applied",
  );
  assert.equal(s.fixture.mutationClicks, 0);
});

test("wrong source store, full order id, or display reference never targets another ticket", async () => {
  for (const key of ["externalStoreId", "externalOrderId", "displayReference"]) {
    const s = setup();
    if (key === "externalStoreId")
      await assert.rejects(s.engine.run({ ...s.command, [key]: "other" }), /identity_mismatch/);
    else
      assert.equal((await s.engine.run({ ...s.command, [key]: "other" })).outcome, "not_applied");
    assert.equal(s.fixture.mutationClicks, 0);
  }
});

test("an unsupported preparing button and platform-courier handover stay unsupported", async () => {
  const preparing = setup();
  preparing.fixture.state.text = "Accepted";
  assert.equal(
    (
      await preparing.engine.run({
        ...preparing.command,
        action: "preparing",
        expectedState: "accepted",
      })
    ).outcome,
    "unsupported",
  );
  const handover = setup();
  handover.fixture.state.text = "Ready";
  assert.equal(
    (await handover.engine.run({ ...handover.command, action: "handover", expectedState: "ready" }))
      .outcome,
    "unsupported",
  );
  assert.equal(preparing.fixture.mutationClicks + handover.fixture.mutationClicks, 0);
});

test("ready requires the expected supported remote state, not a local kitchen flag", async () => {
  const s = setup();
  assert.equal(
    (await s.engine.run({ ...s.command, action: "ready", expectedState: "preparing" })).outcome,
    "not_applied",
  );
  assert.equal(s.fixture.mutationClicks, 0);
});

test("a held full order cannot dispatch", async () => {
  const s = setup({ observe: async () => ({ ok: true, held: true }) });
  assert.equal((await s.engine.run(s.command)).outcome, "not_applied");
  assert.equal(s.fixture.mutationClicks, 0);
});

test("food changed after server admission is rejected immediately before click", async () => {
  const s = setup();
  s.engine.observe = async () => {
    s.fixture.food.text = "Different food";
    return { ok: true, held: false };
  };
  assert.equal((await s.engine.run(s.command)).outcome, "uncertain");
  assert.equal(s.fixture.mutationClicks, 0);
});

test("journal failure prevents any external action", async () => {
  const s = setup();
  s.journal.put = async () => {
    throw new Error("disk unavailable");
  };
  await assert.rejects(s.engine.run(s.command), /disk unavailable/);
  assert.equal(s.fixture.mutationClicks, 0);
});

test("stopping after admission but before dispatch cannot click", async () => {
  const s = setup();
  const abort = new AbortController();
  s.engine.observe = async () => {
    abort.abort();
    return { ok: true, held: false };
  };
  assert.equal((await s.engine.run(s.command, { signal: abort.signal })).outcome, "not_applied");
  assert.equal(s.fixture.mutationClicks, 0);
});

test("stopping after durable dispatch intent but before the actual click remains held", async () => {
  const s = setup();
  const abort = new AbortController();
  const put = s.journal.put;
  s.journal.put = async (id, value) => {
    await put(id, value);
    if (value.dispatched) abort.abort();
  };
  assert.equal((await s.engine.run(s.command, { signal: abort.signal })).outcome, "uncertain");
  assert.equal(s.fixture.mutationClicks, 0);
});

test("old confirmed observation cannot confirm a now-cancelled order", async () => {
  const s = setup();
  s.fixture.state.text = "Accepted";
  assert.equal((await s.engine.run(s.command)).outcome, "confirmed");
  s.fixture.state.text = "Cancelled";
  assert.equal((await s.engine.run(s.command)).outcome, "uncertain");
  assert.equal(s.fixture.mutationClicks, 0);
});

test("command id cannot be reused for a different identity", async () => {
  const s = setup();
  await s.engine.run(s.command);
  await assert.rejects(
    s.engine.run({ ...s.command, displayReference: "DIFFERENT" }),
    /identity_mismatch/,
  );
});

test("fresh readback of a different order is never confirmation", async () => {
  const s = setup();
  const readState = s.adapter.readState.bind(s.adapter);
  s.adapter.readState = async (cmd) => {
    const actual = await readState(cmd);
    return s.fixture.mutationClicks ? { ...actual, externalOrderId: "other" } : actual;
  };
  assert.equal((await s.engine.run(s.command)).outcome, "uncertain");
  assert.equal(s.fixture.mutationClicks, 1);
});
