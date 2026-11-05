import assert from "node:assert/strict";
import pg from "pg";
import { writeFile } from "node:fs/promises";
import { createDatabase, asActor, id } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";
import {
  buildKitchenPrinterSql,
  buildManagedKitchenPrinterSql,
} from "../../deploy/mealdeck/kitchen-printer.mjs";
const db = await createDatabase(process.argv.includes("--native"));
const uiFixtures = {};
let checks = 0,
  f,
  attempt = 9500;
const kitchen = id(9201),
  printer = id(9202),
  unverifiedPrinter = id(9203),
  otherKitchen = id(9204);
async function test(label, run) {
  try {
    await run();
    console.log(`PASS kitchen/printer ${++checks}: ${label}`);
  } catch (e) {
    console.error(`FAIL kitchen/printer: ${label}`);
    throw e;
  }
}
async function rpc(user, name, args = [], role = "authenticated") {
  assert.match(name, /^mealdeck_(ops_kds|printer)_[a-z_]+$/);
  return asActor(
    db,
    user,
    async () =>
      (
        await db.query(
          `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as result`,
          args,
        )
      ).rows[0].result,
    role,
  );
}
const board = () => rpc(kitchen, "mealdeck_ops_kds_board", [f.tenantId, f.locationId]);
const card = async (order) => (await board()).orders.find((x) => x.order_id === order);
const act = async (order, name, tail = [], who = kitchen) =>
  rpc(who, name, [f.tenantId, f.locationId, order, ...tail]);
const accept = async (order) =>
  act(order, "mealdeck_ops_kds_accept_order", [(await card(order)).version]);
const start = async (order) =>
  act(order, "mealdeck_ops_kds_transition_order", [(await card(order)).version, "preparing"]);
const ready = async (order, item, value = true) =>
  act(order, "mealdeck_ops_kds_set_item_ready", [item, (await card(order)).version, value]);
const printRpc = (name, tail = [], who = printer) =>
  rpc(who, "mealdeck_printer_" + name, [f.tenantId, f.locationId, ...tail]);
async function paidOrder() {
  const n = ++attempt;
  const lines = [
    { ...f.line, quantity: 2 },
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
  const q = await f.quote({ lines, packing });
  const o = await f.prepare(q.quoteId, { attemptId: id(n) });
  await f.bind(o.orderId, "cs_test_" + n);
  await f.reconcile(o, { event: "evt_" + n, intent: "pi_" + n, session: "cs_test_" + n });
  return o.orderId;
}
try {
  f = await setupStripeCheckoutFixture(db);
  await test("extension is separate, atomic, and rejects partial managed contracts", async () => {
    const managed = buildManagedKitchenPrinterSql({
      runnerOwnsTransaction: true,
      singleMigration: true,
    });
    assert.throws(
      () => buildManagedKitchenPrinterSql({ runnerOwnsTransaction: true }),
      /one runner-owned/,
    );
    await db.exec("begin");
    await db.exec(managed);
    await db.exec("rollback");
    assert.equal(
      (await db.query("select to_regclass('mealdeck_private.receipt_jobs') as r")).rows[0].r,
      null,
    );
    await db.exec(buildKitchenPrinterSql());
  });
  for (const u of [kitchen, printer, unverifiedPrinter, otherKitchen])
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)", [
      u,
      u + "@example.test",
      u === unverifiedPrinter ? null : "2026-11-05T08:00:00Z",
    ]);
  await db.query(
    "insert into public.mealdeck_ops_staff_access(tenant_id,location_id,user_id,role,created_by) values($1,$2,$3,'kitchen',$4)",
    [f.tenantId, f.locationId, kitchen, f.owner],
  );
  await test("owner provisions only an existing verified printer account; customer cannot provision", async () => {
    await assert.rejects(
      () => printRpc("assign_access", [printer + "@example.test", true], f.customer),
      /forbidden/,
    );
    await assert.rejects(
      () => printRpc("assign_access", [unverifiedPrinter + "@example.test", true], f.owner),
      /verified_account_required/,
    );
    await printRpc("assign_access", [printer + "@example.test", true], f.owner);
    const result = await rpc(printer, "mealdeck_printer_my_access");
    assert.equal(result.scopes.length, 1);
    assert.equal(result.scopes[0].canManage, false);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.mealdeck_ops_staff_access where user_id=$1",
          [printer],
        )
      ).rows[0].n,
      0,
    );
  });
  await test("printer/customer/anonymous accounts cannot see or change KDS, nor inspect another kitchen", async () => {
    for (const user of [printer, f.customer, unverifiedPrinter, otherKitchen])
      await assert.rejects(
        () => rpc(user, "mealdeck_ops_kds_board", [f.tenantId, f.locationId]),
        /forbidden/,
      );
    await assert.rejects(
      () => rpc(null, "mealdeck_ops_kds_board", [f.tenantId, f.locationId], "anon"),
      /permission denied/,
    );
    await assert.rejects(
      () => rpc(printer, "mealdeck_printer_board", [f.tenantId, id(999)]),
      /forbidden/,
    );
    await assert.rejects(() => printRpc("board", [], kitchen), /forbidden/);
  });
  const order = await paidOrder();
  await test("provider-paid order starts unaccepted with no receipt and cannot start preparation", async () => {
    const c = await card(order);
    assert(c);
    assert.equal(c.accepted_at, null);
    assert.equal(
      (await db.query("select handoff_code_reserved from public.orders where id=$1", [order]))
        .rows[0].handoff_code_reserved,
      true,
    );
    assert.equal(c.preparation_status, "queued");
    assert.equal((await printRpc("board")).jobs.length, 0);
    await assert.rejects(() => start(order), /accept_required/);
  });
  await test("staff acceptance queues exactly one immutable receipt; replay does not duplicate", async () => {
    const c = await card(order);
    await act(order, "mealdeck_ops_kds_accept_order", [c.version]);
    const replay = await act(order, "mealdeck_ops_kds_accept_order", [c.version]);
    assert.equal(replay.replayed, true);
    const p = await printRpc("board");
    uiFixtures.acceptedKds = await board();
    uiFixtures.queuedPrinter = p;
    assert.equal(p.jobs.length, 1);
    assert.equal(p.jobs[0].copyNumber, 1);
    const receipt = p.jobs[0].receipt;
    assert.equal(receipt.orderId, order);
    assert.equal(receipt.packingPlan.version, 1);
    assert.equal(receipt.packingPlan.bags.length, 2);
    assert.equal(receipt.cutleryRequested, true);
    assert.deepEqual((await card(order)).items[0].bags, [
      { number: 1, quantity: 1 },
      { number: 2, quantity: 1 },
    ]);
    assert.equal(receipt.totalPence, receipt.subtotalPence - receipt.discountPence);
    assert.equal(receipt.items[0].name, (await card(order)).items[0].item_name);
    const original = structuredClone(receipt);
    await db.query(
      "update public.menu_items set name='Changed after purchase' where id=(select menu_item_id from public.order_items where order_id=$1 limit 1)",
      [order],
    );
    assert.deepEqual((await printRpc("board")).jobs[0].receipt, original);
  });
  const job = (await printRpc("board")).jobs[0],
    terminal = id(9301);
  await test("a valid account for another kitchen cannot read or mutate this kitchen's receipt or order", async () => {
    const otherLocation = id(9801);
    await db.query(
      "insert into public.tenant_locations(id,tenant_id,name,slug) values($1,$2,'Other test kitchen','other-test-kitchen')",
      [otherLocation, f.tenantId],
    );
    await db.query(
      "insert into public.mealdeck_ops_staff_access(tenant_id,location_id,user_id,role,created_by) values($1,$2,$3,'kitchen',$4)",
      [f.tenantId, otherLocation, otherKitchen, f.owner],
    );
    await rpc(f.owner, "mealdeck_printer_assign_access", [
      f.tenantId,
      otherLocation,
      otherKitchen + "@example.test",
      true,
    ]);
    assert.equal(
      (await rpc(otherKitchen, "mealdeck_ops_kds_board", [f.tenantId, otherLocation])).orders
        .length,
      0,
    );
    assert.equal(
      (await rpc(otherKitchen, "mealdeck_printer_board", [f.tenantId, otherLocation])).jobs.length,
      0,
    );
    await assert.rejects(
      () =>
        rpc(otherKitchen, "mealdeck_printer_claim_job", [
          f.tenantId,
          otherLocation,
          job.jobId,
          terminal,
        ]),
      /job_unavailable/,
    );
    await assert.rejects(
      () =>
        rpc(otherKitchen, "mealdeck_ops_kds_accept_order", [
          f.tenantId,
          otherLocation,
          order,
          "a".repeat(32),
        ]),
      /order_unavailable/,
    );
    await assert.rejects(
      () => act(order, "mealdeck_ops_kds_accept_order", ["a".repeat(32)], otherKitchen),
      /forbidden/,
    );
  });
  await test("atomic printer claim allows one terminal, no poll/replay produces another job", async () => {
    const claimed = await printRpc("claim_job", [job.jobId, terminal]);
    assert.equal(claimed.status, "claimed");
    const replay = await printRpc("claim_job", [job.jobId, terminal]);
    assert.equal(replay.claimToken, claimed.claimToken);
    await assert.rejects(() => printRpc("claim_job", [job.jobId, id(9302)]), /job_claimed/);
    await assert.rejects(
      () => rpc(printer, "mealdeck_printer_claim_receipt", [job.jobId, claimed.claimToken]),
      /claim_expired/,
    );
    await printRpc("begin_send", [job.jobId, claimed.claimToken]);
    const canonical = await rpc(printer, "mealdeck_printer_claim_receipt", [
      job.jobId,
      claimed.claimToken,
    ]);
    assert.deepEqual(canonical.receipt, job.receipt);
    await assert.rejects(
      () => rpc(printer, "mealdeck_printer_claim_receipt", [job.jobId, id(999)]),
      /claim_expired/,
    );
    await assert.rejects(
      () => rpc(f.owner, "mealdeck_printer_claim_receipt", [job.jobId, claimed.claimToken]),
      /claim_expired/,
    );
    await assert.rejects(
      () => rpc(f.customer, "mealdeck_printer_claim_receipt", [job.jobId, claimed.claimToken]),
      /forbidden/,
    );
    assert.equal((await printRpc("begin_send", [job.jobId, claimed.claimToken])).replayed, true);
    await printRpc("send_result", [job.jobId, claimed.claimToken, "held"]);
    await assert.rejects(() => printRpc("claim_job", [job.jobId, terminal]), /job_claimed/);
    await assert.rejects(
      () => printRpc("reprint", [job.jobId, "Paper inspection pending", id(9401)]),
      /inspection_required/,
    );
  });
  await test("uncertain send requires paper inspection; deliberate copy is marked and audited, never automatic retry", async () => {
    await printRpc("confirm_paper", [
      job.jobId,
      "not_printed",
      "Inspected printer: no paper receipt.",
    ]);
    const copy = await printRpc("reprint", [
      job.jobId,
      "Inspected and authorised one replacement.",
      id(9402),
    ]);
    assert.equal(copy.copyNumber, 2);
    assert.equal(copy.receipt.reprintOf, job.jobId);
    assert.equal(
      (
        await printRpc("reprint", [
          job.jobId,
          "Inspected and authorised one replacement.",
          id(9402),
        ])
      ).jobId,
      copy.jobId,
    );
    const claimed = await printRpc("claim_job", [copy.jobId, terminal]);
    await printRpc("begin_send", [copy.jobId, claimed.claimToken]);
    await printRpc("send_result", [copy.jobId, claimed.claimToken, "sent_unconfirmed"]);
    assert.equal(
      (await printRpc("board")).jobs.find((x) => x.jobId === copy.jobId).status,
      "sent_unconfirmed",
    );
    await printRpc("confirm_paper", [copy.jobId, "printed", "Checked one complete paper receipt."]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from mealdeck_private.receipt_events where job_id=$1",
          [copy.jobId],
        )
      ).rows[0].n,
      5,
    );
  });
  await test("bulk-ready cannot bypass the per-item checklist; every routed item is required", async () => {
    await start(order);
    uiFixtures.preparingKds = await board();
    let c = await card(order);
    await assert.rejects(
      () => act(order, "mealdeck_ops_kds_transition_order", [c.version, "ready"]),
      /all_items_required/,
    );
    await assert.rejects(
      () =>
        act(order, "mealdeck_ops_kds_transition_pass", [c.pass?.version ?? c.version, "packing"]),
      /all_items_required/,
    );
    for (let n = 0; n < c.items.length; n++) {
      await ready(order, c.items[n].order_item_id);
      if (n < c.items.length - 1) assert.equal((await card(order)).preparation_status, "preparing");
    }
    c = await card(order);
    assert.equal(c.preparation_status, "ready");
    assert.equal(c.pass.status, "ready_to_pack");
    assert(c.items.every((i) => i.status === "ready"));
    await ready(order, c.items[0].order_item_id, false);
    assert.equal((await card(order)).preparation_status, "preparing");
    await ready(order, c.items[0].order_item_id, true);
  });
  await test("packing locks the checklist; ready and completion timestamps follow actual staff stages and code", async () => {
    let c = await card(order);
    await act(order, "mealdeck_ops_kds_transition_pass", [c.pass.version, "packing"]);
    c = await card(order);
    await assert.rejects(() => ready(order, c.items[0].order_item_id, false), /packing_locked/);
    await act(order, "mealdeck_ops_kds_transition_pass", [c.pass.version, "sealed"]);
    c = await card(order);
    uiFixtures.readyKds = await board();
    assert.equal(c.pass.status, "ready_for_handoff");
    await assert.rejects(
      () => act(order, "mealdeck_ops_kds_complete_handoff", [c.version, "WRONG"]),
      /handoff_code_required/,
    );
    await act(order, "mealdeck_ops_kds_complete_handoff", [c.version, c.display_code]);
    assert.equal(await card(order), undefined);
    assert.equal(
      (await db.query("select handoff_code_reserved from public.orders where id=$1", [order]))
        .rows[0].handoff_code_reserved,
      false,
    );
    assert.equal(
      (await act(order, "mealdeck_ops_kds_complete_handoff", [c.version, c.display_code])).replayed,
      true,
    );
    const p = (
      await db.query("select * from public.mealdeck_pass_orders where order_id=$1", [order])
    ).rows[0];
    assert(p.ready_for_handoff_at);
    assert(p.handed_off_at);
  });
  await test("paid_at/payment_status forgery without captured provider authority cannot release, accept or print", async () => {
    const n = ++attempt;
    const q = await f.quote();
    const o = await f.prepare(q.quoteId, { attemptId: id(n) });
    await f.bind(o.orderId, "cs_test_" + n);
    await db.query(
      "update public.orders set payment_status='paid',paid_at=now(),status='accepted' where id=$1",
      [o.orderId],
    );
    assert.equal(await card(o.orderId), undefined);
    await assert.rejects(
      () => act(o.orderId, "mealdeck_ops_kds_accept_order", ["a".repeat(32)]),
      /release_required/,
    );
    assert(!(await printRpc("board")).jobs.some((j) => j.orderId === o.orderId));
  });
  await test("refund after acceptance holds printing and kitchen mutation even with stale authorised screen", async () => {
    const o = await paidOrder();
    await accept(o);
    const c = await card(o);
    const j = (await printRpc("board")).jobs.find((j) => j.orderId === o);
    await db.query("update mealdeck_private.stripe_orders set refunded_pence=1 where order_id=$1", [
      o,
    ]);
    assert.equal(await card(o), undefined);
    assert(!(await printRpc("board")).jobs.some((x) => x.jobId === j.jobId));
    await assert.rejects(
      () => act(o, "mealdeck_ops_kds_transition_order", [c.version, "preparing"]),
      /release_required/,
    );
    await assert.rejects(
      () => printRpc("claim_job", [j.jobId, terminal]),
      /verified_acceptance_required/,
    );
  });
  await test("expired claim is held and cannot be silently reclaimed or verified for hardware", async () => {
    const o = await paidOrder();
    await accept(o);
    const j = (await printRpc("board")).jobs.find((x) => x.orderId === o);
    const claim = await printRpc("claim_job", [j.jobId, terminal]);
    await db.query(
      "update mealdeck_private.receipt_jobs set claim_expires_at=now()-interval '1 second' where id=$1",
      [j.jobId],
    );
    assert.equal((await printRpc("board")).jobs.find((x) => x.jobId === j.jobId).status, "held");
    await assert.rejects(() => printRpc("claim_job", [j.jobId, terminal]), /job_claimed/);
    await assert.rejects(
      () => rpc(printer, "mealdeck_printer_claim_receipt", [j.jobId, claim.claimToken]),
      /claim_expired/,
    );
  });
  if (db.native)
    await test("two terminals contending for the same receipt receive exactly one claim", async () => {
      const o = await paidOrder();
      await accept(o);
      const j = (await printRpc("board")).jobs.find((x) => x.orderId === o);
      const clients = [new pg.Client(db.config), new pg.Client(db.config)];
      try {
        await Promise.all(clients.map((c) => c.connect()));
        await Promise.all(
          clients.map(async (c) => {
            await c.query("set role authenticated");
            await c.query("select set_config('request.jwt.claim.sub',$1,false)", [printer]);
          }),
        );
        await db.exec("begin");
        await db.query("select id from public.orders where id=$1 for update", [o]);
        const pending = clients.map((c, n) =>
          c.query("select public.mealdeck_printer_claim_job($1,$2,$3,$4) as result", [
            f.tenantId,
            f.locationId,
            j.jobId,
            id(9700 + n),
          ]),
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
        await db.exec("commit");
        const result = await Promise.allSettled(pending);
        assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
        assert.equal(result.filter((x) => x.status === "rejected").length, 1);
        assert.equal(
          (
            await db.query(
              "select count(*)::int as n from mealdeck_private.receipt_events where job_id=$1 and action='claimed'",
              [j.jobId],
            )
          ).rows[0].n,
          1,
        );
      } finally {
        await Promise.all(clients.map((c) => c.end()));
      }
    });
  await test("revoked or banned printer accounts cannot claim, verify, or resolve receipts", async () => {
    const o = await paidOrder();
    await accept(o);
    const j = (await printRpc("board")).jobs.find((x) => x.orderId === o);
    const claim = await printRpc("claim_job", [j.jobId, terminal]);
    await printRpc("begin_send", [j.jobId, claim.claimToken]);
    await printRpc("assign_access", [printer + "@example.test", false], f.owner);
    await assert.rejects(
      () => rpc(printer, "mealdeck_printer_claim_receipt", [j.jobId, claim.claimToken]),
      /forbidden/,
    );
    await assert.rejects(
      () => printRpc("confirm_paper", [j.jobId, "printed", "Checked physical paper."]),
      /forbidden/,
    );
    await printRpc("assign_access", [printer + "@example.test", true], f.owner);
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [
      printer,
    ]);
    await assert.rejects(() => printRpc("board"), /forbidden/);
    await db.query("update auth.users set banned_until=null where id=$1", [printer]);
  });
  await test("RLS, no direct table access and explicit function ACLs protect both authenticated and service API roles", async () => {
    for (const role of ["anon", "authenticated", "service_role"])
      for (const table of ["receipt_jobs", "receipt_events", "printer_access"])
        await assert.rejects(
          () =>
            asActor(db, printer, () => db.query("select * from mealdeck_private." + table), role),
          /permission denied/,
        );
    const privateGrants = await db.query(
      "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mealdeck_ops_private' and (p.proname like 'printer_%' or p.proname like 'kitchen_%' or p.proname like 'receipt_%') and (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'))",
    );
    assert.equal(privateGrants.rows.length, 0);
    const rls = (
      await db.query(
        "select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mealdeck_private' and relname in ('receipt_jobs','receipt_events','printer_access')",
      )
    ).rows;
    assert.equal(rls.length, 3);
    assert(rls.every((x) => x.relrowsecurity));
  });
  if (process.argv.includes("--fixture")) {
    uiFixtures.scope = {
      tenantId: f.tenantId,
      locationId: f.locationId,
      locationName: "Luton",
      tenantName: "MealDeck",
      canManage: true,
    };
    uiFixtures.printerScopes = await rpc(printer, "mealdeck_printer_my_access");
    await writeFile(
      "/tmp/mealdeck-kitchen-printer-fixture.json",
      JSON.stringify(uiFixtures, null, 2),
    );
  }
  console.log(
    `Kitchen/printer: ${checks} behaviour groups passed (${db.native ? "native PostgreSQL" : "PGlite"}).`,
  );
} catch (e) {
  console.error(e.message, e.detail ?? "", e.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
