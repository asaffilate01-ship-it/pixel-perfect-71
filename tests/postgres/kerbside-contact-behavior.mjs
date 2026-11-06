import assert from "node:assert/strict";
import { asActor, createDatabase, id } from "./harness.mjs";
import { setupOrderingRoomsFixture } from "./ordering-rooms-fixture.mjs";
import { guestTokenHash } from "./guest-checkout-fixture.mjs";
import { buildKdsWorkflowSql } from "../../deploy/mealdeck/kds-workflow.mjs";
import { buildPrinterAcceptanceSql } from "../../deploy/mealdeck/printer-acceptance.mjs";
import {
  buildKerbsideContactSql,
  buildManagedKerbsideContactSql,
} from "../../deploy/mealdeck/kerbside-contact.mjs";

const db = await createDatabase(process.argv.includes("--native"));
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
let checks = 0;
async function check(label, action) {
  try {
    await action();
    console.log("PASS kerbside contact " + ++checks + ": " + label);
  } catch (error) {
    console.error("FAIL kerbside contact: " + label);
    throw error;
  }
}

try {
  const f = await setupOrderingRoomsFixture(db);
  await db.exec(buildKdsWorkflowSql());
  await db.exec(buildPrinterAcceptanceSql());
  const vehicle = { make: "Ford", colour: "Blue", registrationLast4: "12AB" };
  const memberContact = { name: "Róisín O'Connor", phone: "+447700900123" };
  const guestContact = { name: "آمنہ O’Neill", phone: "+447700900199" };
  await db.query("update mealdeck_private.customer_profiles set name=$1 where user_id=$2", [
    memberContact.name,
    f.customer,
  ]);
  const rpc = (actor, name, args, role = "authenticated") => {
    assert.match(name, /^mealdeck_(ops_kds|printer)_[a-z_]+$/);
    return asActor(
      db,
      actor,
      () =>
        scalar(
          "select public." + name + "(" + args.map((_, i) => "$" + (i + 1)).join(",") + ")",
          args,
        ),
      role,
    );
  };
  const board = (
    actor = f.owner,
    tenant = f.tenantId,
    location = f.locationId,
    role = "authenticated",
  ) => rpc(actor, "mealdeck_ops_kds_workflow_board", [tenant, location], role);
  const card = async (orderId) =>
    (await board()).orders.find((order) => order.order_id === orderId);
  const action = (orderId, name, args) =>
    rpc(f.owner, name, [f.tenantId, f.locationId, orderId, ...args]);
  const order = async ({ guest = false, fulfilment = "curbside", paid = true } = {}) => {
    const token = guest ? guestTokenHash(f.next()) : null;
    if (token) await f.guest.session(token, guestContact);
    const options = { fulfilment, vehicle: fulfilment === "curbside" ? vehicle : null };
    const quote = token ? await f.guest.quote(token, options) : await f.quote(options);
    const prepared = token
      ? await f.guest.prepare(token, quote.quoteId, { attemptId: f.next() })
      : await f.prepare(quote.quoteId, { attemptId: f.next() });
    const session = "cs_test_kerbside" + f.next().replaceAll("-", "");
    if (paid) {
      await f.bind(prepared.orderId, session);
      await f.reconcile(prepared, {
        session,
        intent: "pi_kerbside" + f.next().replaceAll("-", ""),
        event: "evt_kerbside" + f.next().replaceAll("-", ""),
      });
    }
    return prepared;
  };
  const member = await order();
  await action(member.orderId, "mealdeck_ops_kds_accept_order", [
    (await card(member.orderId)).version,
  ]);
  const oldCard = await card(member.orderId);
  const oldReceipt = await scalar("select mealdeck_ops_private.receipt_snapshot($1)", [
    member.orderId,
  ]);
  const definitions = () =>
    rows(`select n.nspname,p.proname,p.oid::regprocedure::text signature,
      pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','mealdeck_private','mealdeck_ops_private')
        and p.oid<>'mealdeck_ops_private.kds_order_card(uuid,jsonb)'::regprocedure
      order by 1,2,3`);
  const permissions = () =>
    rows(`select n.nspname,c.relname,c.relacl::text acl,c.relrowsecurity rls
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','mealdeck_private','mealdeck_ops_private')
        and c.relkind in ('r','S') order by 1,2`);
  const cardMetadata = () =>
    rows(`select oid,proacl::text acl,proowner,provolatile,prosecdef,proconfig
      from pg_proc where oid='mealdeck_ops_private.kds_order_card(uuid,jsonb)'::regprocedure`);
  const businessRows = () =>
    scalar(`select jsonb_build_object(
      'orders',(select jsonb_agg(to_jsonb(t) order by t.id) from public.orders t),
      'items',(select jsonb_agg(to_jsonb(t) order by t.id) from public.order_items t),
      'tickets',(select jsonb_agg(to_jsonb(t) order by t.id) from public.kds_tickets t),
      'receipts',(select jsonb_agg(to_jsonb(t) order by t.id) from mealdeck_private.receipt_jobs t),
      'payments',(select jsonb_agg(to_jsonb(t) order by t.order_id) from mealdeck_private.stripe_orders t),
      'audits',(select jsonb_agg(to_jsonb(t) order by t.id) from public.mealdeck_ops_audit_log t))`);
  const oldDefinitions = await definitions();
  const oldPermissions = await permissions();
  const oldMetadata = await cardMetadata();
  const oldRows = await businessRows();
  const currentHash = () =>
    scalar(`select md5(prosrc) from pg_proc
      where oid='mealdeck_ops_private.kds_order_card(uuid,jsonb)'::regprocedure`);
  const oldHash = await currentHash();
  const managed = buildManagedKerbsideContactSql({
    runnerOwnsTransaction: true,
    singleMigration: true,
  });

  await check(
    "guarded atomic installation changes one private projection and is repeatable",
    async () => {
      assert.equal(oldHash, "9c49af35d81442f4e3d4a98d14f0e14a");
      for (const options of [
        null,
        {},
        { runnerOwnsTransaction: true },
        { runnerOwnsTransaction: true, singleMigration: true, split: true },
      ])
        assert.throws(() => buildManagedKerbsideContactSql(options), /one runner-owned/);
      await db.exec("begin");
      try {
        await db.exec(managed);
        assert.notEqual(await currentHash(), oldHash);
      } finally {
        await db.exec("rollback");
      }
      assert.equal(await currentHash(), oldHash);
      for (const [damage, expected] of [
        ["create schema dishbee_private", /independent_profile_required/],
        [
          "alter function mealdeck_ops_private.kds_order_card_before_item_readiness(uuid,jsonb) rename to missing_projection_fixture",
          /previous_extensions_required/,
        ],
        [
          "create or replace function mealdeck_ops_private.kds_order_card(p_order uuid,p_evidence jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin return '{}'::jsonb; end $$",
          /unexpected_definition/,
        ],
        ["set local role authenticated", /database_owner_required|permission denied/],
      ]) {
        await db.exec("begin");
        try {
          await db.exec(damage);
          await assert.rejects(() => db.exec(managed), expected);
        } finally {
          await db.exec("rollback");
        }
        assert.equal(await currentHash(), oldHash);
      }
      await db.exec(buildKerbsideContactSql());
      await db.exec(buildKerbsideContactSql());
      assert.notEqual(await currentHash(), oldHash);
      assert.deepEqual(await definitions(), oldDefinitions);
      assert.deepEqual(await permissions(), oldPermissions);
      assert.deepEqual(await cardMetadata(), oldMetadata);
      assert.deepEqual(await businessRows(), oldRows);
    },
  );

  await check(
    "saved member contact is additive and receipts retain their exact existing payload",
    async () => {
      const updated = await card(member.orderId);
      const { pickupContact, ...unchanged } = updated;
      assert.deepEqual(pickupContact, memberContact);
      assert.deepEqual(unchanged, oldCard);
      assert.deepEqual(updated.vehicle, vehicle);
      assert.deepEqual(
        await scalar("select mealdeck_ops_private.receipt_snapshot($1)", [member.orderId]),
        oldReceipt,
      );
      assert.equal(Object.hasOwn(oldReceipt, "pickupContact"), false);
      assert.equal(Object.hasOwn(oldReceipt, "customerPhone"), false);
      await db.exec("begin");
      try {
        await db.query(
          "update mealdeck_private.customer_profiles set name='Changed Profile',phone='+447700900888' where user_id=$1",
          [f.customer],
        );
        assert.deepEqual((await card(member.orderId)).pickupContact, memberContact);
      } finally {
        await db.exec("rollback");
      }
    },
  );

  const guest = await order({ guest: true });
  const pickup = await order({ fulfilment: "pickup" });
  const unpaid = await order({ guest: true, paid: false });
  await check(
    "paid guest kerbside has the saved contact; pickup and unpaid orders disclose none",
    async () => {
      assert.deepEqual((await card(guest.orderId)).pickupContact, guestContact);
      assert.deepEqual((await card(guest.orderId)).vehicle, vehicle);
      assert.equal((await card(pickup.orderId)).pickupContact, null);
      assert.equal((await card(pickup.orderId)).vehicle, null);
      assert.equal(await card(unpaid.orderId), undefined);
      const pending = await rpc(f.owner, "mealdeck_printer_acceptance_board", [
        f.tenantId,
        f.locationId,
      ]);
      assert.ok(pending.orders.some((entry) => entry.orderId === guest.orderId));
      assert.ok(pending.orders.every((entry) => !Object.hasOwn(entry, "pickupContact")));
      assert.ok(pending.orders.every((entry) => !Object.hasOwn(entry, "customerPhone")));
    },
  );

  await check(
    "staff, tenant, kitchen and private-helper access boundaries are unchanged",
    async () => {
      for (const actor of [null, f.customer, f.otherCustomer, f.unverified])
        await assert.rejects(() => board(actor), /forbidden|unauthenticated|verified/);
      await assert.rejects(() => board(f.owner, id(92991)), /forbidden/);
      await assert.rejects(() => board(f.owner, f.tenantId, id(92992)), /forbidden/);
      for (const role of ["anon", "service_role"])
        await assert.rejects(
          () => board(null, f.tenantId, f.locationId, role),
          /permission denied/,
        );
      for (const role of ["anon", "authenticated", "service_role"]) {
        assert.equal(
          await scalar(
            "select has_function_privilege($1,'mealdeck_ops_private.kds_order_card(uuid,jsonb)','EXECUTE')",
            [role],
          ),
          false,
        );
        await assert.rejects(
          () =>
            asActor(
              db,
              role === "authenticated" ? f.owner : null,
              () => scalar("select mealdeck_ops_private.kds_order_card($1,'{}')", [member.orderId]),
              role,
            ),
          /permission denied/,
        );
      }
    },
  );

  await check(
    "legacy invalid contacts become null without losing the order or vehicle",
    async () => {
      const before = await card(member.orderId);
      const invalid = [
        [null, memberContact.phone],
        ["", memberContact.phone],
        ["   ", memberContact.phone],
        ["\u00a0\u2009\u3000\ufeff", memberContact.phone],
        ["x".repeat(121), memberContact.phone],
        ["𐐷".repeat(121), memberContact.phone],
        ...[
          "\u0001",
          "\t",
          "\n",
          "\u007f",
          "\u0085",
          "\u009f",
          "\u061c",
          "\u200e",
          "\u200f",
          "\u2028",
          "\u2029",
          "\u202e",
          "\u2066",
          "\u2069",
        ].map((control) => ["Name" + control, memberContact.phone]),
        [memberContact.name, null],
        [memberContact.name, ""],
        [memberContact.name, "07700900123"],
        [memberContact.name, "+0447700900123"],
        [memberContact.name, "+1234567"],
        [memberContact.name, "+1234567890123456"],
        [memberContact.name, "+44 7700 900123"],
        [memberContact.name, memberContact.phone + "\n"],
      ];
      for (const [name, phone] of invalid) {
        await db.exec("begin");
        try {
          await db.query(
            "update public.orders set customer_name=$1,customer_phone=$2 where id=$3",
            [name, phone, member.orderId],
          );
          assert.deepEqual(await card(member.orderId), { ...before, pickupContact: null });
        } finally {
          await db.exec("rollback");
        }
      }
      for (const [raw, expected] of [
        ["\ufeff\u00a0  Zoë O’Connor \u3000", "Zoë O’Connor"],
        ["𐐷".repeat(120), "𐐷".repeat(120)],
      ]) {
        await db.exec("begin");
        try {
          await db.query("update public.orders set customer_name=$1 where id=$2", [
            raw,
            member.orderId,
          ]);
          assert.deepEqual((await card(member.orderId)).pickupContact, {
            name: expected,
            phone: memberContact.phone,
          });
        } finally {
          await db.exec("rollback");
        }
      }
      const beforeReads = await businessRows();
      await board();
      await board();
      assert.deepEqual(await businessRows(), beforeReads);
    },
  );

  await check(
    "a verified handover retains Done history without a contact projection or extra receipt",
    async () => {
      await action(member.orderId, "mealdeck_ops_kds_transition_order", [
        (await card(member.orderId)).version,
        "preparing",
      ]);
      for (const item of (await card(member.orderId)).items)
        await action(member.orderId, "mealdeck_ops_kds_set_item_ready", [
          item.order_item_id,
          (await card(member.orderId)).version,
          true,
        ]);
      await action(member.orderId, "mealdeck_ops_kds_transition_pass", [
        (await card(member.orderId)).pass.version,
        "packing",
      ]);
      await action(member.orderId, "mealdeck_ops_kds_transition_pass", [
        (await card(member.orderId)).pass.version,
        "sealed",
      ]);
      const handoffCode = await scalar("select handoff_code from public.orders where id=$1", [
        member.orderId,
      ]);
      await action(member.orderId, "mealdeck_ops_kds_complete_handoff", [
        (await card(member.orderId)).version,
        handoffCode,
      ]);
      const completed = (await board()).completed_orders.find(
        (entry) => entry.order_id === member.orderId,
      );
      assert.equal(await card(member.orderId), undefined);
      assert.ok(completed);
      assert.equal(Object.hasOwn(completed, "pickupContact"), false);
      assert.equal(Object.hasOwn(completed, "customerPhone"), false);
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
          member.orderId,
        ]),
        1,
      );
      assert.deepEqual(
        await scalar("select receipt from mealdeck_private.receipt_jobs where order_id=$1", [
          member.orderId,
        ]),
        oldReceipt,
      );
    },
  );
  console.log("Verified " + checks + " kerbside contact behaviour groups.");
} catch (error) {
  console.error(error.message, error.detail ?? "", error.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
