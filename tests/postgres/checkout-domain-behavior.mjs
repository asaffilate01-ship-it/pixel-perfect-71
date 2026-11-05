import assert from "node:assert/strict";
import { createDatabase } from "./harness.mjs";
import { setupSharedPaymentsFixture } from "./shared-terminal-payments-fixture.mjs";
import {
  buildCheckoutDomainSql,
  buildManagedCheckoutDomainSql,
} from "../../deploy/mealdeck/checkout-domain.mjs";

const db = await createDatabase(process.argv.includes("--native"));
let checks = 0;
const bindSingle = (f, order, session, url, account = "acct_Fixture", live = false) =>
  f.service(() =>
    db.query("select public.mealdeck_bind_stripe_session($1,$2,$3,$4,$5)", [
      order.orderId,
      session,
      url,
      account,
      live,
    ]),
  );
const invalidUrls = [
  "http://pay.mealdeck.co.uk/c/pay/cs_test_domain",
  "https://pay.mealdeck.co.uk.evil.invalid/c/pay/cs_test_domain",
  "https://x.pay.mealdeck.co.uk/c/pay/cs_test_domain",
  "https://user:secret@pay.mealdeck.co.uk/c/pay/cs_test_domain",
  "https://pay.mealdeck.co.uk:443/c/pay/cs_test_domain",
  "https://checkout.stripe.com/login",
  "https://pay.mealdeck.co.uk/p/session/bps_test_domain",
  "https://pay.mealdeck.co.uk/c/pay/",
  "https://pay.mealdeck.co.uk/c/pay/cs_test_domain/another",
  "https://pay.mealdeck.co.uk/c/pay/../login",
  "https://pay.mealdeck.co.uk/c/pay/cs_test_domain\n",
  "https://pay.mealdeck.co.uk/c/pay/cs_test_domain\\evil",
  "https://pay.mealdeck.co.uk/c/pay/cs_test_domain#" + "a".repeat(4096),
  null,
];
async function test(label, run) {
  await db.exec(
    "update mealdeck_private.checkout_quotes set created_at=now()-interval '6 minutes'",
  );
  try {
    await run();
    console.log(`PASS checkout domain ${++checks}: ${label}`);
  } catch (error) {
    console.error(`FAIL checkout domain: ${label}: ${error.message}`, error.where ?? "");
    throw error;
  }
}

try {
  const f = await setupSharedPaymentsFixture(db);
  const definition = async (name) =>
    (await db.query("select pg_get_functiondef($1::regprocedure) definition", [name])).rows[0]
      .definition;
  const singleSignature = "public.mealdeck_bind_stripe_session(uuid,text,text,text,boolean)";
  const sharedSignature = "public.mealdeck_bind_order_payment(uuid,text,text,text,text,boolean)";
  const beforeSingle = await definition(singleSignature);
  const beforeShared = await definition(sharedSignature);
  const clock = await definition("mealdeck_private.launch_window()");
  const beforeOrder = await f.prepare((await f.quote()).quoteId, { attemptId: f.next() });
  await f.bind(beforeOrder.orderId, "cs_test_preserved");
  const beforeGroup = await f.group();
  const beforeClaim = await f.claim(beforeGroup);
  const priorCollection = await f.bindPayment(beforeClaim, {
    session: "cs_test_preservedshare",
    url: "https://checkout.stripe.com/c/pay/cs_test_preservedshare",
  });
  const savedRows = async () =>
    (
      await db.query(
        "select session_id,session_url from mealdeck_private.stripe_orders where order_id=$1 union all select session_id,session_url from mealdeck_private.payment_collections where id=$2 order by session_id",
        [beforeOrder.orderId, priorCollection.collectionId],
      )
    ).rows;
  const beforeRows = await savedRows();
  const managed = buildManagedCheckoutDomainSql({
    runnerOwnsTransaction: true,
    singleMigration: true,
  });

  await test("managed execution is explicit and rollback restores both original bind functions", async () => {
    for (const options of [
      undefined,
      {},
      { runnerOwnsTransaction: true },
      { singleMigration: true },
    ])
      assert.throws(() => buildManagedCheckoutDomainSql(options), /atomic transaction/);
    await db.exec("begin");
    await db.exec(managed);
    assert.notEqual(await definition(singleSignature), beforeSingle);
    assert.notEqual(await definition(sharedSignature), beforeShared);
    await db.exec("rollback");
    assert.equal(await definition(singleSignature), beforeSingle);
    assert.equal(await definition(sharedSignature), beforeShared);
    assert.equal(
      (await db.query("select to_regprocedure('mealdeck_private.valid_checkout_url(text)') helper"))
        .rows[0].helper,
      null,
    );
  });

  await test("foreign profiles and unexpected function changes are rejected atomically", async () => {
    for (const damage of [
      "create schema dishbee_private",
      "alter table mealdeck_private.installation rename to missing_installation_fixture",
      "alter table mealdeck_private.payment_collections rename to missing_collection_fixture",
      "create or replace function public.mealdeck_bind_stripe_session(p_order uuid,p_session text,p_url text,p_account text,p_livemode boolean) returns boolean language sql as 'select false'",
    ]) {
      await db.exec("begin");
      try {
        await db.exec(damage);
        await db.exec("savepoint attempted_install");
        await assert.rejects(
          () => db.exec(managed),
          /mealdeck_checkout_domain_(independent_profile_required|previous_extensions_required|unexpected_definition)/,
        );
        await db.exec("rollback to savepoint attempted_install");
      } finally {
        await db.exec("rollback");
      }
      assert.equal(await definition(singleSignature), beforeSingle);
    }
  });

  await db.exec(buildCheckoutDomainSql());
  await test("installation preserves saved attempts, server clock, RLS and service-only payment authority", async () => {
    assert.deepEqual(await savedRows(), beforeRows);
    assert.equal(await definition("mealdeck_private.launch_window()"), clock);
    assert.equal((await db.query("select count(*)::int n from public.kds_tickets")).rows[0].n, 0);
    const tables = (
      await db.query(
        "select c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anon,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') customer,has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') service from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mealdeck_private' and c.relname in ('stripe_orders','payment_collections')",
      )
    ).rows;
    assert.equal(tables.length, 2);
    assert.ok(
      tables.every((row) => row.relrowsecurity && !row.anon && !row.customer && !row.service),
    );
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.equal(
        (
          await db.query(
            "select has_function_privilege($1,'mealdeck_private.valid_checkout_url(text)','EXECUTE') allowed",
            [role],
          )
        ).rows[0].allowed,
        false,
      );
      for (const signature of [singleSignature, sharedSignature])
        assert.equal(
          (
            await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed", [
              role,
              signature,
            ])
          ).rows[0].allowed,
          role === "service_role",
        );
    }
    // A deliberate rerun changes no data, access or payment state.
    await db.exec(buildCheckoutDomainSql());
    assert.deepEqual(await savedRows(), beforeRows);
  });

  await test("single-payer bind accepts only the approved Checkout hosts and preserves account/mode binding", async () => {
    const order = await f.prepare((await f.quote()).quoteId, { attemptId: f.next() });
    for (const url of invalidUrls)
      await assert.rejects(() => bindSingle(f, order, "cs_test_domain", url), /session_mismatch/);
    const url = "https://pay.mealdeck.co.uk/c/pay/cs_test_domain?prefilled=1#fidk%2B";
    await assert.rejects(
      () => bindSingle(f, order, "cs_test_domain", url, "acct_Other"),
      /session_mismatch/,
    );
    await assert.rejects(
      () => bindSingle(f, order, "cs_test_domain", url, "acct_Fixture", true),
      /session_mismatch/,
    );
    await bindSingle(f, order, "cs_test_domain", url);
    assert.equal(
      (
        await db.query("select session_url from mealdeck_private.stripe_orders where order_id=$1", [
          order.orderId,
        ])
      ).rows[0].session_url,
      url,
    );
    await assert.rejects(() => bindSingle(f, order, "cs_test_another", url), /session_mismatch/);
  });

  await test("shared-payer bind accepts exact custom URLs and retains immutable claim and URL bindings", async () => {
    const claim = await f.claim(await f.group());
    for (const url of invalidUrls)
      await assert.rejects(
        () =>
          f.rpc("mealdeck_bind_order_payment", [
            claim.collectionId,
            "cs_test_customshare",
            null,
            url,
            "acct_Fixture",
            false,
          ]),
        /payment_mismatch/,
      );
    const url = "https://pay.mealdeck.co.uk/c/pay/cs_test_customshare#fidk%2B";
    const bound = await f.bindPayment(claim, { session: "cs_test_customshare", url });
    assert.equal(bound.sessionUrl, url);
    assert.equal(bound.collectionId, claim.collectionId);
    assert.equal(bound.amountPence, claim.amountPence);
    await assert.rejects(
      () => f.bindPayment(bound, { session: "cs_test_other", url }),
      /payment_mismatch/,
    );
    await assert.rejects(
      () => f.bindPayment(bound, { session: bound.sessionId, url: url + "changed" }),
      /payment_mismatch/,
    );
    assert.equal((await f.status({ room: { roomId: claim.roomId } })).paidPence ?? 0, 0);
    assert.equal((await db.query("select count(*)::int n from public.kds_tickets")).rows[0].n, 0);
  });

  await test("Terminal payments still bind only an intent, with no hosted URL", async () => {
    const quote = await f.terminalQuote();
    const claim = await f.terminal({ quoteId: quote.quoteId });
    const bound = await f.bindPayment(claim);
    assert.equal(bound.sessionId, null);
    assert.equal(bound.sessionUrl, null);
    assert.match(bound.paymentIntentId, /^pi_/);
  });
  console.log(`Verified ${checks} checkout domain PostgreSQL groups.`);
} finally {
  await db.close();
}
