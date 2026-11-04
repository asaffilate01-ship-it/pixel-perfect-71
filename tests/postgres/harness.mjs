import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

export const testRoot = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(testRoot, "../..");
export const id = (number) => `00000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
export const fixture = Object.freeze({
  tenant: id(1),
  foreignTenant: id(2),
  location: id(11),
  otherLocation: id(12),
  foreignLocation: id(21),
  kitchen: id(101),
  viewer: id(102),
  foreignKitchen: id(103),
  otherKitchen: id(104),
  owner: id(105),
  deniedWrite: id(106),
  deniedRead: id(107),
  disabledKitchen: id(108),
  customer: id(109),
  finance: id(110),
});

export function nativeConfig() {
  const value = process.env.MEALDECK_KDS_TEST_DATABASE_URL;
  if (!value) {
    throw new Error(
      "Native tests need MEALDECK_KDS_TEST_DATABASE_URL pointing to an EMPTY disposable localhost database named mealdeck_kds_test or mealdeck_kds_test_*.",
    );
  }
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname) ||
    !/^mealdeck_kds_test(?:_[a-z0-9_]+)?$/.test(database) ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Refusing test database: only an explicit localhost disposable mealdeck_kds_test database is allowed; URL query overrides are forbidden.",
    );
  }
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: url.port ? Number(url.port) : 5432,
    database,
    user: decodeURIComponent(url.username || "postgres"),
    password: decodeURIComponent(url.password),
    ssl: false,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    application_name: "mealdeck_kds_disposable_test",
  };
}

export async function createDatabase(native = false) {
  if (!native) {
    const instance = await PGlite.create();
    return {
      native: false,
      query: (sql, values = []) => instance.query(sql, values),
      exec: (sql) => instance.exec(sql),
      close: () => instance.close(),
    };
  }
  const config = nativeConfig();
  const client = new pg.Client(config);
  await client.connect();
  const { rows } = await client.query(`
    select count(*)::integer as count from information_schema.tables
    where table_schema not in ('pg_catalog','information_schema')
  `);
  if (rows[0].count !== 0) {
    await client.end();
    throw new Error(
      "Refusing to change a nonempty native test database. Create a fresh disposable database; this runner never drops existing schemas or data.",
    );
  }
  return {
    native: true,
    config,
    query: (sql, values = []) => client.query(sql, values),
    exec: (sql) => client.query(sql),
    close: () => client.end(),
  };
}

export async function bootstrap(db) {
  const version = await db.query("select version() as version");
  console.log(`Engine: ${version.rows[0].version}`);
  await db.exec(await readFile(resolve(testRoot, "canonical-fixture.sql"), "utf8"));
  db.canonicalCallbackSnapshot = await callbackSnapshot(db);
  await db.exec(
    await readFile(
      resolve(repositoryRoot, "supabase/migrations/20261102191000_mealdeck_ops_core.sql"),
      "utf8",
    ),
  );
  const candidates = (await readdir(resolve(repositoryRoot, "supabase/migrations")))
    .filter((file) => /_mealdeck_ops_kds.*\.sql$/.test(file))
    .sort();
  assert.equal(candidates.length, 1, "Exactly one KDS workspace migration is expected");
  await db.exec(
    await readFile(resolve(repositoryRoot, "supabase/migrations", candidates[0]), "utf8"),
  );
  await seedStaffAndCatalogue(db);
  return candidates[0];
}

export async function callbackSnapshot(db) {
  return (
    await db.query(`
    select p.proname,pg_get_functiondef(p.oid) as definition,p.proacl::text as acl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in(
      'release_order_to_kds','confirm_order_payment',
      'update_kds_ticket','update_mealdeck_pass_status'
    ) order by p.proname
  `)
  ).rows;
}

export async function asActor(db, user, action, role = "authenticated") {
  assert.ok(["anon", "authenticated", "service_role"].includes(role));
  await db.exec(`set role ${role}`);
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
    await db.query("select set_config('request.jwt.claim.role',$1,false)", [role]);
    return await action();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await db.query("select set_config('request.jwt.claim.role','',false)");
  }
}

export async function installFixtureAuthority(db) {
  await db.exec(`
    create schema if not exists dishbee_private;
    revoke all on schema dishbee_private from public,anon,authenticated,service_role;
    create schema kds_test_private;
    revoke all on schema kds_test_private from public,anon,authenticated,service_role;
    create table kds_test_private.release_evidence(
      order_id uuid primary key references public.orders(id),
      payload jsonb not null
    );
    alter table kds_test_private.release_evidence enable row level security;
    revoke all on kds_test_private.release_evidence from public,anon,authenticated,service_role;
  `);
  await restoreFixtureAuthority(db);
}

export async function restoreFixtureAuthority(db) {
  // TEST DOUBLE ONLY. This supplies server-owned immutable evidence to exercise
  // the new consumer contract. It is not a payment verification implementation.
  // Production must supply Dishbee's reviewed signed-capture/release adapter.
  await db.exec(`
    create or replace function dishbee_private.mealdeck_kds_release_authority(p_order uuid)
    returns jsonb language sql stable security definer set search_path='' as $$
      select e.payload from kds_test_private.release_evidence e where e.order_id=p_order
    $$;
    revoke all on function dishbee_private.mealdeck_kds_release_authority(uuid)
      from public,anon,authenticated,service_role;
  `);
}

async function seedStaffAndCatalogue(db) {
  await db.query(
    "insert into public.tenants(id,name) values($1,'Fixture kitchen tenant'),($2,'Other fixture tenant')",
    [fixture.tenant, fixture.foreignTenant],
  );
  for (const [location, tenant, name] of [
    [fixture.location, fixture.tenant, "Shared launch kitchen"],
    [fixture.otherLocation, fixture.tenant, "Future second kitchen"],
    [fixture.foreignLocation, fixture.foreignTenant, "Unrelated merchant"],
  ]) {
    await db.query("insert into public.tenant_locations(id,tenant_id,name) values($1,$2,$3)", [
      location,
      tenant,
      name,
    ]);
  }
  for (let number = 101; number <= 110; number++) {
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id(number),
      `fixture-${number}@example.invalid`,
    ]);
  }
  const grants = [
    [fixture.kitchen, fixture.tenant, fixture.location, "kitchen", [], true],
    [fixture.viewer, fixture.tenant, fixture.location, "viewer", [], true],
    [fixture.foreignKitchen, fixture.foreignTenant, fixture.foreignLocation, "kitchen", [], true],
    [fixture.otherKitchen, fixture.tenant, fixture.otherLocation, "kitchen", [], true],
    [fixture.owner, fixture.tenant, null, "owner", [], true],
    [fixture.deniedWrite, fixture.tenant, fixture.location, "kitchen", ["orders.status"], true],
    [fixture.deniedRead, fixture.tenant, fixture.location, "kitchen", ["orders.read"], true],
    [fixture.disabledKitchen, fixture.tenant, fixture.location, "kitchen", [], false],
    [fixture.finance, fixture.tenant, fixture.location, "finance", [], true],
  ];
  for (const [user, tenant, location, role, denies, enabled] of grants) {
    await db.query(
      "insert into public.mealdeck_ops_staff_access(user_id,tenant_id,location_id,role,deny_permissions,enabled) values($1,$2,$3,$4,$5,$6)",
      [user, tenant, location, role, denies, enabled],
    );
  }
  const names = ["Skorch", "Load'd", "Moktl", "Souvano", "Tavo"];
  for (let index = 0; index < names.length; index++) {
    const brand = id(31 + index);
    const category = id(41 + index);
    const item = id(51 + index);
    await db.query("insert into public.tenant_brands(id,tenant_id,name,slug) values($1,$2,$3,$4)", [
      brand,
      fixture.tenant,
      names[index],
      `brand-${index}`,
    ]);
    await db.query(
      "insert into public.menu_categories(id,tenant_id,brand_id,name,slug) values($1,$2,$3,'Fixture category',$4)",
      [category, fixture.tenant, brand, `category-${index}`],
    );
    await db.query(
      "insert into public.menu_items(id,tenant_id,brand_id,category_id,name,price_pence,allergens) values($1,$2,$3,$4,$5,800,ARRAY['milk'])",
      [item, fixture.tenant, brand, category, `${names[index]} fixture dish`],
    );
  }
  for (const [number, name, code] of [
    [61, "Hot food", "HOT"],
    [62, "Fries", "FRIES"],
    [63, "Drinks", "DRINKS"],
    [64, "Grill", "GRILL"],
  ]) {
    await db.query(
      "insert into public.kitchen_stations(id,tenant_id,location_id,name,code) values($1,$2,$3,$4,$5)",
      [id(number), fixture.tenant, fixture.location, name, code],
    );
  }
  for (const [item, station] of [
    [51, 61],
    [52, 62],
    [53, 63],
    [54, 64],
    [55, 61],
  ]) {
    await db.query(
      "insert into public.menu_item_station_routes(tenant_id,location_id,item_id,station_id,prep_kind,prep_seconds) values($1,$2,$3,$4,'prep',600)",
      [fixture.tenant, fixture.location, id(item), id(station)],
    );
  }
}

export async function seedOrder(db, number, options = {}) {
  const order = id(number);
  const tenant = options.tenant ?? fixture.tenant;
  const location = options.location ?? fixture.location;
  await db.query(
    `
    insert into public.orders(
      id,tenant_id,location_id,status,fulfilment,payment_status,source,paid_at,
      customer_name,customer_phone,delivery_address,payment_reference,
      subtotal_pence,total_pence,handoff_code,notes
    ) values($1,$2,$3,$4,'delivery',$5,$6,$7,
      'DO NOT EXPOSE CUSTOMER','DO NOT EXPOSE PHONE','{"line1":"DO NOT EXPOSE ADDRESS"}',
      'DO NOT EXPOSE PAYMENT REFERENCE',2400,2400,'1234','Kitchen note: separate cold drinks')
  `,
    [
      order,
      tenant,
      location,
      options.status ?? "accepted",
      options.paymentStatus ?? "paid",
      options.source ?? "mealdeck",
      options.paidAt === null ? null : new Date().toISOString(),
    ],
  );
  const items = [];
  const tickets = new Map();
  for (const menuNumber of options.items ?? [51, 52, 53, 54, 55]) {
    const item = id(number * 100 + menuNumber);
    const menu = (await db.query("select * from public.menu_items where id=$1", [id(menuNumber)]))
      .rows[0];
    await db.query(
      `insert into public.order_items(id,tenant_id,order_id,brand_id,menu_item_id,item_name,quantity,unit_price_pence,modifiers,notes)
      values($1,$2,$3,$4,$5,$6,1,800,'[{"id":"00000000-0000-4000-8000-000000000301","name":"No onion","priceDeltaPence":777}]','ITEM NOTE: no sauce')`,
      [item, tenant, order, menu.brand_id, menu.id, menu.name],
    );
    items.push(item);
    const routes = (
      await db.query(
        "select * from public.menu_item_station_routes where item_id=$1 and location_id=$2",
        [menu.id, location],
      )
    ).rows;
    for (const route of routes) {
      let ticket = tickets.get(route.station_id);
      if (!ticket) {
        ticket = id(number * 1000 + Number.parseInt(route.station_id.slice(-3), 16));
        await db.query(
          "insert into public.kds_tickets(id,tenant_id,order_id,station_id,status,started_at,ready_at) values($1,$2,$3,$4,$5,$6,$7)",
          [
            ticket,
            tenant,
            order,
            route.station_id,
            options.preparation ?? "queued",
            options.preparation === "preparing" || options.preparation === "ready"
              ? new Date().toISOString()
              : null,
            options.preparation === "ready" ? new Date().toISOString() : null,
          ],
        );
        tickets.set(route.station_id, ticket);
      }
      await db.query(
        "insert into public.kds_ticket_items(tenant_id,ticket_id,order_item_id,station_id,prep_kind,prep_seconds,quantity,status) values($1,$2,$3,$4,'prep',600,1,$5)",
        [tenant, ticket, item, route.station_id, options.preparation ?? "queued"],
      );
    }
  }
  if (options.authority !== false) {
    const payload = options.authorityPayload ?? {
      schema_version: 1,
      order_id: order,
      tenant_id: tenant,
      location_id: location,
      source: "mealdeck",
      release_id: id(number + 900000),
      verified_at: new Date().toISOString(),
      eligible: true,
    };
    await db.query(
      "insert into kds_test_private.release_evidence(order_id,payload) values($1,$2)",
      [order, JSON.stringify(payload)],
    );
  }
  if (options.passStatus) {
    await db.query(
      "insert into public.mealdeck_pass_orders(order_id,tenant_id,location_id,status) values($1,$2,$3,$4)",
      [order, tenant, location, options.passStatus],
    );
  }
  return { order, items, tickets: [...tickets.values()], number };
}

export async function board(
  db,
  actor = fixture.kitchen,
  tenant = fixture.tenant,
  location = fixture.location,
) {
  return asActor(
    db,
    actor,
    async () =>
      (await db.query("select public.mealdeck_ops_kds_board($1,$2) as board", [tenant, location]))
        .rows[0].board,
  );
}

export async function transitionOrder(
  db,
  order,
  version,
  status,
  actor = fixture.kitchen,
  tenant = fixture.tenant,
  location = fixture.location,
) {
  return asActor(
    db,
    actor,
    async () =>
      (
        await db.query(
          "select public.mealdeck_ops_kds_transition_order($1,$2,$3,$4,$5) as result",
          [tenant, location, order, version, status],
        )
      ).rows[0].result,
  );
}

export async function transitionPass(
  db,
  order,
  version,
  status,
  actor = fixture.kitchen,
  tenant = fixture.tenant,
  location = fixture.location,
) {
  return asActor(
    db,
    actor,
    async () =>
      (
        await db.query("select public.mealdeck_ops_kds_transition_pass($1,$2,$3,$4,$5) as result", [
          tenant,
          location,
          order,
          version,
          status,
        ])
      ).rows[0].result,
  );
}

export async function auditCount(db, order) {
  return (
    await db.query(
      "select count(*)::integer as count from public.mealdeck_ops_audit_log where entity_id=$1",
      [order],
    )
  ).rows[0].count;
}

export async function states(db, order) {
  return {
    orders: (
      await db.query("select status,payment_status,paid_at from public.orders where id=$1", [order])
    ).rows,
    tickets: (
      await db.query(
        "select id,status,started_at,ready_at from public.kds_tickets where order_id=$1 order by id",
        [order],
      )
    ).rows,
    lines: (
      await db.query(
        "select i.id,i.status,i.started_at,i.ready_at from public.kds_ticket_items i join public.kds_tickets t on t.id=i.ticket_id where t.order_id=$1 order by i.id",
        [order],
      )
    ).rows,
    pass: (
      await db.query("select status from public.mealdeck_pass_orders where order_id=$1", [order])
    ).rows,
    audit: await auditCount(db, order),
  };
}
