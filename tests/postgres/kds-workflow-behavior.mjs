import assert from "node:assert/strict";
import { createDatabase, asActor, id } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";
import { buildKitchenPrinterSql } from "../../deploy/mealdeck/kitchen-printer.mjs";
import { buildKdsWorkflowSql } from "../../deploy/mealdeck/kds-workflow.mjs";
const db = await createDatabase(process.argv.includes("--native"));
let checks = 0;
async function check(label, fn) {
  await fn();
  console.log(`PASS six-stage KDS ${++checks}: ${label}`);
}
try {
  const f = await setupStripeCheckoutFixture(db);
  await db.exec(buildKitchenPrinterSql());
  const old = (
    await db.query(
      "select md5(prosrc) as hash from pg_proc where oid='public.mealdeck_ops_kds_board(uuid,uuid)'::regprocedure",
    )
  ).rows[0].hash;
  await db.exec(buildKdsWorkflowSql());
  await db.exec(buildKdsWorkflowSql());
  const rpc = (user, name, args = [], role = "authenticated") =>
    asActor(
      db,
      user,
      async () =>
        (
          await db.query(
            `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as r`,
            args,
          )
        ).rows[0].r,
      role,
    );
  const board = () => rpc(f.owner, "mealdeck_ops_kds_workflow_board", [f.tenantId, f.locationId]);
  const q = await f.quote();
  const o = await f.prepare(q.quoteId, { attemptId: id(98101) });
  const card = async () => (await board()).orders.find((c) => c.order_id === o.orderId);
  const act = async (name, extra = []) =>
    rpc(f.owner, name, [f.tenantId, f.locationId, o.orderId, ...extra]);
  await check(
    "only authenticated permitted kitchen roles can read the new projection",
    async () => {
      await assert.rejects(
        () => rpc(null, "mealdeck_ops_kds_workflow_board", [f.tenantId, f.locationId], "anon"),
        /permission denied/,
      );
      await assert.rejects(
        () => rpc(f.customer, "mealdeck_ops_kds_workflow_board", [f.tenantId, f.locationId]),
        /forbidden/,
      );
      await assert.rejects(
        () => rpc(f.owner, "mealdeck_ops_kds_workflow_board", [f.tenantId, id(99111)]),
        /forbidden/,
      );
      assert.equal(
        (
          await db.query(
            "select has_function_privilege('service_role','public.mealdeck_ops_kds_workflow_board(uuid,uuid)','execute') as allowed",
          )
        ).rows[0].allowed,
        false,
      );
      assert.equal(
        (
          await db.query(
            "select md5(prosrc) as hash from pg_proc where oid='public.mealdeck_ops_kds_board(uuid,uuid)'::regprocedure",
          )
        ).rows[0].hash,
        old,
      );
    },
  );
  await check("unpaid order is neither New nor Done", async () => {
    assert.equal((await board()).orders.length, 0);
    assert.equal((await board()).completed_orders.length, 0);
  });
  await f.bind(o.orderId, "cs_test_workflow");
  await f.reconcile(o, {
    event: "evt_workflow",
    intent: "pi_workflow",
    session: "cs_test_workflow",
  });
  await check(
    "New is paid but not accepted, and acceptance queues exactly one receipt",
    async () => {
      const c = await card();
      assert.equal(c.accepted_at, null);
      await assert.rejects(
        () => act("mealdeck_ops_kds_transition_order", [c.version, "preparing"]),
        /accept_required/,
      );
      await act("mealdeck_ops_kds_accept_order", [c.version]);
      await act("mealdeck_ops_kds_accept_order", [c.version]);
      assert((await card()).accepted_at);
      assert.equal((await card()).preparation_status, "queued");
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from mealdeck_private.receipt_jobs where order_id=$1",
            [o.orderId],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await check("preparation and the full item checklist precede Ready to pack", async () => {
    await act("mealdeck_ops_kds_transition_order", [(await card()).version, "preparing"]);
    for (const item of (await card()).items) {
      await act("mealdeck_ops_kds_set_item_ready", [
        item.order_item_id,
        (await card()).version,
        true,
      ]);
    }
    assert.equal((await card()).preparation_status, "ready");
    assert.equal((await card()).pass.status, "ready_to_pack");
  });
  await check(
    "packing confirmation precedes handover and a wrong code cannot finish an order",
    async () => {
      await act("mealdeck_ops_kds_transition_pass", [(await card()).pass.version, "packing"]);
      assert.equal((await card()).pass.status, "packing");
      assert.equal((await board()).completed_orders.length, 0);
      await act("mealdeck_ops_kds_transition_pass", [(await card()).pass.version, "sealed"]);
      assert.equal((await card()).pass.status, "ready_for_handoff");
      await assert.rejects(
        async () => act("mealdeck_ops_kds_complete_handoff", [(await card()).version, "bad"]),
        /handoff_code_required/,
      );
    },
  );
  const before = await card();
  const code = (await db.query("select handoff_code from public.orders where id=$1", [o.orderId]))
    .rows[0].handoff_code;
  await check(
    "confirmed handover moves the order to durable Done and replay does not print again",
    async () => {
      await act("mealdeck_ops_kds_complete_handoff", [before.version, code]);
      const replay = await act("mealdeck_ops_kds_complete_handoff", [before.version, code]);
      assert.equal(replay.replayed, true);
      for (let i = 0; i < 2; i++) {
        const b = await board();
        assert.equal(b.orders.length, 0);
        assert.equal(b.completed_orders.length, 1);
        const c = b.completed_orders[0];
        assert.equal(c.order_id, o.orderId);
        assert.equal(c.order_status, "fulfilled");
        assert.equal(c.handoff_status, "handed_off");
        assert(c.completed_at);
        assert.equal(c.display_code, code);
        assert.equal(c.items[0].item_name, before.items[0].item_name);
        assert.deepEqual(c.items[0].bags, before.items[0].bags);
      }
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from mealdeck_private.receipt_jobs where order_id=$1",
            [o.orderId],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await check(
    "missing handover, future completion and older history cannot appear Done",
    async () => {
      for (const assignment of [
        "handed_off_at=null",
        "handed_off_at=now()+interval '1 hour'",
        "handed_off_at=now()-interval '13 hours'",
      ]) {
        await db.exec("begin");
        try {
          await db.query(`update public.mealdeck_pass_orders set ${assignment} where order_id=$1`, [
            o.orderId,
          ]);
          assert.equal((await board()).completed_orders.length, 0);
        } finally {
          await db.exec("rollback");
        }
      }
    },
  );
  await check(
    "refunded payment state is not presented as an eligible completed order",
    async () => {
      await db.exec("begin");
      try {
        await db.query("update public.orders set payment_status='refunded' where id=$1", [
          o.orderId,
        ]);
        assert.equal((await board()).completed_orders.length, 0);
      } finally {
        await db.exec("rollback");
      }
    },
  );
  console.log(`PASS ${checks} six-stage KDS database behavior groups`);
} finally {
  await db.close();
}
