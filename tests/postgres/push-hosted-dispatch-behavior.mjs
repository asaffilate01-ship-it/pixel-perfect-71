import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { asActor, createDatabase } from "./harness.mjs";
import { setupPaidOrderNumbersFixture } from "./paid-order-numbers-fixture.mjs";
import { buildPaidOrderNumbersSql } from "../../deploy/mealdeck/paid-order-numbers.mjs";
import { buildCustomerPushSql } from "../../deploy/mealdeck/customer-push.mjs";

// Stand-ins exist only in this disposable PostgreSQL fixture. They record calls
// locally, never schedule a job, perform HTTP, encrypt a secret or contact Vault.
const netStub = `
create or replace function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer)
returns bigint language plpgsql security definer set search_path='' as $$
declare request bigint;
begin
  insert into net.http_request_queue(url,body,headers,timeout_milliseconds)
    values($1,$2,$3,$4) returning id into request;
  return request;
end $$;`;

const db = await createDatabase(process.argv.includes("--native"));
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
let checks = 0;
async function check(name, run) {
  try {
    await run();
    console.log(`PASS hosted push ${++checks}: ${name}`);
  } catch (error) {
    console.error(`FAIL hosted push: ${name}: ${error.message}`, error.where ?? "");
    throw error;
  }
}

try {
  const f = await setupPaidOrderNumbersFixture(db);
  await db.exec(buildPaidOrderNumbersSql());
  await db.exec(buildCustomerPushSql());
  await db.exec(`
    create schema vault;
    create table vault.secrets(id uuid primary key,secret text);
    create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;
    revoke all on vault.secrets,vault.decrypted_secrets from public,anon,authenticated,service_role;
    create schema net;
    create table net.http_request_queue(id bigint generated always as identity primary key,url text,body jsonb,headers jsonb,timeout_milliseconds integer);
    create table net._http_response(id bigint primary key,status integer);
    create schema cron;
    create table cron.job(jobid bigint generated always as identity primary key,name text unique,schedule text,command text);
    create function cron.schedule(job_name text,schedule text,command text) returns bigint language plpgsql set search_path='' as $$
    declare job bigint;
    begin
      insert into cron.job(name,schedule,command) values($1,$2,$3)
        on conflict(name) do update set schedule=excluded.schedule,command=excluded.command returning jobid into job;
      return job;
    end $$;
  `);
  await db.exec(netStub);
  const source = await readFile(
    new URL(
      "../../deploy/mealdeck/post-install-migrations/20261107084448_mealdeck_push_hosted_dispatch.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const installedVaultGuard =
    "or not exists(select 1 from pg_extension where extname='supabase_vault')";
  assert.equal(source.split(installedVaultGuard).length, 2);
  let fixtureSql = source.replace(installedVaultGuard, "or to_regclass('vault.secrets') is null");
  for (const declaration of [
    "create extension if not exists pg_cron;",
    "create extension if not exists pg_net;",
  ]) {
    assert.equal(fixtureSql.split(declaration).length, 2);
    fixtureSql = fixtureSql.replace(
      declaration,
      "-- Supabase extension simulated only by this disposable fixture.",
    );
  }
  const config = (tenant = f.tenantId, location = f.locationId, role = "service_role") =>
    asActor(
      db,
      null,
      () => scalar("select public.mealdeck_push_runtime_config($1,$2)", [tenant, location]),
      role,
    );
  const seen = (tenant = f.tenantId, location = f.locationId, role = "service_role") =>
    asActor(
      db,
      null,
      () => scalar("select public.mealdeck_push_worker_seen($1,$2)", [tenant, location]),
      role,
    );
  const dispatch = () => scalar("select mealdeck_private.dispatch_customer_push()");
  const count = () => scalar("select count(*)::int from net.http_request_queue");
  const resetThrottle = () =>
    db.exec(
      "update mealdeck_private.push_runtime_configuration set last_dispatch_at=now()-interval '10 seconds'",
    );
  const secretId = f.next();
  const bundle = {
    publicKey: "fixture-public-key",
    privateKey: "fixture-private-key",
    subject: "mailto:fixture@example.invalid",
    workerSecret: "w".repeat(43),
  };

  await check(
    "hosted installation and rerun are dormant and never enable customer sends",
    async () => {
      await db.exec(fixtureSql);
      await db.exec(fixtureSql);
      assert.equal(
        await scalar("select push_enabled from mealdeck_private.customer_features where singleton"),
        false,
      );
      assert.equal(await count(), 0);
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.push_runtime_configuration"),
        0,
      );
      assert.deepEqual(await config(), { enabled: false });
      assert.equal(await dispatch(), null);
      assert.equal(await scalar("select count(*)::int from cron.job"), 1);
      const job = (await db.query("select * from cron.job")).rows[0];
      assert.equal(job.schedule, "30 seconds");
      assert.equal(job.command, "select mealdeck_private.dispatch_customer_push()");
      for (const value of Object.values(bundle)) assert.equal(job.command.includes(value), false);
    },
  );

  await db.query("insert into vault.secrets(id,secret) values($1,$2)", [
    secretId,
    JSON.stringify(bundle),
  ]);
  await db.query(
    "insert into mealdeck_private.push_runtime_configuration(tenant_id,location_id,vault_secret_id) values($1,$2,$3)",
    [f.tenantId, f.locationId, secretId],
  );
  await check(
    "private runtime credentials and health cannot be read or mutated by API users",
    async () => {
      assert.equal(
        await scalar(
          "select relrowsecurity from pg_class where oid='mealdeck_private.push_runtime_configuration'::regclass",
        ),
        true,
      );
      for (const role of ["anon", "authenticated"]) {
        await assert.rejects(() => config(f.tenantId, f.locationId, role), /permission denied/);
        await assert.rejects(() => seen(f.tenantId, f.locationId, role), /permission denied/);
      }
      for (const role of ["anon", "authenticated", "service_role"]) {
        for (const relation of [
          "mealdeck_private.push_runtime_configuration",
          "net.http_request_queue",
          "net._http_response",
          "vault.decrypted_secrets",
        ]) {
          await assert.rejects(
            () => asActor(db, f.customer, () => db.query("select * from " + relation), role),
            /permission denied/,
          );
        }
        await assert.rejects(() => asActor(db, null, dispatch, role), /permission denied/);
      }
      assert.deepEqual(await config(), { enabled: false });
      assert.deepEqual(await seen(), { recorded: false });
    },
  );

  await check(
    "service configuration lookup and worker heartbeat require the exact enabled MealDeck scope",
    async () => {
      await db.exec(
        "update mealdeck_private.push_runtime_configuration set enabled=true where singleton",
      );
      assert.deepEqual(await config(), { enabled: true, ...bundle });
      assert.deepEqual(await config(f.next(), f.locationId), { enabled: false });
      assert.deepEqual(await config(f.tenantId, f.next()), { enabled: false });
      assert.deepEqual(await seen(f.next(), f.locationId), { recorded: false });
      assert.equal(
        await scalar("select last_worker_at from mealdeck_private.push_runtime_configuration"),
        null,
      );
      assert.deepEqual(await seen(), { recorded: true });
      assert.ok(
        await scalar("select last_worker_at from mealdeck_private.push_runtime_configuration"),
      );
      assert.equal(await dispatch(), null, "customer push feature is still disabled");
    },
  );

  await check(
    "dispatcher uses one fixed MealDeck HTTPS route, empty body and a Vault-derived bearer",
    async () => {
      await db.exec(
        "update mealdeck_private.customer_features set push_enabled=true where singleton",
      );
      await db.exec("update mealdeck_private.push_runtime_configuration set last_worker_at=null");
      const request = await dispatch();
      assert.ok(request);
      assert.equal(await count(), 1);
      const call = (await db.query("select * from net.http_request_queue where id=$1", [request]))
        .rows[0];
      assert.equal(call.url, "https://mealdeck.co.uk/api/notifications/worker");
      assert.deepEqual(call.body, {});
      assert.deepEqual(call.headers, {
        "Content-Type": "application/json",
        Authorization: "Bearer " + bundle.workerSecret,
      });
      assert.equal(call.timeout_milliseconds, 30000);
      assert.equal(
        JSON.stringify(call).includes(bundle.privateKey),
        false,
        "VAPID private key is never dispatched",
      );
      assert.equal(await dispatch(), null, "short throttle coalesces immediate wakeups");
      assert.equal(await count(), 1);
    },
  );

  await check(
    "recent idle heartbeat suppresses work, and pausing either feature/runtime stops dispatch",
    async () => {
      await resetThrottle();
      await seen();
      assert.equal(await dispatch(), null);
      await db.exec(
        "update mealdeck_private.push_runtime_configuration set last_worker_at=now()-interval '2 minutes'",
      );
      assert.ok(await dispatch());
      const before = await count();
      await resetThrottle();
      await db.exec("update mealdeck_private.push_runtime_configuration set enabled=false");
      assert.equal(await dispatch(), null);
      await db.exec("update mealdeck_private.push_runtime_configuration set enabled=true");
      await db.exec("update mealdeck_private.customer_features set push_enabled=false");
      assert.equal(await dispatch(), null);
      assert.equal(await count(), before);
      await db.exec("update mealdeck_private.customer_features set push_enabled=true");
    },
  );

  const order = await f.ordinary({ guest: true });
  await f.service(() =>
    scalar(
      "select public.mealdeck_push_order_subscription($1,$2,$3,null,$4,'subscribe',$5,$6,$7)",
      [
        f.tenantId,
        f.locationId,
        order.orderId,
        order.token,
        "https://fcm.googleapis.com/fcm/send/hosted-fixture",
        "B" + "a".repeat(86),
        "a".repeat(22),
      ],
    ),
  );
  await check(
    "a failing HTTP wakeup cannot roll back canonical acceptance, receipt or durable outbox",
    async () => {
      await resetThrottle();
      await db.exec(`create or replace function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer)
      returns bigint language plpgsql set search_path='' as $$ begin raise exception 'fixture_transport_failure'; end $$`);
      const before = await count();
      await f.accept(order.orderId);
      assert.ok(await scalar("select accepted_at from public.orders where id=$1", [order.orderId]));
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
          order.orderId,
        ]),
        1,
      );
      assert.equal(
        await scalar(
          "select count(*)::int from mealdeck_private.push_outbox j join mealdeck_private.push_events e on e.id=j.event_id where e.order_id=$1 and j.status='queued'",
          [order.orderId],
        ),
        1,
      );
      assert.equal(await count(), before);
      assert.equal(await dispatch(), null);
      await db.exec(netStub);
      assert.ok(await dispatch(), "cron can retry the persisted outbox after transport recovers");
    },
  );

  await check(
    "new durable queue work wakes the fixed worker without waiting for an idle heartbeat",
    async () => {
      await resetThrottle();
      await seen();
      const before = await count();
      const card = await f.card(order.orderId);
      await f.staff("mealdeck_ops_kds_transition_order", [
        f.tenantId,
        f.locationId,
        order.orderId,
        card.version,
        "preparing",
      ]);
      assert.equal(await count(), before + 1);
      const request = (
        await db.query("select * from net.http_request_queue order by id desc limit 1")
      ).rows[0];
      assert.deepEqual(request.body, {});
      assert.equal(request.url, "https://mealdeck.co.uk/api/notifications/worker");
    },
  );

  await check(
    "missing or malformed Vault worker credential fails closed and reruns preserve current settings",
    async () => {
      await resetThrottle();
      const before = await count();
      for (const secret of [
        JSON.stringify({ ...bundle, workerSecret: null }),
        JSON.stringify({ ...bundle, workerSecret: "short" }),
        JSON.stringify({ ...bundle, workerSecret: "w".repeat(257) }),
        "invalid json",
      ]) {
        await db.query("update vault.secrets set secret=$1 where id=$2", [secret, secretId]);
        assert.equal(await dispatch(), null);
        assert.equal(await count(), before);
      }
      for (const length of [32, 256]) {
        await resetThrottle();
        await db.query("update vault.secrets set secret=$1 where id=$2", [
          JSON.stringify({ ...bundle, workerSecret: "w".repeat(length) }),
          secretId,
        ]);
        const request = await dispatch();
        assert.ok(request, `valid ${length}-character worker token must compile and dispatch`);
        assert.equal(
          await scalar("select headers->>'Authorization' from net.http_request_queue where id=$1", [
            request,
          ]),
          "Bearer " + "w".repeat(length),
        );
      }
      await db.query("update vault.secrets set secret=$1 where id=$2", [
        JSON.stringify(bundle),
        secretId,
      ]);
      await db.exec(fixtureSql);
      assert.deepEqual(await config(), { enabled: true, ...bundle });
      assert.equal(await scalar("select count(*)::int from cron.job"), 1);
      assert.equal(await count(), before + 2);
    },
  );

  console.log(
    `Completed ${checks} hosted dispatcher checks with local stand-ins. No real HTTP, cron or Vault action executed.`,
  );
} finally {
  await db.close();
}
