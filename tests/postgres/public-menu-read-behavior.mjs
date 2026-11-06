import assert from "node:assert/strict";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { asActor, createDatabase, id } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";
import { launchModifierDatabaseId } from "../../deploy/mealdeck/catalogue-import.mjs";
import { buildPublicMenuSql } from "../../deploy/mealdeck/public-menu.mjs";
import {
  buildManagedPublicMenuReadSql,
  buildPublicMenuReadManifest,
  buildPublicMenuReadSql,
  renderPublicMenuReadSql,
} from "../../deploy/mealdeck/public-menu-read.mjs";

const db = await createDatabase(process.argv.includes("--native"), { uuid_ossp });
let checks = 0;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
async function check(label, action) {
  await action();
  console.log(`PASS public menu read ${++checks}: ${label}`);
}
async function probe(action) {
  await db.exec("begin");
  try {
    await action();
  } finally {
    await db.exec("rollback");
  }
}
try {
  await db.exec('create schema extensions; create extension "uuid-ossp" with schema extensions');
  const f = await setupStripeCheckoutFixture(db);
  await db.exec(buildPublicMenuSql());
  const manifest = buildPublicMenuReadManifest();
  const definition = () =>
    rows(`select n.nspname,p.proname,p.oid::regprocedure::text signature,
    md5(p.prosrc) hash,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','mealdeck_private','mealdeck_ops_private')
      and p.proname<>'mealdeck_public_menu' order by 1,2,3`);
  const permissions = () =>
    rows(`select n.nspname,c.relname,c.relacl::text acl,c.relrowsecurity rls
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','mealdeck_private','mealdeck_ops_private') and c.relkind in ('r','S') order by 1,2`);
  const originalDefinitions = await definition();
  const originalPermissions = await permissions();
  await check(
    "frozen source mapping, atomic installation and existing authority remain unchanged",
    async () => {
      assert.equal(buildPublicMenuReadSql(), renderPublicMenuReadSql());
      for (const options of [
        null,
        {},
        { runnerOwnsTransaction: true, singleMigration: false },
        { runnerOwnsTransaction: true, singleMigration: true, split: true },
      ])
        assert.throws(() => buildManagedPublicMenuReadSql(options), /one runner-owned/);
      await db.exec("begin");
      await db.exec(
        buildManagedPublicMenuReadSql({ runnerOwnsTransaction: true, singleMigration: true }),
      );
      await db.exec("rollback");
      assert.equal(await scalar("select to_regprocedure('public.mealdeck_public_menu()')"), null);
      await db.exec(buildPublicMenuReadSql());
      await db.exec(buildPublicMenuReadSql());
      assert.deepEqual(await definition(), originalDefinitions);
      assert.deepEqual(await permissions(), originalPermissions);
    },
  );
  const read = (role = "anon") =>
    asActor(
      db,
      role === "authenticated" ? f.customer : null,
      () => scalar("select public.mealdeck_public_menu()"),
      role,
    );
  const ace = (
    await rows("select * from public.menu_items where tenant_id=$1 and sku=$2", [
      f.tenantId,
      f.ace.id,
    ])
  )[0];
  const findAce = async () => (await read()).items.find((item) => item.sku === f.ace.id);

  await check(
    "only the safe no-argument read is public; raw scope and tables stay private",
    async () => {
      const acl = await rows(`select pronargs,prosecdef,provolatile,proconfig,
      has_function_privilege('anon',oid,'EXECUTE') anon,
      has_function_privilege('authenticated',oid,'EXECUTE') staff,
      has_function_privilege('service_role',oid,'EXECUTE') service
      from pg_proc where oid='public.mealdeck_public_menu()'::regprocedure`);
      assert.equal(acl.length, 1);
      assert.deepEqual(acl[0], {
        pronargs: 0,
        prosecdef: true,
        provolatile: "s",
        proconfig: ['search_path=""'],
        anon: true,
        staff: true,
        service: false,
      });
      assert.equal((await read()).items.length, manifest.items.length);
      assert.equal((await read("authenticated")).items.length, manifest.items.length);
      await assert.rejects(
        () =>
          asActor(
            db,
            null,
            () => db.query("select public.mealdeck_public_menu($1::uuid)", [f.tenantId]),
            "anon",
          ),
        /does not exist/,
      );
      for (const role of ["anon", "authenticated"]) {
        await assert.rejects(
          () =>
            asActor(
              db,
              null,
              () =>
                db.query(
                  "select public.mealdeck_public_launch_catalogue($1,$2,'{}'::text[],'{}'::uuid[])",
                  [f.tenantId, f.locationId],
                ),
              role,
            ),
          /permission denied/,
        );
        for (const table of [
          "public.menu_items",
          "public.modifier_options",
          "public.orders",
          "public.mealdeck_ops_audit_log",
          "mealdeck_private.installation",
        ])
          await assert.rejects(
            () => asActor(db, null, () => db.query(`select * from ${table} limit 1`), role),
            /permission denied/,
          );
      }
    },
  );
  await check(
    "public results contain reviewed source keys and no private identifiers",
    async () => {
      const result = await read();
      assert.deepEqual(Object.keys(result).sort(), ["available", "checkedAt", "items"]);
      assert.equal(result.available, true);
      assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
      for (const item of result.items) {
        const binding = manifest.items.find((source) => source.sku === item.sku);
        assert.ok(binding);
        assert.deepEqual(
          Object.keys(item).sort(),
          [
            "categoryName",
            "description",
            "name",
            "options",
            "pricePence",
            "replacementPricePence",
            "sku",
            ...(binding.replacement ? ["replacementLabel"] : []),
          ].sort(),
        );
        const known = manifest.groups
          .filter((g) => binding.groups.includes(g.id))
          .flatMap((g) => g.options.map((o) => o.id));
        for (const [key, option] of Object.entries(item.options)) {
          assert.ok(known.includes(key));
          assert.deepEqual(Object.keys(option).sort(), ["available", "label", "pricePence"]);
        }
      }
      const text = JSON.stringify(result);
      for (const secret of [f.tenantId, f.locationId, f.stationId, f.customer, f.owner, ace.id])
        assert.ok(!text.includes(secret));
      assert.equal(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i.test(text), false);
    },
  );
  await check(
    "closed checkout remains browsable and repeated reads change no business data",
    async () => {
      await db.exec(
        "update public.ordering_channels set enabled=false;update mealdeck_private.checkout_settings set checkout_enabled=false",
      );
      const tables =
        await rows(`select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','mealdeck_private','mealdeck_ops_private') and c.relkind='r' order by 1,2`);
      const digest = async () => {
        const result = [];
        for (const table of tables)
          result.push(
            await scalar(
              `select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from "${table.nspname}"."${table.relname}" t`,
            ),
          );
        return result;
      };
      const before = await digest();
      assert.equal((await read()).items.length, manifest.items.length);
      await read("authenticated");
      assert.deepEqual(await digest(), before);
    },
  );
  await check("inactive, hidden, unrouted and duplicate catalogue rows are excluded", async () => {
    for (const [sql, args] of [
      ["update public.menu_items set active=false where id=$1", [ace.id]],
      ["update public.tenant_brands set active=false where id=$1", [ace.brand_id]],
      ["update public.menu_categories set active=false where id=$1", [ace.category_id]],
      ["update public.menu_item_channel_rules set visible=false where menu_item_id=$1", [ace.id]],
      ["update public.kitchen_stations set active=false where id=$1", [f.stationId]],
      ["delete from public.menu_item_station_routes where item_id=$1", [ace.id]],
      [
        "insert into public.menu_items(tenant_id,brand_id,category_id,name,price_pence,sku) values($1,$2,$3,'Private duplicate',100,$4)",
        [f.tenantId, ace.brand_id, ace.category_id, f.ace.id],
      ],
    ])
      await probe(async () => {
        await db.query(sql, args);
        assert.equal(await findAce(), undefined);
      });
  });
  await check(
    "unknown SKUs and known SKUs moved to another reviewed brand never publish",
    async () => {
      await probe(async () => {
        await db.query(
          "update public.menu_items set sku='unreviewed-private-dish',name='PRIVATE DRAFT LABEL' where id=$1",
          [ace.id],
        );
        const result = await read();
        assert.equal(
          result.items.some((i) => i.sku === "unreviewed-private-dish"),
          false,
        );
        assert.ok(!JSON.stringify(result).includes("PRIVATE DRAFT LABEL"));
      });
      await probe(async () => {
        const other = (
          await rows(
            "select brand_id,id from public.menu_categories where tenant_id=$1 and brand_id<>$2 limit 1",
            [f.tenantId, ace.brand_id],
          )
        )[0];
        await db.query("update public.menu_items set brand_id=$1,category_id=$2 where id=$3", [
          other.brand_id,
          other.id,
          ace.id,
        ]);
        assert.equal(await findAce(), undefined);
      });
    },
  );
  await check(
    "unknown required groups hide dishes, unknown options and wrong group membership are omitted",
    async () => {
      await probe(async () => {
        const groupId = id(61001),
          optionId = id(61002);
        await db.query(
          "insert into public.modifier_groups(id,tenant_id,name,min_select,max_select) values($1,$2,'PRIVATE REQUIRED GROUP',1,1)",
          [groupId, f.tenantId],
        );
        await db.query(
          "insert into public.modifier_options(id,tenant_id,group_id,name,price_delta_pence,active) values($1,$2,$3,'PRIVATE OPTION',100,true)",
          [optionId, f.tenantId, groupId],
        );
        await db.query(
          "insert into public.menu_item_modifier_groups(tenant_id,item_id,group_id) values($1,$2,$3)",
          [f.tenantId, ace.id, groupId],
        );
        assert.equal(await findAce(), undefined);
        await db.query("update public.modifier_groups set min_select=0 where id=$1", [groupId]);
        assert.ok(await findAce());
        assert.ok(!JSON.stringify(await read()).includes("PRIVATE"));
        const source = f.data.modifierGroups.find((g) => g.id === "skorch-burgers-burger-add-ons");
        const knownId = launchModifierDatabaseId(f.tenantId, "option", source.options[0].id);
        await db.query("update public.modifier_options set group_id=$1 where id=$2", [
          groupId,
          knownId,
        ]);
        assert.equal((await findAce()).options[source.options[0].id], undefined);
      });
    },
  );
  await check(
    "blocked milkshake stays unavailable and source variants and replacement prices stay canonical",
    async () => {
      await db.exec("update public.modifier_options set active=true");
      const result = await read();
      const blocked = manifest.groups.flatMap((g) =>
        g.options.filter((o) => !o.allowed).map((o) => o.id),
      );
      assert.ok(blocked.length > 0);
      const seen = result.items
        .flatMap((i) => Object.entries(i.options))
        .filter(([key]) => blocked.includes(key));
      assert.ok(seen.length > 0);
      assert.ok(seen.every(([, option]) => option.available === false));
      const variant = f.data.modifierGroups.find((g) => g.importKind === "price-variant");
      assert.equal(
        result.items.find((i) => i.sku === variant.itemId).options[variant.options[2].id]
          .pricePence,
        variant.options[2].pricePence,
      );
      const binding = manifest.items.find((i) => i.replacement);
      const replacement = launchModifierDatabaseId(
        f.tenantId,
        "option",
        binding.replacement.option,
      );
      await db.query(
        "update public.modifier_options set name='Current shared upgrade',price_delta_pence=379 where id=$1",
        [replacement],
      );
      const target = (await read()).items.find((i) => i.sku === binding.sku);
      assert.equal(target.replacementPricePence, 379);
      assert.equal(target.replacementLabel, "Current shared upgrade");
    },
  );
  await check(
    "internal installation scope fails closed without any caller scope override",
    async () => {
      for (const [sql, args] of [
        ["update public.tenants set active=false where id=$1", [f.tenantId]],
        ["update public.tenant_locations set active=false where id=$1", [f.locationId]],
        [
          "insert into public.tenant_locations(id,tenant_id,name,slug) values($1,$2,'Other kitchen','other-kitchen')",
          [id(61003), f.tenantId],
        ],
        [
          "insert into public.tenants(id,name,slug,legal_name) values($1,'Other business','other-business','Other Ltd')",
          [id(61004)],
        ],
      ])
        await probe(async () => {
          await db.query(sql, args);
          await db.exec("savepoint expected_scope_failure");
          await assert.rejects(
            () =>
              asActor(
                db,
                null,
                async () => {
                  try {
                    return await scalar("select public.mealdeck_public_menu()");
                  } catch (error) {
                    // Restore the test transaction before asActor resets its test-only role.
                    await db.exec("rollback to savepoint expected_scope_failure");
                    throw error;
                  }
                },
                "anon",
              ),
            /scope_unavailable/,
          );
        });
    },
  );
  console.log(`Public menu read: ${checks} PostgreSQL behaviour groups passed.`);
} catch (error) {
  console.error(error.message, error.detail ?? "", error.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
