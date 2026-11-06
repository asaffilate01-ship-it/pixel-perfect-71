import assert from "node:assert/strict";
import { createDatabase, asActor, id } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";
import { buildKitchenPrinterSql } from "../../deploy/mealdeck/kitchen-printer.mjs";
import { buildGuestCheckoutSql } from "../../deploy/mealdeck/guest-checkout.mjs";
import { buildWhatsappGuestSql } from "../../deploy/mealdeck/whatsapp-guest.mjs";
import {
  guestFixtureMethods,
  guestTokenHash,
  setGuestFixtureClock,
} from "./guest-checkout-fixture.mjs";

const db = await createDatabase(process.argv.includes("--native"));
let checks = 0;
async function test(label, run) {
  await run();
  console.log(`PASS contact-only guest ${++checks}: ${label}`);
}
try {
  const f = await setupStripeCheckoutFixture(db);
  await db.exec(buildKitchenPrinterSql());
  await db.exec(buildGuestCheckoutSql());
  const g = guestFixtureMethods(db, f);
  const snapshot = async () =>
    (
      await db.query(`select
    (select count(*)::int from auth.users) users,
    (select count(*)::int from mealdeck_private.customer_profiles) members,
    (select count(*)::int from mealdeck_private.customer_consent_events) consents,
    (select count(*)::int from public.mealdeck_ops_staff_access) staff`)
    ).rows[0];
  const before = await snapshot();
  await test("migration is additive, repeatable, private and does not alter identities or staff", async () => {
    await db.exec(buildWhatsappGuestSql());
    await db.exec(buildWhatsappGuestSql());
    assert.deepEqual(await snapshot(), before);
    const row = (
      await db.query(`select c.relrowsecurity rls,
      has_table_privilege('anon',c.oid,'SELECT') anon,
      has_table_privilege('authenticated',c.oid,'SELECT') auth,
      has_table_privilege('service_role',c.oid,'SELECT') service
      from pg_class c where c.oid='mealdeck_private.guest_sessions'::regclass`)
    ).rows[0];
    assert.deepEqual(row, { rls: true, anon: false, auth: false, service: false });
  });
  await setGuestFixtureClock(db, "2026-11-06T16:00:00Z");
  await asActor(db, f.owner, () =>
    db.query(
      "select public.mealdeck_ops_update_checkout_settings($1,$2,true,date '2026-11-06',30)",
      [f.tenantId, f.locationId],
    ),
  );
  const token = guestTokenHash("contact-only-private-test-browser");
  const start = (hash, email = null, phone = "+447700900321") =>
    f.service(
      async () =>
        (
          await db.query(
            "select public.mealdeck_begin_guest_session($1,$2,$3,'Guest Customer',$4,$5) r",
            [f.tenantId, f.locationId, hash, email, phone],
          )
        ).rows[0].r,
    );
  let session;
  await test("phone-only session persists null email, and the same capability is idempotent", async () => {
    session = await start(token);
    assert.equal(session.email, null);
    assert.equal((await start(token)).guestId, session.guestId);
    await assert.rejects(() => start(token, "different@example.invalid"), /guest_session_invalid/);
    assert.deepEqual(await snapshot(), before);
  });
  await test("bad contacts, public callers and stolen-looking IDs cannot create/read guest authority", async () => {
    await assert.rejects(() => start(guestTokenHash("bad-email"), "bad"), /guest_details_invalid/);
    await assert.rejects(
      () => start(guestTokenHash("bad-phone"), null, "not-a-number"),
      /guest_details_invalid/,
    );
    await assert.rejects(
      () =>
        asActor(db, f.customer, () =>
          db.query(
            "select public.mealdeck_begin_guest_session($1,$2,$3,'Guest',null,'+447700900333')",
            [f.tenantId, f.locationId, token],
          ),
        ),
      /permission denied/,
    );
    assert.equal(await g.resolve(guestTokenHash("wrong-browser")), null);
  });
  let prepared;
  await test("a kerbside order retains car details, exact 30% discount and no email or membership", async () => {
    const q = await g.quote(token, {
      fulfilment: "curbside",
      vehicle: { make: "Ford", colour: "Blue", registrationLast4: "4ABC" },
    });
    assert.equal(q.totalPence, q.grossPence - q.discountPence);
    assert.equal(q.discountPence, Math.floor((q.grossPence * 30 + 50) / 100));
    prepared = await g.prepare(token, q.quoteId);
    assert.equal(prepared.email, null);
    const o = (
      await db.query(
        "select customer_id,customer_email,customer_phone,vehicle,payment_status from public.orders where id=$1",
        [prepared.orderId],
      )
    ).rows[0];
    assert.equal(o.customer_id, null);
    assert.equal(o.customer_email, null);
    assert.equal(o.customer_phone, "+447700900321");
    assert.equal(o.vehicle.registrationLast4, "4ABC");
    assert.notEqual(o.payment_status, "paid");
    assert.equal((await db.query("select count(*)::int n from public.kds_tickets")).rows[0].n, 0);
    assert.deepEqual(await snapshot(), before);
  });
  await test("existing email guests still work and do not leak phone-only receipts", async () => {
    const legacy = guestTokenHash("historical-email-contact");
    assert.equal(
      (await start(legacy, "old@example.invalid", "+447700900444")).email,
      "old@example.invalid",
    );
    await assert.rejects(() => g.receipt(legacy, prepared.orderId), /order_unavailable/);
    const own = await g.receipt(token, prepared.orderId);
    assert.equal(own.orderId, prepared.orderId);
  });
  await test("registration clock covers the exact Monday boundary, without touching the opening clock", async () => {
    for (const [at, expected] of [
      ["2026-11-05T23:59:59Z", true],
      ["2026-11-06T00:00:00Z", false],
      ["2026-11-08T23:59:59Z", false],
      ["2026-11-09T00:00:00Z", true],
    ]) {
      assert.equal(
        (
          await db.query(
            "select mealdeck_private.email_registration_available_at($1::timestamptz) ready",
            [at],
          )
        ).rows[0].ready,
        expected,
      );
    }
    await setGuestFixtureClock(db, "2026-11-09T00:00:00Z");
    await assert.rejects(() => start(guestTokenHash("after-weekend")), /guest_unavailable/);
    assert.equal((await g.receipt(token, prepared.orderId)).orderId, prepared.orderId);
  });
  await test("registration cannot bypass the deferred window but existing memberships remain valid", async () => {
    const helper = (
      await db.query(
        "select pg_get_functiondef('mealdeck_private.email_registration_available_at(timestamptz)'::regprocedure) body",
      )
    ).rows[0].body;
    const fresh = id(99099);
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'fresh@example.invalid',now())",
      [fresh],
    );
    const register = (who) =>
      asActor(db, who, () =>
        db.query(
          "select public.mealdeck_customer_register('Member','+447700900777',false,false,false,'mealdeck-customer-2026-11-05','mealdeck-preferences-2026-11-05')",
        ),
      );
    await db.exec(
      "create or replace function mealdeck_private.email_registration_available_at(p_at timestamptz) returns boolean language sql immutable set search_path='' as $$ select false $$",
    );
    await assert.rejects(() => register(fresh), /registration_deferred/);
    await register(f.customer);
    await db.exec(
      "create or replace function mealdeck_private.email_registration_available_at(p_at timestamptz) returns boolean language sql immutable set search_path='' as $$ select true $$",
    );
    await register(fresh);
    await db.exec(helper);
  });
  console.log(`${checks} contact-only PostgreSQL checks passed`);
} finally {
  await db.close();
}
