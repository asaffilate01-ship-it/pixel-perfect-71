import assert from "node:assert/strict";
import { asActor, createDatabase } from "./harness.mjs";
import { paymentHash } from "./shared-terminal-payments-fixture.mjs";
import { setupOrderingRoomsFixture, orderingRpcNames } from "./ordering-rooms-fixture.mjs";
import {
  buildOrderingRoomsSql,
  buildManagedOrderingRoomsSql,
} from "../../deploy/mealdeck/ordering-rooms.mjs";
import { orderingRoomConcurrencyTests } from "./ordering-rooms-concurrency.mjs";

const db = await createDatabase(process.argv.includes("--native"));
let checks = 0;
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const definition = (signature) =>
  scalar("select pg_get_functiondef($1::regprocedure)", [signature]);
async function test(label, run) {
  await db.exec(
    "update mealdeck_private.checkout_quotes set created_at=now()-interval '6 minutes'",
  );
  try {
    await run();
    console.log(`PASS ordering rooms ${++checks}: ${label}`);
  } catch (error) {
    console.error(`FAIL ordering rooms: ${label}: ${error.message}`, error.where ?? "");
    throw error;
  }
}
const clone = (value) => structuredClone(value);
const privateFieldPattern =
  /actor_hash|actorHash|owner_customer|ownerCustomer|guestToken|guest_id|guestId|tokenHash|TokenHash|@example/;

try {
  const f = await setupOrderingRoomsFixture(db, { install: false });
  const o = f.ordering;
  const managed = buildManagedOrderingRoomsSql({
    runnerOwnsTransaction: true,
    singleMigration: true,
  });
  const changedSignature =
    "public.mealdeck_create_group_payment_room(uuid,uuid,uuid,text,uuid,text,jsonb,text,boolean)";
  const beforeCreate = await definition(changedSignature);
  const beforeClock = await definition("mealdeck_private.launch_window()");
  const legacy = await f.group();
  const legacySnapshot = await f.status(legacy);

  await test("migration rollback, independent profile and source drift guards are atomic", async () => {
    for (const options of [
      undefined,
      {},
      { runnerOwnsTransaction: true },
      { singleMigration: true },
      { runnerOwnsTransaction: true, singleMigration: true, extra: true },
    ])
      assert.throws(() => buildManagedOrderingRoomsSql(options), /atomic transaction/);
    await db.exec("begin");
    await db.exec(managed);
    assert.notEqual(await definition(changedSignature), beforeCreate);
    await db.exec("rollback");
    assert.equal(await definition(changedSignature), beforeCreate);
    assert.equal(await scalar("select to_regclass('mealdeck_private.ordering_rooms')"), null);
    for (const [damage, expected] of [
      ["create schema dishbee_private", /independent_profile_required/],
      [
        "alter table mealdeck_private.installation rename to absent_installation_fixture",
        /independent_profile_required/,
      ],
      [
        "alter table mealdeck_private.installation drop constraint installation_profile_check; update mealdeck_private.installation set profile='wrong-profile'",
        /independent_profile_required/,
      ],
      [
        "alter table mealdeck_private.payment_orders rename to absent_payment_orders_fixture",
        /previous_extensions_required/,
      ],
      [
        "alter function mealdeck_private.valid_checkout_url(text) rename to absent_domain_fixture",
        /previous_extensions_required/,
      ],
      [
        "create or replace function mealdeck_private.validate_checkout_packing(p_selection jsonb,p_packing jsonb) returns boolean language sql as 'select false'",
        /unexpected_definition/,
      ],
    ]) {
      await db.exec("begin");
      try {
        await db.exec(damage);
        await db.exec("savepoint attempted_install");
        await assert.rejects(() => db.exec(managed), expected);
        await db.exec("rollback to savepoint attempted_install");
      } finally {
        await db.exec("rollback");
      }
      assert.equal(await scalar("select to_regclass('mealdeck_private.ordering_rooms')"), null);
      assert.equal(await definition(changedSignature), beforeCreate);
    }
  });
  await db.exec(buildOrderingRoomsSql());

  await test("service-only RPCs, private RLS tables and rerun preserve prior payment evidence", async () => {
    const tables = (
      await db.query(
        "select c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anon,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') customer,has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') service from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mealdeck_private' and c.relname in ('ordering_rooms','ordering_participants')",
      )
    ).rows;
    assert.equal(tables.length, 2);
    assert.ok(
      tables.every((row) => row.relrowsecurity && !row.anon && !row.customer && !row.service),
    );
    const functions = (
      await db.query(
        "select p.oid::regprocedure::text signature,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1::text[])",
        [orderingRpcNames],
      )
    ).rows;
    assert.equal(functions.length, orderingRpcNames.length);
    for (const entry of functions) {
      assert.equal(entry.prosecdef, true);
      assert.ok(entry.proconfig.includes('search_path=""'));
      for (const role of ["anon", "authenticated", "service_role"])
        assert.equal(
          await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, entry.signature]),
          role === "service_role",
        );
    }
    for (const role of ["anon", "authenticated", "service_role"])
      assert.equal(
        await scalar(
          "select has_function_privilege($1,'mealdeck_private.ordering_room_snapshot(uuid,text)','EXECUTE')",
          [role],
        ),
        false,
      );
    await assert.rejects(
      () =>
        asActor(db, f.customer, () =>
          db.query("select public.mealdeck_ordering_room_status($1,$2)", [
            f.next(),
            "a".repeat(64),
          ]),
        ),
      /permission denied/,
    );
    await db.exec(buildOrderingRoomsSql());
    assert.equal(await definition("mealdeck_private.launch_window()"), beforeClock);
    await db.exec("begin");
    try {
      await db.exec(
        "create or replace function mealdeck_private.ordering_room_snapshot(p_room uuid,p_actor_hash text) returns jsonb language sql as 'select null::jsonb'",
      );
      await db.exec("savepoint attempted_rerun");
      await assert.rejects(() => db.exec(managed), /unexpected_definition/);
      await db.exec("rollback to savepoint attempted_rerun");
    } finally {
      await db.exec("rollback");
    }
    const current = await f.status(legacy);
    assert.deepEqual(current.packingPlan, legacySnapshot.packingPlan);
    assert.deepEqual(current.shares, legacySnapshot.shares);
    assert.equal(current.orderId, legacySnapshot.orderId);
  });

  await test("creation binds current owner identity, idempotency, ten-person limit and server deadline", async () => {
    const r = await o.room({ inviteCount: 9, name: "  Amer\u00a0  Khan  " });
    assert.equal(r.snapshot.people.length, 10);
    assert.equal(r.snapshot.people[0].name, "Amer Khan");
    const seconds = (Date.parse(r.snapshot.joinDeadline) - Date.parse(r.snapshot.serverNow)) / 1000;
    assert.ok(seconds > 175 && seconds <= 180);
    assert.equal(r.snapshot.orderId, null);
    assert.equal(r.snapshot.paymentRoomId, null);
    assert.equal(
      await scalar("select count(*)::int from public.group_order_rooms where id=$1", [r.roomId]),
      0,
    );
    assert.doesNotMatch(JSON.stringify(r.snapshot), privateFieldPattern);
    const retry = await o.rpc("mealdeck_create_ordering_room", r.args);
    assert.equal(retry.people[0].participantId, r.snapshot.people[0].participantId);
    assert.equal(retry.joinDeadline, r.snapshot.joinDeadline);
    const changed = [...r.args];
    changed[7] = "Different";
    await assert.rejects(() => o.rpc("mealdeck_create_ordering_room", changed), /attempt_conflict/);
    await assert.rejects(() => o.room({ inviteCount: 10 }), /room_full/);
    await assert.rejects(
      () => o.room({ customer: f.unverified }),
      /verified|registration|identity/,
    );
    const missingIdentity = [...r.args];
    missingIdentity[5] = null;
    await assert.rejects(
      () => o.rpc("mealdeck_create_ordering_room", missingIdentity),
      /identity_required/,
    );
    assert.equal(
      await scalar("select count(*)::int from mealdeck_private.ordering_rooms where id=$1", [
        r.roomId,
      ]),
      1,
    );
  });

  await test("a single-use invitation joins without payment identity and cannot be stolen or rebound", async () => {
    const r = await o.room({ inviteCount: 2 });
    const preview = await o.rpc("mealdeck_ordering_invitation", [
      r.roomId,
      r.invitations[0].tokenHash,
    ]);
    assert.equal(preview.joinable, true);
    assert.equal(preview.organiserName, "Amer");
    assert.equal(preview.people, undefined);
    assert.doesNotMatch(JSON.stringify(preview), privateFieldPattern);
    const joined = await o.accept(r, 1, "Jay");
    assert.equal(o.ownPerson(joined).name, "Jay");
    assert.equal(o.ownPerson(joined).state, "joined");
    assert.equal(joined.viewer.role, "participant");
    assert.equal(joined.people[0].picks, undefined);
    const replay = await o.accept(r, 1, "A replacement name");
    assert.equal(o.ownPerson(replay).name, "Jay");
    await assert.rejects(
      () =>
        o.rpc("mealdeck_accept_ordering_invitation", [
          r.roomId,
          r.invitations[0].tokenHash,
          paymentHash(f.next()),
          "Attacker",
        ]),
      /invitation_unavailable/,
    );
    await assert.rejects(
      () =>
        o.rpc("mealdeck_accept_ordering_invitation", [
          r.roomId,
          r.invitations[1].tokenHash,
          r.actors[1],
          "Two bags",
        ]),
      /already_joined/,
    );
    await assert.rejects(
      () => o.rpc("mealdeck_ordering_invitation", [f.next(), r.invitations[0].tokenHash]),
      /invitation_unavailable/,
    );
    await assert.rejects(
      () => o.rpc("mealdeck_ordering_room_status", [r.roomId, paymentHash(f.next())]),
      /room_unavailable/,
    );
  });

  await test("nickname safety uses Unicode code points and rejects control/directional text", async () => {
    for (const name of [
      "",
      "  ",
      "a".repeat(33),
      "A\nB",
      "A\tB",
      "A\u007fB",
      "A\u0085B",
      "A\u061cB",
      "A\u200eB",
      "A\u2028B",
      "A\u202eB",
      "A\u2066B",
    ])
      await assert.rejects(() => o.room({ name }), /name_invalid/);
    const unicode = await o.room({ name: "😀".repeat(32), inviteCount: 0 });
    assert.equal([...unicode.snapshot.people[0].name].length, 32);
    const joined = await o.room();
    assert.equal(o.ownPerson(await o.accept(joined, 1, "A\u200dB")).name, "A\u200dB");
  });

  await test("each person edits only their own version; edits reset readiness without conflicting with another person", async () => {
    const r = await o.room();
    await o.accept(r);
    const owner = await o.status(r);
    const participant = await o.status(r, 1);
    await o.rpc("mealdeck_update_ordering_choices", [
      r.roomId,
      r.actors[0],
      o.ownPerson(owner).version,
      JSON.stringify([o.pick()]),
    ]);
    await o.rpc("mealdeck_update_ordering_choices", [
      r.roomId,
      r.actors[1],
      o.ownPerson(participant).version,
      JSON.stringify([o.pick(2)]),
    ]);
    await assert.rejects(
      () =>
        o.rpc("mealdeck_update_ordering_choices", [
          r.roomId,
          r.actors[1],
          o.ownPerson(participant).version,
          "[]",
        ]),
      /version_conflict/,
    );
    await o.ready(r, 0);
    await o.ready(r, 1);
    assert.equal((await o.status(r)).canFinalize, true);
    assert.equal((await o.status(r, 1)).canFinalize, false);
    const edited = await o.choose(r, 1, [o.pick(3)]);
    assert.equal(o.ownPerson(edited).state, "joined");
    assert.equal(edited.readyCount, 1);
    assert.equal((await o.status(r)).people[0].picks[0].quantity, 1);
    assert.equal(edited.people[0].picks, undefined);
    await assert.rejects(
      () => o.choose(r, 1, [{ ...o.pick(), key: "browser-only" }]),
      /choices_invalid/,
    );
    await assert.rejects(() => o.choose(r, 1, [{ ...o.pick(), quantity: 21 }]), /choices_invalid/);
    await o.choose(r, 0, [o.pick(20), o.pick(20)]);
    await assert.rejects(() => o.choose(r, 1, [o.pick(20), o.pick(20)]), /basket_limit/);
  });

  await test("three-minute expiry drops only nonjoiners; joined people and choices remain", async () => {
    const r = await o.room({ inviteCount: 2 });
    await o.accept(r, 1);
    await o.choose(r, 1);
    await db.query(
      "update mealdeck_private.ordering_rooms set join_deadline=clock_timestamp()-interval '1 second' where id=$1",
      [r.roomId],
    );
    const status = await o.status(r);
    assert.equal(status.pendingCount, 0);
    assert.equal(status.invitationsClosed, true);
    assert.equal(status.people[1].state, "joined");
    assert.equal(status.people[1].picks.length, 1);
    assert.equal(status.people[2].state, "expired");
    assert.equal(
      (await o.rpc("mealdeck_ordering_invitation", [r.roomId, r.invitations[1].tokenHash]))
        .joinable,
      false,
    );
    await assert.rejects(() => o.accept(r, 2), /invitation_unavailable/);
    const later = await o.status(r);
    assert.equal(later.revision, status.revision);
    assert.equal(
      await scalar("select count(*)::int from mealdeck_private.payment_orders where room_id=$1", [
        r.roomId,
      ]),
      0,
    );
  });

  await test("owner closes/removes pending invitations; joined participants must choose or leave themselves", async () => {
    const r = await o.room({ inviteCount: 3 });
    await o.accept(r, 1);
    await assert.rejects(
      () => o.rpc("mealdeck_close_ordering_invitations", [r.roomId, r.actors[1]]),
      /organiser_required/,
    );
    await assert.rejects(
      () =>
        o.rpc("mealdeck_remove_ordering_invitation", [
          r.roomId,
          r.actors[0],
          r.invitations[0].participantId,
        ]),
      /invitation_unavailable/,
    );
    await assert.rejects(() => o.ready(r, 1), /choices_required/);
    await o.rpc("mealdeck_remove_ordering_invitation", [
      r.roomId,
      r.actors[0],
      r.invitations[1].participantId,
    ]);
    const closed = await o.rpc("mealdeck_close_ordering_invitations", [r.roomId, r.actors[0]]);
    assert.equal(closed.people[1].state, "joined");
    assert.equal(closed.people[2].state, "removed");
    assert.equal(closed.people[3].state, "removed");
    await o.choose(r, 1);
    const left = await o.rpc("mealdeck_leave_ordering_room", [r.roomId, r.actors[1]]);
    assert.equal(o.ownPerson(left).state, "left");
    assert.deepEqual(o.ownPerson(left).picks, []);
    await assert.rejects(() => o.status(r, 1), /room_unavailable/);
    await assert.rejects(() => o.accept(r, 1), /invitation_unavailable/);
    await assert.rejects(
      () => o.rpc("mealdeck_leave_ordering_room", [r.roomId, r.actors[0]]),
      /organiser_required/,
    );
  });

  await test("freeze waits for every join/ready decision and rejects stale revisions and wrong identity", async () => {
    const r = await o.readyRoom();
    const data = await o.freezeArgs(r);
    await o.choose(r, 1, [o.pick(3)]);
    await assert.rejects(
      () => o.rpc("mealdeck_finalize_ordering_room", data.args),
      /revision_conflict/,
    );
    const current = await o.freezeArgs(r);
    await assert.rejects(() => o.rpc("mealdeck_finalize_ordering_room", current.args), /not_ready/);
    await o.ready(r, 1);
    const good = await o.freezeArgs(r);
    const wrong = [...good.args];
    wrong[2] = f.otherCustomer;
    await assert.rejects(
      () => o.rpc("mealdeck_finalize_ordering_room", wrong),
      /owner_identity_required/,
    );
    wrong[1] = r.actors[1];
    await assert.rejects(
      () => o.rpc("mealdeck_finalize_ordering_room", wrong),
      /organiser_required/,
    );
    assert.equal(
      await scalar("select count(*)::int from mealdeck_private.payment_orders where room_id=$1", [
        r.roomId,
      ]),
      0,
    );
    const pending = await o.room();
    await o.choose(pending, 0);
    await o.ready(pending, 0);
    const attempted = await o.freezeArgs(pending);
    await assert.rejects(
      () => o.rpc("mealdeck_finalize_ordering_room", attempted.args),
      /not_ready/,
    );
  });

  await test("freeze binds exact named participant packing and quantities atomically", async () => {
    const r = await o.readyRoom();
    const data = await o.freezeArgs(r);
    const wrongName = clone(data.packing);
    wrongName.bags[0].name = "Someone else";
    const wrongCutlery = clone(data.packing);
    wrongCutlery.cutleryRequested = !wrongCutlery.cutleryRequested;
    const merged = clone(data.packing);
    merged.bags[1].allocations = [{ lineId: "line-1", quantity: 2 }];
    for (const packing of [wrongName, wrongCutlery, merged]) {
      const args = [...data.args];
      args[6] = JSON.stringify(packing);
      await assert.rejects(() => o.rpc("mealdeck_finalize_ordering_room", args), /packing|choices/);
    }
    const wrongQty = clone(data.lines);
    wrongQty[0].quantity = 2;
    const args = [...data.args];
    args[5] = JSON.stringify(wrongQty);
    await assert.rejects(() => o.rpc("mealdeck_finalize_ordering_room", args), /packing|choices/);
    assert.equal(
      await scalar("select count(*)::int from public.group_order_rooms where id=$1", [r.roomId]),
      0,
    );
    assert.equal((await o.status(r)).phase, "ready");
    const frozen = await o.freeze(r, { data });
    assert.equal(frozen.snapshot.paymentRoomId, r.roomId);
    assert.equal(frozen.snapshot.phase, "payment");
    const items = (
      await db.query(
        "select checkout_line_id,group_participant_id,group_participant_name from public.order_items where order_id=$1 order by checkout_line_id",
        [frozen.snapshot.orderId],
      )
    ).rows;
    assert.deepEqual(
      items.map((item) => item.group_participant_name),
      ["Amer", "Guest 1"],
    );
    assert.deepEqual(
      items.map((item) => item.group_participant_id),
      frozen.snapshot.people.map((person) => person.participantId),
    );
    assert.deepEqual(frozen.room.packingPlan, data.packing);
    const retry = await o.rpc("mealdeck_finalize_ordering_room", data.args);
    assert.equal(retry.orderId, frozen.snapshot.orderId);
    assert.equal(
      await scalar("select count(*)::int from mealdeck_private.payment_orders where room_id=$1", [
        r.roomId,
      ]),
      1,
    );
    await assert.rejects(() => o.choose(r, 1), /frozen/);
    await assert.rejects(() => o.ready(r, 0, false), /frozen/);
    await assert.rejects(
      () => o.rpc("mealdeck_leave_ordering_room", [r.roomId, r.actors[1]]),
      /frozen/,
    );
    const differentAttempt = [...data.args];
    differentAttempt[8] = f.next();
    await assert.rejects(
      () => o.rpc("mealdeck_finalize_ordering_room", differentAttempt),
      /attempt_conflict/,
    );
  });

  await test("menu availability is rechecked and a failed canonical quote leaves no partial room/order", async () => {
    const r = await o.readyRoom();
    const data = await o.freezeArgs(r);
    await db.query("update public.menu_items set active=false where tenant_id=$1 and sku=$2", [
      f.tenantId,
      f.line.sku,
    ]);
    try {
      await assert.rejects(
        () => o.rpc("mealdeck_finalize_ordering_room", data.args),
        /unavailable/,
      );
    } finally {
      await db.query("update public.menu_items set active=true where tenant_id=$1 and sku=$2", [
        f.tenantId,
        f.line.sku,
      ]);
    }
    assert.equal(
      await scalar("select count(*)::int from public.group_order_rooms where id=$1", [r.roomId]),
      0,
    );
    assert.equal((await o.status(r)).phase, "ready");
    assert.equal((await o.freeze(r, { data })).snapshot.phase, "payment");
  });

  await test("one survivor can order after expiry; one-bag legacy room creation stays prohibited", async () => {
    const r = await o.room();
    await o.choose(r);
    await o.ready(r);
    await db.query(
      "update mealdeck_private.ordering_rooms set join_deadline=clock_timestamp()-interval '1 second' where id=$1",
      [r.roomId],
    );
    const frozen = await o.freeze(r);
    assert.equal(frozen.room.shares.length, 1);
    assert.equal(frozen.snapshot.people[1].state, "expired");
    const q = await f.quote({ packing: { ...f.pack([f.line]), separateBags: true } });
    await assert.rejects(() => f.group({ quote: q, packing: q.packingPlan }), /shares_invalid/);
  });

  await test("an empty organiser has no food share and can still pay for everyone", async () => {
    const r = await o.readyRoom({ emptyOrganiser: true, mode: "organiser" });
    const frozen = await o.freeze(r);
    assert.equal(frozen.snapshot.people[0].bagNumber, null);
    assert.equal(frozen.snapshot.people[0].shareId, null);
    assert.equal(frozen.room.ownShareId, null);
    assert.equal(frozen.snapshot.people[1].bagNumber, 1);
    assert.equal(frozen.room.packingPlan.bags[0].name, "Guest 1");
    await assert.rejects(() => o.access(r, 0), /claim_forbidden/);
    const access = await o.access(r, 0, { cover: true });
    assert.equal(access.shareTokenHash, null);
    assert.equal(access.owner, true);
    const collection = await o.claim(r, 0, { cover: true });
    assert.equal(collection.amountPence, frozen.room.totalPence);
    assert.equal(collection.orderingRoomId, r.roomId);
  });

  await test("payment bridge checks actor and real payer identity; participant views are scoped to their own bag", async () => {
    const r = await o.readyRoom();
    const frozen = await o.freeze(r);
    await assert.rejects(
      () => o.rpc("mealdeck_ordering_payment_access", [r.roomId, r.actors[1], null, null, false]),
      /identity_required/,
    );
    await assert.rejects(() => o.access(r, 1, { cover: true }), /claim_forbidden/);
    await assert.rejects(
      () => o.access(r, 0, { customer: f.otherCustomer }),
      /owner_identity_required/,
    );
    const a = await o.access(r, 1);
    assert.equal(a.shareTokenHash, frozen.tokens[1].tokenHash);
    const participant = await o.paymentStatus(r, 1);
    assert.equal(participant.ownerAccess, false);
    assert.equal(participant.quoteId, undefined);
    assert.equal(participant.shares.length, 1);
    assert.equal(participant.packingPlan.bags.length, 1);
    assert.equal(participant.packingPlan.bags[0].name, "Guest 1");
    assert.deepEqual(
      participant.lines.map((line) => line.lineId),
      ["line-2"],
    );
    assert.doesNotMatch(JSON.stringify(participant), privateFieldPattern);
    const c = await o.claim(r, 1);
    const internal = await o.collections(r, 0);
    assert.equal(internal.length, 1);
    assert.equal(internal[0].payerAccess, false);
    assert.equal((await o.collections(r, 0, f.customer))[0].payerAccess, false);
    assert.equal((await o.collections(r, 1, f.otherCustomer))[0].payerAccess, true);
    assert.equal(internal[0].collectionId, c.collectionId);
    const roster = await o.status(r);
    assert.equal(roster.people[0].paymentState, "unclaimed");
    assert.equal(roster.people[1].paymentState, "pending");
    assert.doesNotMatch(JSON.stringify(roster), privateFieldPattern);
    const peerRoster = await o.status(r, 1);
    assert.equal(peerRoster.people[0].shareId, null);
    assert.equal(peerRoster.people[1].shareId, frozen.tokens[1].shareId);
    assert.equal(peerRoster.people[0].bagNumber, 1);
  });

  await test("legacy pay-own cannot charge another person's Bag 1 for an empty organiser", async () => {
    const r = await o.readyRoom({ emptyOrganiser: true, mode: "separate" });
    const frozen = await o.freeze(r);
    assert.equal(frozen.room.shares[0].bagNumber, 1);
    assert.equal(frozen.snapshot.people[0].shareId, null);
    await assert.rejects(
      () =>
        f.rpc("mealdeck_prepare_group_payment", [
          r.roomId,
          f.customer,
          null,
          frozen.tokens[0].tokenHash,
          false,
          f.next(),
          "acct_Fixture",
          false,
        ]),
      /claim_forbidden/,
    );
    const collection = await o.claim(r, 0, { cover: true });
    assert.equal(collection.amountPence, frozen.room.totalPence);
    assert.equal(collection.coverRemaining, true);
    const nonempty = await o.readyRoom();
    const nonemptyFrozen = await o.freeze(nonempty);
    await assert.rejects(
      () =>
        f.rpc("mealdeck_prepare_group_payment", [
          nonempty.roomId,
          f.customer,
          null,
          nonemptyFrozen.tokens[1].tokenHash,
          false,
          f.next(),
          "acct_Fixture",
          false,
        ]),
      /claim_forbidden/,
    );
  });

  await test("current guest/member identity remains independent of room nicknames and acceptance", async () => {
    const token = paymentHash(f.next());
    const otherToken = paymentHash(f.next());
    await f.guest.session(token);
    await f.guest.session(otherToken);
    const r = await o.readyRoom({ guestToken: token });
    const data = await o.freezeArgs(r);
    const replacedGuest = [...data.args];
    replacedGuest[3] = otherToken;
    await assert.rejects(
      () => o.rpc("mealdeck_finalize_ordering_room", replacedGuest),
      /owner_identity_required/,
    );
    const frozen = await o.freeze(r, { data });
    const guestPayment = await o.claim(r, 0, { guestToken: token });
    assert.equal(guestPayment.orderingRoomId, r.roomId);
    assert.equal(guestPayment.email, "guest@example.invalid");
    assert.equal(frozen.room.packingPlan.bags[0].name, "Amer");
    await f.guest.end(token);
    await assert.rejects(() => o.access(r, 0, { guestToken: token }), /guest_session_invalid/);
    assert.equal((await o.paymentStatus(r)).roomId, r.roomId);
    assert.equal((await o.collections(r))[0].payerAccess, false);
    const member = await o.readyRoom();
    const memberData = await o.freezeArgs(member);
    await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1", [
      f.customer,
    ]);
    try {
      await assert.rejects(
        () => o.rpc("mealdeck_finalize_ordering_room", memberData.args),
        /identity|verified|registration/,
      );
    } finally {
      await db.query("update auth.users set banned_until=null where id=$1", [f.customer]);
    }
    assert.equal((await o.status(member)).phase, "ready");
    assert.equal(
      await scalar("select count(*)::int from mealdeck_private.payment_orders where room_id=$1", [
        member.roomId,
      ]),
      0,
    );
  });

  await test("ordinary unnamed checkout and historical group payments remain compatible", async () => {
    const quote = await f.quote();
    const order = await f.prepare(quote.quoteId, { attemptId: f.next() });
    await f.bind(order.orderId, "cs_test_orderinglegacy");
    await f.reconcile(order, {
      event: "evt_orderinglegacy",
      session: "cs_test_orderinglegacy",
      intent: "pi_orderinglegacy",
    });
    assert.equal(
      await scalar("select payment_status from public.orders where id=$1", [order.orderId]),
      "paid",
    );
    assert.deepEqual(
      await scalar("select packing_plan from public.orders where id=$1", [order.orderId]),
      quote.packingPlan,
    );
    const collection = await f.claim(legacy);
    assert.equal(collection.orderingRoomId, null);
    const existing = await f.status(legacy);
    assert.equal(existing.packingPlan.bags[0].name, undefined);
  });

  await test("separate verified payments release one complete named kitchen order only after all shares are paid", async () => {
    const r = await o.readyRoom();
    const frozen = await o.freeze(r);
    const first = await o.bind(await o.claim(r, 0));
    await f.reconcilePayment(first);
    assert.equal(
      await scalar("select count(*)::int from public.kds_tickets where order_id=$1", [
        first.orderId,
      ]),
      0,
    );
    let roster = await o.status(r, 1);
    assert.equal(roster.people[0].paymentState, "paid");
    assert.equal(roster.people[1].paymentState, "unclaimed");
    const second = await o.bind(await o.claim(r, 1));
    await f.reconcilePayment(second, {
      event: "evt_orderingcomplete",
      intent: "pi_orderingcomplete",
    });
    await f.reconcilePayment(second, {
      event: "evt_orderingcomplete",
      intent: "pi_orderingcomplete",
    });
    assert.equal((await o.paymentStatus(r)).status, "paid");
    assert.equal(
      await scalar("select count(*)::int from public.mealdeck_pass_orders where order_id=$1", [
        first.orderId,
      ]),
      1,
    );
    assert.equal(
      await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
        first.orderId,
      ]),
      0,
    );
    const card = await scalar(
      "select mealdeck_ops_private.kds_order_card($1,mealdeck_private.kds_release_authority($1))",
      [first.orderId],
    );
    for (const item of card.items) {
      assert.equal(item.bags.length, 1);
      assert.equal(item.bags[0].name, item.participant_name);
      for (const ticket of card.tickets)
        for (const routed of ticket.items.filter(
          (value) => value.order_item_id === item.order_item_id,
        )) {
          assert.equal(routed.participant_name, item.participant_name);
          assert.deepEqual(routed.bags, item.bags);
        }
    }
    await asActor(db, f.owner, () =>
      db.query("select public.mealdeck_ops_kds_accept_order($1,$2,$3,$4)", [
        f.tenantId,
        f.locationId,
        first.orderId,
        card.version,
      ]),
    );
    const receipt = await scalar(
      "select receipt from mealdeck_private.receipt_jobs where order_id=$1",
      [first.orderId],
    );
    assert.deepEqual(receipt.packingPlan, frozen.packing);
    assert.equal(receipt.totalPence, frozen.room.totalPence);
    assert.equal(receipt.packingPlan.bags.length, 2);
    await db.query(
      "update mealdeck_private.ordering_rooms set join_deadline=clock_timestamp()-interval '1 day' where id=$1",
      [r.roomId],
    );
    roster = await o.status(r);
    assert.ok(
      roster.people.every((person) => person.paymentState === "paid" && person.state === "ready"),
    );
    assert.equal(roster.orderId, frozen.snapshot.orderId);
  });

  await test("organiser-pay mode is enforced in the legacy payment RPC as well as the room bridge", async () => {
    const r = await o.readyRoom({ mode: "organiser" });
    const frozen = await o.freeze(r);
    await assert.rejects(() => o.access(r, 1), /claim_forbidden/);
    await assert.rejects(() => o.access(r, 0), /claim_forbidden/);
    await assert.rejects(
      () =>
        f.rpc("mealdeck_prepare_group_payment", [
          r.roomId,
          f.otherCustomer,
          null,
          frozen.tokens[1].tokenHash,
          false,
          f.next(),
          "acct_Fixture",
          false,
        ]),
      /claim_forbidden/,
    );
    const c = await o.claim(r, 0, { cover: true });
    assert.equal(c.shareIds.length, 2);
    assert.equal(c.amountPence, frozen.room.totalPence);
    await f.reconcilePayment(await o.bind(c));
    assert.ok((await o.status(r, 1)).people.every((person) => person.paymentState === "paid"));
    assert.equal((await o.paymentStatus(r)).status, "paid");
  });

  await test("draft cancellation is owner-bound and frozen cancellation preserves uncertain claims and late money", async () => {
    const draft = await o.room();
    await assert.rejects(
      () =>
        o.rpc("mealdeck_cancel_ordering_room", [
          draft.roomId,
          draft.actors[0],
          f.otherCustomer,
          null,
        ]),
      /owner_identity_required/,
    );
    const result = await o.rpc("mealdeck_cancel_ordering_room", [
      draft.roomId,
      draft.actors[0],
      f.customer,
      null,
    ]);
    assert.equal(result.room.phase, "cancelled");
    assert.deepEqual(result.collectionsToCancel, []);
    await assert.rejects(() => o.accept(draft), /invitation_unavailable/);
    await assert.rejects(() => o.choose(draft), /frozen/);
    const r = await o.readyRoom();
    await o.freeze(r);
    const collection = await o.bind(await o.claim(r, 1));
    const cancelled = await o.rpc("mealdeck_cancel_ordering_room", [
      r.roomId,
      r.actors[0],
      f.customer,
      null,
    ]);
    assert.equal(cancelled.room.phase, "cancelled");
    assert.equal(cancelled.collectionsToCancel[0].collectionId, collection.collectionId);
    assert.equal(
      await scalar(
        "select count(*)::int from mealdeck_private.payment_collection_shares where collection_id=$1 and active",
        [collection.collectionId],
      ),
      1,
    );
    const late = await f.reconcilePayment(collection);
    assert.equal(late.held, true);
    assert.equal(
      await scalar("select count(*)::int from public.kds_tickets where order_id=$1", [
        collection.orderId,
      ]),
      0,
    );
    assert.equal((await o.paymentStatus(r)).capturedPence, collection.amountPence);
    assert.equal((await o.status(r)).people[1].paymentState, "refund_review");
  });

  if (db.native) await orderingRoomConcurrencyTests(db, f, test);
  console.log(
    `PASS ${checks} ordering-room checks (${db.native ? "native PostgreSQL" : "PGlite"})`,
  );
} catch (error) {
  console.error({ message: error.message, detail: error.detail, where: error.where });
  process.exitCode = 1;
} finally {
  await db.close();
}
