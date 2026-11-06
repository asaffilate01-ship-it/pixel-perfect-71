import assert from "node:assert/strict";
import { asActor, createDatabase, id } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";
import { launchModifierDatabaseId } from "../../deploy/mealdeck/catalogue-import.mjs";
import { buildPublicMenuSql } from "../../deploy/mealdeck/public-menu.mjs";

const db = await createDatabase(process.argv.includes("--native"));
let checks = 0;
async function check(label, fn) {
  await fn();
  console.log(`PASS public menu ${++checks}: ${label}`);
}
try {
  const f = await setupStripeCheckoutFixture(db);
  const skus = f.data.brands.flatMap((brand) =>
    brand.sections.flatMap((section) => section.items.map((item) => item.id)),
  );
  const replacementGroups = f.data.modifierGroups.filter(
    (group) => group.importKind === "cross-replacement",
  );
  const replacementIds = replacementGroups.flatMap((group) =>
    group.options.map((option) => launchModifierDatabaseId(f.tenantId, "option", option.id)),
  );
  const signature = "public.mealdeck_public_launch_catalogue(uuid,uuid,text[],uuid[])";
  const oldPricing = (
    await db.query(
      "select md5(prosrc) as hash from pg_proc where oid='mealdeck_private.price_checkout_lines(uuid,uuid,jsonb)'::regprocedure",
    )
  ).rows[0].hash;
  await db.exec(buildPublicMenuSql());
  await db.exec(buildPublicMenuSql());
  const read = (
    tenant = f.tenantId,
    location = f.locationId,
    requested = skus,
    role = "service_role",
  ) =>
    asActor(
      db,
      role === "authenticated" ? f.owner : null,
      async () =>
        (
          await db.query(
            "select public.mealdeck_public_launch_catalogue($1,$2,$3::text[],$4::uuid[]) as result",
            [tenant, location, requested, replacementIds],
          )
        ).rows[0].result,
      role,
    );
  const findAce = async () => (await read()).items.find((item) => item.sku === f.ace.id);
  const ace = (
    await db.query("select * from public.menu_items where tenant_id=$1 and sku=$2", [
      f.tenantId,
      f.ace.id,
    ])
  ).rows[0];

  await check(
    "only service_role can execute, and scope cannot cross the installed kitchen",
    async () => {
      for (const role of ["anon", "authenticated"])
        await assert.rejects(() => read(f.tenantId, f.locationId, skus, role), /permission denied/);
      await assert.rejects(() => read(id(99001)), /scope_unavailable/);
      await assert.rejects(() => read(f.tenantId, id(99002)), /scope_unavailable/);
      const privileges = (
        await db.query(
          "select has_function_privilege('anon',$1,'execute') as anon,has_function_privilege('authenticated',$1,'execute') as staff,has_function_privilege('service_role',$1,'execute') as service",
          [signature],
        )
      ).rows[0];
      assert.deepEqual(privileges, { anon: false, staff: false, service: true });
    },
  );
  await check(
    "published catalogue stays readable while channel and checkout are closed",
    async () => {
      await db.exec(
        "update public.ordering_channels set enabled=false; update mealdeck_private.checkout_settings set checkout_enabled=false;",
      );
      const result = await read();
      assert.equal(result.items.length, skus.length);
      assert.equal(result.tenantId, f.tenantId);
      assert.equal(result.locationId, f.locationId);
      assert(result.checkedAt);
      assert.equal(
        result.items[0].options.every((option) => typeof option.available === "boolean"),
        true,
      );
    },
  );
  await check(
    "real administrator edits appear immediately, with channel override precedence",
    async () => {
      await asActor(db, f.owner, () =>
        db.query(
          "select public.mealdeck_ops_update_menu_item($1,$2,'Revised Ace','Fresh description',475,true)",
          [f.tenantId, ace.id],
        ),
      );
      assert.equal((await findAce()).name, "Revised Ace");
      assert.equal((await findAce()).description, "Fresh description");
      assert.equal((await findAce()).pricePence, 475);
      await db.query(
        "update public.menu_item_channel_rules set price_override_pence=525 where menu_item_id=$1",
        [ace.id],
      );
      assert.equal((await findAce()).pricePence, 525);
      await asActor(db, f.owner, () =>
        db.query("select public.mealdeck_ops_set_menu_visibility($1,$2,$3,false)", [
          f.tenantId,
          f.locationId,
          ace.id,
        ]),
      );
      assert.equal(await findAce(), undefined);
      await asActor(db, f.owner, () =>
        db.query("select public.mealdeck_ops_set_menu_visibility($1,$2,$3,true)", [
          f.tenantId,
          f.locationId,
          ace.id,
        ]),
      );
      assert(await findAce());
    },
  );
  await check(
    "inactive item, brand, category or station and missing routing are not published",
    async () => {
      for (const [sql, args] of [
        ["update public.menu_items set active=false where id=$1", [ace.id]],
        ["update public.tenant_brands set active=false where id=$1", [ace.brand_id]],
        ["update public.menu_categories set active=false where id=$1", [ace.category_id]],
        ["update public.kitchen_stations set active=false where id=$1", [f.stationId]],
        ["delete from public.menu_item_station_routes where item_id=$1", [ace.id]],
      ]) {
        await db.exec("begin");
        try {
          await db.query(sql, args);
          assert.equal(await findAce(), undefined);
        } finally {
          await db.exec("rollback");
        }
      }
    },
  );
  await check("duplicate SKUs fail closed exactly as canonical checkout does", async () => {
    await db.exec("begin");
    try {
      await db.query(
        "insert into public.menu_items(tenant_id,brand_id,category_id,name,price_pence,sku) values($1,$2,$3,'Unpublished duplicate',100,$4)",
        [f.tenantId, ace.brand_id, ace.category_id, f.ace.id],
      );
      assert.equal(await findAce(), undefined);
    } finally {
      await db.exec("rollback");
    }
  });
  await check("unrequested custom items and private fields are excluded", async () => {
    const result = await read(f.tenantId, f.locationId, [f.ace.id]);
    assert.deepEqual(
      result.items.map((item) => item.sku),
      [f.ace.id],
    );
    assert.deepEqual(Object.keys(result.items[0]).sort(), [
      "brandSlug",
      "description",
      "name",
      "options",
      "pricePence",
      "requiredGroupIds",
      "sku",
    ]);
    assert.equal(JSON.stringify(result).includes("customer"), false);
    await assert.rejects(
      () => read(f.tenantId, f.locationId, [f.ace.id, f.ace.id]),
      /invalid_request/,
    );
  });
  await check(
    "only linked source options appear and live option/cross prices are retained",
    async () => {
      const before = await findAce();
      const first = before.options[0];
      assert(first);
      await db.query(
        "update public.modifier_options set price_delta_pence=87,active=false where id=$1",
        [first.id],
      );
      const changed = (await findAce()).options.find((option) => option.id === first.id);
      assert.equal(changed.pricePence, 87);
      assert.equal(changed.available, false);
      const replacementId = replacementIds[0];
      await db.query(
        "update public.modifier_options set price_delta_pence=379,active=true where id=$1",
        [replacementId],
      );
      assert.equal(
        (await read()).replacementOptions.find((option) => option.id === replacementId).pricePence,
        379,
      );
      await db.exec("begin");
      try {
        await db.query(
          "delete from public.menu_item_modifier_groups where item_id=$1 and group_id=$2",
          [ace.id, first.groupId],
        );
        assert.equal(
          (await findAce()).options.some((option) => option.groupId === first.groupId),
          false,
        );
      } finally {
        await db.exec("rollback");
      }
    },
  );
  await check("hidden Tavo variant options retain exact canonical price increments", async () => {
    const group = f.data.modifierGroups.find((group) => group.importKind === "price-variant");
    const row = (await read()).items.find((item) => item.sku === group.itemId);
    const variant = group.options[2];
    const optionId = launchModifierDatabaseId(f.tenantId, "option", variant.id);
    assert.equal(
      row.options.find((option) => option.id === optionId).pricePence,
      variant.pricePence,
    );
    assert(row.requiredGroupIds.includes(launchModifierDatabaseId(f.tenantId, "group", group.id)));
  });
  await check(
    "projection reads do not alter payment pricing, publication, receipts or audit state",
    async () => {
      const counts = async () =>
        (
          await db.query(
            "select (select count(*)::int from public.orders) as orders,(select count(*)::int from public.mealdeck_ops_audit_log) as audit,(select count(*)::int from public.ordering_channels where enabled) as enabled",
          )
        ).rows[0];
      const before = await counts();
      await read();
      await read();
      assert.deepEqual(await counts(), before);
      assert.equal(
        (
          await db.query(
            "select md5(prosrc) as hash from pg_proc where oid='mealdeck_private.price_checkout_lines(uuid,uuid,jsonb)'::regprocedure",
          )
        ).rows[0].hash,
        oldPricing,
      );
    },
  );
  console.log(`PASS ${checks} public menu database behavior groups`);
} finally {
  await db.close();
}
