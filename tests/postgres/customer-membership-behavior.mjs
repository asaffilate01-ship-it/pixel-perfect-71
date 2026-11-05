import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDatabase, asActor, id } from "./harness.mjs";
import { buildStandaloneSql } from "../../deploy/mealdeck/build.mjs";
import {
  buildCustomerMembershipSql,
  buildManagedCustomerMembershipSql,
} from "../../deploy/mealdeck/customer-membership.mjs";

const db = await createDatabase(process.argv.includes("--native"));
const customer = id(9001),
  other = id(9002),
  unverified = id(9003),
  anonymous = id(9004),
  banned = id(9005),
  deleted = id(9006);
const preferencesOff = { emailMarketing: false, pushMarketing: false, orderNotifications: false };
const policy = "mealdeck-customer-2026-11-05",
  consent = "mealdeck-preferences-2026-11-05";
const endpoint = "https://fcm.googleapis.com/fcm/send/test-endpoint";
const p256dh = "B" + "a".repeat(86),
  auth = "a".repeat(22);
let checks = 0;
async function test(label, run) {
  try {
    await run();
    console.log(`PASS customer membership ${++checks}: ${label}`);
  } catch (error) {
    console.error(`FAIL customer membership: ${label}`);
    throw error;
  }
}
async function rpc(user, name, args = [], role = "authenticated") {
  assert.match(name, /^mealdeck_customer_[a-z_]+$/);
  return asActor(
    db,
    user,
    async () =>
      (
        await db.query(
          `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as result`,
          args,
        )
      ).rows[0].result,
    role,
  );
}
const profile = (user = customer) => rpc(user, "mealdeck_customer_profile");
const register = (user = customer, overrides = []) =>
  rpc(
    user,
    "mealdeck_customer_register",
    ["Test Customer", "+447700900123", false, false, false, policy, consent].map((value, i) =>
      i in overrides ? overrides[i] : value,
    ),
  );
const update = (before, changes = {}) =>
  rpc(before.userId, "mealdeck_customer_update", [
    changes.name ?? before.name,
    changes.phone ?? before.phone,
    changes.emailMarketing ?? before.preferences.emailMarketing,
    changes.pushMarketing ?? before.preferences.pushMarketing,
    changes.orderNotifications ?? before.preferences.orderNotifications,
    before.updatedAt,
    consent,
  ]);
const consentEvents = (user = customer) =>
  db.query(
    "select * from mealdeck_private.customer_consent_events where user_id=$1 order by occurred_at,id",
    [user],
  );
const pushCount = async (user = customer) =>
  (
    await db.query(
      "select count(*)::integer as total from mealdeck_private.customer_push_subscriptions where user_id=$1",
      [user],
    )
  ).rows[0].total;

try {
  await db.exec(await readFile(new URL("./standalone-auth-fixture.sql", import.meta.url), "utf8"));
  await db.exec(buildStandaloneSql());
  const foundationMarker = (await db.query("select * from mealdeck_private.installation")).rows;
  await test("managed extension has one atomic contract and does not alter the frozen foundation", async () => {
    const source = buildCustomerMembershipSql();
    const managed = buildManagedCustomerMembershipSql({
      runnerOwnsTransaction: true,
      singleMigration: true,
    });
    assert.equal(
      managed,
      source
        .split("\n")
        .filter((line) => line !== "begin;" && line !== "commit;")
        .join("\n"),
    );
    for (const invalid of [
      undefined,
      {},
      { runnerOwnsTransaction: true },
      { runnerOwnsTransaction: true, singleMigration: false },
    ])
      assert.throws(
        () => buildManagedCustomerMembershipSql(invalid),
        /one runner-owned atomic transaction/,
      );
    await db.exec("begin");
    await db.exec(managed);
    await db.exec("rollback");
    assert.equal(
      (await db.query("select to_regclass('mealdeck_private.customer_profiles') as relation"))
        .rows[0].relation,
      null,
    );
    await db.exec(source);
    await db.exec(source);
    assert.deepEqual(
      (await db.query("select * from mealdeck_private.installation")).rows,
      foundationMarker,
    );
  });
  await test("registration is available before owner bootstrap but grants no business or staff authority", async () => {
    const result = await rpc(null, "mealdeck_customer_capabilities", [], "anon");
    assert.deepEqual(result, {
      schemaVersion: 1,
      registration: true,
      pushReady: false,
      loyaltyReady: false,
    });
    assert.equal(
      (await db.query("select count(*)::integer as count from public.tenants")).rows[0].count,
      0,
    );
  });
  for (const user of [customer, other, unverified, anonymous, banned, deleted]) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,is_anonymous,banned_until,deleted_at,raw_user_meta_data) values($1,$2,$3,$4,$5,$6,$7)",
      [
        user,
        `${user}@example.test`,
        user === unverified ? null : "2026-11-05T08:00:00Z",
        user === anonymous,
        user === banned ? "2099-01-01T00:00:00Z" : null,
        user === deleted ? "2026-11-05T08:00:00Z" : null,
        JSON.stringify({ email_confirmed: true, role: "owner", registered: true }),
      ],
    );
  }
  await test("anonymous, missing, deleted, banned and unverified users cannot register or forge verification via metadata", async () => {
    await assert.rejects(
      () => rpc(null, "mealdeck_customer_profile", [], "anon"),
      /permission denied/,
    );
    await assert.rejects(() => register(null), /unauthenticated/);
    for (const user of [unverified, anonymous, banned, deleted, id(9999)]) {
      await assert.rejects(() => register(user), /email_verification_required/);
      await assert.rejects(() => profile(user), /email_verification_required/);
      assert.equal(
        (
          await db.query("select mealdeck_private.customer_registration_authority($1) as result", [
            user,
          ])
        ).rows[0].result,
        null,
      );
    }
  });
  await test("verified Auth identity alone is not completed registration", async () => {
    const before = await profile();
    assert.equal(before.registered, false);
    assert.equal(before.userId, customer);
    assert.equal(before.name, null);
    assert.deepEqual(before.preferences, preferencesOff);
  });
  await test("a verified customer can register with name and phone, no address or marketing requirement", async () => {
    const result = await register();
    assert.equal(result.registered, true);
    assert.equal(result.name, "Test Customer");
    assert.equal(result.phone, "+447700900123");
    assert.equal(result.email, `${customer}@example.test`);
    assert.ok(result.emailConfirmedAt);
    assert.deepEqual(result.preferences, preferencesOff);
    assert.deepEqual(result.loyalty, { enabled: false, points: 0, terms: null });
    assert.equal("address" in result, false);
    const events = await consentEvents();
    assert.equal(events.rows.length, 3);
    assert.ok(
      events.rows.every(
        (event) =>
          !event.allowed && event.previous_allowed === null && event.notice_version === consent,
      ),
    );
    assert.equal(
      (await db.query("select count(*)::integer as count from public.mealdeck_ops_staff_access"))
        .rows[0].count,
      0,
    );
  });
  await test("RPC parameters are validated and signup retries never overwrite current consent", async () => {
    const snapshot = await profile();
    const invalids = [
      [""],
      ["\nBad name"],
      ["a".repeat(121)],
      [, "07700900123"],
      [, "http://phone"],
      [, , null],
      [, , , , , "unknown"],
    ];
    for (const overrides of invalids)
      await assert.rejects(() => register(other, overrides), /invalid_profile/);
    const retry = await register(customer, ["Changed Name", "+447700900999", true, true, true]);
    assert.deepEqual(retry, snapshot);
    assert.equal((await consentEvents()).rows.length, 3);
  });
  await test("all customer tables have RLS and no direct API role grants, including service_role", async () => {
    const tables = [
      "customer_profiles",
      "customer_consent_events",
      "customer_features",
      "customer_loyalty_ledger",
      "customer_push_subscriptions",
    ];
    for (const table of tables) {
      assert.equal(
        (
          await db.query("select relrowsecurity as rls from pg_class where oid=$1::regclass", [
            `mealdeck_private.${table}`,
          ])
        ).rows[0].rls,
        true,
      );
      for (const role of ["anon", "authenticated", "service_role"])
        await assert.rejects(
          () =>
            asActor(db, customer, () => db.query(`select * from mealdeck_private.${table}`), role),
          /permission denied/,
        );
    }
    await assert.rejects(
      () =>
        asActor(db, other, () =>
          db.query("select mealdeck_private.customer_registration_authority($1)", [customer]),
        ),
      /permission denied/,
    );
  });
  await test("customer data access is own-user only and function ACLs never rely on client supplied user IDs", async () => {
    await register(other, ["Second Customer", "+447700900456"]);
    const second = await profile(other);
    assert.equal(second.userId, other);
    assert.equal(second.name, "Second Customer");
    const exportData = await rpc(other, "mealdeck_customer_export");
    assert.equal(exportData.profile.userId, other);
    assert.equal(exportData.communicationHistory.length, 3);
    assert.ok(!JSON.stringify(exportData).includes(customer));
    const definitions = (
      await db.query(
        "select p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'mealdeck_customer_%'",
      )
    ).rows;
    assert.ok(definitions.every((row) => row.proconfig.includes('search_path=""')));
  });
  await test("preferences are separately opt-in and append timestamped audit records only for changes", async () => {
    const before = await profile();
    const after = await update(before, { emailMarketing: true, orderNotifications: true });
    assert.deepEqual(after.preferences, {
      emailMarketing: true,
      pushMarketing: false,
      orderNotifications: true,
    });
    assert.notEqual(after.updatedAt, before.updatedAt);
    const events = (await consentEvents()).rows;
    assert.equal(events.length, 5);
    assert.ok(
      events.some(
        (event) =>
          event.channel === "email_marketing" && event.allowed && event.destination === after.email,
      ),
    );
    const unchanged = await update(after);
    assert.deepEqual(unchanged, after);
    assert.equal((await consentEvents()).rows.length, 5);
  });
  await test("stale tabs cannot restore withdrawn consent", async () => {
    const before = await profile();
    const after = await update(before, { emailMarketing: false });
    await assert.rejects(() => update(before, { emailMarketing: true }), /profile_conflict/);
    assert.equal((await profile()).preferences.emailMarketing, false);
    assert.equal((await consentEvents()).rows.length, 6);
    assert.equal(after.registered, true);
  });
  await test("email marketing consent is bound to the consented email and never transfers silently", async () => {
    const consented = await update(await profile(), { emailMarketing: true });
    await db.query("update auth.users set email=$1 where id=$2", [
      "changed@example.test",
      customer,
    ]);
    const moved = await profile();
    assert.equal(moved.registered, true);
    assert.equal(moved.email, "changed@example.test");
    assert.equal(moved.preferences.emailMarketing, false);
    const newlyConsented = await update(moved, { emailMarketing: true });
    assert.equal(newlyConsented.preferences.emailMarketing, true);
    assert.equal(
      (await consentEvents()).rows.filter(
        (event) => event.channel === "email_marketing" && event.allowed,
      ).length,
      3,
    );
    assert.notEqual(newlyConsented.updatedAt, consented.updatedAt);
  });
  await test("push is disabled until its sender is configured, independent of browser permission", async () => {
    await assert.rejects(
      () => rpc(customer, "mealdeck_customer_save_push", [endpoint, p256dh, auth]),
      /push_unavailable/,
    );
    assert.equal(await pushCount(), 0);
    await db.exec(
      "update mealdeck_private.customer_features set push_enabled=true where singleton",
    );
  });
  await test("push requires a saved purpose and rejects arbitrary hosts, credentials and malformed keys", async () => {
    await assert.rejects(
      () => rpc(other, "mealdeck_customer_save_push", [endpoint, p256dh, auth]),
      /push_preference_required/,
    );
    for (const bad of [
      "http://fcm.googleapis.com/send/test",
      "https://127.0.0.1/send/test",
      "https://fcm.googleapis.com@evil.test/path",
      "https://evil.test/send",
      "https://fcm.googleapis.com:443/send/test",
      "https://fcm.googleapis.com.evil.test/path",
    ])
      await assert.rejects(
        () => rpc(customer, "mealdeck_customer_save_push", [bad, p256dh, auth]),
        /invalid_subscription/,
      );
    await assert.rejects(
      () => rpc(customer, "mealdeck_customer_save_push", [endpoint, "invalid", auth]),
      /invalid_subscription/,
    );
    assert.equal(await pushCount(), 0);
  });
  await test("notification endpoints are tied to one account and retries are idempotent", async () => {
    const saved = await rpc(customer, "mealdeck_customer_save_push", [endpoint, p256dh, auth]);
    assert.equal(saved.saved, true);
    const again = await rpc(customer, "mealdeck_customer_save_push", [endpoint, p256dh, auth]);
    assert.equal(again.subscriptionId, saved.subscriptionId);
    assert.equal(await pushCount(), 1);
    assert.deepEqual(await rpc(customer, "mealdeck_customer_has_push", [endpoint]), {
      connected: true,
    });
    assert.deepEqual(await rpc(other, "mealdeck_customer_has_push", [endpoint]), {
      connected: false,
    });
    await update(await profile(other), { pushMarketing: true });
    await assert.rejects(
      () => rpc(other, "mealdeck_customer_save_push", [endpoint, p256dh, auth]),
      /subscription_conflict/,
    );
    await rpc(other, "mealdeck_customer_remove_push", [endpoint]);
    assert.equal(await pushCount(), 1);
  });
  await test("withdrawing both push purposes removes all subscriptions while retaining registration and offer eligibility", async () => {
    await rpc(customer, "mealdeck_customer_save_push", [endpoint + "-second", p256dh, auth]);
    assert.equal(await pushCount(), 2);
    const after = await update(await profile(), {
      pushMarketing: false,
      orderNotifications: false,
      emailMarketing: false,
    });
    assert.equal(after.registered, true);
    assert.deepEqual(after.preferences, preferencesOff);
    assert.equal(await pushCount(), 0);
    assert.deepEqual(await rpc(customer, "mealdeck_customer_has_push", [endpoint]), {
      connected: false,
    });
  });
  await test("loyalty cannot be self-awarded and requires terms before activation", async () => {
    await assert.rejects(
      () =>
        asActor(db, customer, () =>
          db.query(
            "insert into mealdeck_private.customer_loyalty_ledger(user_id,event_key,points,reason) values($1,'forged',999,'Forged')",
            [customer],
          ),
        ),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.exec(
          "update mealdeck_private.customer_features set loyalty_enabled=true,loyalty_terms=null where singleton",
        ),
      /check constraint/,
    );
    assert.deepEqual((await profile()).loyalty, { enabled: false, points: 0, terms: null });
  });
  await test("revoked Auth identity immediately loses registered-customer authority", async () => {
    await db.query("update auth.users set email_confirmed_at=null where id=$1", [customer]);
    await assert.rejects(() => profile(), /email_verification_required/);
    assert.equal(
      (
        await db.query("select mealdeck_private.customer_registration_authority($1) as result", [
          customer,
        ])
      ).rows[0].result,
      null,
    );
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [customer]);
    assert.equal((await profile()).registered, true);
  });
  await test("deleting an Auth account removes its profile, subscriptions, consent log and loyalty records", async () => {
    await rpc(other, "mealdeck_customer_save_push", [endpoint + "-other", p256dh, auth]);
    await db.query("delete from auth.users where id=$1", [other]);
    for (const table of [
      "customer_profiles",
      "customer_consent_events",
      "customer_push_subscriptions",
      "customer_loyalty_ledger",
    ])
      assert.equal(
        (
          await db.query(
            `select count(*)::integer as count from mealdeck_private.${table} where user_id=$1`,
            [other],
          )
        ).rows[0].count,
        0,
      );
  });
  console.log(
    `Completed ${checks} customer membership behavior groups on ${db.native ? "native PostgreSQL" : "embedded PostgreSQL"}.`,
  );
} finally {
  await db.close();
}
