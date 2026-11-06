import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { asActor, createDatabase, id } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";
import { buildKitchenPrinterSql } from "../../deploy/mealdeck/kitchen-printer.mjs";
import { buildGuestCheckoutSql } from "../../deploy/mealdeck/guest-checkout.mjs";
import { buildKitchenAvailabilitySql } from "../../deploy/mealdeck/kitchen-availability.mjs";
import { buildSharedTerminalPaymentsSql } from "../../deploy/mealdeck/shared-terminal-payments.mjs";
import {
  buildLiveVerificationSql,
  buildManagedLiveVerificationSql,
} from "../../deploy/mealdeck/live-verification.mjs";

const db = await createDatabase(process.argv.includes("--native"));
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
let checks = 0;
async function check(label, action) {
  await action();
  console.log(`PASS live verification ${++checks}: ${label}`);
}
try {
  const f = await setupStripeCheckoutFixture(db);
  await db.exec(buildKitchenPrinterSql());
  await db.exec(buildGuestCheckoutSql());
  await db.exec(buildKitchenAvailabilitySql());
  await db.exec(buildSharedTerminalPaymentsSql());
  await db.exec(
    await readFile(new URL("./live-verification-installed-fixture.sql", import.meta.url), "utf8"),
  );
  await db.query("update auth.users set email='test@mealdeck.co.uk' where id=$1", [f.customer]);
  await db.query(
    "insert into mealdeck_private.launch_test_access(singleton,user_id,email,begins_at,ends_at) values(true,$1,'test@mealdeck.co.uk','2026-11-06T08:00:00Z','2026-11-06T15:00:00Z')",
    [f.customer],
  );
  const installedEnds = () =>
    scalar("select ends_at::text from mealdeck_private.launch_test_access where singleton");
  const preservedFunctions = () =>
    db.query(`select n.nspname,p.proname,p.oid::regprocedure::text signature,
      md5(p.prosrc) hash,p.proacl::text acl,p.proconfig,p.proowner
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','mealdeck_private','mealdeck_ops_private')
        and p.proname not in ('begin_launch_test_context','launch_window','mealdeck_checkout_status_for_customer')
      order by 1,2,3`);
  const preservedTables = () =>
    db.query(`select n.nspname,c.relname,c.relacl::text acl,c.relrowsecurity rls
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','mealdeck_private','mealdeck_ops_private') and c.relkind in ('r','S')
      order by 1,2`);
  const beforeFunctions = (await preservedFunctions()).rows;
  const beforeTables = (await preservedTables()).rows;
  const beforeIdentity = await scalar(
    "select jsonb_build_object('auth',(select to_jsonb(u) from auth.users u where id=$1),'profile',(select to_jsonb(p) from mealdeck_private.customer_profiles p where user_id=$1),'settings',(select jsonb_agg(s) from mealdeck_private.checkout_settings s))",
    [f.customer],
  );
  const managed = buildManagedLiveVerificationSql({
    runnerOwnsTransaction: true,
    singleMigration: true,
  });
  await check(
    "requires an atomic managed transaction and rejects unexpected authority",
    async () => {
      for (const options of [
        {},
        { runnerOwnsTransaction: true },
        { runnerOwnsTransaction: true, singleMigration: true, split: true },
      ])
        assert.throws(() => buildManagedLiveVerificationSql(options), /one runner-owned/);
      for (const [damage, expected] of [
        ["create schema dishbee_private", /independent_profile_required/],
        ["delete from mealdeck_private.launch_test_access", /existing_identity_window_required/],
        [
          "update auth.users set email='different@example.invalid' where email='test@mealdeck.co.uk'",
          /verified_existing_customer_required/,
        ],
        [
          "update auth.users set email_confirmed_at=null where email='test@mealdeck.co.uk'",
          /verified_existing_customer_required/,
        ],
        [
          "grant select on mealdeck_private.launch_test_access to anon",
          /private_allowlist_required/,
        ],
        [
          "create or replace function mealdeck_private.begin_launch_test_context(p_customer uuid) returns void language plpgsql security definer set search_path='' as $$begin null;end$$",
          /unreviewed_authority/,
        ],
      ]) {
        await db.exec("begin");
        try {
          await db.exec(damage);
          await db.exec("savepoint installation_attempt");
          await assert.rejects(() => db.exec(managed), expected);
          await db.exec("rollback to savepoint installation_attempt");
          assert.equal(
            await scalar(
              "select count(*)::int from public.mealdeck_ops_audit_log where action='checkout.live_verification_window_extended'",
            ),
            0,
          );
        } finally {
          await db.exec("rollback");
        }
        assert.match(await installedEnds(), /2026-11-06 15:00:00/);
      }
      await db.exec("begin");
      await db.exec(managed);
      assert.match(await installedEnds(), /2026-11-06 23:00:00/);
      await db.exec("rollback");
      assert.match(await installedEnds(), /2026-11-06 15:00:00/);
    },
  );
  await check(
    "extends only the existing row, preserves payment authority and supports exact rerun",
    async () => {
      await db.exec(buildLiveVerificationSql());
      await db.exec(buildLiveVerificationSql());
      assert.match(await installedEnds(), /2026-11-06 23:00:00/);
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.launch_test_access"),
        1,
      );
      assert.equal(
        await scalar("select user_id from mealdeck_private.launch_test_access"),
        f.customer,
      );
      assert.deepEqual((await preservedFunctions()).rows, beforeFunctions);
      assert.deepEqual((await preservedTables()).rows, beforeTables);
      assert.deepEqual(
        await scalar(
          "select jsonb_build_object('auth',(select to_jsonb(u) from auth.users u where id=$1),'profile',(select to_jsonb(p) from mealdeck_private.customer_profiles p where user_id=$1),'settings',(select jsonb_agg(s) from mealdeck_private.checkout_settings s))",
          [f.customer],
        ),
        beforeIdentity,
      );
      assert.equal(
        await scalar(
          "select count(*)::int from public.mealdeck_ops_audit_log where action='checkout.live_verification_window_extended'",
        ),
        1,
      );
      await assert.rejects(
        () =>
          db.exec("update mealdeck_private.launch_test_access set ends_at='2026-11-07T23:00:00Z'"),
        /launch_test_access_ends_at_check/,
      );
      await assert.rejects(
        () =>
          db.exec("update mealdeck_private.launch_test_access set email='another@example.invalid'"),
        /launch_test_access_email_check/,
      );
    },
  );
  await check(
    "keeps private admission service-only and every private helper/table inaccessible",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        await assert.rejects(
          () =>
            asActor(
              db,
              f.customer,
              () =>
                db.query("select public.mealdeck_checkout_status_for_customer($1,$2,$3)", [
                  f.tenantId,
                  f.locationId,
                  f.customer,
                ]),
              role,
            ),
          /permission denied/,
        );
      }
      for (const role of ["anon", "authenticated", "service_role"]) {
        assert.equal(
          await scalar(
            "select has_table_privilege($1,'mealdeck_private.launch_test_access','SELECT,INSERT,UPDATE,DELETE')",
            [role],
          ),
          false,
        );
        for (const signature of [
          "mealdeck_private.launch_test_eligible_at(uuid,timestamptz)",
          "mealdeck_private.begin_launch_test_context(uuid)",
          "mealdeck_private.launch_window()",
        ])
          assert.equal(
            await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, signature]),
            false,
          );
      }
      assert.equal(
        await scalar(
          "select has_function_privilege('service_role','public.mealdeck_checkout_status_for_customer(uuid,uuid,uuid)','EXECUTE')",
        ),
        true,
      );
    },
  );

  // TEST DATABASE ONLY: pin the database clock by substituting only now() in
  // these installed definitions, retaining their SQL bodies and ACLs. This is
  // never shipped to production and gives stable boundary tests after launch.
  const clockNames = [
    "begin_launch_test_context",
    "launch_window",
    "mealdeck_checkout_status_for_customer",
    "create_checkout_quote_for_identity",
    "create_checkout_quote_for_actor",
    "prepare_stripe_order_for_identity",
    "materialize_payment_order",
    "guard_payment_preparation_availability",
  ];
  const clockDefinitions = (
    await db.query(
      "select pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('mealdeck_private','public') and p.proname=any($1::text[])",
      [clockNames],
    )
  ).rows;
  assert.equal(clockDefinitions.length, clockNames.length);
  async function clock(at) {
    assert.match(at, /^2026-11-0[6-9]T\d\d:\d\d:\d\d(?:\.\d+)?Z$/);
    for (const { definition } of clockDefinitions)
      await db.exec(definition.replace(/\bnow\(\)/g, `timestamptz '${at}'`));
  }
  const status = (customer = f.customer, tenant = f.tenantId, location = f.locationId) =>
    f.service(() =>
      scalar("select public.mealdeck_checkout_status_for_customer($1,$2,$3)", [
        tenant,
        location,
        customer,
      ]),
    );
  const publicStatus = () =>
    asActor(
      db,
      null,
      () =>
        scalar("select public.mealdeck_online_checkout_status($1,$2)", [f.tenantId, f.locationId]),
      "anon",
    );
  await check(
    "approved identity stays private after 15:00 while ordinary customers follow unchanged public hours",
    async () => {
      await clock("2026-11-06T16:00:00Z");
      const approved = await status();
      assert.equal(approved.channelOpen, true);
      assert.equal(approved.guestCheckoutEligible, false);
      assert.deepEqual(approved.liveVerification, {
        eligible: true,
        startsAt: "2026-11-06T08:00:00+00:00",
        expiresAt: "2026-11-06T23:00:00+00:00",
      });
      assert.equal(approved.openingOffer.serverNow, "2026-11-06T16:00:00+00:00");
      const ordinary = await status(f.otherCustomer);
      assert.deepEqual(ordinary.liveVerification, { eligible: false });
      assert.equal(ordinary.channelOpen, true);
      assert.equal(ordinary.guestCheckoutEligible, true);
      const publicValue = await publicStatus();
      assert.equal(publicValue.channelOpen, true);
      assert.equal(publicValue.guestCheckoutEligible, true);
      assert.equal(Object.hasOwn(publicValue, "liveVerification"), false);
      for (const value of [
        await status(null),
        await status(f.unverified),
        await status(f.otherCustomer),
        await status(f.customer, id(69991)),
        await status(f.customer, f.tenantId, id(69992)),
      ])
        assert.deepEqual(value.liveVerification, { eligible: false });
    },
  );
  await check(
    "08:00 start and 23:00 expiry are exclusive of surrounding times and do not change weekend hours",
    async () => {
      for (const [at, eligible, publicOpen] of [
        ["2026-11-06T07:59:59Z", false, false],
        ["2026-11-06T08:00:00Z", true, false],
        ["2026-11-06T14:59:59Z", true, false],
        ["2026-11-06T15:00:00Z", true, true],
        ["2026-11-06T22:59:59.999Z", true, true],
        ["2026-11-06T23:00:00Z", false, false],
        ["2026-11-07T12:59:59Z", false, false],
        ["2026-11-07T13:00:00Z", false, true],
        ["2026-11-08T23:00:00Z", false, false],
        ["2026-11-09T00:00:00Z", false, true],
      ]) {
        await clock(at);
        const approved = await status();
        assert.equal(approved.liveVerification.eligible, eligible, at);
        assert.equal(approved.channelOpen, eligible || publicOpen, at);
        const normal = await publicStatus();
        assert.equal(normal.channelOpen, publicOpen, at);
        assert.equal(Object.hasOwn(normal, "liveVerification"), false);
      }
    },
  );
  await check(
    "identity changes, unverified/disabled accounts and paused kitchen cannot gain admission",
    async () => {
      await clock("2026-11-06T16:00:00Z");
      for (const change of [
        "email='changed@example.invalid'",
        "email_confirmed_at=null",
        "is_anonymous=true",
        "deleted_at=now()",
        "banned_until='2026-11-07T00:00:00Z'",
      ]) {
        await db.exec("begin");
        try {
          await db.query(`update auth.users set ${change} where id=$1`, [f.customer]);
          assert.deepEqual((await status()).liveVerification, { eligible: false });
        } finally {
          await db.exec("rollback");
        }
      }
      const beforePaused = (
        await db.query(
          "select checkout_enabled,availability_state from mealdeck_private.checkout_settings",
        )
      ).rows[0];
      try {
        await db.exec(
          "update mealdeck_private.checkout_settings set checkout_enabled=false,availability_state='paused'",
        );
        assert.equal((await status()).channelOpen, false);
        await assert.rejects(() => f.quote(), /checkout_unavailable/);
      } finally {
        await db.query(
          "update mealdeck_private.checkout_settings set checkout_enabled=$1,availability_state=$2",
          [beforePaused.checkout_enabled, beforePaused.availability_state],
        );
      }
    },
  );
  await check(
    "private status clears its actor within the same transaction and after commit",
    async () => {
      await clock("2026-11-06T14:00:00Z");
      await db.exec("begin");
      assert.equal((await status()).channelOpen, true);
      assert.equal(await scalar("select current_setting('mealdeck.launch_test_actor',true)"), "");
      assert.equal((await publicStatus()).channelOpen, false);
      await db.exec("commit");
      assert.equal((await publicStatus()).channelOpen, false);
      await assert.rejects(
        () => f.quote({ actor: f.otherCustomer }),
        /prelaunch_test_account_required/,
      );
    },
  );
  await check(
    "LIVE preparation stays unpaid and invisible to KDS; quote and prepare recheck the 23:00 boundary",
    async () => {
      await clock("2026-11-06T16:00:00Z");
      const quote = await f.quote();
      const prepared = await f.service(() =>
        scalar("select public.mealdeck_prepare_stripe_order($1,$2,$3,'acct_Fixture',true)", [
          quote.quoteId,
          f.customer,
          id(69901),
        ]),
      );
      assert.equal(
        await scalar("select payment_status::text from public.orders where id=$1", [
          prepared.orderId,
        ]),
        "pending",
      );
      assert.equal(
        await scalar("select count(*)::int from public.kds_tickets where order_id=$1", [
          prepared.orderId,
        ]),
        0,
      );
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
          prepared.orderId,
        ]),
        0,
      );
      await assert.rejects(
        () => f.prepare(quote.quoteId, { attemptId: id(69901) }),
        /attempt_conflict/,
      );
      // Ordinary members still use the normal public schedule; this SQL does not
      // replace the app's pending global sign-off gate with an all-member lockout.
      const ordinaryQuote = await f.quote({ actor: f.otherCustomer });
      assert.ok(ordinaryQuote.quoteId);
      assert.equal(quote.grossPence, ordinaryQuote.grossPence);
      assert.equal(quote.discountPence, ordinaryQuote.discountPence);
      assert.equal(quote.discountPence, Math.floor((quote.grossPence * 30 + 50) / 100));
      assert.equal(quote.totalPence, ordinaryQuote.totalPence);
      await clock("2026-11-06T22:59:59Z");
      const lastQuote = await f.quote();
      assert.equal(new Date(lastQuote.expiresAt).toISOString(), "2026-11-06T23:00:00.000Z");
      await clock("2026-11-06T23:00:00Z");
      await assert.rejects(() => f.quote(), /outside_opening_hours/);
      await assert.rejects(
        () => f.prepare(lastQuote.quoteId, { attemptId: id(69902) }),
        /outside_opening_hours/,
      );
      assert.equal(await scalar("select count(*)::int from public.orders"), 1);
    },
  );
  console.log(
    `Live verification continuation: ${checks} checks passed (${db.native ? "native PostgreSQL" : "PGlite"}).`,
  );
} finally {
  await db.close();
}
