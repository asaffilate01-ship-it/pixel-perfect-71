import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { asActor, createDatabase } from "./harness.mjs";
import { setupPaidOrderNumbersFixture } from "./paid-order-numbers-fixture.mjs";
import { buildPaidOrderNumbersSql } from "../../deploy/mealdeck/paid-order-numbers.mjs";

const db = await createDatabase(process.argv.includes("--native"), { uuid_ossp });
const operation = await readFile(new URL("../../deploy/mealdeck/operations/20261128_marketplace_ledger_foundation.sql", import.meta.url), "utf8");
const tables = ["marketplace_connectors", "marketplace_orders", "marketplace_order_items", "marketplace_observations", "marketplace_commands"];
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
const definitions = async () => (await db.query("select p.oid::text,pg_get_functiondef(p.oid) as definition,p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' order by p.oid")).rows;
try {
  const f = await setupPaidOrderNumbersFixture(db);
  await db.exec(buildPaidOrderNumbersSql());
  const before = await definitions();
  await db.exec(operation);
  assert.deepEqual(await definitions(), before, "existing public functions and ACLs must be unchanged");
  for (const table of tables) {
    assert.equal(await scalar("select relrowsecurity from pg_class where oid=$1::regclass", ["mealdeck_private." + table]), true);
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const permission of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"])
        assert.equal(await scalar("select has_table_privilege($1,$2,$3)", [role, "mealdeck_private." + table, permission]), false);
      await assert.rejects(() => asActor(db, f.owner, () => db.query("select * from mealdeck_private." + table), role), /permission denied/);
    }
  }
  const caps = JSON.stringify({ accept: true, preparing: false, ready: true, handover: false });
  const insert = (platform, store, token) => scalar("insert into mealdeck_private.marketplace_connectors(tenant_id,location_id,platform,external_store_id,label,station_id,token_hash,profile_id,profile_version,capabilities) values($1,$2,$3,$4,'fixture',$5,$6,'fixture','1',$7::jsonb) returning id", [f.tenantId,f.locationId,platform,store,f.stationId,token,caps]);
  const uber = await insert("uber_eats", "fixture-store", "a".repeat(64));
  const justEat = await insert("just_eat", "fixture-store", "b".repeat(64));
  assert.notEqual(uber, justEat);
  assert.equal(await scalar("select enabled from mealdeck_private.marketplace_connectors where id=$1", [uber]), false);
  await assert.rejects(() => insert("uber_eats", "fixture-store", "c".repeat(64)), /unique|duplicate/i);
  await assert.rejects(() => db.query("update mealdeck_private.marketplace_connectors set enabled=true,commissioned_at=now(),commissioning_reference='fixture',permission_reference='fixture' where id=$1", [uber]), /marketplace_foundation_disabled/);
  const insertOrder = (connector, ref = "00Ab-19") => scalar("insert into mealdeck_private.marketplace_orders(connector_id,tenant_id,location_id,external_order_id,display_reference,snapshot,fulfilment,currency,total_pence,placed_at,platform_state,observed_at) values($1,$2,$3,'fixture-order',$4,'{}','collection','GBP',1599,now(),'new',now()) returning id", [connector,f.tenantId,f.locationId,ref]);
  const first = await insertOrder(uber);
  assert.notEqual(first, await insertOrder(justEat));
  assert.equal(await scalar("select display_reference from mealdeck_private.marketplace_orders where id=$1", [first]), "00Ab-19");
  await assert.rejects(() => insertOrder(uber), /unique|duplicate/i);
  await assert.rejects(() => db.query("insert into mealdeck_private.marketplace_order_items(order_id,connector_id,external_line_id,position,name,quantity,modifiers) values($1,$2,'line',1,'fixture burger',1,'[]')", [first,justEat]), /foreign key/i);
  const command = await scalar("insert into mealdeck_private.marketplace_commands(connector_id,order_id,action,status,actor_id) values($1,$2,'accept','queued',$3) returning id", [uber,first,f.owner]);
  await assert.rejects(() => db.query("update mealdeck_private.marketplace_commands set status='sending',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '1 minute' where id=$1", [command]), /marketplace_foundation_no_dispatch/);
  assert.deepEqual(await definitions(), before);
  console.log("PASS isolated ledger: unchanged public functions, five private RLS tables, no API grants, exact scoped identities, activation and dispatch disabled");
} finally { await db.close(); }
