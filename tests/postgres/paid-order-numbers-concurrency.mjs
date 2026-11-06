import assert from "node:assert/strict";
import pg from "pg";
import {
  buildPaidOrderNumbersSql,
  buildManagedPaidOrderNumbersSql,
} from "../../deploy/mealdeck/paid-order-numbers.mjs";

export async function paidOrderNumberConcurrencyTests(db, f, test) {
  assert.equal(db.native, true);
  const counter = async () =>
    (
      await db.query(
        "select last_number::text from mealdeck_private.order_number_counters where tenant_id=$1 and location_id=$2",
        [f.tenantId, f.locationId],
      )
    ).rows[0].last_number;
  const clients = async () => {
    const first = new pg.Client({ ...db.config, application_name: "mealdeck_number_first" });
    const second = new pg.Client({ ...db.config, application_name: "mealdeck_number_second" });
    await Promise.all([first.connect(), second.connect()]);
    const begin = async (client, service = true) => {
      await client.query("begin");
      if (service) {
        await client.query("set local role service_role");
        await client.query("select set_config('request.jwt.claim.role','service_role',true)");
      }
    };
    const close = async () => {
      await Promise.allSettled([first.query("rollback"), second.query("rollback")]);
      await Promise.allSettled([first.end(), second.end()]);
    };
    const pid = async (client) => (await client.query("select pg_backend_pid() pid")).rows[0].pid;
    return {
      first,
      second,
      begin,
      close,
      firstPid: await pid(first),
      secondPid: await pid(second),
    };
  };
  const blocked = async (waiting, holder) => {
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      if (
        (await db.query("select $2::int=any(pg_blocking_pids($1)) blocked", [waiting, holder]))
          .rows[0].blocked
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail("Second transaction must wait on the actual held database lock");
  };
  const settle = (promise) =>
    promise.then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error }),
    );
  const pair = async () => [
    await f.prepareOrdinary(),
    await f.prepareOrdinary({ lines: [{ ...f.line, sku: "tavo-chicken-sides-fries" }] }),
  ];

  await test("native: different paid orders serialize on the scope counter at commit", async () => {
    const [a, b] = await pair();
    const before = BigInt(await counter());
    const c = await clients();
    try {
      await c.begin(c.first);
      await c.begin(c.second);
      await f.rawReconcile(c.first, a);
      await c.first.query("set constraints mealdeck_verified_paid_order_number immediate");
      // Different menu rows avoid a routing lock hiding the counter test.
      await f.rawReconcile(c.second, b);
      const pending = settle(c.second.query("commit"));
      await blocked(c.secondPid, c.firstPid);
      await c.first.query("commit");
      const result = await pending;
      assert.equal(result.ok, true, result.error?.message);
      assert.equal(await f.number(a.orderId), String(before + 1n).padStart(4, "0"));
      assert.equal(await f.number(b.orderId), String(before + 2n).padStart(4, "0"));
    } finally {
      await c.close();
    }
  });

  await test("native: concurrent duplicate webhook returns one number and one assignment audit", async () => {
    const order = await f.prepareOrdinary();
    const before = BigInt(await counter());
    const c = await clients();
    try {
      await c.begin(c.first);
      await c.begin(c.second);
      await f.rawReconcile(c.first, order);
      const pending = settle(f.rawReconcile(c.second, order));
      await blocked(c.secondPid, c.firstPid);
      await c.first.query("commit");
      const result = await pending;
      assert.equal(result.ok, true, result.error?.message);
      assert.equal(result.value.rows[0].result.replayed, true);
      await c.second.query("commit");
      assert.equal(await f.number(order.orderId), String(before + 1n).padStart(4, "0"));
      assert.equal(await counter(), String(before + 1n));
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.mealdeck_ops_audit_log where action='order.number_assigned' and entity_id=$1",
            [order.orderId],
          )
        ).rows[0].n,
        1,
      );
    } finally {
      await c.close();
    }
  });

  await test("native: rollback releases the reserved number to the next waiting paid order", async () => {
    const [a, b] = await pair();
    const before = BigInt(await counter());
    const c = await clients();
    try {
      await c.begin(c.first);
      await c.begin(c.second);
      await f.rawReconcile(c.first, a);
      await c.first.query("set constraints mealdeck_verified_paid_order_number immediate");
      await f.rawReconcile(c.second, b);
      const pending = settle(c.second.query("commit"));
      await blocked(c.secondPid, c.firstPid);
      await c.first.query("rollback");
      const result = await pending;
      assert.equal(result.ok, true, result.error?.message);
      assert.equal(await f.number(a.orderId), null);
      assert.equal(await f.number(b.orderId), String(before + 1n).padStart(4, "0"));
      assert.equal(await counter(), String(before + 1n));
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from mealdeck_private.stripe_events where order_id=$1",
            [a.orderId],
          )
        ).rows[0].n,
        0,
      );
    } finally {
      await c.close();
    }
  });

  await test("native: a payment committed after migration-start forces a safe retry then joins backfill", async () => {
    const order = await f.prepareOrdinary();
    const before = BigInt(await counter());
    // Disposable fixture models the interval before initial trigger installation.
    await db.exec("drop trigger mealdeck_verified_paid_order_number on public.orders");
    const c = await clients();
    try {
      await c.begin(c.first, false);
      await c.first.query("select now()");
      await new Promise((resolve) => setTimeout(resolve, 20));
      await c.begin(c.second);
      await f.rawReconcile(c.second, order);
      await c.second.query("commit");
      assert.equal(await f.number(order.orderId), null);
      await assert.rejects(
        () =>
          c.first.query(
            buildManagedPaidOrderNumbersSql({ runnerOwnsTransaction: true, singleMigration: true }),
          ),
        /retry_new_transaction/,
      );
      await c.first.query("rollback");
      await db.exec(buildPaidOrderNumbersSql());
      assert.equal(await f.number(order.orderId), String(before + 1n).padStart(4, "0"));
      assert.equal(await counter(), String(before + 1n));
      assert.equal(
        (
          await db.query(
            "select tgdeferrable and tginitdeferred enabled from pg_trigger where tgname='mealdeck_verified_paid_order_number'",
          )
        ).rows[0].enabled,
        true,
      );
    } finally {
      await c.close();
    }
  });
}
