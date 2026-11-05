import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { id } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";
import { setGuestFixtureClock, guestFixtureMethods } from "./guest-checkout-fixture.mjs";
import { buildKitchenPrinterSql } from "../../deploy/mealdeck/kitchen-printer.mjs";
import { buildGuestCheckoutSql } from "../../deploy/mealdeck/guest-checkout.mjs";
import { buildKitchenAvailabilitySql } from "../../deploy/mealdeck/kitchen-availability.mjs";
import {
  buildSharedTerminalPaymentsSql,
  buildManagedSharedTerminalPaymentsSql,
} from "../../deploy/mealdeck/shared-terminal-payments.mjs";

export const paymentHash = (value) => createHash("sha256").update(value).digest("hex");
export async function setupSharedPaymentsFixture(db) {
  const f = await setupStripeCheckoutFixture(db);
  await db.exec(buildKitchenPrinterSql());
  await db.exec(buildGuestCheckoutSql());
  await db.exec(buildKitchenAvailabilitySql());
  const clockBefore = (
    await db.query(
      "select pg_get_functiondef('mealdeck_private.launch_window()'::regprocedure) definition",
    )
  ).rows[0].definition;
  const managed = buildManagedSharedTerminalPaymentsSql({
    runnerOwnsTransaction: true,
    singleMigration: true,
  });
  for (const [damage, expected] of [
    [
      "alter table mealdeck_private.installation rename to missing_installation_fixture",
      /independent_profile_required/,
    ],
    [
      "alter table mealdeck_private.installation drop constraint installation_profile_check; update mealdeck_private.installation set profile='shared-profile-fixture'",
      /independent_profile_required/,
    ],
    ["create schema dishbee_private", /independent_profile_required/],
    [
      "alter table mealdeck_private.guest_sessions rename to missing_guest_extension_fixture",
      /previous_extensions_required/,
    ],
    [
      "alter function mealdeck_private.guard_payment_preparation_availability() rename to missing_availability_fixture",
      /previous_extensions_required/,
    ],
  ]) {
    await db.exec("begin");
    try {
      await db.exec(damage);
      await db.exec("savepoint attempted_install");
      await assert.rejects(() => db.exec(managed), expected);
      await db.exec("rollback to savepoint attempted_install");
      assert.equal(
        (await db.query("select to_regclass('mealdeck_private.payment_orders') ledger")).rows[0]
          .ledger,
        null,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from information_schema.columns where table_schema='mealdeck_private' and table_name='checkout_quotes' and column_name='staff_id'",
          )
        ).rows[0].n,
        0,
      );
    } finally {
      await db.exec("rollback");
    }
  }
  await db.exec("begin");
  await db.exec(
    buildManagedSharedTerminalPaymentsSql({ runnerOwnsTransaction: true, singleMigration: true }),
  );
  await db.exec("rollback");
  assert.equal(
    (await db.query("select to_regclass('mealdeck_private.payment_orders') ledger")).rows[0].ledger,
    null,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from information_schema.columns where table_schema='mealdeck_private' and table_name='checkout_quotes' and column_name='staff_id'",
      )
    ).rows[0].n,
    0,
  );
  await db.exec(buildSharedTerminalPaymentsSql());
  assert.equal(
    (
      await db.query(
        "select pg_get_functiondef('mealdeck_private.launch_window()'::regprocedure) definition",
      )
    ).rows[0].definition,
    clockBefore,
  );
  await setGuestFixtureClock(db, "2026-11-06T16:00:00Z");
  const guest = guestFixtureMethods(db, f);
  let sequence = 25000;
  const next = () => id(++sequence);
  const rpc = (name, values) => {
    assert.match(
      name,
      /^mealdeck_(?:create_group_payment_room|group_payment_status|group_payment_collections|prepare_group_payment|cancel_group_payment_room|order_payment_collection|bind_order_payment|reconcile_order_payment|terminal_authorize|create_terminal_quote|terminal_order_status|prepare_terminal_payment|terminal_payment_attempt|cancel_terminal_payment)$/,
    );
    return f.service(
      async () =>
        (
          await db.query(
            `select public.${name}(${values.map((_, i) => "$" + (i + 1)).join(",")}) result`,
            values,
          )
        ).rows[0].result,
    );
  };
  const group = async (options = {}) => {
    const quantities = options.quantities ?? [1, 2];
    const lines = options.lines ?? [{ ...f.line, quantity: quantities.reduce((a, b) => a + b, 0) }];
    const packing = options.packing ?? {
      version: 1,
      separateBags: true,
      cutleryRequested: true,
      bags: quantities.map((quantity, index) => ({
        number: index + 1,
        allocations: [{ lineId: f.line.lineId, quantity }],
      })),
    };
    const quote =
      options.quote ??
      (options.guestToken
        ? await guest.quote(options.guestToken, { lines, packing })
        : await f.quote({ lines, packing, actor: options.customer ?? f.customer }));
    const roomId = options.roomId ?? next();
    const attempt = options.attempt ?? next();
    const tokens =
      options.tokens ??
      packing.bags.map((bag) => ({
        shareId: next(),
        bagNumber: bag.number,
        tokenHash: paymentHash(next()),
      }));
    const args = [
      roomId,
      quote.quoteId,
      options.guestToken ? null : (options.customer ?? f.customer),
      options.guestToken ?? null,
      attempt,
      options.mode ?? "by_bag",
      JSON.stringify(tokens),
      "acct_Fixture",
      false,
    ];
    const room = await rpc("mealdeck_create_group_payment_room", args);
    return { room, quote, tokens, args };
  };
  const claim = (g, options = {}) =>
    rpc("mealdeck_prepare_group_payment", [
      g.room.roomId,
      options.guestToken ? null : (options.customer ?? f.customer),
      options.guestToken ?? null,
      options.cover ? null : g.tokens[options.index ?? 0].tokenHash,
      options.cover ?? false,
      options.attempt ?? next(),
      "acct_Fixture",
      false,
    ]);
  const status = (g, options = {}) =>
    rpc("mealdeck_group_payment_status", [
      g.room.roomId,
      options.participant ? null : (options.customer ?? f.customer),
      options.guestToken ?? null,
      options.participant ? g.tokens[options.index ?? 0].tokenHash : null,
    ]);
  const terminalQuote = (options = {}) =>
    rpc("mealdeck_create_terminal_quote", [
      options.actor ?? f.owner,
      f.tenantId,
      f.locationId,
      options.fulfilment ?? "pickup",
      options.vehicle ? JSON.stringify(options.vehicle) : null,
      JSON.stringify(options.lines ?? [f.line]),
      JSON.stringify(options.packing ?? f.pack(options.lines ?? [f.line])),
      paymentHash(next()),
    ]);
  const terminal = (options = {}) =>
    rpc("mealdeck_prepare_terminal_payment", [
      options.actor ?? f.owner,
      options.tenantId ?? f.tenantId,
      options.locationId ?? f.locationId,
      options.quoteId ?? null,
      options.orderId ?? null,
      options.attempt ?? next(),
      options.account ?? "acct_Fixture",
      options.livemode ?? false,
      options.terminalLocation ?? "tml_Fixture",
    ]);
  const bind = (c, options = {}) =>
    rpc("mealdeck_bind_order_payment", [
      c.collectionId,
      c.method === "checkout" ? (options.session ?? "cs_test_" + ++sequence) : null,
      options.intent ?? (c.method === "terminal" ? "pi_" + ++sequence : null),
      c.method === "checkout" ? (options.url ?? "https://checkout.stripe.com/c/pay/fixture") : null,
      "acct_Fixture",
      false,
    ]);
  const reconcile = (c, options = {}) =>
    rpc("mealdeck_reconcile_order_payment", [
      options.event ?? "evt_" + ++sequence,
      options.hash ?? paymentHash("provider"),
      options.type ??
        (c.method === "checkout" ? "checkout.session.completed" : "payment_intent.succeeded"),
      c.collectionId,
      options.orderId ?? c.orderId,
      options.session ?? c.sessionId,
      options.intent === null ? null : (options.intent ?? c.paymentIntentId ?? "pi_" + ++sequence),
      options.account ?? "acct_Fixture",
      options.livemode ?? false,
      options.currency ?? "gbp",
      options.captured ?? c.amountPence,
      options.refunded ?? 0,
      options.disputed ?? false,
    ]);
  return {
    ...f,
    guest,
    next,
    rpc,
    group,
    claim,
    status,
    terminalQuote,
    terminal,
    bindPayment: bind,
    reconcilePayment: reconcile,
  };
}
