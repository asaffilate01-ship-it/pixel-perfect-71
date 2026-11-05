import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { buildStandaloneSql } from "../../deploy/mealdeck/build.mjs";
import {
  buildLaunchCatalogueData,
  buildLaunchCatalogueImportSql,
  buildManagedLaunchCatalogueImportSql,
  launchCatalogueCounts,
  launchModifierDatabaseId,
} from "../../deploy/mealdeck/catalogue-import.mjs";
import { asActor, createDatabase, id } from "./harness.mjs";
import { verifyModifierPrices } from "./modifier-price-behavior.mjs";

const db = await createDatabase(process.argv.includes("--native"));
const owner = id(801);
const data = buildLaunchCatalogueData();
const binding = { tenantId: id(901), locationId: id(902), stationId: id(903) };
const managed = () =>
  buildManagedLaunchCatalogueImportSql({
    ...binding,
    runnerOwnsTransaction: true,
    singleMigration: true,
  });
let checks = 0;
let importedItem;

async function test(label, action) {
  try {
    await action();
    console.log("PASS catalogue " + ++checks + ": " + label);
  } catch (error) {
    console.error("FAIL catalogue: " + label);
    throw error;
  }
}

async function execute(sql) {
  try {
    return await db.exec(sql);
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

const runImport = (target = binding) => execute(buildLaunchCatalogueImportSql(target));

async function snapshot() {
  const result = {};
  for (const table of [
    "tenants",
    "tenant_locations",
    "tenant_brands",
    "menu_categories",
    "menu_items",
    "modifier_groups",
    "modifier_options",
    "menu_item_modifier_groups",
    "menu_item_station_routes",
    "menu_item_channel_rules",
    "ordering_channels",
    "mealdeck_ops_audit_log",
    "orders",
    "kds_tickets",
  ])
    result[table] = (
      await db.query(
        "select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as rows from public." +
          table +
          " t",
      )
    ).rows[0].rows;
  return result;
}

async function rejectsUnchanged(action, pattern) {
  const before = await snapshot();
  await assert.rejects(action, pattern);
  assert.deepEqual(await snapshot(), before);
}

try {
  console.log("Engine: " + (await db.query("select version() as version")).rows[0].version);
  await db.exec(await readFile(new URL("./standalone-auth-fixture.sql", import.meta.url), "utf8"));

  await test("the generated plan contains all approved items, source choices and named replacement prices", async () => {
    assert.deepEqual(launchCatalogueCounts(data), {
      brands: 5,
      categories: 20,
      items: 77,
      modifierGroups: 17,
      modifierOptions: 66,
      itemGroupLinks: 49,
    });
    const items = data.brands.flatMap((brand) =>
      brand.sections.flatMap((section) => section.items),
    );
    assert.ok(items.every((item) => item.pricePence === 2000));
    assert.equal(new Set(items.map((item) => item.id)).size, 77);
    assert.equal(
      data.modifierGroups
        .filter((group) => group.importKind === "cross-replacement")
        .flatMap((group) => group.options).length,
      17,
    );
    assert.ok(
      data.modifierGroups
        .filter((group) => group.importKind === "cross-replacement")
        .flatMap((group) => group.options)
        .every((option) => option.pricePence === 2000),
    );
    assert.deepEqual(
      JSON.parse(
        await readFile(
          new URL("../../deploy/mealdeck/catalogue/launch-catalogue.json", import.meta.url),
          "utf8",
        ),
      ),
      data,
    );
  });

  await test("the builder requires explicit UUID bindings and a complete managed transaction contract", async () => {
    for (const bad of [
      undefined,
      {},
      { ...binding, tenantId: "mealdeck" },
      { ...binding, locationId: "';drop table public.orders;--" },
      { ...binding, stationId: null },
      { ...binding, force: true },
    ])
      assert.throws(() => buildLaunchCatalogueImportSql(bad), /MealDeck launch catalogue/);
    for (const bad of [
      undefined,
      binding,
      { ...binding, runnerOwnsTransaction: true },
      { ...binding, runnerOwnsTransaction: true, singleMigration: false },
      { ...binding, runnerOwnsTransaction: true, singleMigration: true, autocommit: true },
    ])
      assert.throws(
        () => buildManagedLaunchCatalogueImportSql(bad),
        /one runner-owned atomic transaction/,
      );
    assert.match(buildLaunchCatalogueImportSql(binding), /\nbegin;\n/);
    assert.match(buildLaunchCatalogueImportSql(binding), /\ncommit;\n$/);
    assert.deepEqual(managed().match(/^[\t ]*(?:begin|commit);[\t ]*$/gim) ?? [], []);
  });

  await test("a database without the independent installation marker rejects the import before any business write", async () => {
    await assert.rejects(() => runImport(), /independent_profile_required/);
    assert.equal(
      (await db.query("select to_regclass('public.menu_items') as relation")).rows[0].relation,
      null,
    );
  });

  await db.exec(buildStandaloneSql());

  await test("an installed but unbootstrapped profile cannot create a tenant or owner as an import side effect", async () => {
    await rejectsUnchanged(() => runImport(), /bootstrap_required/);
    assert.equal(
      (await db.query("select count(*)::integer as count from auth.users")).rows[0].count,
      0,
    );
  });

  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'catalogue-owner@example.invalid',now())",
    [owner],
  );
  const receipt = (
    await db.query("select mealdeck_private.bootstrap_business($1,'MealDeck') as result", [owner])
  ).rows[0].result;
  Object.assign(binding, {
    tenantId: receipt.tenant_id,
    locationId: receipt.location_id,
    stationId: receipt.station_id,
  });

  await test("an unrelated business UUID or incorrect kitchen/station cannot receive the draft catalogue", async () => {
    await rejectsUnchanged(() => runImport({ ...binding, tenantId: id(999) }), /business_mismatch/);
    await rejectsUnchanged(
      () => runImport({ ...binding, locationId: id(999) }),
      /business_or_kitchen_mismatch/,
    );
    await rejectsUnchanged(
      () => runImport({ ...binding, stationId: id(999) }),
      /single_shared_station_required/,
    );
  });

  await test("anonymous, authenticated owner and service-role API identities cannot run the database-owner import", async () => {
    for (const role of ["anon", "authenticated", "service_role"])
      await rejectsUnchanged(
        () => asActor(db, owner, () => runImport(), role),
        /database_owner_required|permission denied/,
      );
  });

  await test("the presence of a shared Dishbee schema rejects this standalone import", async () => {
    await db.exec("create schema dishbee_private");
    await rejectsUnchanged(() => runImport(), /independent_profile_required/);
    await db.exec("drop schema dishbee_private");
  });

  await test("an open channel and multiple active stations both block the import without changing records", async () => {
    await db.query("update public.ordering_channels set enabled=true where tenant_id=$1", [
      binding.tenantId,
    ]);
    await rejectsUnchanged(() => runImport(), /closed_channel_required/);
    await db.query("update public.ordering_channels set enabled=false where tenant_id=$1", [
      binding.tenantId,
    ]);
    await db.query(
      "insert into public.kitchen_stations(id,tenant_id,location_id,name,code) values($1,$2,$3,'Extra fixture station','EXTRA')",
      [id(999), binding.tenantId, binding.locationId],
    );
    await rejectsUnchanged(() => runImport(), /single_shared_station_required/);
    await db.query("delete from public.kitchen_stations where id=$1", [id(999)]);
  });

  await test("a missing launch-brand mapping aborts without creating a replacement brand or partial catalogue", async () => {
    await db.query(
      "update public.tenant_brands set slug='unmapped-moktl' where tenant_id=$1 and slug='moktl'",
      [binding.tenantId],
    );
    await rejectsUnchanged(() => runImport(), /launch_brand_required/);
    await db.query(
      "update public.tenant_brands set slug='moktl' where tenant_id=$1 and slug='unmapped-moktl'",
      [binding.tenantId],
    );
  });

  await test("an unrelated modifier group with the same source name is not silently adopted or duplicated", async () => {
    await db.query("insert into public.modifier_groups(id,tenant_id,name) values($1,$2,$3)", [
      id(998),
      binding.tenantId,
      data.modifierGroups[0].name,
    ]);
    await rejectsUnchanged(() => runImport(), /modifier_group_name_collision/);
    await db.query("delete from public.modifier_groups where id=$1", [id(998)]);
  });

  await test("a late failure in the runner-owned transaction rolls back categories, prices, modifiers, routes and audit together", async () => {
    const before = await snapshot();
    await db.exec("begin");
    try {
      await db.exec(managed());
      await assert.rejects(
        () => db.exec("do $$ begin raise exception 'catalogue_late_failure'; end $$"),
        /catalogue_late_failure/,
      );
    } finally {
      await db.exec("rollback");
    }
    assert.deepEqual(await snapshot(), before);
  });

  await test("a complete import creates draft catalogue rows and one shared route without enabling orders", async () => {
    await runImport();
    const state = await snapshot();
    assert.equal(state.menu_categories.length, 25); // 20 source categories plus the five untouched bootstrap placeholders.
    assert.equal(state.menu_items.length, 77);
    assert.ok(
      state.menu_items.every(
        (item) => item.price_pence === 2000 && item.active === false && item.sku,
      ),
    );
    assert.equal(state.modifier_groups.length, 17);
    assert.equal(state.modifier_options.length, 66);
    assert.ok(state.modifier_options.every((option) => option.active === false));
    assert.equal(state.menu_item_modifier_groups.length, 49);
    assert.equal(state.menu_item_station_routes.length, 77);
    assert.ok(
      state.menu_item_station_routes.every(
        (route) => route.station_id === binding.stationId && route.prep_seconds === null,
      ),
    );
    assert.equal(state.menu_item_channel_rules.length, 77);
    assert.ok(
      state.menu_item_channel_rules.every(
        (rule) => rule.visible === false && rule.price_override_pence === null,
      ),
    );
    assert.ok(state.ordering_channels.every((channel) => channel.enabled === false));
    assert.equal(state.orders.length, 0);
    assert.equal(state.kds_tickets.length, 0);
    assert.equal(
      state.mealdeck_ops_audit_log.filter((row) => row.action === "catalogue.launch_import").length,
      1,
    );
    importedItem = state.menu_items.find(
      (item) => item.sku === "skorch-burgers-beef-smash-deck-the-ace",
    );
    assert.match(importedItem.description, /cheese, gherkin, caramelised onion & Algerian sauce/);
    assert.match(importedItem.description, /Single beef smash/);
  });

  await test("included modifiers stay zero, all optional and replacement prices are £20, and conditional metadata is retained", async () => {
    for (const group of data.modifierGroups) {
      const groupId = launchModifierDatabaseId(binding.tenantId, "group", group.id);
      const options = (
        await db.query(
          "select id,price_delta_pence from public.modifier_options where group_id=$1",
          [groupId],
        )
      ).rows;
      assert.equal(options.length, group.options.length);
      for (const option of group.options)
        assert.equal(
          options.find(
            (row) => row.id === launchModifierDatabaseId(binding.tenantId, "option", option.id),
          ).price_delta_pence,
          option.pricePence,
        );
      if (group.when) {
        assert.ok(group.when.groupId && group.when.optionIds.length);
        assert.equal(
          (await db.query("select min_select from public.modifier_groups where id=$1", [groupId]))
            .rows[0].min_select,
          0,
        );
      }
      if (group.importKind === "cross-replacement") {
        assert.equal(
          (
            await db.query(
              "select count(*)::integer as count from public.menu_item_modifier_groups where group_id=$1",
              [groupId],
            )
          ).rows[0].count,
          0,
        );
        assert.ok(group.options.every((option) => option.targetItemId && option.targetBrandId));
      }
    }
  });

  await test("rerunning the import preserves all existing UUIDs and creates no duplicate catalogue rows or audit entry", async () => {
    const before = await snapshot();
    await runImport();
    assert.deepEqual(await snapshot(), before);
  });

  await test("an item price changed through the real owner RPC and later modifier edits survive repeat import", async () => {
    const saved = await asActor(
      db,
      owner,
      async () =>
        (
          await db.query(
            "select public.mealdeck_ops_update_menu_item($1,$2,'Reviewed Ace','Reviewed description',1450,false) as saved",
            [binding.tenantId, importedItem.id],
          )
        ).rows[0].saved,
    );
    assert.equal(saved, true);
    const option = data.modifierGroups.find((group) => group.id === "skorch-burgers-burger-add-ons")
      .options[0];
    const optionId = launchModifierDatabaseId(binding.tenantId, "option", option.id);
    // Isolate rerun preservation here. The separate staff modifier-price
    // extension is installed and exercised after all importer checks below.
    await db.query(
      "update public.modifier_options set name='Reviewed add-on',price_delta_pence=375 where id=$1",
      [optionId],
    );
    await db.query("update public.menu_item_station_routes set prep_seconds=360 where item_id=$1", [
      importedItem.id,
    ]);
    await db.query(
      "update public.menu_item_channel_rules set price_override_pence=1550 where menu_item_id=$1",
      [importedItem.id],
    );
    const before = await snapshot();
    await runImport();
    assert.deepEqual(await snapshot(), before);
    assert.equal(
      (await db.query("select price_pence from public.menu_items where id=$1", [importedItem.id]))
        .rows[0].price_pence,
      1450,
    );
    assert.equal(
      (
        await db.query("select price_delta_pence from public.modifier_options where id=$1", [
          optionId,
        ])
      ).rows[0].price_delta_pence,
      375,
    );
  });

  await test("a second active or published kitchen blocks tenant-wide catalogue changes and preserves its existing prices", async () => {
    await db.query(
      "insert into public.tenant_locations(id,tenant_id,name,slug) values($1,$2,'Future kitchen fixture','future-kitchen-fixture')",
      [id(996), binding.tenantId],
    );
    await db.query(
      "insert into public.ordering_channels(tenant_id,location_id,channel_key,enabled) values($1,$2,'mealdeck',true)",
      [binding.tenantId, id(996)],
    );
    await rejectsUnchanged(() => runImport(), /single_active_kitchen_required/);
    await db.query("update public.tenant_locations set active=false where id=$1", [id(996)]);
    await rejectsUnchanged(() => runImport(), /closed_channel_required/);
    await db.query("delete from public.ordering_channels where tenant_id=$1 and location_id=$2", [
      binding.tenantId,
      id(996),
    ]);
    await db.query("delete from public.tenant_locations where id=$1", [id(996)]);
  });

  await test("duplicate source SKUs reject the whole import instead of adopting one arbitrary product", async () => {
    const duplicate = (
      await db.query(
        "insert into public.menu_items(tenant_id,brand_id,category_id,name,description,price_pence,sku) select tenant_id,brand_id,category_id,'Duplicate fixture',description,999,sku from public.menu_items where id=$1 returning id",
        [importedItem.id],
      )
    ).rows[0].id;
    await rejectsUnchanged(() => runImport(), /duplicate_sku/);
    await db.query("delete from public.menu_items where id=$1", [duplicate]);
  });

  await test("a source option replaced by a different UUID is reported instead of adding another chargeable copy", async () => {
    const originalId = launchModifierDatabaseId(
      binding.tenantId,
      "option",
      data.modifierGroups[0].options[0].id,
    );
    await db.query("update public.modifier_options set id=$1 where id=$2", [id(997), originalId]);
    await rejectsUnchanged(() => runImport(), /modifier_option_name_collision/);
    await db.query("update public.modifier_options set id=$1 where id=$2", [originalId, id(997)]);
  });

  await test("a source SKU moved into a different brand/category is not silently reassigned", async () => {
    const other = (
      await db.query(
        "select brand_id,id from public.menu_categories where tenant_id=$1 and brand_id<>$2 order by id limit 1",
        [binding.tenantId, importedItem.brand_id],
      )
    ).rows[0];
    await db.query("update public.menu_items set brand_id=$1,category_id=$2 where id=$3", [
      other.brand_id,
      other.id,
      importedItem.id,
    ]);
    await rejectsUnchanged(() => runImport(), /sku_scope_collision/);
    await db.query("update public.menu_items set brand_id=$1,category_id=$2 where id=$3", [
      importedItem.brand_id,
      importedItem.category_id,
      importedItem.id,
    ]);
  });

  await test("a changed route is preserved and reported as a conflict", async () => {
    await db.query(
      "insert into public.kitchen_stations(id,tenant_id,location_id,name,code,active) values($1,$2,$3,'Retired fixture station','OLD',false)",
      [id(999), binding.tenantId, binding.locationId],
    );
    await db.query("update public.menu_item_station_routes set station_id=$1 where item_id=$2", [
      id(999),
      importedItem.id,
    ]);
    await rejectsUnchanged(() => runImport(), /existing_route_conflict/);
    await db.query("update public.menu_item_station_routes set station_id=$1 where item_id=$2", [
      binding.stationId,
      importedItem.id,
    ]);
    await db.query("delete from public.kitchen_stations where id=$1", [id(999)]);
  });

  await test("the import leaves RLS, API grants, owner identity and payment-release readiness unchanged", async () => {
    const unsafe = (
      await db.query(
        "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))",
      )
    ).rows;
    assert.deepEqual(unsafe, []);
    assert.equal(
      (await db.query("select count(*)::integer as count from auth.users")).rows[0].count,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select bootstrap_owner_id from mealdeck_private.installation where singleton",
        )
      ).rows[0].bootstrap_owner_id,
      owner,
    );
    assert.equal(
      (await db.query("select mealdeck_ops_private.kds_authority_ready() as ready")).rows[0].ready,
      false,
    );
    assert.equal(
      (
        await db.query(
          "select to_regprocedure('mealdeck_private.kds_release_authority(uuid)') as adapter",
        )
      ).rows[0].adapter,
      null,
    );
  });

  if (db.native) {
    await test("two independent import sessions serialize and retain the operator's changed prices", async () => {
      const other = new pg.Client(db.config);
      await other.connect();
      const otherPid = (await other.query("select pg_backend_pid() as pid")).rows[0].pid;
      const ownPid = (await db.query("select pg_backend_pid() as pid")).rows[0].pid;
      const before = await snapshot();
      let pending;
      try {
        await db.exec("begin");
        await db.exec(managed());
        pending = other.query(buildLaunchCatalogueImportSql(binding));
        let observed = false;
        for (let attempt = 0; attempt < 40; attempt++) {
          const blockers = (await db.query("select pg_blocking_pids($1) as blockers", [otherPid]))
            .rows[0].blockers;
          if (blockers.includes(ownPid)) {
            observed = true;
            break;
          }
          await new Promise((resolveWait) => setTimeout(resolveWait, 25));
        }
        assert.equal(observed, true, "pg_blocking_pids must show a real independent-session wait");
        await db.exec("commit");
        await pending;
        assert.deepEqual(await snapshot(), before);
      } finally {
        await db.exec("rollback");
        if (pending) await pending.catch(() => {});
        await other.end();
      }
    });
  } else console.log("SKIP native import concurrency: embedded PostgreSQL has one connection.");

  console.log(
    "PASS catalogue import: " +
      checks +
      " behavioral groups; no hosted database or provider calls.",
  );
  await verifyModifierPrices(db, { ...binding, owner });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
