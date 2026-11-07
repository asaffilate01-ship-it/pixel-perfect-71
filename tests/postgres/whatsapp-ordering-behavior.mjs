import assert from "node:assert/strict";
import pg from "pg";
import { createCipheriv, randomBytes } from "node:crypto";
import { createDatabase, asActor, id } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";
import {
  guestFixtureMethods,
  guestTokenHash,
  setGuestFixtureClock,
} from "./guest-checkout-fixture.mjs";
import { buildKitchenPrinterSql } from "../../deploy/mealdeck/kitchen-printer.mjs";
import { buildGuestCheckoutSql } from "../../deploy/mealdeck/guest-checkout.mjs";
import {
  buildWhatsappOrderingSql,
  buildManagedWhatsappOrderingSql,
} from "../../deploy/mealdeck/whatsapp-ordering.mjs";

const db = await createDatabase(process.argv.includes("--native"));
let checks = 0;
async function test(label, run) {
  try {
    await run();
    console.log(`PASS WhatsApp ordering ${++checks}: ${label}`);
  } catch (error) {
    console.error(`FAIL WhatsApp ordering: ${label}: ${error.message}`);
    throw error;
  }
}
try {
  const f = await setupStripeCheckoutFixture(db);
  await db.exec(buildKitchenPrinterSql());
  await db.exec(buildGuestCheckoutSql());
  await setGuestFixtureClock(db, "2026-11-07T18:30:00Z");
  const scope = [f.tenantId, f.locationId, "123456789012345"];
  const query = async (action, args = [], client = db, customScope = scope) => {
    assert.match(action, /^[a-z_]+$/);
    const values = [...customScope, ...args].map((x) =>
      x !== null && typeof x === "object" ? JSON.stringify(x) : x,
    );
    return (
      await client.query(
        `select public.mealdeck_whatsapp_${action}(${values.map((_, i) => "$" + (i + 1)).join(",")}) result`,
        values,
      )
    ).rows[0].result;
  };
  const rpc = (action, args = [], customScope = scope) =>
    f.service(() => query(action, args, db, customScope));
  let sequence = 0;
  const enqueue = (sender = "BSUID.opaque_test", text = "hello", message = "wamid." + ++sequence) =>
    rpc("enqueue", [message, sender, { text }, new Date().toISOString()]);
  const finish = (claim, draft, replies = [{ text: "Please review your basket." }], token = null) =>
    rpc("finish_inbound", [claim.eventId, claim.leaseId, claim.revision, draft, replies, token]);
  const draft = (overrides = {}) => ({
    revision: 0,
    picks: [{ key: "ace", quantity: 1 }],
    fulfilment: "pickup",
    customer: { name: "Fixture Guest", phone: "+447700900199" },
    vehicle: null,
    notes: "",
    packingPlan: { cutleryRequested: false, separateBags: false, bagCount: 1, allocations: [] },
    orderUpdatesConsent: true,
    marketingConsent: false,
    handoffReason: null,
    checkoutLocked: true,
    ...overrides,
  });
  const newHandoff = async (sender, token, value = draft()) => {
    await enqueue(sender);
    const claim = await rpc("claim_inbound");
    assert.equal(claim.senderId, sender);
    const result = await finish(claim, value, [], token);
    return { claim, result };
  };
  await test("atomic installer rollback, closed grants and no checkout activation", async () => {
    const managed = buildManagedWhatsappOrderingSql({
      runnerOwnsTransaction: true,
      singleMigration: true,
    });
    assert.throws(
      () => buildManagedWhatsappOrderingSql({ runnerOwnsTransaction: true }),
      /atomic transaction/,
    );
    await db.exec("begin");
    await db.exec(managed);
    await db.exec("rollback");
    assert.equal(
      (await db.query("select to_regclass('mealdeck_private.whatsapp_sessions') t")).rows[0].t,
      null,
    );
    const enabled = (
      await db.query("select checkout_enabled from mealdeck_private.checkout_settings")
    ).rows[0];
    await db.exec(buildWhatsappOrderingSql());
    assert.deepEqual(
      (await db.query("select checkout_enabled from mealdeck_private.checkout_settings")).rows[0],
      enabled,
    );
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(
        () => asActor(db, f.customer, () => query("claim_inbound"), role),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          asActor(
            db,
            f.customer,
            () => db.query("select * from mealdeck_private.whatsapp_sessions"),
            role,
          ),
        /permission denied/,
      );
    }
    await assert.rejects(
      () => f.service(() => db.query("select * from mealdeck_private.whatsapp_sessions")),
      /permission denied/,
    );
    const exposed = (
      await db.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='mealdeck_private' and c.relkind='r' and c.relname like 'whatsapp_%'`)
    ).rows;
    assert.equal(exposed.length, 5);
    assert.ok(exposed.every((x) => x.relrowsecurity));
    assert.equal((await db.query("select count(*)::int n from public.orders")).rows[0].n, 0);
  });
  await test("scope is exact; opaque sender identities are accepted and provider replay cannot alter the message", async () => {
    await assert.rejects(
      () => rpc("claim_inbound", [], [f.tenantId, id(999999), scope[2]]),
      /scope_invalid/,
    );
    const accepted = await enqueue();
    assert.equal(accepted.accepted, true);
    const same = await enqueue("BSUID.opaque_test", "hello", "wamid.1");
    assert.equal(same.eventId, accepted.eventId);
    assert.equal(same.duplicate, true);
    await assert.rejects(() => enqueue("BSUID.opaque_other", "hello", "wamid.1"), /event_conflict/);
    await assert.rejects(
      () => enqueue("BSUID.opaque_test", "altered", "wamid.1"),
      /event_conflict/,
    );
  });
  let claim;
  const token = guestTokenHash("raw WhatsApp link secret");
  const browser = guestTokenHash("random HttpOnly browser claim");
  await test("one sender lease; stale revision rejected; draft, frozen capability and replies commit once", async () => {
    claim = await rpc("claim_inbound");
    assert.equal(claim.senderId, "BSUID.opaque_test");
    await enqueue("BSUID.opaque_test", "second message");
    assert.equal(await rpc("claim_inbound"), null);
    await assert.rejects(
      () => finish({ ...claim, revision: claim.revision + 1 }, draft()),
      /lease_stale/,
    );
    const result = await finish(
      claim,
      draft(),
      [{ text: "Review securely.", buttons: [{ id: "review", title: "Review order" }] }],
      token,
    );
    assert.equal(result.applied, true);
    assert.ok(result.handoffId);
    assert.equal((await finish(claim, draft(), [], token)).duplicate, true);
    assert.equal(
      (await db.query("select count(*)::int n from mealdeck_private.whatsapp_outbox")).rows[0].n,
      1,
    );
    const next = await rpc("claim_inbound");
    assert.equal(next.revision, 1);
    assert.equal(next.draft.revision, 1);
    await finish(next, { ...next.draft, revision: 2 }, []);
    const h = await rpc("exchange_handoff", [token, browser, null]);
    assert.equal(h.resumed, false);
    assert.equal(h.revision, 2);
    assert.equal(h.checkoutMode, null);
    assert.equal(h.phase, "draft");
    assert.equal(h.draft.picks[0].key, "ace");
  });
  await test("single use exchange, matching-cookie resume, no other browser takeover", async () => {
    await assert.rejects(
      () => rpc("exchange_handoff", [token, guestTokenHash("attacker"), null]),
      /handoff_consumed/,
    );
    const resumed = await rpc("exchange_handoff", [
      token,
      guestTokenHash("unused candidate"),
      browser,
    ]);
    assert.equal(resumed.resumed, true);
    assert.equal((await rpc("read_handoff", [browser])).handoffId, resumed.handoffId);
    await assert.rejects(
      () => rpc("read_handoff", [guestTokenHash("wrong browser")]),
      /handoff_unavailable/,
    );
  });
  await test("ambiguous sends and expired send leases are held rather than resent", async () => {
    const out = await rpc("claim_outbox");
    assert.equal(out.senderId, "BSUID.opaque_test");
    assert.ok(out.windowExpiresAt);
    assert.equal(await rpc("finish_outbox", [out.id, out.leaseId, "uncertain", null]), true);
    assert.equal(await rpc("claim_outbox"), null);
    await enqueue("BSUID.opaque_test", "status");
    const c = await rpc("claim_inbound");
    await finish(c, c.draft);
    const second = await rpc("claim_outbox");
    await db.query(
      "update mealdeck_private.whatsapp_outbox set lease_expires_at=now()-interval '1 second' where id=$1",
      [second.id],
    );
    assert.equal(await rpc("claim_outbox"), null);
    const statuses = (
      await db.query("select status,hold_reason from mealdeck_private.whatsapp_outbox")
    ).rows;
    assert.ok(
      statuses.every((x) => x.status === "held" && x.hold_reason === "send_outcome_unknown"),
    );
  });
  let quote,
    order,
    attempt = id(95501);
  const guestHash = guestTokenHash("original guest capability");
  const g = guestFixtureMethods(db, f);
  await test("frozen handoff binds a real scoped quote and actor, with safe unprepared quote replacement", async () => {
    await g.session(guestHash);
    quote = await g.quote(guestHash, { hash: "a".repeat(64) });
    await assert.rejects(
      () => rpc("register_quote", [browser, quote.quoteId, "a".repeat(64), f.customer, null]),
      /quote_invalid/,
    );
    await assert.rejects(
      () => rpc("register_quote", [browser, quote.quoteId, "b".repeat(64), null, guestHash]),
      /quote_invalid/,
    );
    let h = await rpc("register_quote", [browser, quote.quoteId, "a".repeat(64), null, guestHash]);
    assert.equal(h.checkoutMode, "guest");
    assert.equal(h.phase, "quoted");
    const original = quote;
    quote = await g.quote(guestHash, { hash: "a".repeat(64) });
    h = await rpc("register_quote", [browser, quote.quoteId, "a".repeat(64), null, guestHash]);
    assert.equal(h.quoteId, quote.quoteId);
    await assert.rejects(() => g.prepare(guestHash, original.quoteId), /quote_expired/);
    order = await g.prepare(guestHash, quote.quoteId, { attemptId: attempt });
    const fresh = await g.quote(guestHash, { hash: "a".repeat(64) });
    await assert.rejects(
      () => rpc("register_quote", [browser, fresh.quoteId, "a".repeat(64), null, guestHash]),
      /checkout_locked/,
    );
  });
  await test("order binding validates original attempt and identity; prepared payment never releases from chat", async () => {
    await assert.rejects(
      () => rpc("bind_order", [browser, quote.quoteId, id(95502), order.orderId, null, guestHash]),
      /order_invalid/,
    );
    await assert.rejects(
      () => rpc("bind_order", [browser, quote.quoteId, attempt, order.orderId, f.customer, null]),
      /order_invalid/,
    );
    const h = await rpc("bind_order", [
      browser,
      quote.quoteId,
      attempt,
      order.orderId,
      null,
      guestHash,
    ]);
    assert.equal(h.attemptId, attempt);
    assert.equal(h.orderBinding.status, "payment_pending");
    assert.equal(h.orderBinding.verifiedPaid, false);
    assert.equal(
      (
        await db.query("select count(*)::int n from public.kds_tickets where order_id=$1", [
          order.orderId,
        ])
      ).rows[0].n,
      0,
    );
    await enqueue("BSUID.opaque_test", "change basket");
    const c = await rpc("claim_inbound");
    await assert.rejects(
      () => finish(c, { ...c.draft, picks: [], checkoutLocked: false }, []),
      /checkout_locked/,
    );
    await finish(c, c.draft, []);
    await db.query(
      "update mealdeck_private.whatsapp_handoffs set created_at=now()-interval '20 minutes',expires_at=now()-interval '5 minutes' where claim_hash=$1",
      [browser],
    );
    assert.equal((await rpc("read_handoff", [browser])).orderId, order.orderId);
    await rpc("cleanup");
    assert.equal((await rpc("read_handoff", [browser])).orderId, order.orderId);
  });
  await test("verified Stripe payment and staff acceptance remain separate; only opted-in current-order status is queued", async () => {
    assert.equal(await rpc("queue_status_notifications"), 0);
    await f.bind(order.orderId, "cs_test_whatsapp");
    await f.reconcile(order, {
      event: "evt_whatsapp",
      session: "cs_test_whatsapp",
      intent: "pi_whatsapp",
    });
    let h = await rpc("read_handoff", [browser]);
    assert.equal(h.orderBinding.status, "paid");
    assert.equal(h.orderBinding.acceptedAt, null);
    assert.equal(await rpc("queue_status_notifications"), 1);
    assert.equal(await rpc("queue_status_notifications"), 0);
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
    const card = board.orders.find((x) => x.order_id === order.orderId);
    await asActor(db, f.owner, () =>
      db.query("select public.mealdeck_ops_kds_accept_order($1,$2,$3,$4)", [
        f.tenantId,
        f.locationId,
        order.orderId,
        card.version,
      ]),
    );
    h = await rpc("read_handoff", [browser]);
    assert.equal(h.orderBinding.status, "accepted");
    assert.ok(h.orderBinding.acceptedAt);
    assert.equal(await rpc("queue_status_notifications"), 1);
    // Earlier paid message is cancelled after canonical acceptance, never sent stale.
    assert.equal(await rpc("claim_outbox"), null);
    const out = await rpc("claim_outbox");
    assert.match(out.reply.text, /accepted/);
    await rpc("finish_outbox", [out.id, out.leaseId, "sent", "wamid.outbound.accepted"]);
    await enqueue("BSUID.opaque_test", "STOP");
    const c = await rpc("claim_inbound");
    await finish(c, { ...c.draft, orderUpdatesConsent: false }, []);
    assert.equal(await rpc("queue_status_notifications"), 0);
    await assert.rejects(() => rpc("mark_arrived", [claim.sessionId]), /arrival_unavailable/);
  });
  await test("expired unbound claims fail, while revised frozen selection revokes a previous link", async () => {
    const tok = guestTokenHash("expiring link"),
      cook = guestTokenHash("expiring browser");
    await newHandoff("BSUID.expiring", tok);
    await db.query(
      "update mealdeck_private.whatsapp_handoffs set created_at=now()-interval '16 minutes',expires_at=now()-interval '1 minute' where token_hash=$1",
      [tok],
    );
    await assert.rejects(() => rpc("exchange_handoff", [tok, cook, null]), /handoff_unavailable/);
    const tok2 = guestTokenHash("editable link");
    await newHandoff("BSUID.editable", tok2);
    await enqueue("BSUID.editable", "edit");
    const c = await rpc("claim_inbound");
    await finish(c, { ...c.draft, picks: [], checkoutLocked: false }, []);
    await assert.rejects(() => rpc("exchange_handoff", [tok2, cook, null]), /handoff_unavailable/);
  });
  await test("stale inbound lease cannot double apply after another worker claims it", async () => {
    await enqueue("BSUID.lease");
    const old = await rpc("claim_inbound");
    await db.query(
      "update mealdeck_private.whatsapp_inbound set lease_expires_at=now()-interval '1 second' where id=$1",
      [old.eventId],
    );
    await db.query(
      "update mealdeck_private.whatsapp_sessions set lease_expires_at=now()-interval '1 second' where id=$1",
      [old.sessionId],
    );
    const fresh = await rpc("claim_inbound");
    assert.equal(fresh.eventId, old.eventId);
    assert.notEqual(fresh.leaseId, old.leaseId);
    await assert.rejects(() => finish(old, draft(), []), /lease_stale/);
    await finish(fresh, draft(), []);
  });
  await test("sender rate limits and 24-hour sending policy persist in PostgreSQL", async () => {
    for (let i = 0; i < 20; i++)
      assert.equal((await enqueue("BSUID.rate", "message " + i)).accepted, true);
    assert.equal((await enqueue("BSUID.rate", "too many")).reason, "rate_limited");
    await db.exec(
      "update mealdeck_private.whatsapp_inbound set status='dismissed' where status='queued'",
    );
    await enqueue("BSUID.window");
    const c = await rpc("claim_inbound");
    await finish(c, draft());
    await db.query(
      "update mealdeck_private.whatsapp_sessions set last_inbound_at=now()-interval '25 hours' where id=$1",
      [c.sessionId],
    );
    assert.equal(await rpc("claim_outbox"), null);
    assert.equal(
      (
        await db.query(
          "select hold_reason from mealdeck_private.whatsapp_outbox where session_id=$1",
          [c.sessionId],
        )
      ).rows[0].hold_reason,
      "customer_service_window_closed",
    );
  });
  await test("staff visibility, exclusive takeover and audited idempotent replies use existing ops authority", async () => {
    await enqueue("BSUID.support", "allergy");
    const c = await rpc("claim_inbound");
    await finish(c, draft({ handoffReason: "allergen" }), []);
    await enqueue("BSUID.support", "another message");
    assert.equal(await rpc("claim_inbound"), null);
    await assert.rejects(() => asActor(db, f.customer, () => query("staff_inbox")), /forbidden/);
    let inbox = await asActor(db, f.owner, () => query("staff_inbox"));
    assert.ok(inbox.some((x) => x.sessionId === c.sessionId));
    await asActor(db, f.owner, () => query("staff_control", [c.sessionId, "takeover"]));
    await db.query(
      "insert into public.mealdeck_ops_staff_access(tenant_id,location_id,user_id,role,created_by) values($1,$2,$3,'kitchen',$4)",
      [f.tenantId, f.locationId, f.otherCustomer, f.owner],
    );
    await assert.rejects(
      () => asActor(db, f.otherCustomer, () => query("staff_control", [c.sessionId, "takeover"])),
      /forbidden/,
    );
    const message = [c.sessionId, "The kitchen team will check your request.", id(95503)];
    const sent = await asActor(db, f.owner, () => query("staff_reply", message));
    assert.equal(sent.status, "queued");
    assert.equal((await asActor(db, f.owner, () => query("staff_reply", message))).duplicate, true);
    await asActor(db, f.owner, () => query("staff_control", [c.sessionId, "release"]));
    assert.equal(
      (await db.query("select status from mealdeck_private.whatsapp_outbox where id=$1", [sent.id]))
        .rows[0].status,
      "queued",
    );
    assert.equal(await rpc("claim_inbound"), null);
    const s = (
      await db.query("select draft from mealdeck_private.whatsapp_sessions where id=$1", [
        c.sessionId,
      ])
    ).rows[0];
    assert.equal(s.draft.handoffReason, null);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from mealdeck_private.whatsapp_staff_events where session_id=$1",
          [c.sessionId],
        )
      ).rows[0].n,
      3,
    );
  });
  await test("seven-day transport redaction retains safe hashes and preserves unresolved payment recovery", async () => {
    await db.exec(
      "update mealdeck_private.whatsapp_inbound set created_at=now()-interval '8 days';update mealdeck_private.whatsapp_outbox set created_at=now()-interval '8 days'",
    );
    const cleaned = await rpc("cleanup");
    assert.ok(cleaned.messageBodiesRedacted > 0);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from mealdeck_private.whatsapp_inbound where input<>'{\"redacted\":true}'::jsonb",
        )
      ).rows[0].n,
      0,
    );
    assert.equal((await rpc("read_handoff", [browser])).orderId, order.orderId);
    assert.equal((await enqueue("BSUID.opaque_test", "hello", "wamid.1")).duplicate, true);
  });
  await test("versioned sealed checkout link persists atomically and is masked from staff projections", async () => {
    const rawToken = randomBytes(32).toString("hex");
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", randomBytes(32), iv);
    cipher.setAAD(Buffer.from(`mealdeck-whatsapp-link-v1\0${scope[2]}\0BSUID.sealed`));
    const encrypted = Buffer.concat([
      cipher.update(`https://mealdeck.com/whatsapp/checkout#${rawToken}`, "utf8"),
      cipher.final(),
    ]);
    const sealedCheckoutLink =
      "v1." + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
    await enqueue("BSUID.sealed");
    const c = await rpc("claim_inbound");
    const message = { text: "Your private checkout link is ready.", sealedCheckoutLink };
    await assert.rejects(
      () => finish(c, draft(), [{ ...message, buttons: [{ id: "pay", title: "Pay" }] }]),
      /reply_invalid/,
    );
    await assert.rejects(
      () => finish(c, draft(), [{ ...message, sealedCheckoutLink: "v0." + "a".repeat(80) }]),
      /reply_invalid/,
    );
    await finish(c, draft(), [message], guestTokenHash(rawToken));
    const row = (
      await db.query("select reply from mealdeck_private.whatsapp_outbox where session_id=$1", [
        c.sessionId,
      ])
    ).rows[0];
    assert.equal(JSON.stringify(row).includes(rawToken), false);
    assert.equal(row.reply.sealedCheckoutLink, sealedCheckoutLink);
    await asActor(db, f.owner, () => query("staff_control", [c.sessionId, "takeover"]));
    const inbox = await asActor(db, f.owner, () => query("staff_inbox"));
    const thread = inbox.find((x) => x.sessionId === c.sessionId);
    assert.equal(thread.recentReplies[0].reply.sealedCheckoutLink, undefined);
    assert.equal(thread.recentReplies[0].reply.text, message.text);
  });
  await test("a live unprepared quote can be explicitly reset; its superseded capability cannot prepare payment", async () => {
    const tok = guestTokenHash("reset live quoted draft"),
      cookie = guestTokenHash("reset live browser");
    await newHandoff("BSUID.reset", tok);
    await rpc("exchange_handoff", [tok, cookie, null]);
    const q = await g.quote(guestHash);
    await rpc("register_quote", [cookie, q.quoteId, "c".repeat(64), null, guestHash]);
    await enqueue("BSUID.reset", "start again");
    const c = await rpc("claim_inbound");
    assert.equal(c.canStartNewOrder, true);
    await finish(c, draft({ picks: [], checkoutLocked: false }), []);
    await assert.rejects(() => rpc("read_handoff", [cookie]), /handoff_unavailable/);
    await assert.rejects(() => g.prepare(guestHash, q.quoteId), /quote_expired/);
  });
  await test("kerbside arrival records arrival separately and cannot mark a paid order accepted or ready", async () => {
    const vehicle = { make: "VW", colour: "Blue", registrationLast4: "4ABC" };
    const tok = guestTokenHash("kerbside link"),
      cookie = guestTokenHash("kerbside browser");
    const { claim: c } = await newHandoff(
      "BSUID.kerbside",
      tok,
      draft({ fulfilment: "curbside", vehicle }),
    );
    await rpc("exchange_handoff", [tok, cookie, null]);
    const q = await g.quote(guestHash, { fulfilment: "curbside", vehicle });
    await rpc("register_quote", [cookie, q.quoteId, "c".repeat(64), null, guestHash]);
    const o = await g.prepare(guestHash, q.quoteId, { attemptId: id(95510) });
    await rpc("bind_order", [cookie, q.quoteId, id(95510), o.orderId, null, guestHash]);
    await assert.rejects(() => rpc("mark_arrived", [c.sessionId]), /arrival_unavailable/);
    await f.bind(o.orderId, "cs_test_whatsappkerbside");
    await f.reconcile(o, {
      event: "evt_whatsappkerbside",
      session: "cs_test_whatsappkerbside",
      intent: "pi_whatsappkerbside",
    });
    const arrived = await rpc("mark_arrived", [c.sessionId]);
    assert.ok(arrived.arrivedAt);
    assert.equal(arrived.status, "paid");
    assert.equal(arrived.acceptedAt, null);
    assert.equal(arrived.readyForCollectionAt, null);
    assert.equal((await rpc("mark_arrived", [c.sessionId])).arrivedAt, arrived.arrivedAt);
    assert.equal((await rpc("read_handoff", [cookie])).orderBinding.canStartNewOrder, false);
  });
  await test("staff review revokes unsubmitted checkout and preserves only already bound order recovery", async () => {
    const tok = guestTokenHash("needs staff review"),
      cookie = guestTokenHash("staff review browser");
    await newHandoff("BSUID.pause", tok);
    await rpc("exchange_handoff", [tok, cookie, null]);
    const q = await g.quote(guestHash);
    await rpc("register_quote", [cookie, q.quoteId, "c".repeat(64), null, guestHash]);
    await enqueue("BSUID.pause", "allergy");
    const c = await rpc("claim_inbound");
    await finish(c, { ...c.draft, handoffReason: "allergen" }, []);
    await assert.rejects(() => rpc("read_handoff", [cookie]), /handoff_unavailable/);
    await assert.rejects(() => g.prepare(guestHash, q.quoteId), /quote_expired/);
    await asActor(db, f.owner, () => query("staff_control", [claim.sessionId, "takeover"]));
    const old = await rpc("read_handoff", [browser]);
    assert.equal(old.paused, true);
    assert.equal(old.orderId, order.orderId);
    await assert.rejects(
      () => rpc("register_quote", [browser, quote.quoteId, "a".repeat(64), null, guestHash]),
      /paused/,
    );
    await asActor(db, f.owner, () => query("staff_control", [claim.sessionId, "release"]));
  });
  await test("STOP controls work during staff ownership even as the rate-limited twenty-first message", async () => {
    await asActor(db, f.owner, () => query("staff_control", [claim.sessionId, "takeover"]));
    await db.query(
      "update mealdeck_private.whatsapp_sessions set draft=jsonb_set(jsonb_set(draft,'{orderUpdatesConsent}','true'::jsonb),'{marketingConsent}','true'::jsonb) where id=$1",
      [claim.sessionId],
    );
    await db.query(
      `insert into mealdeck_private.whatsapp_outbox(session_id,tenant_id,location_id,phone_id,transition_key,reply,status_order_id,status_key)
      values($1,$2,$3,$4,'test:status-optout','{"text":"The kitchen has accepted your order."}'::jsonb,$5,'accepted')`,
      [claim.sessionId, ...scope, order.orderId],
    );
    for (let i = 0; i < 20; i++)
      assert.equal((await enqueue("BSUID.opaque_test", "Support message " + i)).accepted, true);
    const messageId = "wamid.optout21";
    const stopped = await enqueue("BSUID.opaque_test", "STOP UPDATES", messageId);
    assert.equal(stopped.reason, "rate_limited");
    assert.equal(stopped.optOutApplied, true);
    let s = (
      await db.query("select draft,mode from mealdeck_private.whatsapp_sessions where id=$1", [
        claim.sessionId,
      ])
    ).rows[0];
    assert.equal(s.mode, "staff");
    assert.equal(s.draft.orderUpdatesConsent, false);
    assert.equal(s.draft.marketingConsent, true);
    assert.equal(
      (
        await db.query(
          "select status from mealdeck_private.whatsapp_outbox where session_id=$1 and transition_key='test:status-optout'",
          [claim.sessionId],
        )
      ).rows[0].status,
      "cancelled",
    );
    // A later deliberate choice must not be undone by replaying an old signed STOP.
    await db.query(
      "update mealdeck_private.whatsapp_sessions set draft=jsonb_set(draft,'{orderUpdatesConsent}','true'::jsonb) where id=$1",
      [claim.sessionId],
    );
    assert.equal((await enqueue("BSUID.opaque_test", "STOP UPDATES", messageId)).duplicate, true);
    assert.equal(
      (
        await db.query(
          "select draft->'orderUpdatesConsent' choice from mealdeck_private.whatsapp_sessions where id=$1",
          [claim.sessionId],
        )
      ).rows[0].choice,
      true,
    );
    assert.equal((await enqueue("BSUID.opaque_test", "OFFERS OFF")).optOutApplied, true);
    s = (
      await db.query("select draft from mealdeck_private.whatsapp_sessions where id=$1", [
        claim.sessionId,
      ])
    ).rows[0];
    assert.equal(s.draft.orderUpdatesConsent, true);
    assert.equal(s.draft.marketingConsent, false);
    assert.equal((await enqueue("BSUID.opaque_test", "STOP")).optOutApplied, true);
    assert.equal((await rpc("read_handoff", [browser])).orderBinding.status, "accepted");
    assert.equal(
      (await db.query("select payment_status from public.orders where id=$1", [order.orderId]))
        .rows[0].payment_status,
      "paid",
    );
    await asActor(db, f.owner, () => query("staff_control", [claim.sessionId, "release"]));
    // Advance only disposable admission counters so the next lifecycle check can send.
    await db.query(
      "update mealdeck_private.whatsapp_inbound set created_at=now()-interval '2 minutes' where session_id=$1 and created_at>now()-interval '1 minute'",
      [claim.sessionId],
    );
  });
  await test("verified collection allows another order while old browser claim stays bound to its original receipt", async () => {
    const board = () =>
      asActor(
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
    const card = async () => (await board()).orders.find((x) => x.order_id === order.orderId);
    const action = (name, args) =>
      asActor(db, f.owner, () =>
        db.query(`select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")})`, args),
      );
    await action("mealdeck_ops_kds_transition_order", [
      f.tenantId,
      f.locationId,
      order.orderId,
      (await card()).version,
      "preparing",
    ]);
    for (const item of (await card()).items)
      await action("mealdeck_ops_kds_set_item_ready", [
        f.tenantId,
        f.locationId,
        order.orderId,
        item.order_item_id,
        (await card()).version,
        true,
      ]);
    await action("mealdeck_ops_kds_transition_pass", [
      f.tenantId,
      f.locationId,
      order.orderId,
      (await card()).pass.version,
      "packing",
    ]);
    await action("mealdeck_ops_kds_transition_pass", [
      f.tenantId,
      f.locationId,
      order.orderId,
      (await card()).pass.version,
      "sealed",
    ]);
    let h = await rpc("read_handoff", [browser]);
    assert.equal(h.orderBinding.status, "ready");
    assert.equal(h.orderBinding.canStartNewOrder, false);
    const ready = await card();
    await action("mealdeck_ops_kds_complete_handoff", [
      f.tenantId,
      f.locationId,
      order.orderId,
      ready.version,
      ready.display_code,
    ]);
    h = await rpc("read_handoff", [browser]);
    assert.equal(h.orderBinding.status, "completed");
    assert.equal(h.orderBinding.canStartNewOrder, true);
    await enqueue("BSUID.opaque_test", "new order");
    const c = await rpc("claim_inbound");
    assert.equal(c.canStartNewOrder, true);
    await finish(c, draft({ picks: [], checkoutLocked: false }), []);
    h = await rpc("read_handoff", [browser]);
    assert.equal(h.orderId, order.orderId);
    assert.equal(h.orderBinding.orderId, order.orderId);
    assert.equal(h.orderBinding.status, "completed");
    assert.equal(
      (
        await db.query(
          "select current_order_id from mealdeck_private.whatsapp_sessions where id=$1",
          [c.sessionId],
        )
      ).rows[0].current_order_id,
      null,
    );
  });
  if (db.native)
    await test("independent PostgreSQL workers claim one sender once under concurrency", async () => {
      await enqueue("BSUID.parallel");
      const clients = Array.from({ length: 4 }, () => new pg.Client(db.config));
      try {
        await Promise.all(
          clients.map(async (client) => {
            await client.connect();
            await client.query("set role service_role");
          }),
        );
        const claims = await Promise.all(
          clients.map((client) => query("claim_inbound", [], client)),
        );
        assert.equal(claims.filter(Boolean).length, 1);
        await finish(claims.find(Boolean), draft(), []);
      } finally {
        await Promise.all(clients.map((client) => client.end()));
      }
    });
  console.log(
    `WhatsApp ordering: ${checks} checks passed (${db.native ? "native PostgreSQL" : "PGlite"}).`,
  );
} finally {
  await db.close();
}
