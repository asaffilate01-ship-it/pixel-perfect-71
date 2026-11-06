import assert from "node:assert/strict";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { asActor, createDatabase, id } from "./harness.mjs";
import { setupStaffCashOrdersFixture } from "./staff-cash-orders-fixture.mjs";
import { buildStaffCashOrdersSql } from "../../deploy/mealdeck/staff-cash-orders.mjs";
import { launchModifierDatabaseId } from "../../deploy/mealdeck/catalogue-import.mjs";
import {
  buildMealComponentsManifest,
  buildMealComponentsSql,
  buildManagedMealComponentsSql,
  renderMealComponentsSql,
} from "../../deploy/mealdeck/meal-components.mjs";

const db = await createDatabase(process.argv.includes("--native"), { uuid_ossp });
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
let checks = 0;
async function check(label, action) {
  await action();
  console.log(`PASS meal components ${++checks}: ${label}`);
}
try {
  const f = await setupStaffCashOrdersFixture(db);
  await db.exec(buildStaffCashOrdersSql());
  const manifest = buildMealComponentsManifest();
  const sourceItems = f.data.brands.flatMap((brand) =>
    brand.sections.flatMap((section) => section.items),
  );
  const groups = new Map(f.data.modifierGroups.map((group) => [group.id, group]));
  const groupId = (source) => launchModifierDatabaseId(f.tenantId, "group", source);
  const optionId = (source) => launchModifierDatabaseId(f.tenantId, "option", source);
  const selection = (group, option, kind = "source", targetSku) => ({
    groupId: groupId(group),
    optionId: optionId(option),
    kind,
    ...(targetSku ? { targetSku } : {}),
  });
  function mealLine(definition, quantity = 1) {
    const item = sourceItems.find((entry) => entry.id === definition.sku);
    assert.ok(item, definition.sku);
    const modifiers = item.canonicalOptionGroupIds.flatMap((sourceId) => {
      const group = groups.get(sourceId);
      if (group.minSelect > 0 || [definition.mealGroup, definition.drinkGroup].includes(sourceId))
        return [
          selection(
            group.id,
            group.options.find((option) => option.available !== false).id,
            group.importKind === "price-variant" ? "variant" : "source",
          ),
        ];
      return [];
    });
    return {
      lineId: "line-1",
      parentLineId: null,
      sku: definition.sku,
      quantity,
      modifiers,
      attachment: null,
    };
  }
  const definition = manifest.items.find(
    (item) => item.sku === "skorch-burgers-beef-smash-deck-the-ace",
  );
  const main = mealLine(definition, 2);
  const components = (line, tenant = f.tenantId) =>
    scalar("select mealdeck_private.meal_components($1,$2::jsonb)", [tenant, JSON.stringify(line)]);
  const quoted = async (line, extra = []) => {
    await f.ageQuotes();
    return f.quote({ lines: [line, ...extra] });
  };
  const expectedStandard = [
    { slot: "side", name: "Fries", quantityPerParent: 1, replacement: false },
    { slot: "drink", name: "Pepsi", quantityPerParent: 1, replacement: false },
  ];
  const legacy = await f.ordinary({ lines: [main] });
  await f.accept(legacy.orderId);
  const legacyReceipt = await scalar(
    "select receipt from mealdeck_private.receipt_jobs where order_id=$1",
    [legacy.orderId],
  );
  const digest = () =>
    scalar(`select md5(jsonb_build_object(
    'orders',(select jsonb_agg(to_jsonb(x) order by id) from public.orders x),
    'items',(select jsonb_agg(to_jsonb(x) order by id) from public.order_items x),
    'quotes',(select jsonb_agg(to_jsonb(x) order by id) from mealdeck_private.checkout_quotes x),
    'stripe',(select jsonb_agg(to_jsonb(x) order by order_id) from mealdeck_private.stripe_orders x),
    'cash',(select jsonb_agg(to_jsonb(x) order by order_id) from mealdeck_private.cash_orders x),
    'receipts',(select jsonb_agg(to_jsonb(x) order by id) from mealdeck_private.receipt_jobs x),
    'numbers',(select jsonb_agg(to_jsonb(x) order by order_id) from mealdeck_private.order_numbers x))::text)`);
  const before = await digest();
  await check(
    "frozen reviewed identities, atomic install/replay and no historical row or receipt changes",
    async () => {
      assert.equal(manifest.items.length, 16);
      assert.equal(manifest.options.length, 73);
      assert.equal(buildMealComponentsSql(), renderMealComponentsSql());
      assert.throws(
        () => buildManagedMealComponentsSql({ runnerOwnsTransaction: true }),
        /one runner-owned/,
      );
      await db.exec("begin");
      await db.exec(
        buildManagedMealComponentsSql({ runnerOwnsTransaction: true, singleMigration: true }),
      );
      await db.exec("rollback");
      assert.equal(
        await scalar("select to_regprocedure('mealdeck_private.meal_components(uuid,jsonb)')"),
        null,
      );
      await db.exec(buildMealComponentsSql());
      await db.exec(buildMealComponentsSql());
      assert.equal(await digest(), before);
      assert.deepEqual(
        await scalar("select receipt from mealdeck_private.receipt_jobs where order_id=$1", [
          legacy.orderId,
        ]),
        legacyReceipt,
      );
      assert.equal(Object.hasOwn(legacyReceipt.items[0], "mealComponents"), false);
      assert.deepEqual((await f.card(legacy.orderId)).items[0].mealComponents, expectedStandard);
    },
  );
  await check(
    "all16 approved parent identities describe their canonical default meal, portion and drink",
    async () => {
      for (const item of manifest.items) {
        const quote = await quoted(mealLine(item));
        const line = quote.lines.find((entry) => entry.lineId === "line-1");
        const actual = await components(line);
        if (item.kind === "side") {
          assert.deepEqual(
            actual,
            [{ slot: "side", name: "Fries", quantityPerParent: 1, replacement: false }],
            item.sku,
          );
        } else {
          assert.equal(actual.find((entry) => entry.slot === "side").name, "Fries", item.sku);
          const drink = line.modifiers.find(
            (modifier) => modifier.group_id === groupId(item.drinkGroup),
          );
          assert.equal(actual.find((entry) => entry.slot === "drink").name, drink.name, item.sku);
          if (item.kind === "kids")
            assert.deepEqual(actual[0], {
              slot: "main",
              name: "6 nuggets",
              quantityPerParent: 1,
              replacement: false,
            });
          else
            assert.equal(
              actual.some((entry) => entry.slot === "main"),
              false,
            );
        }
        assert.ok(actual.every((entry) => entry.quantityPerParent === 1 && !entry.replacement));
        assert.equal(line.unit_pence * line.quantity, line.line_pence);
        if (line.modifiers.some((modifier) => modifier.kind === "variant"))
          assert.ok(
            line.modifiers.find((modifier) => modifier.kind === "variant").name.includes("3 pcs"),
          );
      }
    },
  );
  await check(
    "exact peri-salt choice and every named side/drink replacement suppress only its own included component",
    async () => {
      for (const item of manifest.items.filter(
        (entry) =>
          entry.kind === "kids" || (entry.kind === "adult" && /cruncher$|the-ace$/.test(entry.sku)),
      )) {
        const line = mealLine(item);
        line.modifiers.push(selection(item.upgradeGroup, `${item.upgradeGroup}-peri-salt`));
        const quote = await quoted(line);
        assert.equal(
          (await components(quote.lines[0])).find((entry) => entry.slot === "side").name,
          "Fries with peri salt",
        );
      }
      for (const binding of manifest.options.filter((entry) => entry.kind === "cross")) {
        const line = structuredClone(main);
        if (binding.role === "drink")
          line.modifiers = line.modifiers.filter(
            (modifier) => modifier.groupId !== groupId(definition.drinkGroup),
          );
        const option = groups
          .get(binding.group)
          .options.find((entry) => entry.id === binding.option);
        line.modifiers.push(selection(binding.group, binding.option, "cross", option.targetItemId));
        const quote = await quoted(line);
        const priced = quote.lines[0];
        const actual = await components(priced);
        const purchased = priced.modifiers.find(
          (modifier) => modifier.id === optionId(binding.option),
        );
        assert.deepEqual(
          actual.find((entry) => entry.slot === binding.role),
          {
            slot: binding.role,
            name: purchased.name,
            quantityPerParent: 1,
            replacement: true,
          },
        );
        assert.equal(actual.length, 2);
        const other = binding.role === "side" ? "drink" : "side";
        assert.equal(actual.find((entry) => entry.slot === other).replacement, false);
        assert.equal(
          actual.find((entry) => entry.slot === other).name,
          other === "side" ? "Fries" : "Pepsi",
        );
        assert.equal(priced.line_pence, priced.unit_pence * 2);
      }
    },
  );
  await check(
    "nonmeal extras and Souvano sides stay separate; mutable labels and counterfeit identities cannot invent food",
    async () => {
      const plain = structuredClone(main);
      plain.modifiers = [];
      const extra = {
        lineId: "line-1-extra-side",
        parentLineId: "line-1",
        sku: "loadd-loaded-fries-king-of-hearts",
        quantity: 2,
        modifiers: [],
        attachment: "Extra with The Ace",
      };
      const quote = await quoted(plain, [extra]);
      assert.deepEqual(await components(quote.lines.find((line) => line.lineId === "line-1")), []);
      assert.deepEqual(await components(quote.lines.find((line) => line.parentLineId)), []);
      const souvano = manifest.items.find((item) => item.sku === "souvano-heatwave-heatwave");
      const rice = mealLine(souvano, 2);
      rice.modifiers = [
        selection("souvano-heatwave-base", "souvano-heatwave-base-fragrant-spicy-rice"),
      ];
      const riceQuote = await quoted(rice, [extra]);
      assert.deepEqual(await components(riceQuote.lines.find((line) => line.lineId === "line-1")), [
        { slot: "side", name: "Rice", quantityPerParent: 1, replacement: false },
      ]);
      const saved = (await quoted(main)).lines[0];
      const original = await components(saved);
      const make = saved.modifiers.find(
        (modifier) => modifier.group_id === groupId(definition.mealGroup),
      );
      await db.query("update public.modifier_options set name='Edited display label' where id=$1", [
        make.id,
      ]);
      assert.deepEqual(await components(saved), original);
      const differentLabel = structuredClone(saved);
      differentLabel.modifiers.find((modifier) => modifier.id === make.id).name = "Kitchen choice";
      assert.deepEqual(await components(differentLabel), original);
      const fake = structuredClone(saved);
      fake.modifiers.find((modifier) => modifier.id === make.id).id = id(991);
      assert.deepEqual(await components(fake), []);
      const unknownReplacement = structuredClone(saved);
      unknownReplacement.modifiers.push({
        id: id(993),
        group_id: groupId("cross-side-replacement"),
        name: "Unknown future side",
        kind: "cross",
        quantity_per_parent: 1,
      });
      assert.deepEqual(await components(unknownReplacement), []);
      assert.deepEqual(await components(saved, id(992)), []);
      assert.deepEqual(await components({ ...saved, sku: "unknown-make-it-a-meal" }), []);
      const unsafe = structuredClone(saved);
      unsafe.modifiers.find(
        (modifier) => modifier.group_id === groupId(definition.drinkGroup),
      ).name = "Pepsi\u202e";
      assert.deepEqual(await components(unsafe), []);
    },
  );
  await check(
    "unpaid stays invisible; paid pending, KDS, future receipt and Done retain equal components with one receipt",
    async () => {
      const order = await f.prepareOrdinary({ lines: [main] });
      assert.equal(await f.card(order.orderId), undefined);
      assert.equal(
        (await f.pending()).orders.some((entry) => entry.orderId === order.orderId),
        false,
      );
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
          order.orderId,
        ]),
        0,
      );
      await f.reconcileOrdinary(order);
      const card = await f.card(order.orderId);
      assert.deepEqual(card.items[0].mealComponents, expectedStandard);
      for (const ticket of card.tickets)
        for (const item of ticket.items) assert.deepEqual(item.mealComponents, expectedStandard);
      const pending = (await f.pending()).orders.find((entry) => entry.orderId === order.orderId);
      assert.deepEqual(pending.items[0].mealComponents, expectedStandard);
      await f.accept(order.orderId);
      const receipt = await scalar(
        "select receipt from mealdeck_private.receipt_jobs where order_id=$1",
        [order.orderId],
      );
      assert.deepEqual(receipt.items[0].mealComponents, expectedStandard);
      assert.equal(receipt.items[0].quantity, 2);
      assert.equal(receipt.totalPence, order.totalPence);
      await f.accept(order.orderId);
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
          order.orderId,
        ]),
        1,
      );
      const action = (name, args) =>
        f.staff(name, [f.tenantId, f.locationId, order.orderId, ...args]);
      await action("mealdeck_ops_kds_transition_order", [
        (await f.card(order.orderId)).version,
        "preparing",
      ]);
      for (const item of (await f.card(order.orderId)).items)
        await action("mealdeck_ops_kds_set_item_ready", [
          item.order_item_id,
          (await f.card(order.orderId)).version,
          true,
        ]);
      await action("mealdeck_ops_kds_transition_pass", [
        (await f.card(order.orderId)).pass.version,
        "packing",
      ]);
      await action("mealdeck_ops_kds_transition_pass", [
        (await f.card(order.orderId)).pass.version,
        "sealed",
      ]);
      const ready = await f.card(order.orderId);
      await action("mealdeck_ops_kds_complete_handoff", [ready.version, ready.display_code]);
      const done = (await f.board()).completed_orders.find(
        (entry) => entry.order_id === order.orderId,
      );
      assert.deepEqual(done.items[0].mealComponents, expectedStandard);
    },
  );
  await check(
    "cash canonical quote uses the same components and receipt while provider records stay untouched",
    async () => {
      const providers = await scalar("select count(*)::int from mealdeck_private.stripe_orders");
      await f.ageQuotes();
      const quote = await f.cashQuote({ lines: [main], notes: "Please label the bags" });
      const paid = (await f.cashConfirm(quote, f.next())).order;
      assert.deepEqual((await f.card(paid.orderId)).items[0].mealComponents, expectedStandard);
      await f.accept(paid.orderId);
      const receipt = await scalar(
        "select receipt from mealdeck_private.receipt_jobs where order_id=$1",
        [paid.orderId],
      );
      assert.equal(receipt.paymentMethod, "cash");
      assert.deepEqual(receipt.items[0].mealComponents, expectedStandard);
      assert.equal(receipt.orderNotes, "Please label the bags");
      assert.equal(receipt.totalPence, quote.totalPence);
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.stripe_orders"),
        providers,
      );
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
          paid.orderId,
        ]),
        1,
      );
    },
  );
  await check(
    "only existing scoped printer RPC remains callable; helpers stay private and changed guards roll back",
    async () => {
      const acl =
        await rows(`select p.proname,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service
      from pg_proc p where p.oid in (
        'mealdeck_private.meal_components(uuid,jsonb)'::regprocedure,
        'mealdeck_ops_private.kds_order_card(uuid,jsonb)'::regprocedure,
        'mealdeck_ops_private.kds_order_card_before_meal_components(uuid,jsonb)'::regprocedure,
        'mealdeck_ops_private.receipt_snapshot(uuid)'::regprocedure,
        'mealdeck_ops_private.receipt_snapshot_before_meal_components(uuid)'::regprocedure,
        'public.mealdeck_printer_acceptance_board(uuid,uuid)'::regprocedure)`);
      assert.equal(acl.length, 6);
      for (const fn of acl) {
        assert.deepEqual(fn.proconfig, ['search_path=""']);
        assert.equal(fn.anon, false);
        assert.equal(fn.service, false);
        assert.equal(fn.authenticated, fn.proname === "mealdeck_printer_acceptance_board");
      }
      for (const role of ["anon", "authenticated", "service_role"])
        await assert.rejects(
          () => asActor(db, role === "authenticated" ? f.owner : null, () => components({}), role),
          /permission denied/,
        );
      await assert.rejects(
        () =>
          asActor(db, null, () =>
            scalar("select public.mealdeck_printer_acceptance_board($1,$2)", [
              f.tenantId,
              f.locationId,
            ]),
          ),
        /unauthenticated|forbidden|verified|not_authorized/,
      );
      const saved = await digest();
      await db.exec("begin");
      await db.exec(
        "create or replace function mealdeck_private.meal_components(p_tenant uuid,p_line jsonb) returns jsonb language sql immutable security definer set search_path='' as 'select null::jsonb'",
      );
      await assert.rejects(
        () =>
          db.exec(
            buildManagedMealComponentsSql({ runnerOwnsTransaction: true, singleMigration: true }),
          ),
        /unreviewed_helper/,
      );
      await db.exec("rollback");
      assert.equal(await digest(), saved);
    },
  );
  console.log(`PASS ${checks} meal components behavior groups`);
} catch (error) {
  console.error("Meal components verification failed:", error.message, error.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
