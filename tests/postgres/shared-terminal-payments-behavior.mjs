import assert from "node:assert/strict";
import { asActor, createDatabase } from "./harness.mjs";
import { setupSharedPaymentsFixture, paymentHash } from "./shared-terminal-payments-fixture.mjs";
import { setGuestFixtureClock } from "./guest-checkout-fixture.mjs";
import { buildManagedSharedTerminalPaymentsSql } from "../../deploy/mealdeck/shared-terminal-payments.mjs";
import { sharedPaymentConcurrencyTests } from "./shared-terminal-payments-concurrency.mjs";

const db = await createDatabase(process.argv.includes("--native"));
let checks = 0;
async function test(label, run) {
  try {
    // The production anti-abuse limit is tested by the existing checkout suite.
    // Age fixture quote creation only, so this long suite cannot hit that limit.
    await db.exec(
      "update mealdeck_private.checkout_quotes set created_at=now()-interval '6 minutes'",
    );
    await run();
    console.log(`PASS shared payments ${++checks}: ${label}`);
  } catch (error) {
    console.error(
      `FAIL shared payments: ${label}: ${error.message}`,
      error.detail ?? "",
      error.where ?? "",
    );
    throw error;
  }
}
try {
  console.log("Engine: " + (await db.query("select version() version")).rows[0].version);
  const f = await setupSharedPaymentsFixture(db);
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const tickets = (order) =>
    scalar("select count(*)::int n from public.kds_tickets where order_id=$1", [order]);
  const authority = (order) => scalar("select mealdeck_private.kds_release_authority($1)", [order]);
  const board = () =>
    asActor(
      db,
      f.owner,
      async () =>
        (
          await db.query("select public.mealdeck_ops_kds_board($1,$2) result", [
            f.tenantId,
            f.locationId,
          ])
        ).rows[0].result,
    );
  const close = () =>
    asActor(db, f.owner, () =>
      db.query("select public.mealdeck_ops_update_checkout_availability($1,$2,'paused',null)", [
        f.tenantId,
        f.locationId,
      ]),
    );
  const open = (eta = 25) =>
    asActor(db, f.owner, () =>
      db.query("select public.mealdeck_ops_update_checkout_availability($1,$2,'online',$3)", [
        f.tenantId,
        f.locationId,
        eta,
      ]),
    );

  await test("all service RPCs and private ledgers are denied to browser roles and runtime clock was preserved", async () => {
    const rows = (
      await db.query(`select p.proname,has_function_privilege('anon',p.oid,'EXECUTE') anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
      ('mealdeck_create_group_payment_room','mealdeck_group_payment_status','mealdeck_group_payment_collections',
      'mealdeck_prepare_group_payment','mealdeck_cancel_group_payment_room','mealdeck_order_payment_collection','mealdeck_bind_order_payment',
      'mealdeck_reconcile_order_payment','mealdeck_terminal_authorize','mealdeck_create_terminal_quote','mealdeck_terminal_order_status',
      'mealdeck_prepare_terminal_payment','mealdeck_terminal_payment_attempt','mealdeck_cancel_terminal_payment')`)
    ).rows;
    assert.equal(rows.length, 14);
    assert.ok(rows.every((r) => !r.anon && !r.authenticated && r.service));
    const tables = (
      await db.query(`select c.relname,c.relrowsecurity,has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') service
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mealdeck_private'
      and c.relname in ('payment_orders','payment_shares','payment_collections','payment_collection_shares','payment_events')`)
    ).rows;
    assert.equal(tables.length, 5);
    assert.ok(tables.every((r) => r.relrowsecurity && !r.service));
    for (const role of ["anon", "authenticated", "service_role"]) {
      await assert.rejects(
        () =>
          asActor(
            db,
            f.owner,
            () => db.query("select * from mealdeck_private.payment_orders"),
            role,
          ),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          asActor(
            db,
            f.owner,
            () => db.query("select mealdeck_private.group_payment_authority($1)", [f.next()]),
            role,
          ),
        /permission denied/,
      );
    }
    for (const role of ["anon", "authenticated"])
      await assert.rejects(
        () =>
          asActor(
            db,
            f.owner,
            () =>
              db.query("select public.mealdeck_terminal_authorize($1,$2,$3)", [
                f.owner,
                f.tenantId,
                f.locationId,
              ]),
            role,
          ),
        /permission denied/,
      );
    for (const options of [
      undefined,
      {},
      { runnerOwnsTransaction: true },
      { runnerOwnsTransaction: true, singleMigration: true, extra: true },
    ])
      assert.throws(() => buildManagedSharedTerminalPaymentsSql(options), /one runner-owned/);
    assert.ok(
      buildManagedSharedTerminalPaymentsSql({
        runnerOwnsTransaction: true,
        singleMigration: true,
      }).includes("create table mealdeck_private.payment_orders"),
    );
  });

  await test("Terminal permission requires a verified scoped actor; grants work and denials win", async () => {
    assert.equal(
      (await f.rpc("mealdeck_terminal_authorize", [f.owner, f.tenantId, f.locationId])).authorized,
      true,
    );
    for (const user of [null, f.customer, f.unverified])
      await assert.rejects(
        () => f.rpc("mealdeck_terminal_authorize", [user, f.tenantId, f.locationId]),
        /staff_forbidden/,
      );
    await assert.rejects(
      () => f.rpc("mealdeck_terminal_authorize", [f.owner, f.tenantId, f.next()]),
      /staff_forbidden/,
    );
    for (const [change, restore] of [
      ["banned_until=now()+interval '1 hour'", "banned_until=null"],
      ["deleted_at=now()", "deleted_at=null"],
      ["is_anonymous=true", "is_anonymous=false"],
    ]) {
      await db.query("update auth.users set " + change + " where id=$1", [f.owner]);
      try {
        await assert.rejects(
          () => f.rpc("mealdeck_terminal_authorize", [f.owner, f.tenantId, f.locationId]),
          /staff_forbidden/,
        );
      } finally {
        await db.query("update auth.users set " + restore + " where id=$1", [f.owner]);
      }
    }
    const collector = f.next();
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'collector@example.invalid',now())",
      [collector],
    );
    await asActor(db, f.owner, () =>
      db.query(
        "select public.mealdeck_ops_assign_staff($1,$2,$3,'viewer',array['payments.collect'],array[]::text[],true)",
        [f.tenantId, collector, f.locationId],
      ),
    );
    assert.equal(
      (await f.rpc("mealdeck_terminal_authorize", [collector, f.tenantId, f.locationId]))
        .authorized,
      true,
    );
    await db.query(
      "insert into public.mealdeck_ops_staff_access(tenant_id,user_id,role,deny_permissions) values($1,$2,'viewer',array['payments.collect'])",
      [f.tenantId, collector],
    );
    await assert.rejects(
      () => f.rpc("mealdeck_terminal_authorize", [collector, f.tenantId, f.locationId]),
      /staff_forbidden/,
    );
    await db.query("update auth.users set email_confirmed_at=null where id=$1", [collector]);
    await db.query(
      "delete from public.mealdeck_ops_staff_access where user_id=$1 and location_id is null",
      [collector],
    );
    await assert.rejects(
      () => f.rpc("mealdeck_terminal_authorize", [collector, f.tenantId, f.locationId]),
      /staff_forbidden/,
    );
  });

  await test("exact by-bag and equal penny allocations use frozen canonical quote totals", async () => {
    const byBag = await f.group();
    assert.equal(byBag.room.totalPence, 838);
    assert.deepEqual(
      byBag.room.shares.map((s) => s.amountPence),
      [279, 559],
    );
    const equal = await f.group({ quantities: [1, 1, 1], mode: "equal" });
    assert.deepEqual(
      equal.room.shares.map((s) => s.amountPence),
      [280, 279, 279],
    );
    for (const g of [byBag, equal])
      assert.equal(
        g.room.shares.reduce((sum, s) => sum + s.amountPence, 0),
        g.quote.totalPence,
      );
    assert.equal(
      await scalar("select count(*)::int from public.order_items where order_id=$1", [
        byBag.room.orderId,
      ]),
      1,
    );
    assert.deepEqual(
      await scalar("select packing_plan from public.orders where id=$1", [byBag.room.orderId]),
      byBag.quote.packingPlan,
    );
    assert.equal(await tickets(byBag.room.orderId), 0);
    assert.equal(await authority(byBag.room.orderId), null);
    assert.equal(
      await scalar("select public.group_order_financial_ready($1)", [byBag.room.roomId]),
      false,
    );
    const retry = await f.rpc("mealdeck_create_group_payment_room", byBag.args);
    const status = await f.status(byBag);
    assert.deepEqual({ ...retry, serverNow: null }, { ...status, serverNow: null });
    const altered = [...byBag.args];
    altered[5] = "equal";
    await assert.rejects(
      () => f.rpc("mealdeck_create_group_payment_room", altered),
      /attempt_conflict/,
    );
    const tokens = structuredClone(byBag.tokens);
    tokens[1].bagNumber = 1;
    altered[5] = "by_bag";
    altered[6] = JSON.stringify(tokens);
    await assert.rejects(
      () => f.rpc("mealdeck_create_group_payment_room", altered),
      /shares_invalid/,
    );
  });

  await test("frozen modifier prices and exact bag quantities survive later catalogue edits; stale new room quotes fail", async () => {
    const meal = f.data.modifierGroups.find((g) => g.id === "skorch-burgers-make-it-a-meal");
    const addons = f.data.modifierGroups.find((g) => g.id === "skorch-burgers-burger-add-ons");
    const ring = addons.options.find((o) => o.label.includes("Onion"));
    const cross = f.data.modifierGroups.find((g) => g.id === "cross-drink-replacement");
    const mojito = cross.options.find((o) => o.label === "Virgin Mojito");
    const line = {
      ...f.line,
      quantity: 3,
      modifiers: [
        f.mkOption(meal.id, meal.options[0].id),
        f.mkOption(addons.id, ring.id),
        f.mkOption(cross.id, mojito.id, "cross", mojito.targetItemId),
      ],
    };
    const g = await f.group({ lines: [line] });
    assert.equal(g.quote.lines[0].modifiers.length, 3);
    const stale = await f.quote({ lines: [line], packing: g.quote.packingPlan });
    await db.query("update public.menu_items set price_pence=449 where tenant_id=$1 and sku=$2", [
      f.tenantId,
      f.ace.id,
    ]);
    try {
      const c = await f.claim(g, { cover: true });
      assert.equal(c.amountPence, g.quote.totalPence);
      assert.deepEqual((await f.status(g)).lines, g.quote.lines);
      assert.equal((await f.status(g, { participant: true, index: 1 })).lines[0].quantity, 2);
      await assert.rejects(
        () => f.group({ quote: stale, lines: [line], packing: g.quote.packingPlan }),
        /price_changed/,
      );
    } finally {
      await db.query("update public.menu_items set price_pence=399 where tenant_id=$1 and sku=$2", [
        f.tenantId,
        f.ace.id,
      ]);
    }
  });

  await test("missing kitchen routing rolls back verified funding and a provider retry releases once after repair", async () => {
    const g = await f.group();
    const c = await f.bindPayment(await f.claim(g, { cover: true }));
    const item = g.quote.lines[0].menu_item_id;
    const routes = (
      await db.query(
        "select * from public.menu_item_station_routes where location_id=$1 and item_id=$2",
        [f.locationId, item],
      )
    ).rows;
    await db.query(
      "delete from public.menu_item_station_routes where location_id=$1 and item_id=$2",
      [f.locationId, item],
    );
    try {
      await assert.rejects(
        () => f.reconcilePayment(c, { event: "evt_route", intent: "pi_route" }),
        /routing_unavailable/,
      );
      assert.equal(
        await scalar(
          "select count(*)::int from mealdeck_private.payment_events where event_id='evt_route'",
        ),
        0,
      );
      assert.equal(await tickets(c.orderId), 0);
      assert.equal((await f.status(g)).capturedPence, 0);
    } finally {
      for (const route of routes)
        await db.query(
          "insert into public.menu_item_station_routes(tenant_id,location_id,item_id,station_id,prep_kind,prep_seconds) values($1,$2,$3,$4,$5,$6)",
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
    assert.equal(
      (await f.reconcilePayment(c, { event: "evt_route", intent: "pi_route" })).orderPaid,
      true,
    );
    assert.ok(await authority(c.orderId));
    assert.equal(
      await scalar("select count(*)::int from public.mealdeck_pass_orders where order_id=$1", [
        c.orderId,
      ]),
      1,
    );
  });

  await test("personal share snapshots expose only own allocations and no contacts or provider bindings", async () => {
    const g = await f.group();
    const participant = await f.status(g, { participant: true, index: 1 });
    assert.equal(participant.viewer.role, "participant");
    assert.equal(participant.shares.length, 1);
    assert.equal(participant.shares[0].shareId, g.tokens[1].shareId);
    assert.equal(participant.packingPlan.bags.length, 1);
    assert.equal(participant.packingPlan.bags[0].number, 2);
    assert.equal(participant.lines[0].quantity, 2);
    assert.equal(participant.totalPence, g.room.totalPence);
    assert.equal(participant.quoteId, undefined);
    assert.doesNotMatch(
      JSON.stringify(participant),
      /example.invalid|tokenHash|customerId|guestId|stripeAccount|collectionId|sessionId|paymentIntentId/,
    );
    await assert.rejects(
      () => f.rpc("mealdeck_group_payment_status", [g.room.roomId, f.otherCustomer, null, null]),
      /room_unavailable/,
    );
    await assert.rejects(
      () =>
        f.rpc("mealdeck_group_payment_status", [g.room.roomId, null, null, paymentHash("wrong")]),
      /room_unavailable/,
    );
    await assert.rejects(
      () => f.claim(g, { customer: f.otherCustomer, cover: true }),
      /room_unavailable|claim_forbidden/,
    );
    const c = await f.claim(g);
    const own = await f.rpc("mealdeck_group_payment_collections", [
      g.room.roomId,
      null,
      null,
      g.tokens[0].tokenHash,
    ]);
    const other = await f.rpc("mealdeck_group_payment_collections", [
      g.room.roomId,
      null,
      null,
      g.tokens[1].tokenHash,
    ]);
    assert.equal(own[0].collectionId, c.collectionId);
    assert.deepEqual(other, []);
    assert.equal(own[0].payerAccess, false, "a share link alone is not payer identity");
    assert.equal(c.coverRemaining, false);
    assert.equal(c.requestShareId, g.tokens[0].shareId);
    const second = await f.claim(g, { index: 1, customer: f.otherCustomer });
    const organiser = await f.rpc("mealdeck_group_payment_collections", [
      g.room.roomId,
      f.customer,
      null,
      null,
    ]);
    assert.equal(organiser.find((x) => x.collectionId === c.collectionId).payerAccess, true);
    assert.equal(
      organiser.find((x) => x.collectionId === second.collectionId).payerAccess,
      false,
      "organiser cannot resume another payer's payment",
    );
    const payer = await f.rpc("mealdeck_group_payment_collections", [
      g.room.roomId,
      f.otherCustomer,
      null,
      g.tokens[1].tokenHash,
    ]);
    assert.equal(payer.length, 1);
    assert.equal(payer[0].payerAccess, true);
    const crossed = await f.rpc("mealdeck_group_payment_collections", [
      g.room.roomId,
      f.otherCustomer,
      null,
      g.tokens[0].tokenHash,
    ]);
    assert.equal(
      crossed[0].payerAccess,
      false,
      "a verified different payer plus the link still cannot resume",
    );
    assert.equal(
      await f.rpc("mealdeck_order_payment_collection", [c.collectionId, "acct_Other", false]),
      null,
    );
    assert.equal(
      (await f.rpc("mealdeck_order_payment_collection", [c.collectionId, "acct_Fixture", false]))
        .tenantId,
      f.tenantId,
    );
  });

  await test("a verified account without customer registration may view only its capability's share and cannot pay", async () => {
    const g = await f.group();
    await f.claim(g);
    assert.equal(
      (await scalar("select mealdeck_private.customer_registration_authority($1)", [f.owner]))
        .registered,
      false,
    );
    const args = [g.room.roomId, f.owner, null, g.tokens[0].tokenHash];
    const view = await f.rpc("mealdeck_group_payment_status", args);
    assert.equal(view.viewer.role, "participant");
    assert.equal(view.ownerAccess, false);
    assert.equal(view.shares.length, 1);
    const collections = await f.rpc("mealdeck_group_payment_collections", args);
    assert.equal(collections.length, 1);
    assert.equal(collections[0].payerAccess, false);
    await assert.rejects(() => f.claim(g, { customer: f.owner }), /registration_required/);
    await assert.rejects(
      () => f.rpc("mealdeck_group_payment_status", [g.room.roomId, f.owner, null, null]),
      /registration_required|room_unavailable/,
    );
    await assert.rejects(
      () =>
        f.rpc("mealdeck_group_payment_status", [
          g.room.roomId,
          f.unverified,
          null,
          g.tokens[0].tokenHash,
        ]),
      /registration_required/,
    );
  });

  await test("a claimed share is immutable and organiser cover only reserves unclaimed balance", async () => {
    const g = await f.group();
    const attempt = f.next();
    const first = await f.claim(g, { customer: f.otherCustomer, attempt });
    assert.deepEqual(await f.claim(g, { customer: f.otherCustomer, attempt }), first);
    await assert.rejects(() => f.claim(g), /share_claimed/);
    await assert.rejects(
      () => f.claim(g, { index: 1, customer: f.otherCustomer, attempt }),
      /attempt_conflict/,
    );
    const rest = await f.claim(g, { cover: true });
    assert.equal(rest.coverRemaining, true);
    assert.equal(rest.requestShareId, null);
    const coverRetry = await f.rpc("mealdeck_prepare_group_payment", [
      g.room.roomId,
      f.customer,
      null,
      g.tokens[0].tokenHash,
      true,
      rest.attemptId,
      "acct_Fixture",
      false,
    ]);
    assert.equal(
      coverRetry.collectionId,
      rest.collectionId,
      "irrelevant share cookies do not change cover-remaining retries",
    );
    assert.deepEqual(rest.shareIds, [g.tokens[1].shareId]);
    assert.equal(first.amountPence + rest.amountPence, g.room.totalPence);
    assert.equal(
      await scalar(
        "select count(*)::int from mealdeck_private.payment_collection_shares where order_id=$1 and active",
        [g.room.orderId],
      ),
      2,
    );
  });

  await test("partial funding never releases; full verified funding queues exactly once and prints once on staff acceptance", async () => {
    const g = await f.group();
    const one = await f.bindPayment(await f.claim(g));
    const two = await f.bindPayment(await f.claim(g, { index: 1, customer: f.otherCustomer }));
    assert.equal((await f.reconcilePayment(one)).orderPaid, false);
    assert.equal(await tickets(g.room.orderId), 0);
    assert.equal(await authority(g.room.orderId), null);
    assert.equal((await f.status(g)).remainingPence, two.amountPence);
    const event = "evt_full";
    const result = await f.reconcilePayment(two, { event, intent: "pi_full" });
    assert.equal(result.orderPaid, true);
    const counts = await tickets(g.room.orderId);
    assert.ok(counts > 0);
    const release = await authority(g.room.orderId);
    assert.equal(release.eligible, true);
    assert.equal(
      await scalar("select public.group_order_financial_ready($1)", [g.room.roomId]),
      true,
    );
    assert.equal((await f.reconcilePayment(two, { event, intent: "pi_full" })).replayed, true);
    assert.equal(await tickets(g.room.orderId), counts);
    assert.equal((await authority(g.room.orderId)).release_id, release.release_id);
    assert.equal(
      await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
        g.room.orderId,
      ]),
      0,
    );
    const card = (await board()).orders.find((o) => o.order_id === g.room.orderId);
    assert.ok(card);
    await asActor(db, f.owner, () =>
      db.query("select public.mealdeck_ops_kds_accept_order($1,$2,$3,$4)", [
        f.tenantId,
        f.locationId,
        g.room.orderId,
        card.version,
      ]),
    );
    await asActor(db, f.owner, () =>
      db.query("select public.mealdeck_ops_kds_accept_order($1,$2,$3,$4)", [
        f.tenantId,
        f.locationId,
        g.room.orderId,
        card.version,
      ]),
    );
    const jobs = (
      await db.query("select receipt from mealdeck_private.receipt_jobs where order_id=$1", [
        g.room.orderId,
      ])
    ).rows;
    assert.equal(jobs.length, 1);
    assert.deepEqual(jobs[0].receipt.packingPlan, g.quote.packingPlan);
    const receipt = await f.service(
      async () =>
        (
          await db.query("select public.mealdeck_customer_order_receipt($1,$2) result", [
            g.room.orderId,
            f.customer,
          ])
        ).rows[0].result,
    );
    assert.equal(receipt.verifiedPaid, true);
    assert.equal(receipt.totalPence, g.room.totalPence);
  });

  await test("later successful evidence records cannot reroute an already released order", async () => {
    const g = await f.group();
    const c = await f.bindPayment(await f.claim(g, { cover: true }));
    await f.reconcilePayment(c, { event: "evt_firstrelease", intent: "pi_onerelease" });
    const originalCount = await tickets(c.orderId);
    const release = await authority(c.orderId);
    const station = f.next();
    const item = g.quote.lines[0].menu_item_id;
    const route = (
      await db.query(
        "select prep_kind,prep_seconds from public.menu_item_station_routes where location_id=$1 and item_id=$2 limit 1",
        [f.locationId, item],
      )
    ).rows[0];
    await db.query(
      "insert into public.kitchen_stations(id,tenant_id,location_id,name,code,active) values($1,$2,$3,'New station','new-station',true)",
      [station, f.tenantId, f.locationId],
    );
    await db.query(
      "insert into public.menu_item_station_routes(tenant_id,location_id,item_id,station_id,prep_kind,prep_seconds) values($1,$2,$3,$4,$5,$6)",
      [f.tenantId, f.locationId, item, station, route.prep_kind, route.prep_seconds],
    );
    try {
      const duplicate = await f.reconcilePayment(c, {
        event: "evt_laterreceipt",
        intent: "pi_onerelease",
      });
      assert.equal(duplicate.orderPaid, true);
      assert.equal(duplicate.replayed, false);
      assert.equal(await tickets(c.orderId), originalCount);
      assert.equal((await authority(c.orderId)).release_id, release.release_id);
      assert.equal(
        await scalar("select count(*)::int from public.mealdeck_pass_orders where order_id=$1", [
          c.orderId,
        ]),
        1,
      );
    } finally {
      await db.query("delete from public.menu_item_station_routes where station_id=$1", [station]);
      await db.query("update public.kitchen_stations set active=false where id=$1", [station]);
    }
  });

  await test("provider account, mode, currency, amount, identifier and evidence conflicts fail without payment or tickets", async () => {
    const g = await f.group();
    const c = await f.bindPayment(await f.claim(g, { cover: true }));
    for (const mismatch of [
      { account: "acct_Other" },
      { livemode: true },
      { currency: "usd" },
      { captured: c.amountPence - 1 },
      { session: "cs_test_other" },
      { orderId: f.next() },
    ]) {
      await assert.rejects(
        () => f.reconcilePayment(c, mismatch),
        /payment_mismatch|order_unavailable/,
      );
    }
    assert.equal(await tickets(c.orderId), 0);
    assert.equal(
      await scalar("select count(*)::int from mealdeck_private.payment_events where order_id=$1", [
        c.orderId,
      ]),
      0,
    );
    await f.reconcilePayment(c, { event: "evt_fixed", intent: "pi_fixed" });
    await assert.rejects(
      () =>
        f.reconcilePayment(c, {
          event: "evt_fixed",
          intent: "pi_fixed",
          hash: paymentHash("different"),
        }),
      /event_conflict/,
    );
    await assert.rejects(
      () => f.bindPayment(c, { session: "cs_test_changed", intent: "pi_fixed" }),
      /payment_mismatch/,
    );
  });

  await test("a webhook can bind a lost provider response and a replay never creates a second order", async () => {
    const g = await f.group();
    const c = await f.claim(g, { cover: true });
    const result = await f.reconcilePayment(c, {
      session: "cs_test_lost",
      intent: "pi_lost",
      event: "evt_lost",
    });
    assert.equal(result.orderPaid, true);
    const saved = await f.rpc("mealdeck_order_payment_collection", [
      c.collectionId,
      "acct_Fixture",
      false,
    ]);
    assert.equal(saved.sessionId, "cs_test_lost");
    assert.equal(saved.sessionUrl, null);
    assert.equal(saved.paymentIntentId, "pi_lost");
    assert.equal(
      (await f.claim(g, { cover: true, attempt: c.attemptId })).collectionId,
      c.collectionId,
    );
    assert.equal(
      await scalar("select count(*)::int from mealdeck_private.payment_orders where quote_id=$1", [
        g.quote.quoteId,
      ]),
      1,
    );
  });

  await test("cancelled rooms retain claims until provider cancellation and captured money requires human refund review", async () => {
    const g = await f.group();
    const c = await f.bindPayment(await f.claim(g, { cover: true }));
    const cancelled = await f.rpc("mealdeck_cancel_group_payment_room", [
      g.room.roomId,
      f.customer,
      null,
    ]);
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.collectionsToCancel.length, 1);
    assert.equal(
      await scalar(
        "select count(*)::int from mealdeck_private.payment_collection_shares where collection_id=$1 and active",
        [c.collectionId],
      ),
      2,
    );
    await assert.rejects(() => f.claim(g, { cover: true }), /order_held|nothing_available/);
    const late = await f.reconcilePayment(c, { intent: "pi_cancelrace" });
    assert.equal(late.held, true);
    assert.equal(late.orderPaid, false);
    assert.equal((await f.status(g)).status, "refund_review");
    assert.equal(await tickets(c.orderId), 0);
    assert.equal(
      await scalar(
        "select count(*)::int from public.mealdeck_refund_allocations where order_id=$1",
        [c.orderId],
      ),
      0,
    );
    const cancelledAfter = await f.rpc("mealdeck_cancel_group_payment_room", [
      g.room.roomId,
      f.customer,
      null,
    ]);
    assert.equal(cancelledAfter.refundReviewRequired, true);
  });

  await test("only verified expiry releases an unpaid claim; failure and browser deadlines do not", async () => {
    const g = await f.group();
    const c = await f.bindPayment(await f.claim(g));
    await f.reconcilePayment(c, {
      type: "payment_intent.payment_failed",
      captured: 0,
      intent: "pi_failed",
    });
    await assert.rejects(() => f.claim(g), /share_claimed/);
    await f.reconcilePayment(c, {
      type: "checkout.session.expired",
      captured: 0,
      intent: "pi_failed",
    });
    const replacement = await f.claim(g);
    assert.notEqual(replacement.collectionId, c.collectionId);
    assert.equal(
      await scalar(
        "select count(*)::int from mealdeck_private.payment_collection_shares where share_id=$1 and active",
        [g.tokens[0].shareId],
      ),
      1,
    );
    await db.query(
      "update mealdeck_private.payment_orders set expires_at=now()+interval '29 minutes' where order_id=$1",
      [g.room.orderId],
    );
    await assert.rejects(() => f.claim(g, { index: 1 }), /funding_expired/);
    assert.equal(
      await scalar(
        "select count(*)::int from mealdeck_private.payment_collection_shares where collection_id=$1 and active",
        [replacement.collectionId],
      ),
      1,
    );
    await db.query(
      "update mealdeck_private.payment_collections set expires_at=now()-interval '1 second' where id=$1",
      [replacement.collectionId],
    );
    const late = await f.reconcilePayment(replacement, {
      session: "cs_test_late",
      intent: "pi_late",
    });
    assert.equal(late.held, true);
    assert.equal(await tickets(g.room.orderId), 0);
  });

  await test("refunds and disputes persist holds; stale provider receipts cannot erase verified money", async () => {
    const g = await f.group();
    let c = await f.bindPayment(await f.claim(g, { cover: true }));
    await f.reconcilePayment(c, { intent: "pi_refund" });
    c = { ...c, paymentIntentId: "pi_refund" };
    await f.reconcilePayment(c, { type: "charge.refunded", refunded: 100, event: "evt_refund" });
    assert.equal(await authority(g.room.orderId), null);
    assert.equal((await f.status(g)).refundedPence, 100);
    await f.reconcilePayment(c, { type: "charge.refunded", refunded: 100, event: "evt_refund" });
    assert.equal(
      await scalar(
        "select sum(amount_pence)::int from public.mealdeck_refund_allocations where order_id=$1",
        [c.orderId],
      ),
      100,
    );
    await f.reconcilePayment(c, { event: "evt_oldsuccess" });
    assert.equal((await f.status(g)).refundedPence, 100);
    await assert.rejects(
      () => f.reconcilePayment(c, { type: "payment_intent.canceled", captured: 0 }),
      /payment_mismatch/,
    );
    await f.reconcilePayment(c, { type: "charge.dispute.created", disputed: true });
    await f.reconcilePayment(c, { type: "charge.dispute.closed", disputed: false });
    assert.equal((await f.status(g)).status, "refund_review");
    await assert.rejects(() => f.terminal({ orderId: c.orderId }), /order_held|online_overlap/);
  });

  await test("Terminal quotes use verified staff identity, canonical prices and validated kerbside without customer accounts", async () => {
    const users = await scalar("select count(*)::int from auth.users");
    await assert.rejects(() => f.terminalQuote({ actor: f.customer }), /staff_forbidden/);
    await assert.rejects(() => f.terminalQuote({ fulfilment: "curbside" }), /vehicle_required/);
    const q = await f.terminalQuote({
      fulfilment: "curbside",
      vehicle: { make: "Ford", colour: "Blue", registrationLast4: "AB12" },
    });
    assert.equal(q.totalPence, 279);
    assert.equal(
      await scalar("select staff_id from mealdeck_private.checkout_quotes where id=$1", [
        q.quoteId,
      ]),
      f.owner,
    );
    assert.equal(
      await scalar(
        "select num_nonnulls(customer_id,guest_id,staff_id) from mealdeck_private.checkout_quotes where id=$1",
        [q.quoteId],
      ),
      1,
    );
    const c = await f.terminal({ quoteId: q.quoteId });
    assert.equal(c.method, "terminal");
    assert.equal(c.email, null);
    assert.equal(c.terminalLocationId, "tml_Fixture");
    assert.equal(
      await scalar("select customer_id from public.orders where id=$1", [c.orderId]),
      null,
    );
    assert.equal(await scalar("select count(*)::int from auth.users"), users);
    const recovery = await f.rpc("mealdeck_terminal_payment_attempt", [
      f.owner,
      f.tenantId,
      f.locationId,
      c.attemptId,
    ]);
    assert.deepEqual(recovery, c);
    assert.equal(
      await f.rpc("mealdeck_terminal_payment_attempt", [
        f.owner,
        f.tenantId,
        f.locationId,
        f.next(),
      ]),
      null,
    );
    const b = await f.bindPayment(c);
    await f.reconcilePayment(b);
    const status = await f.rpc("mealdeck_terminal_order_status", [
      f.owner,
      f.tenantId,
      f.locationId,
      c.orderId,
    ]);
    assert.equal(status.verifiedPaid, true);
    assert.equal(status.collectiblePence, 0);
    assert.equal(status.activeCollection.attemptId, c.attemptId);
    await assert.rejects(() => f.terminal({ orderId: c.orderId }), /already_paid/);
  });

  await test("online and Terminal claims cannot overlap and already paid ordinary orders cannot be charged again", async () => {
    const g = await f.group();
    const c = await f.claim(g);
    await assert.rejects(() => f.terminal({ orderId: g.room.orderId }), /online_overlap/);
    const g2 = await f.group();
    const terminal = await f.terminal({ orderId: g2.room.orderId });
    await assert.rejects(() => f.claim(g2), /online_overlap|share_claimed/);
    const q = await f.quote();
    const ordinary = await f.prepare(q.quoteId, { attemptId: f.next() });
    await assert.rejects(() => f.terminal({ orderId: ordinary.orderId }), /online_overlap/);
    await f.bind(ordinary.orderId, "cs_test_ordinary");
    await f.reconcile(ordinary, {
      event: "evt_ordinary",
      session: "cs_test_ordinary",
      intent: "pi_ordinary",
    });
    assert.ok(await authority(ordinary.orderId));
    await assert.rejects(() => f.terminal({ orderId: ordinary.orderId }), /already_paid/);
    await assert.rejects(
      () => f.prepare(g.quote.quoteId, { attemptId: f.next() }),
      /quote_already_frozen/,
    );
    assert.equal(
      await scalar("select count(*)::int from public.orders where id=$1", [terminal.orderId]),
      1,
    );
    assert.equal(c.method, "checkout");
  });

  await test("Terminal cancellation holds its claim through network uncertainty and recovers after verified cancellation", async () => {
    const q = await f.terminalQuote();
    const c = await f.terminal({ quoteId: q.quoteId });
    await f.rpc("mealdeck_cancel_terminal_payment", [
      f.owner,
      f.tenantId,
      f.locationId,
      c.collectionId,
    ]);
    await assert.rejects(() => f.terminal({ orderId: c.orderId }), /online_overlap/);
    const b = await f.bindPayment(c, { intent: "pi_terminalcancel" });
    assert.equal(b.cancelRequested, true);
    await f.reconcilePayment(b, { type: "payment_intent.canceled", captured: 0 });
    const next = await f.terminal({ orderId: c.orderId });
    assert.notEqual(next.collectionId, c.collectionId);
    assert.equal(next.amountPence, c.amountPence);
    const saved = await f.rpc("mealdeck_terminal_payment_attempt", [
      f.owner,
      f.tenantId,
      f.locationId,
      c.attemptId,
    ]);
    assert.equal(saved.status, "cancelled");
    // A late verified capture for the old attempt is never silently discarded.
    const late = await f.reconcilePayment(b);
    assert.equal(late.held, true);
    assert.equal(await tickets(c.orderId), 0);
    // The replacement may also have captured while cancellation was in flight.
    // Preserve both monetary facts and hold the order instead of hiding an overpayment.
    await f.reconcilePayment(next, { intent: "pi_replacement" });
    const review = await f.rpc("mealdeck_terminal_order_status", [
      f.owner,
      f.tenantId,
      f.locationId,
      c.orderId,
    ]);
    assert.equal(review.held, true);
    assert.equal(review.capturedPence, c.amountPence * 2);
    assert.equal(review.remainingPence, 0);
    assert.equal(await tickets(c.orderId), 0);
  });

  await test("pause and launch closure block new claims while frozen recovery, receipts and paid reconciliation remain usable", async () => {
    const g = await f.group();
    const c = await f.bindPayment(await f.claim(g));
    const newQuote = await f.quote();
    await close();
    await assert.rejects(() => f.claim(g, { index: 1 }), /unavailable/);
    await assert.rejects(() => f.terminalQuote(), /unavailable/);
    assert.equal((await f.claim(g, { attempt: c.attemptId })).collectionId, c.collectionId);
    assert.equal((await f.reconcilePayment(c)).orderPaid, false);
    assert.equal((await f.status(g)).paidPence, c.amountPence);
    await open(40);
    assert.equal(
      await scalar(
        "select collection_estimate_minutes from mealdeck_private.checkout_quotes where id=$1",
        [g.quote.quoteId],
      ),
      25,
    );
    assert.equal(
      await scalar("select expires_at>now() from mealdeck_private.checkout_quotes where id=$1", [
        g.quote.quoteId,
      ]),
      true,
    );
    assert.equal(
      await scalar("select expires_at<=now() from mealdeck_private.checkout_quotes where id=$1", [
        newQuote.quoteId,
      ]),
      true,
    );
    await setGuestFixtureClock(db, "2026-11-06T23:00:00Z");
    await assert.rejects(() => f.claim(g, { index: 1 }), /outside_opening_hours/);
    await setGuestFixtureClock(db, "2026-11-06T16:00:00Z");
    await open();
  });

  await test("guest owner and guest payer identities remain scoped with no membership or loyalty enrollment", async () => {
    const token = paymentHash("guest-payment-room");
    const payer = paymentHash("guest-payer");
    await f.guest.session(token);
    await f.guest.session(payer);
    const users = await scalar("select count(*)::int from auth.users");
    const g = await f.group({ guestToken: token });
    const c = await f.claim(g, { guestToken: payer });
    assert.equal(c.email, "guest@example.invalid");
    const guestPayer = await f.rpc("mealdeck_group_payment_collections", [
      g.room.roomId,
      null,
      payer,
      g.tokens[0].tokenHash,
    ]);
    assert.equal(guestPayer[0].payerAccess, true);
    const guestOwner = await f.rpc("mealdeck_group_payment_collections", [
      g.room.roomId,
      null,
      token,
      null,
    ]);
    assert.equal(
      guestOwner[0].payerAccess,
      false,
      "matching guest contact emails never establish payer identity",
    );
    await f.reconcilePayment(await f.bindPayment(c));
    await f.reconcilePayment(
      await f.bindPayment(await f.claim(g, { guestToken: token, index: 1 })),
    );
    const ownerReceipt = await f.guest.receipt(token, g.room.orderId);
    assert.equal(ownerReceipt.verifiedPaid, true);
    assert.equal(ownerReceipt.loyaltyEligible, false);
    const ordinaryQuote = await f.guest.quote(token);
    const ordinary = await f.guest.prepare(token, ordinaryQuote.quoteId);
    await f.bind(ordinary.orderId, "cs_test_guestlegacy");
    await f.reconcile(ordinary, {
      event: "evt_guestlegacy",
      session: "cs_test_guestlegacy",
      intent: "pi_guestlegacy",
    });
    assert.equal((await f.guest.receipt(token, ordinary.orderId)).verifiedPaid, true);
    await assert.rejects(
      () =>
        f.rpc("mealdeck_prepare_group_payment", [
          g.room.roomId,
          f.customer,
          token,
          g.tokens[1].tokenHash,
          false,
          f.next(),
          "acct_Fixture",
          false,
        ]),
      /identity_required/,
    );
    await setGuestFixtureClock(db, "2026-11-09T10:00:00Z");
    await assert.rejects(() => f.claim(g, { guestToken: payer, index: 1 }), /guest_unavailable/);
    assert.equal(
      (await f.rpc("mealdeck_group_payment_status", [g.room.roomId, null, token, null])).viewer
        .role,
      "organiser",
    );
    assert.equal(await scalar("select count(*)::int from auth.users"), users);
    await setGuestFixtureClock(db, "2026-11-06T16:00:00Z");
  });
  if (db.native) await sharedPaymentConcurrencyTests(db, f, test);
  console.log(`Verified ${checks} shared/Terminal payment behavior groups.`);
} finally {
  await db.close();
}
