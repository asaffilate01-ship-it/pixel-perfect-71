import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildStandaloneSql } from "../../deploy/mealdeck/build.mjs";
import { asActor, createDatabase, id } from "./harness.mjs";

// This suite installs the complete deployable profile. Only Supabase's local
// Auth and API roles are shimmed; no Dishbee schema, canonical-fixture.sql, or
// synthetic payment authority is installed. All business records below are
// disposable test data and never part of the production installer.
const db = await createDatabase(process.argv.includes("--native"));
const people = Object.freeze({
  owner: id(501),
  kitchen: id(502),
  finance: id(503),
  customer: id(504),
  unconfirmed: id(505),
  anonymous: id(506),
  foreign: id(507),
  localMenu: id(508),
});
const foreign = {
  tenant: id(601),
  location: id(602),
  brand: id(603),
  category: id(604),
  ingredient: id(605),
  station: id(606),
  order: id(607),
  item: id(608),
  orderItem: id(609),
};
const state = {};
let checks = 0;

async function test(label, action) {
  checks++;
  try {
    await action();
    console.log(`PASS standalone ${checks}: ${label}`);
  } catch (error) {
    console.error(`FAIL standalone ${checks}: ${label}`);
    throw error;
  }
}

async function rejects(action, pattern = /forbidden|denied|permission|scope|location/i) {
  await assert.rejects(action, (error) => {
    assert.match(error.message, pattern);
    return true;
  });
}

function expression(name, args) {
  assert.match(name, /^mealdeck_ops_[a-z_]+$/);
  return `public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")})`;
}

async function rows(user, name, args = []) {
  return (await asActor(db, user, () => db.query(`select * from ${expression(name, args)}`, args)))
    .rows;
}

async function value(user, name, args = []) {
  return (
    await asActor(db, user, () => db.query(`select ${expression(name, args)} as value`, args))
  ).rows[0].value;
}

async function count(table) {
  assert.match(table, /^[a-z_]+$/);
  return (await db.query(`select count(*)::integer as count from public.${table}`)).rows[0].count;
}

async function assign(user, role, location = state.location, enabled = true) {
  return value(people.owner, "mealdeck_ops_assign_staff", [
    state.tenant,
    user,
    location,
    role,
    [],
    [],
    enabled,
  ]);
}

try {
  console.log(`Engine: ${(await db.query("select version() as version")).rows[0].version}`);
  await db.exec(await readFile(new URL("./standalone-auth-fixture.sql", import.meta.url), "utf8"));

  await test("private function-only, type-only and sequence-only projects reject installation without changing existing objects", async () => {
    await db.exec("create schema standalone_existing_app");
    const objects = [
      {
        create:
          "create function standalone_existing_app.kept_function() returns text language sql immutable as $$ select 'KEEP EXISTING APPLICATION'::text $$",
        snapshot:
          "select oid,pg_get_functiondef(oid) as definition,proacl::text as acl from pg_proc where oid='standalone_existing_app.kept_function()'::regprocedure",
        remove: "drop function standalone_existing_app.kept_function()",
      },
      {
        create:
          "create type standalone_existing_app.kept_type as enum('keep_existing_application')",
        snapshot:
          "select t.oid,t.typacl::text as acl,e.enumlabel from pg_type t join pg_enum e on e.enumtypid=t.oid where t.oid='standalone_existing_app.kept_type'::regtype",
        remove: "drop type standalone_existing_app.kept_type",
      },
      {
        create: "create sequence standalone_existing_app.kept_sequence start 42",
        snapshot:
          "select c.oid,c.relacl::text as acl,s.last_value,s.is_called from pg_class c cross join standalone_existing_app.kept_sequence s where c.oid='standalone_existing_app.kept_sequence'::regclass",
        remove: "drop sequence standalone_existing_app.kept_sequence",
      },
    ];
    for (const object of objects) {
      await db.exec(object.create);
      const before = (await db.query(object.snapshot)).rows;
      await rejects(() => db.exec(buildStandaloneSql()), /requires_fresh_database/);
      await db.exec("rollback");
      assert.deepEqual((await db.query(object.snapshot)).rows, before);
      assert.deepEqual(
        (await db.query("select nspname from pg_namespace where nspname like 'mealdeck%'")).rows,
        [],
      );
      assert.deepEqual(
        (
          await db.query(
            "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'",
          )
        ).rows,
        [],
      );
      await db.exec(object.remove);
    }
    await db.exec("drop schema standalone_existing_app");
  });

  await test("a deliberate late installation failure rolls back all application objects and the private profile marker", async () => {
    const bundle = buildStandaloneSql();
    assert.match(bundle, /commit;\s*$/i, "The generated profile must finish its outer transaction");
    const broken = bundle.replace(
      /commit;\s*$/i,
      () => "do $$ begin raise exception 'standalone_late_install_failure'; end $$;\ncommit;\n",
    );
    await rejects(() => db.exec(broken), /standalone_late_install_failure/);
    await db.exec("rollback");
    assert.deepEqual(
      (
        await db.query(`
      select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' or n.nspname like 'mealdeck%'
    `)
      ).rows,
      [],
    );
    assert.deepEqual(
      (await db.query("select nspname from pg_namespace where nspname like 'mealdeck%'")).rows,
      [],
    );
  });

  await test("fresh production profile installs all admin, recipe, procurement, invoice, group, fulfilment and KDS migrations", async () => {
    await db.exec(buildStandaloneSql());
    assert.equal(
      (await db.query("show check_function_bodies")).rows[0].check_function_bodies,
      "on",
    );
    for (const table of [
      "tenants",
      "tenant_locations",
      "tenant_brands",
      "menu_categories",
      "menu_items",
      "mealdeck_ops_staff_access",
      "mealdeck_ops_audit_log",
      "mealdeck_ops_recipes",
      "mealdeck_ops_purchase_orders",
      "mealdeck_ops_supplier_invoices",
      "mealdeck_checkout_groups",
      "mealdeck_fulfilment_outbox",
      "kds_tickets",
    ])
      assert.equal(await count(table), 0, `${table} must be empty after installation`);
    assert.equal(
      (await db.query("select to_regnamespace('dishbee_private') as schema")).rows[0].schema,
      null,
    );
    assert.equal(
      (
        await db.query(
          "select to_regprocedure('public.mealdeck_ops_kds_board(uuid,uuid)') is not null as installed",
        )
      ).rows[0].installed,
      true,
    );
  });

  await test("every public table has RLS and no anonymous or authenticated table/sequence grants despite legacy hosted defaults", async () => {
    const unsafe = await db.query(`
      select c.relname,c.relkind,c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p','v','m','S') and (
        (c.relkind in ('r','p') and not c.relrowsecurity)
        or case when c.relkind<>'S' then (
          has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
        else (
          has_sequence_privilege('anon',c.oid,'USAGE,SELECT,UPDATE')
          or has_sequence_privilege('authenticated',c.oid,'USAGE,SELECT,UPDATE')) end
      ) order by c.relname
    `);
    assert.deepEqual(unsafe.rows, []);
    const view = (
      await db.query(
        "select reloptions from pg_class where oid='public.hive_refund_allocations'::regclass",
      )
    ).rows[0];
    assert.ok(view.reloptions.includes("security_invoker=true"));
    const publicRpc = await db.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'mealdeck_ops_%'
      and has_function_privilege('anon',p.oid,'EXECUTE')
    `);
    assert.deepEqual(publicRpc.rows, []);
    const privateRpc = await db.query(`
      select n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('mealdeck_private','mealdeck_ops_private') and (
        has_function_privilege('anon',p.oid,'EXECUTE') or
        has_function_privilege('authenticated',p.oid,'EXECUTE') or
        has_function_privilege('service_role',p.oid,'EXECUTE'))
    `);
    assert.deepEqual(privateRpc.rows, []);
  });

  for (const [name, person] of Object.entries(people)) {
    await db.query(
      `
      insert into auth.users(id,email,email_confirmed_at,is_anonymous)
      values($1,$2,case when $3 then now() else null end,$4)
    `,
      [person, `${name}@standalone-fixture.invalid`, name !== "unconfirmed", name === "anonymous"],
    );
  }

  // The remaining checks call the documented DBA bootstrap and actual public
  // operations RPCs; their data will stay confined to this disposable database.

  await test("anonymous, authenticated and service API roles cannot bootstrap or promote themselves", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await rejects(() =>
        asActor(
          db,
          people.owner,
          () =>
            db.query("select mealdeck_private.bootstrap_business($1,'Fixture shared kitchen')", [
              people.owner,
            ]),
          role,
        ),
      );
    }
    await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [
      JSON.stringify({ role: "owner", tenant_id: id(1), permissions: ["staff.manage"] }),
      people.customer,
    ]);
    assert.deepEqual(await rows(people.customer, "mealdeck_ops_my_access"), []);
    assert.equal(await count("mealdeck_ops_staff_access"), 0);
    assert.equal(await count("tenants"), 0);
  });

  await test("DBA bootstrap rejects missing, unconfirmed, anonymous, deleted and banned Auth accounts without partial business data", async () => {
    for (const person of [id(599), people.unconfirmed, people.anonymous]) {
      await rejects(
        () =>
          db.query("select mealdeck_private.bootstrap_business($1,'Fixture shared kitchen')", [
            person,
          ]),
        /owner|auth|confirmed|user|eligible/i,
      );
      assert.equal(await count("tenants"), 0);
      assert.equal(await count("mealdeck_ops_staff_access"), 0);
    }
    await db.query("update auth.users set deleted_at=now() where id=$1", [people.customer]);
    await rejects(
      () =>
        db.query("select mealdeck_private.bootstrap_business($1,'Fixture shared kitchen')", [
          people.customer,
        ]),
      /owner|auth|confirmed|user|eligible/i,
    );
    await db.query(
      "update auth.users set deleted_at=null,banned_until=now()+interval '1 day' where id=$1",
      [people.customer],
    );
    await rejects(
      () =>
        db.query("select mealdeck_private.bootstrap_business($1,'Fixture shared kitchen')", [
          people.customer,
        ]),
      /owner|auth|confirmed|user|eligible/i,
    );
    await db.query("update auth.users set banned_until=null where id=$1", [people.customer]);
    assert.equal(await count("tenants"), 0);
    assert.equal(await count("tenant_locations"), 0);
    assert.equal(await count("tenant_brands"), 0);
    assert.equal(await count("mealdeck_ops_audit_log"), 0);
  });

  await test("one confirmed owner activates one shared kitchen and five brand identities with ordering disabled and no invented menu or money", async () => {
    const result = (
      await db.query(
        "select mealdeck_private.bootstrap_business($1,'Fixture shared kitchen') as value",
        [people.owner],
      )
    ).rows[0].value;
    Object.assign(state, {
      tenant: result.tenant_id,
      location: result.location_id,
      station: result.station_id,
    });
    assert.equal(result.owner_user_id, people.owner);
    assert.equal(result.brand_count, 5);
    assert.equal(result.ordering_enabled, false);
    assert.equal(await count("tenants"), 1);
    assert.equal(await count("tenant_locations"), 1);
    assert.equal(await count("kitchen_stations"), 1);
    assert.equal(await count("menu_categories"), 5);
    assert.equal(await count("mealdeck_ops_staff_access"), 1);
    const brands = (await db.query("select name from public.tenant_brands")).rows;
    assert.deepEqual(
      new Set(brands.map(({ name }) => name.toLowerCase().replace(/[^a-z]/g, ""))),
      new Set(["skorch", "loadd", "moktl", "souvano", "tavochicken"]),
    );
    assert.deepEqual((await db.query("select enabled from public.ordering_channels")).rows, [
      { enabled: false },
    ]);
    for (const table of [
      "menu_items",
      "orders",
      "order_items",
      "mealdeck_ops_recipes",
      "mealdeck_ops_ingredient_costs",
      "mealdeck_ops_purchase_orders",
      "mealdeck_ops_supplier_invoices",
    ]) {
      assert.equal(await count(table), 0, `${table} must not contain bootstrap placeholders`);
    }
    const access = await rows(people.owner, "mealdeck_ops_my_access");
    assert.equal(access.length, 1);
    assert.equal(access[0].role, "owner");
    assert.equal(access[0].location_id, null);
    assert.equal(access[0].tenant_id, state.tenant);
  });

  await test("duplicate business activation is rejected and leaves the first owner, kitchen and audit trail intact", async () => {
    const before = (
      await db.query(`select jsonb_build_object(
      'tenants',(select jsonb_agg(t) from public.tenants t),
      'locations',(select jsonb_agg(l) from public.tenant_locations l),
      'staff',(select jsonb_agg(a) from public.mealdeck_ops_staff_access a),
      'audit',(select jsonb_agg(a order by id) from public.mealdeck_ops_audit_log a)
    ) as snapshot`)
    ).rows[0].snapshot;
    await rejects(
      () =>
        db.query("select mealdeck_private.bootstrap_business($1,'Second kitchen')", [
          people.customer,
        ]),
      /already|bootstrap|activated/i,
    );
    const after = (
      await db.query(`select jsonb_build_object(
      'tenants',(select jsonb_agg(t) from public.tenants t),
      'locations',(select jsonb_agg(l) from public.tenant_locations l),
      'staff',(select jsonb_agg(a) from public.mealdeck_ops_staff_access a),
      'audit',(select jsonb_agg(a order by id) from public.mealdeck_ops_audit_log a)
    ) as snapshot`)
    ).rows[0].snapshot;
    assert.deepEqual(after, before);
  });

  await test("owner assigns actual staff while scoped staff and customer accounts cannot grant or enumerate privileged access", async () => {
    await assign(people.kitchen, "kitchen");
    await assign(people.finance, "finance", null);
    await assign(people.localMenu, "menu");
    assert.equal((await rows(people.owner, "mealdeck_ops_staff_list", [state.tenant])).length, 4);
    assert.equal(
      (await rows(people.kitchen, "mealdeck_ops_my_access"))[0].location_id,
      state.location,
    );
    await rejects(() => rows(people.kitchen, "mealdeck_ops_staff_list", [state.tenant]));
    await rejects(() =>
      value(people.kitchen, "mealdeck_ops_assign_staff", [
        state.tenant,
        people.customer,
        null,
        "owner",
        [],
        [],
        true,
      ]),
    );
    await rejects(() =>
      value(people.customer, "mealdeck_ops_assign_staff", [
        state.tenant,
        people.customer,
        null,
        "owner",
        [],
        [],
        true,
      ]),
    );
    await rejects(
      () =>
        value(people.owner, "mealdeck_ops_assign_staff", [
          state.tenant,
          id(599),
          null,
          "viewer",
          [],
          [],
          true,
        ]),
      /user_not_provisioned/,
    );
    await rejects(() =>
      asActor(
        db,
        null,
        () =>
          db.query("select public.mealdeck_ops_menu_list($1,$2)", [state.tenant, state.location]),
        "anon",
      ),
    );
    await rejects(() => rows(null, "mealdeck_ops_menu_list", [state.tenant, state.location]));
    await rejects(() =>
      asActor(db, people.owner, () => db.query("select * from public.mealdeck_ops_staff_access")),
    );
    await rejects(() =>
      asActor(db, people.owner, () => db.query("select * from public.hive_refund_allocations")),
    );
  });

  await test("real menu CRUD creates drafts, requires routing before activation, and persists price and visibility changes", async () => {
    const taxonomy = await rows(people.owner, "mealdeck_ops_menu_taxonomy", [
      state.tenant,
      state.location,
    ]);
    assert.equal(taxonomy.length, 5);
    state.category = taxonomy[0].category_id;
    state.brand = taxonomy[0].brand_id;
    state.item = await value(people.owner, "mealdeck_ops_create_menu_item", [
      state.tenant,
      state.brand,
      state.category,
      "Fixture dish",
      "Synthetic verification dish",
      825,
    ]);
    let menu = await rows(people.owner, "mealdeck_ops_menu_list", [state.tenant, state.location]);
    assert.equal(menu[0].active, false);
    assert.equal(menu[0].price_pence, 825);
    await rejects(
      () =>
        value(people.owner, "mealdeck_ops_update_menu_item", [
          state.tenant,
          state.item,
          "Fixture dish revised",
          "Updated fixture",
          875,
          true,
        ]),
      /station_route_required/,
    );
    assert.equal(
      (await rows(people.owner, "mealdeck_ops_menu_list", [state.tenant, state.location]))[0]
        .item_name,
      "Fixture dish",
    );
    await rejects(() =>
      value(people.kitchen, "mealdeck_ops_set_station_route", [
        state.tenant,
        state.location,
        state.item,
        state.station,
        true,
      ]),
    );
    assert.equal(
      await value(people.owner, "mealdeck_ops_set_station_route", [
        state.tenant,
        state.location,
        state.item,
        state.station,
        true,
      ]),
      true,
    );
    assert.equal(
      await value(people.owner, "mealdeck_ops_update_menu_item", [
        state.tenant,
        state.item,
        "Fixture dish revised",
        "Updated fixture",
        875,
        true,
      ]),
      true,
    );
    assert.equal(
      await value(people.owner, "mealdeck_ops_set_menu_visibility", [
        state.tenant,
        state.location,
        state.item,
        false,
      ]),
      true,
    );
    menu = await rows(people.kitchen, "mealdeck_ops_menu_list", [state.tenant, state.location]);
    assert.equal(menu[0].item_name, "Fixture dish revised");
    assert.equal(menu[0].price_pence, 875);
    assert.equal(menu[0].active, true);
    assert.equal(menu[0].visible, false);
    await rejects(
      () =>
        value(people.owner, "mealdeck_ops_set_station_route", [
          state.tenant,
          state.location,
          state.item,
          state.station,
          false,
        ]),
      /station_route_required_before_activation/,
    );
    const inactiveStation = id(750);
    await db.query(
      "insert into public.kitchen_stations(id,tenant_id,location_id,name,code,active) values($1,$2,$3,'Inactive fixture station','INACTIVE',false)",
      [inactiveStation, state.tenant, state.location],
    );
    await db.query(
      "insert into public.menu_item_station_routes(tenant_id,location_id,item_id,station_id) values($1,$2,$3,$4)",
      [state.tenant, state.location, state.item, inactiveStation],
    );
    const routingAudit = await count("mealdeck_ops_audit_log");
    try {
      await rejects(
        () =>
          value(people.owner, "mealdeck_ops_set_station_route", [
            state.tenant,
            state.location,
            state.item,
            state.station,
            false,
          ]),
        /station_route_required_before_activation/,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::integer as count from public.menu_item_station_routes where item_id=$1",
            [state.item],
          )
        ).rows[0].count,
        2,
      );
      assert.equal(await count("mealdeck_ops_audit_log"), routingAudit);
    } finally {
      await db.query("delete from public.menu_item_station_routes where station_id=$1", [
        inactiveStation,
      ]);
      await db.query("delete from public.kitchen_stations where id=$1", [inactiveStation]);
    }
    await rejects(
      () =>
        value(people.localMenu, "mealdeck_ops_create_menu_item", [
          state.tenant,
          state.brand,
          state.category,
          "Unauthorized global dish",
          "",
          100,
        ]),
      /global_menu_permission_required/,
    );
    await rejects(
      () =>
        value(people.kitchen, "mealdeck_ops_update_menu_item", [
          state.tenant,
          state.item,
          "Unauthorized change",
          "",
          0,
          false,
        ]),
      /global_menu_permission_required/,
    );
    await value(people.owner, "mealdeck_ops_update_menu_item", [
      state.tenant,
      state.item,
      "Fixture dish revised",
      "Updated fixture",
      875,
      false,
    ]);
    assert.equal(
      (await rows(people.owner, "mealdeck_ops_menu_list", [state.tenant, state.location]))[0]
        .active,
      false,
    );
  });

  await test("normal UUID recipe ingredients save, version and read correctly; an invalid edit rolls back history and lines atomically", async () => {
    state.ingredient = await value(people.owner, "mealdeck_ops_upsert_ingredient", [
      state.tenant,
      null,
      "Fixture ingredient",
      "g",
      ["milk"],
      100,
    ]);
    const ingredients = [{ ingredientId: state.ingredient, quantity: 50, wastePercent: 5 }];
    state.recipe = await value(people.owner, "mealdeck_ops_save_recipe", [
      state.tenant,
      state.item,
      1,
      5,
      "Fixture instructions version 1",
      JSON.stringify(ingredients),
    ]);
    await value(people.owner, "mealdeck_ops_save_recipe", [
      state.tenant,
      state.item,
      2,
      8,
      "Fixture instructions version 2",
      JSON.stringify([{ ...ingredients[0], quantity: 75 }]),
    ]);
    const recipe = (
      await rows(people.kitchen, "mealdeck_ops_recipe_list", [state.tenant, state.location])
    )[0];
    assert.equal(recipe.recipe_id, state.recipe);
    assert.equal(recipe.version, 2);
    assert.equal(recipe.instructions, "Fixture instructions version 2");
    assert.equal(recipe.ingredients[0].ingredientId, state.ingredient);
    assert.equal(Number(recipe.ingredients[0].quantity), 75);
    const history = (
      await db.query(
        "select version,snapshot from public.mealdeck_ops_recipe_history where recipe_id=$1",
        [state.recipe],
      )
    ).rows;
    assert.equal(history.length, 1);
    assert.equal(history[0].version, 1);
    assert.equal(history[0].snapshot.instructions, "Fixture instructions version 1");
    await rejects(
      () =>
        value(people.owner, "mealdeck_ops_save_recipe", [
          state.tenant,
          state.item,
          3,
          9,
          "Must roll back",
          JSON.stringify([{ ingredientId: id(999), quantity: 1, wastePercent: 0 }]),
        ]),
      /recipe_ingredient_invalid/,
    );
    assert.deepEqual(
      (await rows(people.kitchen, "mealdeck_ops_recipe_list", [state.tenant, state.location]))[0],
      recipe,
    );
    assert.equal(await count("mealdeck_ops_recipe_history"), 1);
    await rejects(
      () =>
        value(people.kitchen, "mealdeck_ops_save_recipe", [
          state.tenant,
          state.item,
          1,
          1,
          "Forbidden",
          "[]",
        ]),
      /global_recipes_permission_required/,
    );
    await rejects(
      () =>
        value(people.owner, "mealdeck_ops_upsert_ingredient", [
          state.tenant,
          state.ingredient,
          "Fixture ingredient",
          "ml",
          [],
          100,
        ]),
      /ingredient_unit_in_use/,
    );
  });

  await test("stock balances and finance costs use real scoped RPCs without exposing costs to kitchen staff", async () => {
    await value(people.owner, "mealdeck_ops_record_stock", [
      state.tenant,
      state.location,
      state.ingredient,
      1000,
      "opening",
      "Disposable fixture",
    ]);
    await value(people.owner, "mealdeck_ops_record_stock", [
      state.tenant,
      state.location,
      state.ingredient,
      -50,
      "waste",
      "Disposable fixture",
    ]);
    assert.equal(
      Number(
        (await rows(people.kitchen, "mealdeck_ops_stock_levels", [state.tenant, state.location]))[0]
          .quantity,
      ),
      950,
    );
    await rejects(() =>
      value(people.kitchen, "mealdeck_ops_record_stock", [
        state.tenant,
        state.location,
        state.ingredient,
        10,
        "opening",
        "Forbidden",
      ]),
    );
    await asActor(db, people.owner, () =>
      db.query(
        "select public.mealdeck_ops_record_ingredient_cost($1,$2,$3,current_date,'Fixture supplier',2.5)",
        [state.tenant, state.location, state.ingredient],
      ),
    );
    assert.equal(
      Number(
        (await rows(people.finance, "mealdeck_ops_cost_list", [state.tenant, state.location]))[0]
          .cost_per_unit_pence,
      ),
      2.5,
    );
    await rejects(() =>
      rows(people.kitchen, "mealdeck_ops_cost_list", [state.tenant, state.location]),
    );
    const summary = (
      await asActor(db, people.finance, () =>
        db.query(
          "select public.mealdeck_ops_finance_summary($1,$2,current_date,current_date) as value",
          [state.tenant, state.location],
        ),
      )
    ).rows[0].value;
    assert.equal(summary.recordedPaidOrders, 0);
    assert.equal(summary.settledHiveRefundsPence, 0);
    assert.equal(summary.bankSettlementVerified, false);
    assert.equal(summary.vatCalculated, false);
    const analytics = (
      await asActor(db, people.owner, () =>
        db.query("select public.mealdeck_ops_analytics($1,$2,current_date,current_date) as value", [
          state.tenant,
          state.location,
        ]),
      )
    ).rows[0].value;
    assert.equal(analytics.paidOrders, 0);
    assert.deepEqual(analytics.daily, []);
    assert.deepEqual(analytics.channels, []);
  });

  await test("purchase approval needs a second authorized actor and replayed goods receipts do not duplicate stock", async () => {
    state.supplier = await value(people.owner, "mealdeck_ops_save_supplier", [
      state.tenant,
      null,
      "Fixture supplier",
      "supplier@standalone-fixture.invalid",
      2,
      "active",
    ]);
    state.purchase = await value(people.owner, "mealdeck_ops_create_purchase", [
      state.tenant,
      state.location,
      state.supplier,
      "Synthetic purchase",
    ]);
    state.purchaseLine = await value(people.owner, "mealdeck_ops_save_purchase_line", [
      state.tenant,
      state.location,
      state.purchase,
      state.ingredient,
      2,
      500,
      1250,
    ]);
    await value(people.owner, "mealdeck_ops_advance_purchase", [
      state.tenant,
      state.location,
      state.purchase,
      "submit",
    ]);
    await rejects(
      () =>
        value(people.owner, "mealdeck_ops_advance_purchase", [
          state.tenant,
          state.location,
          state.purchase,
          "approve",
        ]),
      /second_approver_required/,
    );
    await value(people.finance, "mealdeck_ops_advance_purchase", [
      state.tenant,
      state.location,
      state.purchase,
      "approve",
    ]);
    const receiptArgs = [
      state.tenant,
      state.location,
      state.purchaseLine,
      1000,
      "FIXTURE-BATCH",
      "none",
      null,
      "FIXTURE-DELIVERY",
    ];
    const receipt = await value(people.owner, "mealdeck_ops_receive_purchase", receiptArgs);
    assert.equal(await value(people.owner, "mealdeck_ops_receive_purchase", receiptArgs), receipt);
    assert.equal(await count("mealdeck_ops_purchase_receipts"), 1);
    assert.equal(await count("mealdeck_ops_stock_batches"), 1);
    assert.equal(
      Number(
        (await rows(people.kitchen, "mealdeck_ops_stock_levels", [state.tenant, state.location]))[0]
          .quantity,
      ),
      1950,
    );
    await rejects(
      () =>
        value(
          people.owner,
          "mealdeck_ops_receive_purchase",
          receiptArgs.map((arg, index) => (index === 3 ? 999 : arg)),
        ),
      /idempotency_mismatch/,
    );
    assert.equal(
      Number(
        (await rows(people.kitchen, "mealdeck_ops_stock_levels", [state.tenant, state.location]))[0]
          .quantity,
      ),
      1950,
    );
  });

  await test("the actual invoice schema supports scoped draft and line administration without claiming tax review or payment", async () => {
    state.invoice = (
      await asActor(db, people.finance, () =>
        db.query(
          "select public.mealdeck_ops_create_invoice($1,$2,$3,'FIXTURE-INV-1',current_date,current_date+7,2500,0,'Synthetic invoice') as value",
          [state.tenant, state.location, state.purchase],
        ),
      )
    ).rows[0].value;
    await value(people.finance, "mealdeck_ops_save_invoice_line", [
      state.tenant,
      state.location,
      state.invoice,
      state.purchaseLine,
      1000,
      2500,
      0,
      "unreviewed",
    ]);
    const invoices = (
      await asActor(db, people.finance, () =>
        db.query(
          "select * from public.mealdeck_ops_invoice_list($1,$2,current_date,current_date)",
          [state.tenant, state.location],
        ),
      )
    ).rows;
    assert.equal(invoices.length, 1);
    assert.equal(invoices[0].status, "draft");
    assert.equal(invoices[0].tax_document_reviewed, false);
    assert.equal(invoices[0].approved_at, null);
    const lines = await rows(people.finance, "mealdeck_ops_invoice_line_list", [
      state.tenant,
      state.location,
      state.invoice,
    ]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].tax_category, "unreviewed");
    assert.equal(Number(lines[0].net_pence), 2500);
    await rejects(() =>
      rows(people.kitchen, "mealdeck_ops_invoice_line_list", [
        state.tenant,
        state.location,
        state.invoice,
      ]),
    );
    await rejects(() =>
      value(people.kitchen, "mealdeck_ops_save_invoice_line", [
        state.tenant,
        state.location,
        state.invoice,
        state.purchaseLine,
        1,
        1,
        0,
        "zero",
      ]),
    );
  });

  await test("staff revocation takes effect on the next request even with the same authenticated user claim", async () => {
    assert.equal(
      (await rows(people.kitchen, "mealdeck_ops_recipe_list", [state.tenant, state.location]))
        .length,
      1,
    );
    await assign(people.kitchen, "kitchen", state.location, false);
    assert.deepEqual(await rows(people.kitchen, "mealdeck_ops_my_access"), []);
    await rejects(() =>
      rows(people.kitchen, "mealdeck_ops_recipe_list", [state.tenant, state.location]),
    );
    await rejects(() =>
      value(people.kitchen, "mealdeck_ops_kds_board", [state.tenant, state.location]),
    );
    await assign(people.kitchen, "kitchen");
    assert.equal(
      (await rows(people.kitchen, "mealdeck_ops_recipe_list", [state.tenant, state.location]))
        .length,
      1,
    );
  });

  // These unrelated records exercise isolation; they are not a second business
  // activation path and are created by the disposable test database's DBA only.
  await db.query(
    "insert into public.tenants(id,name,slug,legal_name) values($1,'Other fixture tenant','other-fixture','Other fixture company')",
    [foreign.tenant],
  );
  await db.query(
    "insert into public.tenant_locations(id,tenant_id,name,slug) values($1,$2,'Other fixture location','other-location')",
    [foreign.location, foreign.tenant],
  );
  await db.query(
    "insert into public.tenant_brands(id,tenant_id,name,slug) values($1,$2,'Other fixture brand','other-brand')",
    [foreign.brand, foreign.tenant],
  );
  await db.query(
    "insert into public.menu_categories(id,tenant_id,brand_id,name,slug) values($1,$2,$3,'Other fixture category','other-category')",
    [foreign.category, foreign.tenant, foreign.brand],
  );
  await db.query(
    "insert into public.menu_items(id,tenant_id,brand_id,category_id,name,price_pence) values($1,$2,$3,$4,'Other fixture dish',1000)",
    [foreign.item, foreign.tenant, foreign.brand, foreign.category],
  );
  await db.query(
    "insert into public.kitchen_stations(id,tenant_id,location_id,name,code) values($1,$2,$3,'Other fixture station','OTHER')",
    [foreign.station, foreign.tenant, foreign.location],
  );
  await db.query(
    "insert into public.mealdeck_ops_staff_access(tenant_id,user_id,role) values($1,$2,'owner')",
    [foreign.tenant, people.foreign],
  );
  await db.query(
    "insert into public.mealdeck_ops_ingredients(id,tenant_id,name,base_unit) values($1,$2,'Other fixture ingredient','g')",
    [foreign.ingredient, foreign.tenant],
  );
  await db.query(
    "insert into public.orders(id,tenant_id,location_id,fulfilment,subtotal_pence,total_pence) values($1,$2,$3,'delivery',1000,1000)",
    [foreign.order, foreign.tenant, foreign.location],
  );
  await db.query(
    "insert into public.order_items(id,tenant_id,order_id,brand_id,menu_item_id,item_name,quantity,unit_price_pence) values($1,$2,$3,$4,$5,'Other fixture dish',1,1000)",
    [foreign.orderItem, foreign.tenant, foreign.order, foreign.brand, foreign.item],
  );

  await test("the shared-kitchen station picker exposes active stations only to authorized staff in the requested location", async () => {
    const expected = [
      { station_id: state.station, station_name: "Shared kitchen", station_code: "SHARED" },
    ];
    for (const actor of [people.owner, people.localMenu, people.kitchen]) {
      assert.deepEqual(
        await rows(actor, "mealdeck_ops_kitchen_stations", [state.tenant, state.location]),
        expected,
      );
    }
    assert.deepEqual(
      await rows(people.foreign, "mealdeck_ops_kitchen_stations", [
        foreign.tenant,
        foreign.location,
      ]),
      [
        {
          station_id: foreign.station,
          station_name: "Other fixture station",
          station_code: "OTHER",
        },
      ],
    );
    await rejects(() =>
      asActor(
        db,
        null,
        () =>
          db.query("select * from public.mealdeck_ops_kitchen_stations($1,$2)", [
            state.tenant,
            state.location,
          ]),
        "anon",
      ),
    );
    for (const actor of [people.customer, people.foreign]) {
      await rejects(() =>
        rows(actor, "mealdeck_ops_kitchen_stations", [state.tenant, state.location]),
      );
    }
    for (const location of [foreign.location, id(998), null]) {
      await rejects(() =>
        rows(people.owner, "mealdeck_ops_kitchen_stations", [state.tenant, location]),
      );
      await rejects(() =>
        rows(people.localMenu, "mealdeck_ops_kitchen_stations", [state.tenant, location]),
      );
    }
    await db.query("update public.kitchen_stations set active=false where id=$1", [state.station]);
    try {
      assert.deepEqual(
        await rows(people.owner, "mealdeck_ops_kitchen_stations", [state.tenant, state.location]),
        [],
      );
    } finally {
      await db.query("update public.kitchen_stations set active=true where id=$1", [state.station]);
    }
    await db.query("update public.tenant_locations set active=false where id=$1", [state.location]);
    const inactiveLocationAudit = await count("mealdeck_ops_audit_log");
    try {
      await rejects(() =>
        rows(people.owner, "mealdeck_ops_kitchen_stations", [state.tenant, state.location]),
      );
      for (const enabled of [true, false]) {
        await rejects(
          () =>
            value(people.owner, "mealdeck_ops_set_station_route", [
              state.tenant,
              state.location,
              state.item,
              state.station,
              enabled,
            ]),
          /location_or_item_mismatch/,
        );
      }
      assert.equal(
        (
          await db.query(
            "select count(*)::integer as count from public.menu_item_station_routes where item_id=$1 and station_id=$2",
            [state.item, state.station],
          )
        ).rows[0].count,
        1,
      );
      assert.equal(await count("mealdeck_ops_audit_log"), inactiveLocationAudit);
    } finally {
      await db.query("update public.tenant_locations set active=true where id=$1", [
        state.location,
      ]);
    }
    assert.deepEqual(
      await rows(people.localMenu, "mealdeck_ops_kitchen_stations", [state.tenant, state.location]),
      expected,
    );
  });

  await test("tenant and location isolation holds for real menu, recipe, staff, stock, invoice and kitchen RPCs", async () => {
    const otherMenu = await rows(people.foreign, "mealdeck_ops_menu_list", [
      foreign.tenant,
      foreign.location,
    ]);
    assert.deepEqual(
      otherMenu.map((item) => item.item_id),
      [foreign.item],
    );
    assert.deepEqual(
      (await rows(people.owner, "mealdeck_ops_menu_list", [state.tenant, state.location])).map(
        (item) => item.item_id,
      ),
      [state.item],
    );
    for (const [name, args] of [
      ["mealdeck_ops_menu_list", [state.tenant, state.location]],
      ["mealdeck_ops_recipe_list", [state.tenant, state.location]],
      ["mealdeck_ops_staff_list", [state.tenant]],
      ["mealdeck_ops_stock_levels", [state.tenant, state.location]],
      ["mealdeck_ops_invoice_line_list", [state.tenant, state.location, state.invoice]],
      ["mealdeck_ops_kds_board", [state.tenant, state.location]],
    ])
      await rejects(() => rows(people.foreign, name, args));
    await rejects(() =>
      rows(people.kitchen, "mealdeck_ops_menu_list", [state.tenant, foreign.location]),
    );
    await rejects(() =>
      rows(people.owner, "mealdeck_ops_menu_list", [foreign.tenant, foreign.location]),
    );
    await rejects(
      () =>
        value(people.owner, "mealdeck_ops_assign_staff", [
          state.tenant,
          people.customer,
          foreign.location,
          "kitchen",
          [],
          [],
          true,
        ]),
      /location_mismatch/,
    );
    await rejects(
      () =>
        value(people.owner, "mealdeck_ops_create_menu_item", [
          state.tenant,
          foreign.brand,
          foreign.category,
          "Cross-tenant item",
          "",
          1,
        ]),
      /invalid_menu_item/,
    );
    await rejects(
      () =>
        value(people.owner, "mealdeck_ops_save_recipe", [
          state.tenant,
          state.item,
          1,
          1,
          "Cross-tenant recipe",
          JSON.stringify([{ ingredientId: foreign.ingredient, quantity: 1, wastePercent: 0 }]),
        ]),
      /recipe_ingredient_invalid/,
    );
    assert.equal(
      (await rows(people.owner, "mealdeck_ops_recipe_list", [state.tenant, state.location]))[0]
        .version,
      2,
    );
  });

  await test("composite foreign keys reject tenant/location mixing even in privileged writes across catalogue, staff, stock, checkout and fulfilment", async () => {
    const cases = [
      [
        "staff location",
        "insert into public.mealdeck_ops_staff_access(tenant_id,location_id,user_id,role) values($1,$2,$3,'kitchen')",
        [state.tenant, foreign.location, people.customer],
      ],
      [
        "brand/category",
        "insert into public.menu_items(tenant_id,brand_id,category_id,name,price_pence) values($1,$2,$3,'Invalid cross-tenant item',1)",
        [state.tenant, foreign.brand, state.category],
      ],
      [
        "station route",
        "insert into public.menu_item_station_routes(tenant_id,location_id,item_id,station_id) values($1,$2,$3,$4)",
        [state.tenant, state.location, state.item, foreign.station],
      ],
      [
        "recipe item",
        "insert into public.mealdeck_ops_recipes(tenant_id,menu_item_id) values($1,$2)",
        [foreign.tenant, state.item],
      ],
      [
        "stock location",
        "insert into public.mealdeck_ops_stock_movements(tenant_id,location_id,ingredient_id,delta_qty,reason) values($1,$2,$3,1,'opening')",
        [state.tenant, foreign.location, state.ingredient],
      ],
      [
        "order location",
        "insert into public.orders(tenant_id,location_id,fulfilment) values($1,$2,'delivery')",
        [state.tenant, foreign.location],
      ],
      [
        "checkout order",
        "insert into public.mealdeck_checkout_groups(tenant_id,location_id,order_id,owner_id,currency,total_pence,owner_pence) values($1,$2,$3,$4,'GBP',1,1)",
        [state.tenant, state.location, foreign.order, people.owner],
      ],
      [
        "outbox order",
        "insert into public.mealdeck_fulfilment_outbox(tenant_id,location_id,order_id,idempotency_key,provider,quote_id,currency,cost_pence,quote_expires_at) values($1,$2,$3,'fixture-cross-tenant','own_fleet','fixture-quote','GBP',0,now()+interval '1 hour')",
        [state.tenant, state.location, foreign.order],
      ],
      [
        "handoff order",
        "insert into public.mealdeck_handoff_proofs(tenant_id,location_id,order_id,mode,proof_hmac,expires_at) values($1,$2,$3,'pickup',repeat('a',64),now()+interval '1 hour')",
        [state.tenant, state.location, foreign.order],
      ],
      [
        "refund order",
        "insert into public.mealdeck_refund_allocations(tenant_id,location_id,order_id,amount_pence,status) values($1,$2,$3,1,'requested')",
        [state.tenant, state.location, foreign.order],
      ],
    ];
    for (const [label, sql, args] of cases) {
      await assert.rejects(
        () => db.query(sql, args),
        (error) => {
          assert.equal(
            error.code,
            "23503",
            `${label}: must fail for a scope foreign key, not a missing column or unrelated constraint`,
          );
          return true;
        },
      );
    }
    assert.equal(await count("mealdeck_checkout_groups"), 0);
    assert.equal(await count("mealdeck_fulfilment_outbox"), 0);
    assert.equal(await count("mealdeck_handoff_proofs"), 0);
  });

  // A deliberately fabricated paid flag verifies the negative release gate.
  // It is not payment evidence and this suite never installs an authority.
  Object.assign(state, { order: id(701), orderItem: id(702), ticket: id(703), room: id(704) });
  await db.query(
    "insert into public.orders(id,tenant_id,location_id,fulfilment,status,payment_status,paid_at,subtotal_pence,total_pence,notes) values($1,$2,$3,'delivery','accepted','paid',now(),875,875,'UNRELEASED KITCHEN INSTRUCTION')",
    [state.order, state.tenant, state.location],
  );
  await db.query(
    "insert into public.order_items(id,tenant_id,order_id,brand_id,menu_item_id,item_name,quantity,unit_price_pence) values($1,$2,$3,$4,$5,'UNRELEASED DISH',1,875)",
    [state.orderItem, state.tenant, state.order, state.brand, state.item],
  );
  await db.query(
    "insert into public.kds_tickets(id,tenant_id,location_id,order_id,station_id) values($1,$2,$3,$4,$5)",
    [state.ticket, state.tenant, state.location, state.order, state.station],
  );
  await db.query(
    "insert into public.kds_ticket_items(tenant_id,location_id,order_id,ticket_id,order_item_id,station_id,quantity) values($1,$2,$3,$4,$5,$6,1)",
    [state.tenant, state.location, state.order, state.ticket, state.orderItem, state.station],
  );

  await test("ticket and item constraints cannot mix another kitchen or another order into the shared master card", async () => {
    await assert.rejects(
      () =>
        db.query(
          "insert into public.kds_tickets(tenant_id,location_id,order_id,station_id) values($1,$2,$3,$4)",
          [state.tenant, state.location, state.order, foreign.station],
        ),
      (error) => error.code === "23503",
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into public.kds_ticket_items(tenant_id,location_id,order_id,ticket_id,order_item_id,station_id,quantity) values($1,$2,$3,$4,$5,$6,1)",
          [
            state.tenant,
            state.location,
            state.order,
            state.ticket,
            foreign.orderItem,
            state.station,
          ],
        ),
      (error) => error.code === "23503",
    );
    assert.equal(await count("kds_tickets"), 1);
    assert.equal(await count("kds_ticket_items"), 1);
  });

  await test("an active order prevents menu routing changes without altering routes or creating success audits", async () => {
    const before = (
      await db.query("select * from public.menu_item_station_routes where item_id=$1", [state.item])
    ).rows;
    const audit = await count("mealdeck_ops_audit_log");
    for (const actor of [people.owner, people.localMenu]) {
      for (const enabled of [false, true]) {
        await rejects(
          () =>
            value(actor, "mealdeck_ops_set_station_route", [
              state.tenant,
              state.location,
              state.item,
              state.station,
              enabled,
            ]),
          /route_has_active_orders/,
        );
      }
    }
    assert.deepEqual(
      (
        await db.query("select * from public.menu_item_station_routes where item_id=$1", [
          state.item,
        ])
      ).rows,
      before,
    );
    assert.equal(await count("mealdeck_ops_audit_log"), audit);
  });

  await test("a paid flag and complete ticket routing never release food without MealDeck's own verified payment authority", async () => {
    assert.equal(
      (
        await db.query(
          "select to_regprocedure('mealdeck_private.kds_release_authority(uuid)') as authority",
        )
      ).rows[0].authority,
      null,
    );
    const board = await value(people.kitchen, "mealdeck_ops_kds_board", [
      state.tenant,
      state.location,
    ]);
    assert.equal(board.readiness, "setup_required");
    assert.equal(board.held_order_count, 1);
    assert.deepEqual(board.orders, []);
    assert.ok(!JSON.stringify(board).includes("UNRELEASED"));
    const before = {
      audit: await count("mealdeck_ops_audit_log"),
      passes: await count("mealdeck_pass_orders"),
      outbox: await count("mealdeck_fulfilment_outbox"),
    };
    for (const actor of [people.owner, people.kitchen]) {
      for (const status of ["preparing", "ready"]) {
        await rejects(
          () =>
            value(actor, "mealdeck_ops_kds_transition_order", [
              state.tenant,
              state.location,
              state.order,
              "0".repeat(32),
              status,
            ]),
          /mealdeck_kds_setup_required/,
        );
      }
      await rejects(
        () =>
          value(actor, "mealdeck_ops_kds_transition_pass", [
            state.tenant,
            state.location,
            state.order,
            "0".repeat(32),
            "packing",
          ]),
        /mealdeck_kds_setup_required/,
      );
    }
    assert.equal(
      (await db.query("select status from public.orders where id=$1", [state.order])).rows[0]
        .status,
      "accepted",
    );
    assert.deepEqual((await db.query("select status from public.kds_tickets")).rows, [
      { status: "queued" },
    ]);
    assert.deepEqual((await db.query("select status from public.kds_ticket_items")).rows, [
      { status: "queued" },
    ]);
    assert.deepEqual(
      {
        audit: await count("mealdeck_ops_audit_log"),
        passes: await count("mealdeck_pass_orders"),
        outbox: await count("mealdeck_fulfilment_outbox"),
      },
      before,
    );
    assert.equal(
      (await db.query("select to_regnamespace('dishbee_private') as schema")).rows[0].schema,
      null,
    );
  });

  await test("submitted group metadata alone cannot satisfy group financial readiness and the helper is not a client endpoint", async () => {
    await db.query(
      "insert into public.group_order_rooms(id,tenant_id,location_id,master_order_id,status,payment_mode) values($1,$2,$3,$4,'submitted','host_pays')",
      [state.room, state.tenant, state.location, state.order],
    );
    await db.query("update public.orders set group_order_room_id=$1 where id=$2", [
      state.room,
      state.order,
    ]);
    assert.equal(
      (await db.query("select public.group_order_financial_ready($1) as ready", [state.room]))
        .rows[0].ready,
      false,
    );
    assert.equal(
      (
        await db.query(
          "select to_regprocedure('mealdeck_private.group_payment_authority(uuid)') as authority",
        )
      ).rows[0].authority,
      null,
    );
    await rejects(() =>
      asActor(db, people.owner, () =>
        db.query("select public.group_order_financial_ready($1)", [state.room]),
      ),
    );
    assert.deepEqual(
      (await value(people.kitchen, "mealdeck_ops_kds_board", [state.tenant, state.location]))
        .orders,
      [],
    );
  });

  await test("reinstalling into an occupied business is refused before modifying existing data or access", async () => {
    const before = {
      audit: await count("mealdeck_ops_audit_log"),
      staff: await count("mealdeck_ops_staff_access"),
      orders: await count("orders"),
      recipes: await count("mealdeck_ops_recipes"),
    };
    await rejects(() => db.exec(buildStandaloneSql()), /requires_fresh_database/);
    await db.exec("rollback");
    assert.deepEqual(
      {
        audit: await count("mealdeck_ops_audit_log"),
        staff: await count("mealdeck_ops_staff_access"),
        orders: await count("orders"),
        recipes: await count("mealdeck_ops_recipes"),
      },
      before,
    );
    assert.equal((await rows(people.owner, "mealdeck_ops_my_access"))[0].tenant_id, state.tenant);
  });
} finally {
  await db.close();
}

console.log(`${checks} standalone PostgreSQL integration checks passed.`);
