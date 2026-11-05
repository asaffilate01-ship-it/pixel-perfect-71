import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { asActor, id } from "./harness.mjs";
import {
  buildModifierPriceSql,
  buildManagedModifierPriceSql,
} from "../../deploy/mealdeck/modifier-prices.mjs";

export const modifierPriceMigration = new URL(
  "../../deploy/mealdeck/post-install-migrations/20261105071120_mealdeck_ops_modifier_prices.sql",
  import.meta.url,
);

/** Uses the caller's disposable independent-profile database after catalogue import. */
export async function verifyModifierPrices(db, { tenantId, locationId, owner }) {
  const sql = await readFile(modifierPriceMigration, "utf8");
  const managed = buildManagedModifierPriceSql({
    runnerOwnsTransaction: true,
    singleMigration: true,
  });
  let checks = 0;
  const listSql = "select * from public.mealdeck_ops_modifier_prices($1)";
  const updateSql = "select public.mealdeck_ops_modifier_update_price($1,$2,$3,$4) as result";
  const users = {
    reader: id(1801),
    local: id(1802),
    denied: id(1803),
    disabled: id(1804),
    foreign: id(1805),
    editor: id(1806),
    customer: id(1807),
  };
  const foreignTenant = id(1810),
    foreignGroup = id(1811),
    foreignOption = id(1812);
  async function test(label, action) {
    try {
      await action();
      console.log("PASS modifier prices " + ++checks + ": " + label);
    } catch (error) {
      console.error("FAIL modifier prices: " + label);
      throw error;
    }
  }
  async function install() {
    try {
      return await db.exec(sql);
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
  }
  const list = (actor = owner, tenant = tenantId) =>
    asActor(db, actor, async () => (await db.query(listSql, [tenant])).rows);
  const update = (actor, option, next, previous, tenant = tenantId) =>
    asActor(
      db,
      actor,
      async () => (await db.query(updateSql, [tenant, option, next, previous])).rows[0].result,
    );
  const optionRow = async (option) =>
    (await db.query("select * from public.modifier_options where id=$1", [option])).rows[0];
  const audit = async () =>
    (
      await db.query(
        "select * from public.mealdeck_ops_audit_log where action='menu.modifier_price.update' order by id",
      )
    ).rows;
  async function gates() {
    const snapshot = {};
    for (const table of [
      "ordering_channels",
      "menu_items",
      "menu_item_channel_rules",
      "orders",
      "kds_tickets",
    ]) {
      snapshot[table] = (
        await db.query(
          "select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as rows from public." +
            table +
            " t",
        )
      ).rows[0].rows;
    }
    snapshot.options = (
      await db.query("select id,group_id,name,active from public.modifier_options order by id")
    ).rows;
    return snapshot;
  }

  await test("managed output preserves every SQL body and requires one atomic runner-owned transaction", async () => {
    assert.equal(buildModifierPriceSql(), sql);
    assert.equal(
      managed,
      sql
        .split("\n")
        .filter((line) => line !== "begin;" && line !== "commit;")
        .join("\n"),
    );
    assert.deepEqual(managed.match(/^[\t ]*(?:begin|commit);[\t ]*$/gim) ?? [], []);
    for (const invalid of [
      undefined,
      null,
      {},
      [],
      { runnerOwnsTransaction: true },
      { runnerOwnsTransaction: true, singleMigration: false },
      { runnerOwnsTransaction: "true", singleMigration: true },
      { runnerOwnsTransaction: true, singleMigration: true, split: true },
    ])
      assert.throws(
        () => buildManagedModifierPriceSql(invalid),
        /one runner-owned atomic transaction/,
      );
    await db.exec("begin");
    try {
      await db.exec(managed);
      await assert.rejects(
        () => db.exec("do $$ begin raise exception 'modifier_extension_late_failure'; end $$"),
        /modifier_extension_late_failure/,
      );
    } finally {
      await db.exec("rollback");
    }
    assert.equal(
      (await db.query("select to_regprocedure('public.mealdeck_ops_modifier_prices(uuid)') as rpc"))
        .rows[0].rpc,
      null,
    );
    assert.equal(
      (
        await db.query(
          "select to_regprocedure('public.mealdeck_ops_modifier_update_price(uuid,uuid,integer,integer)') as rpc",
        )
      ).rows[0].rpc,
      null,
    );
  });

  await test("the extension rejects shared databases and API-role installation, then installs idempotently without rewriting the base profile", async () => {
    const marker = (await db.query("select * from mealdeck_private.installation")).rows;
    await db.exec("create schema dishbee_private");
    await assert.rejects(install, /independent_profile_required/);
    await db.exec("drop schema dishbee_private");
    for (const role of ["anon", "authenticated", "service_role"])
      await assert.rejects(
        () => asActor(db, owner, install, role),
        /database_owner_required|permission denied/,
      );
    await install();
    const first = (
      await db.query(
        "select proname,pg_get_functiondef(oid) as definition,proacl::text as acl from pg_proc where proname in ('mealdeck_ops_modifier_prices','mealdeck_ops_modifier_update_price') order by proname",
      )
    ).rows;
    await db.exec("begin");
    try {
      await db.exec(managed);
      await db.exec("commit");
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
    assert.deepEqual(
      (
        await db.query(
          "select proname,pg_get_functiondef(oid) as definition,proacl::text as acl from pg_proc where proname in ('mealdeck_ops_modifier_prices','mealdeck_ops_modifier_update_price') order by proname",
        )
      ).rows,
      first,
    );
    assert.deepEqual((await db.query("select * from mealdeck_private.installation")).rows, marker);
  });

  await db.query(
    "insert into public.tenants(id,name,slug,legal_name) values($1,'Other price fixture','other-price-fixture','Unrelated fixture business')",
    [foreignTenant],
  );
  await db.query(
    "insert into public.modifier_groups(id,tenant_id,name) values($1,$2,'Private foreign choices')",
    [foreignGroup, foreignTenant],
  );
  await db.query(
    "insert into public.modifier_options(id,tenant_id,group_id,name,price_delta_pence) values($1,$2,$3,'Private foreign option',800)",
    [foreignOption, foreignTenant, foreignGroup],
  );
  for (const [name, user] of Object.entries(users))
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [
      user,
      "modifier-" + name + "@example.invalid",
    ]);
  for (const [user, tenant, location, role, denied, enabled] of [
    [users.reader, tenantId, null, "viewer", [], true],
    [users.local, tenantId, locationId, "menu", [], true],
    [users.denied, tenantId, null, "menu", ["menu.write"], true],
    [users.disabled, tenantId, null, "menu", [], false],
    [users.foreign, foreignTenant, null, "owner", [], true],
    [users.editor, tenantId, null, "menu", [], true],
  ])
    await db.query(
      "insert into public.mealdeck_ops_staff_access(user_id,tenant_id,location_id,role,deny_permissions,enabled) values($1,$2,$3,$4,$5,$6)",
      [user, tenant, location, role, denied, enabled],
    );

  const initialGates = await gates();
  const rows = await list();
  const linked = rows.find((row) => row.affected_item_count > 1 && row.price_delta_pence === 2000);
  const unlinked = rows.find((row) => row.affected_item_count === 0);
  assert.ok(
    linked && unlinked,
    "The real import must contain shared source and unlinked replacement groups",
  );

  await test("all canonical choices are listed, including unlinked replacement drafts, with exact shared-item counts", async () => {
    const expected = (
      await db.query(
        "select count(*)::integer as n from public.modifier_options where tenant_id=$1",
        [tenantId],
      )
    ).rows[0].n;
    assert.equal(rows.length, expected);
    assert.ok(rows.every((row) => row.active === false));
    assert.ok(rows.some((row) => row.price_delta_pence === 0));
    assert.ok(rows.some((row) => row.affected_item_count === 0));
    for (const row of rows) {
      const n = (
        await db.query(
          "select count(*)::integer as n from public.menu_item_modifier_groups where tenant_id=$1 and group_id=$2",
          [tenantId, row.group_id],
        )
      ).rows[0].n;
      assert.equal(row.affected_item_count, n);
      assert.notEqual(row.option_id, foreignOption);
    }
    assert.equal((await list(users.reader)).length, expected);
  });

  await test("anonymous/service identities have no execution or direct table rights, and unaffiliated users fail closed", async () => {
    for (const role of ["anon", "service_role"]) {
      await assert.rejects(
        () => asActor(db, owner, () => db.query(listSql, [tenantId]), role),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          asActor(
            db,
            owner,
            () => db.query(updateSql, [tenantId, linked.option_id, 1750, 2000]),
            role,
          ),
        /permission denied/,
      );
    }
    for (const actor of [null, users.customer, users.local, users.disabled, users.foreign]) {
      await assert.rejects(() => list(actor), /forbidden/);
      await assert.rejects(() => update(actor, linked.option_id, 1750, 2000), /forbidden/);
    }
    for (const role of ["anon", "authenticated", "service_role"]) {
      const acl = (
        await db.query(
          "select has_table_privilege($1,'public.modifier_options','SELECT,UPDATE') as options,has_table_privilege($1,'public.mealdeck_ops_audit_log','INSERT,UPDATE,DELETE') as audit",
          [role],
        )
      ).rows[0];
      assert.deepEqual(acl, { options: false, audit: false });
    }
    const publicExec = (
      await db.query(
        "select count(*)::integer as n from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.proname in ('mealdeck_ops_modifier_prices','mealdeck_ops_modifier_update_price') and a.grantee=0 and a.privilege_type='EXECUTE'",
      )
    ).rows[0].n;
    assert.equal(publicExec, 0);
  });

  await test("global readers and denied writers cannot edit, and tenant/option UUID swaps cannot cross business boundaries", async () => {
    const before = await optionRow(linked.option_id);
    const count = (await audit()).length;
    for (const actor of [users.reader, users.denied])
      await assert.rejects(() => update(actor, linked.option_id, 1750, 2000), /forbidden/);
    await assert.rejects(() => list(owner, foreignTenant), /forbidden/);
    await assert.rejects(() => update(owner, foreignOption, 1750, 800), /not_found/);
    await assert.rejects(
      () => update(owner, linked.option_id, 1750, 2000, foreignTenant),
      /forbidden/,
    );
    assert.deepEqual(await optionRow(linked.option_id), before);
    assert.equal((await audit()).length, count);
    assert.equal((await optionRow(foreignOption)).price_delta_pence, 800);
  });

  await test("an authorized editor saves £20 to £17.50, changes only the price and records its exact actor, old/new values and shared count", async () => {
    const before = await optionRow(linked.option_id);
    const count = (await audit()).length;
    const receipt = await update(users.editor, linked.option_id, 1750, 2000);
    assert.deepEqual(await optionRow(linked.option_id), { ...before, price_delta_pence: 1750 });
    assert.equal(receipt.price_delta_pence, 1750);
    assert.equal(receipt.affected_item_count, linked.affected_item_count);
    assert.equal(receipt.active, before.active);
    assert.equal(receipt.changed, true);
    const events = await audit();
    assert.equal(events.length, count + 1);
    const event = events.at(-1);
    assert.equal(event.actor_id, users.editor);
    assert.equal(event.tenant_id, tenantId);
    assert.equal(event.location_id, null);
    assert.equal(event.entity_id, linked.option_id);
    assert.equal(event.previous_value.pricePence, 2000);
    assert.equal(event.next_value.pricePence, 1750);
    assert.equal(event.next_value.affectedItemCount, linked.affected_item_count);
  });

  await test("stale or invalid prices reject without mutation or audit, while an intentional £0 option saves and replays without duplicate audit", async () => {
    const count = (await audit()).length;
    await assert.rejects(() => update(owner, linked.option_id, 1600, 2000), /price_conflict/);
    for (const [next, expected] of [
      [null, 1750],
      [-1, 1750],
      [1000001, 1750],
      [0, null],
      [0, -1],
    ])
      await assert.rejects(() => update(owner, linked.option_id, next, expected), /invalid_price/);
    assert.equal((await optionRow(linked.option_id)).price_delta_pence, 1750);
    assert.equal((await audit()).length, count);
    assert.equal((await update(owner, linked.option_id, 0, 1750)).price_delta_pence, 0);
    assert.equal((await update(owner, linked.option_id, 0, 0)).changed, false);
    assert.equal((await audit()).length, count + 1);
    assert.equal(
      (await list()).find((row) => row.option_id === linked.option_id).price_delta_pence,
      0,
    );
  });

  await test("an unlinked replacement price is editable without attaching it or making it available", async () => {
    const before = await optionRow(unlinked.option_id);
    const receipt = await update(owner, unlinked.option_id, 1250, before.price_delta_pence);
    assert.equal(receipt.affected_item_count, 0);
    assert.equal(receipt.active, false);
    assert.deepEqual(await optionRow(unlinked.option_id), { ...before, price_delta_pence: 1250 });
    assert.equal(
      (
        await db.query(
          "select count(*)::integer as n from public.menu_item_modifier_groups where group_id=$1",
          [unlinked.group_id],
        )
      ).rows[0].n,
      0,
    );
  });

  await test("a failed audit insert rolls the price back in the same transaction", async () => {
    const before = await optionRow(linked.option_id);
    const count = (await audit()).length;
    await db.exec(
      "create function mealdeck_private.test_price_audit_failure() returns trigger language plpgsql as $$ begin if new.action='menu.modifier_price.update' then raise exception 'fixture_modifier_audit_failure'; end if; return new; end $$; create trigger test_price_audit_failure before insert on public.mealdeck_ops_audit_log for each row execute function mealdeck_private.test_price_audit_failure()",
    );
    try {
      await assert.rejects(
        () => update(owner, linked.option_id, 1600, 0),
        /fixture_modifier_audit_failure/,
      );
    } finally {
      await db.exec(
        "drop trigger test_price_audit_failure on public.mealdeck_ops_audit_log; drop function mealdeck_private.test_price_audit_failure()",
      );
    }
    assert.deepEqual(await optionRow(linked.option_id), before);
    assert.equal((await audit()).length, count);
  });

  if (db.native) {
    async function waitForBlock(otherPid, ownPid) {
      for (let attempt = 0; attempt < 40; attempt++) {
        if (
          (
            await db.query("select pg_blocking_pids($1) as blockers", [otherPid])
          ).rows[0].blockers.includes(ownPid)
        )
          return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.fail("The second PostgreSQL session did not wait on the option lock");
    }
    async function waitingEditor(actor, work) {
      const other = new pg.Client(db.config);
      await other.connect();
      try {
        await other.query("set role authenticated");
        await other.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
        await work(
          other,
          (await other.query("select pg_backend_pid() as pid")).rows[0].pid,
          (await db.query("select pg_backend_pid() as pid")).rows[0].pid,
        );
      } finally {
        await db.exec("rollback");
        await other.end();
      }
    }
    await test("two real editor sessions serialize and the stale writer cannot overwrite the winning price", async () => {
      const count = (await audit()).length;
      await waitingEditor(owner, async (other, otherPid, ownPid) => {
        await db.exec("begin");
        await update(owner, linked.option_id, 1800, 0);
        const waiting = other.query(updateSql, [tenantId, linked.option_id, 1700, 0]).then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
        await waitForBlock(otherPid, ownPid);
        await db.exec("commit");
        assert.match((await waiting).error?.message ?? "", /price_conflict/);
      });
      assert.equal((await optionRow(linked.option_id)).price_delta_pence, 1800);
      assert.equal((await audit()).length, count + 1);
    });
    await test("staff permission revoked while an update waits is rechecked before any price or audit write", async () => {
      const count = (await audit()).length;
      await waitingEditor(users.editor, async (other, otherPid, ownPid) => {
        await db.exec("begin");
        await db.query("select id from public.modifier_options where id=$1 for update", [
          linked.option_id,
        ]);
        const waiting = other.query(updateSql, [tenantId, linked.option_id, 1700, 1800]).then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
        await waitForBlock(otherPid, ownPid);
        await db.query(
          "update public.mealdeck_ops_staff_access set enabled=false where tenant_id=$1 and user_id=$2",
          [tenantId, users.editor],
        );
        await db.exec("commit");
        assert.match((await waiting).error?.message ?? "", /forbidden/);
      });
      assert.equal((await optionRow(linked.option_id)).price_delta_pence, 1800);
      assert.equal((await audit()).length, count);
    });
  } else console.log("SKIP native modifier concurrency: embedded PostgreSQL has one connection.");

  await test("price editing leaves product data, publication, ordering and kitchen-release state unchanged", async () => {
    assert.deepEqual(await gates(), initialGates);
    assert.equal(
      (await db.query("select mealdeck_ops_private.kds_authority_ready() as ready")).rows[0].ready,
      false,
    );
  });
  console.log("PASS modifier prices: " + checks + " behavioral groups; no hosted calls.");
  return checks;
}
