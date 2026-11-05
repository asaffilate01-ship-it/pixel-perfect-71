import assert from "node:assert/strict";
import pg from "pg";
import { asActor, createDatabase, id } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";
import {
  guestFixtureMethods,
  guestTokenHash,
  setGuestFixtureClock,
} from "./guest-checkout-fixture.mjs";
import { buildKitchenPrinterSql } from "../../deploy/mealdeck/kitchen-printer.mjs";
import { buildGuestCheckoutSql } from "../../deploy/mealdeck/guest-checkout.mjs";
import {
  buildKitchenAvailabilitySql,
  buildManagedKitchenAvailabilitySql,
} from "../../deploy/mealdeck/kitchen-availability.mjs";

const db = await createDatabase(process.argv.includes("--native"));
let checks = 0;
async function test(label, run) {
  try {
    await run();
    console.log("PASS kitchen availability " + ++checks + ": " + label);
  } catch (error) {
    console.error("FAIL kitchen availability: " + label + ": " + error.message);
    throw error;
  }
}

try {
  console.log("Engine: " + (await db.query("select version() as version")).rows[0].version);
  const f = await setupStripeCheckoutFixture(db);
  await db.exec(buildKitchenPrinterSql());
  await db.exec(buildGuestCheckoutSql());
  const otherLocation = id(19001),
    foreignTenant = id(19002),
    foreignLocation = id(19003);
  await db.query(
    "insert into public.tenant_locations(id,tenant_id,name,slug) values($1,$2,'Future kitchen','future-kitchen')",
    [otherLocation, f.tenantId],
  );
  await db.query(
    "insert into mealdeck_private.checkout_settings(tenant_id,location_id,checkout_enabled,collection_estimate_minutes) values($1,$2,false,35)",
    [f.tenantId, otherLocation],
  );
  await db.query(
    "insert into public.tenants(id,name,slug,legal_name) values($1,'Unrelated business','unrelated-business','Unrelated Business Ltd')",
    [foreignTenant],
  );
  await db.query(
    "insert into public.tenant_locations(id,tenant_id,name,slug) values($1,$2,'Unrelated kitchen','shared-kitchen')",
    [foreignLocation, foreignTenant],
  );
  const stableRoutines = () =>
    db.query(`select n.nspname,p.proname,pg_get_functiondef(p.oid) definition,p.proacl::text acl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='mealdeck_private' and p.proname in
      ('launch_window','launch_window_at','create_checkout_quote_for_identity','prepare_stripe_order_for_identity'))
    or (n.nspname='public' and p.proname in
      ('mealdeck_reconcile_stripe_event','mealdeck_bind_stripe_session','mealdeck_guest_order_receipt',
       'mealdeck_customer_order_receipt','mealdeck_ops_kds_accept_order')) order by n.nspname,p.proname`);
  const originalRoutines = (await stableRoutines()).rows;

  await test("atomic installation preserves enabled and disabled kitchens without changing payment, clock or receipt routines", async () => {
    const managed = buildManagedKitchenAvailabilitySql({
      runnerOwnsTransaction: true,
      singleMigration: true,
    });
    for (const options of [
      undefined,
      {},
      { runnerOwnsTransaction: true },
      { runnerOwnsTransaction: true, singleMigration: true, partial: true },
    ]) {
      assert.throws(() => buildManagedKitchenAvailabilitySql(options), /one runner-owned/);
    }
    await db.exec("begin");
    await db.exec(managed);
    await db.exec("rollback");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from information_schema.columns where table_schema='mealdeck_private' and table_name='checkout_settings' and column_name='availability_state'",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select to_regprocedure('public.mealdeck_ops_update_checkout_availability(uuid,uuid,text,integer)') value",
        )
      ).rows[0].value,
      null,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from pg_trigger where tgname in ('mealdeck_quote_availability_admission','mealdeck_payment_availability_admission')",
        )
      ).rows[0].n,
      0,
    );
    await db.exec(buildKitchenAvailabilitySql());
    assert.deepEqual(
      (
        await db.query(
          "select checkout_enabled,availability_state,collection_estimate_minutes from mealdeck_private.checkout_settings where location_id=$1",
          [f.locationId],
        )
      ).rows[0],
      { checkout_enabled: true, availability_state: "online", collection_estimate_minutes: 25 },
    );
    assert.deepEqual(
      (
        await db.query(
          "select checkout_enabled,availability_state,collection_estimate_minutes from mealdeck_private.checkout_settings where location_id=$1",
          [otherLocation],
        )
      ).rows[0],
      { checkout_enabled: false, availability_state: "closed", collection_estimate_minutes: 35 },
    );
    assert.deepEqual((await stableRoutines()).rows, originalRoutines);
    assert.equal((await db.query("select count(*)::int n from public.orders")).rows[0].n, 0);
  });

  const status = async (tenant = f.tenantId, location = f.locationId) =>
    (
      await db.query("select public.mealdeck_online_checkout_status($1,$2) result", [
        tenant,
        location,
      ])
    ).rows[0].result;
  const savedSettings = (value) => ({
    enabled: value.enabled,
    availabilityState: value.availabilityState,
    openingStartDate: value.openingStartDate,
    collectionEstimateMinutes: value.collectionEstimateMinutes,
  });
  const settings = () =>
    asActor(
      db,
      f.owner,
      async () =>
        (
          await db.query("select public.mealdeck_ops_checkout_settings($1,$2) result", [
            f.tenantId,
            f.locationId,
          ])
        ).rows[0].result,
    ).then(savedSettings);
  const setState = (state, estimate, options = {}) =>
    asActor(
      db,
      options.actor ?? f.owner,
      async () =>
        (
          await db.query(
            "select public.mealdeck_ops_update_checkout_availability($1,$2,$3,$4) result",
            [options.tenant ?? f.tenantId, options.location ?? f.locationId, state, estimate],
          )
        ).rows[0].result,
    ).then(savedSettings);
  const legacy = (enabled, estimate, date = null) =>
    asActor(
      db,
      f.owner,
      async () =>
        (
          await db.query(
            "select public.mealdeck_ops_update_checkout_settings($1,$2,$3,$4,$5) result",
            [f.tenantId, f.locationId, enabled, date, estimate],
          )
        ).rows[0].result,
    ).then(savedSettings);
  const setEstimate = (estimate, actor = f.owner) =>
    asActor(
      db,
      actor,
      async () =>
        (
          await db.query("select public.mealdeck_ops_update_collection_estimate($1,$2,$3) result", [
            f.tenantId,
            f.locationId,
            estimate,
          ])
        ).rows[0].result,
    ).then(savedSettings);
  const audit = async () =>
    (
      await db.query(
        "select id,actor_id,previous_value,next_value,action from public.mealdeck_ops_audit_log where tenant_id=$1 and action in ('checkout.availability','checkout.settings','checkout.estimate') order by id",
        [f.tenantId],
      )
    ).rows;
  const quoteRow = async (quote) =>
    (
      await db.query(
        "select expires_at::text,expires_at<=now() expired,collection_estimate_minutes from mealdeck_private.checkout_quotes where id=$1",
        [quote.quoteId],
      )
    ).rows[0];
  await setGuestFixtureClock(db, "2026-11-06T16:00:00Z");
  const g = guestFixtureMethods(db, f),
    guestHash = guestTokenHash("availability-disposable-guest-capability");
  await g.session(guestHash);

  await test("only authenticated RPC callers can change settings and no API role gains private table or helper access", async () => {
    const permissions = (
      await db.query(`select n.nspname,p.proname,p.prosecdef,p.proconfig,
      has_function_privilege('anon',p.oid,'EXECUTE') anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
      has_function_privilege('service_role',p.oid,'EXECUTE') service
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where (n.nspname='public' and p.proname in ('mealdeck_ops_update_checkout_availability','mealdeck_ops_update_checkout_settings','mealdeck_ops_checkout_settings','mealdeck_ops_update_collection_estimate'))
      or (n.nspname='mealdeck_private' and p.proname in ('assert_checkout_availability_manager','update_checkout_availability','guard_quote_availability','guard_payment_preparation_availability'))`)
    ).rows;
    assert.equal(permissions.length, 8);
    for (const row of permissions) {
      assert.equal(row.anon, false);
      assert.equal(row.service, false);
      assert.equal(row.authenticated, row.nspname === "public");
      assert.equal(row.prosecdef, true);
      assert.ok(row.proconfig.includes('search_path=""'));
    }
    const tables = (
      await db.query(`select c.relname,c.relrowsecurity,
      has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anon,
      has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') authenticated,
      has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') service
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='mealdeck_private' and c.relname in ('checkout_settings','checkout_quotes','stripe_orders')`)
    ).rows;
    assert.equal(tables.length, 3);
    assert.ok(
      tables.every((row) => row.relrowsecurity && !row.anon && !row.authenticated && !row.service),
    );
    for (const role of ["anon", "service_role"]) {
      await assert.rejects(
        () =>
          asActor(
            db,
            f.owner,
            () =>
              db.query(
                "select public.mealdeck_ops_update_checkout_availability($1,$2,'closed',null)",
                [f.tenantId, f.locationId],
              ),
            role,
          ),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          asActor(
            db,
            f.owner,
            () =>
              db.query("select public.mealdeck_ops_update_collection_estimate($1,$2,30)", [
                f.tenantId,
                f.locationId,
              ]),
            role,
          ),
        /permission denied/,
      );
    }
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.equal(
        (await asActor(db, role === "authenticated" ? f.customer : null, () => status(), role))
          .kitchen.state,
        "online",
      );
    }
  });

  const actors = {
    admin: id(19101),
    finance: id(19102),
    kitchen: id(19103),
    disabled: id(19104),
    banned: id(19105),
    deleted: id(19106),
    anonymous: id(19107),
    denied: id(19108),
    elsewhere: id(19109),
  };
  for (const [kind, actor] of Object.entries(actors)) {
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at,is_anonymous,deleted_at,banned_until,raw_user_meta_data) values($1,$2,now(),$3,case when $4 then now() else null end,case when $5 then now()+interval \'1 day\' else null end,\'{"role":"owner","finance.manage":true}\')',
      [
        actor,
        `availability-${kind}@example.invalid`,
        kind === "anonymous",
        kind === "deleted",
        kind === "banned",
      ],
    );
    await db.query(
      "insert into public.mealdeck_ops_staff_access(tenant_id,location_id,user_id,role,enabled,grant_permissions,deny_permissions) values($1,$2,$3,$4,$5,$6,$7)",
      [
        f.tenantId,
        kind === "elsewhere" ? otherLocation : f.locationId,
        actor,
        ["finance", "kitchen"].includes(kind) ? kind : "admin",
        kind !== "disabled",
        kind === "kitchen" ? ["finance.manage"] : [],
        kind === "denied" ? ["finance.manage"] : [],
      ],
    );
  }
  await db.query(
    "insert into public.mealdeck_ops_staff_access(tenant_id,location_id,user_id,role) values($1,$2,$3,'admin')",
    [f.tenantId, f.locationId, f.unverified],
  );

  await test("verified owner/admin plus finance permission and exact installed kitchen scope are required", async () => {
    const before = await audit();
    for (const actor of [
      f.customer,
      f.unverified,
      ...Object.entries(actors)
        .filter(([kind]) => kind !== "admin")
        .map(([, actor]) => actor),
    ]) {
      await assert.rejects(() => setState("closed", null, { actor }), /mealdeck_ops_forbidden/);
      await assert.rejects(() => setEstimate(30, actor), /mealdeck_ops_forbidden/);
    }
    await assert.rejects(
      () => setState("busy", 40, { actor: actors.admin, location: otherLocation }),
      /mealdeck_ops_forbidden/,
    );
    await assert.rejects(
      () => setState("busy", 40, { location: otherLocation }),
      /location_unavailable/,
    );
    await assert.rejects(
      () => setState("closed", null, { tenant: foreignTenant, location: foreignLocation }),
      /mealdeck_ops_forbidden/,
    );
    await db.query(
      "insert into public.mealdeck_ops_staff_access(tenant_id,location_id,user_id,role) values($1,$2,$3,'owner')",
      [foreignTenant, foreignLocation, f.owner],
    );
    await assert.rejects(
      () => setState("online", 25, { tenant: foreignTenant, location: foreignLocation }),
      /location_unavailable/,
    );
    await db.query("update public.tenant_locations set active=false where id=$1", [f.locationId]);
    await assert.rejects(() => setState("closed", null), /location_unavailable/);
    await db.query("update public.tenant_locations set active=true where id=$1", [f.locationId]);
    assert.deepEqual(await audit(), before);
    assert.equal((await setState("busy", 40, { actor: actors.admin })).availabilityState, "busy");
    assert.equal((await audit()).at(-1).actor_id, actors.admin);
    await setState("online", 25);
  });

  await test("four states, retained and explicit stopped-state estimates, and scoped audit values match the saved setting", async () => {
    for (const [state, submitted, expected] of [
      ["busy", 45, 45],
      ["paused", null, 45],
      ["closed", null, 45],
      ["closed", 35, 35],
      ["paused", 30, 30],
      ["online", 25, 25],
    ]) {
      const prior = await settings(),
        saved = await setState(state, submitted),
        current = await status();
      assert.equal(saved.availabilityState, state);
      assert.equal(saved.enabled, ["online", "busy"].includes(state));
      assert.equal(saved.collectionEstimateMinutes, expected);
      assert.deepEqual(await settings(), saved);
      assert.deepEqual(current.kitchen, { state, collectionEstimateMinutes: expected });
      assert.equal(current.channelOpen, saved.enabled);
      assert.equal(current.guestCheckoutEligible, saved.enabled);
      const entry = (await audit()).at(-1);
      assert.equal(entry.actor_id, f.owner);
      assert.equal(entry.previous_value.availability_state, prior.availabilityState);
      assert.equal(entry.next_value.availabilityState, state);
      assert.equal(entry.next_value.collectionEstimateMinutes, expected);
      assert.equal(entry.action, "checkout.availability");
    }
    assert.deepEqual(
      (
        await db.query(
          "select availability_state,collection_estimate_minutes from mealdeck_private.checkout_settings where location_id=$1",
          [otherLocation],
        )
      ).rows[0],
      { availability_state: "closed", collection_estimate_minutes: 35 },
    );
    assert.equal((await status(f.tenantId, otherLocation)).kitchen, null);
    assert.equal((await status(foreignTenant, foreignLocation)).kitchen, null);
  });

  await test("invalid states and ETAs cannot mutate settings or audit; consistency constraints protect direct SQL", async () => {
    const before = await settings(),
      entries = await audit();
    for (const state of ["online", "busy"])
      await assert.rejects(() => setState(state, null), /collection_estimate_required/);
    for (const state of ["online", "busy", "paused", "closed"])
      for (const eta of [4, 181])
        await assert.rejects(() => setState(state, eta), /collection_estimate_required/);
    for (const state of [null, "", "Busy", "pause", "unknown"])
      await assert.rejects(() => setState(state, 25), /availability_invalid/);
    await assert.rejects(
      () =>
        db.query(
          "update mealdeck_private.checkout_settings set checkout_enabled=false where location_id=$1",
          [f.locationId],
        ),
      /checkout_availability_enabled_consistency/,
    );
    await assert.rejects(
      () =>
        db.query(
          "update mealdeck_private.checkout_settings set availability_state='unknown',checkout_enabled=false where location_id=$1",
          [f.locationId],
        ),
      /checkout_availability_state/,
    );
    assert.deepEqual(await settings(), before);
    assert.deepEqual(await audit(), entries);
  });

  await test("estimate-only saves retain another admin's latest Pause and default a missing setting to Closed", async () => {
    const quote = await f.quote();
    const staleBrowser = await settings();
    assert.equal(staleBrowser.availabilityState, "online");
    await setState("paused", null, { actor: actors.admin });
    const saved = await setEstimate(50);
    assert.equal(saved.availabilityState, "paused");
    assert.equal(saved.enabled, false);
    assert.equal(saved.collectionEstimateMinutes, 50);
    assert.equal((await quoteRow(quote)).expired, true);
    assert.equal((await status()).channelOpen, false);
    const entry = (await audit()).at(-1);
    assert.equal(entry.action, "checkout.estimate");
    assert.equal(entry.previous_value.availability_state, "paused");
    assert.equal(entry.next_value.availabilityState, "paused");
    assert.equal(entry.next_value.collectionEstimateMinutes, 50);
    const entries = await audit();
    for (const eta of [null, 4, 181])
      await assert.rejects(() => setEstimate(eta), /collection_estimate_required/);
    assert.deepEqual(await audit(), entries);
    for (const eta of [5, 180]) {
      const result = await setEstimate(eta, actors.admin);
      assert.equal(result.availabilityState, "paused");
      assert.equal(result.collectionEstimateMinutes, eta);
    }
    await db.exec("begin");
    await db.query(
      "delete from mealdeck_private.checkout_settings where tenant_id=$1 and location_id=$2",
      [f.tenantId, f.locationId],
    );
    assert.equal((await status()).kitchen, null);
    const initial = await setEstimate(35);
    assert.equal(initial.availabilityState, "closed");
    assert.equal(initial.enabled, false);
    assert.equal(initial.collectionEstimateMinutes, 35);
    await db.exec("rollback");
    assert.equal((await settings()).availabilityState, "paused");
    await setState("online", 25);
  });

  await test("Busy uses the actual pickup estimate without a surcharge or change to prices, offer, packing or guest loyalty", async () => {
    const online = await f.quote();
    await setState("busy", 55);
    const busy = await f.quote(),
      guest = await g.quote(guestHash);
    for (const quote of [busy, guest]) {
      assert.equal(quote.collectionEstimateMinutes, 55);
      for (const key of [
        "grossPence",
        "discountPence",
        "totalPence",
        "currency",
        "lines",
        "packingPlan",
      ])
        assert.deepEqual(quote[key], online[key]);
    }
    assert.equal(busy.grossPence, 399);
    assert.equal(busy.discountPence, 120);
    assert.equal(busy.totalPence, 279);
    assert.equal(guest.loyaltyEligible, false);
    assert.equal((await status()).channelOpen, true);
  });

  await test("Online and Busy never bypass launch hours, channel readiness or catalogue approval", async () => {
    for (const state of ["online", "busy"]) {
      await setState(state, 30);
      for (const time of [
        "2026-11-06T14:59:59Z",
        "2026-11-06T23:00:00Z",
        "2026-11-07T12:59:59Z",
        "2026-11-08T23:00:00Z",
      ]) {
        await setGuestFixtureClock(db, time);
        assert.equal((await status()).channelOpen, false);
        assert.equal((await status()).guestCheckoutEligible, false);
        await assert.rejects(() => f.quote(), /outside_opening_hours/);
        await assert.rejects(() => g.quote(guestHash), /guest_unavailable/);
      }
      await setGuestFixtureClock(db, "2026-11-06T16:00:00Z");
      assert.equal((await status()).channelOpen, true);
    }
    await db.query(
      "update public.ordering_channels set enabled=false where tenant_id=$1 and location_id=$2 and channel_key='mealdeck'",
      [f.tenantId, f.locationId],
    );
    assert.equal((await status()).channelOpen, false);
    await assert.rejects(() => f.quote(), /checkout_unavailable/);
    await setState("online", 25);
    assert.equal((await status()).channelOpen, false);
    await db.query(
      "update public.ordering_channels set enabled=true where tenant_id=$1 and location_id=$2 and channel_key='mealdeck'",
      [f.tenantId, f.locationId],
    );
    await db.exec("begin");
    await db.query(
      "delete from public.mealdeck_ops_audit_log where tenant_id=$1 and action='catalogue.menu_revision'",
      [f.tenantId],
    );
    assert.equal((await status()).channelOpen, false);
    await db.exec("rollback");
    await setGuestFixtureClock(db, "2026-11-09T10:00:00Z");
    assert.equal((await status()).channelOpen, true);
    assert.equal((await status()).guestCheckoutEligible, false);
    assert.equal((await f.quote()).discountPence, 0);
    await setState("paused", null);
    assert.equal((await status()).channelOpen, false);
    await setGuestFixtureClock(db, "2026-11-06T16:00:00Z");
    assert.equal(
      (await status()).channelOpen,
      false,
      "time changes never auto-resume a paused kitchen",
    );
    await setState("online", 25);
  });

  let preparedMember, preparedGuest, memberQuote, guestQuote;
  await test("ETA edits expire only unprepared member and guest quotes while preserving prepared sessions and immutable estimates", async () => {
    const unpreparedMember = await f.quote(),
      unpreparedGuest = await g.quote(guestHash);
    memberQuote = await f.quote();
    guestQuote = await g.quote(guestHash);
    preparedMember = await f.prepare(memberQuote.quoteId, { attemptId: id(19201) });
    preparedGuest = await g.prepare(guestHash, guestQuote.quoteId, { attemptId: id(19202) });
    const memberBefore = await quoteRow(memberQuote),
      guestBefore = await quoteRow(guestQuote);
    await setState("busy", 60);
    assert.equal((await quoteRow(unpreparedMember)).expired, true);
    assert.equal((await quoteRow(unpreparedGuest)).expired, true);
    assert.deepEqual(await quoteRow(memberQuote), memberBefore);
    assert.deepEqual(await quoteRow(guestQuote), guestBefore);
    assert.equal(memberBefore.collection_estimate_minutes, 25);
    assert.equal(guestBefore.collection_estimate_minutes, 25);
    await assert.rejects(
      () => f.prepare(unpreparedMember.quoteId, { attemptId: id(19203) }),
      /quote_expired/,
    );
    await assert.rejects(() => g.prepare(guestHash, unpreparedGuest.quoteId), /quote_expired/);
    assert.equal(
      (await f.prepare(memberQuote.quoteId, { attemptId: id(19201) })).orderId,
      preparedMember.orderId,
    );
    assert.equal(
      (await g.prepare(guestHash, guestQuote.quoteId, { attemptId: id(19202) })).orderId,
      preparedGuest.orderId,
    );
    assert.equal((await f.quote()).collectionEstimateMinutes, 60);
    assert.equal((await g.quote(guestHash)).collectionEstimateMinutes, 60);
    assert.ok((await audit()).at(-1).next_value.expiredUnpreparedQuotes >= 2);
  });

  await test("both stopped states reject new quotes, new preparations and retries while existing provider payments, receipts and kitchen acceptance continue", async () => {
    const member = await f.quote(),
      guest = await g.quote(guestHash);
    for (const state of ["paused", "closed"]) {
      await setState(state, null);
      await assert.rejects(() => f.quote(), /checkout_unavailable/);
      await assert.rejects(() => g.quote(guestHash), /checkout_unavailable/);
      await assert.rejects(
        () => f.prepare(member.quoteId, { attemptId: id(19205) }),
        /checkout_unavailable/,
      );
      await assert.rejects(() => g.prepare(guestHash, guest.quoteId), /checkout_unavailable/);
      await assert.rejects(
        () => f.prepare(memberQuote.quoteId, { attemptId: id(19201) }),
        /checkout_unavailable/,
      );
      await assert.rejects(
        () => g.prepare(guestHash, guestQuote.quoteId, { attemptId: id(19202) }),
        /checkout_unavailable/,
      );
    }
    await f.bind(preparedMember.orderId, "cs_test_availabilitymember");
    await f.bind(preparedGuest.orderId, "cs_test_availabilityguest");
    for (const [order, key] of [
      [preparedMember, "member"],
      [preparedGuest, "guest"],
    ]) {
      const event = {
        event: "evt_availability" + key,
        intent: "pi_availability" + key,
        session: "cs_test_availability" + key,
      };
      await f.reconcile(order, event);
      await f.reconcile(order, event);
    }
    const memberReceipt = await f.service(
      async () =>
        (
          await db.query("select public.mealdeck_customer_order_receipt($1,$2) result", [
            preparedMember.orderId,
            f.customer,
          ])
        ).rows[0].result,
    );
    const guestReceipt = await g.receipt(guestHash, preparedGuest.orderId);
    assert.equal(memberReceipt.verifiedPaid, true);
    assert.equal(guestReceipt.verifiedPaid, true);
    assert.equal(memberReceipt.collectionEstimateMinutes, 25);
    assert.equal(guestReceipt.collectionEstimateMinutes, 25);
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
    for (const order of [preparedMember, preparedGuest]) {
      const card = board.orders.find((row) => row.order_id === order.orderId);
      assert.ok(card);
      for (let retry = 0; retry < 2; retry++)
        await asActor(db, f.owner, () =>
          db.query("select public.mealdeck_ops_kds_accept_order($1,$2,$3,$4)", [
            f.tenantId,
            f.locationId,
            order.orderId,
            card.version,
          ]),
        );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from mealdeck_private.receipt_jobs where order_id=$1",
            [order.orderId],
          )
        ).rows[0].n,
        1,
      );
    }
    assert.equal((await status()).kitchen.state, "closed");
    await setState("online", 25);
  });

  await test("admission guards reject a stale ETA even if a concurrent quote missed invalidation", async () => {
    const stale = await f.quote();
    await setState("busy", 50);
    // Simulate a quote inserted concurrently with the invalidation scan. The
    // INSERT admission guard is the final authority on payment preparation.
    await db.query(
      "update mealdeck_private.checkout_quotes set expires_at=now()+interval '5 minutes' where id=$1",
      [stale.quoteId],
    );
    const orderCount = (await db.query("select count(*)::int n from public.orders")).rows[0].n;
    await assert.rejects(() => f.prepare(stale.quoteId, { attemptId: id(19206) }), /quote_expired/);
    assert.equal(
      (await db.query("select count(*)::int n from public.orders")).rows[0].n,
      orderCount,
      "partial orders and lines roll back when admission fails",
    );
    await assert.rejects(
      () =>
        db.query(
          `insert into mealdeck_private.checkout_quotes(tenant_id,location_id,customer_id,guest_id,fulfilment,vehicle,packing_plan,request_hash,selection,priced_lines,gross_pence,discount_pence,total_pence,opening_start_date,collection_estimate_minutes)
      select tenant_id,location_id,customer_id,guest_id,fulfilment,vehicle,packing_plan,request_hash,selection,priced_lines,gross_pence,discount_pence,total_pence,opening_start_date,collection_estimate_minutes from mealdeck_private.checkout_quotes where id=$1`,
          [stale.quoteId],
        ),
      /quote_expired/,
    );
    await setState("paused", null);
    await assert.rejects(
      () =>
        db.query(
          `insert into mealdeck_private.checkout_quotes(tenant_id,location_id,customer_id,guest_id,fulfilment,vehicle,packing_plan,request_hash,selection,priced_lines,gross_pence,discount_pence,total_pence,opening_start_date,collection_estimate_minutes)
      select tenant_id,location_id,customer_id,guest_id,fulfilment,vehicle,packing_plan,request_hash,selection,priced_lines,gross_pence,discount_pence,total_pence,opening_start_date,50 from mealdeck_private.checkout_quotes where id=$1`,
          [stale.quoteId],
        ),
      /checkout_unavailable/,
    );
    await setState("online", 25);
  });

  await test("legacy callers map true to Online and false to Closed, retain omitted stopped ETA, and cannot change confirmed launch dates", async () => {
    await setState("busy", 45);
    let saved = await legacy(false, null);
    assert.equal(saved.availabilityState, "closed");
    assert.equal(saved.collectionEstimateMinutes, 45);
    saved = await legacy(false, 35, "2026-11-06");
    assert.equal(saved.collectionEstimateMinutes, 35);
    saved = await legacy(true, 30);
    assert.equal(saved.availabilityState, "online");
    assert.equal(saved.enabled, true);
    assert.equal(saved.collectionEstimateMinutes, 30);
    assert.equal(saved.openingStartDate, "2026-11-06");
    assert.equal((await audit()).at(-1).action, "checkout.settings");
    const entries = await audit();
    await assert.rejects(() => legacy(true, 30, "2026-11-07"), /opening_date_fixed/);
    await assert.rejects(() => legacy(true, null), /collection_estimate_required/);
    await assert.rejects(() => legacy(null, 30), /availability_invalid/);
    assert.deepEqual(await audit(), entries);
    assert.deepEqual(await settings(), saved);
  });

  await test("a rolled-back ETA update restores the setting, quote validity and audit as one transaction", async () => {
    const quote = await f.quote(),
      prior = await quoteRow(quote),
      before = await settings(),
      entries = await audit();
    await db.exec("begin");
    await setState("busy", 90);
    assert.equal((await quoteRow(quote)).expired, true);
    assert.equal((await settings()).collectionEstimateMinutes, 90);
    await db.exec("rollback");
    assert.deepEqual(await quoteRow(quote), prior);
    assert.deepEqual(await settings(), before);
    assert.deepEqual(await audit(), entries);
  });

  if (db.native) {
    const waitForBlock = async (pid) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const blocked = (
          await db.query("select cardinality(pg_blocking_pids($1))>0 blocked", [pid])
        ).rows[0].blocked;
        if (blocked) return true;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return false;
    };
    await test("concurrent staff changes serialize into an accurate audit chain without losing the saved ETA", async () => {
      await setState("online", 25);
      const before = (await audit()).at(-1).id;
      const clients = [new pg.Client(db.config), new pg.Client(db.config)];
      await Promise.all(clients.map((client) => client.connect()));
      try {
        for (const client of clients) {
          await client.query("set role authenticated");
          await client.query("select set_config('request.jwt.claim.sub',$1,false)", [f.owner]);
        }
        await Promise.all(
          clients.map((client, index) =>
            client.query("select public.mealdeck_ops_update_checkout_availability($1,$2,$3,$4)", [
              f.tenantId,
              f.locationId,
              index ? "paused" : "busy",
              index ? null : 45,
            ]),
          ),
        );
        const entries = (await audit()).filter((row) => BigInt(row.id) > BigInt(before));
        assert.equal(entries.length, 2);
        assert.equal(
          entries[1].previous_value.availability_state,
          entries[0].next_value.availabilityState,
        );
        assert.equal(
          entries[1].previous_value.collection_estimate_minutes,
          entries[0].next_value.collectionEstimateMinutes,
        );
        const final = await settings();
        assert.equal(final.availabilityState, entries[1].next_value.availabilityState);
        assert.equal(final.collectionEstimateMinutes, 45);
      } finally {
        await Promise.all(clients.map((client) => client.end()));
      }
    });

    await test("an ETA change waiting on an in-flight prepare preserves the prepared quote, then a committed pause stops new admissions", async () => {
      await setState("online", 25);
      const quote = await f.quote(),
        before = await quoteRow(quote);
      const payment = new pg.Client(db.config),
        staff = new pg.Client(db.config);
      await Promise.all([payment.connect(), staff.connect()]);
      let pending;
      try {
        await payment.query("set role service_role");
        await staff.query("set role authenticated");
        await staff.query("select set_config('request.jwt.claim.sub',$1,false)", [f.owner]);
        const pid = (await staff.query("select pg_backend_pid() pid")).rows[0].pid;
        await payment.query("begin");
        const order = (
          await payment.query(
            "select public.mealdeck_prepare_stripe_order($1,$2,$3,'acct_Fixture',false) result",
            [quote.quoteId, f.customer, id(19211)],
          )
        ).rows[0].result;
        pending = staff.query(
          "select public.mealdeck_ops_update_checkout_availability($1,$2,'busy',65)",
          [f.tenantId, f.locationId],
        );
        pending.catch(() => {});
        assert.equal(
          await waitForBlock(pid),
          true,
          "ETA update must wait for quote admission to finish",
        );
        await payment.query("commit");
        await pending;
        assert.deepEqual(await quoteRow(quote), before);
        assert.equal((await settings()).collectionEstimateMinutes, 65);
        const fresh = await f.quote();
        assert.equal(fresh.collectionEstimateMinutes, 65);
        await setState("paused", null);
        await assert.rejects(
          () => f.prepare(fresh.quoteId, { attemptId: id(19212) }),
          /checkout_unavailable/,
        );
        await f.bind(order.orderId, "cs_test_availabilityrace");
        await f.reconcile(order, {
          event: "evt_availabilityrace",
          intent: "pi_availabilityrace",
          session: "cs_test_availabilityrace",
        });
        const receipt = await f.service(
          async () =>
            (
              await db.query("select public.mealdeck_customer_order_receipt($1,$2) result", [
                order.orderId,
                f.customer,
              ])
            ).rows[0].result,
        );
        assert.equal(receipt.verifiedPaid, true);
        assert.equal(receipt.collectionEstimateMinutes, 25);
      } finally {
        await payment.query("rollback");
        if (pending) await pending.catch(() => {});
        await Promise.all([payment.end(), staff.end()]);
      }
    });
    await test("an estimate-only request waiting behind another admin's Pause reads the committed Paused state", async () => {
      await setState("online", 25);
      const pause = new pg.Client(db.config),
        estimate = new pg.Client(db.config);
      await Promise.all([pause.connect(), estimate.connect()]);
      let pending;
      try {
        for (const [client, actor] of [
          [pause, actors.admin],
          [estimate, f.owner],
        ]) {
          await client.query("set role authenticated");
          await client.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
        }
        const pid = (await estimate.query("select pg_backend_pid() pid")).rows[0].pid;
        await pause.query("begin");
        await pause.query(
          "select public.mealdeck_ops_update_checkout_availability($1,$2,'paused',null)",
          [f.tenantId, f.locationId],
        );
        pending = estimate.query(
          "select public.mealdeck_ops_update_collection_estimate($1,$2,75) result",
          [f.tenantId, f.locationId],
        );
        pending.catch(() => {});
        assert.equal(
          await waitForBlock(pid),
          true,
          "estimate save must wait for the state transition",
        );
        await pause.query("commit");
        const result = (await pending).rows[0].result;
        assert.equal(result.availabilityState, "paused");
        assert.equal(result.enabled, false);
        assert.equal(result.collectionEstimateMinutes, 75);
        assert.deepEqual(await settings(), savedSettings(result));
        assert.equal((await status()).channelOpen, false);
        assert.equal((await audit()).at(-1).action, "checkout.estimate");
      } finally {
        await pause.query("rollback");
        if (pending) await pending.catch(() => {});
        await Promise.all([pause.end(), estimate.end()]);
      }
    });
  }

  console.log("Kitchen availability: " + checks + " behavioral groups passed.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
