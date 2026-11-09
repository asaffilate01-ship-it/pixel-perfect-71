import assert from "node:assert/strict";
import { createDatabase } from "./harness.mjs";
import { setupOrderingRoomsFixture } from "./ordering-rooms-fixture.mjs";
import { buildOrderingDraftExpirySql } from "../../deploy/mealdeck/ordering-draft-expiry.mjs";

const db = await createDatabase(process.argv.includes("--native"));
let checks = 0;
async function test(label, fn) {
  try {
    await fn();
    console.log(`PASS unpaid room expiry ${++checks}: ${label}`);
  } catch (error) {
    console.error(`FAIL unpaid room expiry: ${label}`);
    throw error;
  }
}
const deadline = async (r, index = 0) =>
  (await db.query(
    "select draft_expires_at from mealdeck_private.ordering_participants where room_id=$1 and slot_number=$2",
    [r.roomId, index + 1],
  )).rows[0].draft_expires_at;
const expirePerson = (r, index) =>
  db.query(
    "update mealdeck_private.ordering_participants set draft_expires_at=clock_timestamp()-interval '1 second' where room_id=$1 and slot_number=$2",
    [r.roomId, index + 1],
  );

try {
  const f = await setupOrderingRoomsFixture(db);
  const o = f.ordering;
  await test("owner-guarded addon is atomic, repeatable and does not enable cron by default", async () => {
    const sql = buildOrderingDraftExpirySql();
    assert.match(sql, /^begin;/m);
    assert.match(sql, /^commit;/m);
    assert.doesNotMatch(sql, /select cron\.schedule\(/);
    await db.exec(sql);
    await db.exec(sql);
    const enabled = await db.query(
      "select count(*)::integer as total from pg_trigger where tgname='mealdeck_ordering_draft_expiry_stamp'",
    );
    assert.equal(enabled.rows[0].total, 1);
    assert.match(buildOrderingDraftExpirySql({ scheduleCron: true }), /cron\.schedule/);
  });

  const room = await o.room();
  await o.accept(room,1);
  await test("each joined person's first save gets a five-minute deadline", async () => {
    assert.equal(await deadline(room,0), null);
    await o.choose(room,0,[o.pick()]);
    await o.choose(room,1,[o.pick(2)]);
    const expiry = new Date(await deadline(room,0)).getTime();
    assert.ok(expiry > Date.now() + 4 * 60_000);
    assert.ok(expiry <= Date.now() + 5 * 60_000);
  });

  await test("editing or increasing a draft does NOT extend its original deadline", async () => {
    const before = new Date(await deadline(room,1)).getTime();
    await o.choose(room,1,[o.pick(3)]);
    assert.equal(new Date(await deadline(room,1)).getTime(), before);
  });

  await test("expired choice is cleared on authenticated room read without ejecting the person", async () => {
    const previous = await o.status(room,0);
    const participant = previous.people.find(p=>p.isOrganiser===false);
    const originalVersion = participant.version;
    await o.ready(room,1);
    await expirePerson(room,1);
    const after = await o.status(room,0);
    const cleared = after.people.find(p=>p.isOrganiser===false);
    assert.deepEqual(cleared.picks,[]);
    assert.equal(cleared.state,"joined");
    assert.ok(cleared.version > originalVersion);
    assert.equal(after.paymentRoomId,null);
    assert.ok(after.revision > previous.revision);
    await assert.rejects(
      () => o.rpc("mealdeck_update_ordering_choices",[
        room.roomId,room.actors[1],originalVersion,JSON.stringify([o.pick()]),
      ]),
      /ordering_version_conflict/,
    );
  });

  await test("after expiry the person can deliberately save fresh choices with a fresh clock", async () => {
    await o.choose(room,1,[o.pick(1)]);
    const newExpiry = new Date(await deadline(room,1)).getTime();
    assert.ok(newExpiry > Date.now() + 4 * 60_000);
  });

  await test("owner-only idle sweep clears expired collecting drafts without changing other members", async () => {
    await expirePerson(room,0);
    const result = (await db.query("select mealdeck_private.sweep_unpaid_ordering_drafts(100) as snapshot")).rows[0].snapshot;
    assert.ok(result.draftsExpired >= 1);
    const status = await o.status(room,0);
    const owner = status.people.find(p=>p.isOrganiser);
    const other = status.people.find(p=>!p.isOrganiser);
    assert.deepEqual(owner.picks,[]);
    assert.equal(other.picks.length,1);
    assert.equal(status.orderId,null);
  });

  await test("a frozen payment room retains immutable choices even after an old deadline", async () => {
    const frozen = await o.readyRoom();
    await o.freeze(frozen);
    await expirePerson(frozen,0);
    await expirePerson(frozen,1);
    const res = (await db.query("select mealdeck_private.sweep_unpaid_ordering_drafts(100) as snapshot")).rows[0].snapshot;
    assert.ok(res.draftsExpired >= 0);
    const after = await o.status(frozen);
    assert.notEqual(after.paymentRoomId,null);
    assert.equal(after.people.filter(p=>p.picks && p.picks.length>0).length,2);
  });

  console.log(`${checks} independent MealDeck unpaid group draft expiry checks passed`);
} finally {
  await db.close();
}
