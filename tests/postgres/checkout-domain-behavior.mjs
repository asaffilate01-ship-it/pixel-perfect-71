import assert from "node:assert/strict";
import { asActor, createDatabase } from "./harness.mjs";
import { setupSharedPaymentsFixture } from "./shared-terminal-payments-fixture.mjs";
import {
  buildCheckoutDomainSql,
  buildManagedCheckoutDomainSql,
} from "../../deploy/mealdeck/checkout-domain.mjs";
import {
  buildCheckoutSessionPathsSql,
  buildManagedCheckoutSessionPathsSql,
} from "../../deploy/mealdeck/checkout-session-paths.mjs";

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
const invalidNewPathUrls = [
  ...invalidUrls.map((url) => url?.replace("/c/pay/", "/g/pay/") ?? null),
  "https://pay.mealdeck.co.uk/x/pay/cs_test_domain",
  "https://pay.mealdeck.co.uk/g/pay/cs_test_domain%2Fanother",
  "https://pay.mealdeck.co.uk/g/pay/cs_test_domain/%2e%2e/login",
  "https://pay.mealdeck.co.uk/g/pay/cs_test_domain#fragment\r\nhttps://evil.invalid",
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
  const helperSignature = "mealdeck_private.valid_checkout_url(text)";
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
  const managedPaths = buildManagedCheckoutSessionPathsSql({
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

  await test("path extension requires the installed domain helper and an explicit atomic runner", async () => {
    for (const options of [
      undefined,
      {},
      [],
      { runnerOwnsTransaction: true },
      { singleMigration: true },
      { runnerOwnsTransaction: false, singleMigration: true },
      { runnerOwnsTransaction: true, singleMigration: true, extra: true },
    ])
      assert.throws(() => buildManagedCheckoutSessionPathsSql(options), /atomic transaction/);
    await db.exec("begin");
    try {
      await assert.rejects(
        () => db.exec(managedPaths),
        /mealdeck_checkout_session_paths_previous_extension_required/,
      );
    } finally {
      await db.exec("rollback");
    }
    assert.equal(await definition(singleSignature), beforeSingle);
    assert.equal(await definition(sharedSignature), beforeShared);
    assert.deepEqual(await savedRows(), beforeRows);
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

  const installedSingle = await definition(singleSignature);
  const installedShared = await definition(sharedSignature);
  const originalHelper = await definition(helperSignature);
  const metadata = async () =>
    (
      await db.query(
        "select oid::regprocedure::text signature,proacl::text acl,proowner,prosecdef,provolatile,proconfig from pg_proc where oid in ($1::regprocedure,$2::regprocedure,$3::regprocedure) order by oid",
        [helperSignature, singleSignature, sharedSignature],
      )
    ).rows;
  const originalMetadata = await metadata();
  const savedPaymentState = async () =>
    (
      await db.query(
        "select 'order:'||o.id::text key,to_jsonb(o) value from public.orders o where o.id in ($1,$2) union all select 'single:'||s.order_id::text,to_jsonb(s) from mealdeck_private.stripe_orders s where s.order_id=$1 union all select 'collection:'||c.id::text,to_jsonb(c) from mealdeck_private.payment_collections c where c.id=$3 order by key",
        [beforeOrder.orderId, priorCollection.orderId, priorCollection.collectionId],
      )
    ).rows;
  const originalPaymentState = await savedPaymentState();

  await test("path extension rolls back atomically without replacing binders, authority or saved attempts", async () => {
    await db.exec("begin");
    try {
      await db.exec(managedPaths);
      assert.notEqual(await definition(helperSignature), originalHelper);
      assert.equal(await definition(singleSignature), installedSingle);
      assert.equal(await definition(sharedSignature), installedShared);
      assert.deepEqual(await metadata(), originalMetadata);
      assert.deepEqual(await savedPaymentState(), originalPaymentState);
      assert.equal(
        (
          await db.query(
            "select mealdeck_private.valid_checkout_url('https://pay.mealdeck.co.uk/g/pay/cs_test_path') valid",
          )
        ).rows[0].valid,
        true,
      );
    } finally {
      await db.exec("rollback");
    }
    assert.equal(await definition(helperSignature), originalHelper);
    assert.equal(await definition(singleSignature), installedSingle);
    assert.equal(await definition(sharedSignature), installedShared);
    assert.deepEqual(await savedPaymentState(), originalPaymentState);
  });

  await test("path extension rejects a foreign profile, missing prerequisite or unreviewed function", async () => {
    for (const damage of [
      "create schema dishbee_private",
      "alter table mealdeck_private.installation rename to missing_installation_fixture",
      "alter table mealdeck_private.installation drop constraint installation_profile_check; update mealdeck_private.installation set profile='shared-profile-fixture'",
      "alter function mealdeck_private.valid_checkout_url(text) rename to missing_checkout_helper_fixture",
      "create or replace function mealdeck_private.valid_checkout_url(p_url text) returns boolean language sql immutable security invoker set search_path='' as 'select true'",
      "create or replace function public.mealdeck_bind_stripe_session(p_order uuid,p_session text,p_url text,p_account text,p_livemode boolean) returns boolean language sql as 'select false'",
      "alter function public.mealdeck_bind_order_payment(uuid,text,text,text,text,boolean) rename to missing_checkout_bind_fixture",
      "create or replace function public.mealdeck_bind_order_payment(p_collection uuid,p_session text,p_intent text,p_url text,p_account text,p_livemode boolean) returns jsonb language sql as 'select null::jsonb'",
    ]) {
      await db.exec("begin");
      try {
        await db.exec(damage);
        await db.exec("savepoint attempted_path_install");
        await assert.rejects(
          () => db.exec(managedPaths),
          /mealdeck_checkout_session_paths_(independent_profile_required|previous_extension_required|unexpected_definition)/,
        );
        await db.exec("rollback to savepoint attempted_path_install");
        assert.deepEqual(await savedPaymentState(), originalPaymentState);
      } finally {
        await db.exec("rollback");
      }
      assert.equal(await definition(helperSignature), originalHelper);
      assert.equal(await definition(singleSignature), installedSingle);
      assert.equal(await definition(sharedSignature), installedShared);
    }
  });

  await db.exec(buildCheckoutSessionPathsSql());
  await test("path installation and rerun preserve existing rows, clocks, function security and service-only binding", async () => {
    const revisedHelper = await definition(helperSignature);
    for (let run = 0; run < 2; run++) {
      if (run) await db.exec(buildCheckoutSessionPathsSql());
      assert.equal(await definition(helperSignature), revisedHelper);
      assert.equal(await definition(singleSignature), installedSingle);
      assert.equal(await definition(sharedSignature), installedShared);
      assert.equal(await definition("mealdeck_private.launch_window()"), clock);
      assert.deepEqual(await metadata(), originalMetadata);
      assert.deepEqual(await savedPaymentState(), originalPaymentState);
      assert.deepEqual(await savedRows(), beforeRows);
      assert.equal((await db.query("select count(*)::int n from public.kds_tickets")).rows[0].n, 0);
      assert.equal(
        (await db.query("select count(*)::int n from mealdeck_private.receipt_jobs")).rows[0].n,
        0,
      );
    }
    for (const role of ["anon", "authenticated", "service_role"]) {
      await assert.rejects(
        () =>
          asActor(
            db,
            f.customer,
            () =>
              db.query("select mealdeck_private.valid_checkout_url($1)", [
                "https://pay.mealdeck.co.uk/g/pay/cs_test_path",
              ]),
            role,
          ),
        /permission denied/,
      );
      if (role === "service_role") continue;
      for (const sql of [
        "select public.mealdeck_bind_stripe_session(null,null,null,null,false)",
        "select public.mealdeck_bind_order_payment(null,null,null,null,null,false)",
      ])
        await assert.rejects(
          () => asActor(db, f.customer, () => db.query(sql), role),
          /permission denied/,
        );
    }
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

  await test("both approved hosts accept provider g paths without changing URL bytes or paid state", async () => {
    for (const [index, host] of ["checkout.stripe.com", "pay.mealdeck.co.uk"].entries()) {
      const order = await f.prepare((await f.quote()).quoteId, { attemptId: f.next() });
      const session = `cs_test_newpath${index}`;
      const url = `https://${host}/g/pay/${session}?prefilled=1#fidk%2B`;
      for (const invalid of invalidNewPathUrls)
        await assert.rejects(() => bindSingle(f, order, session, invalid), /session_mismatch/);
      await assert.rejects(
        () => bindSingle(f, order, session, url, "acct_Other"),
        /session_mismatch/,
      );
      await assert.rejects(
        () => bindSingle(f, order, session, url, "acct_Fixture", true),
        /session_mismatch/,
      );
      await bindSingle(f, order, session, url);
      await bindSingle(f, order, session, url);
      const saved = (
        await db.query(
          "select session_id,session_url,captured_pence,payment_intent_id from mealdeck_private.stripe_orders where order_id=$1",
          [order.orderId],
        )
      ).rows[0];
      assert.deepEqual(saved, {
        session_id: session,
        session_url: url,
        captured_pence: 0,
        payment_intent_id: null,
      });
      await assert.rejects(() => bindSingle(f, order, "cs_test_other", url), /session_mismatch/);

      const claim = await f.claim(await f.group());
      const sharedSession = `cs_test_newshare${index}`;
      const sharedUrl = `https://${host}/g/pay/${sharedSession}#fidk%2B`;
      for (const invalid of invalidNewPathUrls)
        await assert.rejects(
          () => f.bindPayment(claim, { session: sharedSession, url: invalid }),
          /payment_mismatch/,
        );
      const bound = await f.bindPayment(claim, { session: sharedSession, url: sharedUrl });
      assert.equal(bound.sessionUrl, sharedUrl);
      assert.equal(bound.collectionId, claim.collectionId);
      assert.equal(bound.amountPence, claim.amountPence);
      assert.equal(
        (await f.bindPayment(bound, { session: sharedSession, url: sharedUrl })).sessionUrl,
        sharedUrl,
      );
      await assert.rejects(
        () => f.bindPayment(bound, { session: "cs_test_other", url: sharedUrl }),
        /payment_mismatch/,
      );
      await assert.rejects(
        () => f.bindPayment(bound, { session: sharedSession, url: sharedUrl + "changed" }),
        /payment_mismatch/,
      );
      assert.equal((await f.status({ room: { roomId: claim.roomId } })).paidPence ?? 0, 0);
    }
    assert.equal((await db.query("select count(*)::int n from public.kds_tickets")).rows[0].n, 0);
    assert.equal(
      (await db.query("select count(*)::int n from mealdeck_private.receipt_jobs")).rows[0].n,
      0,
    );
    assert.deepEqual(await savedPaymentState(), originalPaymentState);
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
