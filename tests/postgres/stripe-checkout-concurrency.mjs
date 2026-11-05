import assert from "node:assert/strict";
import pg from "pg";
import { id } from "./harness.mjs";

/** Native PostgreSQL has two real sessions; PGlite cannot verify advisory-lock races. */
export async function checkoutHandoffConcurrencyTest(db, fixture, test) {
  assert.equal(db.native, true);
  await test("native concurrent checkouts wait on the kitchen allocation lock and receive distinct handoff codes", async () => {
    const quoteA = await fixture.quote();
    const quoteB = await fixture.quote();
    const first = new pg.Client({
      ...db.config,
      application_name: "mealdeck_checkout_handoff_first",
    });
    const second = new pg.Client({
      ...db.config,
      application_name: "mealdeck_checkout_handoff_second",
    });
    try {
      await Promise.all([first.connect(), second.connect()]);
      const firstPid = (await first.query("select pg_backend_pid() pid")).rows[0].pid;
      const secondPid = (await second.query("select pg_backend_pid() pid")).rows[0].pid;
      for (const client of [first, second]) {
        await client.query("begin");
        await client.query("set local role service_role");
        await client.query("select set_config('request.jwt.claim.role','service_role',true)");
        await client.query("select setseed(0.271828)");
      }
      const prepare = (client, quote, attempt) =>
        client.query(
          "select public.mealdeck_prepare_stripe_order($1,$2,$3,'acct_Fixture',false) as result",
          [quote.quoteId, fixture.customer, attempt],
        );
      const a = (await prepare(first, quoteA, id(8601))).rows[0].result;
      // Retain the first transaction's kitchen lock while the second starts.
      const pending = prepare(second, quoteB, id(8602)).then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error }),
      );
      const deadline = Date.now() + 2000;
      let blocked = false;
      while (Date.now() < deadline) {
        const state = (
          await db.query(
            `select $2::integer=any(pg_blocking_pids($1)) as blocked,
          exists(select 1 from pg_locks where pid=$1 and locktype='advisory' and not granted) as advisory`,
            [secondPid, firstPid],
          )
        ).rows[0];
        if (state.blocked && state.advisory) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(
        blocked,
        true,
        "Second checkout must wait specifically on the kitchen advisory lock",
      );
      await first.query("commit");
      const b = await pending;
      assert.equal(b.ok, true, b.error?.message);
      await second.query("commit");
      const rows = (
        await db.query(
          "select handoff_code,handoff_code_reserved from public.orders where id=any($1::uuid[])",
          [[a.orderId, b.value.rows[0].result.orderId]],
        )
      ).rows;
      assert.equal(rows.length, 2);
      assert.ok(rows.every((row) => row.handoff_code_reserved));
      assert.notEqual(rows[0].handoff_code, rows[1].handoff_code);
    } finally {
      await Promise.allSettled([first.query("rollback"), second.query("rollback")]);
      await Promise.allSettled([first.end(), second.end()]);
    }
  });
}
