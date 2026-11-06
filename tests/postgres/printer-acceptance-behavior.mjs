import assert from "node:assert/strict";
import pg from "pg";
import { asActor, createDatabase, id } from "./harness.mjs";
import { setupSharedPaymentsFixture } from "./shared-terminal-payments-fixture.mjs";
import {
  buildPrinterAcceptanceSql,
  buildManagedPrinterAcceptanceSql,
} from "../../deploy/mealdeck/printer-acceptance.mjs";

const db = await createDatabase(process.argv.includes("--native"));
const printer = id(62101),
  kitchen = id(62102),
  unverified = id(62103),
  stranger = id(62104);
let checks = 0,
  sequence = 62200;
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
async function check(label, action) {
  try {
    await action();
    console.log(`PASS printer acceptance ${++checks}: ${label}`);
  } catch (error) {
    console.error(`FAIL printer acceptance: ${label}`);
    throw error;
  }
}
try {
  const f = await setupSharedPaymentsFixture(db);
  const definitions = () =>
    rows(`select n.nspname,p.proname,p.oid::regprocedure::text signature,
    md5(p.prosrc) hash,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','mealdeck_private','mealdeck_ops_private')
      and p.proname not in ('kitchen_lock_order','mealdeck_ops_kds_accept_order',
        'kitchen_lock_order_rows','kitchen_locked_order_evidence','kitchen_accept_locked_order',
        'mealdeck_printer_acceptance_board','mealdeck_printer_accept_order') order by 1,2,3`);
  const permissions = () =>
    rows(`select n.nspname,c.relname,c.relacl::text acl,c.relrowsecurity rls
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','mealdeck_private','mealdeck_ops_private') and c.relkind in ('r','S') order by 1,2`);
  const oldDefinitions = await definitions(),
    oldPermissions = await permissions();
  await check(
    "atomic installation keeps payment authority, receipt builders and existing grants unchanged",
    async () => {
      for (const options of [
        {},
        { runnerOwnsTransaction: true },
        { runnerOwnsTransaction: true, singleMigration: true, split: true },
      ])
        assert.throws(() => buildManagedPrinterAcceptanceSql(options), /one runner-owned/);
      await db.exec("begin");
      await db.exec(
        buildManagedPrinterAcceptanceSql({ runnerOwnsTransaction: true, singleMigration: true }),
      );
      await db.exec("rollback");
      assert.equal(
        await scalar(
          "select to_regprocedure('public.mealdeck_printer_acceptance_board(uuid,uuid)')",
        ),
        null,
      );
      await db.exec(buildPrinterAcceptanceSql());
      await db.exec(buildPrinterAcceptanceSql());
      assert.deepEqual(await definitions(), oldDefinitions);
      assert.deepEqual(await permissions(), oldPermissions);
      const acl = await rows(`select proname,has_function_privilege('anon',oid,'EXECUTE') anon,
      has_function_privilege('authenticated',oid,'EXECUTE') staff,
      has_function_privilege('service_role',oid,'EXECUTE') service from pg_proc
      where proname in ('mealdeck_printer_acceptance_board','mealdeck_printer_accept_order')`);
      assert.equal(acl.length, 2);
      assert.ok(acl.every((r) => r.staff && !r.anon && !r.service));
      const helpers = await rows(`select proname,has_function_privilege('anon',oid,'EXECUTE') anon,
      has_function_privilege('authenticated',oid,'EXECUTE') staff,
      has_function_privilege('service_role',oid,'EXECUTE') service from pg_proc
      where proname in ('kitchen_lock_order_rows','kitchen_locked_order_evidence','kitchen_accept_locked_order')`);
      assert.equal(helpers.length, 3);
      assert.ok(helpers.every((r) => !r.staff && !r.anon && !r.service));
    },
  );
  for (const user of [printer, kitchen, unverified, stranger])
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,case when $3 then now() else null end)",
      [user, `printer-accept-${user}@example.invalid`, user !== unverified],
    );
  await db.query(
    "insert into public.mealdeck_ops_staff_access(user_id,tenant_id,location_id,role,created_by) values($1,$2,$3,'kitchen',$4)",
    [kitchen, f.tenantId, f.locationId, f.owner],
  );
  for (const user of [printer, unverified])
    await db.query(
      "insert into mealdeck_private.printer_access(tenant_id,location_id,user_id,created_by,enabled) values($1,$2,$3,$4,true)",
      [f.tenantId, f.locationId, user, f.owner],
    );
  const rpc = (actor, name, args = [], role = "authenticated") => {
    assert.match(name, /^mealdeck_(printer|ops_kds)_[a-z_]+$/);
    return asActor(
      db,
      actor,
      () => scalar(`select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")})`, args),
      role,
    );
  };
  const pending = (
    actor = printer,
    tenant = f.tenantId,
    location = f.locationId,
    role = "authenticated",
  ) => rpc(actor, "mealdeck_printer_acceptance_board", [tenant, location], role);
  const kds = (actor = kitchen) => rpc(actor, "mealdeck_ops_kds_board", [f.tenantId, f.locationId]);
  const pendingCard = async (order) =>
    (await pending()).orders.find((card) => card.orderId === order);
  const kdsCard = async (order) => (await kds()).orders.find((card) => card.order_id === order);
  const accept = (
    order,
    version,
    actor = printer,
    tenant = f.tenantId,
    location = f.locationId,
    role = "authenticated",
  ) => rpc(actor, "mealdeck_printer_accept_order", [tenant, location, order, version], role);
  const acceptKds = (order, version, actor = kitchen) =>
    rpc(actor, "mealdeck_ops_kds_accept_order", [f.tenantId, f.locationId, order, version]);
  const jobs = (order) =>
    rows("select * from mealdeck_private.receipt_jobs where order_id=$1 order by copy_number", [
      order,
    ]);
  const audits = (order) =>
    rows(
      "select * from public.mealdeck_ops_audit_log where entity_id=$1 and action='kds.order.accepted'",
      [order],
    );
  const paidOrder = async () => {
    const n = ++sequence;
    const group = f.data.modifierGroups.find((g) => g.id === "skorch-burgers-burger-add-ons");
    const modifier = f.mkOption(group.id, group.options[0].id);
    const lines = [
      { ...f.line, quantity: 2, modifiers: [modifier] },
      { ...f.line, lineId: "line-2", quantity: 1 },
    ];
    const packing = {
      version: 1,
      separateBags: true,
      cutleryRequested: true,
      bags: [
        {
          number: 1,
          allocations: [
            { lineId: "line-1", quantity: 1 },
            { lineId: "line-2", quantity: 1 },
          ],
        },
        { number: 2, allocations: [{ lineId: "line-1", quantity: 1 }] },
      ],
    };
    const quote = await f.quote({ lines, packing });
    const prepared = await f.prepare(quote.quoteId, { attemptId: id(n) });
    const session = `cs_test_printeraccept${n}`,
      intent = `pi_printeraccept${n}`;
    await f.bind(prepared.orderId, session);
    await f.reconcile(prepared, { session, intent, event: `evt_printeraccept${n}` });
    return { orderId: prepared.orderId, prepared, session, intent, quote, packing };
  };
  await check(
    "printer-only permission is scoped and does not grant Ops or KDS authority",
    async () => {
      assert.equal((await pending()).orders.length, 0);
      assert.equal((await pending(f.owner)).orders.length, 0);
      assert.equal(
        await scalar(
          "select count(*)::int from public.mealdeck_ops_staff_access where user_id=$1",
          [printer],
        ),
        0,
      );
      for (const actor of [null, f.customer, stranger, unverified, kitchen]) {
        await assert.rejects(() => pending(actor), /forbidden|unauthenticated/);
        await assert.rejects(
          () => accept(id(62999), "a".repeat(32), actor),
          /forbidden|unauthenticated/,
        );
      }
      for (const role of ["anon", "service_role"]) {
        await assert.rejects(
          () => pending(printer, f.tenantId, f.locationId, role),
          /permission denied/,
        );
        await assert.rejects(
          () => accept(id(62999), "a".repeat(32), printer, f.tenantId, f.locationId, role),
          /permission denied/,
        );
      }
      await assert.rejects(() => pending(printer, id(62998), f.locationId), /forbidden/);
      await assert.rejects(() => pending(printer, f.tenantId, id(62997)), /forbidden/);
      await assert.rejects(() => kds(printer), /forbidden/);
      await assert.rejects(() => acceptKds(id(62999), "a".repeat(32), printer), /forbidden/);
      for (const name of ["kitchen_lock_order_rows", "kitchen_locked_order_evidence"])
        await assert.rejects(
          () =>
            asActor(db, printer, () =>
              db.query(`select mealdeck_ops_private.${name}($1,$2,$3)`, [
                f.tenantId,
                f.locationId,
                id(62999),
              ]),
            ),
          /permission denied/,
        );
    },
  );
  await check("unpaid and forged paid flags are invisible and cannot be accepted", async () => {
    const q = await f.quote();
    const unpaid = await f.prepare(q.quoteId, { attemptId: id(++sequence) });
    assert.equal(await pendingCard(unpaid.orderId), undefined);
    await assert.rejects(() => accept(unpaid.orderId, "a".repeat(32)), /release_required/);
    // Disposable negative fixture only: flags without provider evidence must fail.
    await db.query(
      "update public.orders set payment_status='paid',paid_at=now(),status='accepted' where id=$1",
      [unpaid.orderId],
    );
    assert.equal(await pendingCard(unpaid.orderId), undefined);
    await assert.rejects(() => accept(unpaid.orderId, "a".repeat(32)), /release_required/);
    assert.equal((await jobs(unpaid.orderId)).length, 0);
    assert.equal(
      await scalar("select count(*)::int from public.kds_tickets where order_id=$1", [
        unpaid.orderId,
      ]),
      0,
    );
  });
  await check(
    "paid pending summary is minimal and does not create a preaccept receipt",
    async () => {
      const o = await paidOrder();
      const card = await pendingCard(o.orderId),
        k = await kdsCard(o.orderId);
      assert.equal(card.version, k.version);
      assert.deepEqual(
        Object.keys(card).sort(),
        [
          "orderId",
          "version",
          "displayCode",
          "paidAt",
          "fulfilment",
          "totalPence",
          "cutleryRequested",
          "notes",
          "packingPlan",
          "items",
        ].sort(),
      );
      assert.equal(card.totalPence, o.prepared.totalPence);
      assert.deepEqual(card.packingPlan, o.packing);
      assert.equal(card.cutleryRequested, true);
      assert.equal(card.items.length, 2);
      assert.equal(card.items[0].quantity, 2);
      assert.ok(card.items[0].modifiers.length > 0);
      assert.deepEqual(card.items[0].bags, [
        { number: 1, quantity: 1 },
        { number: 2, quantity: 1 },
      ]);
      assert.equal((await jobs(o.orderId)).length, 0);
      assert.equal(
        await scalar("select accepted_at from public.orders where id=$1", [o.orderId]),
        null,
      );
      const board = await pending();
      assert.equal(board.schemaVersion, 1);
      assert.equal(board.tenantId, f.tenantId);
      assert.equal(board.locationId, f.locationId);
      assert.ok(Number.isFinite(Date.parse(board.generatedAt)));
      assert.equal(board.remainingOrderCount, 0);
      for (const key of [
        "customerId",
        "customerEmail",
        "customerPhone",
        "receipt",
        "claimToken",
        "paymentIntentId",
      ])
        assert.ok(!Object.hasOwn(card, key));
    },
  );
  await check(
    "either acceptance surface uses one immutable snapshot, one audit and the same original job on replay",
    async () => {
      for (const first of ["printer", "kds"]) {
        const o = await paidOrder(),
          card = await pendingCard(o.orderId);
        const before = await rows(
          "select * from public.order_items where order_id=$1 order by id",
          [o.orderId],
        );
        if (first === "printer")
          assert.equal((await accept(o.orderId, card.version)).replayed, false);
        else assert.equal((await acceptKds(o.orderId, card.version)).replayed, false);
        const original = (await jobs(o.orderId))[0];
        assert.ok(original);
        assert.equal(original.status, "queued");
        assert.equal(original.copy_number, 1);
        assert.equal(original.receipt.orderId, o.orderId);
        assert.deepEqual(original.receipt.packingPlan, o.packing);
        assert.equal(original.receipt.totalPence, o.prepared.totalPence);
        assert.equal((await acceptKds(o.orderId, card.version)).replayed, true);
        const replay = await accept(o.orderId, card.version);
        assert.deepEqual(replay, {
          schemaVersion: 1,
          orderId: o.orderId,
          accepted: true,
          replayed: true,
          receiptJobId: original.id,
        });
        assert.deepEqual(await jobs(o.orderId), [original]);
        assert.deepEqual(
          await rows("select * from public.order_items where order_id=$1 order by id", [o.orderId]),
          before,
        );
        assert.equal((await audits(o.orderId)).length, 1);
        assert.equal(
          (await audits(o.orderId))[0].actor_id,
          first === "printer" ? printer : kitchen,
        );
        assert.equal(await pendingCard(o.orderId), undefined);
        assert.ok((await kdsCard(o.orderId)).accepted_at);
        assert.equal(
          await scalar(
            "select count(*)::int from mealdeck_private.receipt_events where job_id=$1",
            [original.id],
          ),
          0,
        );
      }
    },
  );
  await check(
    "stale versions, wrong scopes and incomplete routing fail without partial acceptance",
    async () => {
      const o = await paidOrder(),
        card = await pendingCard(o.orderId);
      await db.query("update public.orders set notes='Reviewed kitchen instruction' where id=$1", [
        o.orderId,
      ]);
      await assert.rejects(() => accept(o.orderId, card.version), /conflict/);
      await assert.rejects(
        async () =>
          accept(o.orderId, (await pendingCard(o.orderId)).version, printer, f.tenantId, id(62996)),
        /forbidden/,
      );
      assert.equal((await jobs(o.orderId)).length, 0);
      assert.equal(
        await scalar("select accepted_at from public.orders where id=$1", [o.orderId]),
        null,
      );
      const changed = await pendingCard(o.orderId);
      await db.query("update public.kitchen_stations set active=false where id=$1", [f.stationId]);
      assert.equal(await pendingCard(o.orderId), undefined);
      await assert.rejects(() => accept(o.orderId, changed.version), /routing_incomplete/);
      await db.query("update public.kitchen_stations set active=true where id=$1", [f.stationId]);
      await accept(o.orderId, (await pendingCard(o.orderId)).version);
    },
  );
  await check(
    "partial shared payment is invisible; full verified funding allows one shared receipt",
    async () => {
      const group = await f.group();
      const one = await f.bindPayment(await f.claim(group));
      const two = await f.bindPayment(
        await f.claim(group, { index: 1, customer: f.otherCustomer }),
      );
      assert.equal((await f.reconcilePayment(one)).orderPaid, false);
      assert.equal(await pendingCard(group.room.orderId), undefined);
      await assert.rejects(() => accept(group.room.orderId, "a".repeat(32)), /release_required/);
      assert.equal((await jobs(group.room.orderId)).length, 0);
      assert.equal((await f.reconcilePayment(two)).orderPaid, true);
      const card = await pendingCard(group.room.orderId);
      assert.ok(card);
      const accepted = await accept(group.room.orderId, card.version);
      assert.equal(accepted.replayed, false);
      assert.equal((await jobs(group.room.orderId)).length, 1);
      assert.equal((await acceptKds(group.room.orderId, card.version)).replayed, true);
    },
  );
  await check(
    "refunds and payment holds deny stale acceptance and replay before any new receipt",
    async () => {
      for (const kind of ["refund", "hold"])
        for (const accepted of [false, true]) {
          const o = await paidOrder(),
            card = await pendingCard(o.orderId);
          if (accepted) await accept(o.orderId, card.version);
          const before = await jobs(o.orderId);
          if (kind === "refund")
            await f.reconcile(o.prepared, {
              session: o.session,
              intent: o.intent,
              event: `evt_refund${++sequence}`,
              type: "charge.refunded",
              refunded: 1,
            });
          else
            await f.reconcile(o.prepared, {
              session: o.session,
              intent: o.intent,
              event: `evt_disputed${++sequence}`,
              type: "charge.dispute.created",
              disputed: true,
            });
          assert.equal(await pendingCard(o.orderId), undefined);
          await assert.rejects(() => accept(o.orderId, card.version), /release_required/);
          await assert.rejects(() => acceptKds(o.orderId, card.version), /release_required/);
          assert.deepEqual(await jobs(o.orderId), before);
        }
    },
  );
  await check(
    "revoked and banned printer identities fail even with a previously valid card",
    async () => {
      const o = await paidOrder(),
        card = await pendingCard(o.orderId);
      await db.query("update mealdeck_private.printer_access set enabled=false where user_id=$1", [
        printer,
      ]);
      await assert.rejects(() => pending(), /forbidden/);
      await assert.rejects(() => accept(o.orderId, card.version), /forbidden/);
      await db.query("update mealdeck_private.printer_access set enabled=true where user_id=$1", [
        printer,
      ]);
      await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1", [
        printer,
      ]);
      await assert.rejects(() => accept(o.orderId, card.version), /forbidden/);
      await db.query("update auth.users set banned_until=null where id=$1", [printer]);
      assert.equal((await jobs(o.orderId)).length, 0);
      await accept(o.orderId, (await pendingCard(o.orderId)).version);
    },
  );
  await check(
    "missing legacy copy-1 receipt fails clearly instead of fabricating a replacement",
    async () => {
      const o = await paidOrder(),
        card = await pendingCard(o.orderId);
      // Disposable corruption fixture, not an installation repair or production write.
      await db.query("update public.orders set accepted_at=now() where id=$1", [o.orderId]);
      await assert.rejects(() => accept(o.orderId, card.version), /receipt_unavailable/);
      assert.equal((await jobs(o.orderId)).length, 0);
      assert.equal((await audits(o.orderId)).length, 0);
    },
  );

  await check(
    "printer-accepted order retains the full KDS preparation, packing and completed replay flow",
    async () => {
      const o = await paidOrder();
      await accept(o.orderId, (await pendingCard(o.orderId)).version);
      const original = await jobs(o.orderId);
      const action = (name, extra) =>
        rpc(kitchen, name, [f.tenantId, f.locationId, o.orderId, ...extra]);
      await action("mealdeck_ops_kds_transition_order", [
        (await kdsCard(o.orderId)).version,
        "preparing",
      ]);
      const itemIds = (await kdsCard(o.orderId)).items.map((item) => item.order_item_id);
      for (const item of itemIds)
        await action("mealdeck_ops_kds_set_item_ready", [
          item,
          (await kdsCard(o.orderId)).version,
          true,
        ]);
      assert.equal((await kdsCard(o.orderId)).preparation_status, "ready");
      await action("mealdeck_ops_kds_transition_pass", [
        (await kdsCard(o.orderId)).pass.version,
        "packing",
      ]);
      await action("mealdeck_ops_kds_transition_pass", [
        (await kdsCard(o.orderId)).pass.version,
        "sealed",
      ]);
      const card = await kdsCard(o.orderId);
      await action("mealdeck_ops_kds_complete_handoff", [card.version, card.display_code]);
      assert.equal(
        (await action("mealdeck_ops_kds_complete_handoff", [card.version, card.display_code]))
          .replayed,
        true,
      );
      assert.equal(await pendingCard(o.orderId), undefined);
      assert.equal(
        await scalar("select status from public.orders where id=$1", [o.orderId]),
        "fulfilled",
      );
      assert.deepEqual(await jobs(o.orderId), original);
    },
  );

  if (db.native) {
    const connect = async (actor) => {
      const client = new pg.Client(db.config);
      await client.connect();
      await client.query("set role authenticated");
      await client.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
      const pid = (await client.query("select pg_backend_pid() pid")).rows[0].pid;
      return { client, pid };
    };
    const waitForLock = async (pid) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await scalar("select wait_event_type='Lock' from pg_stat_activity where pid=$1", [pid]))
          return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("Expected a real concurrent PostgreSQL row-lock wait");
    };
    const outcome = (promise) =>
      promise.then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    await check(
      "native simultaneous KDS/printer acceptance serializes to one receipt and one audit in both directions",
      async () => {
        for (const firstKind of ["printer", "kds"]) {
          const o = await paidOrder(),
            card = await pendingCard(o.orderId);
          const first = await connect(firstKind === "printer" ? printer : kitchen);
          const second = await connect(firstKind === "printer" ? kitchen : printer);
          try {
            const args = [f.tenantId, f.locationId, o.orderId, card.version];
            const fn =
              firstKind === "printer"
                ? "mealdeck_printer_accept_order"
                : "mealdeck_ops_kds_accept_order";
            const other =
              firstKind === "printer"
                ? "mealdeck_ops_kds_accept_order"
                : "mealdeck_printer_accept_order";
            await first.client.query("begin");
            const winner = (
              await first.client.query(`select public.${fn}($1,$2,$3,$4) result`, args)
            ).rows[0].result;
            assert.equal(winner.replayed, false);
            const pendingResult = outcome(
              second.client.query(`select public.${other}($1,$2,$3,$4) result`, args),
            );
            await waitForLock(second.pid);
            await first.client.query("commit");
            const result = await pendingResult;
            if (result.error) throw result.error;
            assert.equal(result.value.rows[0].result.replayed, true);
            const receipts = await jobs(o.orderId);
            assert.equal(receipts.length, 1);
            assert.equal((await audits(o.orderId)).length, 1);
            const printerResult = firstKind === "printer" ? winner : result.value.rows[0].result;
            assert.equal(printerResult.receiptJobId, receipts[0].id);
          } finally {
            await first.client.query("rollback");
            await Promise.all([first.client.end(), second.client.end()]);
          }
        }
      },
    );
    await check(
      "native acceptance waiting behind refund observes fresh payment evidence and creates no receipt",
      async () => {
        const o = await paidOrder(),
          card = await pendingCard(o.orderId),
          actor = await connect(printer);
        try {
          await db.exec("begin");
          await db.query("select id from public.orders where id=$1 for update", [o.orderId]);
          const result = outcome(
            actor.client.query("select public.mealdeck_printer_accept_order($1,$2,$3,$4)", [
              f.tenantId,
              f.locationId,
              o.orderId,
              card.version,
            ]),
          );
          await waitForLock(actor.pid);
          await f.reconcile(o.prepared, {
            session: o.session,
            intent: o.intent,
            event: `evt_waitrefund${++sequence}`,
            type: "charge.refunded",
            refunded: 1,
          });
          await db.exec("commit");
          assert.match((await result).error?.message ?? "", /release_required/);
          assert.equal((await jobs(o.orderId)).length, 0);
          assert.equal((await audits(o.orderId)).length, 0);
        } finally {
          await db.exec("rollback");
          await actor.client.end();
        }
      },
    );
    await check(
      "native acceptance waiting for revoked printer assignment rechecks authorization",
      async () => {
        const o = await paidOrder(),
          card = await pendingCard(o.orderId),
          actor = await connect(printer);
        try {
          await db.exec("begin");
          await db.query(
            "update mealdeck_private.printer_access set enabled=false where user_id=$1",
            [printer],
          );
          const result = outcome(
            actor.client.query("select public.mealdeck_printer_accept_order($1,$2,$3,$4)", [
              f.tenantId,
              f.locationId,
              o.orderId,
              card.version,
            ]),
          );
          await waitForLock(actor.pid);
          await db.exec("commit");
          assert.match((await result).error?.message ?? "", /forbidden/);
          assert.equal((await jobs(o.orderId)).length, 0);
          assert.equal((await audits(o.orderId)).length, 0);
        } finally {
          await db.exec("rollback");
          await actor.client.end();
          await db.query(
            "update mealdeck_private.printer_access set enabled=true where user_id=$1",
            [printer],
          );
        }
      },
    );
  }
  assert.deepEqual(await definitions(), oldDefinitions);
  assert.deepEqual(await permissions(), oldPermissions);
  console.log(
    `Printer acceptance: ${checks} PostgreSQL behaviour groups passed${db.native ? " including native concurrency" : " (native concurrency registered separately)"}.`,
  );
} catch (error) {
  console.error(error.message, error.detail ?? "", error.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
