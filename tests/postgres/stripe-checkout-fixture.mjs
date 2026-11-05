import { readFile } from "node:fs/promises";
import { buildStandaloneSql } from "../../deploy/mealdeck/build.mjs";
import { buildCustomerMembershipSql } from "../../deploy/mealdeck/customer-membership.mjs";
import { buildStripeCheckoutSql } from "../../deploy/mealdeck/stripe-checkout.mjs";
import {
  buildLaunchCatalogueData,
  buildLaunchCataloguePriceRevisionSql,
  launchModifierDatabaseId,
} from "../../deploy/mealdeck/catalogue-import.mjs";
import { asActor, id } from "./harness.mjs";

export async function setupStripeCheckoutFixture(db) {
  await db.exec(await readFile(new URL("./standalone-auth-fixture.sql", import.meta.url), "utf8"));
  await db.exec(buildStandaloneSql());
  await db.exec(buildCustomerMembershipSql());
  await db.exec(buildStripeCheckoutSql());
  const owner = id(8101),
    customer = id(8102),
    otherCustomer = id(8103),
    unverified = id(8104);
  for (const user of [owner, customer, otherCustomer, unverified])
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,case when $3 then now() else null end)",
      [user, `fixture-${user}@example.invalid`, user !== unverified],
    );
  const receipt = (
    await db.query("select mealdeck_private.bootstrap_business($1,'MealDeck') as result", [owner])
  ).rows[0].result;
  const binding = {
    tenantId: receipt.tenant_id,
    locationId: receipt.location_id,
    stationId: receipt.station_id,
  };
  await db.exec(buildLaunchCataloguePriceRevisionSql(binding));
  const data = buildLaunchCatalogueData();
  const unavailable = data.modifierGroups.flatMap((group) =>
    group.options
      .filter((option) => option.available === false)
      .map((option) => launchModifierDatabaseId(binding.tenantId, "option", option.id)),
  );
  await db.exec(
    "update public.tenant_brands set active=true; update public.menu_categories set active=true; update public.menu_items set active=true; update public.menu_item_channel_rules set visible=true; update public.ordering_channels set enabled=true,fulfilment_modes=array['pickup','curbside'];",
  );
  await db.query("update public.modifier_options set active=true where not(id=any($1::uuid[]))", [
    unavailable,
  ]);
  for (const user of [customer, otherCustomer])
    await asActor(db, user, () =>
      db.query(
        "select public.mealdeck_customer_register('Fixture Customer','+447700900123',false,false,false,'mealdeck-customer-2026-11-05','mealdeck-preferences-2026-11-05')",
      ),
    );
  await asActor(db, owner, () =>
    db.query(
      "select public.mealdeck_ops_update_checkout_settings($1,$2,true,(now() at time zone 'Europe/London')::date,25)",
      [binding.tenantId, binding.locationId],
    ),
  );
  const skorch = data.brands.find((brand) => brand.id === "skorch-burgers");
  const ace = skorch.sections
    .flatMap((section) => section.items)
    .find((item) => item.name === "The Ace");
  const mkOption = (groupId, optionId, kind = "source", targetSku) => ({
    groupId: launchModifierDatabaseId(binding.tenantId, "group", groupId),
    optionId: launchModifierDatabaseId(binding.tenantId, "option", optionId),
    kind,
    ...(targetSku ? { targetSku } : {}),
  });
  const line = {
    lineId: "line-1",
    parentLineId: null,
    sku: ace.id,
    quantity: 1,
    modifiers: [],
    attachment: null,
  };
  const pack = (lines, cutleryRequested = false) => ({
    version: 1,
    separateBags: false,
    cutleryRequested,
    bags: [
      {
        number: 1,
        allocations: lines.map((entry) => ({ lineId: entry.lineId, quantity: entry.quantity })),
      },
    ],
  });
  const service = (action) => asActor(db, null, action, "service_role");
  const quote = async ({
    lines = [line],
    packing = pack(lines),
    actor = customer,
    fulfilment = "pickup",
    vehicle = null,
    hash = "a".repeat(64),
  } = {}) =>
    (
      await service(() =>
        db.query(
          "select public.mealdeck_create_checkout_quote($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb) as result",
          [
            binding.tenantId,
            binding.locationId,
            actor,
            fulfilment,
            vehicle === null ? null : JSON.stringify(vehicle),
            JSON.stringify(lines),
            hash,
            JSON.stringify(packing),
          ],
        ),
      )
    ).rows[0].result;
  const prepare = async (quoteId, { actor = customer, attemptId = id(8200) } = {}) =>
    (
      await service(() =>
        db.query(
          "select public.mealdeck_prepare_stripe_order($1,$2,$3,'acct_Fixture',false) as result",
          [quoteId, actor, attemptId],
        ),
      )
    ).rows[0].result;
  const bind = async (orderId, session = "cs_test_fixture") =>
    service(() =>
      db.query("select public.mealdeck_bind_stripe_session($1,$2,$3,'acct_Fixture',false)", [
        orderId,
        session,
        "https://checkout.stripe.com/c/pay/" + session,
      ]),
    );
  const reconcile = async (order, overrides = {}) => {
    const args = {
      event: "evt_fixture",
      hash: "b".repeat(64),
      type: "checkout.session.completed",
      orderId: order.orderId,
      session: "cs_test_fixture",
      intent: "pi_fixture",
      account: "acct_Fixture",
      livemode: false,
      currency: "gbp",
      captured: order.totalPence,
      refunded: 0,
      disputed: false,
      ...overrides,
    };
    return (
      await service(() =>
        db.query(
          "select public.mealdeck_reconcile_stripe_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as result",
          [
            args.event,
            args.hash,
            args.type,
            args.orderId,
            args.session,
            args.intent,
            args.account,
            args.livemode,
            args.currency,
            args.captured,
            args.refunded,
            args.disputed,
          ],
        ),
      )
    ).rows[0].result;
  };
  return {
    ...binding,
    owner,
    customer,
    otherCustomer,
    unverified,
    data,
    ace,
    line,
    pack,
    mkOption,
    service,
    quote,
    prepare,
    bind,
    reconcile,
  };
}
