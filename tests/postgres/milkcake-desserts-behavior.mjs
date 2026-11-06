import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { asActor, createDatabase, id } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";
import {
  buildMilkcakeDessertsData,
  buildMilkcakeDessertsImportSql,
  buildManagedMilkcakeDessertsImportSql,
} from "../../deploy/mealdeck/milkcake-desserts.mjs";
import {
  buildManagedPublicMenuReadSql,
  buildPublicMenuReadSql,
} from "../../deploy/mealdeck/public-menu-read.mjs";

const db = await createDatabase(process.argv.includes("--native"), { uuid_ossp });
const data = buildMilkcakeDessertsData();
const skus = data.brands.flatMap((brand) => brand.items.map((item) => item.sku));
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
let checks = 0;
async function check(label, action) {
  await action();
  console.log(`PASS milkcake desserts ${++checks}: ${label}`);
}
async function execute(sql) {
  try {
    return await db.exec(sql);
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

try {
  await db.exec('create schema extensions;create extension "uuid-ossp" with schema extensions');
  const f = await setupStripeCheckoutFixture(db);
  const binding = { tenantId: f.tenantId, locationId: f.locationId, stationId: f.stationId };
  const managed = () =>
    buildManagedMilkcakeDessertsImportSql({
      ...binding,
      runnerOwnsTransaction: true,
      singleMigration: true,
    });
  const publicRead = () =>
    asActor(db, null, () => scalar("select public.mealdeck_public_menu()"), "anon");
  // Model the existing 79-item live catalogue before the additive dessert import.
  for (const [table, key] of [
    ["menu_item_station_routes", "item_id"],
    ["menu_item_channel_rules", "menu_item_id"],
  ])
    await db.query(
      `delete from public.${table} where ${key} in (select id from public.menu_items where sku=any($1))`,
      [skus],
    );
  await db.query("delete from public.menu_items where sku=any($1)", [skus]);
  await db.exec("delete from public.menu_categories where slug='desserts'");
  await db.exec(
    await readFile(
      new URL(
        "../../deploy/mealdeck/post-install-migrations/20261106115120_mealdeck_public_menu_read.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  const allState = async () => {
    const result = {};
    for (const table of [
      "public.tenants",
      "public.tenant_locations",
      "public.tenant_brands",
      "public.menu_categories",
      "public.menu_items",
      "public.menu_item_station_routes",
      "public.menu_item_channel_rules",
      "public.ordering_channels",
      "public.modifier_groups",
      "public.modifier_options",
      "public.menu_item_modifier_groups",
      "public.mealdeck_ops_audit_log",
      "public.orders",
      "public.kds_tickets",
      "mealdeck_private.checkout_settings",
    ])
      result[table] = await scalar(
        `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from ${table} t`,
      );
    result.authorities = await rows(`select n.nspname,p.proname,p.oid::regprocedure::text signature,
      md5(p.prosrc) hash,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','mealdeck_private','mealdeck_ops_private')
        and p.proname<>'mealdeck_public_menu' order by 1,2,3`);
    result.permissions =
      await rows(`select n.nspname,c.relname,c.relacl::text acl,c.relrowsecurity rls
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','mealdeck_private','mealdeck_ops_private')
        and c.relkind in ('r','S') order by 1,2`);
    return result;
  };
  const before = await allState();
  const assertExistingPreserved = async () => {
    const after = await allState();
    const onlyAppended = new Set([
      "public.menu_categories",
      "public.menu_items",
      "public.menu_item_station_routes",
      "public.menu_item_channel_rules",
      "public.mealdeck_ops_audit_log",
    ]);
    for (const [table, original] of Object.entries(before)) {
      if (onlyAppended.has(table)) {
        const current = new Set(after[table].map((row) => JSON.stringify(row)));
        for (const row of original)
          assert.ok(current.has(JSON.stringify(row)), `existing ${table} row changed`);
      } else assert.deepEqual(after[table], original, table);
    }
  };

  await check("bounded change requires explicit scope and an atomic managed runner", async () => {
    for (const options of [
      undefined,
      {},
      { ...binding, tenantId: "bad' UUID" },
      { ...binding, enableCheckout: true },
    ])
      assert.throws(() => buildMilkcakeDessertsImportSql(options), /MealDeck milkcake desserts/);
    for (const options of [
      null,
      binding,
      { ...binding, runnerOwnsTransaction: true, singleMigration: false },
    ])
      assert.throws(() => buildManagedMilkcakeDessertsImportSql(options), /one runner-owned/);
    await db.exec("begin");
    await db.exec(managed());
    await db.exec(
      buildManagedPublicMenuReadSql({ runnerOwnsTransaction: true, singleMigration: true }),
    );
    assert.equal((await publicRead()).items.filter((item) => skus.includes(item.sku)).length, 10);
    await db.exec("rollback");
    assert.deepEqual(await allState(), before);
    assert.equal(
      (await publicRead()).items.some((item) => skus.includes(item.sku)),
      false,
    );
  });
  await check("wrong kitchen or station fails before publishing any dessert", async () => {
    for (const wrong of [
      { ...binding, tenantId: id(95001) },
      { ...binding, locationId: id(95002) },
      { ...binding, stationId: id(95003) },
    ]) {
      await assert.rejects(
        () => execute(buildMilkcakeDessertsImportSql(wrong)),
        /mealdeck_milkcakes_/,
      );
      assert.deepEqual(await allState(), before);
    }
  });
  await check(
    "enabled kitchen receives ten £3.99 standalone desserts without existing changes",
    async () => {
      assert.equal(
        await scalar(
          "select enabled from public.ordering_channels where tenant_id=$1 and location_id=$2",
          [f.tenantId, f.locationId],
        ),
        true,
      );
      await execute(buildMilkcakeDessertsImportSql(binding));
      await assertExistingPreserved();
      const published = await rows(
        `select b.slug brand,c.slug category,c.active category_active,i.sku,i.name,
      i.price_pence,i.active,i.dietary,i.allergens,r.visible,r.price_override_pence,route.prep_kind,
      (select count(*)::integer from public.menu_item_modifier_groups g where g.item_id=i.id) group_count
      from public.menu_items i join public.tenant_brands b on b.id=i.brand_id
      join public.menu_categories c on c.id=i.category_id
      join public.menu_item_channel_rules r on r.menu_item_id=i.id
      join public.menu_item_station_routes route on route.item_id=i.id and route.station_id=$2
      where i.tenant_id=$1 and i.sku=any($3) order by i.sku`,
        [f.tenantId, f.stationId, skus],
      );
      assert.equal(published.length, 10);
      for (const item of published) {
        assert.equal(item.category, "desserts");
        assert.equal(item.category_active, true);
        assert.equal(item.price_pence, 399);
        assert.equal(item.active, true);
        assert.equal(item.visible, true);
        assert.equal(item.price_override_pence, null);
        assert.equal(item.prep_kind, "prep");
        assert.equal(item.group_count, 0);
        assert.deepEqual(item.dietary, {});
        assert.deepEqual(item.allergens, []);
        assert.ok(item.sku.startsWith(item.brand + "-desserts-"));
      }
      assert.equal(
        await scalar("select count(*)::integer from public.menu_categories where slug='desserts'"),
        5,
      );
      assert.equal(
        await scalar(
          "select count(*)::integer from public.mealdeck_ops_audit_log where action='catalogue.milkcake_desserts'",
        ),
        1,
      );
    },
  );
  await check(
    "only the new reviewed read manifest exposes dessert names and canonical prices",
    async () => {
      assert.equal(
        (await publicRead()).items.some((item) => skus.includes(item.sku)),
        false,
      );
      await db.exec(buildPublicMenuReadSql());
      await assertExistingPreserved();
      const desserts = (await publicRead()).items.filter((item) => skus.includes(item.sku));
      assert.equal(desserts.length, 10);
      assert.ok(
        desserts.every(
          (item) =>
            item.pricePence === 399 &&
            item.categoryName === "Desserts" &&
            Object.keys(item.options).length === 0,
        ),
      );
      for (const sku of skus) {
        const selection = [
          {
            lineId: "line-1",
            parentLineId: null,
            sku,
            quantity: 2,
            modifiers: [],
            attachment: null,
          },
        ];
        const result = await scalar(
          "select mealdeck_private.price_checkout_lines($1,$2,$3::jsonb)",
          [f.tenantId, f.locationId, JSON.stringify(selection)],
        );
        assert.equal(result.grossPence, 798);
        assert.equal(result.lines[0].sku, sku);
        assert.equal(result.lines[0].unit_pence, 399);
        assert.equal(result.lines[0].parentLineId, null);
        assert.match(result.lines[0].name, /^(Biscoff|Oreo) Milkcake$/);
      }
    },
  );
  await check("retries preserve every stock, price, name, allergen and routing edit", async () => {
    const item = (
      await rows("select id,category_id from public.menu_items where sku=$1", [skus[0]])
    )[0];
    await db.query(
      "update public.menu_items set price_pence=429,name='Staff dessert name',active=false,allergens=array['milk'] where id=$1",
      [item.id],
    );
    await db.query(
      "update public.menu_categories set name='Staff desserts',active=false where id=$1",
      [item.category_id],
    );
    await db.query(
      "update public.menu_item_channel_rules set visible=false,price_override_pence=449 where menu_item_id=$1",
      [item.id],
    );
    await db.query("delete from public.menu_item_station_routes where item_id=$1", [item.id]);
    const edited = await allState();
    await execute(buildMilkcakeDessertsImportSql(binding));
    assert.deepEqual(await allState(), edited);
    assert.equal(
      (await publicRead()).items.some((entry) => entry.sku === skus[0]),
      false,
    );
  });
  console.log(`Milkcake desserts: ${checks} PostgreSQL behaviour groups passed.`);
} catch (error) {
  console.error(error.message, error.detail ?? "", error.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
