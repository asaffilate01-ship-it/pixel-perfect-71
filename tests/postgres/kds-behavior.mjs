import assert from "node:assert/strict";
import {
  asActor,
  auditCount,
  board,
  bootstrap,
  callbackSnapshot,
  createDatabase,
  fixture,
  id,
  installFixtureAuthority,
  restoreFixtureAuthority,
  seedOrder,
  states,
  transitionOrder,
  transitionPass,
} from "./harness.mjs";

const db = await createDatabase(process.argv.includes("--native"));
let passed = 0;
let checks = 0;

async function test(label, run) {
  checks++;
  try {
    await run();
    passed++;
    console.log(`PASS ${checks}: ${label}`);
  } catch (error) {
    console.error(`FAIL ${checks}: ${label}`);
    throw error;
  }
}

async function rejects(action, pattern = /forbidden|denied|scope|permission|location/i) {
  await assert.rejects(action, (error) => {
    assert.match(error.message, pattern);
    return true;
  });
}

async function card(order, actor = fixture.kitchen) {
  return (await board(db, actor)).orders.find((candidate) => candidate.order_id === order);
}

async function noChange(order, action, pattern) {
  const before = await states(db, order);
  await rejects(action, pattern);
  assert.deepEqual(await states(db, order), before);
}

try {
  const migration = await bootstrap(db);
  console.log(`Migration: ${migration}`);

  await test("anonymous, customer, viewer, disabled staff and foreign-location users cannot read the board", async () => {
    await rejects(() =>
      asActor(
        db,
        null,
        () =>
          db.query("select public.mealdeck_ops_kds_board($1,$2)", [
            fixture.tenant,
            fixture.location,
          ]),
        "anon",
      ),
    );
    for (const actor of [
      fixture.customer,
      fixture.viewer,
      fixture.disabledKitchen,
      fixture.foreignKitchen,
      fixture.otherKitchen,
      fixture.deniedRead,
    ]) {
      await rejects(() => board(db, actor));
    }
    await rejects(() => board(db, fixture.owner, fixture.tenant, fixture.foreignLocation));
    await rejects(() => board(db, fixture.kitchen, fixture.foreignTenant, fixture.location));
  });

  await test("missing immutable release authority produces setup-required, never a live empty kitchen", async () => {
    const snapshot = await board(db);
    assert.equal(snapshot.readiness, "setup_required");
    assert.deepEqual(snapshot.orders, []);
  });

  await installFixtureAuthority(db);
  const happy = await seedOrder(db, 1001);

  await test("one master order contains every item from all five brands with canonical modifiers and notes", async () => {
    const snapshot = await board(db);
    assert.equal(snapshot.readiness, "ready");
    assert.equal(snapshot.orders.length, 1);
    const order = snapshot.orders[0];
    assert.equal(order.order_id, happy.order);
    assert.equal(order.routing_complete, true);
    assert.equal(order.preparation_status, "queued");
    assert.match(order.version, /^[0-9a-f]{32}$/);
    const items = order.tickets.flatMap((ticket) => ticket.items);
    assert.equal(items.length, 5);
    assert.deepEqual(
      new Set(items.map((item) => item.brand_name)),
      new Set(["Skorch", "Load'd", "Moktl", "Souvano", "Tavo"]),
    );
    assert.ok(items.every((item) => item.modifiers.includes("No onion")));
    assert.ok(items.every((item) => item.notes === "ITEM NOTE: no sauce"));
  });

  await test("kitchen projection omits customer contact, address, payment references and prices", async () => {
    const raw = JSON.stringify(await board(db));
    for (const value of [
      "DO NOT EXPOSE CUSTOMER",
      "DO NOT EXPOSE PHONE",
      "DO NOT EXPOSE ADDRESS",
      "DO NOT EXPOSE PAYMENT REFERENCE",
      "priceDeltaPence",
      "unit_price_pence",
      "total_pence",
      "customer_phone",
      "delivery_address",
    ]) {
      assert.ok(!raw.includes(value), `Unexpected field/value: ${value}`);
    }
    assert.ok(raw.includes("ITEM NOTE: no sauce"));
  });

  await test("long food instructions and modifier labels preserve their full tails on the complete card and station lines", async () => {
    const entry = await seedOrder(db, 1080, { items: [51] });
    const orderNotes = "Order instructions. ".repeat(45) + "END: keep cold drinks separate.";
    const itemNotes = "Preparation instructions. ".repeat(40) + "END: omit sauce from this dish.";
    const modifierName = "Requested preparation detail. ".repeat(12) + "END: no onion.";
    const modifierLabel =
      "Additional preparation detail. ".repeat(12) + "END: dressing separately.";
    const modifiers = [{ name: modifierName }, { label: modifierLabel }];
    assert.ok(orderNotes.length > 500 && itemNotes.length > 500);
    assert.ok(modifierName.length > 200 && modifierLabel.length > 200);
    await db.query("update public.orders set notes=$2 where id=$1", [entry.order, orderNotes]);
    await db.query("update public.order_items set notes=$2,modifiers=$3::jsonb where id=$1", [
      entry.items[0],
      itemNotes,
      JSON.stringify(modifiers),
    ]);
    const current = await card(entry.order);
    assert.equal(current.notes, orderNotes);
    assert.equal(current.items[0].notes, itemNotes);
    assert.deepEqual(current.items[0].modifiers, [modifierName, modifierLabel]);
    assert.equal(current.tickets[0].items[0].notes, itemNotes);
    assert.deepEqual(current.tickets[0].items[0].modifiers, [modifierName, modifierLabel]);
    await transitionOrder(db, entry.order, current.version, "preparing");
    const prepared = await card(entry.order);
    assert.equal(prepared.notes, orderNotes);
    assert.equal(prepared.items[0].notes, itemNotes);
    assert.deepEqual(prepared.items[0].modifiers, [modifierName, modifierLabel]);
  });

  await test("malformed or excessive food instructions reject the board and preparation action without empty or partial success", async () => {
    const entry = await seedOrder(db, 1081, { items: [51] });
    const current = await card(entry.order);
    const original = (
      await db.query("select * from public.order_items where id=$1", [entry.items[0]])
    ).rows[0];
    const orderNote = (await db.query("select notes from public.orders where id=$1", [entry.order]))
      .rows[0].notes;
    const cases = [
      {
        table: "order_items",
        column: "modifiers",
        value: JSON.stringify({ name: "not an array" }),
        json: true,
      },
      { table: "order_items", column: "modifiers", value: "null", json: true },
      { table: "order_items", column: "modifiers", value: JSON.stringify([null]), json: true },
      {
        table: "order_items",
        column: "modifiers",
        value: JSON.stringify(["not an object"]),
        json: true,
      },
      {
        table: "order_items",
        column: "modifiers",
        value: JSON.stringify([{ name: 42 }]),
        json: true,
      },
      {
        table: "order_items",
        column: "modifiers",
        value: JSON.stringify([{ label: "" }]),
        json: true,
      },
      {
        table: "order_items",
        column: "modifiers",
        value: JSON.stringify([{ name: "   " }]),
        json: true,
      },
      {
        table: "order_items",
        column: "modifiers",
        value: JSON.stringify([{ name: "M".repeat(1001) }]),
        json: true,
      },
      {
        table: "order_items",
        column: "modifiers",
        value: JSON.stringify(Array.from({ length: 101 }, () => ({ name: "Extra" }))),
        json: true,
      },
      { table: "order_items", column: "notes", value: "N".repeat(20001) },
      { table: "order_items", column: "item_name", value: "D".repeat(1001) },
      { table: "order_items", column: "item_name", value: "   " },
      { table: "orders", column: "notes", value: "N".repeat(20001) },
    ];
    for (const invalid of cases) {
      const row = invalid.table === "orders" ? entry.order : entry.items[0];
      try {
        // Table/column names are fixed test cases above; all data is parameterized.
        await db.query(
          `update public.${invalid.table} set ${invalid.column}=$2${invalid.json ? "::jsonb" : ""} where id=$1`,
          [row, invalid.value],
        );
        await rejects(() => board(db), /mealdeck_kds_instructions_unavailable/);
        await noChange(
          entry.order,
          () => transitionOrder(db, entry.order, current.version, "preparing"),
          /mealdeck_kds_instructions_unavailable/,
        );
      } finally {
        await db.query("update public.orders set notes=$2 where id=$1", [entry.order, orderNote]);
        await db.query(
          "update public.order_items set notes=$2,item_name=$3,modifiers=$4::jsonb where id=$1",
          [entry.items[0], original.notes, original.item_name, JSON.stringify(original.modifiers)],
        );
      }
    }
    const restored = await card(entry.order);
    assert.equal(restored.preparation_status, "queued");
    assert.equal(restored.items.length, 1);
    assert.equal(await auditCount(db, entry.order), 0);
  });

  await test("unreadable instructions discovered after readiness also prevent packing and its audit", async () => {
    const entry = await seedOrder(db, 1082, { items: [51] });
    let current = await card(entry.order);
    await transitionOrder(db, entry.order, current.version, "preparing");
    current = await card(entry.order);
    await transitionOrder(db, entry.order, current.version, "ready");
    current = await card(entry.order);
    const original = (
      await db.query("select modifiers from public.order_items where id=$1", [entry.items[0]])
    ).rows[0].modifiers;
    try {
      await db.query("update public.order_items set modifiers=$2::jsonb where id=$1", [
        entry.items[0],
        JSON.stringify([{ name: { unreadable: "instruction" } }]),
      ]);
      await rejects(() => board(db), /mealdeck_kds_instructions_unavailable/);
      await noChange(
        entry.order,
        () => transitionPass(db, entry.order, current.pass.version, "packing"),
        /mealdeck_kds_instructions_unavailable/,
      );
    } finally {
      await db.query("update public.order_items set modifiers=$2::jsonb where id=$1", [
        entry.items[0],
        JSON.stringify(original),
      ]);
    }
    assert.equal((await card(entry.order)).pass.status, "ready_to_pack");
    assert.equal(await auditCount(db, entry.order), 2);
  });

  await test("staff cannot read or alter the release evidence, audit table, canonical orders or private authority", async () => {
    for (const sql of [
      "select * from kds_test_private.release_evidence",
      "select * from public.mealdeck_ops_audit_log",
      "select * from public.orders",
      `select dishbee_private.mealdeck_kds_release_authority('${happy.order}')`,
      `update public.orders set payment_status='paid' where id='${happy.order}'`,
      `delete from public.mealdeck_ops_audit_log where entity_id='${happy.order}'`,
    ]) {
      await rejects(() => asActor(db, fixture.kitchen, () => db.exec(sql)));
    }
    assert.equal(await auditCount(db, happy.order), 0);
  });

  await test("read-only finance and explicit permission denial cannot advance preparation", async () => {
    const current = await card(happy.order);
    for (const actor of [
      fixture.finance,
      fixture.deniedWrite,
      fixture.deniedRead,
      fixture.viewer,
      fixture.customer,
      fixture.foreignKitchen,
      fixture.otherKitchen,
      fixture.disabledKitchen,
    ]) {
      await noChange(happy.order, () =>
        transitionOrder(db, happy.order, current.version, "preparing", actor),
      );
    }
    const readOnly = await board(db, fixture.finance);
    assert.ok(readOnly.orders.some((order) => order.order_id === happy.order));
  });

  let queuedVersion;
  await test("Start order advances all brands and station lines atomically with a single audit event", async () => {
    queuedVersion = (await card(happy.order)).version;
    const response = await transitionOrder(db, happy.order, queuedVersion, "preparing");
    assert.equal(response.ok, true);
    assert.equal(response.replayed, false);
    const actual = await states(db, happy.order);
    assert.equal(actual.orders[0].status, "preparing");
    assert.ok(actual.tickets.every((ticket) => ticket.status === "preparing"));
    assert.ok(actual.lines.every((line) => line.status === "preparing"));
    assert.ok(actual.tickets.every((ticket) => ticket.started_at !== null));
    assert.equal(actual.audit, 1);
  });

  await test("duplicate Start order is idempotent and does not add an audit event", async () => {
    const before = await states(db, happy.order);
    const response = await transitionOrder(db, happy.order, queuedVersion, "preparing");
    assert.equal(response.ok, true);
    assert.equal(response.replayed, true);
    assert.deepEqual(await states(db, happy.order), before);
  });

  await test("an old card version cannot advance to the next preparation state", async () => {
    await noChange(
      happy.order,
      () => transitionOrder(db, happy.order, queuedVersion, "ready"),
      /conflict|stale|version/i,
    );
  });

  await test("the pass cannot pack an order while any brand is preparing", async () => {
    const order = await card(happy.order);
    await noChange(
      happy.order,
      () => transitionPass(db, happy.order, order.pass?.version ?? order.version, "packing"),
      /ready|state|pass|conflict/i,
    );
  });

  await test("Mark ready completes every brand and makes exactly one central pass record ready", async () => {
    const current = await card(happy.order);
    const response = await transitionOrder(db, happy.order, current.version, "ready");
    assert.equal(response.ok, true);
    const actual = await states(db, happy.order);
    assert.equal(actual.orders[0].status, "ready");
    assert.ok(actual.tickets.every((ticket) => ticket.status === "ready"));
    assert.ok(actual.lines.every((line) => line.status === "ready"));
    assert.deepEqual(actual.pass, [{ status: "ready_to_pack" }]);
    assert.equal(actual.audit, 2);
    const after = await card(happy.order);
    assert.equal(after.preparation_status, "ready");
    assert.equal(after.pass.status, "ready_to_pack");
  });

  await test("the pass enforces packing then sealing; it cannot dispatch or mark delivered", async () => {
    let current = await card(happy.order);
    await noChange(
      happy.order,
      () => transitionPass(db, happy.order, current.pass.version, "sealed"),
      /state|transition|packing|pass/i,
    );
    await transitionPass(db, happy.order, current.pass.version, "packing");
    current = await card(happy.order);
    assert.equal(current.pass.status, "packing");
    const packingVersion = current.pass.version;
    await transitionPass(db, happy.order, packingVersion, "sealed");
    const actual = await states(db, happy.order);
    assert.deepEqual(actual.pass, [{ status: "sealed" }]);
    assert.equal(actual.orders[0].status, "ready");
    assert.equal(actual.audit, 4);
    for (const status of ["ready_for_handoff", "handed_off", "delivered", "cancelled"]) {
      await noChange(
        happy.order,
        () => transitionPass(db, happy.order, packingVersion, status),
        /invalid|transition|status/i,
      );
    }
  });

  await test("authority execution grants, volatility or wrong return type fail closed", async () => {
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      await db.exec(
        `grant execute on function dishbee_private.mealdeck_kds_release_authority(uuid) to ${role}`,
      );
      const snapshot = await board(db);
      assert.equal(snapshot.readiness, "setup_required", `Unsafe authority grant to ${role}`);
      assert.equal(snapshot.orders.length, 0);
      await db.exec(
        `revoke all on function dishbee_private.mealdeck_kds_release_authority(uuid) from ${role}`,
      );
    }
    await db.exec("alter function dishbee_private.mealdeck_kds_release_authority(uuid) volatile");
    assert.equal((await board(db)).readiness, "setup_required");
    await db.exec("alter function dishbee_private.mealdeck_kds_release_authority(uuid) stable");
    await db.exec("drop function dishbee_private.mealdeck_kds_release_authority(uuid)");
    await db.exec(
      "create function dishbee_private.mealdeck_kds_release_authority(uuid) returns boolean language sql stable as $$ select true $$",
    );
    await db.exec(
      "revoke all on function dishbee_private.mealdeck_kds_release_authority(uuid) from public,anon,authenticated,service_role",
    );
    assert.equal((await board(db)).readiness, "setup_required");
    await db.exec("drop function dishbee_private.mealdeck_kds_release_authority(uuid)");
    await restoreFixtureAuthority(db);
    assert.equal((await board(db)).readiness, "ready");
  });

  await test("pending, refunded, cancelled, tab, unverified and other-merchant orders never enter the board", async () => {
    const cases = [
      { status: "payment_pending", paymentStatus: "pending", paidAt: null },
      { paidAt: null },
      { paymentStatus: "pending" },
      { paymentStatus: "refunded" },
      { paymentStatus: "partially_refunded" },
      { status: "cancelled" },
      { status: "refunded" },
      { status: "authorised_tab" },
      { authority: false },
      { source: "cafe1" },
      { source: "epos" },
    ];
    for (let index = 0; index < cases.length; index++) {
      const entry = await seedOrder(db, 1020 + index, { items: [51], ...cases[index] });
      assert.equal(await card(entry.order), undefined, JSON.stringify(cases[index]));
      await noChange(
        entry.order,
        () => transitionOrder(db, entry.order, "0".repeat(32), "preparing"),
        /release|eligible|payment|order|not_found/i,
      );
    }
  });

  await test("malformed, false, wrong-scope and invalid-time release attestations cannot authorize an order", async () => {
    const entry = await seedOrder(db, 1040, { items: [51] });
    const original = (
      await db.query("select payload from kds_test_private.release_evidence where order_id=$1", [
        entry.order,
      ])
    ).rows[0].payload;
    const mutations = [
      null,
      {},
      { ...original, schema_version: 2 },
      { ...original, eligible: false },
      { ...original, eligible: "true" },
      { ...original, tenant_id: fixture.foreignTenant },
      { ...original, location_id: fixture.otherLocation },
      { ...original, order_id: happy.order },
      { ...original, source: "cafe1" },
      { ...original, release_id: "not-a-uuid" },
      { ...original, verified_at: "not-a-date" },
      { ...original, verified_at: null },
    ];
    for (const payload of mutations) {
      await db.query(
        "update kds_test_private.release_evidence set payload=$2::jsonb where order_id=$1",
        [entry.order, JSON.stringify(payload)],
      );
      assert.equal(await card(entry.order), undefined, JSON.stringify(payload));
      await noChange(
        entry.order,
        () => transitionOrder(db, entry.order, "0".repeat(32), "preparing"),
        /release|eligible|payment|order|not_found/i,
      );
    }
  });

  await test("revoking staff access is enforced on the next read and write despite an old card version", async () => {
    const entry = await seedOrder(db, 1050, { items: [51] });
    const current = await card(entry.order);
    await db.query("update public.mealdeck_ops_staff_access set enabled=false where user_id=$1", [
      fixture.kitchen,
    ]);
    await rejects(() => board(db));
    await noChange(entry.order, () =>
      transitionOrder(db, entry.order, current.version, "preparing"),
    );
    await db.query("update public.mealdeck_ops_staff_access set enabled=true where user_id=$1", [
      fixture.kitchen,
    ]);
  });

  await test("changing tenant/location arguments cannot move an authorized card to another kitchen", async () => {
    const entry = await seedOrder(db, 1051, { items: [51] });
    const current = await card(entry.order);
    await noChange(
      entry.order,
      () =>
        transitionOrder(
          db,
          entry.order,
          current.version,
          "preparing",
          fixture.otherKitchen,
          fixture.tenant,
          fixture.otherLocation,
        ),
      /scope|location|not_found|order|forbidden/i,
    );
    await noChange(
      entry.order,
      () =>
        transitionOrder(
          db,
          entry.order,
          current.version,
          "preparing",
          fixture.foreignKitchen,
          fixture.foreignTenant,
          fixture.foreignLocation,
        ),
      /scope|location|not_found|order|forbidden/i,
    );
  });

  await test("missing or corrupt station routing blocks the whole order without advancing other brands", async () => {
    const entry = await seedOrder(db, 1060);
    const route = (
      await db.query("select * from public.menu_item_station_routes where item_id=$1", [id(53)])
    ).rows[0];
    await db.query("delete from public.menu_item_station_routes where item_id=$1", [id(53)]);
    let current = await card(entry.order);
    assert.equal(current.routing_complete, false);
    assert.equal(current.blocked_reason, "routing_incomplete");
    assert.equal(
      current.items.length,
      5,
      "All purchased brands remain visible when one route is missing",
    );
    assert.ok(current.items.some((item) => item.brand_name === "Moktl"));
    await noChange(
      entry.order,
      () => transitionOrder(db, entry.order, current.version, "preparing"),
      /routing|route/i,
    );
    await db.query(
      "insert into public.menu_item_station_routes(tenant_id,location_id,item_id,station_id,prep_kind,prep_seconds) values($1,$2,$3,$4,$5,$6)",
      [
        route.tenant_id,
        route.location_id,
        route.item_id,
        route.station_id,
        route.prep_kind,
        route.prep_seconds,
      ],
    );
    const missingLine = (
      await db.query("select * from public.kds_ticket_items where order_item_id=$1", [
        entry.items[0],
      ])
    ).rows[0];
    await db.query("delete from public.kds_ticket_items where id=$1", [missingLine.id]);
    current = await card(entry.order);
    assert.equal(current.routing_complete, false);
    await noChange(
      entry.order,
      () => transitionOrder(db, entry.order, current.version, "preparing"),
      /routing|route/i,
    );
  });

  await test("quantity mismatch and an empty order cannot become ready or packable", async () => {
    const entry = await seedOrder(db, 1061, { items: [51] });
    await db.query("update public.kds_ticket_items set quantity=2 where order_item_id=$1", [
      entry.items[0],
    ]);
    const current = await card(entry.order);
    assert.equal(current.routing_complete, false);
    await noChange(
      entry.order,
      () => transitionOrder(db, entry.order, current.version, "preparing"),
      /routing|route/i,
    );
    const empty = await seedOrder(db, 1062, {
      items: [],
      status: "ready",
      passStatus: "ready_to_pack",
    });
    const emptyCard = await card(empty.order);
    assert.equal(emptyCard.routing_complete, false);
    await noChange(
      empty.order,
      () => transitionPass(db, empty.order, emptyCard.pass.version, "packing"),
      /routing|route|ready/i,
    );
  });

  await test("a stale card after one brand changes cannot partially advance the other brands", async () => {
    const entry = await seedOrder(db, 1063);
    const oldCard = await card(entry.order);
    await db.query(
      "update public.kds_ticket_items set status='preparing',started_at=now() where order_item_id=$1",
      [entry.items[0]],
    );
    await noChange(
      entry.order,
      () => transitionOrder(db, entry.order, oldCard.version, "ready"),
      /conflict|stale|version/i,
    );
  });

  await test("a late database failure on one brand rolls back the complete preparation action and its audit", async () => {
    const entry = await seedOrder(db, 1064);
    let current = await card(entry.order);
    await transitionOrder(db, entry.order, current.version, "preparing");
    current = await card(entry.order);
    const before = await states(db, entry.order);
    await db.exec(`
      create function kds_test_private.reject_one_brand() returns trigger
      language plpgsql as $$ begin
        if new.order_item_id='${entry.items.at(-1)}'::uuid and new.status='ready' then
          raise exception 'test_final_brand_write_failure';
        end if;
        return new;
      end $$;
      create trigger kds_test_reject_final_brand before update on public.kds_ticket_items
        for each row execute function kds_test_private.reject_one_brand();
    `);
    try {
      await rejects(
        () => transitionOrder(db, entry.order, current.version, "ready"),
        /test_final_brand_write_failure/,
      );
      assert.deepEqual(await states(db, entry.order), before);
    } finally {
      await db.exec(
        "drop trigger kds_test_reject_final_brand on public.kds_ticket_items; drop function kds_test_private.reject_one_brand()",
      );
    }
  });

  await test("group orders remain held until every included share and required host amount is paid", async () => {
    const entry = await seedOrder(db, 1070, { items: [51] });
    const room = id(2070);
    const member = id(3070);
    await db.query(
      "insert into public.group_order_rooms(id,tenant_id,location_id,payment_mode,delivery_pence,master_order_id,status) values($1,$2,$3,'separate',0,$4,'submitted')",
      [room, fixture.tenant, fixture.location, entry.order],
    );
    await db.query(
      "insert into public.group_order_participants(id,room_id,tenant_id,display_name,payment_status,cart_subtotal_pence) values($1,$2,$3,'Fixture packing label','pending',800)",
      [member, room, fixture.tenant],
    );
    await db.query("update public.orders set group_order_room_id=$2 where id=$1", [
      entry.order,
      room,
    ]);
    assert.equal(await card(entry.order), undefined);
    await noChange(
      entry.order,
      () => transitionOrder(db, entry.order, "0".repeat(32), "preparing"),
      /group|release|eligible|payment|order/i,
    );
    await db.query("update public.group_order_participants set payment_status='paid' where id=$1", [
      member,
    ]);
    assert.equal((await card(entry.order)).group_order, true);
    await db.query(
      "update public.group_order_participants set payment_status='host_cover' where id=$1",
      [member],
    );
    assert.equal(await card(entry.order), undefined);
    await db.query(
      "insert into public.group_order_payment_attempts(room_id,tenant_id,payer_scope,amount_pence,status) values($1,$2,'host_cover',800,'paid')",
      [room, fixture.tenant],
    );
    assert.ok(await card(entry.order));
    await db.query("update public.group_order_rooms set delivery_pence=200 where id=$1", [room]);
    assert.equal(await card(entry.order), undefined);
    await db.query(
      "update public.group_order_payment_attempts set amount_pence=1000 where room_id=$1",
      [room],
    );
    assert.ok(await card(entry.order));
    await db.query("update public.group_order_rooms set status='open' where id=$1", [room]);
    assert.equal(await card(entry.order), undefined);
  });

  await test("audits contain the verified actor and scope, and denied writes never add success history", async () => {
    const rows = (
      await db.query("select * from public.mealdeck_ops_audit_log where entity_id=$1 order by id", [
        happy.order,
      ])
    ).rows;
    assert.equal(rows.length, 4);
    assert.ok(
      rows.every(
        (row) =>
          row.actor_id === fixture.kitchen &&
          row.tenant_id === fixture.tenant &&
          row.location_id === fixture.location,
      ),
    );
    assert.ok(!JSON.stringify(rows).includes("DO NOT EXPOSE"));
    const history = await asActor(db, fixture.owner, () =>
      db.query("select * from public.mealdeck_ops_audit_history($1,100)", [fixture.tenant]),
    );
    assert.ok(history.rows.length >= 4);
    await rejects(() =>
      asActor(db, fixture.kitchen, () =>
        db.query("select * from public.mealdeck_ops_audit_history($1,100)", [fixture.tenant]),
      ),
    );
  });

  await test("an oversized kitchen queue reports the remaining order count instead of silently hiding work", async () => {
    await db.query(
      "insert into public.kitchen_stations(id,tenant_id,location_id,name,code) values($1,$2,$3,'Second kitchen station','HOT')",
      [id(71), fixture.tenant, fixture.otherLocation],
    );
    await db.query(
      "insert into public.menu_item_station_routes(tenant_id,location_id,item_id,station_id) values($1,$2,$3,$4)",
      [fixture.tenant, fixture.otherLocation, id(51), id(71)],
    );
    await db.query(
      `
      insert into public.orders(id,tenant_id,location_id,status,fulfilment,payment_status,source,paid_at,created_at,handoff_code)
      select ('00000000-0000-4000-8000-'||lpad(to_hex(30000+n),12,'0'))::uuid,
        $1,$2,'accepted','delivery','paid','mealdeck',now(),
        now()-interval '2 hours'+n*interval '1 second','1234'
      from generate_series(1,251) n
    `,
      [fixture.tenant, fixture.otherLocation],
    );
    await db.query(
      `
      insert into public.order_items(id,tenant_id,order_id,brand_id,menu_item_id,item_name,quantity,unit_price_pence)
      select ('00000000-0000-4000-8000-'||lpad(to_hex(40000+n),12,'0'))::uuid,$1,
        ('00000000-0000-4000-8000-'||lpad(to_hex(30000+n),12,'0'))::uuid,$2,$3,'Queue fixture dish',1,800
      from generate_series(1,251) n
    `,
      [fixture.tenant, id(31), id(51)],
    );
    await db.query(
      `
      insert into public.kds_tickets(id,tenant_id,order_id,station_id)
      select ('00000000-0000-4000-8000-'||lpad(to_hex(50000+n),12,'0'))::uuid,$1,
        ('00000000-0000-4000-8000-'||lpad(to_hex(30000+n),12,'0'))::uuid,$2
      from generate_series(1,251) n
    `,
      [fixture.tenant, id(71)],
    );
    await db.query(
      `
      insert into public.kds_ticket_items(id,tenant_id,ticket_id,order_item_id,station_id,quantity)
      select ('00000000-0000-4000-8000-'||lpad(to_hex(60000+n),12,'0'))::uuid,$1,
        ('00000000-0000-4000-8000-'||lpad(to_hex(50000+n),12,'0'))::uuid,
        ('00000000-0000-4000-8000-'||lpad(to_hex(40000+n),12,'0'))::uuid,$2,1
      from generate_series(1,251) n
    `,
      [fixture.tenant, id(71)],
    );
    await db.query(
      `
      insert into kds_test_private.release_evidence(order_id,payload)
      select id,jsonb_build_object(
        'schema_version',1,'order_id',id,'tenant_id',tenant_id,'location_id',location_id,
        'source','mealdeck','release_id',gen_random_uuid(),'verified_at',now(),'eligible',true
      ) from public.orders where location_id=$1
    `,
      [fixture.otherLocation],
    );
    const snapshot = await board(db, fixture.otherKitchen, fixture.tenant, fixture.otherLocation);
    assert.equal(snapshot.orders.length, 250);
    assert.equal(snapshot.remaining_order_count, 1);
    assert.equal(new Set(snapshot.orders.map((order) => order.order_id)).size, 250);
    assert.equal(snapshot.orders[0].order_id, id(30001));
    assert.equal(snapshot.orders.at(-1).order_id, id(30250));
    assert.ok(snapshot.orders.every((order) => order.routing_complete));
  });

  await test("canonical payment, release, legacy station and dispatch callbacks keep their original definitions and grants", async () => {
    assert.deepEqual(await callbackSnapshot(db), db.canonicalCallbackSnapshot);
    const publicFunctions = (
      await db.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'mealdeck_ops_kds_%'
    `)
    ).rows.map((row) => row.proname);
    assert.ok(
      !publicFunctions.some((name) => /ticket|station/.test(name)),
      "No individual station mutation bypasses the whole-order action",
    );
  });

  if (db.native) {
    const { concurrencyTests } = await import("./kds-concurrency.mjs");
    await concurrencyTests(db, test);
  } else {
    console.log(
      "NOT RUN: native two-session locking tests (PGlite has one connection). Use npm run test:postgres in a fresh local PostgreSQL 17 database.",
    );
  }
  console.log(`KDS PostgreSQL behavior: ${passed}/${checks} checks passed.`);
} catch (error) {
  console.error({ message: error.message, code: error.code, detail: error.detail });
  process.exitCode = 1;
} finally {
  await db.close();
}
