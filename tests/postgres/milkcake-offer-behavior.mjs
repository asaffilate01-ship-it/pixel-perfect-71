import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { asActor, createDatabase, id } from "./harness.mjs";
import { setupStaffCashOrdersFixture } from "./staff-cash-orders-fixture.mjs";
import { setGuestFixtureClock, guestTokenHash } from "./guest-checkout-fixture.mjs";
import { buildStaffCashOrdersSql } from "../../deploy/mealdeck/staff-cash-orders.mjs";
import { buildWeekendOpeningHoursSql } from "../../deploy/mealdeck/weekend-opening-hours.mjs";
import {
  buildMilkcakeOfferSql,
  buildManagedMilkcakeOfferSql,
} from "../../deploy/mealdeck/milkcake-offer.mjs";

const db = await createDatabase(process.argv.includes("--native"), { uuid_ossp });
const scalar = async (sql, values = []) => Object.values((await db.query(sql, values)).rows[0])[0];
const managed = () =>
  buildManagedMilkcakeOfferSql({ runnerOwnsTransaction: true, singleMigration: true });
const brands = ["loadd", "moktl", "skorch-burgers", "souvano", "tavo-chicken"];
const skus = brands.flatMap((brand) =>
  ["biscoff", "oreo"].map((flavour) => `${brand}-desserts-${flavour}-milkcake`),
);
const promotion = {
  id: "sunday-milk-cake-20261108",
  finalUnitPence: 99,
  regularUnitPence: 399,
  maximumQuantityPerOrder: 1,
  discountIncluded: true,
  startsAt: "2026-11-08T15:00:00Z",
  endsAt: "2026-11-08T23:00:00Z",
};
const appliedPromotion = { ...promotion, eligibleQuantity: 1, discountPence: 300 };
let checks = 0;
async function check(label, action) {
  try {
    await action();
    console.log(`PASS milkcake offer ${++checks}: ${label}`);
  } catch (error) {
    console.error(`FAIL milkcake offer: ${label}: ${error.message}`, error.where ?? "");
    throw error;
  }
}
const tableSnapshot = async () => {
  const result = {};
  for (const table of [
    "public.menu_items",
    "public.menu_item_channel_rules",
    "public.ordering_channels",
    "public.orders",
    "public.order_items",
    "public.mealdeck_ops_audit_log",
    "mealdeck_private.checkout_settings",
    "mealdeck_private.checkout_quotes",
    "mealdeck_private.stripe_orders",
    "mealdeck_private.stripe_events",
    "mealdeck_private.receipt_jobs",
  ])
    result[table] = await scalar(
      `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from ${table} t`,
    );
  return result;
};
const signatures = [
  "mealdeck_private.price_checkout_lines(uuid,uuid,jsonb)",
  "public.mealdeck_public_menu()",
  "mealdeck_private.create_checkout_quote_for_actor(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb)",
  "public.mealdeck_create_group_payment_room(uuid,uuid,uuid,text,uuid,text,jsonb,text,boolean)",
];
const securitySnapshot = () =>
  scalar(
    `select jsonb_agg(jsonb_build_object('oid',p.oid,'owner',p.proowner,'acl',p.proacl::text,
      'securityDefiner',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile)
      order by p.oid) from pg_proc p where p.oid=any($1::regprocedure[])`,
    [signatures],
  );

try {
  const f = await setupStaffCashOrdersFixture(db);
  await db.exec(buildStaffCashOrdersSql());
  await db.exec(buildWeekendOpeningHoursSql());
  await db.exec(
    await readFile(
      new URL("./milkcake-offer-installed-group-fixture.sql", import.meta.url),
      "utf8",
    ),
  );
  const cake = (quantity = 1, lineId = "line-1", sku = skus[0]) => ({
    ...f.line,
    lineId,
    sku,
    quantity,
  });
  const publicMenu = () =>
    asActor(db, null, () => scalar("select public.mealdeck_public_menu()"), "anon");

  // Existing purchased and prepared records are created with the real previous
  // source, before this operation. All provider evidence is in this disposable DB.
  const historic = await f.ordinary({ lines: [cake()] });
  await f.accept(historic.orderId);
  const oldQuote = await f.quote({ lines: [cake()] });
  const oldAttempt = f.next();
  const oldPrepared = await f.prepare(oldQuote.quoteId, { attemptId: oldAttempt });
  const staleQuote = await f.quote({ lines: [cake()] });
  const before = await tableSnapshot();
  const oldSecurity = await securitySnapshot();

  await check(
    "atomic install and rerun preserve catalogue, controls and historical purchases",
    async () => {
      assert.throws(
        () => buildManagedMilkcakeOfferSql({ runnerOwnsTransaction: true }),
        /one runner-owned/,
      );
      await db.exec("begin");
      await db.exec(managed());
      await db.exec("rollback");
      assert.deepEqual(await tableSnapshot(), before);
      assert.equal(
        await scalar("select to_regprocedure('mealdeck_private.milkcake_offer_sku(text)')"),
        null,
      );
      await db.exec(buildMilkcakeOfferSql());
      assert.deepEqual(await tableSnapshot(), before);
      assert.deepEqual(await securitySnapshot(), oldSecurity);
      await db.exec(buildMilkcakeOfferSql());
      assert.deepEqual(await tableSnapshot(), before);
      assert.deepEqual(await securitySnapshot(), oldSecurity);
    },
  );

  await check(
    "wrong database, unreviewed financial body and extra private grants fail atomically",
    async () => {
      for (const [damage, reason] of [
        ["create schema dishbee_private", /independent_profile_required/],
        [
          "create or replace function mealdeck_private.price_checkout_lines(p_tenant uuid,p_location uuid,p_selection jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin return '{}'::jsonb;end$$",
          /unreviewed_definition/,
        ],
        [
          "grant execute on function mealdeck_private.milkcake_offer_sku(text) to anon",
          /unreviewed_helper/,
        ],
      ]) {
        await db.exec("begin");
        try {
          await db.exec(damage);
          await db.exec("savepoint attempted_operation");
          await assert.rejects(() => db.exec(managed()), reason);
          await db.exec("rollback to savepoint attempted_operation");
          assert.deepEqual(await tableSnapshot(), before);
        } finally {
          await db.exec("rollback");
        }
      }
      for (const role of ["anon", "authenticated", "service_role"])
        for (const signature of [
          "mealdeck_private.milkcake_offer_sku(text)",
          "mealdeck_private.milkcake_offer_at(uuid,uuid,timestamptz)",
          "mealdeck_private.price_checkout_lines_before_milkcake(uuid,uuid,jsonb)",
          "mealdeck_private.public_menu_before_milkcake()",
        ])
          assert.equal(
            await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, signature]),
            false,
          );
    },
  );

  await check(
    "only the ten source identities and the precise Sunday server window qualify",
    async () => {
      for (const [at, eligible] of [
        [null, false],
        ["2026-11-07T16:00:00Z", false],
        ["2026-11-08T14:59:59.999Z", false],
        ["2026-11-08T15:00:00Z", true],
        ["2026-11-08T22:59:59.999Z", true],
        ["2026-11-08T23:00:00Z", false],
        ["2026-11-09T15:00:00Z", false],
        ["2027-11-08T15:00:00Z", false],
      ])
        assert.deepEqual(
          await scalar("select mealdeck_private.milkcake_offer_at($1,$2,$3::timestamptz)", [
            f.tenantId,
            f.locationId,
            at,
          ]),
          eligible ? promotion : null,
        );
      assert.equal(
        await scalar("select mealdeck_private.milkcake_offer_at($1,$2,'2026-11-08T16:00:00Z')", [
          f.tenantId,
          id(99001),
        ]),
        null,
      );
      for (const sku of skus)
        assert.equal(await scalar("select mealdeck_private.milkcake_offer_sku($1)", [sku]), true);
      for (const sku of [
        null,
        "milkcake",
        "Biscoff Milkcake",
        "new-brand-desserts-biscoff-milkcake",
        f.line.sku,
      ])
        assert.equal(await scalar("select mealdeck_private.milkcake_offer_sku($1)", [sku]), false);
    },
  );

  // Disposable clock adapter only: runtime pricing and quote functions below
  // remain the exact installed operation. Production exposes no clock override.
  const realOffer = await scalar(
    "select pg_get_functiondef('mealdeck_private.milkcake_offer_at(uuid,uuid,timestamptz)'::regprocedure)",
  );
  await db.exec(
    realOffer.replace(
      "FUNCTION mealdeck_private.milkcake_offer_at(",
      "FUNCTION mealdeck_private.milkcake_offer_at_fixture_real(",
    ),
  );
  await db.exec(
    "revoke all on function mealdeck_private.milkcake_offer_at_fixture_real(uuid,uuid,timestamptz) from public,anon,authenticated,service_role",
  );
  const setClock = async (at) => {
    assert.match(at, /^2026-11-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    await setGuestFixtureClock(db, at);
    await db.exec(`create or replace function mealdeck_private.milkcake_offer_at(p_tenant uuid,p_location uuid,p_at timestamptz)
      returns jsonb language sql stable set search_path='' as $$
      select mealdeck_private.milkcake_offer_at_fixture_real(p_tenant,p_location,timestamptz '${at}')$$`);
  };
  await check("menu eligibility starts at 3pm, preserves £3.99 and respects stock", async () => {
    await setClock("2026-11-08T14:59:59Z");
    assert.ok(
      (await publicMenu()).items
        .filter((item) => skus.includes(item.sku))
        .every((item) => item.pricePence === 399 && !item.promotion),
    );
    await assert.rejects(() => f.quote({ lines: [cake()] }), /outside_opening_hours|unavailable/);
    await setClock("2026-11-08T15:00:00Z");
    const menu = await publicMenu();
    assert.equal(menu.items.filter((item) => item.promotion).length, 10);
    for (const item of menu.items.filter((item) => skus.includes(item.sku))) {
      assert.equal(item.pricePence, 399);
      assert.deepEqual(item.promotion, promotion);
    }
    await db.exec("begin");
    try {
      await db.query(
        "update public.menu_item_channel_rules set visible=false where menu_item_id in(select id from public.menu_items where sku=$1)",
        [skus[0]],
      );
      assert.ok(!(await publicMenu()).items.some((item) => item.sku === skus[0]));
      await assert.rejects(
        () =>
          scalar("select mealdeck_private.price_checkout_lines($1,$2,$3::jsonb)", [
            f.tenantId,
            f.locationId,
            JSON.stringify([cake()]),
          ]),
        /item_unavailable/,
      );
    } finally {
      await db.exec("rollback");
    }
  });

  const assertPromoQuote = (q, gross, total) => {
    assert.equal(q.grossPence, gross);
    assert.equal(q.totalPence, total);
    assert.equal(q.discountPence, gross - total);
    const marked = q.lines.filter((line) => line.promotion);
    assert.equal(marked.length, 1);
    assert.deepEqual(marked[0].promotion, appliedPromotion);
    for (const line of q.lines.filter((entry) => skus.includes(entry.sku))) {
      assert.equal(line.base_unit_pence, 399);
      assert.equal(line.unit_pence, 399);
      assert.equal(line.line_pence, 399 * line.quantity);
    }
  };
  await check(
    "one offer per order across quantities, duplicate lines, flavours and brands",
    async () => {
      for (const [quantity, total] of [
        [1, 99],
        [2, 378],
        [3, 658],
        [20, 5406],
      ])
        assertPromoQuote(await f.quote({ lines: [cake(quantity)] }), quantity * 399, total);
      const both = [cake(), cake(1, "line-2")];
      assertPromoQuote(await f.quote({ lines: both }), 798, 378);
      const allFlavours = skus.map((sku, index) => cake(1, `line-${index + 1}`, sku));
      assertPromoQuote(await f.quote({ lines: allFlavours }), 3990, 2613);
      const reordered = await f.quote({ lines: [...allFlavours].reverse() });
      assertPromoQuote(reordered, 3990, 2613);
      assert.equal(reordered.lines.find((line) => line.promotion).sku, skus.at(-1));
    },
  );

  await check(
    "ordinary goods and real extras keep the existing rounded 30% calculation",
    async () => {
      const withExtra = {
        ...f.line,
        lineId: "line-2",
        modifiers: [
          f.mkOption("skorch-burgers-burger-add-ons", "skorch-burgers-burger-add-ons-cheese-slice"),
        ],
      };
      const normal = await f.quote({ lines: [withExtra] });
      assert.equal(normal.discountPence, Math.floor((normal.grossPence * 30 + 50) / 100));
      assert.ok(normal.lines.every((line) => !line.promotion));
      const mixed = await f.quote({ lines: [cake(2), withExtra] });
      assertPromoQuote(
        mixed,
        798 + normal.grossPence,
        99 + normal.grossPence + 399 - Math.floor(((normal.grossPence + 399) * 30 + 50) / 100),
      );
      const forged = await f.quote({
        lines: [{ ...f.line, promotion: appliedPromotion, milkCakeDiscountPence: 300 }],
      });
      assert.ok(forged.lines.every((line) => !line.promotion));
      assert.equal(forged.discountPence, Math.floor((forged.grossPence * 30 + 50) / 100));
    },
  );

  await check(
    "missing campaign configuration or inconsistent offer cannot create a marked under-discounted quote",
    async () => {
      await db.exec("begin");
      try {
        await db.exec("delete from mealdeck_private.checkout_settings");
        assert.ok((await publicMenu()).items.every((item) => !item.promotion));
        assert.equal(
          (
            await scalar("select public.mealdeck_online_checkout_status($1,$2)", [
              f.tenantId,
              f.locationId,
            ])
          ).channelOpen,
          false,
        );
      } finally {
        await db.exec("rollback");
      }
      await db.exec("begin");
      try {
        await db.exec(
          "create or replace function mealdeck_private.opening_offer(p_tenant uuid,p_location uuid) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('status','upcoming')$$",
        );
        await assert.rejects(
          () =>
            scalar(
              "select mealdeck_private.create_checkout_quote_for_actor($1,$2,$3,null,null,'pickup',null,$4::jsonb,$5,$6::jsonb)",
              [
                f.tenantId,
                f.locationId,
                f.customer,
                JSON.stringify([cake()]),
                "f".repeat(64),
                JSON.stringify(f.pack([cake()])),
              ],
            ),
          /milkcake_offer_unavailable/,
        );
      } finally {
        await db.exec("rollback");
      }
    },
  );

  await check(
    "guest, staff cash and member materialisation use the same cap and immutable amounts",
    async () => {
      const token = guestTokenHash(f.next());
      await f.guest.session(token);
      const guestQuote = await f.guest.quote(token, { lines: [cake(2)] });
      assertPromoQuote(guestQuote, 798, 378);
      const guestPrepared = await f.guest.prepare(token, guestQuote.quoteId, {
        attemptId: f.next(),
      });
      assert.equal(guestPrepared.totalPence, 378);
      const memberQuote = await f.quote({ lines: [cake()] });
      const attempt = f.next();
      const prepared = await f.prepare(memberQuote.quoteId, { attemptId: attempt });
      assert.equal(prepared.totalPence, 99);
      assert.equal(
        (await f.prepare(memberQuote.quoteId, { attemptId: attempt })).orderId,
        prepared.orderId,
      );
      assert.equal(
        await scalar("select quantity*unit_price_pence from public.order_items where order_id=$1", [
          prepared.orderId,
        ]),
        399,
      );
      const cashQuote = await f.cashQuote({ lines: [cake(3)] });
      assertPromoQuote(cashQuote, 1197, 658);
      const cash = await f.cashConfirm(cashQuote.quoteId, f.next(), { received: true });
      assert.equal(cash.order.totalPence, 658);
      assert.equal(cash.order.verifiedPaid, true);
      await assert.rejects(
        () => f.prepare(staleQuote.quoteId, { attemptId: f.next() }),
        /price_changed/,
      );
      const recovered = await f.prepare(oldQuote.quoteId, { attemptId: oldAttempt });
      assert.equal(recovered.orderId, oldPrepared.orderId);
      assert.equal(recovered.totalPence, oldPrepared.totalPence);
      assert.ok(recovered.lines.every((line) => !line.promotion));
    },
  );

  const splitPacking = (line, quantities) => ({
    version: 1,
    separateBags: quantities.length > 1,
    cutleryRequested: false,
    bags: quantities.map((quantity, index) => ({
      number: index + 1,
      allocations: [{ lineId: line.lineId, quantity }],
    })),
  });
  const shares = (orderId) =>
    scalar(
      "select jsonb_agg(amount_pence order by bag_number) from mealdeck_private.payment_shares where order_id=$1",
      [orderId],
    );
  await check(
    "by-bag sharing allocates exactly one 99p unit, including split quantities and recovery",
    async () => {
      for (const [quantities, expected] of [
        [
          [1, 1],
          [99, 279],
        ],
        [
          [1, 2],
          [99, 559],
        ],
        [
          [2, 1],
          [379, 279],
        ],
      ]) {
        const line = cake(quantities.reduce((a, b) => a + b, 0));
        const packing = splitPacking(line, quantities);
        const q = await f.quote({ lines: [line], packing });
        const g = await f.group({ quote: q, lines: [line], packing });
        assert.deepEqual(await shares(g.room.orderId), expected);
        const retry = await f.rpc("mealdeck_create_group_payment_room", g.args);
        assert.equal(retry.orderId, g.room.orderId);
        assert.deepEqual(await shares(g.room.orderId), expected);
      }
      const lines = [cake(), cake(1, "line-2", skus[1])];
      const packing = {
        version: 1,
        separateBags: true,
        cutleryRequested: false,
        bags: [
          { number: 1, allocations: [{ lineId: "line-2", quantity: 1 }] },
          { number: 2, allocations: [{ lineId: "line-1", quantity: 1 }] },
        ],
      };
      const q = await f.quote({ lines, packing });
      const g = await f.group({ quote: q, lines, packing });
      assert.deepEqual(await shares(g.room.orderId), [279, 99]);
      const equalQuote = await f.quote({ lines, packing });
      const equal = await f.group({ quote: equalQuote, lines, packing, mode: "equal" });
      assert.deepEqual(await shares(equal.room.orderId), [189, 189]);
    },
  );

  await check(
    "closing removes the promotion and stops new checkout without changing prior records",
    async () => {
      await setClock("2026-11-08T23:00:00Z");
      assert.ok((await publicMenu()).items.every((item) => !item.promotion));
      await assert.rejects(() => f.quote({ lines: [cake()] }), /outside_opening_hours|unavailable/);
      await setClock("2026-11-09T15:00:00Z");
      const q = await f.quote({ lines: [cake(2)] });
      assert.equal(q.totalPence, 798);
      assert.equal(q.discountPence, 0);
      assert.ok(q.lines.every((line) => !line.promotion));
      for (const table of [
        "public.menu_items",
        "public.menu_item_channel_rules",
        "public.ordering_channels",
        "mealdeck_private.checkout_settings",
      ])
        assert.deepEqual((await tableSnapshot())[table], before[table], table);
      assert.deepEqual(
        await scalar("select receipt from mealdeck_private.receipt_jobs where order_id=$1", [
          historic.orderId,
        ]),
        before["mealdeck_private.receipt_jobs"].find((job) => job.order_id === historic.orderId)
          .receipt,
      );
    },
  );
  console.log(`PASS ${checks} milkcake offer SQL checks`);
} catch (error) {
  console.error(error.message, error.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
