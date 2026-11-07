import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { asActor, createDatabase, id } from "./harness.mjs";
import { setupPaidOrderNumbersFixture } from "./paid-order-numbers-fixture.mjs";
import { buildPaidOrderNumbersSql } from "../../deploy/mealdeck/paid-order-numbers.mjs";
import { buildReceiptArchiveSql } from "../../deploy/mealdeck/receipt-archive.mjs";
import {
  buildReceiptContactSql,
  buildManagedReceiptContactSql,
} from "../../deploy/mealdeck/receipt-contact.mjs";
import { validateReceipt } from "../../tools/receipt-bridge/receipt.mjs";

const db = await createDatabase(process.argv.includes("--native"));
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
const fingerprint = (receipt) =>
  createHash("sha256")
    .update(JSON.stringify(validateReceipt(receipt)))
    .digest("hex");
let checks = 0;
let fixtureTransaction = false;
async function check(label, action) {
  await action();
  console.log(`PASS receipt contact ${++checks}: ${label}`);
}

try {
  const f = await setupPaidOrderNumbersFixture(db);
  await db.exec(buildPaidOrderNumbersSql());
  await db.exec(buildReceiptArchiveSql());
  const printer = id(67301),
    otherPrinter = id(67302),
    unverified = id(67303),
    kitchen = id(67304);
  for (const actor of [printer, otherPrinter, unverified]) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,case when $3 then now() else null end)",
      [actor, `receipt-contact-${actor}@example.invalid`, actor !== unverified],
    );
    await db.query(
      "insert into mealdeck_private.printer_access(tenant_id,location_id,user_id,created_by,enabled) values($1,$2,$3,$4,true)",
      [f.tenantId, f.locationId, actor, f.owner],
    );
  }
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'receipt-kitchen@example.invalid',now())",
    [kitchen],
  );
  await db.query(
    "insert into public.mealdeck_ops_staff_access(tenant_id,location_id,user_id,role,created_by) values($1,$2,$3,'kitchen',$4)",
    [f.tenantId, f.locationId, kitchen, f.owner],
  );
  const rpc = (name, args, actor = printer, role = "authenticated") => {
    assert.match(name, /^mealdeck_printer_[a-z_]+$/);
    return asActor(
      db,
      actor,
      async () => {
        // Preserve the real permission/claim error inside rollback-only fixtures
        // before the shared actor helper restores its session role.
        if (fixtureTransaction) await db.exec("savepoint receipt_contact_rpc");
        try {
          const value = await scalar(
            `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")})`,
            args,
          );
          if (fixtureTransaction) await db.exec("release savepoint receipt_contact_rpc");
          return value;
        } catch (error) {
          if (fixtureTransaction) {
            await db.exec("rollback to savepoint receipt_contact_rpc");
            await db.exec("release savepoint receipt_contact_rpc");
          }
          throw error;
        }
      },
      role,
    );
  };
  const board = (actor = printer) =>
    rpc("mealdeck_printer_board", [f.tenantId, f.locationId], actor);
  const jobFor = async (orderId) => (await board()).jobs.find((job) => job.orderId === orderId);
  const accepted = async (options) => {
    const order = await f.ordinary(options);
    await f.accept(order.orderId);
    return { order, job: await jobFor(order.orderId) };
  };
  const original = await accepted();
  const originalFingerprint = fingerprint(original.job.receipt);
  const definitions = () =>
    rows(`select n.nspname,p.proname,p.oid::regprocedure::text signature,
    pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','mealdeck_private','mealdeck_ops_private')
      and p.proname not in ('printer_job_card','printer_receipt_contact','mealdeck_printer_claim_contact') order by 1,2,3`);
  const permissions = () =>
    rows(`select n.nspname,c.relname,c.relacl::text acl,c.relrowsecurity rls
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','mealdeck_private','mealdeck_ops_private') and c.relkind in ('r','S') order by 1,2`);
  const business = () =>
    scalar(`select jsonb_build_object(
    'orders',(select jsonb_agg(to_jsonb(x) order by id) from public.orders x),
    'stripe',(select jsonb_agg(to_jsonb(x) order by order_id) from mealdeck_private.stripe_orders x),
    'items',(select jsonb_agg(to_jsonb(x) order by id) from public.order_items x),
    'jobs',(select jsonb_agg(to_jsonb(x) order by id) from mealdeck_private.receipt_jobs x),
    'events',(select jsonb_agg(to_jsonb(x) order by id) from mealdeck_private.receipt_events x),
    'numbers',(select jsonb_agg(to_jsonb(x) order by number) from mealdeck_private.order_numbers x))`);
  const oldDefinitions = await definitions(),
    oldPermissions = await permissions(),
    oldBusiness = await business();
  const cardHash = () =>
    scalar(
      "select md5(prosrc) from pg_proc where oid='mealdeck_ops_private.printer_job_card(uuid)'::regprocedure",
    );
  const oldCardHash = await cardHash();
  const managed = buildManagedReceiptContactSql({
    runnerOwnsTransaction: true,
    singleMigration: true,
  });

  await check(
    "atomic, repeatable extension preserves every receipt, claim, order, payment and existing grant",
    async () => {
      for (const options of [
        undefined,
        {},
        { runnerOwnsTransaction: true },
        { runnerOwnsTransaction: true, singleMigration: true, split: true },
      ])
        assert.throws(() => buildManagedReceiptContactSql(options), /one runner-owned/);
      await db.exec("begin");
      await db.exec(managed);
      await db.exec("rollback");
      assert.equal(await cardHash(), oldCardHash);
      assert.equal(
        await scalar("select to_regprocedure('public.mealdeck_printer_claim_contact(uuid,uuid)')"),
        null,
      );
      for (const [damage, expected] of [
        ["create schema dishbee_private", /independent_profile_required/],
        [
          "alter function public.mealdeck_printer_claim_receipt(uuid,uuid) rename to missing_receipt_fixture",
          /previous_extensions_required/,
        ],
        [
          "create or replace function mealdeck_ops_private.printer_job_card(p_job uuid) returns jsonb language sql stable security definer set search_path='' as $$ select '{}'::jsonb $$",
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
      }
      await db.exec(buildReceiptContactSql());
      await db.exec(buildReceiptContactSql());
      assert.deepEqual(await definitions(), oldDefinitions);
      assert.deepEqual(await permissions(), oldPermissions);
      assert.deepEqual(await business(), oldBusiness);
      const card = await jobFor(original.order.orderId);
      assert.deepEqual(card.receiptContact, {
        schemaVersion: 1,
        orderId: original.order.orderId,
        customerPhone: "+447700900123",
      });
      const { receiptContact, ...legacy } = card;
      assert.deepEqual(legacy, original.job);
      assert.equal(fingerprint(card.receipt), originalFingerprint);
      assert.ok(
        !Object.hasOwn(card.receipt, "customerPhone") &&
          !Object.hasOwn(card.receipt, "receiptContact"),
      );
    },
  );

  await check(
    "saved checkout phone is stable after profile edits and works for pickup and kerbside guests",
    async () => {
      await db.query(
        "update mealdeck_private.customer_profiles set phone='+447700900999' where user_id=$1",
        [f.customer],
      );
      assert.equal(
        (await jobFor(original.order.orderId)).receiptContact.customerPhone,
        "+447700900123",
      );
      for (const fulfilment of ["pickup", "curbside"]) {
        const guest = await accepted({ guest: true, fulfilment });
        assert.equal(guest.job.receiptContact.customerPhone, "+447700900199");
        assert.equal(guest.job.receiptContact.orderId, guest.order.orderId);
        assert.equal(guest.job.receipt.customerName, "آمنہ O’Neill");
      }
    },
  );

  await check(
    "KDS-only staff still accept orders without receiving printer or contact authority",
    async () => {
      const order = await f.ordinary();
      const result = await f.staff(
        "mealdeck_ops_kds_accept_order",
        [f.tenantId, f.locationId, order.orderId, (await f.card(order.orderId)).version],
        kitchen,
      );
      assert.equal(result.ok, true);
      assert.equal((await jobFor(order.orderId)).receiptContact.customerPhone, "+447700900999");
      await assert.rejects(() => board(kitchen), /forbidden/);
    },
  );

  const claim = await rpc("mealdeck_printer_claim_job", [
    f.tenantId,
    f.locationId,
    original.job.jobId,
    id(67310),
  ]);
  const contactArgs = [original.job.jobId, claim.claimToken];
  await check(
    "contact is sent only to the live claimant after begin-send, with the legacy canonical shape intact",
    async () => {
      assert.deepEqual(claim.receiptContact, {
        schemaVersion: 1,
        orderId: original.order.orderId,
        customerPhone: "+447700900123",
      });
      await assert.rejects(
        () => rpc("mealdeck_printer_claim_contact", contactArgs),
        /claim_expired/,
      );
      await rpc("mealdeck_printer_begin_send", [f.tenantId, f.locationId, ...contactArgs]);
      const canonical = await rpc("mealdeck_printer_claim_receipt", contactArgs);
      assert.deepEqual(Object.keys(canonical).sort(), ["jobId", "receipt"]);
      assert.deepEqual(canonical.receipt, original.job.receipt);
      assert.equal(fingerprint(canonical.receipt), originalFingerprint);
      assert.deepEqual(await rpc("mealdeck_printer_claim_contact", contactArgs), {
        receiptContact: claim.receiptContact,
      });
      await assert.rejects(
        () => rpc("mealdeck_printer_claim_contact", [original.job.jobId, id(67311)]),
        /claim_expired/,
      );
      await assert.rejects(
        () => rpc("mealdeck_printer_claim_contact", [original.job.jobId, null]),
        /claim_expired/,
      );
      await assert.rejects(
        () => rpc("mealdeck_printer_claim_contact", [id(67399), claim.claimToken]),
        /job_unavailable/,
      );
      await assert.rejects(
        () => rpc("mealdeck_printer_claim_contact", contactArgs, otherPrinter),
        /claim_expired/,
      );
      for (const actor of [null, f.customer, unverified])
        await assert.rejects(
          () => rpc("mealdeck_printer_claim_contact", contactArgs, actor),
          /forbidden|unauthenticated/,
        );
      for (const role of ["anon", "service_role"])
        await assert.rejects(
          () => rpc("mealdeck_printer_claim_contact", contactArgs, printer, role),
          /permission denied/,
        );
    },
  );

  await check(
    "revocation, unverified identities, expired claims and withdrawn payment authority still block contact",
    async () => {
      for (const [damage, args, expected] of [
        [
          "update mealdeck_private.printer_access set enabled=false where user_id=$1",
          [printer],
          /forbidden/,
        ],
        ["update auth.users set email_confirmed_at=null where id=$1", [printer], /forbidden/],
        [
          "update mealdeck_private.receipt_jobs set claim_expires_at=now()-interval '1 second' where id=$1",
          [original.job.jobId],
          /claim_expired/,
        ],
        [
          "update mealdeck_private.receipt_jobs set status='held' where id=$1",
          [original.job.jobId],
          /claim_expired/,
        ],
        [
          "update public.orders set status='cancelled' where id=$1",
          [original.order.orderId],
          /verified_acceptance_required/,
        ],
        [
          "update public.tenant_locations set active=false where id=$1",
          [f.locationId],
          /forbidden/,
        ],
      ]) {
        await db.exec("begin");
        fixtureTransaction = true;
        try {
          await db.query(damage, args);
          await assert.rejects(() => rpc("mealdeck_printer_claim_contact", contactArgs), expected);
        } finally {
          fixtureTransaction = false;
          await db.exec("rollback");
        }
      }
      assert.deepEqual(await rpc("mealdeck_printer_claim_contact", contactArgs), {
        receiptContact: claim.receiptContact,
      });
    },
  );

  await check(
    "legacy missing or unsafe phone is omitted without altering the canonical paid receipt",
    async () => {
      for (const phone of [
        null,
        "",
        "07700900123",
        "+44 7700 900123",
        "+447700900123\n",
        "+447700900123\u202e",
      ]) {
        await db.exec("begin");
        fixtureTransaction = true;
        try {
          await db.query("update public.orders set customer_phone=$1 where id=$2", [
            phone,
            original.order.orderId,
          ]);
          const value = await rpc("mealdeck_printer_claim_contact", contactArgs);
          assert.deepEqual(value.receiptContact, {
            schemaVersion: 1,
            orderId: original.order.orderId,
            customerPhone: null,
          });
          assert.equal(
            fingerprint((await rpc("mealdeck_printer_claim_receipt", contactArgs)).receipt),
            originalFingerprint,
          );
        } finally {
          fixtureTransaction = false;
          await db.exec("rollback");
        }
      }
    },
  );

  await check(
    "private helper has no client grant and the public contact RPC grants no table or payment access",
    async () => {
      const access = await rows(`select n.nspname,p.proname,p.prosecdef,p.proconfig,
      has_function_privilege('anon',p.oid,'EXECUTE') anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') staff,
      has_function_privilege('service_role',p.oid,'EXECUTE') service
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where p.proname in ('printer_receipt_contact','printer_job_card','mealdeck_printer_claim_contact')`);
      assert.equal(access.length, 3);
      for (const item of access) {
        assert.equal(item.prosecdef, true);
        assert.ok(item.proconfig.includes('search_path=""'));
        assert.equal(item.anon, false);
        assert.equal(item.service, false);
        assert.equal(item.staff, item.nspname === "public");
      }
      await assert.rejects(
        () =>
          asActor(db, printer, () =>
            scalar("select mealdeck_ops_private.printer_receipt_contact($1)", [original.job.jobId]),
          ),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          asActor(db, printer, () => scalar("select customer_phone from public.orders limit 1")),
        /permission denied/,
      );
      assert.deepEqual(await definitions(), oldDefinitions);
      assert.deepEqual(await permissions(), oldPermissions);
    },
  );

  await check(
    "numbered copies retain contact without rewriting any earlier immutable receipt",
    async () => {
      await rpc("mealdeck_printer_send_result", [
        f.tenantId,
        f.locationId,
        ...contactArgs,
        "sent_unconfirmed",
      ]);
      await rpc("mealdeck_printer_confirm_paper", [
        f.tenantId,
        f.locationId,
        original.job.jobId,
        "printed",
        "Synthetic paper inspection",
      ]);
      const copy = await rpc("mealdeck_printer_reprint", [
        f.tenantId,
        f.locationId,
        original.job.jobId,
        "Synthetic copy for contact check",
        id(67320),
      ]);
      assert.equal(copy.copyNumber, 2);
      assert.deepEqual(copy.receiptContact, claim.receiptContact);
      assert.equal(copy.receipt.reprintOf, original.job.jobId);
      assert.equal(
        fingerprint(
          await scalar("select receipt from mealdeck_private.receipt_jobs where id=$1", [
            original.job.jobId,
          ]),
        ),
        originalFingerprint,
      );
      await assert.rejects(
        () => rpc("mealdeck_printer_claim_contact", contactArgs),
        /claim_expired/,
      );
    },
  );
  console.log(`Receipt contact: ${checks} behavior and compatibility groups passed.`);
} finally {
  await db.close();
}
