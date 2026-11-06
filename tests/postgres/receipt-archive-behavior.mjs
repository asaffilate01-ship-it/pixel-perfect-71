import assert from "node:assert/strict";
import { asActor, createDatabase, id } from "./harness.mjs";
import { setupPaidOrderNumbersFixture } from "./paid-order-numbers-fixture.mjs";
import { buildPaidOrderNumbersSql } from "../../deploy/mealdeck/paid-order-numbers.mjs";
import {
  buildReceiptArchiveSql,
  buildManagedReceiptArchiveSql,
} from "../../deploy/mealdeck/receipt-archive.mjs";

const db = await createDatabase(process.argv.includes("--native"));
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
let checks = 0;
async function check(label, action) {
  await action();
  console.log(`PASS receipt archive ${++checks}: ${label}`);
}
try {
  const f = await setupPaidOrderNumbersFixture(db);
  await db.exec(buildPaidOrderNumbersSql());
  async function accepted(complete = false) {
    const order = await f.ordinary();
    await f.accept(order.orderId);
    if (complete) {
      const action = (name, args) => f.staff(name, [f.tenantId, f.locationId, order.orderId, ...args]);
      await action("mealdeck_ops_kds_transition_order", [(await f.card(order.orderId)).version, "preparing"]);
      for (const item of (await f.card(order.orderId)).items)
        await action("mealdeck_ops_kds_set_item_ready", [item.order_item_id, (await f.card(order.orderId)).version, true]);
      await action("mealdeck_ops_kds_transition_pass", [(await f.card(order.orderId)).pass.version, "packing"]);
      await action("mealdeck_ops_kds_transition_pass", [(await f.card(order.orderId)).pass.version, "sealed"]);
      const card = await f.card(order.orderId);
      await action("mealdeck_ops_kds_complete_handoff", [card.version, card.display_code]);
    }
    const job = (await rows("select * from mealdeck_private.receipt_jobs where order_id=$1", [order.orderId]))[0];
    return { order, job };
  }
  const uncertain = await accepted(true);
  const queued = await accepted(true);
  const unfinished = await accepted(false);
  const claim = await f.staff("mealdeck_printer_claim_job", [f.tenantId, f.locationId, uncertain.job.id, id(901)]);
  await f.staff("mealdeck_printer_begin_send", [f.tenantId, f.locationId, uncertain.job.id, claim.claimToken]);
  await f.staff("mealdeck_printer_send_result", [f.tenantId, f.locationId, uncertain.job.id, claim.claimToken, "sent_unconfirmed"]);
  const business = () => scalar(`select jsonb_build_object(
    'orders',(select jsonb_agg(to_jsonb(x) order by id) from public.orders x),
    'stripe',(select jsonb_agg(to_jsonb(x) order by order_id) from mealdeck_private.stripe_orders x),
    'items',(select jsonb_agg(to_jsonb(x) order by id) from public.order_items x),
    'events',(select jsonb_agg(to_jsonb(x) order by id) from mealdeck_private.receipt_events x),
    'numbers',(select jsonb_agg(to_jsonb(x) order by number) from mealdeck_private.order_numbers x))`);
  const beforeBusiness = await business();
  await check("atomic installation and rerun preserve all business and print history", async () => {
    await db.exec("begin");
    await db.exec(buildManagedReceiptArchiveSql({ runnerOwnsTransaction: true, singleMigration: true }));
    await db.exec("rollback");
    assert.equal(await scalar("select count(*)::int from information_schema.columns where table_schema='mealdeck_private' and table_name='receipt_jobs' and column_name='archived_at'"), 0);
    await db.exec(buildReceiptArchiveSql());
    await db.exec(buildReceiptArchiveSql());
    assert.deepEqual(await business(), beforeBusiness);
    assert.equal(await scalar("select count(*)::int from mealdeck_private.receipt_jobs where archived_at is not null"), 0);
  });
  const reason = "Owner requested retirement: order handed over; no further receipt required.";
  const snapshot = async (job) => (await rows("select to_jsonb(j) as job,md5(receipt::text) as hash from mealdeck_private.receipt_jobs j where id=$1", [job]))[0];
  const archive = (job, hash, status, detail = reason) => scalar("select mealdeck_private.archive_completed_receipt($1,$2,$3,$4)", [job, hash, status, detail]);
  await check("only owner can archive completed originals and changed state/payload fails closed", async () => {
    const fresh = await snapshot(unfinished.job.id);
    await assert.rejects(() => archive(unfinished.job.id, fresh.hash, "queued"), /changed_review_required/);
    const ready = await snapshot(queued.job.id);
    await assert.rejects(() => archive(queued.job.id, "0".repeat(32), "queued"), /changed_review_required/);
    await assert.rejects(() => archive(queued.job.id, ready.hash, "held"), /changed_review_required/);
    await assert.rejects(() => archive(queued.job.id, ready.hash, "sending"), /invalid_request/);
    for (const role of ["anon", "authenticated", "service_role"])
      await assert.rejects(() => asActor(db, role === "authenticated" ? f.owner : null,
        () => archive(queued.job.id, ready.hash, "queued"), role), /permission denied/);
    assert.equal(await scalar("select count(*)::int from mealdeck_private.receipt_jobs where archived_at is not null"), 0);
  });
  await check("queued and unconfirmed sends leave the board without invented paper results", async () => {
    for (const [record, status] of [[queued, "queued"], [uncertain, "sent_unconfirmed"]]) {
      const before = await snapshot(record.job.id);
      const result = await archive(record.job.id, before.hash, status);
      assert.equal(result.archived, true); assert.equal(result.retainedStatus, status);
      const after = await snapshot(record.job.id);
      assert.equal(after.hash, before.hash);
      assert.ok(after.job.archived_at);
      assert.equal(after.job.archive_reason, reason);
      const strip = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => !["updated_at", "archived_at", "archive_reason"].includes(key)));
      assert.deepEqual(strip(after.job), strip(before.job));
      assert.deepEqual(await business(), beforeBusiness);
      assert.equal((await archive(record.job.id, before.hash, status)).updated, false);
      await assert.rejects(() => f.staff("mealdeck_printer_claim_job", [f.tenantId, f.locationId, record.job.id, id(902)]), /job_unavailable/);
      await assert.rejects(() => f.staff("mealdeck_printer_reprint", [f.tenantId, f.locationId, record.job.id, "A requested replacement", id(903)]), /job_unavailable/);
    }
    assert.equal(await scalar("select count(*)::int from public.mealdeck_ops_audit_log where action='printer.completed_receipt_archived'"), 2);
    const board = await f.staff("mealdeck_printer_board", [f.tenantId, f.locationId]);
    assert.deepEqual(board.jobs.map((j) => j.jobId), [unfinished.job.id]);
  });
  await check("new acceptance still queues once and migration rerun never restores archived work", async () => {
    const current = await accepted(false);
    await db.exec(buildReceiptArchiveSql());
    const board = await f.staff("mealdeck_printer_board", [f.tenantId, f.locationId]);
    assert.equal(board.jobs.length, 2);
    assert.ok(board.jobs.some((job) => job.jobId === current.job.id && job.status === "queued"));
    assert.equal(await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [current.order.orderId]), 1);
    assert.equal(await scalar("select count(*)::int from mealdeck_private.receipt_jobs where archived_at is not null"), 2);
  });
  console.log(`PASS ${checks} receipt archive behavior groups`);
} catch (error) {
  console.error("Receipt archive verification failed:", error.message, error.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
