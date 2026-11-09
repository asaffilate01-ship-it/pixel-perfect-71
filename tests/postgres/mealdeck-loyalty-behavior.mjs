import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDatabase, asActor } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";
import { buildKitchenPrinterSql } from "../../deploy/mealdeck/kitchen-printer.mjs";
import { buildGuestCheckoutSql } from "../../deploy/mealdeck/guest-checkout.mjs";

const db = await createDatabase(process.argv.includes("--native"));
let checks = 0;
async function test(label, action) {
  try {
    await action();
    console.log(`PASS member loyalty ${++checks}: ${label}`);
  } catch (error) {
    console.error(`FAIL member loyalty: ${label}`);
    throw error;
  }
}
const count = async (sql, params = []) => (await db.query(sql, params)).rows[0].total;

try {
  const f = await setupStripeCheckoutFixture(db);
  // Guest checkout requires receipt_jobs from the independently installed
  // kitchen/printer extension; mirror that production migration order.
  await db.exec(buildKitchenPrinterSql());
  await db.exec(buildGuestCheckoutSql());
  const migration = await readFile(
    new URL("../../deploy/mealdeck/post-install-migrations/20261109080000_mealdeck_member_loyalty_and_offer_claims.sql", import.meta.url),
    "utf8",
  );
  await test("the migration installs twice safely and enables the registered-member earning policy", async () => {
    await db.exec(migration);
    await db.exec(migration);
    const state = (
      await db.query("select loyalty_enabled, loyalty_terms from mealdeck_private.customer_features where singleton")
    ).rows[0];
    assert.equal(state.loyalty_enabled, true);
    assert.match(state.loyalty_terms, /1 point per complete £1/);
  });
  await test("private loyalty and offer tables do not grant API roles direct access", async () => {
    const names = ["customer_loyalty_ledger", "customer_offer_claims", "customer_offer_campaigns", "customer_whatsapp_verifications"];
    const tables = (
      await db.query(`select c.relname,c.relrowsecurity,
        has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon,
        has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as customer,
        has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') as service
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='mealdeck_private' and c.relname=any($1::text[])`, [names])
    ).rows;
    assert.equal(tables.length,names.length);
    assert.ok(tables.every(t=>t.relrowsecurity && !t.anon && !t.customer && !t.service));
  });

  const quote = await f.quote({
    lines: [{ ...f.line, quantity: 4 }],
    packing: f.pack([{ ...f.line, quantity: 4 }]),
    hash: "e".repeat(64),
  });
  const order = await f.prepare(quote.quoteId);
  await test("a prepared unpaid order earns zero points", async () => {
    assert.equal(await count("select count(*)::integer total from mealdeck_private.customer_loyalty_ledger"),0);
  });
  await f.bind(order.orderId);
  await test("verified payment earns one point per complete £1 after discounts, exactly once", async () => {
    await f.reconcile(order, { event: "evt_loyalty_first", hash: "1".repeat(64) });
    assert.equal(
      await count("select coalesce(sum(points),0)::integer total from mealdeck_private.customer_loyalty_ledger where user_id=$1", [f.customer]),
      Math.floor(order.totalPence/100),
    );
    await f.reconcile(order, { event: "evt_loyalty_first", hash: "1".repeat(64) });
    await f.reconcile(order, { event: "evt_loyalty_replay", hash: "2".repeat(64) });
    assert.equal(await count(
      "select count(*)::integer total from mealdeck_private.customer_loyalty_ledger where user_id=$1",
      [f.customer],
    ),1);
  });
  await test("partial refunds adjust net points without duplicating on webhook replays", async () => {
    await f.reconcile(order, {
      event: "evt_loyalty_partial", hash: "3".repeat(64),
      type: "charge.refunded", refunded: 350,
    });
    assert.equal(
      await count("select coalesce(sum(points),0)::integer total from mealdeck_private.customer_loyalty_ledger where user_id=$1", [f.customer]),
      Math.floor((order.totalPence-350)/100),
    );
    await f.reconcile(order, {
      event: "evt_loyalty_partial_replay", hash: "4".repeat(64),
      type: "charge.refunded", refunded: 350,
    });
    assert.equal(
      await count("select coalesce(sum(points),0)::integer total from mealdeck_private.customer_loyalty_ledger where user_id=$1", [f.customer]),
      Math.floor((order.totalPence-350)/100),
    );
  });
  await test("full refunds remove previously earned points", async () => {
    await f.reconcile(order, {
      event: "evt_loyalty_full", hash: "5".repeat(64),
      type: "charge.refunded", refunded: order.totalPence,
    });
    assert.equal(
      await count("select coalesce(sum(points),0)::integer total from mealdeck_private.customer_loyalty_ledger where user_id=$1", [f.customer]),0,
    );
  });
  await test("an unavailable or unverified WhatsApp offer never grants a claim", async () => {
    const claim = (campaign) => asActor(db, f.customer,
      () => db.query("select public.mealdeck_customer_claim_one_use_offer($1) as result", [campaign]));
    await assert.rejects(() => claim("unapproved-offer"), /whatsapp_verification_required/);
    await db.query(`insert into mealdeck_private.customer_offer_campaigns(campaign_id,enabled,starts_at,ends_at)
      values('fixture-welcome',true,now()-interval '1 day',now()+interval '1 day')`);
    await assert.rejects(() => claim("fixture-welcome"), /whatsapp_verification_required/);
    const phone = (await db.query("select phone from mealdeck_private.customer_profiles where user_id=$1", [f.customer])).rows[0].phone;
    await db.query(`insert into mealdeck_private.customer_whatsapp_verifications(
      user_id,phone,provider_reference,verified_at)
      values($1,$2,'meta-verified-test-only',now())`, [f.customer,phone]);
    assert.equal((await claim("fixture-welcome")).rows[0].result.claimed,true);
    await assert.rejects(() => claim("fixture-welcome"), /already_claimed/);
    assert.equal(
      await count("select count(*)::integer total from mealdeck_private.customer_offer_claims where campaign_id='fixture-welcome'"),1,
    );
    await assert.rejects(() => db.query(`insert into mealdeck_private.customer_offer_claims(campaign_id,user_id,email,phone)
      select 'fixture-welcome',$1,lower(u.email),p.phone from auth.users u
      join mealdeck_private.customer_profiles p on p.user_id=u.id where u.id=$1`, [f.otherCustomer]), /duplicate key/);
  });

  console.log(`${checks} member loyalty security, payment and idempotency checks passed.`);
} finally {
  await db.close();
}
