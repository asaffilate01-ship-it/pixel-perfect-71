import assert from "node:assert/strict";
import pg from "pg";

export async function staffCashConcurrencyTests(db, f, check) {
  assert.equal(db.native, true);
  const pair = async () => {
    const first = new pg.Client({ ...db.config, application_name: "mealdeck_cash_first" });
    const second = new pg.Client({ ...db.config, application_name: "mealdeck_cash_second" });
    await Promise.all([first.connect(), second.connect()]);
    const pid = async (client) => (await client.query("select pg_backend_pid() id")).rows[0].id;
    return {
      first,
      second,
      firstPid: await pid(first),
      secondPid: await pid(second),
      begin: async (client, service = true) => {
        await client.query("begin");
        if (service) await client.query("set local role service_role");
      },
      close: async () => {
        await Promise.allSettled([first.query("rollback"), second.query("rollback")]);
        await Promise.allSettled([first.end(), second.end()]);
      },
    };
  };
  const blocked = async (waiting, holder) => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if (
        (await db.query("select $2::int=any(pg_blocking_pids($1)) blocked", [waiting, holder]))
          .rows[0].blocked
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail("Concurrent cash request must wait on the actual held transaction lock");
  };
  const settle = (promise) =>
    promise.then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error }),
    );
  const rpc = (client, action, q, attempt) =>
    client.query(
      `select public.mealdeck_${action === "confirm" ? "confirm_cash_order" : action === "cancel" ? "cancel_cash_order_attempt" : "cash_order_status"}($1,$2,$3,$4,$5${action === "confirm" ? ",true" : ""}) result`,
      f.cashArgs(q, attempt),
    );
  const noDuplicate = async (q, id) => {
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from mealdeck_private.cash_orders where quote_id=$1",
          [q.quoteId],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.mealdeck_ops_audit_log where entity_id=$1 and action='cash.received'",
          [id],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from mealdeck_private.order_numbers where order_id=$1",
          [id],
        )
      ).rows[0].n,
      1,
    );
  };

  await check(
    "native: duplicate and different-attempt confirmation of one quote commit one cash order",
    async () => {
      for (const sameAttempt of [true, false]) {
        await f.ageQuotes();
        const q = await f.cashQuote();
        const attempt = f.next();
        const c = await pair();
        try {
          await c.begin(c.first);
          await c.begin(c.second);
          const first = (await rpc(c.first, "confirm", q, attempt)).rows[0].result;
          const waiting = settle(rpc(c.second, "confirm", q, sameAttempt ? attempt : f.next()));
          await blocked(c.secondPid, c.firstPid);
          await c.first.query("commit");
          const result = await waiting;
          assert.equal(result.ok, true, result.error?.message);
          assert.equal(result.value.rows[0].result.order.orderId, first.order.orderId);
          assert.equal(result.value.rows[0].result.replayed, true);
          await c.second.query("commit");
          await noDuplicate(q, first.order.orderId);
        } finally {
          await c.close();
        }
      }
    },
  );

  await check(
    "native: recovery waits for confirmation commit or rollback before reporting saved/null",
    async () => {
      for (const commit of [true, false]) {
        await f.ageQuotes();
        const q = await f.cashQuote();
        const attempt = f.next();
        const c = await pair();
        try {
          await c.begin(c.first);
          await c.begin(c.second);
          const first = (await rpc(c.first, "confirm", q, attempt)).rows[0].result;
          const waiting = settle(rpc(c.second, "status", q, attempt));
          await blocked(c.secondPid, c.firstPid);
          await c.first.query(commit ? "commit" : "rollback");
          const result = await waiting;
          assert.equal(result.ok, true, result.error?.message);
          assert.equal(
            result.value.rows[0].result.order?.orderId ?? null,
            commit ? first.order.orderId : null,
          );
          await c.second.query("commit");
        } finally {
          await c.close();
        }
      }
    },
  );

  await check(
    "native: closing the unused attempt first blocks every delayed confirmation",
    async () => {
      for (const sameAttempt of [true, false]) {
        await f.ageQuotes();
        const q = await f.cashQuote();
        const attempt = f.next();
        const c = await pair();
        try {
          await c.begin(c.first);
          await c.begin(c.second);
          assert.equal((await rpc(c.first, "cancel", q, attempt)).rows[0].result.cancelled, true);
          const waiting = settle(rpc(c.second, "confirm", q, sameAttempt ? attempt : f.next()));
          await blocked(c.secondPid, c.firstPid);
          await c.first.query("commit");
          const result = await waiting;
          assert.equal(result.ok, false);
          assert.match(result.error.message, /cash_attempt_closed/);
          await c.second.query("rollback");
          assert.equal((await f.cashStatus(q, attempt)).order, null);
        } finally {
          await c.close();
        }
      }
    },
  );

  await check(
    "native: confirmation winning before close returns its existing tender unchanged",
    async () => {
      await f.ageQuotes();
      const q = await f.cashQuote();
      const attempt = f.next();
      const c = await pair();
      try {
        await c.begin(c.first);
        await c.begin(c.second);
        const first = (await rpc(c.first, "confirm", q, attempt)).rows[0].result;
        const waiting = settle(rpc(c.second, "cancel", q, attempt));
        await blocked(c.secondPid, c.firstPid);
        await c.first.query("commit");
        const result = await waiting;
        assert.equal(result.ok, true, result.error?.message);
        assert.equal(result.value.rows[0].result.order.orderId, first.order.orderId);
        assert.equal(result.value.rows[0].result.cancelled, false);
        await c.second.query("commit");
        await noDuplicate(q, first.order.orderId);
      } finally {
        await c.close();
      }
    },
  );

  await check(
    "native: a concurrent newly inserted staff denial is seen before cash confirmation",
    async () => {
      await f.ageQuotes();
      const q = await f.cashQuote();
      const attempt = f.next();
      const c = await pair();
      try {
        await c.begin(c.first, false);
        await c.begin(c.second);
        await c.first.query(
          "insert into public.mealdeck_ops_staff_access(tenant_id,location_id,user_id,role,deny_permissions) values($1,$2,$3,'viewer',array['payments.collect'])",
          [f.tenantId, f.locationId, f.owner],
        );
        const waiting = settle(rpc(c.second, "confirm", q, attempt));
        await blocked(c.secondPid, c.firstPid);
        await c.first.query("commit");
        const result = await waiting;
        assert.equal(result.ok, false);
        assert.match(result.error.message, /staff_forbidden/);
        await c.second.query("rollback");
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from mealdeck_private.cash_orders where quote_id=$1",
              [q.quoteId],
            )
          ).rows[0].n,
          0,
        );
      } finally {
        await c.close();
        await db.query(
          "delete from public.mealdeck_ops_staff_access where tenant_id=$1 and location_id=$2 and user_id=$3",
          [f.tenantId, f.locationId, f.owner],
        );
      }
    },
  );
}
