import assert from "node:assert/strict";
import { asActor, createDatabase, id } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";
import { buildModifierPriceSql } from "../../deploy/mealdeck/modifier-prices.mjs";
import { buildPublicMenuSql } from "../../deploy/mealdeck/public-menu.mjs";
import {
  buildMenuStructureSql,
  buildManagedMenuStructureSql,
} from "../../deploy/mealdeck/menu-structure.mjs";

const db = await createDatabase(process.argv.includes("--native"));
let checks = 0;
async function check(label, action) {
  try {
    await action();
    console.log(`PASS menu structure ${++checks}: ${label}`);
  } catch (error) {
    console.error(
      `FAIL menu structure: ${label}: ${error.message}`,
      error.detail ?? "",
      error.where ?? "",
    );
    throw error;
  }
}
try {
  const f = await setupStripeCheckoutFixture(db);
  await db.exec(buildModifierPriceSql());
  await db.exec(buildPublicMenuSql());
  const pricing = await db.query(
    "select md5(prosrc) hash from pg_proc where oid='mealdeck_private.price_checkout_lines(uuid,uuid,jsonb)'::regprocedure",
  );
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  await check(
    "one atomic additive installation with explicit ACLs and unchanged canonical pricing",
    async () => {
      for (const options of [
        undefined,
        null,
        {},
        { runnerOwnsTransaction: false, singleMigration: true },
        { runnerOwnsTransaction: true, singleMigration: false },
        { runnerOwnsTransaction: true, singleMigration: true, split: true },
      ])
        assert.throws(() => buildManagedMenuStructureSql(options), /one runner-owned/);
      await db.exec("begin");
      await db.exec(
        buildManagedMenuStructureSql({ runnerOwnsTransaction: true, singleMigration: true }),
      );
      await db.exec("rollback");
      assert.equal(
        await scalar("select to_regprocedure('public.mealdeck_ops_menu_categories(uuid)')"),
        null,
      );
      await db.exec(buildMenuStructureSql());
      await db.exec(buildMenuStructureSql());
      assert.deepEqual(
        await db.query(
          "select md5(prosrc) hash from pg_proc where oid='mealdeck_private.price_checkout_lines(uuid,uuid,jsonb)'::regprocedure",
        ),
        pricing,
      );
      const acl = await rows(`select p.proname,has_function_privilege('anon',p.oid,'EXECUTE') anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') staff,has_function_privilege('service_role',p.oid,'EXECUTE') service
      from pg_proc p where p.proname in ('mealdeck_ops_menu_categories','mealdeck_ops_update_menu_category','mealdeck_ops_modifier_update_option')`);
      assert.equal(acl.length, 3);
      assert.ok(acl.every((r) => !r.anon && r.staff && !r.service));
    },
  );
  const roles = {
    reader: id(50101),
    local: id(50102),
    denied: id(50103),
    disabled: id(50104),
    editor: id(50105),
    customer: id(50106),
    foreign: id(50107),
  };
  const foreignTenant = id(50201),
    foreignBrand = id(50202),
    foreignCategory = id(50203),
    foreignGroup = id(50204),
    foreignOption = id(50205);
  await db.query(
    "insert into public.tenants(id,name,slug,legal_name) values($1,'Other Business','other-structure','Other Business Ltd')",
    [foreignTenant],
  );
  await db.query(
    "insert into public.tenant_brands(id,tenant_id,name,slug) values($1,$2,'Foreign brand','foreign-brand')",
    [foreignBrand, foreignTenant],
  );
  await db.query(
    "insert into public.menu_categories(id,tenant_id,brand_id,name,slug) values($1,$2,$3,'Foreign Category','foreign-category')",
    [foreignCategory, foreignTenant, foreignBrand],
  );
  await db.query(
    "insert into public.modifier_groups(id,tenant_id,name) values($1,$2,'Foreign choices')",
    [foreignGroup, foreignTenant],
  );
  await db.query(
    "insert into public.modifier_options(id,tenant_id,group_id,name,price_delta_pence) values($1,$2,$3,'Foreign option',100)",
    [foreignOption, foreignTenant, foreignGroup],
  );
  for (const [name, user] of Object.entries(roles))
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [
      user,
      `structure-${name}@example.invalid`,
    ]);
  for (const [user, tenant, location, role, denied, enabled] of [
    [roles.reader, f.tenantId, null, "viewer", [], true],
    [roles.local, f.tenantId, f.locationId, "menu", [], true],
    [roles.denied, f.tenantId, null, "menu", ["menu.write"], true],
    [roles.disabled, f.tenantId, null, "menu", [], false],
    [roles.editor, f.tenantId, null, "menu", [], true],
    [roles.foreign, foreignTenant, null, "owner", [], true],
  ])
    await db.query(
      "insert into public.mealdeck_ops_staff_access(user_id,tenant_id,location_id,role,deny_permissions,enabled) values($1,$2,$3,$4,$5,$6)",
      [user, tenant, location, role, denied, enabled],
    );
  const categories = (actor = f.owner, tenant = f.tenantId) =>
    asActor(db, actor, () =>
      rows("select * from public.mealdeck_ops_menu_categories($1)", [tenant]),
    );
  const options = (actor = f.owner) =>
    asActor(db, actor, () =>
      rows("select * from public.mealdeck_ops_modifier_prices($1)", [f.tenantId]),
    );
  const category = (await categories()).find((c) => c.affected_item_count > 1);
  const group = f.data.modifierGroups.find((g) => g.id === "skorch-burgers-burger-add-ons");
  const sourceOption = group.options[0];
  const addon = f.mkOption(group.id, sourceOption.id);
  let option = (await options()).find((o) => o.option_id === addon.optionId);
  const updateCategory = (current, change = {}, actor = f.owner, scope = {}) =>
    asActor(db, actor, () =>
      scalar("select public.mealdeck_ops_update_menu_category($1,$2,$3,$4,$5,$6,$7)", [
        scope.tenant ?? f.tenantId,
        scope.category ?? current.category_id,
        scope.brand ?? current.brand_id,
        change.name ?? current.category_name,
        change.active ?? current.active,
        current.category_name,
        current.active,
      ]),
    );
  const updateOption = (current, change = {}, actor = f.owner, scope = {}) =>
    asActor(db, actor, () =>
      scalar("select public.mealdeck_ops_modifier_update_option($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
        scope.tenant ?? f.tenantId,
        scope.option ?? current.option_id,
        scope.group ?? current.group_id,
        change.name ?? current.option_name,
        change.price ?? current.price_delta_pence,
        change.active ?? current.active,
        current.option_name,
        current.price_delta_pence,
        current.active,
      ]),
    );
  const audit = () =>
    rows(
      "select * from public.mealdeck_ops_audit_log where action in ('menu.category.update','menu.modifier_option.update') order by created_at,id",
    );
  const publicMenu = () =>
    f.service(() =>
      scalar("select public.mealdeck_public_launch_catalogue($1,$2,$3::text[],'{}'::uuid[])", [
        f.tenantId,
        f.locationId,
        f.data.brands.flatMap((b) => b.sections.flatMap((s) => s.items.map((i) => i.id))),
      ]),
    );

  await check(
    "browser/service roles cannot write tables or call helpers and non-global staff cannot edit",
    async () => {
      assert.ok((await categories(roles.reader)).length > 0);
      for (const actor of [
        null,
        roles.reader,
        roles.local,
        roles.denied,
        roles.disabled,
        roles.customer,
        roles.foreign,
      ]) {
        await assert.rejects(
          () => updateCategory(category, { name: "Blocked edit" }, actor),
          /forbidden/,
        );
        await assert.rejects(
          () => updateOption(option, { name: "Blocked edit" }, actor),
          /forbidden/,
        );
      }
      for (const role of ["anon", "service_role"])
        await assert.rejects(
          () =>
            asActor(
              db,
              f.owner,
              () => db.query("select * from public.mealdeck_ops_menu_categories($1)", [f.tenantId]),
              role,
            ),
          /permission denied/,
        );
      for (const role of ["anon", "authenticated", "service_role"]) {
        await assert.rejects(
          () =>
            asActor(
              db,
              f.owner,
              () =>
                db.query(
                  "select mealdeck_ops_private.assert_menu_structure_permission($1,'menu.write')",
                  [f.tenantId],
                ),
              role,
            ),
          /permission denied/,
        );
        const acl = await scalar(
          "select has_table_privilege($1,'public.menu_categories','UPDATE') or has_table_privilege($1,'public.modifier_options','UPDATE')",
          [role],
        );
        assert.equal(acl, false);
      }
      assert.equal((await audit()).length, 0);
    },
  );

  await check(
    "tenant, brand and group UUID substitution cannot edit another category or option",
    async () => {
      await assert.rejects(
        () => updateCategory(category, { name: "Wrong brand" }, f.owner, { brand: id(59991) }),
        /not_found/,
      );
      await assert.rejects(
        () =>
          updateCategory(category, { name: "Foreign edit" }, f.owner, {
            category: foreignCategory,
            brand: foreignBrand,
          }),
        /not_found/,
      );
      await assert.rejects(
        () =>
          updateCategory(category, { name: "Foreign edit" }, roles.foreign, {
            tenant: foreignTenant,
            category: foreignCategory,
            brand: foreignBrand,
          }),
        /forbidden/,
      );
      await assert.rejects(
        () => updateOption(option, { name: "Wrong group" }, f.owner, { group: id(59992) }),
        /not_found/,
      );
      await assert.rejects(
        () =>
          updateOption(option, { name: "Foreign edit" }, f.owner, {
            option: foreignOption,
            group: foreignGroup,
          }),
        /not_found/,
      );
      await assert.rejects(() => categories(roles.foreign, foreignTenant), /forbidden/);
      assert.equal((await audit()).length, 0);
      // The public launch projection intentionally admits exactly one installed
      // business. Remove only this disposable cross-tenant probe before reading it.
      for (const table of [
        "mealdeck_ops_staff_access",
        "modifier_options",
        "modifier_groups",
        "menu_categories",
        "tenant_brands",
      ])
        await db.query(`delete from public.${table} where tenant_id=$1`, [foreignTenant]);
      await db.query("delete from public.tenants where id=$1", [foreignTenant]);
    },
  );

  await check(
    "category rename/availability keeps identity, reports scope, rejects stale writes and reaches public labels",
    async () => {
      const original = await rows("select * from public.menu_categories where id=$1", [
        category.category_id,
      ]);
      const itemSkus = (
        await rows("select sku from public.menu_items where category_id=$1", [category.category_id])
      ).map((x) => x.sku);
      let saved = await updateCategory(category, { name: "Updated Category" }, roles.editor);
      assert.equal(saved.changed, true);
      assert.equal(saved.affected_item_count, itemSkus.length);
      assert.ok(
        (await publicMenu()).items
          .filter((i) => itemSkus.includes(i.sku))
          .every((i) => i.categoryName === "Updated Category"),
      );
      await assert.rejects(
        () => updateCategory(category, { name: "Stale category" }),
        /category_conflict/,
      );
      saved = await updateCategory(saved, { active: false });
      assert.equal(
        (await publicMenu()).items.some((i) => itemSkus.includes(i.sku)),
        false,
      );
      await assert.rejects(
        () => updateCategory({ ...saved, active: true }, { name: "Stale toggle" }),
        /category_conflict/,
      );
      saved = await updateCategory(saved, { active: true });
      assert.equal((await updateCategory(saved)).changed, false);
      const after = await rows("select * from public.menu_categories where id=$1", [
        category.category_id,
      ]);
      assert.deepEqual(after, [{ ...original[0], name: "Updated Category" }]);
      assert.equal((await audit()).filter((a) => a.action === "menu.category.update").length, 3);
    },
  );

  const line = { ...f.line, modifiers: [addon] };
  const paidQuote = await f.quote({ lines: [line] });
  const paid = await f.prepare(paidQuote.quoteId);
  await f.bind(paid.orderId);
  await f.reconcile(paid);
  const paidBefore = await rows("select * from public.order_items where order_id=$1", [
    paid.orderId,
  ]);
  const staleQuote = await f.quote({ lines: [line] });
  await check(
    "shared add-on name, price and active edits are audited and stale checkout is repriced",
    async () => {
      const before = await rows("select * from public.modifier_options where id=$1", [
        option.option_id,
      ]);
      const previous = option;
      option = await updateOption(option, { name: "Extra cheese", price: 175 }, roles.editor);
      assert.equal(option.changed, true);
      assert.ok(option.affected_item_count > 1);
      assert.deepEqual(
        await rows("select * from public.modifier_options where id=$1", [option.option_id]),
        [{ ...before[0], name: "Extra cheese", price_delta_pence: 175 }],
      );
      await assert.rejects(
        () => updateOption(previous, { price: 150 }),
        /modifier_option_conflict/,
      );
      await assert.rejects(
        () => f.prepare(staleQuote.quoteId, { attemptId: id(55001) }),
        /price_changed/,
      );
      const fresh = await f.quote({ lines: [line] });
      assert.equal(fresh.grossPence, 399 + 175);
      const publicOptions = (await publicMenu()).items
        .flatMap((i) => i.options)
        .filter((o) => o.id === option.option_id);
      assert.ok(publicOptions.length > 1);
      assert.ok(
        publicOptions.every(
          (o) => o.label === "Extra cheese" && o.pricePence === 175 && o.available,
        ),
      );
      option = await updateOption(option, { active: false });
      assert.ok(
        (await publicMenu()).items
          .flatMap((i) => i.options)
          .filter((o) => o.id === option.option_id)
          .every((o) => !o.available),
      );
      await assert.rejects(() => f.quote({ lines: [line] }), /modifier_unavailable/);
      option = await updateOption(option, { active: true, price: 0 });
      assert.equal((await f.quote({ lines: [line] })).grossPence, 399);
      assert.equal((await updateOption(option)).changed, false);
      assert.deepEqual(
        await rows("select * from public.order_items where order_id=$1", [paid.orderId]),
        paidBefore,
      );
      const events = (await audit()).filter((a) => a.action === "menu.modifier_option.update");
      assert.equal(events.length, 3);
      assert.equal(events[0].actor_id, roles.editor);
      assert.equal(events[0].previous_value.name, previous.option_name);
      assert.equal(events[0].next_value.pricePence, 175);
    },
  );

  await check("invalid fields and an audit failure roll back without changing rows", async () => {
    const current = (await categories()).find((c) => c.category_id === category.category_id);
    for (const name of ["", "x", "x".repeat(141), "Bad\nCategory"])
      await assert.rejects(() => updateCategory(current, { name }), /category_invalid/);
    for (const name of ["", "x".repeat(141), "Bad\nOption"])
      await assert.rejects(() => updateOption(option, { name }), /option_invalid/);
    for (const price of [-1, 1000001])
      await assert.rejects(() => updateOption(option, { price }), /option_invalid/);
    const before = await rows("select * from public.modifier_options where id=$1", [
      option.option_id,
    ]);
    const count = (await audit()).length;
    await db.exec(
      "create function mealdeck_private.structure_audit_failure() returns trigger language plpgsql as $$ begin if new.action='menu.modifier_option.update' then raise exception 'fixture_audit_failure'; end if; return new; end $$; create trigger structure_audit_failure before insert on public.mealdeck_ops_audit_log for each row execute function mealdeck_private.structure_audit_failure()",
    );
    await assert.rejects(() => updateOption(option, { price: 99 }), /fixture_audit_failure/);
    await db.exec(
      "drop trigger structure_audit_failure on public.mealdeck_ops_audit_log;drop function mealdeck_private.structure_audit_failure()",
    );
    assert.deepEqual(
      await rows("select * from public.modifier_options where id=$1", [option.option_id]),
      before,
    );
    assert.equal((await audit()).length, count);
    assert.equal(await scalar("select count(*)::integer from public.orders"), 1);
    assert.equal(await scalar("select count(*)::integer from public.kds_tickets"), 1);
  });
  await check(
    "disabling every required choice keeps its requirement and blocks checkout until restored",
    async () => {
      const requiredGroup = f.data.modifierGroups.find((g) => g.id === "souvano-heatwave-base");
      const item = f.data.brands
        .find((b) => b.id === "souvano")
        .sections.flatMap((s) => s.items)
        .find((i) => i.canonicalOptionGroupIds.includes(requiredGroup.id));
      const selected = f.mkOption(requiredGroup.id, requiredGroup.options[0].id);
      const requiredLine = { ...f.line, sku: item.id, modifiers: [selected] };
      const originalQuote = await f.quote({ lines: [requiredLine] });
      const originalOptions = (await options()).filter((o) => o.group_id === selected.groupId);
      assert.equal(originalOptions.length, requiredGroup.options.length);
      assert.ok(originalOptions.every((o) => o.active));
      const hiddenOptions = [];
      for (const current of originalOptions)
        hiddenOptions.push(await updateOption(current, { active: false }));

      const publicItem = (await publicMenu()).items.find((i) => i.sku === item.id);
      assert.ok(publicItem.requiredGroupIds.includes(selected.groupId));
      assert.equal(
        publicItem.options.filter((o) => o.groupId === selected.groupId && o.available).length,
        0,
      );
      assert.equal(
        await scalar("select min_select from public.modifier_groups where id=$1", [
          selected.groupId,
        ]),
        1,
      );
      await assert.rejects(() => f.quote({ lines: [requiredLine] }), /modifier_unavailable/);
      await assert.rejects(
        () => f.quote({ lines: [{ ...requiredLine, modifiers: [] }] }),
        /required_choice/,
      );
      await assert.rejects(
        () => f.prepare(originalQuote.quoteId, { attemptId: id(55002) }),
        /modifier_unavailable/,
      );
      assert.equal(await scalar("select count(*)::integer from public.orders"), 1);
      assert.equal(await scalar("select count(*)::integer from public.kds_tickets"), 1);

      for (const current of hiddenOptions) await updateOption(current, { active: true });
      assert.equal((await f.quote({ lines: [requiredLine] })).grossPence, originalQuote.grossPence);
      assert.deepEqual(
        await rows("select * from public.order_items where order_id=$1", [paid.orderId]),
        paidBefore,
      );
    },
  );
  console.log(`Menu structure: ${checks} PostgreSQL behaviour groups passed.`);
} catch (error) {
  console.error(error.message, error.detail ?? "", error.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
