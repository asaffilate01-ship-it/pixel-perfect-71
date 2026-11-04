import assert from "node:assert/strict";
import pg from "pg";
import { auditCount, board, fixture, id, seedOrder, states, transitionOrder } from "./harness.mjs";

async function beginStaff(client) {
  await client.query("begin");
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claim.sub',$1,true)", [fixture.kitchen]);
  await client.query("select set_config('request.jwt.claim.role','authenticated',true)");
}

async function blockedBy(db, waitingPid, holdingPid) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const result = await db.query("select pg_blocking_pids($1) as blockers", [waitingPid]);
    if (result.rows[0].blockers.includes(holdingPid)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Second PostgreSQL session did not wait on the first session's order lock");
}

async function withClients(db, run) {
  assert.equal(
    db.native,
    true,
    "Concurrency verification requires native PostgreSQL, not the single-connection PGlite engine",
  );
  const first = new pg.Client({ ...db.config, application_name: "mealdeck_kds_test_first" });
  const second = new pg.Client({ ...db.config, application_name: "mealdeck_kds_test_second" });
  try {
    await Promise.all([first.connect(), second.connect()]);
    const firstPid = (await first.query("select pg_backend_pid() as pid")).rows[0].pid;
    const secondPid = (await second.query("select pg_backend_pid() as pid")).rows[0].pid;
    await run({ first, second, firstPid, secondPid });
  } finally {
    await Promise.allSettled([first.query("rollback"), second.query("rollback")]);
    await Promise.allSettled([first.end(), second.end()]);
  }
}

function orderQuery(client, order, version, status) {
  return client.query("select public.mealdeck_ops_kds_transition_order($1,$2,$3,$4,$5) as result", [
    fixture.tenant,
    fixture.location,
    order,
    version,
    status,
  ]);
}

function passQuery(client, order, version, status) {
  return client.query("select public.mealdeck_ops_kds_transition_pass($1,$2,$3,$4,$5) as result", [
    fixture.tenant,
    fixture.location,
    order,
    version,
    status,
  ]);
}

const outcome = (promise) =>
  promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );

async function currentCard(db, order) {
  const snapshot = await board(db);
  const result = snapshot.orders.find((entry) => entry.order_id === order);
  assert.ok(result, "Fixture order must be visible before the race starts");
  return result;
}

export async function concurrencyTests(db, test) {
  await test("native two-session double-click serializes and returns one success plus one replay with a single audit", async () => {
    const entry = await seedOrder(db, 2001);
    const card = await currentCard(db, entry.order);
    await withClients(db, async ({ first, second, firstPid, secondPid }) => {
      await beginStaff(first);
      const initial = await orderQuery(first, entry.order, card.version, "preparing");
      assert.equal(initial.rows[0].result.replayed, false);
      await beginStaff(second);
      const secondResult = outcome(orderQuery(second, entry.order, card.version, "preparing"));
      await blockedBy(db, secondPid, firstPid);
      await first.query("commit");
      const duplicate = await secondResult;
      assert.equal(duplicate.ok, true);
      assert.equal(duplicate.value.rows[0].result.replayed, true);
      await second.query("commit");
    });
    const actual = await states(db, entry.order);
    assert.ok(actual.tickets.every((ticket) => ticket.status === "preparing"));
    assert.ok(actual.lines.every((line) => line.status === "preparing"));
    assert.equal(actual.audit, 1);
  });

  await test("native concurrent next-step request with an old version waits, then rejects without partially ready brands", async () => {
    const entry = await seedOrder(db, 2002);
    const card = await currentCard(db, entry.order);
    await withClients(db, async ({ first, second, firstPid, secondPid }) => {
      await beginStaff(first);
      await orderQuery(first, entry.order, card.version, "preparing");
      await beginStaff(second);
      const secondResult = outcome(orderQuery(second, entry.order, card.version, "ready"));
      await blockedBy(db, secondPid, firstPid);
      await first.query("commit");
      const stale = await secondResult;
      assert.equal(stale.ok, false);
      assert.match(stale.error.message, /conflict|stale|version/i);
      await second.query("rollback");
    });
    const actual = await states(db, entry.order);
    assert.equal(actual.orders[0].status, "preparing");
    assert.ok(actual.tickets.every((ticket) => ticket.status === "preparing"));
    assert.ok(actual.lines.every((line) => line.status === "preparing"));
    assert.equal(actual.audit, 1);
    assert.ok(actual.pass.length === 0 || actual.pass[0].status === "waiting_for_kitchen");
  });

  await test("native pass actions serialize and stale sealing cannot skip a reviewed packing state", async () => {
    const entry = await seedOrder(db, 2003);
    let card = await currentCard(db, entry.order);
    await transitionOrder(db, entry.order, card.version, "preparing");
    card = await currentCard(db, entry.order);
    await transitionOrder(db, entry.order, card.version, "ready");
    card = await currentCard(db, entry.order);
    const beforeAudit = await auditCount(db, entry.order);
    await withClients(db, async ({ first, second, firstPid, secondPid }) => {
      await beginStaff(first);
      await passQuery(first, entry.order, card.pass.version, "packing");
      await beginStaff(second);
      const secondResult = outcome(passQuery(second, entry.order, card.pass.version, "sealed"));
      await blockedBy(db, secondPid, firstPid);
      await first.query("commit");
      const stale = await secondResult;
      assert.equal(stale.ok, false);
      assert.match(stale.error.message, /conflict|stale|version/i);
      await second.query("rollback");
    });
    const actual = await states(db, entry.order);
    assert.deepEqual(actual.pass, [{ status: "packing" }]);
    assert.equal(actual.orders[0].status, "ready");
    assert.equal(actual.audit, beforeAudit + 1);
  });

  await test("native payment cancellation winning the order lock prevents a waiting kitchen action", async () => {
    const entry = await seedOrder(db, 2004);
    const card = await currentCard(db, entry.order);
    const before = await states(db, entry.order);
    await withClients(db, async ({ first, second, firstPid, secondPid }) => {
      // The first fixture session represents the canonical server completing a
      // refund. This is a disposable local database, never a provider payment.
      await first.query("begin");
      await first.query(
        "update public.orders set payment_status='refunded',status='refunded' where id=$1",
        [entry.order],
      );
      await beginStaff(second);
      const secondResult = outcome(orderQuery(second, entry.order, card.version, "preparing"));
      await blockedBy(db, secondPid, firstPid);
      await first.query("commit");
      const rejected = await secondResult;
      assert.equal(rejected.ok, false);
      assert.match(
        rejected.error.message,
        /order_unavailable|release_required|payment|eligible|not_found/i,
      );
      await second.query("rollback");
    });
    const actual = await states(db, entry.order);
    assert.equal(actual.orders[0].status, "refunded");
    assert.deepEqual(actual.tickets, before.tickets);
    assert.deepEqual(actual.lines, before.lines);
    assert.deepEqual(actual.pass, before.pass);
    assert.equal(actual.audit, 0);
    assert.ok(!(await board(db)).orders.some((order) => order.order_id === entry.order));
  });

  await test("native permission revocation during a lock wait prevents the previously admitted staff request", async () => {
    const entry = await seedOrder(db, 2005);
    const card = await currentCard(db, entry.order);
    const before = await states(db, entry.order);
    try {
      await withClients(db, async ({ first, second, firstPid, secondPid }) => {
        await first.query("begin");
        await first.query("select id from public.orders where id=$1 for update", [entry.order]);
        await beginStaff(second);
        const secondResult = outcome(orderQuery(second, entry.order, card.version, "preparing"));
        await blockedBy(db, secondPid, firstPid);
        await db.query(
          "update public.mealdeck_ops_staff_access set enabled=false where user_id=$1",
          [fixture.kitchen],
        );
        await first.query("commit");
        const rejected = await secondResult;
        assert.equal(rejected.ok, false);
        assert.match(rejected.error.message, /forbidden|denied|permission/i);
        await second.query("rollback");
      });
      assert.deepEqual(await states(db, entry.order), before);
    } finally {
      await db.query("update public.mealdeck_ops_staff_access set enabled=true where user_id=$1", [
        fixture.kitchen,
      ]);
    }
  });

  await test("native routing deletion winning a route lock prevents partial readiness after the wait", async () => {
    const entry = await seedOrder(db, 2006);
    let card = await currentCard(db, entry.order);
    await transitionOrder(db, entry.order, card.version, "preparing");
    card = await currentCard(db, entry.order);
    const before = await states(db, entry.order);
    const route = (
      await db.query(
        "select * from public.menu_item_station_routes where item_id=$1 and location_id=$2",
        [id(53), fixture.location],
      )
    ).rows[0];
    assert.ok(route);
    try {
      await withClients(db, async ({ first, second, firstPid, secondPid }) => {
        await first.query("begin");
        await first.query(
          "delete from public.menu_item_station_routes where location_id=$1 and item_id=$2 and station_id=$3",
          [route.location_id, route.item_id, route.station_id],
        );
        await beginStaff(second);
        const secondResult = outcome(orderQuery(second, entry.order, card.version, "ready"));
        await blockedBy(db, secondPid, firstPid);
        await first.query("commit");
        const rejected = await secondResult;
        assert.equal(rejected.ok, false);
        assert.match(rejected.error.message, /routing|route|conflict|version/i);
        await second.query("rollback");
      });
      assert.deepEqual(await states(db, entry.order), before);
    } finally {
      await db.query(
        "insert into public.menu_item_station_routes(tenant_id,location_id,item_id,station_id,prep_kind,prep_seconds) values($1,$2,$3,$4,$5,$6) on conflict do nothing",
        [
          route.tenant_id,
          route.location_id,
          route.item_id,
          route.station_id,
          route.prep_kind,
          route.prep_seconds,
        ],
      );
    }
  });
}
