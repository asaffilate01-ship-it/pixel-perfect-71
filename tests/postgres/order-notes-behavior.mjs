import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { asActor, createDatabase } from "./harness.mjs";
import { guestTokenHash } from "./guest-checkout-fixture.mjs";
import { setupOrderNotesFixture } from "./order-notes-fixture.mjs";
import {
  buildOrderNotesSql,
  buildManagedOrderNotesSql,
} from "../../deploy/mealdeck/order-notes.mjs";
import { buildIncludedDrinkStockManifest } from "../../deploy/mealdeck/included-drink-stock.mjs";
import { validateReceipt } from "../../tools/receipt-bridge/receipt.mjs";

const db = await createDatabase(process.argv.includes("--native"), { uuid_ossp });
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
let checks = 0;
async function check(label, action) {
  try {
    await action();
    console.log(`PASS order notes ${++checks}: ${label}`);
  } catch (error) {
    console.error(`FAIL order notes: ${label}: ${error.message}`, error.where ?? "");
    throw error;
  }
}

try {
  const f = await setupOrderNotesFixture(db);
  const old = await f.ordinary();
  await f.accept(old.orderId);
  const financialDefinitions = () =>
    rows(`select p.oid::regprocedure::text signature,
    pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','mealdeck_private','mealdeck_ops_private') and p.proname in (
      'price_checkout_lines','price_checkout_lines_before_included_stock','mealdeck_public_menu',
      'create_checkout_quote_for_actor','mealdeck_create_checkout_quote','mealdeck_create_guest_checkout_quote',
      'prepare_stripe_order_for_identity','mealdeck_prepare_stripe_order','mealdeck_prepare_guest_stripe_order',
      'release_paid_order','kds_release_authority','payment_order_financial_ready',
      'mealdeck_reconcile_stripe_event','mealdeck_reconcile_order_payment',
      'mealdeck_bind_stripe_session','mealdeck_bind_order_payment','receipt_snapshot') order by signature`);
  const businessRows = () =>
    scalar(`select jsonb_build_object(
    'orders',(select jsonb_agg(to_jsonb(o) order by o.id) from public.orders o),
    'quotes',(select jsonb_agg(to_jsonb(q) order by q.id) from mealdeck_private.checkout_quotes q),
    'stripe',(select jsonb_agg(to_jsonb(s) order by s.order_id) from mealdeck_private.stripe_orders s),
    'numbers',(select jsonb_agg(to_jsonb(n) order by n.order_id) from mealdeck_private.order_numbers n),
    'receipts',(select jsonb_agg(to_jsonb(j) order by j.id) from mealdeck_private.receipt_jobs j))`);
  const beforeFunctions = await financialDefinitions();
  const beforeRows = await businessRows();
  const oldReceipt = await scalar(
    "select receipt from mealdeck_private.receipt_jobs where order_id=$1",
    [old.orderId],
  );
  const materializer = "mealdeck_private.materialize_payment_order(uuid,uuid,uuid,uuid,uuid)";
  const materializerBefore = await scalar("select pg_get_functiondef($1::regprocedure)", [
    materializer,
  ]);
  const actorSignature =
    "mealdeck_private.create_checkout_quote_for_actor(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb)";
  const sourceQuote = (
    await readFile(
      new URL(
        "../../deploy/mealdeck/post-install-migrations/20261105182512_mealdeck_shared_terminal_payments.sql",
        import.meta.url,
      ),
      "utf8",
    )
  )
    .match(/create function mealdeck_private\.create_checkout_quote_for_actor\([\s\S]*?\$\$;/)[0]
    .replace("create function", "create or replace function");
  const managed = buildManagedOrderNotesSql({ runnerOwnsTransaction: true, singleMigration: true });

  await check(
    "atomic managed install, wrong profile/body denial, exact rerun and historical preservation",
    async () => {
      for (const options of [
        null,
        {},
        [],
        { runnerOwnsTransaction: true },
        { runnerOwnsTransaction: true, singleMigration: true, split: true },
      ])
        assert.throws(
          () => buildManagedOrderNotesSql(options),
          /one runner-owned atomic transaction/,
        );
      await db.exec("begin");
      try {
        await db.exec(managed);
        assert.ok(await scalar("select to_regclass('mealdeck_private.checkout_quote_notes')"));
      } finally {
        await db.exec("rollback");
      }
      assert.equal(
        await scalar("select to_regclass('mealdeck_private.checkout_quote_notes')"),
        null,
      );
      assert.equal(
        await scalar("select pg_get_functiondef($1::regprocedure)", [materializer]),
        materializerBefore,
      );
      await db.exec("begin");
      try {
        await db.exec(sourceQuote);
        const before = await scalar("select prosrc from pg_proc where oid=$1::regprocedure", [
          actorSignature,
        ]);
        assert.equal(
          await scalar("select md5(prosrc) from pg_proc where oid=$1::regprocedure", [
            actorSignature,
          ]),
          "7614993635874e546b8c65fd7899308a",
        );
        await db.exec(managed);
        assert.equal(
          await scalar("select prosrc from pg_proc where oid=$1::regprocedure", [actorSignature]),
          before,
        );
        const quote = await f.notesQuote("Source installation");
        assert.equal(quote.totalPence, old.totalPence);
      } finally {
        await db.exec("rollback");
      }
      assert.equal(
        await scalar("select md5(prosrc) from pg_proc where oid=$1::regprocedure", [
          actorSignature,
        ]),
        "aae853a38bd262b074525ff3707af461",
      );
      for (const damage of [
        "create schema dishbee_private",
        "alter table mealdeck_private.order_numbers rename to missing_numbering_fixture",
        "alter function mealdeck_private.price_checkout_lines_before_included_stock(uuid,uuid,jsonb) rename to missing_stock_fixture",
        "create or replace function mealdeck_private.materialize_payment_order(p_quote uuid,p_customer uuid,p_guest uuid,p_staff uuid,p_room uuid) returns public.orders language plpgsql security definer set search_path='' as $$begin return null;end$$",
      ]) {
        await db.exec("begin");
        try {
          await db.exec(damage);
          await assert.rejects(
            () => db.exec(managed),
            /independent_profile|required|unreviewed_definition/,
          );
        } finally {
          await db.exec("rollback");
        }
      }
      await db.exec(buildOrderNotesSql());
      await db.exec(buildOrderNotesSql());
      assert.deepEqual(await financialDefinitions(), beforeFunctions);
      assert.deepEqual(await businessRows(), beforeRows);
      assert.equal(await f.number(old.orderId), "0001");
    },
  );

  await check(
    "private RLS/append-only storage and service-only scoped public entries",
    async () => {
      const table = (
        await rows(`select relrowsecurity,
      has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') anon,
      has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') customer,
      has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE') service
      from pg_class where oid='mealdeck_private.checkout_quote_notes'::regclass`)
      )[0];
      assert.deepEqual(table, {
        relrowsecurity: true,
        anon: false,
        customer: false,
        service: false,
      });
      const functions = await rows(`select n.nspname,p.proname,p.proconfig,
      has_function_privilege('anon',p.oid,'EXECUTE') anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') customer,
      has_function_privilege('service_role',p.oid,'EXECUTE') service
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where p.proname in ('normalise_checkout_notes','checkout_quote_notes_immutable','freeze_new_checkout_notes',
        'mealdeck_create_checkout_quote_with_notes','mealdeck_create_guest_checkout_quote_with_notes')`);
      assert.equal(functions.length, 5);
      for (const fn of functions) {
        assert.deepEqual(fn.proconfig, ['search_path=""']);
        assert.equal(fn.anon, false);
        assert.equal(fn.customer, false);
        assert.equal(fn.service, fn.nspname === "public");
      }
      for (const role of ["anon", "authenticated", "service_role"])
        await assert.rejects(
          () =>
            asActor(
              db,
              null,
              () => scalar("select notes from mealdeck_private.checkout_quote_notes limit 1"),
              role,
            ),
          /permission denied/,
        );
      for (const role of ["anon", "authenticated"])
        await assert.rejects(
          () =>
            asActor(
              db,
              f.customer,
              () =>
                scalar(
                  "select public.mealdeck_create_checkout_quote_with_notes($1,$2,$3,'pickup',null,'[]','bad','{}','No onions')",
                  [f.tenantId, f.locationId, f.customer],
                ),
              role,
            ),
          /permission denied/,
        );
    },
  );

  await check(
    "SQL matches Unicode length, whitespace, multiline and print-safe control rules",
    async () => {
      const normalise = (value) =>
        scalar("select mealdeck_private.normalise_checkout_notes($1)", [value]);
      for (const [input, expected] of [
        [null, null],
        [" \t\r\n\u3000", null],
        ["  No onions\r\nSauce\taside 🍋  ", "No onions\nSauce\taside 🍋"],
        ["\u00a0آمنہ café\u3000", "آمنہ café"],
        ["🍋".repeat(1000), "🍋".repeat(1000)],
        ["<script>alert('plain text')</script>", "<script>alert('plain text')</script>"],
      ])
        assert.equal(await normalise(input), expected);
      for (const input of [
        "🍋".repeat(1001),
        "x".repeat(1001),
        "\v\t ",
        "a\f",
        "a\u001b",
        "a\u0085",
        "\uFEFF",
        "a\u00ad",
        "a\u200d",
        "a\u202e",
        "a\u2066",
        "a\u{e0001}",
      ])
        await assert.rejects(() => normalise(input), /checkout_notes_invalid/);
    },
  );

  let saved;
  const note = "No onions\nSauce\taside 🍋";
  await check(
    "captured live private-test offer remains unchanged and limited to the existing eligible member",
    async () => {
      const windowDefinition = await scalar(
        "select pg_get_functiondef('mealdeck_private.launch_window()'::regprocedure)",
      );
      const eligibleDefinition = await scalar(
        "select pg_get_functiondef('mealdeck_private.launch_test_eligible_at(uuid,timestamptz)'::regprocedure)",
      );
      try {
        // Disposable clock/identity fixture only: exercise the captured existing
        // discount branch without changing its production function or authority.
        await db.exec(`create or replace function mealdeck_private.launch_test_eligible_at(p_customer uuid,p_at timestamptz)
        returns boolean language sql stable security definer set search_path='' as $$ select p_customer='${f.customer}'::uuid $$`);
        await db.exec(`create or replace function mealdeck_private.launch_window()
        returns jsonb language sql stable security definer set search_path='' as $$
        select mealdeck_private.launch_window_at('2026-11-06T16:00:00Z')||jsonb_build_object(
          'orderingOpen',true,'guestEligible',false,'serverNow',now(),'currentClosesAt',now()+interval '2 hours') $$`);
        const original = await f.quote();
        const withNotes = await f.notesQuote("Private offer unchanged");
        assert.ok(original.discountPence > 0);
        assert.equal(withNotes.grossPence, original.grossPence);
        assert.equal(withNotes.discountPence, original.discountPence);
        assert.equal(withNotes.totalPence, original.totalPence);
        assert.equal(
          (await f.notesQuote("Ordinary member", { customer: f.otherCustomer })).discountPence,
          0,
        );
        assert.equal((await f.terminalQuote()).discountPence, 0);
      } finally {
        await db.exec(windowDefinition);
        await db.exec(eligibleDefinition);
      }
      assert.deepEqual(await financialDefinitions(), beforeFunctions);
    },
  );
  await check(
    "new member quote freezes notes while amounts, selection and legacy blanks stay unchanged",
    async () => {
      const original = await f.quote();
      saved = await f.notesQuote("  No onions\r\nSauce\taside 🍋  ");
      assert.equal(saved.notes, note);
      for (const key of [
        "grossPence",
        "discountPence",
        "totalPence",
        "currency",
        "fulfilment",
        "lines",
        "packingPlan",
      ])
        assert.deepEqual(saved[key], original[key]);
      const frozen = await scalar(
        "select notes from mealdeck_private.checkout_quote_notes where quote_id=$1",
        [saved.quoteId],
      );
      assert.equal(frozen, note);
      for (const notes of [null, "", " \n\t "]) {
        const blank = await f.notesQuote(notes);
        assert.equal(blank.notes, null);
        assert.equal(
          await scalar(
            "select count(*)::int from mealdeck_private.checkout_quote_notes where quote_id=$1",
            [blank.quoteId],
          ),
          0,
        );
      }
      assert.equal(
        await scalar(
          "select count(*)::int from mealdeck_private.checkout_quote_notes where quote_id=$1",
          [original.quoteId],
        ),
        0,
      );
      await assert.rejects(
        () =>
          db.query(
            "update mealdeck_private.checkout_quote_notes set notes='Changed' where quote_id=$1",
            [saved.quoteId],
          ),
        /notes_immutable/,
      );
      await assert.rejects(
        () =>
          db.query("delete from mealdeck_private.checkout_quote_notes where quote_id=$1", [
            saved.quoteId,
          ]),
        /notes_immutable/,
      );
      await assert.rejects(
        () =>
          db.query(
            "insert into mealdeck_private.checkout_quote_notes(quote_id,notes) values($1,'Changed')",
            [saved.quoteId],
          ),
        /duplicate key/,
      );
      assert.deepEqual(await financialDefinitions(), beforeFunctions);
    },
  );

  await check(
    "member verification, guest identity, scoped kitchen and original wrapper gates still apply",
    async () => {
      await assert.rejects(
        () => f.notesQuote("No onions", { customer: f.unverified }),
        /registration_required/,
      );
      await assert.rejects(
        () => f.notesQuote("No onions", { locationId: f.next() }),
        /unavailable|scope/,
      );
      await assert.rejects(
        () => f.notesQuote("No onions", { token: guestTokenHash("missing") }),
        /guest_session/,
      );
      const name = "mealdeck_private.begin_launch_test_context(uuid)";
      const definition = await scalar("select pg_get_functiondef($1::regprocedure)", [name]);
      try {
        await db.exec(
          "create or replace function mealdeck_private.begin_launch_test_context(p_customer uuid) returns void language plpgsql security definer set search_path='' as $$begin raise exception 'mealdeck_fixture_private_identity_denied';end$$",
        );
        await assert.rejects(() => f.notesQuote("No onions"), /fixture_private_identity_denied/);
      } finally {
        await db.exec(definition);
      }
    },
  );

  let prepared;
  await check(
    "canonical prepare copies notes once; payment recovery never rewrites them or releases unpaid tickets",
    async () => {
      prepared = await f.prepare(saved.quoteId, { attemptId: f.next() });
      assert.equal(
        await scalar("select notes from public.orders where id=$1", [prepared.orderId]),
        note,
      );
      assert.equal(prepared.totalPence, saved.totalPence);
      assert.equal(await f.card(prepared.orderId), undefined);
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
          prepared.orderId,
        ]),
        0,
      );
      const recovery = await f.prepare(saved.quoteId, { attemptId: f.next() });
      assert.equal(recovery.orderId, prepared.orderId);
      assert.equal(
        await scalar("select notes from public.orders where id=$1", [prepared.orderId]),
        note,
      );
      const different = await f.notesQuote("Keep onions");
      assert.notEqual(different.quoteId, saved.quoteId);
      assert.equal(
        await scalar("select notes from public.orders where id=$1", [prepared.orderId]),
        note,
      );
      const another = await f.guest.session(guestTokenHash(f.next()));
      assert.ok(another.guestId);
      await assert.rejects(
        () => f.prepare(saved.quoteId, { actor: f.otherCustomer, attemptId: f.next() }),
        /quote_unavailable/,
      );
    },
  );

  await check(
    "verified payment, KDS, customer receipt and exactly one printable snapshot retain notes and numbering",
    async () => {
      const suffix = f.next().replaceAll("-", "");
      const session = "cs_test_notes" + suffix;
      await f.bind(prepared.orderId, session);
      const event = "evt_notes" + suffix;
      const result = await f.reconcile(prepared, { session, event, intent: "pi_notes" + suffix });
      assert.ok(result);
      assert.equal((await f.card(prepared.orderId)).notes, note);
      assert.equal((await f.card(prepared.orderId)).order_number, "0002");
      const receipt = await f.service(() =>
        scalar("select public.mealdeck_customer_order_receipt($1,$2)", [
          prepared.orderId,
          f.customer,
        ]),
      );
      assert.equal(receipt.notes, note);
      assert.equal(receipt.orderNumber, "0002");
      assert.equal(receipt.totalPence, saved.totalPence);
      await f.accept(prepared.orderId);
      const snapshot = await scalar(
        "select receipt from mealdeck_private.receipt_jobs where order_id=$1",
        [prepared.orderId],
      );
      assert.equal(snapshot.orderNotes, note);
      assert.equal(validateReceipt(snapshot).orderNotes, "No onions Sauce aside 🍋");
      assert.equal(snapshot.orderNumber, "0002");
      await f.reconcile(prepared, { session, event, intent: "pi_notes" + suffix });
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
          prepared.orderId,
        ]),
        1,
      );
      assert.deepEqual(
        await scalar("select receipt from mealdeck_private.receipt_jobs where order_id=$1", [
          old.orderId,
        ]),
        oldReceipt,
      );
    },
  );

  await check("guest notes remain identity-scoped through prepare and receipt", async () => {
    const token = guestTokenHash(f.next());
    await f.guest.session(token);
    const quote = await f.notesQuote("Guest: sauce apart", { token });
    const pending = await f.guest.prepare(token, quote.quoteId, { attemptId: f.next() });
    assert.equal(
      await scalar("select notes from public.orders where id=$1", [pending.orderId]),
      quote.notes,
    );
    assert.equal((await f.guest.receipt(token, pending.orderId)).notes, quote.notes);
    const otherToken = guestTokenHash(f.next());
    await f.guest.session(otherToken);
    await assert.rejects(() => f.guest.receipt(otherToken, pending.orderId), /order_unavailable/);
    await assert.rejects(
      () => f.guest.prepare(otherToken, quote.quoteId, { attemptId: f.next() }),
      /quote_unavailable/,
    );
    assert.equal(await f.card(pending.orderId), undefined);
  });

  await check(
    "shared quote keeps one immutable note, organiser privacy, full-funding gate and canonical receipt",
    async () => {
      await f.ageQuotes();
      const lines = [{ ...f.line, quantity: 3 }];
      const packing = {
        version: 1,
        separateBags: true,
        cutleryRequested: true,
        bags: [
          { number: 1, allocations: [{ lineId: f.line.lineId, quantity: 1 }] },
          { number: 2, allocations: [{ lineId: f.line.lineId, quantity: 2 }] },
        ],
      };
      const quote = await f.notesQuote("Group: no onions", { lines, packing });
      const group = await f.group({ quote, lines, packing });
      assert.equal(group.room.notes, quote.notes);
      assert.equal((await f.status(group)).notes, quote.notes);
      assert.equal((await f.status(group, { participant: true })).notes, undefined);
      const firstSession = "cs_test_notes" + f.next().replaceAll("-", "");
      const first = await f.bindPayment(await f.claim(group, { index: 0 }), {
        session: firstSession,
        url: "https://checkout.stripe.com/g/pay/" + firstSession,
      });
      await f.reconcilePayment(first);
      assert.equal(await f.card(group.room.orderId), undefined);
      const secondSession = "cs_test_notes" + f.next().replaceAll("-", "");
      const second = await f.bindPayment(await f.claim(group, { index: 1 }), {
        session: secondSession,
        url: "https://checkout.stripe.com/c/pay/" + secondSession,
      });
      await f.reconcilePayment(second);
      const card = await f.card(group.room.orderId);
      assert.equal(card.notes, quote.notes);
      assert.ok(card.order_number);
      await f.accept(group.room.orderId);
      const receipt = await scalar(
        "select receipt from mealdeck_private.receipt_jobs where order_id=$1",
        [group.room.orderId],
      );
      assert.equal(receipt.orderNotes, quote.notes);
      assert.equal(receipt.totalPence, quote.totalPence);
    },
  );

  await check(
    "stock-aware pricer still rejects a hidden included drink at quote and first prepare",
    async () => {
      const binding = buildIncludedDrinkStockManifest().bindings.find(
        (entry) =>
          entry.group === "skorch-burgers-kids-included-drink" && entry.option.includes("rubicon"),
      );
      assert.ok(binding);
      const brand = f.data.brands.find((entry) => entry.id === binding.brand);
      const item = brand.sections
        .flatMap((section) => section.items)
        .find((entry) => entry.canonicalOptionGroupIds.includes(binding.group));
      const modifiers = item.canonicalOptionGroupIds.flatMap((groupId) => {
        const group = f.data.modifierGroups.find((entry) => entry.id === groupId);
        if (groupId === binding.group) return [f.mkOption(groupId, binding.option)];
        return group.minSelect > 0
          ? [f.mkOption(groupId, group.options.find((entry) => entry.available !== false).id)]
          : [];
      });
      const lines = [{ ...f.line, sku: item.id, modifiers }];
      const quote = await f.notesQuote("Sauce apart", { lines });
      const alreadyPreparedQuote = await f.notesQuote("Already frozen", { lines });
      const alreadyPrepared = await f.prepare(alreadyPreparedQuote.quoteId, {
        attemptId: f.next(),
      });
      const target = await scalar(
        "select id from public.menu_items where tenant_id=$1 and sku=$2",
        [f.tenantId, binding.sku],
      );
      await asActor(db, f.owner, () =>
        scalar("select public.mealdeck_ops_set_menu_visibility($1,$2,$3,false)", [
          f.tenantId,
          f.locationId,
          target,
        ]),
      );
      try {
        await assert.rejects(() => f.notesQuote("Sauce apart", { lines }), /modifier_unavailable/);
        await assert.rejects(
          () => f.prepare(quote.quoteId, { attemptId: f.next() }),
          /modifier_unavailable/,
        );
        const resumed = await f.prepare(alreadyPreparedQuote.quoteId, { attemptId: f.next() });
        assert.equal(resumed.orderId, alreadyPrepared.orderId);
        assert.equal(
          await scalar("select notes from public.orders where id=$1", [resumed.orderId]),
          "Already frozen",
        );
      } finally {
        await asActor(db, f.owner, () =>
          scalar("select public.mealdeck_ops_set_menu_visibility($1,$2,$3,true)", [
            f.tenantId,
            f.locationId,
            target,
          ]),
        );
      }
      assert.deepEqual(await financialDefinitions(), beforeFunctions);
    },
  );

  await check(
    "old Terminal quote defaults remain unchanged and notes/order creation roll back together",
    async () => {
      const quote = await f.terminalQuote();
      const terminal = await f.terminal({ quoteId: quote.quoteId });
      assert.equal(
        await scalar("select notes from public.orders where id=$1", [terminal.orderId]),
        null,
      );
      const counts = await scalar(
        "select jsonb_build_array((select count(*) from mealdeck_private.checkout_quotes),(select count(*) from mealdeck_private.checkout_quote_notes),(select count(*) from public.orders))",
      );
      await db.exec("begin");
      try {
        const transient = await f.notesQuote("Rollback together");
        const pending = await f.prepare(transient.quoteId, { attemptId: f.next() });
        assert.equal(
          await scalar("select notes from public.orders where id=$1", [pending.orderId]),
          "Rollback together",
        );
      } finally {
        await db.exec("rollback");
      }
      assert.deepEqual(
        await scalar(
          "select jsonb_build_array((select count(*) from mealdeck_private.checkout_quotes),(select count(*) from mealdeck_private.checkout_quote_notes),(select count(*) from public.orders))",
        ),
        counts,
      );
      assert.deepEqual(await financialDefinitions(), beforeFunctions);
    },
  );
  console.log(`PASS ${checks} order notes behavior groups`);
} catch (error) {
  console.error("Order notes verification failed:", error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
