import assert from "node:assert/strict";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { asActor, createDatabase, id } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";
import { buildPublicMenuSql } from "../../deploy/mealdeck/public-menu.mjs";
import { buildPublicMenuReadSql } from "../../deploy/mealdeck/public-menu-read.mjs";
import { launchModifierDatabaseId } from "../../deploy/mealdeck/catalogue-import.mjs";
import {
  buildIncludedDrinkStockManifest,
  buildIncludedDrinkStockSql,
  buildManagedIncludedDrinkStockSql,
  renderIncludedDrinkStockSql,
} from "../../deploy/mealdeck/included-drink-stock.mjs";

const db = await createDatabase(process.argv.includes("--native"), { uuid_ossp });
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
let checks = 0;
async function check(label, action) {
  try {
    await action();
    console.log(`PASS included drink stock ${++checks}: ${label}`);
  } catch (error) {
    console.error(`FAIL included drink stock: ${label}: ${error.message}`, error.where ?? "");
    throw error;
  }
}
try {
  await db.exec('create schema extensions; create extension "uuid-ossp" with schema extensions');
  const f = await setupStripeCheckoutFixture(db);
  await db.exec(buildPublicMenuSql());
  await db.exec(buildPublicMenuReadSql());
  const bindings = buildIncludedDrinkStockManifest().bindings;
  const read = () =>
    asActor(db, null, () => scalar("select public.mealdeck_public_menu()"), "anon");
  const itemId = (sku) =>
    scalar("select id from public.menu_items where tenant_id=$1 and sku=$2", [f.tenantId, sku]);
  const setVisible = async (sku, visible) =>
    asActor(db, f.owner, () =>
      db.query("select public.mealdeck_ops_set_menu_visibility($1,$2,$3,$4)", [
        f.tenantId,
        f.locationId,
        productIds.get(sku),
        visible,
      ]),
    );
  const productIds = new Map();
  for (const binding of bindings) productIds.set(binding.sku, await itemId(binding.sku));
  function lineFor(binding) {
    const brand = f.data.brands.find((row) => row.id === binding.brand);
    const item = brand.sections
      .flatMap((section) => section.items)
      .find((row) => row.canonicalOptionGroupIds.includes(binding.group) && !row.priceVariants);
    assert.ok(item, binding.group);
    const modifiers = item.canonicalOptionGroupIds.flatMap((groupId) => {
      const group = f.data.modifierGroups.find((row) => row.id === groupId);
      if (groupId === binding.group) return [f.mkOption(groupId, binding.option)];
      if (
        group.minSelect > 0 ||
        (binding.group.includes("included-meal-drink") &&
          groupId === `${binding.brand}-make-it-a-meal`)
      )
        return [f.mkOption(groupId, group.options.find((row) => row.available !== false).id)];
      return [];
    });
    return { ...f.line, sku: item.id, modifiers };
  }
  const originalSnapshot = await read();
  const dataDigest = () =>
    scalar(`select md5(jsonb_build_array(
    (select jsonb_agg(to_jsonb(o) order by o.id) from public.modifier_options o),
    (select jsonb_agg(to_jsonb(i) order by i.id) from public.menu_items i),
    (select jsonb_agg(to_jsonb(r) order by r.menu_item_id) from public.menu_item_channel_rules r)
  )::text)`);
  const before = await dataDigest();
  await check(
    "frozen explicit 28-option mapping, atomic rollback, replay and no stock/price writes",
    async () => {
      assert.equal(bindings.length, 28);
      assert.equal(new Set(bindings.map((row) => row.option)).size, 28);
      assert.equal(buildIncludedDrinkStockSql(), renderIncludedDrinkStockSql());
      for (const options of [
        null,
        {},
        { runnerOwnsTransaction: true, singleMigration: false },
        { runnerOwnsTransaction: true, singleMigration: true, split: true },
      ])
        assert.throws(() => buildManagedIncludedDrinkStockSql(options), /one runner-owned/);
      await db.exec("begin");
      await db.exec(
        buildManagedIncludedDrinkStockSql({ runnerOwnsTransaction: true, singleMigration: true }),
      );
      await db.exec("rollback");
      assert.equal(
        await scalar(
          "select to_regprocedure('mealdeck_private.included_drink_stock_available(uuid,uuid,uuid)')",
        ),
        null,
      );
      await db.exec(buildIncludedDrinkStockSql());
      await db.exec(buildIncludedDrinkStockSql());
      assert.equal(await dataDigest(), before);
      assert.deepEqual((await read()).items, originalSnapshot.items);
    },
  );
  await check(
    "only the original safe no-argument read is public; stock and pricing helpers stay private",
    async () => {
      const acl = await rows(`select n.nspname,p.proname,p.pronargs,p.proconfig,
      has_function_privilege('anon',p.oid,'EXECUTE') anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') staff,
      has_function_privilege('service_role',p.oid,'EXECUTE') service
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where p.proname in ('included_drink_stock_bindings','included_drink_stock_available',
        'price_checkout_lines','price_checkout_lines_before_included_stock','public_menu_before_included_stock','mealdeck_public_menu')`);
      assert.equal(acl.length, 6);
      for (const fn of acl) {
        assert.deepEqual(fn.proconfig, ['search_path=""']);
        if (fn.proname === "mealdeck_public_menu") {
          assert.equal(fn.nspname, "public");
          assert.equal(fn.pronargs, 0);
          assert.equal(fn.anon, true);
          assert.equal(fn.staff, true);
          assert.equal(fn.service, false);
        } else assert.ok(!fn.anon && !fn.staff && !fn.service, fn.proname);
      }
      for (const role of ["anon", "authenticated", "service_role"])
        await assert.rejects(
          () =>
            asActor(
              db,
              null,
              () =>
                db.query("select mealdeck_private.included_drink_stock_bindings($1)", [f.tenantId]),
              role,
            ),
          /permission denied/,
        );
      const publicJson = JSON.stringify(await read());
      assert.ok(!publicJson.includes(f.tenantId));
      assert.ok(!publicJson.includes(f.locationId));
      assert.ok(!publicJson.includes("option_id"));
      assert.ok(!publicJson.includes("customer"));
    },
  );
  await check(
    "every adult/kids included drink follows linked standalone stock in both menu and fresh checkout",
    async () => {
      for (const [index, binding] of bindings.entries()) {
        const line = lineFor(binding);
        const quote = await f.quote({ lines: [line] });
        const originalPrice = quote.lines;
        assert.equal(
          (await read()).items.find((row) => row.sku === line.sku).options[binding.option]
            .available,
          true,
        );
        await setVisible(binding.sku, false);
        const publicMenu = await read();
        assert.equal(
          publicMenu.items.some((row) => row.sku === binding.sku),
          false,
        );
        assert.equal(
          publicMenu.items.find((row) => row.sku === line.sku).options[binding.option].available,
          false,
        );
        await assert.rejects(() => f.quote({ lines: [line] }), /modifier_unavailable/);
        await assert.rejects(
          () => f.prepare(quote.quoteId, { attemptId: id(93000 + index) }),
          /modifier_unavailable/,
        );
        assert.equal(await scalar("select count(*)::integer from public.orders"), 0);
        await setVisible(binding.sku, true);
        assert.deepEqual((await f.quote({ lines: [line] })).lines, originalPrice);
        assert.equal(
          (await read()).items.find((row) => row.sku === line.sku).options[binding.option]
            .available,
          true,
        );
        // Each mapping is a separate local fixture case; preserve the production
        // per-customer quote rate limit rather than changing its function.
        await db.query("delete from mealdeck_private.checkout_quotes where customer_id=$1", [
          f.customer,
        ]);
      }
    },
  );
  const rubicon = bindings.find(
    (row) => row.option === "skorch-burgers-included-meal-drink-rubicon-mango",
  );
  const rubiconLine = lineFor(rubicon),
    rubiconId = productIds.get(rubicon.sku);
  const rubiconOption = launchModifierDatabaseId(f.tenantId, "option", rubicon.option);
  await check(
    "missing, inactive, wrong-brand, ambiguous, unrouted and hidden-category stock all fail closed",
    async () => {
      const product = (await rows("select * from public.menu_items where id=$1", [rubiconId]))[0];
      const category = product.category_id;
      const route = (
        await rows("select * from public.menu_item_station_routes where item_id=$1", [rubiconId])
      )[0];
      const cases = [
        [
          "update public.menu_items set active=false where id=$1",
          [rubiconId],
          "update public.menu_items set active=true where id=$1",
          [rubiconId],
        ],
        [
          "update public.menu_categories set active=false where id=$1",
          [category],
          "update public.menu_categories set active=true where id=$1",
          [category],
        ],
        [
          "update public.menu_items set sku='hidden-stock-fixture' where id=$1",
          [rubiconId],
          "update public.menu_items set sku=$2 where id=$1",
          [rubiconId, rubicon.sku],
        ],
        [
          "delete from public.menu_item_station_routes where item_id=$1",
          [rubiconId],
          "insert into public.menu_item_station_routes(tenant_id,location_id,item_id,station_id,prep_kind,prep_seconds) values($1,$2,$3,$4,$5,$6)",
          [
            route.tenant_id,
            route.location_id,
            route.item_id,
            route.station_id,
            route.prep_kind,
            route.prep_seconds,
          ],
        ],
      ];
      for (const [change, args, restore, restoreArgs] of cases) {
        await db.query(change, args);
        assert.equal(
          await scalar("select mealdeck_private.included_drink_stock_available($1,$2,$3)", [
            f.tenantId,
            f.locationId,
            rubiconOption,
          ]),
          false,
        );
        await assert.rejects(() => f.quote({ lines: [rubiconLine] }), /modifier_unavailable/);
        await db.query(restore, restoreArgs);
      }
      const other = (
        await rows(
          "select * from public.menu_items where tenant_id=$1 and sku='loadd-cans-drinks-rubicon-mango'",
          [f.tenantId],
        )
      )[0];
      await db.query("update public.menu_items set sku=$2 where id=$1", [other.id, rubicon.sku]);
      await assert.rejects(() => f.quote({ lines: [rubiconLine] }), /modifier_unavailable/);
      await db.query("update public.menu_items set sku='hidden-stock-fixture' where id=$1", [
        rubiconId,
      ]);
      await assert.rejects(() => f.quote({ lines: [rubiconLine] }), /modifier_unavailable/);
      await db.query("update public.menu_items set sku=$2 where id=$1", [other.id, other.sku]);
      await db.query("update public.menu_items set sku=$2 where id=$1", [rubiconId, rubicon.sku]);
      assert.equal(
        await scalar("select mealdeck_private.included_drink_stock_available($1,$2,$3)", [
          f.tenantId,
          id(99991),
          rubiconOption,
        ]),
        false,
      );
    },
  );
  await check(
    "option deactivation still wins and unrelated drinks retain their own stock",
    async () => {
      await db.query("update public.modifier_options set active=false where id=$1", [
        rubiconOption,
      ]);
      await assert.rejects(() => f.quote({ lines: [rubiconLine] }), /modifier_unavailable/);
      assert.equal(
        (await read()).items.find((row) => row.sku === rubiconLine.sku).options[rubicon.option]
          .available,
        false,
      );
      await db.query("update public.modifier_options set active=true where id=$1", [rubiconOption]);
      await setVisible(rubicon.sku, false);
      const pepsi = bindings.find(
        (row) => row.option === "skorch-burgers-included-meal-drink-pepsi",
      );
      assert.ok((await f.quote({ lines: [lineFor(pepsi)] })).totalPence > 0);
      assert.equal(
        (await read()).items.find((row) => row.sku === rubiconLine.sku).options[pepsi.option]
          .available,
        true,
      );
      await setVisible(rubicon.sku, true);
    },
  );
  await check(
    "existing prepared payment keeps immutable money and verified reconciliation after stock changes",
    async () => {
      const quote = await f.quote({ lines: [rubiconLine] });
      const prepared = await f.prepare(quote.quoteId, { attemptId: id(94000) });
      await f.bind(prepared.orderId);
      const beforeLines = await rows(
        "select item_name,quantity,unit_price_pence,modifiers from public.order_items where order_id=$1",
        [prepared.orderId],
      );
      await setVisible(rubicon.sku, false);
      await db.query("update public.modifier_options set active=false where id=$1", [
        rubiconOption,
      ]);
      const recovered = await f.prepare(quote.quoteId, { attemptId: id(94001) });
      assert.equal(recovered.orderId, prepared.orderId);
      assert.equal(recovered.totalPence, prepared.totalPence);
      assert.equal(recovered.sessionId, "cs_test_fixture");
      assert.equal(await scalar("select count(*)::integer from public.orders"), 1);
      assert.equal(await scalar("select count(*)::integer from public.kds_tickets"), 0);
      await f.reconcile(prepared);
      assert.equal(
        await scalar("select payment_status from public.orders where id=$1", [prepared.orderId]),
        "paid",
      );
      assert.ok(
        (await scalar("select count(*)::integer from public.kds_tickets where order_id=$1", [
          prepared.orderId,
        ])) > 0,
      );
      assert.deepEqual(
        await rows(
          "select item_name,quantity,unit_price_pence,modifiers from public.order_items where order_id=$1",
          [prepared.orderId],
        ),
        beforeLines,
      );
      await f.reconcile(prepared);
      assert.equal(await scalar("select count(*)::integer from public.orders"), 1);
    },
  );
  console.log(`Included drink stock: ${checks} PostgreSQL behavior groups passed.`);
} finally {
  await db.close();
}
