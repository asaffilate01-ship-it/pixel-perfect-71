import assert from "node:assert/strict";
import { asActor } from "./harness.mjs";
import { setupOrderingRoomsFixture } from "./ordering-rooms-fixture.mjs";
import { guestTokenHash } from "./guest-checkout-fixture.mjs";
import { buildKdsWorkflowSql } from "../../deploy/mealdeck/kds-workflow.mjs";
import { buildPrinterAcceptanceSql } from "../../deploy/mealdeck/printer-acceptance.mjs";
import { buildKerbsideContactSql } from "../../deploy/mealdeck/kerbside-contact.mjs";
import { buildCheckoutSessionPathsSql } from "../../deploy/mealdeck/checkout-session-paths.mjs";

export async function setupPaidOrderNumbersFixture(db) {
  const f = await setupOrderingRoomsFixture(db);
  await db.exec(buildCheckoutSessionPathsSql());
  await db.exec(buildKdsWorkflowSql());
  await db.exec(buildPrinterAcceptanceSql());
  await db.exec(buildKerbsideContactSql());
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const ageQuotes = () =>
    db.exec("update mealdeck_private.checkout_quotes set created_at=now()-interval '6 minutes'");
  const staff = (name, args, actor = f.owner, role = "authenticated") => {
    assert.match(name, /^mealdeck_(?:ops_kds|ops_driver_|ops_courier_|printer|ops_order_history|customer_orders)/);
    return asActor(
      db,
      actor,
      () => scalar(`select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")})`, args),
      role,
    );
  };
  const board = () => staff("mealdeck_ops_kds_workflow_board", [f.tenantId, f.locationId]);
  const card = async (orderId) => (await board()).orders.find((c) => c.order_id === orderId);
  const pending = () => staff("mealdeck_printer_acceptance_board", [f.tenantId, f.locationId]);
  const accept = async (orderId) =>
    staff("mealdeck_ops_kds_accept_order", [
      f.tenantId,
      f.locationId,
      orderId,
      (await card(orderId)).version,
    ]);
  const prepareOrdinary = async ({ guest = false, fulfilment = "pickup", lines } = {}) => {
    await ageQuotes();
    const token = guest ? guestTokenHash(f.next()) : null;
    if (token) await f.guest.session(token, { name: "آمنہ O’Neill", phone: "+447700900199" });
    const options = {
      fulfilment,
      ...(lines ? { lines } : {}),
      vehicle:
        fulfilment === "curbside"
          ? { make: "Ford", colour: "Blue", registrationLast4: "12AB" }
          : null,
    };
    const quote = token ? await f.guest.quote(token, options) : await f.quote(options);
    const prepared = token
      ? await f.guest.prepare(token, quote.quoteId, { attemptId: f.next() })
      : await f.prepare(quote.quoteId, { attemptId: f.next() });
    const suffix = f.next().replaceAll("-", "");
    const session = "cs_test_number" + suffix;
    const intent = "pi_number" + suffix;
    const event = "evt_number" + suffix;
    await f.bind(prepared.orderId, session);
    const values = [
      event,
      "b".repeat(64),
      "checkout.session.completed",
      prepared.orderId,
      session,
      intent,
      "acct_Fixture",
      false,
      "gbp",
      prepared.totalPence,
      0,
      false,
    ];
    return { ...prepared, prepared, token, session, intent, event, values };
  };
  const reconcileOrdinary = async (order, overrides = {}) =>
    f.reconcile(order.prepared, {
      session: order.session,
      intent: order.intent,
      event: order.event,
      ...overrides,
    });
  const ordinary = async (options) => {
    const order = await prepareOrdinary(options);
    await reconcileOrdinary(order);
    return order;
  };
  const rawReconcile = (client, order) =>
    client.query(
      "select public.mealdeck_reconcile_stripe_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) result",
      order.values,
    );
  return {
    ...f,
    scalar,
    ageQuotes,
    staff,
    board,
    card,
    pending,
    accept,
    prepareOrdinary,
    reconcileOrdinary,
    ordinary,
    rawReconcile,
    number: (orderId) => scalar("select mealdeck_private.paid_order_number($1)", [orderId]),
  };
}
