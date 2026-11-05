import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildLaunchCataloguePriceRevisionSql,
  buildManagedLaunchCataloguePriceRevisionSql,
  launchModifierDatabaseId,
} from "../../deploy/mealdeck/catalogue-import.mjs";

/** Runs only inside the caller's disposable independent-profile test database. */
export async function verifyCataloguePriceRevision(db, binding, data) {
  const baseline = JSON.parse(
    await readFile(
      new URL("../../deploy/mealdeck/catalogue/placeholder-price-baseline.json", import.meta.url),
      "utf8",
    ),
  );
  const currentItems = data.brands.flatMap((brand) =>
    brand.sections.flatMap((section) => section.items),
  );
  const currentBySku = new Map(currentItems.map((item) => [item.id, item]));
  const managed = buildManagedLaunchCataloguePriceRevisionSql({
    ...binding,
    runnerOwnsTransaction: true,
    singleMigration: true,
  });
  let checks = 0;
  const marker = async () =>
    (
      await db.query(
        "select next_value from public.mealdeck_ops_audit_log where action='catalogue.menu_revision' and tenant_id=$1",
        [binding.tenantId],
      )
    ).rows;
  const snapshot = async () => {
    const value = {};
    for (const table of [
      "menu_items",
      "modifier_groups",
      "modifier_options",
      "menu_item_modifier_groups",
      "menu_item_channel_rules",
      "mealdeck_ops_audit_log",
    ])
      value[table] = (
        await db.query(
          `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as rows from public.${table} t`,
        )
      ).rows[0].rows;
    return value;
  };
  async function rollbackCase(label, action) {
    const before = await snapshot();
    await db.exec("begin");
    try {
      await action();
      console.log("PASS catalogue revision " + ++checks + ": " + label);
    } finally {
      await db.exec("rollback");
    }
    assert.deepEqual(await snapshot(), before);
  }
  async function legacyFixture() {
    for (const previous of baseline.items) {
      const current = currentBySku.get(previous.id);
      if (current) {
        await db.query(
          "update public.menu_items set price_pence=$1,name=$2,description=$3 where tenant_id=$4 and sku=$5",
          [previous.pricePence, previous.name, previous.description, binding.tenantId, previous.id],
        );
      } else {
        const brand = (
          await db.query("select id from public.tenant_brands where tenant_id=$1 and slug=$2", [
            binding.tenantId,
            previous.brandId,
          ])
        ).rows[0].id;
        let category = (
          await db.query(
            "select id from public.menu_categories where tenant_id=$1 and brand_id=$2 and slug=$3",
            [binding.tenantId, brand, previous.sectionId],
          )
        ).rows[0]?.id;
        if (!category)
          category = (
            await db.query(
              "insert into public.menu_categories(tenant_id,brand_id,name,slug,active) values($1,$2,'Legacy cans and drinks',$3,false) returning id",
              [binding.tenantId, brand, previous.sectionId],
            )
          ).rows[0].id;
        const item = (
          await db.query(
            "insert into public.menu_items(tenant_id,brand_id,category_id,name,description,price_pence,sku,active) values($1,$2,$3,$4,$5,$6,$7,true) returning id",
            [
              binding.tenantId,
              brand,
              category,
              previous.name,
              previous.description,
              previous.pricePence,
              previous.id,
            ],
          )
        ).rows[0].id;
        await db.query(
          "insert into public.menu_item_channel_rules(tenant_id,location_id,channel_key,menu_item_id,visible) values($1,$2,'mealdeck',$3,true)",
          [binding.tenantId, binding.locationId, item],
        );
      }
    }
    for (const previousGroup of baseline.modifierGroups) {
      const groupId = launchModifierDatabaseId(binding.tenantId, "group", previousGroup.id);
      await db.query(
        "insert into public.modifier_groups(id,tenant_id,name,min_select,max_select) values($1,$2,$3,$4,$5) on conflict(id) do update set name=excluded.name,min_select=excluded.min_select,max_select=excluded.max_select",
        [
          groupId,
          binding.tenantId,
          previousGroup.name,
          previousGroup.minSelect,
          previousGroup.maxSelect,
        ],
      );
      for (const option of previousGroup.options)
        await db.query(
          "insert into public.modifier_options(id,tenant_id,group_id,name,price_delta_pence,active) values($1,$2,$3,$4,$5,false) on conflict(id) do update set name=excluded.name,price_delta_pence=excluded.price_delta_pence",
          [
            launchModifierDatabaseId(binding.tenantId, "option", option.id),
            binding.tenantId,
            groupId,
            option.label,
            option.pricePence,
          ],
        );
    }
    for (const previous of baseline.items) {
      for (const groupId of previous.optionGroupIds)
        await db.query(
          "insert into public.menu_item_modifier_groups(tenant_id,item_id,group_id) select $1,id,$2 from public.menu_items where tenant_id=$1 and sku=$3 on conflict(item_id,group_id) do nothing",
          [
            binding.tenantId,
            launchModifierDatabaseId(binding.tenantId, "group", groupId),
            previous.id,
          ],
        );
    }
  }

  assert.throws(
    () => buildLaunchCataloguePriceRevisionSql({ ...binding, force: true }),
    /unsupported revision option/,
  );
  assert.throws(
    () => buildManagedLaunchCataloguePriceRevisionSql(binding),
    /one runner-owned atomic transaction/,
  );

  await rollbackCase(
    "a fresh import receives a verified revision marker and repeat revision preserves later administrator prices",
    async () => {
      assert.equal((await marker()).length, 0);
      await db.exec(managed);
      const receipts = await marker();
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].next_value.priceRevision, data.priceRevision);
      await db.query(
        "update public.menu_items set price_pence=445 where tenant_id=$1 and sku='skorch-burgers-beef-smash-deck-the-ace'",
        [binding.tenantId],
      );
      const edited = await snapshot();
      await db.exec(managed);
      assert.deepEqual(await snapshot(), edited);
    },
  );

  await rollbackCase(
    "unexpected item and option prices and channel overrides abort every change",
    async () => {
      await legacyFixture();
      const target = (
        await db.query(
          "select id from public.menu_items where tenant_id=$1 and sku='skorch-burgers-beef-smash-deck-the-ace'",
          [binding.tenantId],
        )
      ).rows[0].id;
      const option = launchModifierDatabaseId(
        binding.tenantId,
        "option",
        "tavo-chicken-burger-add-ons-2-rashers",
      );
      for (const [setup, values, error] of [
        [
          "update public.menu_items set price_pence=1777 where id=$1",
          [target],
          /item_price_conflict/,
        ],
        [
          "update public.modifier_options set price_delta_pence=1777 where id=$1",
          [option],
          /option_price_conflict/,
        ],
        [
          "update public.menu_item_channel_rules set price_override_pence=1777 where menu_item_id=$1",
          [target],
          /override_conflict/,
        ],
      ]) {
        await db.exec("savepoint before_conflict");
        await db.query(setup, values);
        const before = await snapshot();
        await db.exec("savepoint guarded_revision");
        await assert.rejects(() => db.exec(managed), error);
        await db.exec("rollback to savepoint guarded_revision");
        assert.deepEqual(await snapshot(), before);
        await db.exec("rollback to savepoint before_conflict");
      }
    },
  );

  await rollbackCase(
    "the reviewed revision replaces expected placeholders, corrects source text, retires old drinks and preserves unrelated edits",
    async () => {
      await legacyFixture();
      await db.query(
        "update public.menu_items set name='Administrator display name' where tenant_id=$1 and sku='loadd-loaded-fries-queen-of-hearts'",
        [binding.tenantId],
      );
      await db.query(
        "update public.menu_item_channel_rules set price_override_pence=2000 where tenant_id=$1 and menu_item_id=(select id from public.menu_items where tenant_id=$1 and sku='skorch-burgers-beef-smash-deck-the-ace')",
        [binding.tenantId],
      );
      await db.exec(managed);
      const state = await snapshot();
      for (const item of currentItems) {
        const saved = state.menu_items.find((row) => row.sku === item.id);
        assert.equal(saved.price_pence, item.pricePence, item.id);
        assert.equal(saved.description, item.importDescription, item.id);
      }
      assert.equal(
        state.menu_items.find((row) => row.sku === "loadd-loaded-fries-queen-of-hearts").name,
        "Administrator display name",
      );
      for (const group of data.modifierGroups) {
        for (const option of group.options)
          assert.equal(
            state.modifier_options.find(
              (row) => row.id === launchModifierDatabaseId(binding.tenantId, "option", option.id),
            ).price_delta_pence,
            option.pricePence,
            option.id,
          );
      }
      assert.ok(
        state.modifier_options
          .filter((option) => /^milkshake/i.test(option.name))
          .every((option) => option.active === false),
      );
      for (const previous of baseline.items.filter((item) => !currentBySku.has(item.id))) {
        const saved = state.menu_items.find((item) => item.sku === previous.id);
        assert.equal(saved.active, false);
        assert.equal(
          state.menu_item_channel_rules.find((rule) => rule.menu_item_id === saved.id).visible,
          false,
        );
      }
      const ace = state.menu_items.find(
        (item) => item.sku === "skorch-burgers-beef-smash-deck-the-ace",
      );
      assert.equal(
        state.menu_item_channel_rules.find((rule) => rule.menu_item_id === ace.id)
          .price_override_pence,
        399,
      );
      const grilled = state.menu_items.find(
        (item) => item.sku === "tavo-chicken-grilled-chicken-wings-grilled-chicken-wings",
      );
      assert.equal(
        state.menu_item_modifier_groups.some(
          (link) =>
            link.item_id === grilled.id &&
            link.group_id ===
              launchModifierDatabaseId(binding.tenantId, "group", "tavo-chicken-flavour"),
        ),
        false,
      );
      const chops = state.menu_items.find((item) => item.sku === "souvano-lamb-chops-lamb-chops");
      assert.equal(
        state.menu_item_modifier_groups.some(
          (link) =>
            link.item_id === chops.id &&
            link.group_id ===
              launchModifierDatabaseId(binding.tenantId, "group", "souvano-make-it-a-meal"),
        ),
        false,
      );
      assert.equal((await marker())[0].next_value.priceRevision, data.priceRevision);
      for (const item of currentItems.filter((item) => item.priceVariants)) {
        for (const variant of item.priceVariants) {
          const delta = state.modifier_options.find(
            (option) =>
              option.id === launchModifierDatabaseId(binding.tenantId, "option", variant.optionId),
          ).price_delta_pence;
          assert.equal(
            state.menu_items.find((row) => row.sku === item.id).price_pence + delta,
            variant.pricePence,
          );
        }
      }
    },
  );

  await rollbackCase(
    "a late error rolls back revision audit and all changed prices together",
    async () => {
      await legacyFixture();
      const before = await snapshot();
      await db.exec("savepoint before_revision");
      await db.exec(managed);
      await assert.rejects(
        () => db.exec("do $$ begin raise exception 'revision_late_failure'; end $$"),
        /revision_late_failure/,
      );
      await db.exec("rollback to savepoint before_revision");
      assert.deepEqual(await snapshot(), before);
    },
  );
}
