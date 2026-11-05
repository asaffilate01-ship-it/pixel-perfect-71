import assert from "node:assert/strict";
import pg from "pg";

export async function sharedPaymentConcurrencyTests(db, f, test) {
  assert.equal(db.native, true);
  async function race(label, firstAction, secondAction, verify) {
    const first = new pg.Client({ ...db.config, application_name: "mealdeck_shared_first" });
    const second = new pg.Client({ ...db.config, application_name: "mealdeck_shared_second" });
    try {
      await Promise.all([first.connect(), second.connect()]);
      const firstPid = (await first.query("select pg_backend_pid() pid")).rows[0].pid;
      const secondPid = (await second.query("select pg_backend_pid() pid")).rows[0].pid;
      for (const client of [first, second]) {
        await client.query("begin");
        await client.query("set local role service_role");
        await client.query("select set_config('request.jwt.claim.role','service_role',true)");
      }
      const a = await firstAction(first);
      const pending = secondAction(second).then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error }),
      );
      let blocked = false;
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        blocked = (
          await db.query("select $2::int=any(pg_blocking_pids($1)) blocked", [secondPid, firstPid])
        ).rows[0].blocked;
        if (blocked) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(blocked, true, label + " must serialize on the first database transaction");
      await first.query("commit");
      const b = await pending;
      await second.query(b.ok ? "commit" : "rollback");
      await verify(a, b);
    } finally {
      await Promise.allSettled([first.query("rollback"), second.query("rollback")]);
      await Promise.allSettled([first.end(), second.end()]);
    }
  }
  const claim = (client, g, actor, attempt, cover = false) =>
    client.query(
      "select public.mealdeck_prepare_group_payment($1,$2,null,$3,$4,$5,'acct_Fixture',false) result",
      [g.room.roomId, actor, cover ? null : g.tokens[0].tokenHash, cover, attempt],
    );
  const terminal = (client, g, attempt) =>
    client.query(
      "select public.mealdeck_prepare_terminal_payment($1,$2,$3,null,$4,$5,'acct_Fixture',false,'tml_Fixture') result",
      [f.owner, f.tenantId, f.locationId, g.room.orderId, attempt],
    );
  const reconcile = (client, c, event) =>
    client.query(
      "select public.mealdeck_reconcile_order_payment($1,$2,'checkout.session.completed',$3,$4,$5,$6,'acct_Fixture',false,'gbp',$7,0,false) result",
      [
        event,
        "a".repeat(64),
        c.collectionId,
        c.orderId,
        c.sessionId,
        "pi_native" + event.slice(4),
        c.amountPence,
      ],
    );

  await test("native: two participants cannot claim the same share", async () => {
    const g = await f.group();
    await race(
      "share claim",
      (c) => claim(c, g, f.customer, f.next()),
      (c) => claim(c, g, f.otherCustomer, f.next()),
      async (a, b) => {
        assert.equal(b.ok, false);
        assert.match(b.error.message, /share_claimed/);
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from mealdeck_private.payment_collection_shares where share_id=$1 and active",
              [g.tokens[0].shareId],
            )
          ).rows[0].n,
          1,
        );
        assert.equal(a.rows[0].result.amountPence, g.room.shares[0].amountPence);
      },
    );
  });
  await test("native: organiser covering the balance cannot steal an in-flight participant claim", async () => {
    const g = await f.group();
    await race(
      "host balance",
      (c) => claim(c, g, f.otherCustomer, f.next()),
      (c) => claim(c, g, f.customer, f.next(), true),
      async (a, b) => {
        assert.equal(b.ok, true, b.error?.message);
        assert.deepEqual(b.value.rows[0].result.shareIds, [g.tokens[1].shareId]);
        assert.equal(
          a.rows[0].result.amountPence + b.value.rows[0].result.amountPence,
          g.room.totalPence,
        );
      },
    );
  });
  await test("native: Terminal and online preparation serialize and never overlap", async () => {
    const g = await f.group();
    await race(
      "terminal/online exclusion",
      (c) => terminal(c, g, f.next()),
      (c) => claim(c, g, f.customer, f.next()),
      async (a, b) => {
        assert.equal(b.ok, false);
        assert.match(b.error.message, /online_overlap|share_claimed/);
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from mealdeck_private.payment_collections where order_id=$1",
              [g.room.orderId],
            )
          ).rows[0].n,
          1,
        );
      },
    );
  });
  await test("native: two Terminal clients cannot collect an outstanding order twice", async () => {
    const g = await f.group();
    await race(
      "terminal claim",
      (c) => terminal(c, g, f.next()),
      (c) => terminal(c, g, f.next()),
      async (a, b) => {
        assert.equal(b.ok, false);
        assert.match(b.error.message, /online_overlap/);
        assert.equal(a.rows[0].result.amountPence, g.room.totalPence);
      },
    );
  });
  await test("native: room cancellation racing capture records money on hold without kitchen release", async () => {
    const g = await f.group();
    const c = await f.bindPayment(await f.claim(g, { cover: true }));
    await race(
      "cancel/capture",
      (client) =>
        client.query("select public.mealdeck_cancel_group_payment_room($1,$2,null)", [
          g.room.roomId,
          f.customer,
        ]),
      (client) => reconcile(client, c, "evt_nativerace"),
      async (a, b) => {
        assert.equal(b.ok, true, b.error?.message);
        assert.equal(b.value.rows[0].result.held, true);
        assert.equal(
          (
            await db.query("select count(*)::int n from public.kds_tickets where order_id=$1", [
              c.orderId,
            ])
          ).rows[0].n,
          0,
        );
        assert.equal((await f.status(g)).capturedPence, c.amountPence);
      },
    );
  });
  await test("native: simultaneous duplicate webhooks produce one release and one evidence receipt", async () => {
    const g = await f.group();
    const c = await f.bindPayment(await f.claim(g, { cover: true }));
    await race(
      "webhook replay",
      (client) => reconcile(client, c, "evt_nativereplay"),
      (client) => reconcile(client, c, "evt_nativereplay"),
      async (a, b) => {
        assert.equal(b.ok, true, b.error?.message);
        assert.equal(b.value.rows[0].result.replayed, true);
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from mealdeck_private.payment_events where event_id='evt_nativereplay'",
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from public.mealdeck_pass_orders where order_id=$1",
              [c.orderId],
            )
          ).rows[0].n,
          1,
        );
      },
    );
  });
  await test("native: ordinary Checkout and a group room cannot freeze the same quote", async () => {
    const lines = [{ ...f.line, quantity: 2 }];
    const packing = {
      version: 1,
      separateBags: true,
      cutleryRequested: false,
      bags: [1, 2].map((number) => ({
        number,
        allocations: [{ lineId: f.line.lineId, quantity: 1 }],
      })),
    };
    const q = await f.quote({ lines, packing });
    const room = f.next();
    const tokens = [1, 2].map((bagNumber) => ({
      shareId: f.next(),
      bagNumber,
      tokenHash: (bagNumber === 1 ? "c" : "d").repeat(64),
    }));
    await race(
      "legacy/shared quote exclusion",
      (client) =>
        client.query(
          "select public.mealdeck_prepare_stripe_order($1,$2,$3,'acct_Fixture',false) result",
          [q.quoteId, f.customer, f.next()],
        ),
      (client) =>
        client.query(
          "select public.mealdeck_create_group_payment_room($1,$2,$3,null,$4,'equal',$5::jsonb,'acct_Fixture',false)",
          [room, q.quoteId, f.customer, f.next(), JSON.stringify(tokens)],
        ),
      async (a, b) => {
        assert.equal(b.ok, false);
        assert.match(b.error.message, /online_overlap/);
        assert.equal(
          (
            await db.query("select count(*)::int n from public.group_order_rooms where id=$1", [
              room,
            ])
          ).rows[0].n,
          0,
        );
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from mealdeck_private.stripe_orders where quote_id=$1",
              [q.quoteId],
            )
          ).rows[0].n,
          1,
        );
      },
    );
  });
}
