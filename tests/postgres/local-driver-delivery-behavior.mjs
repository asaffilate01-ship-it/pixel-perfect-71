import assert from "node:assert/strict";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { asActor, createDatabase, id } from "./harness.mjs";
import { setupStaffCashOrdersFixture } from "./staff-cash-orders-fixture.mjs";
import { guestTokenHash, setGuestFixtureClock } from "./guest-checkout-fixture.mjs";
import { buildStaffCashOrdersSql } from "../../deploy/mealdeck/staff-cash-orders.mjs";
import { buildMealComponentsSql } from "../../deploy/mealdeck/meal-components.mjs";
import { buildLocalDriverDeliverySql } from "../../deploy/mealdeck/local-driver-delivery.mjs";

// The harness refuses remote/nonempty databases. No real provider or live orders.
const db = await createDatabase(process.argv.includes("--native"), { uuid_ossp });
const scalar = async (sql, values = []) => Object.values((await db.query(sql, values)).rows[0])[0];
let passed = 0;
async function check(name, action) {
  await action();
  console.log(`PASS own-driver ${++passed}: ${name}`);
}
try {
  const f = await setupStaffCashOrdersFixture(db);
  await db.exec(buildStaffCashOrdersSql());
  await db.exec(buildMealComponentsSql());
  await db.exec(buildLocalDriverDeliverySql());
  await setGuestFixtureClock(db, "2026-11-06T16:00:00Z");
  const token = guestTokenHash("isolated-own-driver-guest-one");
  const stranger = guestTokenHash("isolated-own-driver-guest-two");
  await f.guest.session(token, { name: "Delivery Customer", phone: "+447700900123" });
  await f.guest.session(stranger, { name: "Other Customer", phone: "+447700900456" });
  const address = {
    postcode: "LU4 8NU",
    doorNumber: "14",
    roadName: "Test Road",
    addressLine2: "Flat 2",
  };
  const bind = (quoteId, options = {}) =>
    f.service(() =>
      scalar("select public.mealdeck_bind_local_delivery_quote($1,$2,$3,$4,$5,$6,$7::jsonb,$8)", [
        f.tenantId,
        f.locationId,
        quoteId,
        null,
        options.token ?? token,
        "c".repeat(64),
        JSON.stringify(options.address ?? address),
        options.distance ?? 0,
      ]),
    );
  const quoteFor = async (quantity = 6) => {
    await f.ageQuotes();
    return f.guest.quote(token, { lines: [{ ...f.line, quantity }] });
  };
  await check(
    "only the Luton kitchen is eligible and no registration is forced after the weekend",
    async () => {
      assert.equal(
        await f.service(() =>
          scalar("select public.mealdeck_local_delivery_ready($1,$2)", [f.tenantId, f.locationId]),
        ),
        true,
      );
      assert.equal(
        await f.service(() =>
          scalar("select public.mealdeck_local_delivery_ready($1,$2)", [f.tenantId, id(99123)]),
        ),
        false,
      );
      assert.equal(
        await scalar(
          "select mealdeck_private.launch_window_at('2026-11-09T16:00:00Z')->>'guestEligible'",
        ),
        "true",
      );
    },
  );
  await check(
    "delivery addresses have RLS and no direct public/customer/service table grants",
    async () => {
      for (const role of ["anon", "authenticated", "service_role"]) {
        for (const table of ["local_driver_quotes", "local_driver_orders"]) {
          assert.equal(
            await scalar("select has_table_privilege($1,$2,'SELECT')", [
              role,
              "mealdeck_private." + table,
            ]),
            false,
          );
          assert.equal(
            await scalar("select relrowsecurity from pg_class where oid=$1::regclass", [
              "mealdeck_private." + table,
            ]),
            true,
          );
        }
      }
      const signature =
        "public.mealdeck_bind_local_delivery_quote(uuid,uuid,uuid,uuid,text,text,jsonb,integer)";
      assert.equal(
        await scalar("select has_function_privilege('anon',$1,'EXECUTE')", [signature]),
        false,
      );
      assert.equal(
        await scalar("select has_function_privilege('authenticated',$1,'EXECUTE')", [signature]),
        false,
      );
      assert.equal(
        await scalar("select has_function_privilege('service_role',$1,'EXECUTE')", [signature]),
        true,
      );
    },
  );
  await check(
    "under-minimum, outside-radius and another guest's address binding are denied",
    async () => {
      const low = await quoteFor(1);
      assert.ok(low.totalPence < 1500 && low.discountPence > 0);
      await assert.rejects(() => bind(low.quoteId), /delivery_quote_invalid/);
      const q = await quoteFor();
      await assert.rejects(() => bind(q.quoteId, { distance: 3001 }), /delivery_address_invalid/);
      await assert.rejects(() => bind(q.quoteId, { token: stranger }), /delivery_quote_invalid/);
      await assert.rejects(
        () => bind(q.quoteId, { address: { ...address, roadName: "" } }),
        /delivery_address_invalid/,
      );
    },
  );
  await check("database binding enforces the exact £14.99/£15.00 NET boundary", async () => {
    const q = await quoteFor();
    // Adversarial values ONLY in this disposable database. Never prepare/pay this
    // quote; payment independently reprices. This isolates the SQL net threshold.
    await db.query(
      "update mealdeck_private.checkout_quotes set gross_pence=2142,discount_pence=643,total_pence=1499 where id=$1",
      [q.quoteId],
    );
    await assert.rejects(() => bind(q.quoteId), /delivery_quote_invalid/);
    await db.query(
      "update mealdeck_private.checkout_quotes set gross_pence=2143,total_pence=1500 where id=$1",
      [q.quoteId],
    );
    assert.equal((await bind(q.quoteId)).delivery, true);
  });
  const quote = await quoteFor();
  assert.ok(quote.totalPence >= 1500 && quote.discountPence > 0);
  await bind(quote.quoteId);
  const order = await f.guest.prepare(token, quote.quoteId, { attemptId: id(98761) });
  await check(
    "canonical guest delivery keeps priced totals, free fee and one private destination",
    async () => {
      assert.equal(order.fulfilment, "delivery");
      assert.equal(order.totalPence, quote.totalPence);
      assert.equal(
        await scalar("select delivery_pence from public.orders where id=$1", [order.orderId]),
        0,
      );
      assert.equal(
        await scalar(
          "select count(*)::int from mealdeck_private.local_driver_orders where order_id=$1",
          [order.orderId],
        ),
        1,
      );
      assert.deepEqual(
        await scalar("select address from mealdeck_private.local_driver_quotes where quote_id=$1", [
          quote.quoteId,
        ]),
        address,
      );
      await assert.rejects(() => f.guest.receipt(stranger, order.orderId), /order_unavailable/);
      assert.equal(
        (await f.board()).orders.some((x) => x.order_id === order.orderId),
        false,
      );
    },
  );
  await f.bind(order.orderId, "cs_test_local_driver");
  await f.reconcile(order, {
    session: "cs_test_local_driver",
    intent: "pi_local_driver",
    event: "evt_local_driver",
  });
  const card = () => f.card(order.orderId);
  const driver = async (status, version) =>
    f.staff("mealdeck_ops_kds_transition_local_driver", [
      f.tenantId,
      f.locationId,
      order.orderId,
      version ?? (await card()).driverVersion,
      status,
    ]);
  await check(
    "paid KDS has full address and 60-minute deadline; early or unauthorized handover fails",
    async () => {
      const c = await card();
      assert.deepEqual(c.deliveryAddress, address);
      assert.equal(c.deliveryContact.name, "Delivery Customer");
      assert.equal(c.deliveryContact.phone, "+447700900123");
      const paidAt = await scalar("select paid_at from public.orders where id=$1", [order.orderId]);
      assert.equal(Date.parse(c.deliveryDeadlineAt) - Date.parse(paidAt), 3600000);
      await assert.rejects(() => driver("with_driver"), /not_ready/);
      await assert.rejects(
        () =>
          asActor(db, f.customer, () =>
            scalar("select public.mealdeck_ops_kds_transition_local_driver($1,$2,$3,$4,$5)", [
              f.tenantId,
              f.locationId,
              order.orderId,
              c.driverVersion,
              "with_driver",
            ]),
          ),
        /forbidden|not_authenticated|not_authorized/,
      );
    },
  );
  await f.accept(order.orderId);
  await check("acceptance creates exactly one complete delivery receipt", async () => {
    assert.equal(
      await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
        order.orderId,
      ]),
      1,
    );
    const receipt = await scalar(
      "select receipt from mealdeck_private.receipt_jobs where order_id=$1",
      [order.orderId],
    );
    assert.equal(receipt.fulfilment, "delivery");
    assert.equal(receipt.car, null);
    assert.equal(receipt.totalPence, order.totalPence);
    assert.ok(
      receipt.items.length > 0 && receipt.items.every((x) => Array.isArray(x.mealComponents)),
    );
  });
  await f.staff("mealdeck_ops_kds_transition_order", [
    f.tenantId,
    f.locationId,
    order.orderId,
    (await card()).version,
    "preparing",
  ]);
  for (const item of (await card()).items) {
    await f.staff("mealdeck_ops_kds_set_item_ready", [
      f.tenantId,
      f.locationId,
      order.orderId,
      item.order_item_id,
      (await card()).version,
      true,
    ]);
  }
  await f.staff("mealdeck_ops_kds_transition_pass", [
    f.tenantId,
    f.locationId,
    order.orderId,
    (await card()).pass.version,
    "packing",
  ]);
  await f.staff("mealdeck_ops_kds_transition_pass", [
    f.tenantId,
    f.locationId,
    order.orderId,
    (await card()).pass.version,
    "sealed",
  ]);
  await check(
    "driver handover then delivery updates KDS and guest receipt without printing twice",
    async () => {
      const before = await card();
      await driver("with_driver", before.driverVersion);
      assert.equal((await card()).driverStatus, "with_driver");
      await assert.rejects(() => driver("delivered", before.driverVersion), /conflict/);
      const out = await f.guest.receipt(token, order.orderId);
      assert.ok(out.driverHandoverAt);
      assert.equal(out.deliveredAt, null);
      assert.equal(out.collectionEstimateMinutes, 60);
      await driver("delivered");
      assert.equal(
        (await f.board()).orders.some((x) => x.order_id === order.orderId),
        false,
      );
      const completed = (await f.board()).completed_orders.find(
        (x) => x.order_id === order.orderId,
      );
      assert.equal(completed.driverStatus, "delivered");
      assert.deepEqual(completed.deliveryAddress, address);
      const done = await f.guest.receipt(token, order.orderId);
      assert.equal(done.status, "fulfilled");
      assert.ok(done.deliveredAt);
      assert.equal(done.completedAt, done.deliveredAt);
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
          order.orderId,
        ]),
        1,
      );
    },
  );
  console.log(`Verified ${passed} complete own-driver delivery behavior groups.`);
} catch (error) {
  console.error("Own-driver delivery verification failed:", error.message, error.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
