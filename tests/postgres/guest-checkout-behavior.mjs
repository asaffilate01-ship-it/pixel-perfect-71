import assert from "node:assert/strict";
import pg from "pg";
import { createDatabase, asActor, id } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";
import { buildKitchenPrinterSql } from "../../deploy/mealdeck/kitchen-printer.mjs";
import {
  buildGuestCheckoutSql,
  buildManagedGuestCheckoutSql,
} from "../../deploy/mealdeck/guest-checkout.mjs";
import {
  guestTokenHash,
  guestFixtureMethods,
  setGuestFixtureClock,
} from "./guest-checkout-fixture.mjs";

const db = await createDatabase(process.argv.includes("--native"));
let checks = 0;
async function test(label, run) {
  try {
    await run();
    console.log("PASS guest checkout " + ++checks + ": " + label);
  } catch (error) {
    console.error("FAIL guest checkout: " + label + ": " + error.message);
    throw error;
  }
}
const guestHash = guestTokenHash("isolated-fixture-first-browser-random-secret");
const otherHash = guestTokenHash("isolated-fixture-second-browser-random-secret");

try {
  console.log("Engine: " + (await db.query("select version() as version")).rows[0].version);
  const f = await setupStripeCheckoutFixture(db);
  await db.exec(buildKitchenPrinterSql());
  const identityCounts = async () =>
    (
      await db.query(`select
    (select count(*)::integer from auth.users) users,
    (select count(*)::integer from mealdeck_private.customer_profiles) members,
    (select count(*)::integer from mealdeck_private.customer_consent_events) consents,
    (select count(*)::integer from mealdeck_private.customer_loyalty_ledger) loyalty,
    (select count(*)::integer from mealdeck_private.customer_push_subscriptions) push`)
    ).rows[0];
  const initialIdentityCounts = await identityCounts();

  await test("atomic extension rolls back completely and does not activate the disabled channel", async () => {
    await db.exec("update mealdeck_private.checkout_settings set checkout_enabled=false");
    const managed = buildManagedGuestCheckoutSql({
      runnerOwnsTransaction: true,
      singleMigration: true,
    });
    assert.throws(
      () => buildManagedGuestCheckoutSql({ runnerOwnsTransaction: true }),
      /one runner-owned/,
    );
    assert.throws(
      () =>
        buildManagedGuestCheckoutSql({
          runnerOwnsTransaction: true,
          singleMigration: true,
          partial: true,
        }),
      /one runner-owned/,
    );
    await db.exec("begin");
    await db.exec(managed);
    await db.exec("rollback");
    assert.equal(
      (await db.query("select to_regclass('mealdeck_private.guest_sessions') t")).rows[0].t,
      null,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from information_schema.columns where table_schema='public' and table_name='orders' and column_name='guest_checkout'",
        )
      ).rows[0].n,
      0,
    );
    await db.exec(buildGuestCheckoutSql());
    assert.equal(
      (await db.query("select checkout_enabled from mealdeck_private.checkout_settings")).rows[0]
        .checkout_enabled,
      false,
    );
    assert.deepEqual(await identityCounts(), initialIdentityCounts);
    assert.equal((await db.query("select count(*)::int n from public.orders")).rows[0].n, 0);
  });

  const g = guestFixtureMethods(db, f);
  const status = async () =>
    (
      await db.query("select public.mealdeck_online_checkout_status($1,$2) as result", [
        f.tenantId,
        f.locationId,
      ])
    ).rows[0].result;
  await test("exact London opening hours reject every overnight edge and end guest ordering permanently", async () => {
    const expected = [
      ["2026-11-05T23:59:59Z", false, false],
      ["2026-11-06T14:59:59Z", false, false],
      ["2026-11-06T15:00:00Z", true, true],
      ["2026-11-06T22:59:59Z", true, true],
      ["2026-11-06T23:00:00Z", false, false],
      ["2026-11-07T00:00:00Z", false, false],
      ["2026-11-07T12:59:59Z", false, false],
      ["2026-11-07T13:00:00Z", true, true],
      ["2026-11-07T23:00:00Z", false, false],
      ["2026-11-08T12:59:59Z", false, false],
      ["2026-11-08T13:00:00Z", true, true],
      ["2026-11-08T22:59:59Z", true, true],
      ["2026-11-08T23:00:00Z", false, false],
      ["2026-11-09T00:00:00Z", true, false],
      ["2027-11-06T16:00:00Z", true, false],
    ];
    for (const [time, ordering, guest] of expected) {
      const value = (
        await db.query("select mealdeck_private.launch_window_at($1::timestamptz) as result", [
          time,
        ])
      ).rows[0].result;
      assert.equal(value.orderingOpen, ordering, time + " ordering");
      assert.equal(value.guestEligible, guest, time + " guest");
      assert.equal(value.timezone, "Europe/London");
      assert.equal(Date.parse(value.startsAt), Date.parse("2026-11-06T15:00:00Z"));
      assert.equal(Date.parse(value.endsAt), Date.parse("2026-11-08T23:00:00Z"));
    }
    assert.equal(
      (await db.query("select mealdeck_private.launch_window_at(null)->>'guestEligible' value"))
        .rows[0].value,
      "false",
    );
    // Production source has no request-claim, environment or test-time override.
    const definition = (
      await db.query(
        "select pg_get_functiondef('mealdeck_private.launch_window()'::regprocedure) definition",
      )
    ).rows[0].definition;
    assert.match(definition, /launch_window_at\(now\(\)\)/);
    assert.doesNotMatch(definition, /current_setting|request\.jwt|test/);
  });

  await test("private guest records and internals reject all API roles; only backend may call guest RPCs", async () => {
    const tables = (
      await db.query(`select c.relname,c.relrowsecurity,
      has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon,
      has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as customer,
      has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') as service
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='mealdeck_private' and c.relname in ('guest_sessions','checkout_quotes','stripe_orders')`)
    ).rows;
    assert.equal(tables.length, 3);
    assert.ok(
      tables.every((row) => row.relrowsecurity && !row.anon && !row.customer && !row.service),
    );
    const functions = (
      await db.query(`select n.nspname,p.proname,
      has_function_privilege('anon',p.oid,'EXECUTE') as anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as customer,
      has_function_privilege('service_role',p.oid,'EXECUTE') as service,
      p.proconfig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where (n.nspname='mealdeck_private' and p.proname in
        ('launch_window','launch_window_at','guest_session_authority','guest_session_card','checkout_identity',
        'create_checkout_quote_for_identity','prepare_stripe_order_for_identity','checkout_receipt_for_identity'))
      or (n.nspname='public' and p.proname in
        ('mealdeck_begin_guest_session','mealdeck_resolve_guest_session','mealdeck_end_guest_session',
        'mealdeck_create_guest_checkout_quote','mealdeck_prepare_guest_stripe_order','mealdeck_guest_order_receipt'))`)
    ).rows;
    assert.equal(functions.length, 14);
    assert.ok(
      functions.every(
        (row) => !row.anon && !row.customer && row.service === (row.nspname === "public"),
      ),
    );
    assert.ok(
      functions.every((row) => row.proconfig?.some((setting) => /^search_path=""$/.test(setting))),
    );
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(
        () =>
          asActor(
            db,
            role === "anon" ? null : f.customer,
            () =>
              db.query(
                "select public.mealdeck_begin_guest_session($1,$2,$3,'Guest','guest@example.invalid','+447700900199')",
                [f.tenantId, f.locationId, guestHash],
              ),
            role,
          ),
        /permission denied/,
      );
    }
  });

  await test("confirmed launch date is fixed and expired/missing setup cannot admit a guest", async () => {
    await setGuestFixtureClock(db, "2026-11-06T16:00:00Z");
    assert.equal((await status()).guestCheckoutEligible, false);
    await assert.rejects(() => g.session(guestHash), /guest_unavailable/);
    await assert.rejects(
      () =>
        asActor(db, f.owner, () =>
          db.query(
            "select public.mealdeck_ops_update_checkout_settings($1,$2,true,'2026-11-07',25)",
            [f.tenantId, f.locationId],
          ),
        ),
      /opening_date_fixed/,
    );
    await asActor(db, f.owner, () =>
      db.query("select public.mealdeck_ops_update_checkout_settings($1,$2,true,null,25)", [
        f.tenantId,
        f.locationId,
      ]),
    );
    assert.equal(
      (await db.query("select opening_start_date::text d from mealdeck_private.checkout_settings"))
        .rows[0].d,
      "2026-11-06",
    );
    await setGuestFixtureClock(db, "2026-11-06T14:59:59Z");
    assert.equal((await status()).channelOpen, false);
    await assert.rejects(() => g.session(guestHash), /guest_unavailable/);
    await assert.rejects(() => f.quote(), /outside_opening_hours/);
    await setGuestFixtureClock(db, "2026-11-06T16:00:00Z");
    assert.equal((await status()).guestCheckoutEligible, true);
  });

  let guest;
  await test("guest session is scoped, idempotent and creates no Auth, membership, consent or loyalty records", async () => {
    guest = await g.session(guestHash);
    assert.equal(guest.name, "Guest Customer");
    assert.equal(guest.loyaltyEligible, false);
    assert.ok(guest.guestId);
    assert.equal((await g.session(guestHash)).guestId, guest.guestId);
    assert.equal((await g.resolve(guestHash)).guestId, guest.guestId);
    const row = (
      await db.query(
        "select token_hash,privacy_version,extract(epoch from expires_at-created_at) seconds from mealdeck_private.guest_sessions where id=$1",
        [guest.guestId],
      )
    ).rows[0];
    assert.equal(row.token_hash, guestHash);
    assert.equal(row.privacy_version, "mealdeck-guest-2026-11-05");
    assert.equal(Number(row.seconds), 30 * 24 * 60 * 60);
    assert.deepEqual(await identityCounts(), initialIdentityCounts);
  });

  await test("invalid contacts, token changes, expired capabilities and foreign scopes never resolve", async () => {
    for (const patch of [
      { name: "\u0000Invalid" },
      { name: "" },
      { email: "not an email" },
      { phone: "07700900199" },
    ])
      await assert.rejects(
        () => g.session(guestTokenHash(JSON.stringify(patch)), patch),
        /guest_details_invalid|invalid byte sequence/,
      );
    await assert.rejects(() => g.session("not-a-hash"), /guest_details_invalid/);
    await assert.rejects(
      () => g.session(guestHash, { name: "A different customer" }),
      /guest_session_invalid/,
    );
    assert.equal(await g.resolve(guestTokenHash("wrong secret")), null);
    assert.equal(await g.resolve(guestHash, { tenantId: id(18500) }), null);
    assert.equal(await g.resolve(guestHash, { locationId: id(18501) }), null);
    await assert.rejects(() => g.session(otherHash, { tenantId: id(18500) }), /guest_unavailable/);
    await g.session(otherHash, {
      name: "Other guest",
      email: "other@example.invalid",
      phone: "+447700900188",
    });
  });

  let guestQuote;
  const detailedLines = [{ ...f.line, quantity: 3 }];
  const detailedPacking = {
    version: 1,
    separateBags: true,
    cutleryRequested: true,
    bags: [1, 2, 3].map((number) => ({ number, allocations: [{ lineId: "line-1", quantity: 1 }] })),
  };
  await test("guest gets canonical 30% opening prices and numbered packing with no loyalty eligibility", async () => {
    guestQuote = await g.quote(guestHash, { lines: detailedLines, packing: detailedPacking });
    assert.equal(guestQuote.grossPence, 1197);
    assert.equal(guestQuote.discountPence, 359);
    assert.equal(guestQuote.totalPence, 838);
    assert.equal(guestQuote.guestOrder, true);
    assert.equal(guestQuote.loyaltyEligible, false);
    assert.deepEqual(guestQuote.packingPlan, detailedPacking);
    assert.equal(guestQuote.lines[0].base_unit_pence, 399);
    const row = (
      await db.query(
        "select customer_id,guest_id from mealdeck_private.checkout_quotes where id=$1",
        [guestQuote.quoteId],
      )
    ).rows[0];
    assert.equal(row.customer_id, null);
    assert.equal(row.guest_id, guest.guestId);
  });

  await test("registered member pricing and mandatory verification remain unchanged", async () => {
    const quote = await f.quote();
    assert.equal(quote.totalPence, 279);
    assert.equal(quote.discountPence, 120);
    assert.equal(quote.guestOrder, false);
    assert.equal(quote.loyaltyEligible, undefined);
    await assert.rejects(() => f.quote({ actor: f.unverified }), /registration_required/);
    await assert.rejects(() => f.quote({ actor: guest.guestId }), /registration_required/);
  });

  await test("guest packing, vehicle and delivery validation share the same canonical guards", async () => {
    await assert.rejects(() => g.quote(guestHash, { fulfilment: "delivery" }), /unavailable/);
    await assert.rejects(() => g.quote(guestHash, { fulfilment: "curbside" }), /vehicle_required/);
    await assert.rejects(
      () => g.quote(guestHash, { packing: { ...detailedPacking, bags: [] } }),
      /invalid_packing/,
    );
    await assert.rejects(
      () => g.quote(guestHash, { lines: detailedLines, packing: f.pack([f.line]) }),
      /incomplete_packing/,
    );
    const kerbside = await g.quote(guestHash, {
      fulfilment: "curbside",
      vehicle: { make: "VW", colour: "Blue", registrationLast4: "4ABC" },
    });
    assert.equal(kerbside.fulfilment, "curbside");
  });

  await test("guest cannot pay stale prices or change the quoted identity", async () => {
    await db.query("update public.menu_items set price_pence=449 where tenant_id=$1 and sku=$2", [
      f.tenantId,
      f.ace.id,
    ]);
    await assert.rejects(() => g.prepare(guestHash, guestQuote.quoteId), /price_changed/);
    await db.query("update public.menu_items set price_pence=399 where tenant_id=$1 and sku=$2", [
      f.tenantId,
      f.ace.id,
    ]);
    await assert.rejects(() => g.prepare(otherHash, guestQuote.quoteId), /quote_unavailable/);
    await assert.rejects(() => f.prepare(guestQuote.quoteId), /quote_unavailable/);
    await assert.rejects(
      () => g.prepare(guestHash, guestQuote.quoteId, { locationId: id(18501) }),
      /guest_session_invalid/,
    );
  });

  let guestOrder;
  await test("guest preparation is idempotent, keeps contact snapshots and cannot masquerade as a member", async () => {
    const attemptId = id(17500);
    guestOrder = await g.prepare(guestHash, guestQuote.quoteId, { attemptId });
    assert.equal(
      (await g.prepare(guestHash, guestQuote.quoteId, { attemptId })).orderId,
      guestOrder.orderId,
    );
    const order = (
      await db.query(
        "select customer_id,customer_name,customer_email,customer_phone,guest_checkout,packing_plan from public.orders where id=$1",
        [guestOrder.orderId],
      )
    ).rows[0];
    assert.equal(order.customer_id, null);
    assert.equal(order.guest_checkout, true);
    assert.equal(order.customer_email, "guest@example.invalid");
    assert.deepEqual(order.packing_plan, detailedPacking);
    assert.equal((await g.receipt(guestHash, guestOrder.orderId)).verifiedPaid, false);
    await assert.rejects(
      () =>
        db.query("update public.orders set customer_id=$1 where id=$2", [
          f.customer,
          guestOrder.orderId,
        ]),
      /guest_order_has_no_member/,
    );
    await assert.rejects(
      () =>
        db.query("update mealdeck_private.checkout_quotes set customer_id=$1 where id=$2", [
          f.customer,
          guestQuote.quoteId,
        ]),
      /checkout_quote_one_identity/,
    );
    await assert.rejects(
      () =>
        db.query("update mealdeck_private.stripe_orders set customer_id=$1 where order_id=$2", [
          f.customer,
          guestOrder.orderId,
        ]),
      /stripe_order_one_identity/,
    );
  });

  await test("another guest, member or kitchen cannot read a receipt by knowing the order UUID", async () => {
    await assert.rejects(() => g.receipt(otherHash, guestOrder.orderId), /order_unavailable/);
    await assert.rejects(
      () => g.receipt(guestHash, guestOrder.orderId, { tenantId: id(18500) }),
      /guest_session_invalid/,
    );
    await assert.rejects(
      () =>
        f.service(() =>
          db.query("select public.mealdeck_customer_order_receipt($1,$2)", [
            guestOrder.orderId,
            f.customer,
          ]),
        ),
      /order_unavailable/,
    );
    const memberQuote = await f.quote();
    const memberOrder = await f.prepare(memberQuote.quoteId, { attemptId: id(17501) });
    await assert.rejects(() => g.receipt(guestHash, memberOrder.orderId), /order_unavailable/);
  });

  await test("only verified provider capture releases a guest order and replay never duplicates kitchen tickets", async () => {
    assert.equal(
      (
        await db.query("select count(*)::int n from public.kds_tickets where order_id=$1", [
          guestOrder.orderId,
        ])
      ).rows[0].n,
      0,
    );
    await f.bind(guestOrder.orderId, "cs_test_guestone");
    const event = { event: "evt_guestone", intent: "pi_guestone", session: "cs_test_guestone" };
    await f.reconcile(guestOrder, event);
    const receipt = await g.receipt(guestHash, guestOrder.orderId);
    assert.equal(receipt.verifiedPaid, true);
    assert.equal(receipt.guestOrder, true);
    assert.equal(receipt.loyaltyEligible, false);
    assert.match(receipt.handoffCode, /^\d{4}$/);
    const count = (
      await db.query("select count(*)::int n from public.kds_tickets where order_id=$1", [
        guestOrder.orderId,
      ])
    ).rows[0].n;
    assert.ok(count > 0);
    await f.reconcile(guestOrder, event);
    assert.equal(
      (
        await db.query("select count(*)::int n from public.kds_tickets where order_id=$1", [
          guestOrder.orderId,
        ])
      ).rows[0].n,
      count,
    );
    assert.deepEqual(await identityCounts(), initialIdentityCounts);
  });

  await test("staff acceptance enqueues one guest receipt with all three bags and cutlery intact", async () => {
    const board = await asActor(
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
    const card = board.orders.find((entry) => entry.order_id === guestOrder.orderId);
    assert.ok(card);
    const accept = () =>
      asActor(db, f.owner, () =>
        db.query("select public.mealdeck_ops_kds_accept_order($1,$2,$3,$4)", [
          f.tenantId,
          f.locationId,
          guestOrder.orderId,
          card.version,
        ]),
      );
    await accept();
    await accept();
    const jobs = (
      await db.query("select receipt from mealdeck_private.receipt_jobs where order_id=$1", [
        guestOrder.orderId,
      ])
    ).rows;
    assert.equal(jobs.length, 1);
    assert.deepEqual(jobs[0].receipt.packingPlan, detailedPacking);
    assert.equal(jobs[0].receipt.cutleryRequested, true);
    assert.equal(jobs[0].receipt.customerName, "Guest Customer");
  });

  await test("identical member email in a guest contact never links history, points or promotional preferences", async () => {
    const memberEmail = (await db.query("select email from auth.users where id=$1", [f.customer]))
      .rows[0].email;
    const sameEmailHash = guestTokenHash("different capability same member email");
    await g.session(sameEmailHash, { email: memberEmail, phone: "+447700900177" });
    const quote = await g.quote(sameEmailHash);
    const order = await g.prepare(sameEmailHash, quote.quoteId);
    const history = await asActor(
      db,
      f.customer,
      async () =>
        (await db.query("select public.mealdeck_customer_orders() result")).rows[0].result,
    );
    assert.ok(!history.orders.some((entry) => entry.orderId === order.orderId));
    assert.deepEqual(await identityCounts(), initialIdentityCounts);
    assert.equal((await g.receipt(sameEmailHash, order.orderId)).loyaltyEligible, false);
  });

  await test("closing time rejects new quotes and prepare retries but preserves already-started payment completion", async () => {
    const quote = await g.quote(otherHash);
    const lateOrder = await g.prepare(otherHash, quote.quoteId, { attemptId: id(17505) });
    await f.bind(lateOrder.orderId, "cs_test_guestlate");
    await setGuestFixtureClock(db, "2026-11-08T23:00:00Z");
    assert.equal((await status()).guestCheckoutEligible, false);
    await assert.rejects(() => g.quote(guestHash), /guest_unavailable/);
    await assert.rejects(
      () => g.prepare(otherHash, quote.quoteId, { attemptId: id(17505) }),
      /guest_unavailable/,
    );
    await assert.rejects(() => f.quote(), /outside_opening_hours/);
    await f.reconcile(lateOrder, {
      event: "evt_guestlate",
      intent: "pi_guestlate",
      session: "cs_test_guestlate",
    });
    assert.equal((await g.receipt(otherHash, lateOrder.orderId)).verifiedPaid, true);
    assert.equal((await g.receipt(guestHash, guestOrder.orderId)).verifiedPaid, true);
    await db.exec("update mealdeck_private.checkout_settings set checkout_enabled=false");
    assert.equal((await g.receipt(guestHash, guestOrder.orderId)).verifiedPaid, true);
    await db.exec("update mealdeck_private.checkout_settings set checkout_enabled=true");
  });

  await test("after the first three days members use configured checkout without the opening discount and guests stay closed", async () => {
    await setGuestFixtureClock(db, "2026-11-09T10:00:00Z");
    const state = await status();
    assert.equal(state.channelOpen, true);
    assert.equal(state.guestCheckoutEligible, false);
    assert.equal(state.openingOffer.status, "ended");
    const quote = await f.quote();
    assert.equal(quote.discountPence, 0);
    assert.equal(quote.totalPence, 399);
    await assert.rejects(() => g.session(guestTokenHash("post-weekend")), /guest_unavailable/);
    await assert.rejects(() => g.quote(guestHash), /guest_unavailable/);
    assert.equal((await g.receipt(guestHash, guestOrder.orderId)).verifiedPaid, true);
    await setGuestFixtureClock(db, "2026-11-06T16:00:00Z");
  });

  await test("session expiry and signout revoke receipt and checkout access without affecting member sessions", async () => {
    await db.query(
      "update mealdeck_private.guest_sessions set created_at=now()-interval '31 days',expires_at=now()-interval '1 day' where token_hash=$1",
      [otherHash],
    );
    assert.equal(await g.resolve(otherHash), null);
    await assert.rejects(() => g.quote(otherHash), /guest_session_invalid/);
    await assert.rejects(() => g.receipt(otherHash, guestOrder.orderId), /guest_session_invalid/);
    assert.equal(await g.end(guestHash), true);
    assert.equal(await g.end(guestHash), true);
    assert.equal(await g.resolve(guestHash), null);
    await assert.rejects(() => g.receipt(guestHash, guestOrder.orderId), /guest_session_invalid/);
    assert.ok((await f.quote()).quoteId);
  });

  await test("session and quote abuse limits apply per scoped guest identity", async () => {
    for (let index = 0; index < 6; index++) {
      await g.session(guestTokenHash("rate-session-" + index), {
        email: "rate@example.invalid",
        phone: "+447700900166",
      });
    }
    await assert.rejects(
      () =>
        g.session(guestTokenHash("rate-session-7"), {
          email: "rate@example.invalid",
          phone: "+447700900166",
        }),
      /retry_later/,
    );
    const token = guestTokenHash("rate-quote-browser");
    await g.session(token, { email: "quote-rate@example.invalid", phone: "+447700900155" });
    for (let index = 0; index < 30; index++) await g.quote(token);
    await assert.rejects(() => g.quote(token), /retry_later/);
  });

  if (db.native) {
    await test("competing service connections share one guest attempt and one reserved handoff code", async () => {
      const token = guestTokenHash("native-concurrency-guest");
      await g.session(token, { email: "concurrency@example.invalid", phone: "+447700900144" });
      const quote = await g.quote(token);
      const clients = [new pg.Client(db.config), new pg.Client(db.config)];
      await Promise.all(clients.map((client) => client.connect()));
      try {
        await Promise.all(
          clients.map(async (client) => {
            await client.query("set role service_role");
            await client.query("select set_config('request.jwt.claim.role','service_role',false)");
          }),
        );
        const orders = await Promise.all(
          clients.map(
            async (client) =>
              (
                await client.query(
                  "select public.mealdeck_prepare_guest_stripe_order($1,$2,$3,$4,$5,'acct_Fixture',false) result",
                  [f.tenantId, f.locationId, token, quote.quoteId, id(17901)],
                )
              ).rows[0].result,
          ),
        );
        assert.equal(orders[0].orderId, orders[1].orderId);
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from mealdeck_private.stripe_orders where quote_id=$1",
              [quote.quoteId],
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from public.orders where id=$1 and handoff_code_reserved",
              [orders[0].orderId],
            )
          ).rows[0].n,
          1,
        );
      } finally {
        await Promise.all(clients.map((client) => client.end()));
      }
    });
  }

  console.log("Guest checkout: " + checks + " behavioral groups passed.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
