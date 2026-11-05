import assert from "node:assert/strict";
import { asActor, createDatabase, id } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";
import { checkoutHandoffConcurrencyTest } from "./stripe-checkout-concurrency.mjs";

const db = await createDatabase(process.argv.includes("--native"));
let checks = 0;
async function test(label, action) {
  try {
    await action();
    console.log("PASS checkout " + ++checks + ": " + label);
  } catch (error) {
    console.error("FAIL checkout: " + label);
    throw error;
  }
}
try {
  console.log("Engine: " + (await db.query("select version() as version")).rows[0].version);
  const f = await setupStripeCheckoutFixture(db);
  await test("payment/quote tables and private authority have no direct API access", async () => {
    const rows = (
      await db.query(`select c.relname,c.relrowsecurity,
      has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon,
      has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as customer,
      has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') as service
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='mealdeck_private' and c.relname in ('checkout_settings','checkout_quotes','stripe_orders','stripe_events')`)
    ).rows;
    assert.equal(rows.length, 4);
    assert.ok(
      rows.every((row) => row.relrowsecurity && !row.anon && !row.customer && !row.service),
    );
    for (const role of ["anon", "authenticated", "service_role"])
      for (const functionName of [
        "mealdeck_private.kds_release_authority(uuid)",
        "mealdeck_private.allocate_checkout_handoff_code(uuid,uuid)",
      ])
        assert.equal(
          (
            await db.query("select has_function_privilege($1,$2,'EXECUTE') as allowed", [
              role,
              functionName,
            ])
          ).rows[0].allowed,
          false,
        );
    await assert.rejects(
      () =>
        asActor(db, f.customer, () =>
          db.query("select public.mealdeck_prepare_stripe_order($1,$2,$3,'acct_Fixture',false)", [
            id(1),
            f.customer,
            id(2),
          ]),
        ),
      /permission denied/,
    );
  });
  await test("opening window is exactly three London calendar days including DST, with no made-up start date", async () => {
    for (const [date, hours] of [
      ["2026-03-28", 71],
      ["2026-10-24", 73],
    ]) {
      await db.query("update mealdeck_private.checkout_settings set opening_start_date=$1::date", [
        date,
      ]);
      const offer = (
        await db.query("select mealdeck_private.opening_offer($1,$2) as result", [
          f.tenantId,
          f.locationId,
        ])
      ).rows[0].result;
      assert.equal((Date.parse(offer.endsAt) - Date.parse(offer.startsAt)) / 3_600_000, hours);
    }
    await db.exec("update mealdeck_private.checkout_settings set opening_start_date=null");
    const offer = (
      await db.query("select mealdeck_private.opening_offer($1,$2) as result", [
        f.tenantId,
        f.locationId,
      ])
    ).rows[0].result;
    assert.equal(offer.status, "unscheduled");
    assert.equal(offer.startsAt, null);
    await db.exec(
      "update mealdeck_private.checkout_settings set opening_start_date=(now() at time zone 'Europe/London')::date",
    );
  });
  await test("unverified or forged-metadata users cannot receive the offer or create orders", async () => {
    await db.query(
      "update auth.users set raw_user_meta_data='{" +
        '"registered":true,"email_verified":true' +
        "}'::jsonb where id=$1",
      [f.unverified],
    );
    await assert.rejects(() => f.quote({ actor: f.unverified }), /registration_required/);
    assert.equal((await db.query("select count(*)::integer n from public.orders")).rows[0].n, 0);
  });
  await test("delivery is blocked and only kerbside requires minimal vehicle details", async () => {
    await assert.rejects(() => f.quote({ fulfilment: "delivery" }), /unavailable/);
    await assert.rejects(() => f.quote({ fulfilment: "curbside" }), /vehicle_required/);
    await assert.rejects(
      () => f.quote({ vehicle: { make: "VW", colour: "Blue", registrationLast4: "4ABC" } }),
      /vehicle_not_needed/,
    );
    await assert.rejects(
      () =>
        f.quote({
          fulfilment: "curbside",
          vehicle: { make: "VW", colour: "Blue", registrationLast4: "AB12ABC" },
        }),
      /vehicle_required/,
    );
  });
  let simpleQuote;
  await test("verified members qualify without marketing consent; actual canonical £3.99 becomes £2.79", async () => {
    simpleQuote = await f.quote();
    assert.equal(simpleQuote.grossPence, 399);
    assert.equal(simpleQuote.discountPence, 120);
    assert.equal(simpleQuote.totalPence, 279);
    assert.equal(simpleQuote.lines[0].base_unit_pence, 399);
    assert.equal(simpleQuote.lines[0].brand_name, "Skorch");
    assert.equal(simpleQuote.packingPlan.cutleryRequested, false);
  });
  await test("current administrator prices are used and a stale price quote cannot be paid", async () => {
    await db.query("update public.menu_items set price_pence=449 where tenant_id=$1 and sku=$2", [
      f.tenantId,
      f.ace.id,
    ]);
    await assert.rejects(() => f.prepare(simpleQuote.quoteId), /price_changed/);
    const quote = await f.quote();
    assert.equal(quote.grossPence, 449);
    assert.equal(quote.totalPence, 314);
    await db.query("update public.menu_items set price_pence=399 where tenant_id=$1 and sku=$2", [
      f.tenantId,
      f.ace.id,
    ]);
  });
  await test("exact allocations, nonempty sequential bags, and linked extras are enforced in SQL", async () => {
    const line = { ...f.line, quantity: 2 };
    const bad = {
      version: 1,
      separateBags: true,
      cutleryRequested: false,
      bags: [{ number: 1, allocations: [{ lineId: "line-1", quantity: 1 }] }],
    };
    await assert.rejects(() => f.quote({ lines: [line], packing: bad }), /incomplete_packing/);
    await assert.rejects(
      () => f.quote({ packing: { ...bad, bags: [{ ...bad.bags[0], number: 2 }] } }),
      /invalid_packing/,
    );
    await assert.rejects(
      () => f.quote({ packing: { ...bad, bags: [{ number: 1, allocations: [] }] } }),
      /invalid_packing/,
    );
    const extra = { ...f.line, lineId: "line-1-extra-side", parentLineId: "line-1" };
    await assert.rejects(
      () =>
        f.quote({
          lines: [line, extra],
          packing: {
            ...bad,
            bags: [
              { number: 1, allocations: [{ lineId: "line-1", quantity: 2 }] },
              { number: 2, allocations: [{ lineId: extra.lineId, quantity: 1 }] },
            ],
          },
        }),
      /linked_extra_bag_mismatch/,
    );
  });
  let detailedQuote;
  await test("every selected surcharge and named replacement has immutable current names, quantities and target details", async () => {
    const b = f.data.brands.find((brand) => brand.id === "skorch-burgers");
    const meal = f.data.modifierGroups.find(
      (group) => group.id === "skorch-burgers-make-it-a-meal",
    );
    const addons = f.data.modifierGroups.find(
      (group) => group.id === "skorch-burgers-burger-add-ons",
    );
    const ring = addons.options.find((option) => option.label.includes("Onion"));
    const cross = f.data.modifierGroups.find((group) => group.id === "cross-drink-replacement");
    const mojito = cross.options.find((option) => option.label === "Virgin Mojito");
    assert.ok(b && meal && ring && mojito);
    const line = {
      ...f.line,
      quantity: 2,
      modifiers: [
        f.mkOption(meal.id, meal.options[0].id),
        f.mkOption(addons.id, ring.id),
        f.mkOption(cross.id, mojito.id, "cross", mojito.targetItemId),
      ],
    };
    const packing = {
      version: 1,
      separateBags: true,
      cutleryRequested: true,
      bags: [1, 2].map((number) => ({
        number,
        allocations: [{ lineId: line.lineId, quantity: 1 }],
      })),
    };
    detailedQuote = await f.quote({
      lines: [line],
      packing,
      fulfilment: "curbside",
      vehicle: { make: "VW", colour: "Blue", registrationLast4: "4ABC" },
    });
    assert.equal(detailedQuote.grossPence, (399 + 250 + 199 + 299) * 2);
    assert.equal(detailedQuote.lines[0].modifiers[1].name, ring.label);
    assert.equal(detailedQuote.lines[0].modifiers[1].price_delta_pence, 199);
    assert.equal(detailedQuote.lines[0].modifiers[2].target_brand_name, "Moktl");
    assert.ok(
      detailedQuote.lines[0].modifiers.every((modifier) => typeof modifier.group_name === "string"),
    );
  });
  let order;
  await test("retries create one pending order with no KDS ticket and preserve packing, vehicle and exact order lines", async () => {
    order = await f.prepare(detailedQuote.quoteId);
    assert.deepEqual(await f.prepare(detailedQuote.quoteId), order);
    await assert.rejects(
      () => f.prepare(detailedQuote.quoteId, { actor: f.otherCustomer }),
      /quote_unavailable/,
    );
    assert.equal((await db.query("select count(*)::integer n from public.orders")).rows[0].n, 1);
    assert.equal(
      (await db.query("select count(*)::integer n from public.kds_tickets")).rows[0].n,
      0,
    );
    const stored = (await db.query("select * from public.orders where id=$1", [order.orderId]))
      .rows[0];
    assert.equal(stored.accepted_at, null);
    assert.equal(stored.delivery_address, null);
    assert.equal(stored.cutlery_requested, true);
    assert.deepEqual(stored.packing_plan, detailedQuote.packingPlan);
    assert.equal(stored.vehicle_registration, "4ABC");
    assert.ok(stored.review_confirmed_at);
    assert.equal(stored.handoff_code_reserved, true);
    const line = (
      await db.query("select * from public.order_items where order_id=$1", [order.orderId])
    ).rows[0];
    assert.equal(line.checkout_line_id, "line-1");
    assert.equal(line.base_unit_price_pence, 399);
  });
  await test("wrong Stripe account, amount, mode, currency or session cannot mark paid or release KDS", async () => {
    await f.bind(order.orderId);
    for (const override of [
      { captured: 1 },
      { account: "acct_Another" },
      { livemode: true },
      { currency: "usd" },
      { session: "cs_test_other" },
    ])
      await assert.rejects(() => f.reconcile(order, override), /payment_mismatch/);
    assert.equal(
      (await db.query("select count(*)::integer n from public.kds_tickets")).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("select payment_status from public.orders where id=$1", [order.orderId]))
        .rows[0].payment_status,
      "pending",
    );
  });
  await test("verified capture creates one shared KDS card, but payment alone is not kitchen acceptance", async () => {
    const result = await f.reconcile(order);
    assert.equal(result.ok, true);
    assert.equal(result.replayed, false);
    assert.equal(
      (await db.query("select count(*)::integer n from public.kds_tickets")).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select accepted_at from public.orders where id=$1", [order.orderId])).rows[0]
        .accepted_at,
      null,
    );
    const authority = (
      await db.query("select mealdeck_private.kds_release_authority($1) as result", [order.orderId])
    ).rows[0].result;
    assert.equal(authority.eligible, true);
    assert.equal(
      (
        await db.query("select mealdeck_ops_private.kds_routing_complete($1) as ready", [
          order.orderId,
        ])
      ).rows[0].ready,
      true,
    );
  });
  await test("replayed or repeated provider notifications cannot duplicate a paid order or tickets", async () => {
    assert.equal((await f.reconcile(order)).replayed, true);
    await assert.rejects(() => f.reconcile(order, { hash: "c".repeat(64) }), /event_conflict/);
    await f.reconcile(order, { event: "evt_repeat", hash: "c".repeat(64) });
    assert.equal((await db.query("select count(*)::integer n from public.orders")).rows[0].n, 1);
    assert.equal(
      (await db.query("select count(*)::integer n from public.kds_ticket_items")).rows[0].n,
      1,
    );
    await assert.rejects(() => f.prepare(detailedQuote.quoteId), /already_paid/);
  });
  await test("customer receipt is private and contains verified status, every modifier, bags, cutlery and server ETA", async () => {
    const read = (customer) =>
      f.service(() =>
        db.query("select public.mealdeck_customer_order_receipt($1,$2) as result", [
          order.orderId,
          customer,
        ]),
      );
    await assert.rejects(() => read(f.otherCustomer), /order_unavailable/);
    const receipt = (await read(f.customer)).rows[0].result;
    assert.equal(receipt.verifiedPaid, true);
    assert.equal(receipt.acceptedAt, null);
    assert.match(receipt.handoffCode, /^\d{4}$/);
    assert.equal(receipt.collectionEstimateMinutes, 25);
    assert.deepEqual(receipt.lines, detailedQuote.lines);
    assert.deepEqual(receipt.packingPlan, detailedQuote.packingPlan);
  });
  await test("account history derives the verified customer identity and returns only minimal own-order fields", async () => {
    const read = (customer) =>
      asActor(db, customer, () => db.query("select public.mealdeck_customer_orders() as result"));
    await assert.rejects(() => read(f.unverified), /registration_required/);
    await assert.rejects(() => read(f.owner), /registration_required/);
    await assert.rejects(
      () => asActor(db, null, () => db.query("select public.mealdeck_customer_orders()"), "anon"),
      /permission denied/,
    );
    assert.deepEqual((await read(f.otherCustomer)).rows[0].result, { orders: [] });
    const history = (await read(f.customer)).rows[0].result;
    assert.equal(history.orders.length, 1);
    assert.equal(history.orders[0].orderId, order.orderId);
    assert.equal(history.orders[0].verifiedPaid, true);
    assert.equal(history.orders[0].acceptedAt, null);
    assert.match(history.orders[0].handoffCode, /^\d{4}$/);
    assert.deepEqual(
      Object.keys(history.orders[0]).sort(),
      [
        "orderId",
        "handoffCode",
        "verifiedPaid",
        "held",
        "paymentSessionExpired",
        "fulfilment",
        "totalPence",
        "createdAt",
        "paidAt",
        "acceptedAt",
        "preparingAt",
        "readyForCollectionAt",
        "completedAt",
      ].sort(),
    );
  });
  await test("full refunds invalidate KDS evidence and late capture cannot restore eligibility", async () => {
    await f.reconcile(order, {
      event: "evt_refund",
      hash: "d".repeat(64),
      type: "charge.refunded",
      refunded: order.totalPence,
    });
    assert.equal(
      (
        await db.query("select mealdeck_private.kds_release_authority($1) as result", [
          order.orderId,
        ])
      ).rows[0].result,
      null,
    );
    await f.reconcile(order, { event: "evt_lateCapture", hash: "e".repeat(64) });
    const stored = (
      await db.query("select status,payment_status from public.orders where id=$1", [order.orderId])
    ).rows[0];
    assert.deepEqual(stored, { status: "refunded", payment_status: "refunded" });
    assert.equal(
      (
        await db.query("select handoff_code_reserved from public.orders where id=$1", [
          order.orderId,
        ])
      ).rows[0].handoff_code_reserved,
      false,
    );
    assert.equal(
      (
        await db.query(
          "select sum(amount_pence)::integer n from public.mealdeck_refund_allocations where order_id=$1",
          [order.orderId],
        )
      ).rows[0].n,
      order.totalPence,
    );
  });
  await test("account history is bounded to the latest twenty own orders, and refunded orders remain held", async () => {
    for (let index = 0; index < 22; index++) {
      const quote = await f.quote({ actor: f.otherCustomer });
      await f.prepare(quote.quoteId, { actor: f.otherCustomer, attemptId: id(8300 + index) });
    }
    const read = (customer) =>
      asActor(db, customer, () => db.query("select public.mealdeck_customer_orders() as result"));
    const other = (await read(f.otherCustomer)).rows[0].result.orders;
    assert.equal(other.length, 20);
    const expected = (
      await db.query(
        "select id from public.orders where customer_id=$1 order by created_at desc,id desc limit 20",
        [f.otherCustomer],
      )
    ).rows.map((row) => row.id);
    assert.deepEqual(
      other.map((entry) => entry.orderId),
      expected,
    );
    assert.ok(other.every((entry) => entry.handoffCode === null && entry.verifiedPaid === false));
    const own = (await read(f.customer)).rows[0].result.orders;
    assert.equal(own.length, 1);
    assert.equal(own[0].orderId, order.orderId);
    assert.equal(own[0].held, true);
    assert.equal(own[0].verifiedPaid, false);
  });
  await test("forced handoff collisions allocate different reserved codes and local expiry alone never releases them", async () => {
    const quotes = [await f.quote(), await f.quote(), await f.quote()];
    const prepared = [];
    for (let index = 0; index < quotes.length; index++) {
      // The exact same PRNG seed forces every allocation to start at the same code.
      await db.query("select setseed(0.314159)");
      prepared.push(await f.prepare(quotes[index].quoteId, { attemptId: id(8501 + index) }));
      if (index === 0)
        await db.query(
          "update mealdeck_private.stripe_orders set expires_at=now()-interval '1 minute' where order_id=$1",
          [prepared[0].orderId],
        );
    }
    const rows = (
      await db.query(
        "select id,handoff_code,handoff_code_reserved from public.orders where id=any($1::uuid[])",
        [prepared.map((entry) => entry.orderId)],
      )
    ).rows;
    assert.equal(rows.length, 3);
    assert.equal(new Set(rows.map((row) => row.handoff_code)).size, 3);
    assert.ok(rows.every((row) => row.handoff_code_reserved && /^\d{4}$/.test(row.handoff_code)));
    await assert.rejects(
      () =>
        db.query("update public.orders set handoff_code=$1 where id=$2", [
          rows[0].handoff_code,
          rows[1].id,
        ]),
      /duplicate key|unique constraint/,
    );
    await assert.rejects(
      () => f.prepare(quotes[0].quoteId, { attemptId: id(8501) }),
      /session_expired/,
    );
    assert.equal(
      (
        await db.query("select handoff_code_reserved from public.orders where id=$1", [
          prepared[0].orderId,
        ])
      ).rows[0].handoff_code_reserved,
      true,
    );
  });
  await test("handoff allocation scans the full four-digit namespace and fails explicitly when every code is reserved", async () => {
    await db.exec("begin");
    try {
      // Fixture-only population of every remaining number. Existing active
      // reservations are preserved; this entire capacity test is rolled back.
      await db.query(
        `insert into public.orders(tenant_id,location_id,status,fulfilment,source,
        subtotal_pence,total_pence,handoff_code,handoff_code_reserved)
        select $1,$2,'payment_pending','pickup','mealdeck',1,1,lpad(n::text,4,'0'),true
        from generate_series(0,9999) n where not exists(select 1 from public.orders o
          where o.tenant_id=$1 and o.location_id=$2 and o.handoff_code_reserved
          and o.handoff_code=lpad(n::text,4,'0'))`,
        [f.tenantId, f.locationId],
      );
      await db.query(
        "update public.orders set handoff_code_reserved=false where tenant_id=$1 and location_id=$2 and handoff_code='9999' and handoff_code_reserved",
        [f.tenantId, f.locationId],
      );
      const available = (
        await db.query("select mealdeck_private.allocate_checkout_handoff_code($1,$2) as code", [
          f.tenantId,
          f.locationId,
        ])
      ).rows[0].code;
      assert.equal(available, "9999");
      await db.query(
        `insert into public.orders(tenant_id,location_id,status,fulfilment,source,
        subtotal_pence,total_pence,handoff_code,handoff_code_reserved)
        values($1,$2,'payment_pending','pickup','mealdeck',1,1,'9999',true)`,
        [f.tenantId, f.locationId],
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::integer n from public.orders where tenant_id=$1 and location_id=$2 and handoff_code_reserved",
            [f.tenantId, f.locationId],
          )
        ).rows[0].n,
        10000,
      );
      await db.exec("savepoint exhausted");
      await assert.rejects(
        () =>
          db.query("select mealdeck_private.allocate_checkout_handoff_code($1,$2)", [
            f.tenantId,
            f.locationId,
          ]),
        /handoff_capacity/,
      );
      await db.exec("rollback to savepoint exhausted");
    } finally {
      await db.exec("rollback");
    }
  });
  if (db.native) await checkoutHandoffConcurrencyTest(db, f, test);
  console.log(`Verified ${checks} checkout behavior groups.`);
} finally {
  await db.close();
}
