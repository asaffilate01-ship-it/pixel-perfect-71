import assert from "node:assert/strict";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { asActor, createDatabase } from "./harness.mjs";
import { setupStaffCashOrdersFixture } from "./staff-cash-orders-fixture.mjs";
import {
  buildStaffCashOrdersSql,
  buildManagedStaffCashOrdersSql,
} from "../../deploy/mealdeck/staff-cash-orders.mjs";
import { buildIncludedDrinkStockManifest } from "../../deploy/mealdeck/included-drink-stock.mjs";
import { validateReceipt } from "../../tools/receipt-bridge/receipt.mjs";

const db = await createDatabase(process.argv.includes("--native"), { uuid_ossp });
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
let passed = 0;
async function check(label, run) {
  try {
    await run();
    console.log(`PASS staff cash ${++passed}: ${label}`);
  } catch (error) {
    console.error(`FAIL staff cash: ${label}: ${error.message}`, error.where ?? "");
    throw error;
  }
}
const counts = () =>
  scalar(`select jsonb_build_object(
  'orders',(select count(*) from public.orders),'cash',(select count(*) from mealdeck_private.cash_orders),
  'audit',(select count(*) from public.mealdeck_ops_audit_log where action='cash.received'),
  'numbers',(select count(*) from mealdeck_private.order_numbers),
  'tickets',(select count(*) from public.kds_tickets),'receipts',(select count(*) from mealdeck_private.receipt_jobs))`);
const providers = () =>
  scalar(`select jsonb_build_object(
  'ordinary',(select jsonb_agg(to_jsonb(s) order by order_id) from mealdeck_private.stripe_orders s),
  'payments',(select jsonb_agg(to_jsonb(p) order by order_id) from mealdeck_private.payment_orders p),
  'collections',(select jsonb_agg(to_jsonb(c) order by id) from mealdeck_private.payment_collections c),
  'events',(select jsonb_agg(to_jsonb(e) order by event_id) from mealdeck_private.stripe_events e))`);

try {
  const f = await setupStaffCashOrdersFixture(db);
  const prior = await f.ordinary();
  await f.accept(prior.orderId);
  const oldReceipt = await scalar(
    "select receipt from mealdeck_private.receipt_jobs where order_id=$1",
    [prior.orderId],
  );
  const oldProviders = await providers();
  const oldAuthority = await scalar(
    "select prosrc from pg_proc where oid='mealdeck_private.kds_release_authority(uuid)'::regprocedure",
  );
  await check(
    "guarded install and exact rerun preserve old orders, provider evidence and frozen receipts",
    async () => {
      await db.exec(buildStaffCashOrdersSql());
      const state = await counts();
      await db.exec(buildStaffCashOrdersSql());
      assert.deepEqual(await counts(), state);
      assert.deepEqual(await providers(), oldProviders);
      assert.deepEqual(
        await scalar("select receipt from mealdeck_private.receipt_jobs where order_id=$1", [
          prior.orderId,
        ]),
        oldReceipt,
      );
      assert.equal(
        await scalar(
          "select prosrc from pg_proc where oid='mealdeck_private.kds_release_authority_before_cash(uuid)'::regprocedure",
        ),
        oldAuthority,
      );
      assert.equal(
        await scalar("select mealdeck_private.kds_release_authority($1)->>'eligible'", [
          prior.orderId,
        ]),
        "true",
      );
      assert.throws(
        () => buildManagedStaffCashOrdersSql({ runnerOwnsTransaction: true }),
        /atomic/,
      );
      assert.ok(
        !buildManagedStaffCashOrdersSql({ runnerOwnsTransaction: true, singleMigration: true })
          .split("\n")
          .includes("begin;"),
      );
    },
  );

  await check(
    "only service RPCs may attest; private tables and cash evidence remain inaccessible",
    async () => {
      const q = await f.cashQuote();
      for (const role of ["anon", "authenticated"])
        await assert.rejects(
          () =>
            asActor(
              db,
              f.owner,
              () =>
                db.query(
                  "select public.mealdeck_confirm_cash_order($1,$2,$3,$4,$5,true)",
                  f.cashArgs(q, f.next()),
                ),
              role,
            ),
          /permission denied/,
        );
      for (const role of ["anon", "authenticated", "service_role"]) {
        await assert.rejects(
          () =>
            asActor(
              db,
              f.owner,
              () => db.query("select * from mealdeck_private.cash_orders"),
              role,
            ),
          /permission denied/,
        );
        await assert.rejects(
          () =>
            asActor(
              db,
              f.owner,
              () => db.query("select mealdeck_private.kds_release_authority($1)", [prior.orderId]),
              role,
            ),
          /permission denied/,
        );
      }
      await assert.rejects(() => f.cashQuote({ actor: f.customer }), /staff_forbidden/);
      await assert.rejects(() => f.cashQuote({ actor: f.unverified }), /staff_forbidden/);
      await assert.rejects(() => f.cashQuote({ locationId: f.next() }), /staff_forbidden/);
      assert.equal(
        await scalar(
          "select count(*)::int from pg_policies where schemaname='mealdeck_private' and tablename in ('cash_orders','cash_checkout_quotes')",
        ),
        0,
      );
    },
  );

  await check(
    "real contact and print-safe notes are mandatory/frozen without a customer account or payment",
    async () => {
      const before = await counts();
      for (const name of [null, "", " ", "\u202E", "\nAmna", "a".repeat(121)])
        await assert.rejects(() => f.cashQuote({ name }), /contact_required|notes_invalid/);
      for (const phone of [null, "", "07700900123", "+44bad", "+123"])
        await assert.rejects(() => f.cashQuote({ phone }), /contact_required/);
      for (const notes of ["x".repeat(1001), "No\u202Eonions", "\u0007"])
        await assert.rejects(() => f.cashQuote({ notes }), /notes_invalid/);
      const q = await f.cashQuote({ name: "آمنہ O’Neill", notes: " No onions\r\nSauce aside 🍋 " });
      assert.equal(q.customerName, "آمنہ O’Neill");
      assert.equal(q.customerPhone, "+447700900123");
      assert.equal(q.notes, "No onions\nSauce aside 🍋");
      assert.deepEqual(await counts(), before);
      const actor = await scalar(
        "select jsonb_build_array(customer_id,guest_id,staff_id,fulfilment,vehicle) from mealdeck_private.checkout_quotes where id=$1",
        [q.quoteId],
      );
      assert.deepEqual(actor, [null, null, f.owner, "pickup", null]);
      assert.deepEqual(await f.cashStatus(q, f.next()), {
        order: null,
        replayed: false,
        cancelled: false,
      });
      await assert.rejects(
        () =>
          db.query(
            "update mealdeck_private.cash_checkout_quotes set customer_name='Changed' where quote_id=$1",
            [q.quoteId],
          ),
        /immutable/,
      );
    },
  );

  let saved;
  let savedQuote;
  let savedAttempt;
  await check(
    "cash received creates one honest tender, number and pending KDS order; acceptance creates one receipt",
    async () => {
      await f.ageQuotes();
      const beforeProviders = await providers();
      const before = await counts();
      const lines = [{ ...f.line, quantity: 2 }];
      savedQuote = await f.cashQuote({
        lines,
        packing: f.pack(lines, true),
        notes: "No onions\nSauce aside",
      });
      savedAttempt = f.next();
      await assert.rejects(
        () => f.cashConfirm(savedQuote, savedAttempt, { received: false }),
        /attestation_required/,
      );
      const response = await f.cashConfirm(savedQuote, savedAttempt);
      saved = response.order;
      assert.equal(response.replayed, false);
      assert.equal(saved.paymentMethod, "cash");
      assert.equal(saved.cashReceived, true);
      assert.equal(saved.verifiedPaid, true);
      assert.equal(saved.totalPence, savedQuote.totalPence);
      assert.equal(saved.orderNumber, "0002");
      assert.match(saved.handoffCode, /^\d{4}$/);
      assert.equal(saved.acceptedAt, null);
      assert.deepEqual(await providers(), beforeProviders);
      const o = await scalar("select to_jsonb(o) from public.orders o where id=$1", [
        saved.orderId,
      ]);
      assert.equal(o.customer_id, null);
      assert.equal(o.customer_email, null);
      assert.equal(o.guest_checkout, false);
      assert.equal(o.customer_name, savedQuote.customerName);
      assert.equal(o.customer_phone, savedQuote.customerPhone);
      assert.match(o.payment_reference, /^md_cash_[a-f0-9-]{36}$/);
      assert.equal(o.paid_at, saved.receivedAt);
      const card = await f.card(saved.orderId);
      assert.equal(card.notes, savedQuote.notes);
      assert.deepEqual(card.pickupContact, {
        name: savedQuote.customerName,
        phone: savedQuote.customerPhone,
      });
      assert.equal(card.order_number, saved.orderNumber);
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
          saved.orderId,
        ]),
        0,
      );
      const audit = await scalar(
        "select jsonb_build_object('actor',actor_id,'value',next_value) from public.mealdeck_ops_audit_log where entity_id=$1 and action='cash.received'",
        [saved.orderId],
      );
      assert.equal(audit.actor, f.owner);
      assert.equal(audit.value.amountPence, saved.totalPence);
      assert.equal(audit.value.paymentMethod, "cash");
      assert.equal((await f.cashConfirm(savedQuote, savedAttempt)).order.orderId, saved.orderId);
      assert.equal((await f.cashConfirm(savedQuote, f.next())).order.orderId, saved.orderId);
      await f.accept(saved.orderId);
      await f.accept(saved.orderId);
      const receipt = await scalar(
        "select receipt from mealdeck_private.receipt_jobs where order_id=$1",
        [saved.orderId],
      );
      assert.equal(receipt.paymentMethod, "cash");
      assert.equal(receipt.orderNumber, saved.orderNumber);
      assert.equal(receipt.orderNotes, savedQuote.notes);
      assert.equal(receipt.items[0].quantity, 2);
      assert.equal(receipt.totalPence, saved.totalPence);
      assert.equal(receipt.cutleryRequested, true);
      assert.equal(validateReceipt(receipt).paymentMethod, "cash");
      const after = await counts();
      assert.equal(after.cash, before.cash + 1);
      assert.equal(after.orders, before.orders + 1);
      assert.equal(after.audit, before.audit + 1);
      assert.equal(after.numbers, before.numbers + 1);
      assert.equal(after.receipts, before.receipts + 1);
      assert.equal((await f.cashStatus(savedQuote, savedAttempt)).order.acceptedAt !== null, true);
      await assert.rejects(
        () =>
          db.query("delete from mealdeck_private.cash_orders where order_id=$1", [saved.orderId]),
        /immutable/,
      );
    },
  );

  await check(
    "attempt conflicts, foreign staff and quote mixing cannot create or disclose another tender",
    async () => {
      const q = await f.cashQuote();
      const before = await counts();
      await assert.rejects(() => f.cashConfirm(q, savedAttempt), /attempt_conflict/);
      await assert.rejects(
        () => f.cashStatus(savedQuote, savedAttempt, { actor: f.customer }),
        /staff_forbidden/,
      );
      const terminal = await f.terminalQuote();
      await assert.rejects(() => f.cashConfirm(terminal, f.next()), /cash_quote_unavailable/);
      await assert.rejects(() => f.terminal({ quoteId: q.quoteId }), /cash_overlap/);
      await assert.rejects(() => f.terminal({ orderId: saved.orderId }), /order_unavailable/);
      await assert.rejects(
        () =>
          f.service(() =>
            scalar("select public.mealdeck_customer_order_receipt($1,$2)", [
              saved.orderId,
              f.customer,
            ]),
          ),
        /order_unavailable/,
      );
      assert.deepEqual(await counts(), before);
    },
  );

  await check(
    "expiry, disabled kitchen and current price changes fail before any cash fact; committed recovery survives close",
    async () => {
      const q = await f.cashQuote();
      const before = await counts();
      await db.query(
        "update mealdeck_private.checkout_quotes set expires_at=now()-interval '1 second' where id=$1",
        [q.quoteId],
      );
      await assert.rejects(() => f.cashConfirm(q, f.next()), /quote_expired/);
      const priceQuote = await f.cashQuote();
      const item = await scalar(
        "select to_jsonb(i) from public.menu_items i where tenant_id=$1 and sku=$2",
        [f.tenantId, f.line.sku],
      );
      await db.query("update public.menu_items set price_pence=price_pence+1 where id=$1", [
        item.id,
      ]);
      try {
        await assert.rejects(() => f.cashConfirm(priceQuote, f.next()), /price_changed/);
      } finally {
        await db.query("update public.menu_items set price_pence=$2 where id=$1", [
          item.id,
          item.price_pence,
        ]);
      }
      const closedQuote = await f.cashQuote();
      await db.query(
        "update mealdeck_private.checkout_settings set checkout_enabled=false,availability_state='closed' where tenant_id=$1 and location_id=$2",
        [f.tenantId, f.locationId],
      );
      try {
        await assert.rejects(() => f.cashConfirm(closedQuote, f.next()), /unavailable/);
        assert.equal((await f.cashConfirm(savedQuote, savedAttempt)).order.orderId, saved.orderId);
      } finally {
        await db.query(
          "update mealdeck_private.checkout_settings set checkout_enabled=true,availability_state='online' where tenant_id=$1 and location_id=$2",
          [f.tenantId, f.locationId],
        );
      }
      assert.deepEqual(await counts(), before);
    },
  );

  await check(
    "included drink linked stock is rechecked at cash confirmation without changing a frozen prior payment",
    async () => {
      const binding = buildIncludedDrinkStockManifest().bindings.find(
        (entry) =>
          entry.group === "skorch-burgers-kids-included-drink" && entry.option.includes("rubicon"),
      );
      const item = f.data.brands
        .find((entry) => entry.id === binding.brand)
        .sections.flatMap((section) => section.items)
        .find((entry) => entry.canonicalOptionGroupIds.includes(binding.group));
      const modifiers = item.canonicalOptionGroupIds.flatMap((groupId) => {
        const group = f.data.modifierGroups.find((entry) => entry.id === groupId);
        return groupId === binding.group
          ? [f.mkOption(groupId, binding.option)]
          : group.minSelect > 0
            ? [f.mkOption(groupId, group.options.find((entry) => entry.available !== false).id)]
            : [];
      });
      const lines = [{ ...f.line, sku: item.id, modifiers }];
      const q = await f.cashQuote({ lines });
      const before = await counts();
      const target = await scalar(
        "select id from public.menu_items where tenant_id=$1 and sku=$2",
        [f.tenantId, binding.sku],
      );
      await db.query("update public.menu_items set active=false where id=$1", [target]);
      try {
        await assert.rejects(() => f.cashConfirm(q, f.next()), /modifier_unavailable/);
        await assert.rejects(() => f.cashQuote({ lines }), /modifier_unavailable/);
        assert.equal((await f.cashStatus(savedQuote, savedAttempt)).order.verifiedPaid, true);
      } finally {
        await db.query("update public.menu_items set active=true where id=$1", [target]);
      }
      assert.deepEqual(await counts(), before);
    },
  );

  await check(
    "rollback removes the cash fact, KDS and assigned number; retry then commits once",
    async () => {
      const q = await f.cashQuote();
      const attempt = f.next();
      const before = await counts();
      await db.exec("begin");
      const provisional = await f.cashConfirm(q, attempt);
      await db.exec("rollback");
      assert.deepEqual(await counts(), before);
      assert.deepEqual(await f.cashStatus(q, attempt), {
        order: null,
        replayed: false,
        cancelled: false,
      });
      const committed = await f.cashConfirm(q, attempt);
      assert.notEqual(committed.order.orderId, provisional.order.orderId);
      assert.equal(committed.order.orderNumber, provisional.order.orderNumber);
    },
  );

  await check(
    "revoked collectors cannot quote, confirm or recover; historical cash evidence stays valid",
    async () => {
      const q = await f.cashQuote();
      const attempt = f.next();
      const before = await counts();
      await db.query("update public.mealdeck_ops_staff_access set enabled=false where user_id=$1", [
        f.owner,
      ]);
      try {
        await assert.rejects(() => f.cashQuote(), /staff_forbidden/);
        await assert.rejects(() => f.cashConfirm(q, attempt), /staff_forbidden/);
        await assert.rejects(() => f.cashStatus(savedQuote, savedAttempt), /staff_forbidden/);
        assert.equal(
          await scalar("select mealdeck_private.cash_order_financial_ready($1)", [saved.orderId]),
          true,
        );
      } finally {
        await db.query(
          "update public.mealdeck_ops_staff_access set enabled=true where user_id=$1",
          [f.owner],
        );
      }
      assert.deepEqual(await counts(), before);
    },
  );

  await check(
    "closing an unused attempt is atomic, scoped and permanent for every later attempt on that quote",
    async () => {
      const q = await f.cashQuote();
      const attempt = f.next();
      const before = await counts();
      await assert.rejects(
        () => f.cashCancel(q, attempt, { actor: f.customer }),
        /staff_forbidden/,
      );
      await assert.rejects(
        () => f.cashCancel(q, attempt, { locationId: f.next() }),
        /staff_forbidden/,
      );
      const closed = { order: null, replayed: false, cancelled: true };
      assert.deepEqual(await f.cashCancel(q, attempt), closed);
      assert.deepEqual(await f.cashCancel(q, attempt), closed);
      assert.deepEqual(await f.cashStatus(q, attempt), closed);
      assert.deepEqual(await f.cashStatus(q, f.next()), closed);
      await assert.rejects(() => f.cashConfirm(q, attempt), /cash_attempt_closed/);
      await assert.rejects(() => f.cashConfirm(q, f.next()), /cash_attempt_closed/);
      const other = await f.cashQuote();
      await assert.rejects(() => f.cashConfirm(other, attempt), /attempt_conflict/);
      await assert.rejects(
        () =>
          db.query("delete from mealdeck_private.cash_closed_quotes where quote_id=$1", [
            q.quoteId,
          ]),
        /immutable/,
      );
      assert.deepEqual(await counts(), before);
    },
  );

  await check(
    "closing after confirmation returns the original cash order and never creates a refund or closure",
    async () => {
      const before = await counts();
      const providerBefore = await providers();
      const result = await f.cashCancel(savedQuote, savedAttempt);
      assert.equal(result.order.orderId, saved.orderId);
      assert.equal(result.replayed, true);
      assert.equal(result.cancelled, false);
      assert.equal(result.order.verifiedPaid, true);
      assert.equal(
        await scalar(
          "select count(*)::int from mealdeck_private.cash_closed_quotes where quote_id=$1",
          [savedQuote.quoteId],
        ),
        0,
      );
      assert.deepEqual(await counts(), before);
      assert.deepEqual(await providers(), providerBefore);
    },
  );

  await check(
    "cancelled/refunded cash orders lose kitchen authority without erasing tender or number",
    async () => {
      const q = await f.cashQuote();
      const attempt = f.next();
      const { order } = await f.cashConfirm(q, attempt);
      for (const state of ["cancelled", "refunded"]) {
        await db.query("update public.orders set status=$2::public.order_status where id=$1", [
          order.orderId,
          state,
        ]);
        assert.equal(
          await scalar("select mealdeck_private.cash_order_financial_ready($1)", [order.orderId]),
          false,
        );
        assert.equal(
          await scalar("select mealdeck_private.kds_release_authority($1)", [order.orderId]),
          null,
        );
        assert.equal((await f.cashStatus(q, attempt)).order.cashReceived, true);
        assert.equal(await f.number(order.orderId), order.orderNumber);
      }
    },
  );

  await check(
    "ordinary, fully funded shared and Terminal evidence still release through their original authority",
    async () => {
      await f.ageQuotes();
      const ordinary = await f.ordinary();
      assert.equal((await f.card(ordinary.orderId)).order_id, ordinary.orderId);
      const lines = [{ ...f.line, quantity: 2 }];
      const packing = {
        version: 1,
        separateBags: true,
        cutleryRequested: false,
        bags: [1, 2].map((number) => ({
          number,
          allocations: [{ lineId: f.line.lineId, quantity: 1 }],
        })),
      };
      const group = await f.group({ lines, packing });
      for (const index of [0, 1]) {
        const session = "cs_test_cashregression" + f.next().replaceAll("-", "");
        const collection = await f.bindPayment(await f.claim(group, { index }), {
          session,
          url: "https://checkout.stripe.com/g/pay/" + session,
        });
        await f.reconcilePayment(collection);
        if (index === 0) assert.equal(await f.card(group.room.orderId), undefined);
      }
      assert.ok(await f.card(group.room.orderId));
      const quote = await f.terminalQuote();
      const terminal = await f.bindPayment(await f.terminal({ quoteId: quote.quoteId }));
      await f.reconcilePayment(terminal);
      assert.ok(await f.card(terminal.orderId));
      assert.equal(
        await scalar(
          "select count(*)::int from mealdeck_private.cash_orders where order_id=any($1::uuid[])",
          [[ordinary.orderId, group.room.orderId, terminal.orderId]],
        ),
        0,
      );
    },
  );

  if (db.native) {
    const { staffCashConcurrencyTests } = await import("./staff-cash-orders-concurrency.mjs");
    await staffCashConcurrencyTests(db, f, check);
  }
  console.log(`PASS staff cash orders: ${passed} groups`);
} finally {
  await db.close();
}
