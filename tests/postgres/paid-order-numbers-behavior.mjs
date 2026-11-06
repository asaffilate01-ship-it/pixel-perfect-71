import assert from "node:assert/strict";
import { asActor, createDatabase } from "./harness.mjs";
import { setupPaidOrderNumbersFixture } from "./paid-order-numbers-fixture.mjs";
import { paidOrderNumberConcurrencyTests } from "./paid-order-numbers-concurrency.mjs";
import {
  buildPaidOrderNumbersSql,
  buildManagedPaidOrderNumbersSql,
} from "../../deploy/mealdeck/paid-order-numbers.mjs";

const db = await createDatabase(process.argv.includes("--native"));
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
let checks = 0;
async function test(label, action) {
  try {
    await action();
    console.log(`PASS paid order numbers ${++checks}: ${label}`);
  } catch (error) {
    console.error(`FAIL paid order numbers: ${label}: ${error.message}`, error.where ?? "");
    throw error;
  }
}
try {
  const f = await setupPaidOrderNumbersFixture(db);
  const unpaid = await f.prepareOrdinary();
  const first = await f.ordinary();
  await f.accept(first.orderId);
  const second = await f.ordinary({ fulfilment: "curbside" });
  const oldJob = (
    await rows("select * from mealdeck_private.receipt_jobs where order_id=$1", [first.orderId])
  )[0];
  const oldHandoff = await scalar("select handoff_code from public.orders where id=$1", [
    first.orderId,
  ]);
  const originalBusinessRows = () =>
    scalar(`select jsonb_build_object(
      'orders',(select jsonb_agg(to_jsonb(t) order by t.id) from public.orders t),
      'items',(select jsonb_agg(to_jsonb(t) order by t.id) from public.order_items t),
      'stripe',(select jsonb_agg(to_jsonb(t) order by t.order_id) from mealdeck_private.stripe_orders t),
      'stripeEvents',(select jsonb_agg(to_jsonb(t) order by t.event_id) from mealdeck_private.stripe_events t),
      'funding',(select jsonb_agg(to_jsonb(t) order by t.order_id) from mealdeck_private.payment_orders t),
      'collections',(select jsonb_agg(to_jsonb(t) order by t.id) from mealdeck_private.payment_collections t),
      'tickets',(select jsonb_agg(to_jsonb(t) order by t.id) from public.kds_tickets t),
      'ticketItems',(select jsonb_agg(to_jsonb(t) order by t.id) from public.kds_ticket_items t),
      'pass',(select jsonb_agg(to_jsonb(t) order by t.order_id) from public.mealdeck_pass_orders t),
      'receipts',(select jsonb_agg(to_jsonb(t) order by t.id) from mealdeck_private.receipt_jobs t))`);
  const paymentDefinitions = () =>
    rows(`select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,
      p.proacl::text acl,p.proowner from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','mealdeck_private','mealdeck_ops_private') and p.proname in (
        'release_paid_order','kds_release_authority','payment_order_financial_ready',
        'mealdeck_reconcile_stripe_event','mealdeck_reconcile_order_payment',
        'mealdeck_bind_stripe_session','mealdeck_bind_order_payment',
        'kitchen_accept_locked_order','mealdeck_ops_kds_complete_handoff') order by signature`);
  const priorPaymentDefinitions = await paymentDefinitions();
  const priorBusinessRows = await originalBusinessRows();
  const managed = buildManagedPaidOrderNumbersSql({
    runnerOwnsTransaction: true,
    singleMigration: true,
  });
  const counter = () =>
    scalar(
      "select last_number::text from mealdeck_private.order_number_counters where tenant_id=$1 and location_id=$2",
      [f.tenantId, f.locationId],
    );
  const nextLabel = async () => String(BigInt(await counter()) + 1n).padStart(4, "0");

  await test("managed install rolls back every number, projection and original record", async () => {
    for (const options of [
      undefined,
      {},
      [],
      { runnerOwnsTransaction: true },
      { singleMigration: true },
      { runnerOwnsTransaction: true, singleMigration: true, split: true },
    ])
      assert.throws(() => buildManagedPaidOrderNumbersSql(options), /atomic transaction/);
    await db.exec("begin");
    try {
      await db.exec(managed);
      assert.equal(await f.number(first.orderId), "0001");
      assert.equal(await f.number(second.orderId), "0002");
      assert.equal(await f.number(unpaid.orderId), null);
      assert.deepEqual(await originalBusinessRows(), priorBusinessRows);
      assert.deepEqual(await paymentDefinitions(), priorPaymentDefinitions);
    } finally {
      await db.exec("rollback");
    }
    assert.equal(await scalar("select to_regclass('mealdeck_private.order_numbers')"), null);
    assert.deepEqual(await originalBusinessRows(), priorBusinessRows);
    assert.deepEqual(await paymentDefinitions(), priorPaymentDefinitions);
  });

  await test("foreign, missing and unreviewed authorities cannot install an allocator", async () => {
    for (const damage of [
      "create schema dishbee_private",
      "alter table mealdeck_private.installation rename to missing_installation_fixture",
      "alter function mealdeck_private.kds_release_authority(uuid) rename to missing_authority_fixture",
      "create or replace function mealdeck_private.release_paid_order(p_order uuid,p_reference text) returns void language plpgsql security definer set search_path='' as $$ begin return; end $$",
      "create or replace function mealdeck_ops_private.kds_order_card(p_order uuid,p_evidence jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin return '{}'::jsonb; end $$",
      "set local role authenticated",
    ]) {
      await db.exec("begin");
      try {
        await db.exec(damage);
        await assert.rejects(
          () => db.exec(managed),
          /independent_profile|unreviewed_definition|database_owner|permission denied/,
        );
      } finally {
        await db.exec("rollback");
      }
      assert.equal(await scalar("select to_regclass('mealdeck_private.order_numbers')"), null);
      assert.deepEqual(await paymentDefinitions(), priorPaymentDefinitions);
    }
  });

  await db.exec(buildPaidOrderNumbersSql());
  await test("chronological backfill skips older unpaid attempts and rerun preserves all data", async () => {
    assert.equal(await f.number(first.orderId), "0001");
    assert.equal(await f.number(second.orderId), "0002");
    assert.equal(await f.number(unpaid.orderId), null);
    assert.equal(await counter(), "2");
    assert.deepEqual(await originalBusinessRows(), priorBusinessRows);
    assert.deepEqual(await paymentDefinitions(), priorPaymentDefinitions);
    const numbered = await rows("select * from mealdeck_private.order_numbers order by number");
    const auditCount = await scalar(
      "select count(*)::int from public.mealdeck_ops_audit_log where action='order.number_assigned'",
    );
    await db.exec(buildPaidOrderNumbersSql());
    assert.deepEqual(
      await rows("select * from mealdeck_private.order_numbers order by number"),
      numbered,
    );
    assert.equal(await counter(), "2");
    assert.equal(
      await scalar(
        "select count(*)::int from public.mealdeck_ops_audit_log where action='order.number_assigned'",
      ),
      auditCount,
    );
    assert.deepEqual(await originalBusinessRows(), priorBusinessRows);
  });

  await test("next verified ordinary order is 0003 and payment replays allocate only once", async () => {
    const third = await f.ordinary();
    assert.equal(await f.number(third.orderId), "0003");
    assert.equal((await f.reconcileOrdinary(third)).replayed, true);
    await f.reconcileOrdinary(third, {
      event: "evt_newobservation" + f.next().replaceAll("-", ""),
    });
    assert.equal(await f.number(third.orderId), "0003");
    assert.equal(await counter(), "3");
    assert.equal(
      await scalar(
        "select count(*)::int from public.mealdeck_ops_audit_log where action='order.number_assigned' and entity_id=$1",
        [third.orderId],
      ),
      1,
    );
    await f.reconcileOrdinary(third, {
      event: "evt_refund" + f.next().replaceAll("-", ""),
      type: "charge.refunded",
      refunded: third.totalPence,
    });
    assert.equal(await f.number(third.orderId), "0003");
    assert.equal(await counter(), "3");
    assert.equal(
      await scalar("select payment_status from public.orders where id=$1", [third.orderId]),
      "refunded",
    );
  });

  await test("unpaid, forged paid, cancelled and disputed orders consume no number", async () => {
    const before = await counter();
    await db.query(
      "update public.orders set payment_status='paid',paid_at=now(),status='accepted' where id=$1",
      [unpaid.orderId],
    );
    assert.equal(await f.number(unpaid.orderId), null);
    assert.equal(
      await scalar("select count(*)::int from public.kds_tickets where order_id=$1", [
        unpaid.orderId,
      ]),
      0,
    );
    const cancelled = await f.prepareOrdinary();
    await db.query("update public.orders set status='cancelled' where id=$1", [cancelled.orderId]);
    await f.reconcileOrdinary(cancelled);
    assert.equal(await f.number(cancelled.orderId), null);
    const disputed = await f.prepareOrdinary();
    await f.reconcileOrdinary(disputed, { type: "charge.dispute.created", disputed: true });
    assert.equal(await f.number(disputed.orderId), null);
    const refunded = await f.prepareOrdinary();
    await f.reconcileOrdinary(refunded, { type: "charge.refunded", refunded: refunded.totalPence });
    assert.equal(await f.number(refunded.orderId), null);
    assert.equal(await counter(), before);
  });

  await test("shared funding waits for final room submission and Terminal uses the same counter", async () => {
    await f.ageQuotes();
    const group = await f.group();
    const claims = [];
    const expectedGroup = await nextLabel();
    for (const index of [0, 1]) {
      const claim = await f.claim(group, { index });
      const session = "cs_test_numbergroup" + f.next().replaceAll("-", "");
      claims.push(
        await f.bindPayment(claim, { session, url: "https://pay.mealdeck.co.uk/g/pay/" + session }),
      );
    }
    await f.reconcilePayment(claims[0]);
    assert.equal(await f.number(claims[0].orderId), null);
    assert.equal(
      await scalar("select count(*)::int from public.kds_tickets where order_id=$1", [
        claims[0].orderId,
      ]),
      0,
    );
    await f.reconcilePayment(claims[1]);
    assert.equal(await f.number(claims[0].orderId), expectedGroup);
    assert.equal(
      await scalar("select status from public.group_order_rooms where id=$1", [group.room.roomId]),
      "submitted",
    );
    assert.equal((await f.status(group)).orderNumber, expectedGroup);
    assert.equal(
      await scalar("select count(*)::int from mealdeck_private.order_numbers where order_id=$1", [
        claims[0].orderId,
      ]),
      1,
    );
    await f.ageQuotes();
    const quote = await f.terminalQuote();
    const terminal = await f.bindPayment(await f.terminal({ quoteId: quote.quoteId }));
    assert.equal(await f.number(terminal.orderId), null);
    const expectedTerminal = await nextLabel();
    await f.reconcilePayment(terminal);
    assert.equal(await f.number(terminal.orderId), expectedTerminal);
    assert.equal(
      (
        await f.rpc("mealdeck_terminal_order_status", [
          f.owner,
          f.tenantId,
          f.locationId,
          terminal.orderId,
        ])
      ).orderNumber,
      expectedTerminal,
    );
  });

  await test("allocation and canonical payment both roll back without consuming a number", async () => {
    const attempt = await f.prepareOrdinary();
    const expected = await nextLabel();
    const before = await counter();
    await db.exec("begin");
    try {
      await f.reconcileOrdinary(attempt);
      assert.equal(
        await f.number(attempt.orderId),
        null,
        "allocation stays deferred until final transaction state",
      );
      await db.exec("set constraints mealdeck_verified_paid_order_number immediate");
      assert.equal(await f.number(attempt.orderId), expected);
    } finally {
      await db.exec("rollback");
    }
    assert.equal(await f.number(attempt.orderId), null);
    assert.equal(await counter(), before);
    assert.equal(
      await scalar("select count(*)::int from public.kds_tickets where order_id=$1", [
        attempt.orderId,
      ]),
      0,
    );
    assert.equal(
      await scalar("select count(*)::int from mealdeck_private.stripe_events where order_id=$1", [
        attempt.orderId,
      ]),
      0,
    );
    await f.reconcileOrdinary(attempt);
    assert.equal(await f.number(attempt.orderId), expected);
  });

  await test("all authorized projections add numbers while retaining collection codes and financial fields", async () => {
    const receipt = await f.service(() =>
      scalar("select public.mealdeck_customer_order_receipt($1,$2)", [first.orderId, f.customer]),
    );
    assert.equal(receipt.orderNumber, "0001");
    assert.equal(receipt.handoffCode, oldHandoff);
    assert.equal(receipt.totalPence, first.totalPence);
    assert.equal(receipt.verifiedPaid, true);
    const account = await asActor(db, f.customer, () =>
      scalar("select public.mealdeck_customer_orders()"),
    );
    assert.equal(
      account.orders.find((order) => order.orderId === first.orderId).orderNumber,
      "0001",
    );
    const history = await asActor(db, f.owner, () =>
      rows("select * from public.mealdeck_ops_order_history($1,$2,current_date-1,current_date+1)", [
        f.tenantId,
        f.locationId,
      ]),
    );
    assert.equal(history.find((order) => order.order_id === first.orderId).order_number, "0001");
    assert.equal(
      history.find((order) => order.order_id === first.orderId).total_pence,
      first.totalPence,
    );
    assert.equal((await f.card(first.orderId)).order_number, "0001");
    assert.equal((await f.card(first.orderId)).display_code, oldHandoff);
    assert.equal(
      (await f.pending()).orders.find((order) => order.orderId === second.orderId).orderNumber,
      "0002",
    );
    assert.equal(
      (await scalar("select mealdeck_ops_private.receipt_snapshot($1)", [first.orderId]))
        .orderNumber,
      "0001",
    );
    const guest = await f.ordinary({ guest: true });
    assert.equal(
      (await f.guest.receipt(guest.token, guest.orderId)).orderNumber,
      await f.number(guest.orderId),
    );
    await f.accept(guest.orderId);
    assert.equal(
      (
        await scalar("select receipt from mealdeck_private.receipt_jobs where order_id=$1", [
          guest.orderId,
        ])
      ).orderNumber,
      await f.number(guest.orderId),
    );
    assert.deepEqual(await paymentDefinitions(), priorPaymentDefinitions);
  });

  await test("pickup and kerbside contacts use the same saved safe name and phone projection", async () => {
    for (const order of [first, second]) {
      const card = await f.card(order.orderId);
      assert.deepEqual(card.pickupContact, { name: "Fixture Customer", phone: "+447700900123" });
    }
    for (const [name, phone] of [
      ["Name\nHeader", "+447700900123"],
      ["Name\u202eHidden", "+447700900123"],
      ["Name", "07700900123"],
    ]) {
      await db.exec("begin");
      try {
        await db.query("update public.orders set customer_name=$1,customer_phone=$2 where id=$3", [
          name,
          phone,
          first.orderId,
        ]);
        assert.equal((await f.card(first.orderId)).pickupContact, null);
      } finally {
        await db.exec("rollback");
      }
    }
    await db.exec("begin");
    try {
      await db.query("update public.orders set customer_name=$1 where id=$2", [
        "\u00a0Róisín O’Connor\u3000",
        first.orderId,
      ]);
      assert.deepEqual((await f.card(first.orderId)).pickupContact, {
        name: "Róisín O’Connor",
        phone: "+447700900123",
      });
    } finally {
      await db.exec("rollback");
    }
  });

  await test("completed ticket keeps the new number and requires its original collection code", async () => {
    const action = (name, args) =>
      f.staff(name, [f.tenantId, f.locationId, first.orderId, ...args]);
    await action("mealdeck_ops_kds_transition_order", [
      (await f.card(first.orderId)).version,
      "preparing",
    ]);
    for (const item of (await f.card(first.orderId)).items)
      await action("mealdeck_ops_kds_set_item_ready", [
        item.order_item_id,
        (await f.card(first.orderId)).version,
        true,
      ]);
    await action("mealdeck_ops_kds_transition_pass", [
      (await f.card(first.orderId)).pass.version,
      "packing",
    ]);
    await action("mealdeck_ops_kds_transition_pass", [
      (await f.card(first.orderId)).pass.version,
      "sealed",
    ]);
    const card = await f.card(first.orderId);
    if (card.display_code !== "0001")
      await assert.rejects(
        () => action("mealdeck_ops_kds_complete_handoff", [card.version, "0001"]),
        /handoff_code_required/,
      );
    await action("mealdeck_ops_kds_complete_handoff", [card.version, oldHandoff]);
    const completed = (await f.board()).completed_orders.find(
      (order) => order.order_id === first.orderId,
    );
    assert.equal(completed.order_number, "0001");
    assert.equal(completed.display_code, oldHandoff);
    assert.deepEqual(completed.pickupContact, { name: "Fixture Customer", phone: "+447700900123" });
    assert.deepEqual(
      await scalar("select receipt from mealdeck_private.receipt_jobs where id=$1", [oldJob.id]),
      oldJob.receipt,
    );
  });

  await test("only an untouched queued original can receive the one additional receipt field", async () => {
    const expectedHash = await scalar(
      "select md5((receipt-'orderNumber')::text) from mealdeck_private.receipt_jobs where id=$1",
      [oldJob.id],
    );
    const augment = (hash = expectedHash, job = oldJob.id, order = first.orderId) =>
      scalar("select mealdeck_private.add_order_number_to_unsent_receipt($1,$2,$3)", [
        job,
        order,
        hash,
      ]);
    await assert.rejects(() => augment("0".repeat(32)), /receipt_guard/);
    await assert.rejects(() => augment(expectedHash, oldJob.id, second.orderId), /receipt_guard/);
    for (const damage of [
      "update mealdeck_private.receipt_jobs set status='claimed' where id=$1",
      "update mealdeck_private.receipt_jobs set status='printed' where id=$1",
      "update mealdeck_private.receipt_jobs set claimed_by=(select bootstrap_owner_id from mealdeck_private.installation where singleton) where id=$1",
      "update mealdeck_private.receipt_jobs set terminal_id=gen_random_uuid() where id=$1",
      "update mealdeck_private.receipt_jobs set claim_token=gen_random_uuid() where id=$1",
      "update mealdeck_private.receipt_jobs set claim_expires_at=now()+interval '1 minute' where id=$1",
      "update mealdeck_private.receipt_jobs set send_started_at=now() where id=$1",
      "update mealdeck_private.receipt_jobs set confirmed_at=now() where id=$1",
      "update mealdeck_private.receipt_jobs set resolution='Previously investigated' where id=$1",
      "insert into mealdeck_private.receipt_events(job_id,actor_id,action) select id,(select bootstrap_owner_id from mealdeck_private.installation where singleton),'claim_attempt' from mealdeck_private.receipt_jobs where id=$1",
      "insert into mealdeck_private.receipt_jobs(order_id,tenant_id,location_id,copy_number,reprint_of,reprint_reason,receipt) select order_id,tenant_id,location_id,2,id,'Explicit copy fixture',receipt from mealdeck_private.receipt_jobs where id=$1",
    ]) {
      await db.exec("begin");
      try {
        await db.query(damage, [oldJob.id]);
        await assert.rejects(() => augment(), /receipt_guard/);
      } finally {
        await db.exec("rollback");
      }
    }
    const result = await augment();
    assert.equal(result.updated, true);
    assert.equal(result.orderNumber, "0001");
    const updated = await scalar("select receipt from mealdeck_private.receipt_jobs where id=$1", [
      oldJob.id,
    ]);
    const { orderNumber, ...unchanged } = updated;
    assert.equal(orderNumber, "0001");
    assert.deepEqual(unchanged, oldJob.receipt);
    assert.equal((await augment()).updated, false);
    assert.equal(
      await scalar(
        "select count(*)::int from public.mealdeck_ops_audit_log where action='printer.order_number_added' and entity_id=$1",
        [oldJob.id],
      ),
      1,
    );
    assert.equal(
      await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
        first.orderId,
      ]),
      1,
    );
    assert.equal(
      await scalar("select count(*)::int from mealdeck_private.receipt_events where job_id=$1", [
        oldJob.id,
      ]),
      0,
    );
  });

  await test("private numbers and maintenance stay inaccessible and scoped projections retain authorization", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const sql of [
        "select * from mealdeck_private.order_numbers",
        "select * from mealdeck_private.order_number_counters",
        "select mealdeck_private.paid_order_number(null)",
        "select mealdeck_private.assign_paid_order_number(null)",
        "select mealdeck_private.add_order_number_to_unsent_receipt(null,null,null)",
        "select * from mealdeck_ops_private.order_history_before_paid_numbers(null,null,null,null)",
      ])
        await assert.rejects(
          () => asActor(db, f.owner, () => db.query(sql), role),
          /permission denied/,
          role + " cannot call " + sql,
        );
    }
    for (const role of ["anon", "service_role"])
      await assert.rejects(
        () =>
          asActor(
            db,
            f.owner,
            () =>
              db.query(
                "select * from public.mealdeck_ops_order_history($1,$2,current_date-1,current_date+1)",
                [f.tenantId, f.locationId],
              ),
            role,
          ),
        /permission denied/,
      );
    await assert.rejects(
      () =>
        asActor(db, f.customer, () =>
          db.query(
            "select * from public.mealdeck_ops_order_history($1,$2,current_date-1,current_date+1)",
            [f.tenantId, f.locationId],
          ),
        ),
      /forbidden/,
      "customer cannot read staff history",
    );
    await assert.rejects(
      () =>
        asActor(db, f.owner, () =>
          db.query(
            "select * from public.mealdeck_ops_order_history($1,$2,current_date-1,current_date+1)",
            [f.next(), f.locationId],
          ),
        ),
      /forbidden/,
      "owner cannot read another tenant's history",
    );
    // A tenant-wide owner retains the original empty result for an unknown
    // kitchen in that tenant; the additive wrapper must not change that policy.
    assert.deepEqual(
      await asActor(db, f.owner, () =>
        rows(
          "select * from public.mealdeck_ops_order_history($1,$2,current_date-1,current_date+1)",
          [f.tenantId, f.next()],
        ),
      ),
      [],
    );
    await assert.rejects(
      () =>
        f.service(() =>
          db.query("select public.mealdeck_customer_order_receipt($1,$2)", [
            first.orderId,
            f.otherCustomer,
          ]),
        ),
      /order_unavailable/,
      "customer cannot read another customer's receipt",
    );
    for (const table of ["order_numbers", "order_number_counters"])
      assert.equal(
        await scalar("select relrowsecurity from pg_class where oid=$1::regclass", [
          "mealdeck_private." + table,
        ]),
        true,
      );
    assert.deepEqual(await paymentDefinitions(), priorPaymentDefinitions);
  });

  await test("counter and mapping uniqueness stay scoped to the order's canonical kitchen", async () => {
    const otherLocation = f.next();
    await db.query(
      "insert into public.tenant_locations select (jsonb_populate_record(null::public.tenant_locations,to_jsonb(l)||jsonb_build_object('id',$1::uuid,'slug','numbering-fixture-second-kitchen'))).* from public.tenant_locations l where l.id=$2",
      [otherLocation, f.locationId],
    );
    await db.query(
      "insert into mealdeck_private.order_number_counters(tenant_id,location_id,last_number) values($1,$2,44)",
      [f.tenantId, otherLocation],
    );
    const expected = await nextLabel();
    const paid = await f.ordinary();
    assert.equal(await f.number(paid.orderId), expected);
    assert.equal(
      await scalar(
        "select last_number::text from mealdeck_private.order_number_counters where tenant_id=$1 and location_id=$2",
        [f.tenantId, otherLocation],
      ),
      "44",
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into mealdeck_private.order_numbers(order_id,tenant_id,location_id,number,paid_at) values($1,$2,$3,1,now())",
          [unpaid.orderId, f.tenantId, f.locationId],
        ),
      /unique|duplicate/,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into mealdeck_private.order_numbers(order_id,tenant_id,location_id,number,paid_at) values($1,$2,$3,45,now())",
          [unpaid.orderId, f.tenantId, otherLocation],
        ),
      /foreign key/,
    );
  });

  await test("assigned numbers are immutable and minimum-width formatting never truncates 10000", async () => {
    await assert.rejects(
      () =>
        db.query("update mealdeck_private.order_numbers set number=9999 where order_id=$1", [
          first.orderId,
        ]),
      /immutable/,
    );
    await assert.rejects(
      () =>
        db.query("delete from mealdeck_private.order_numbers where order_id=$1", [first.orderId]),
      /immutable/,
    );
    await assert.rejects(
      () =>
        db.query(
          "update mealdeck_private.order_number_counters set last_number=0 where tenant_id=$1 and location_id=$2",
          [f.tenantId, f.locationId],
        ),
      /immutable/,
    );
    await db.exec("begin");
    try {
      await db.query(
        "update mealdeck_private.order_number_counters set last_number=9999 where tenant_id=$1 and location_id=$2",
        [f.tenantId, f.locationId],
      );
      const large = await f.ordinary();
      await db.exec("set constraints mealdeck_verified_paid_order_number immediate");
      assert.equal(await f.number(large.orderId), "10000");
    } finally {
      await db.exec("rollback");
    }
  });

  if (db.native) await paidOrderNumberConcurrencyTests(db, f, test);
  console.log(`Verified ${checks} paid order numbering PostgreSQL groups.`);
} catch (error) {
  console.error(error.message, error.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
