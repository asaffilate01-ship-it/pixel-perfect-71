import assert from "node:assert/strict";
import pg from "pg";
import { paymentHash } from "./shared-terminal-payments-fixture.mjs";

export async function orderingRoomConcurrencyTests(db, f, test) {
  assert.equal(db.native, true);
  const o = f.ordering;
  async function race(label, firstAction, secondAction, verify, beforeCommit) {
    const first = new pg.Client({ ...db.config, application_name: "mealdeck_ordering_first" });
    const second = new pg.Client({ ...db.config, application_name: "mealdeck_ordering_second" });
    try {
      await Promise.all([first.connect(), second.connect()]);
      const firstPid = (await first.query("select pg_backend_pid() pid")).rows[0].pid;
      const secondPid = (await second.query("select pg_backend_pid() pid")).rows[0].pid;
      for (const client of [first, second]) {
        await client.query("begin");
        await client.query("set local role service_role");
        await client.query("select set_config('request.jwt.claim.role','service_role',true)");
      }
      const a = await firstAction(first);
      const pending = secondAction(second).then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error }),
      );
      let blocked = false;
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        blocked = (
          await db.query("select $2::int=any(pg_blocking_pids($1)) blocked", [secondPid, firstPid])
        ).rows[0].blocked;
        if (blocked) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(blocked, true, label + " must serialize on a real room/payment row lock");
      if (beforeCommit) await beforeCommit();
      await first.query("commit");
      const b = await pending;
      await second.query(b.ok ? "commit" : "rollback");
      await verify(a, b);
    } finally {
      await Promise.allSettled([first.query("rollback"), second.query("rollback")]);
      await Promise.allSettled([first.end(), second.end()]);
    }
  }
  const rpc = (client, name, values) => o.call(client, name, values);

  await test("native: simultaneous invitation accept binds one browser and rejects takeover", async () => {
    const r = await o.room();
    await race(
      "invite binding",
      (client) =>
        rpc(client, "mealdeck_accept_ordering_invitation", [
          r.roomId,
          r.invitations[0].tokenHash,
          r.actors[1],
          "Jay",
        ]),
      (client) =>
        rpc(client, "mealdeck_accept_ordering_invitation", [
          r.roomId,
          r.invitations[0].tokenHash,
          paymentHash(f.next()),
          "Other browser",
        ]),
      async (a, b) => {
        assert.equal(b.ok, false);
        assert.match(b.error.message, /invitation_unavailable/);
        assert.equal(o.ownPerson(a.rows[0].result).name, "Jay");
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from mealdeck_private.ordering_participants where room_id=$1 and state='joined'",
              [r.roomId],
            )
          ).rows[0].n,
          2,
        );
      },
    );
  });

  await test("native: different people can save concurrently using their own versions", async () => {
    const r = await o.room();
    await o.accept(r);
    const owner = o.ownPerson(await o.status(r));
    const person = o.ownPerson(await o.status(r, 1));
    await race(
      "independent member edits",
      (client) =>
        rpc(client, "mealdeck_update_ordering_choices", [
          r.roomId,
          r.actors[0],
          owner.version,
          JSON.stringify([o.pick()]),
        ]),
      (client) =>
        rpc(client, "mealdeck_update_ordering_choices", [
          r.roomId,
          r.actors[1],
          person.version,
          JSON.stringify([o.pick(2)]),
        ]),
      async (_a, b) => {
        assert.equal(b.ok, true, b.error?.message);
        assert.deepEqual(
          (await o.status(r)).people.map((person) => person.picks[0].quantity),
          [1, 2],
        );
      },
    );
  });

  await test("native: simultaneous finalise retries create one canonical quote and payment order", async () => {
    const r = await o.readyRoom();
    const data = await o.freezeArgs(r);
    const priorQuoteCount = (
      await db.query(
        "select count(*)::int n from mealdeck_private.checkout_quotes where request_hash=$1",
        [data.args[7]],
      )
    ).rows[0].n;
    await race(
      "idempotent freeze",
      (client) => rpc(client, "mealdeck_finalize_ordering_room", data.args),
      (client) => rpc(client, "mealdeck_finalize_ordering_room", data.args),
      async (a, b) => {
        assert.equal(b.ok, true, b.error?.message);
        assert.equal(a.rows[0].result.orderId, b.value.rows[0].result.orderId);
        const count = (
          await db.query(
            "select count(*)::int n from mealdeck_private.payment_orders where room_id=$1",
            [r.roomId],
          )
        ).rows[0].n;
        assert.equal(count, 1);
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from mealdeck_private.checkout_quotes where request_hash=$1",
              [data.args[7]],
            )
          ).rows[0].n,
          priorQuoteCount + 1,
        );
      },
    );
  });

  await test("native: an edit waiting behind freeze cannot change the paid packing snapshot", async () => {
    const r = await o.readyRoom();
    const data = await o.freezeArgs(r);
    const person = o.ownPerson(await o.status(r, 1));
    await race(
      "freeze/edit exclusion",
      (client) => rpc(client, "mealdeck_finalize_ordering_room", data.args),
      (client) =>
        rpc(client, "mealdeck_update_ordering_choices", [
          r.roomId,
          r.actors[1],
          person.version,
          JSON.stringify([o.pick(9)]),
        ]),
      async (_a, b) => {
        assert.equal(b.ok, false);
        assert.match(b.error.message, /frozen/);
        assert.deepEqual((await o.paymentStatus(r)).packingPlan, data.packing);
        assert.equal((await o.status(r)).people[1].picks[0].quantity, 2);
      },
    );
  });

  await test("native: a ready-state change wins before freeze and forces a fresh organiser revision", async () => {
    const r = await o.readyRoom();
    const data = await o.freezeArgs(r);
    const person = o.ownPerson(await o.status(r, 1));
    await race(
      "ready/freeze exclusion",
      (client) =>
        rpc(client, "mealdeck_set_ordering_ready", [r.roomId, r.actors[1], person.version, false]),
      (client) => rpc(client, "mealdeck_finalize_ordering_room", data.args),
      async (_a, b) => {
        assert.equal(b.ok, false);
        assert.match(b.error.message, /revision_conflict/);
        assert.equal((await o.status(r)).people[1].state, "joined");
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from mealdeck_private.payment_orders where room_id=$1",
              [r.roomId],
            )
          ).rows[0].n,
          0,
        );
      },
    );
  });

  await test("native: an accept queued before expiry still checks wall time after obtaining its lock", async () => {
    const r = await o.room();
    await race(
      "wall-clock join deadline",
      async (client) => {
        await rpc(client, "mealdeck_ordering_room_status", [r.roomId, r.actors[0]]);
        // Disposable fixture setup only, while holding the real application lock.
        await client.query("reset role");
        await client.query(
          "update mealdeck_private.ordering_rooms set join_deadline=clock_timestamp()+interval '100 milliseconds' where id=$1",
          [r.roomId],
        );
        await client.query("set local role service_role");
      },
      (client) =>
        rpc(client, "mealdeck_accept_ordering_invitation", [
          r.roomId,
          r.invitations[0].tokenHash,
          r.actors[1],
          "Jay",
        ]),
      async (_a, b) => {
        assert.equal(b.ok, false);
        assert.match(b.error.message, /invitation_unavailable/);
        assert.equal((await o.status(r)).people[1].state, "expired");
      },
      () => new Promise((resolve) => setTimeout(resolve, 180)),
    );
  });

  await test("native: cancellation before freeze cannot leave an orphan quote or payment room", async () => {
    const r = await o.readyRoom();
    const data = await o.freezeArgs(r);
    await race(
      "cancel/freeze exclusion",
      (client) =>
        rpc(client, "mealdeck_cancel_ordering_room", [r.roomId, r.actors[0], f.customer, null]),
      (client) => rpc(client, "mealdeck_finalize_ordering_room", data.args),
      async (_a, b) => {
        assert.equal(b.ok, false);
        assert.match(b.error.message, /frozen/);
        assert.equal((await o.status(r)).phase, "cancelled");
        assert.equal(
          (
            await db.query("select count(*)::int n from public.group_order_rooms where id=$1", [
              r.roomId,
            ])
          ).rows[0].n,
          0,
        );
      },
    );
  });

  await test("native: organiser cover cannot take an in-flight accepted participant payment", async () => {
    const r = await o.readyRoom();
    await o.freeze(r);
    const claim = async (client, index, customer, cover) => {
      const access = (
        await rpc(client, "mealdeck_ordering_payment_access", [
          r.roomId,
          r.actors[index],
          customer,
          null,
          cover,
        ])
      ).rows[0].result;
      return client.query(
        "select public.mealdeck_prepare_group_payment($1,$2,null,$3,$4,$5,'acct_Fixture',false) result",
        [r.roomId, customer, access.shareTokenHash, cover, f.next()],
      );
    };
    await race(
      "participant/cover reservation",
      (client) => claim(client, 1, f.otherCustomer, false),
      (client) => claim(client, 0, f.customer, true),
      async (a, b) => {
        assert.equal(b.ok, true, b.error?.message);
        assert.equal(a.rows[0].result.shareIds.length, 1);
        assert.equal(b.value.rows[0].result.shareIds.length, 1);
        assert.notEqual(a.rows[0].result.shareIds[0], b.value.rows[0].result.shareIds[0]);
        assert.equal(
          a.rows[0].result.amountPence + b.value.rows[0].result.amountPence,
          (await o.paymentStatus(r)).totalPence,
        );
      },
    );
  });
}
