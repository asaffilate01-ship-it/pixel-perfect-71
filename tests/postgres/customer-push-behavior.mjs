import assert from "node:assert/strict";
import { asActor, createDatabase } from "./harness.mjs";
import { setupPaidOrderNumbersFixture } from "./paid-order-numbers-fixture.mjs";
import { buildPaidOrderNumbersSql } from "../../deploy/mealdeck/paid-order-numbers.mjs";
import {
  buildCustomerPushSql,
  buildManagedCustomerPushSql,
} from "../../deploy/mealdeck/customer-push.mjs";

const db = await createDatabase(process.argv.includes("--native"));
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const p256dh = "B" + "a".repeat(86),
  auth = "a".repeat(22);
const endpoint = (name) => "https://fcm.googleapis.com/fcm/send/fixture-" + name;
let checks = 0;
async function check(name, run) {
  try {
    await run();
    console.log(`PASS customer push ${++checks}: ${name}`);
  } catch (error) {
    console.error(`FAIL customer push: ${name}: ${error.message}`, error.where ?? "");
    throw error;
  }
}

try {
  const f = await setupPaidOrderNumbersFixture(db);
  await db.exec(buildPaidOrderNumbersSql());
  // Supabase-owned Auth table: fixture only, never part of the application migration.
  await db.exec(
    "create table auth.mfa_factors(id uuid primary key,user_id uuid not null references auth.users(id),status text not null)",
  );
  const rpc = (name, args = [], user = null, role = "service_role") => {
    assert.match(name, /^mealdeck_(?:push_|customer_)/);
    return asActor(
      db,
      user,
      () => scalar(`select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")})`, args),
      role,
    );
  };
  const memberRpc = (name, args = [], user = f.customer) => rpc(name, args, user, "authenticated");
  const scope = [f.tenantId, f.locationId];
  const subscribe = (o, name, action = "subscribe", options = {}) =>
    rpc("mealdeck_push_order_subscription", [
      options.tenant ?? f.tenantId,
      options.location ?? f.locationId,
      o.orderId,
      options.actor === undefined ? (o.token ? null : f.customer) : options.actor,
      options.token === undefined ? (o.token ?? null) : options.token,
      action,
      name ? endpoint(name) : null,
      action === "subscribe" ? (options.key ?? p256dh) : null,
      action === "subscribe" ? (options.auth ?? auth) : null,
    ]);
  const claim = (limit = 50) => rpc("mealdeck_push_claim", [...scope, limit]);
  const preflight = (job) => rpc("mealdeck_push_preflight", [...scope, job.jobId, job.leaseToken]);
  const finish = (job, outcome = "accepted", status = 201) =>
    rpc("mealdeck_push_finish", [...scope, job.jobId, job.leaseToken, outcome, status]);
  const eventRows = (o) =>
    db.query(
      "select stage,id from mealdeck_private.push_events where order_id=$1 order by occurred_at",
      [o.orderId],
    );
  const orderJobs = (o) =>
    db.query(
      "select j.*,e.stage from mealdeck_private.push_outbox j join mealdeck_private.push_events e on e.id=j.event_id where e.order_id=$1 order by e.occurred_at,j.id",
      [o.orderId],
    );
  const stage = (o) => scalar("select mealdeck_private.push_current_order_stage($1)", [o.orderId]);
  const act = (o, name, values) => f.staff(name, [...scope, o.orderId, ...values]);
  const prepare = async (o) =>
    act(o, "mealdeck_ops_kds_transition_order", [(await f.card(o.orderId)).version, "preparing"]);
  const readyItems = async (o) => {
    for (const item of (await f.card(o.orderId)).items) {
      await act(o, "mealdeck_ops_kds_set_item_ready", [
        item.order_item_id,
        (await f.card(o.orderId)).version,
        true,
      ]);
    }
  };
  const pack = async (o, seal = true) => {
    await act(o, "mealdeck_ops_kds_transition_pass", [
      (await f.card(o.orderId)).pass.version,
      "packing",
    ]);
    if (seal)
      await act(o, "mealdeck_ops_kds_transition_pass", [
        (await f.card(o.orderId)).pass.version,
        "sealed",
      ]);
  };
  const complete = async (o) =>
    act(o, "mealdeck_ops_kds_complete_handoff", [
      (await f.card(o.orderId)).version,
      await scalar("select handoff_code from public.orders where id=$1", [o.orderId]),
    ]);
  const updatePreferences = async (changes, user = f.customer) => {
    const p = await memberRpc("mealdeck_customer_profile", [], user);
    return memberRpc(
      "mealdeck_customer_update",
      [
        p.name,
        p.phone,
        changes.emailMarketing ?? p.preferences.emailMarketing,
        changes.pushMarketing ?? p.preferences.pushMarketing,
        changes.orderNotifications ?? p.preferences.orderNotifications,
        p.updatedAt,
        "mealdeck-preferences-2026-11-05",
      ],
      user,
    );
  };
  const saveAccountDevice = (name, user = f.customer) =>
    memberRpc("mealdeck_customer_save_push", [endpoint(name), p256dh, auth], user);
  const campaign = (name, args = [], user = f.owner) =>
    rpc("mealdeck_push_campaign_" + name, [...scope, ...args], user, "authenticated");
  const draft = (title = "A MealDeck offer", path = "/offers") =>
    campaign("prepare", [
      title,
      "Explore our current offers and full terms.",
      path,
      new Date(Date.now() + 3_600_000).toISOString(),
    ]);
  const discardOpenJobs = () =>
    db.exec(
      "update mealdeck_private.push_outbox set status='skipped' where status in ('queued','leased','sending','retry')",
    );

  const historic = await f.ordinary();
  await f.accept(historic.orderId);
  const historicalReceipt = await scalar(
    "select receipt from mealdeck_private.receipt_jobs where order_id=$1",
    [historic.orderId],
  );
  const canonicalDefinitions = await db.query(
    "select oid::regprocedure::text signature,md5(prosrc) body from pg_proc where oid in ('mealdeck_private.kds_release_authority(uuid)'::regprocedure,'public.mealdeck_ops_kds_accept_order(uuid,uuid,uuid,text)'::regprocedure,'public.mealdeck_reconcile_stripe_event(text,text,text,uuid,text,text,text,boolean,text,integer,integer,boolean)'::regprocedure) order by oid",
  );
  await check(
    "atomic installation and rerun preserve payment/KDS authority, receipts and disabled feature; no historic backfill",
    async () => {
      assert.throws(() => buildManagedCustomerPushSql({ runnerOwnsTransaction: true }), /atomic/);
      const managed = buildManagedCustomerPushSql({
        runnerOwnsTransaction: true,
        singleMigration: true,
      });
      await db.exec("begin");
      await db.exec(managed);
      await db.exec("rollback");
      assert.equal(await scalar("select to_regclass('mealdeck_private.push_events')"), null);
      await db.exec(buildCustomerPushSql());
      await db.exec(buildCustomerPushSql());
      assert.equal(
        await scalar("select push_enabled from mealdeck_private.customer_features where singleton"),
        false,
      );
      assert.equal(await scalar("select count(*)::int from mealdeck_private.push_events"), 0);
      assert.deepEqual(
        await scalar("select receipt from mealdeck_private.receipt_jobs where order_id=$1", [
          historic.orderId,
        ]),
        historicalReceipt,
      );
      assert.deepEqual(
        (
          await db.query(
            "select oid::regprocedure::text signature,md5(prosrc) body from pg_proc where oid=any($1::regprocedure[]) order by oid",
            [canonicalDefinitions.rows.map((r) => r.signature)],
          )
        ).rows,
        canonicalDefinitions.rows,
      );
    },
  );

  await check(
    "all private transport/consent/queue tables have RLS and no direct API grants",
    async () => {
      for (const name of [
        "order_push_subscriptions",
        "order_push_consent_events",
        "push_events",
        "push_outbox",
        "push_campaigns",
      ]) {
        assert.equal(
          await scalar("select relrowsecurity from pg_class where oid=$1::regclass", [
            "mealdeck_private." + name,
          ]),
          true,
        );
        for (const role of ["anon", "authenticated", "service_role"]) {
          await assert.rejects(
            () =>
              asActor(
                db,
                f.customer,
                () => db.query("select * from mealdeck_private." + name),
                role,
              ),
            /permission denied/,
          );
        }
      }
      for (const role of ["anon", "authenticated"]) {
        await assert.rejects(
          () => rpc("mealdeck_push_claim", [...scope, 10], f.owner, role),
          /permission denied/,
        );
        await assert.rejects(
          () =>
            rpc(
              "mealdeck_push_order_subscription",
              [...scope, historic.orderId, f.customer, null, "state", null],
              f.customer,
              role,
            ),
          /permission denied/,
        );
      }
      await assert.rejects(
        () => rpc("mealdeck_push_campaign_list", scope, f.owner, "service_role"),
        /permission denied/,
      );
    },
  );

  await check(
    "disabled feature cannot subscribe or claim, and enabling never backfills historic stages",
    async () => {
      assert.deepEqual(await claim(), { jobs: [] });
      assert.equal((await subscribe(historic, "disabled", "state")).enabled, false);
      await assert.rejects(() => subscribe(historic, "disabled"), /push_unavailable/);
      await db.exec(
        "update mealdeck_private.customer_features set push_enabled=true where singleton",
      );
      await db.query("update public.orders set accepted_at=accepted_at,status=status where id=$1", [
        historic.orderId,
      ]);
      assert.equal((await eventRows(historic)).rows.length, 0);
    },
  );

  const guest = await f.ordinary({ guest: true, fulfilment: "curbside" });
  await check(
    "guest opt-in requires the original scoped cookie, real paid order and supported push service",
    async () => {
      assert.equal(await stage(guest), null, "verified payment alone is not staff acceptance");
      for (const options of [
        { token: "a".repeat(64) },
        { token: null },
        { actor: f.customer },
        { actor: f.customer, token: null },
        { tenant: f.next() },
        { location: f.next() },
      ])
        await assert.rejects(
          () => subscribe(guest, "guest", "subscribe", options),
          /order_unavailable/,
        );
      for (const bad of [
        "https://127.0.0.1/push",
        "https://fcm.googleapis.com.evil.test/push",
        "https://fcm.googleapis.com:444/push",
        "https://user@fcm.googleapis.com/push",
        "http://fcm.googleapis.com/push",
      ]) {
        await assert.rejects(
          () =>
            rpc("mealdeck_push_order_subscription", [
              ...scope,
              guest.orderId,
              null,
              guest.token,
              "subscribe",
              bad,
              p256dh,
              auth,
            ]),
          /invalid_subscription/,
        );
      }
      await assert.rejects(
        () => subscribe(guest, "guest", "subscribe", { key: "bad" }),
        /invalid_subscription/,
      );
      const before = await scalar("select count(*)::int from mealdeck_private.customer_profiles");
      const saved = await subscribe(guest, "guest");
      assert.equal(saved.saved, true);
      assert.equal(saved.connected, true);
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.customer_profiles"),
        before,
      );
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.customer_push_subscriptions"),
        0,
      );
      await subscribe(guest, "guest");
      assert.equal(
        await scalar(
          "select count(*)::int from mealdeck_private.order_push_consent_events where order_id=$1 and allowed",
          [guest.orderId],
        ),
        1,
      );
      const pending = await f.prepareOrdinary();
      await assert.rejects(() => subscribe(pending, "unpaid"), /push_unavailable/);
    },
  );

  await check("guest and account endpoints cannot be reassigned to another identity", async () => {
    const anotherGuest = await f.ordinary({ guest: true });
    await assert.rejects(() => subscribe(anotherGuest, "guest"), /subscription_conflict/);
    await updatePreferences({ pushMarketing: true });
    await assert.rejects(() => saveAccountDevice("guest"), /subscription_conflict/);
    await saveAccountDevice("member-only");
    await assert.rejects(() => subscribe(guest, "member-only"), /subscription_conflict/);
  });

  await check(
    "staff acceptance creates exactly one event/job and duplicate acceptance keeps one receipt",
    async () => {
      await f.accept(guest.orderId);
      await f.accept(guest.orderId);
      assert.equal(await stage(guest), "accepted");
      assert.deepEqual(
        (await eventRows(guest)).rows.map((e) => e.stage),
        ["accepted"],
      );
      assert.equal((await orderJobs(guest)).rows.length, 1);
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
          guest.orderId,
        ]),
        1,
      );
      const jobs = await claim();
      assert.equal(jobs.jobs.length, 1);
      const payload = await preflight(jobs.jobs[0]);
      assert.equal(payload.send, true);
      assert.equal(payload.payload.stage, "accepted");
      assert.equal(payload.payload.checkoutMode, "guest");
      assert.equal(payload.payload.fulfilment, "curbside");
      assert.equal(payload.payload.orderId, guest.orderId);
      for (const forbidden of [
        "handoffCode",
        "handoff_code",
        "customerName",
        "phone",
        "payment",
        "vehicle",
        "address",
      ])
        assert.equal(JSON.stringify(payload.payload).includes(forbidden), false);
      assert.ok(payload.ttlSeconds > 0 && payload.ttlSeconds <= 1800);
      assert.deepEqual(
        await preflight(jobs.jobs[0]),
        { send: false },
        "same lease cannot authorize two sends",
      );
      await finish(jobs.jobs[0]);
      assert.deepEqual(await finish(jobs.jobs[0]), { recorded: false });
    },
  );

  await check(
    "ready notification waits for every item and sealed packing, not kitchen readiness alone",
    async () => {
      await prepare(guest);
      assert.equal(await stage(guest), "preparing");
      await readyItems(guest);
      assert.equal(await stage(guest), "preparing");
      assert.deepEqual(
        (await eventRows(guest)).rows.map((e) => e.stage),
        ["accepted", "preparing"],
      );
      await pack(guest, false);
      assert.equal(await stage(guest), "preparing");
      await act(guest, "mealdeck_ops_kds_transition_pass", [
        (await f.card(guest.orderId)).pass.version,
        "sealed",
      ]);
      assert.equal(await stage(guest), "ready_for_handover");
      assert.deepEqual(
        (await eventRows(guest)).rows.map((e) => e.stage),
        ["accepted", "preparing", "ready_for_handover"],
      );
      const jobs = await claim();
      const sends = [];
      for (const job of jobs.jobs) {
        const p = await preflight(job);
        if (p.send) {
          sends.push(p.payload.stage);
          await finish(job);
        }
      }
      assert.deepEqual(
        sends,
        ["ready_for_handover"],
        "obsolete preparing message is suppressed before transport",
      );
    },
  );

  await check(
    "handover uses the real code and completed state suppresses new subscriptions",
    async () => {
      const code = await scalar("select handoff_code from public.orders where id=$1", [
        guest.orderId,
      ]);
      const version = (await f.card(guest.orderId)).version;
      await assert.rejects(
        () =>
          act(guest, "mealdeck_ops_kds_complete_handoff", [
            version,
            code === "0000" ? "0001" : "0000",
          ]),
        /handoff_code_required/,
      );
      await complete(guest);
      assert.equal(await stage(guest), "completed");
      const jobs = await claim();
      assert.equal(jobs.jobs.length, 1);
      assert.equal((await preflight(jobs.jobs[0])).payload.stage, "completed");
      await finish(jobs.jobs[0]);
      assert.equal((await subscribe(guest, "guest", "state")).enabled, false);
      await assert.rejects(() => subscribe(guest, "guest"), /push_unavailable/);
    },
  );

  const withdrawal = await f.ordinary({ guest: true });
  await check(
    "guest unsubscribe, cookie revocation and account withdrawal are rechecked after claim",
    async () => {
      await subscribe(withdrawal, "withdraw");
      await f.accept(withdrawal.orderId);
      const job = (await claim()).jobs[0];
      await subscribe(withdrawal, "withdraw", "unsubscribe");
      assert.deepEqual(await preflight(job), { send: false });
      await subscribe(withdrawal, "withdraw");
      await prepare(withdrawal);
      const revoked = (await claim()).jobs[0];
      await f.guest.end(withdrawal.token);
      assert.deepEqual(await preflight(revoked), { send: false });
      await assert.rejects(() => subscribe(withdrawal, "withdraw", "state"), /order_unavailable/);
    },
  );

  const member = await f.ordinary();
  await check(
    "existing account alerts are visible from the order confirmation before separate opt-in",
    async () => {
      await updatePreferences({ orderNotifications: true, pushMarketing: true });
      await saveAccountDevice("member");
      assert.equal((await subscribe(member, "member", "state")).connected, true);
      await subscribe(member, "member");
      await f.accept(member.orderId);
    },
  );
  await check(
    "one device gets one event even with two routes; scoped opt-out prevents account fallback",
    async () => {
      const own = (await orderJobs(member)).rows;
      assert.equal(own.filter((r) => r.source_type === "order").length, 1);
      assert.equal(own.length, 2, "two distinct account endpoints, one duplicated order endpoint");
      await subscribe(member, "member", "unsubscribe");
      assert.equal((await subscribe(member, "member", "state")).connected, false);
      const jobs = await claim();
      for (const job of jobs.jobs) {
        const p = await preflight(job);
        if (p.send) {
          assert.notEqual(p.subscription.endpoint, endpoint("member"));
          await finish(job);
        }
      }
      await subscribe(member, "member");
      await updatePreferences({ orderNotifications: false });
      assert.equal((await subscribe(member, "member", "state")).connected, false);
      await subscribe(member, "member");
      await memberRpc("mealdeck_customer_remove_push", [endpoint("member")]);
      assert.equal((await subscribe(member, "member", "state")).connected, false);
      assert.equal((await memberRpc("mealdeck_customer_profile")).preferences.pushMarketing, true);
    },
  );

  await check(
    "per-order withdrawal survives a paused sender and cannot resume through account-wide consent",
    async () => {
      await updatePreferences({ orderNotifications: true });
      await saveAccountDevice("paused-order");
      const o = await f.ordinary();
      await f.accept(o.orderId);
      const jobs = (await claim()).jobs;
      const targetId = await scalar(
        "select j.id from mealdeck_private.push_outbox j join mealdeck_private.push_events e on e.id=j.event_id where e.order_id=$1 and j.endpoint_hash=mealdeck_private.push_endpoint_hash($2)",
        [o.orderId, endpoint("paused-order")],
      );
      const target = jobs.find((j) => j.jobId === targetId);
      assert.ok(target);
      await db.exec(
        "update mealdeck_private.customer_features set push_enabled=false where singleton",
      );
      const state = await subscribe(o, "paused-order", "state");
      assert.equal(state.enabled, false);
      assert.equal(
        state.connected,
        true,
        "paused sender does not erase existing subscription state",
      );
      await subscribe(o, "paused-order", "unsubscribe");
      await db.exec(
        "update mealdeck_private.customer_features set push_enabled=true where singleton",
      );
      assert.equal((await subscribe(o, "paused-order", "state")).connected, false);
      assert.deepEqual(await preflight(target), { send: false });
      for (const job of jobs.filter((j) => j.jobId !== targetId)) {
        if ((await preflight(job)).send) await finish(job);
      }
      await memberRpc("mealdeck_customer_remove_push", [endpoint("paused-order")]);
      await updatePreferences({ orderNotifications: false });
    },
  );

  const retryOrder = await f.ordinary({ guest: true });
  await check(
    "leases are exclusive, retry is bounded, and 410 removes only the attempted subscription version",
    async () => {
      await subscribe(retryOrder, "retry");
      await f.accept(retryOrder.orderId);
      const first = (await claim()).jobs[0];
      assert.equal((await claim()).jobs.length, 0);
      assert.deepEqual(await preflight({ ...first, leaseToken: f.next() }), { send: false });
      await assert.rejects(() => finish(first), /preflight_required/);
      assert.equal((await preflight(first)).send, true);
      await finish(first, "retry", 503);
      assert.equal((await claim()).jobs.length, 0, "retry respects delay");
      await db.query(
        "update mealdeck_private.push_outbox set next_attempt_at=now()-interval '1 second' where id=$1",
        [first.jobId],
      );
      const second = (await claim()).jobs[0];
      assert.notEqual(second.leaseToken, first.leaseToken);
      assert.deepEqual(await finish(first, "expired", 410), { recorded: false });
      assert.equal((await preflight(second)).send, true);
      await subscribe(retryOrder, "retry", "subscribe", { auth: "b".repeat(22) });
      await finish(second, "expired", 410);
      assert.equal(
        (await subscribe(retryOrder, "retry", "state")).connected,
        true,
        "new keys survive old 410",
      );
      await prepare(retryOrder);
      const third = (await claim()).jobs[0];
      assert.equal((await preflight(third)).send, true);
      await finish(third, "expired", 410);
      assert.equal((await subscribe(retryOrder, "retry", "state")).connected, false);
    },
  );

  await check(
    "repeated transport failures stop after five attempts without re-enqueuing the order event",
    async () => {
      const o = await f.ordinary({ guest: true });
      await subscribe(o, "bounded-retry");
      await f.accept(o.orderId);
      let jobId;
      for (let attempt = 1; attempt <= 5; attempt++) {
        const jobs = (await claim()).jobs;
        assert.equal(jobs.length, 1);
        const job = jobs[0];
        jobId ??= job.jobId;
        assert.equal(job.jobId, jobId);
        assert.equal((await preflight(job)).send, true);
        assert.equal((await finish(job, "retry", 503)).status, attempt === 5 ? "failed" : "retry");
        await db.query(
          "update mealdeck_private.push_outbox set next_attempt_at=now()-interval '1 second' where id=$1",
          [job.jobId],
        );
      }
      assert.equal((await claim()).jobs.length, 0);
      assert.equal(
        await scalar("select attempts from mealdeck_private.push_outbox where id=$1", [jobId]),
        5,
      );
      assert.equal((await eventRows(o)).rows.length, 1);
    },
  );

  await check(
    "expired queue jobs and disabled send switch never return transport material",
    async () => {
      const o = await f.ordinary({ guest: true });
      await subscribe(o, "expire");
      await f.accept(o.orderId);
      await db.query(
        "update mealdeck_private.push_events set occurred_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where order_id=$1",
        [o.orderId],
      );
      assert.equal((await claim()).jobs.length, 0);
      await prepare(o);
      const job = (await claim()).jobs[0];
      await db.exec(
        "update mealdeck_private.customer_features set push_enabled=false where singleton",
      );
      assert.deepEqual(await preflight(job), { send: false });
      await db.exec(
        "update mealdeck_private.customer_features set push_enabled=true where singleton",
      );
    },
  );

  await check(
    "only current owner/admin with finance permissions and enrolled MFA can manage campaigns",
    async () => {
      await assert.rejects(() => campaign("list", [], f.customer), /campaign_forbidden/);
      await assert.rejects(() => campaign("list", [], f.unverified), /campaign_forbidden/);
      await assert.rejects(
        () => rpc("mealdeck_push_campaign_list", [f.tenantId, f.next()], f.owner, "authenticated"),
        /campaign_forbidden/,
      );
      await db.query("insert into auth.mfa_factors(id,user_id,status) values($1,$2,'verified')", [
        f.next(),
        f.owner,
      ]);
      await assert.rejects(() => draft(), /mfa_required/);
      await db.exec("select set_config('request.jwt.claims','{\"aal\":\"aal2\"}',false)");
      assert.ok(Array.isArray((await campaign("list")).campaigns));
      await db.query(
        "update public.mealdeck_ops_staff_access set deny_permissions=array['finance.manage'] where user_id=$1",
        [f.owner],
      );
      await assert.rejects(() => draft(), /campaign_forbidden/);
      await db.query(
        "update public.mealdeck_ops_staff_access set deny_permissions='{}' where user_id=$1",
        [f.owner],
      );
    },
  );

  await check(
    "campaign drafts do not queue; bounded text/local links and explicit confirmation are required",
    async () => {
      await discardOpenJobs();
      const before = await scalar("select count(*)::int from mealdeck_private.push_outbox");
      await assert.rejects(() => draft("bad\nline"), /invalid_campaign/);
      await assert.rejects(() => draft("valid", "https://example.invalid"), /invalid_campaign/);
      const d = await draft();
      assert.equal(d.status, "draft");
      assert.equal(d.queued, 0);
      assert.equal(await scalar("select count(*)::int from mealdeck_private.push_outbox"), before);
      const confirmed = await campaign("confirm", [d.campaignId]);
      assert.equal(confirmed.status, "queued");
      assert.equal(confirmed.queued, 1, "only member-only account endpoint remains");
      assert.deepEqual(await campaign("confirm", [d.campaignId]), confirmed);
      const job = (await claim()).jobs[0];
      const p = await preflight(job);
      assert.equal(p.payload.type, "offer");
      assert.equal(p.payload.campaignId, d.campaignId);
      assert.equal(p.payload.path, "/offers");
      assert.equal(p.payload.title, d.title);
      assert.equal(p.payload.body, d.body);
      await finish(job);
      assert.equal((await campaign("list")).campaigns[0].status, "completed");
      assert.equal((await campaign("list")).campaigns[0].accepted, 1);
    },
  );

  await check(
    "marketing withdrawal after queue blocks transport while retaining order-only consent",
    async () => {
      const d = await draft();
      await campaign("confirm", [d.campaignId]);
      const job = (await claim()).jobs[0];
      await updatePreferences({ pushMarketing: false, orderNotifications: true });
      assert.deepEqual(await preflight(job), { send: false });
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.customer_push_subscriptions"),
        1,
      );
      await updatePreferences({ pushMarketing: true });
    },
  );

  await check(
    "cancelling a campaign suppresses queued jobs; old drafts need a new review",
    async () => {
      const d = await draft();
      await campaign("confirm", [d.campaignId]);
      const job = (await claim()).jobs[0];
      assert.equal((await campaign("cancel", [d.campaignId])).status, "cancelled");
      assert.deepEqual(await preflight(job), { send: false });
      const old = await draft();
      await db.query(
        "update mealdeck_private.push_campaigns set created_at=now()-interval '16 minutes' where id=$1",
        [old.campaignId],
      );
      await assert.rejects(() => campaign("confirm", [old.campaignId]), /campaign_expired/);
      const noAudience = await draft();
      await updatePreferences({ pushMarketing: false });
      assert.equal(
        (await campaign("list")).campaigns.find((c) => c.campaignId === noAudience.campaignId)
          .eligibleDevices,
        0,
        "refreshing a draft reflects current withdrawals and subsequent opt-ins",
      );
      const confirmed = await campaign("confirm", [noAudience.campaignId]);
      assert.equal(confirmed.status, "completed");
      assert.equal(confirmed.queued, 0);
    },
  );

  await check(
    "no source-created provider status or direct browser access can emit driver alerts",
    async () => {
      assert.equal(
        await scalar(
          "select count(*)::int from mealdeck_private.push_events where stage in ('with_driver','on_the_way')",
        ),
        0,
      );
      await assert.rejects(
        () =>
          asActor(db, f.customer, () =>
            db.query("select mealdeck_private.push_current_order_stage($1)", [member.orderId]),
          ),
        /permission denied/,
      );
      await assert.rejects(
        () => rpc("mealdeck_push_claim", [f.next(), f.locationId, 10]),
        /invalid_scope/,
      );
    },
  );

  console.log(`Completed ${checks} customer push behavior checks. No real notification sent.`);
} finally {
  await db.close();
}
