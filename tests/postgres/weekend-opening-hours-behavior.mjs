import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDatabase } from "./harness.mjs";
import {
  buildWeekendOpeningHoursSql,
  buildManagedWeekendOpeningHoursSql,
} from "../../deploy/mealdeck/weekend-opening-hours.mjs";

// A disposable real-SQL fixture for this pure helper. No customer/payment
// machinery is needed: the actual historical helper and current wrapper are
// read unchanged from their migrations, with only installation/settings context.
const db = await createDatabase(process.argv.includes("--native"));
const scalar = async (sql, values = []) => Object.values((await db.query(sql, values)).rows[0])[0];
const originalSource = await readFile(
  new URL(
    "../../deploy/mealdeck/post-install-migrations/20261105143652_mealdeck_opening_guest_checkout.sql",
    import.meta.url,
  ),
  "utf8",
);
const original = originalSource.match(
  /create function mealdeck_private\.launch_window_at\(p_at timestamptz\)[\s\S]*?\n\$\$;/,
)?.[0];
assert.ok(original);
const live = original
  .replace("2026-11-06 23:00:00 Europe/London", "2026-11-07 00:00:00 Europe/London")
  .replace("2026-11-07 23:00:00 Europe/London", "2026-11-08 00:00:00 Europe/London");
const wrapperSource = await readFile(
  new URL(
    "../../deploy/mealdeck/post-install-migrations/20261106151511_mealdeck_live_verification_continuation.sql",
    import.meta.url,
  ),
  "utf8",
);
const wrapper = wrapperSource.match(
  /create or replace function mealdeck_private\.launch_window\(\)[\s\S]*?\nend \$\$;/,
)?.[0];
assert.ok(wrapper);
const managed = buildManagedWeekendOpeningHoursSql({
  runnerOwnsTransaction: true,
  singleMigration: true,
});
const hash = () =>
  scalar(
    "select md5(prosrc) from pg_proc where oid='mealdeck_private.launch_window_at(timestamptz)'::regprocedure",
  );
const preserved = () =>
  scalar(`select jsonb_build_object(
  'wrapper',pg_get_functiondef('mealdeck_private.launch_window()'::regprocedure),
  'routineSecurity',(select jsonb_agg(jsonb_build_object('oid',p.oid,'owner',p.proowner,
    'acl',p.proacl::text,'definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,
    'strict',p.proisstrict,'parallel',p.proparallel,'language',p.prolang) order by p.proname)
    from pg_proc p where p.oid in ('mealdeck_private.launch_window()'::regprocedure,
      'mealdeck_private.launch_window_at(timestamptz)'::regprocedure)),
  'settings',(select jsonb_agg(to_jsonb(s)) from mealdeck_private.checkout_settings s))`);
let checks = 0;
const check = async (label, fn) => {
  await fn();
  console.log(`PASS weekend opening hours ${++checks}: ${label}`);
};

try {
  await db.exec(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
    create schema mealdeck_private;
    create table mealdeck_private.installation(singleton boolean primary key,profile text,business_id uuid);
    insert into mealdeck_private.installation values(true,'mealdeck-independent-v1','00000000-0000-4000-8000-000000000001');
    create table mealdeck_private.checkout_settings(tenant_id uuid,location_id uuid,
      checkout_enabled boolean,availability_state text,collection_estimate_minutes integer);
    insert into mealdeck_private.checkout_settings values('00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',false,'closed',30);
  `);
  await db.exec(original);
  await db.exec(wrapper);
  await db.exec(`revoke all on function mealdeck_private.launch_window_at(timestamptz),
    mealdeck_private.launch_window() from public,anon,authenticated,service_role`);

  for (const [name, sql, baselineHash] of [
    ["original installation", original, "3656af8909e8939f3c17e7e202320df2"],
    ["live midnight extension", live, "37a9eddb4ba0fe55a04b3fbc777a7914"],
  ]) {
    await check(
      `${name} updates, reruns safely and preserves wrapper, ACL and Closed state`,
      async () => {
        await db.exec(sql.replace("create function", "create or replace function"));
        assert.equal(await hash(), baselineHash);
        const before = await preserved();
        await db.exec(buildWeekendOpeningHoursSql());
        assert.equal(await hash(), "979f623039044e22178c0192bd045aa9");
        assert.deepEqual(await preserved(), before);
        await db.exec(buildWeekendOpeningHoursSql());
        assert.equal(await hash(), "979f623039044e22178c0192bd045aa9");
        assert.deepEqual(await preserved(), before);
      },
    );
  }

  await check("3pm weekend starts, unchanged closes, null and post-weekend behaviour", async () => {
    const cases = [
      [null, false, false, null],
      ["2026-11-06T14:59:59.999Z", false, false, null],
      ["2026-11-06T15:00:00Z", true, true, "2026-11-07T00:00:00.000Z"],
      ["2026-11-06T23:59:59.999Z", true, true, "2026-11-07T00:00:00.000Z"],
      ["2026-11-07T00:00:00Z", false, false, null],
      ["2026-11-07T13:00:00Z", false, false, null],
      ["2026-11-07T14:59:59.999Z", false, false, null],
      ["2026-11-07T15:00:00Z", true, true, "2026-11-08T00:00:00.000Z"],
      ["2026-11-07T23:59:59.999Z", true, true, "2026-11-08T00:00:00.000Z"],
      ["2026-11-08T00:00:00Z", false, false, null],
      ["2026-11-08T13:00:00Z", false, false, null],
      ["2026-11-08T14:59:59.999Z", false, false, null],
      ["2026-11-08T15:00:00Z", true, true, "2026-11-08T23:00:00.000Z"],
      ["2026-11-08T22:59:59.999Z", true, true, "2026-11-08T23:00:00.000Z"],
      ["2026-11-08T23:00:00Z", false, false, null],
      ["2026-11-09T00:00:00Z", true, false, null],
    ];
    for (const [at, ordering, guest, closes] of cases) {
      const value = await scalar("select mealdeck_private.launch_window_at($1::timestamptz)", [at]);
      assert.equal(value.orderingOpen, ordering, String(at));
      assert.equal(value.guestEligible, guest, String(at));
      assert.equal(
        value.currentClosesAt === null ? null : new Date(value.currentClosesAt).toISOString(),
        closes,
      );
      assert.equal(value.timezone, "Europe/London");
      assert.equal(Date.parse(value.startsAt), Date.parse("2026-11-06T15:00:00Z"));
      assert.equal(Date.parse(value.endsAt), Date.parse("2026-11-08T23:00:00Z"));
    }
  });

  for (const [label, damage, reason] of [
    ["unrelated profile", "create schema dishbee_private", /independent_profile_required/],
    [
      "unknown helper body",
      "create or replace function mealdeck_private.launch_window_at(p_at timestamptz) returns jsonb language sql immutable security definer set search_path='' as $$select '{}'::jsonb$$",
      /unreviewed_definition/,
    ],
    [
      "changed helper security",
      "alter function mealdeck_private.launch_window_at(timestamptz) security invoker",
      /unreviewed_definition/,
    ],
    [
      "public execution grant",
      "grant execute on function mealdeck_private.launch_window_at(timestamptz) to anon",
      /private_helper_required/,
    ],
  ]) {
    await check(`${label} is rejected atomically`, async () => {
      await db.exec("begin");
      try {
        await db.exec(damage);
        const before = await preserved();
        const beforeHash = await hash();
        await db.exec("savepoint attempt");
        await assert.rejects(() => db.exec(managed), reason);
        await db.exec("rollback to savepoint attempt");
        assert.equal(await hash(), beforeHash);
        assert.deepEqual(await preserved(), before);
      } finally {
        await db.exec("rollback");
      }
    });
  }

  await check("private helper remains unavailable to all API roles", async () => {
    for (const role of ["anon", "authenticated", "service_role"])
      assert.equal(
        await scalar(
          "select has_function_privilege($1,'mealdeck_private.launch_window_at(timestamptz)','EXECUTE')",
          [role],
        ),
        false,
      );
    assert.throws(
      () => buildManagedWeekendOpeningHoursSql({ runnerOwnsTransaction: true }),
      /one runner-owned/,
    );
  });
  console.log(`PASS ${checks} weekend opening-hours SQL checks`);
} finally {
  await db.close();
}
