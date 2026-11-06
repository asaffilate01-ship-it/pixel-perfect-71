import assert from "node:assert/strict";
import { createDatabase, asActor, id } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";
import { buildKitchenPrinterSql } from "../../deploy/mealdeck/kitchen-printer.mjs";
import {
  buildKdsSixStagesSql,
  buildManagedKdsSixStagesSql,
} from "../../deploy/mealdeck/kds-six-stages.mjs";

const db = await createDatabase(process.argv.includes("--native"));
let checks = 0;
async function test(label, action) {
  await action();
  console.log(`PASS six-stage KDS ${++checks}: ${label}`);
}
try {
  const f = await setupStripeCheckoutFixture(db);
  await db.exec(buildKitchenPrinterSql());
  const rpc = async (name, args, actor = f.owner, role = "authenticated") => {
    assert.match(name, /^mealdeck_ops_kds_[a-z0-9_]+$/);
    return asActor(
      db,
      actor,
      async () =>
        (
          await db.query(
            `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as result`,
            args,
          )
        ).rows[0].result,
      role,
    );
  };
  const scope = [f.tenantId, f.locationId];
  const board = () => rpc("mealdeck_ops_kds_board_v2", scope);
  const card = async (order) => (await board()).orders.find((x) => x.order_id === order);
  const action = (name, order, ...args) => rpc(name, [...scope, order, ...args]);
  await test("atomic install rolls back and a complete rerun is safe", async () => {
    assert.throws(
      () => buildManagedKdsSixStagesSql({ runnerOwnsTransaction: true }),
      /one runner-owned/,
    );
    await db.exec("begin");
    await db.exec(
      buildManagedKdsSixStagesSql({ runnerOwnsTransaction: true, singleMigration: true }),
    );
    await db.exec("rollback");
    assert.equal(
      (await db.query("select to_regprocedure('public.mealdeck_ops_kds_board_v2(uuid,uuid)') as f"))
        .rows[0].f,
      null,
    );
    await db.exec(buildKdsSixStagesSql());
    await db.exec(buildKdsSixStagesSql());
    assert.deepEqual((await board()).completed_orders, []);
  });
  await test("authenticated role alone, customer identity and another kitchen cannot read history", async () => {
    await assert.rejects(() => rpc("mealdeck_ops_kds_board_v2", scope, f.customer), /forbidden/);
    await assert.rejects(
      () => rpc("mealdeck_ops_kds_board_v2", scope, null, "anon"),
      /permission denied/,
    );
    await assert.rejects(
      () => rpc("mealdeck_ops_kds_board_v2", scope, null, "service_role"),
      /permission denied/,
    );
    await assert.rejects(
      () => rpc("mealdeck_ops_kds_board_v2", [f.tenantId, id(999)], f.owner),
      /forbidden/,
    );
    const grants = (
      await db.query(`select
      has_function_privilege('authenticated','public.mealdeck_ops_kds_board_v2(uuid,uuid)','EXECUTE') as staff,
      has_function_privilege('anon','public.mealdeck_ops_kds_board_v2(uuid,uuid)','EXECUTE') as guest`)
    ).rows[0];
    assert.equal(grants.staff, true);
    assert.equal(grants.guest, false);
  });
  const q = await f.quote();
  const payment = await f.prepare(q.quoteId, { attemptId: id(9911) });
  await f.bind(payment.orderId, "cs_test_sixstages");
  await f.reconcile(payment, {
    event: "evt_sixstages",
    intent: "pi_sixstages",
    session: "cs_test_sixstages",
  });
  const order = payment.orderId;
  await test("New is paid but unaccepted, and cannot skip staff acceptance", async () => {
    const c = await card(order);
    assert.equal(c.accepted_at, null);
    assert.equal(c.preparation_status, "queued");
    await assert.rejects(
      () => action("mealdeck_ops_kds_transition_order", order, c.version, "preparing"),
      /accept_required/,
    );
    assert.equal((await board()).completed_orders.length, 0);
  });
  await test("Accepted stays distinct from Preparing and queues exactly one receipt", async () => {
    const c = await card(order);
    await action("mealdeck_ops_kds_accept_order", order, c.version);
    await action("mealdeck_ops_kds_accept_order", order, c.version);
    const accepted = await card(order);
    assert(accepted.accepted_at);
    assert.equal(accepted.preparation_status, "queued");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from mealdeck_private.receipt_jobs where order_id=$1",
          [order],
        )
      ).rows[0].n,
      1,
    );
    await action("mealdeck_ops_kds_transition_order", order, accepted.version, "preparing");
    assert.equal((await card(order)).preparation_status, "preparing");
  });
  await test("every item must be ready before packing and packing must finish before handover", async () => {
    let c = await card(order);
    await assert.rejects(
      () => action("mealdeck_ops_kds_transition_order", order, c.version, "ready"),
      /all_items_required/,
    );
    for (const item of c.items) {
      c = await card(order);
      await action("mealdeck_ops_kds_set_item_ready", order, item.order_item_id, c.version, true);
    }
    c = await card(order);
    assert.equal(c.preparation_status, "ready");
    assert.equal(c.pass.status, "ready_to_pack");
    await assert.rejects(
      () => action("mealdeck_ops_kds_complete_handoff", order, c.version, c.display_code),
      /not_ready/,
    );
    await action("mealdeck_ops_kds_transition_pass", order, c.pass.version, "packing");
    c = await card(order);
    assert.equal(c.pass.status, "packing");
    await action("mealdeck_ops_kds_transition_pass", order, c.pass.version, "sealed");
    c = await card(order);
    assert.equal(c.pass.status, "ready_for_handoff");
    assert.equal((await board()).completed_orders.length, 0);
  });
  let completedCode;
  await test("confirmed handover moves the original order to read-only Done, never a new ticket", async () => {
    const c = await card(order);
    completedCode = c.display_code;
    await assert.rejects(
      () => action("mealdeck_ops_kds_complete_handoff", order, c.version, "NOPE"),
      /handoff_code_required/,
    );
    await action("mealdeck_ops_kds_complete_handoff", order, c.version, c.display_code);
    assert.equal(await card(order), undefined);
    const b = await board();
    const done = b.completed_orders.find((x) => x.order_id === order);
    assert.equal(done.order_status, "fulfilled");
    assert.equal(done.pass.status, "handed_off");
    assert.equal(done.display_code, completedCode);
    assert(done.completed_at);
    assert.deepEqual(done.items, c.items);
    assert.equal(
      (await action("mealdeck_ops_kds_complete_handoff", order, c.version, c.display_code))
        .replayed,
      true,
    );
    await assert.rejects(
      () => action("mealdeck_ops_kds_accept_order", order, done.version),
      /unavailable|release_required/,
    );
    for (let i = 0; i < 3; i++) await board();
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from mealdeck_private.receipt_jobs where order_id=$1",
          [order],
        )
      ).rows[0].n,
      1,
    );
    assert.equal((await rpc("mealdeck_ops_kds_board", scope)).orders.length, 0);
  });
  await test("old or future handovers are not put into the current Done queue", async () => {
    const original = (
      await db.query("select handed_off_at from public.mealdeck_pass_orders where order_id=$1", [
        order,
      ])
    ).rows[0].handed_off_at;
    for (const interval of ["-25 hours", "1 hour"]) {
      await db.query(
        "update public.mealdeck_pass_orders set handed_off_at=now()+$2::interval where order_id=$1",
        [order, interval],
      );
      assert.equal((await board()).completed_orders.length, 0);
    }
    await db.query("update public.mealdeck_pass_orders set handed_off_at=$2 where order_id=$1", [
      order,
      original,
    ]);
    assert.equal((await board()).completed_orders.length, 1);
  });
  await test("payment authority and staff verification still govern Done history", async () => {
    await db.query("update mealdeck_private.stripe_orders set refunded_pence=1 where order_id=$1", [
      order,
    ]);
    assert.equal((await board()).completed_orders.length, 0);
    await db.query("update mealdeck_private.stripe_orders set refunded_pence=0 where order_id=$1", [
      order,
    ]);
    await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1", [
      f.owner,
    ]);
    await assert.rejects(board, /forbidden/);
  });
  console.log(`PASS all ${checks} six-stage KDS database checks`);
} finally {
  await db.close();
}
