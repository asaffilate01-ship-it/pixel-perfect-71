import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { asActor, createDatabase, id } from "./harness.mjs";
import { setupStaffCashOrdersFixture } from "./staff-cash-orders-fixture.mjs";
import { guestTokenHash, setGuestFixtureClock } from "./guest-checkout-fixture.mjs";
import { buildStaffCashOrdersSql } from "../../deploy/mealdeck/staff-cash-orders.mjs";
import { buildMealComponentsSql } from "../../deploy/mealdeck/meal-components.mjs";
import { buildLocalDriverDeliverySql } from "../../deploy/mealdeck/local-driver-delivery.mjs";
import { buildCustomerPushSql } from "../../deploy/mealdeck/customer-push.mjs";

// The harness refuses remote/nonempty databases. No real provider or live orders.
const db = await createDatabase(process.argv.includes("--native"), { uuid_ossp });
const scalar = async (sql, values = []) => Object.values((await db.query(sql, values)).rows[0])[0];
let passed = 0;
async function check(name, action) {
  await action();
  console.log(`PASS own-driver ${++passed}: ${name}`);
}
try {
  const f = await setupStaffCashOrdersFixture(db);
  await db.exec(buildStaffCashOrdersSql());
  await db.exec(buildMealComponentsSql());
  await db.exec(buildLocalDriverDeliverySql());
  await db.exec(readFileSync(
    new URL("../../deploy/mealdeck/post-install-migrations/20261108154500_mealdeck_driver_pwa_dispatch.sql",import.meta.url),"utf8"
  ));
  await db.exec(readFileSync(
    new URL("../../deploy/mealdeck/post-install-migrations/20261109234500_mealdeck_driver_verified_email_lookup.sql",import.meta.url),"utf8"
  ));
  await db.exec(readFileSync(
    new URL("../../deploy/mealdeck/post-install-migrations/20261109235500_mealdeck_courier_switchboard.sql",import.meta.url),"utf8"
  ));
  await db.exec(buildCustomerPushSql());
  await db.exec(readFileSync(
    new URL("../../deploy/mealdeck/post-install-migrations/20261111100000_mealdeck_verified_driver_push.sql",import.meta.url),"utf8"
  ));
  // Test-only opt-in activation, no provider/network connection.
  await db.exec("update mealdeck_private.customer_features set push_enabled=true where singleton");
  await setGuestFixtureClock(db, "2026-11-06T16:00:00Z");
  const token = guestTokenHash("isolated-own-driver-guest-one");
  const stranger = guestTokenHash("isolated-own-driver-guest-two");
  await f.guest.session(token, { name: "Delivery Customer", phone: "+447700900123" });
  await f.guest.session(stranger, { name: "Other Customer", phone: "+447700900456" });
  const address = {
    postcode: "LU4 8NU",
    doorNumber: "14",
    roadName: "Test Road",
    addressLine2: "Flat 2",
  };
  const bind = (quoteId, options = {}) =>
    f.service(() =>
      scalar("select public.mealdeck_bind_local_delivery_quote($1,$2,$3,$4,$5,$6,$7::jsonb,$8)", [
        f.tenantId,
        f.locationId,
        quoteId,
        null,
        options.token ?? token,
        "c".repeat(64),
        JSON.stringify(options.address ?? address),
        options.distance ?? 0,
      ]),
    );
  const quoteFor = async (quantity = 6) => {
    await f.ageQuotes();
    return f.guest.quote(token, { lines: [{ ...f.line, quantity }] });
  };
  await check(
    "only the Luton kitchen is eligible and no registration is forced after the weekend",
    async () => {
      assert.equal(
        await f.service(() =>
          scalar("select public.mealdeck_local_delivery_ready($1,$2)", [f.tenantId, f.locationId]),
        ),
        true,
      );
      assert.equal(
        await f.service(() =>
          scalar("select public.mealdeck_local_delivery_ready($1,$2)", [f.tenantId, id(99123)]),
        ),
        false,
      );
      assert.equal(
        await scalar(
          "select mealdeck_private.launch_window_at('2026-11-09T16:00:00Z')->>'guestEligible'",
        ),
        "true",
      );
    },
  );
  await check(
    "delivery addresses have RLS and no direct public/customer/service table grants",
    async () => {
      for (const role of ["anon", "authenticated", "service_role"]) {
        for (const table of ["local_driver_quotes", "local_driver_orders"]) {
          assert.equal(
            await scalar("select has_table_privilege($1,$2,'SELECT')", [
              role,
              "mealdeck_private." + table,
            ]),
            false,
          );
          assert.equal(
            await scalar("select relrowsecurity from pg_class where oid=$1::regclass", [
              "mealdeck_private." + table,
            ]),
            true,
          );
        }
      }
      const signature =
        "public.mealdeck_bind_local_delivery_quote(uuid,uuid,uuid,uuid,text,text,jsonb,integer)";
      assert.equal(
        await scalar("select has_function_privilege('anon',$1,'EXECUTE')", [signature]),
        false,
      );
      assert.equal(
        await scalar("select has_function_privilege('authenticated',$1,'EXECUTE')", [signature]),
        false,
      );
      assert.equal(
        await scalar("select has_function_privilege('service_role',$1,'EXECUTE')", [signature]),
        true,
      );
    },
  );
  await check(
    "under-minimum, outside-radius and another guest's address binding are denied",
    async () => {
      const low = await quoteFor(1);
      assert.ok(low.totalPence < 1500 && low.discountPence > 0);
      await assert.rejects(() => bind(low.quoteId), /delivery_quote_invalid/);
      const q = await quoteFor();
      await assert.rejects(() => bind(q.quoteId, { distance: 3001 }), /delivery_address_invalid/);
      await assert.rejects(() => bind(q.quoteId, { token: stranger }), /delivery_quote_invalid/);
      await assert.rejects(
        () => bind(q.quoteId, { address: { ...address, roadName: "" } }),
        /delivery_address_invalid/,
      );
    },
  );
  await check("database binding enforces the exact £14.99/£15.00 NET boundary", async () => {
    const q = await quoteFor();
    // Adversarial values ONLY in this disposable database. Never prepare/pay this
    // quote; payment independently reprices. This isolates the SQL net threshold.
    await db.query(
      "update mealdeck_private.checkout_quotes set gross_pence=2142,discount_pence=643,total_pence=1499 where id=$1",
      [q.quoteId],
    );
    await assert.rejects(() => bind(q.quoteId), /delivery_quote_invalid/);
    await db.query(
      "update mealdeck_private.checkout_quotes set gross_pence=2143,total_pence=1500 where id=$1",
      [q.quoteId],
    );
    assert.equal((await bind(q.quoteId)).delivery, true);
  });
  const quote = await quoteFor();
  assert.ok(quote.totalPence >= 1500 && quote.discountPence > 0);
  await bind(quote.quoteId);
  const order = await f.guest.prepare(token, quote.quoteId, { attemptId: id(98761) });
  await check(
    "canonical guest delivery keeps priced totals, free fee and one private destination",
    async () => {
      assert.equal(order.fulfilment, "delivery");
      assert.equal(order.totalPence, quote.totalPence);
      assert.equal(
        await scalar("select delivery_pence from public.orders where id=$1", [order.orderId]),
        0,
      );
      assert.equal(
        await scalar(
          "select count(*)::int from mealdeck_private.local_driver_orders where order_id=$1",
          [order.orderId],
        ),
        1,
      );
      assert.deepEqual(
        await scalar("select address from mealdeck_private.local_driver_quotes where quote_id=$1", [
          quote.quoteId,
        ]),
        address,
      );
      await assert.rejects(() => f.guest.receipt(stranger, order.orderId), /order_unavailable/);
      assert.equal(
        (await f.board()).orders.some((x) => x.order_id === order.orderId),
        false,
      );
    },
  );
  await f.bind(order.orderId, "cs_test_localdriver");
  await f.reconcile(order, {
    session: "cs_test_localdriver",
    intent: "pi_localdriver",
    event: "evt_localdriver",
  });
  const card = () => f.card(order.orderId);
  const driver = async (status, version) =>
    f.staff("mealdeck_ops_kds_transition_local_driver", [
      f.tenantId,
      f.locationId,
      order.orderId,
      version ?? (await card()).driverVersion,
      status,
    ]);
  await check(
    "paid KDS has full address and 60-minute deadline; early or unauthorized handover fails",
    async () => {
      const c = await card();
      assert.deepEqual(c.deliveryAddress, address);
      assert.equal(c.deliveryContact.name, "Delivery Customer");
      assert.equal(c.deliveryContact.phone, "+447700900123");
      const paidAt = await scalar("select paid_at from public.orders where id=$1", [order.orderId]);
      assert.equal(Date.parse(c.deliveryDeadlineAt) - new Date(paidAt).getTime(), 3600000);
      await assert.rejects(() => driver("with_driver"), /not_ready/);
      await assert.rejects(
        () =>
          asActor(db, f.customer, () =>
            scalar("select public.mealdeck_ops_kds_transition_local_driver($1,$2,$3,$4,$5)", [
              f.tenantId,
              f.locationId,
              order.orderId,
              c.driverVersion,
              "with_driver",
            ]),
          ),
        /forbidden|not_authenticated|not_authorized/,
      );
    },
  );
  await f.accept(order.orderId);
  await check("guest explicitly opts into delivery order alerts after canonical paid acceptance", async () => {
    const subscription=await f.service(()=>scalar(
      "select public.mealdeck_push_order_subscription($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [f.tenantId,f.locationId,order.orderId,null,token,"subscribe",
       "https://fcm.googleapis.com/fcm/send/driver-handover-fixture",
       "B"+"a".repeat(86),"a".repeat(22)],
    ));
    assert.equal(subscription.connected,true);
    assert.equal(await scalar(
      "select count(*)::int from mealdeck_private.order_push_subscriptions where order_id=$1 and enabled",
      [order.orderId],
    ),1);
    assert.equal(await scalar("select has_function_privilege('anon', $1, 'EXECUTE')",[
      "mealdeck_private.push_capture_verified_driver_pickup()"
    ]),false);
  });
  await check("acceptance creates exactly one complete delivery receipt", async () => {
    assert.equal(
      await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
        order.orderId,
      ]),
      1,
    );
    const receipt = await scalar(
      "select receipt from mealdeck_private.receipt_jobs where order_id=$1",
      [order.orderId],
    );
    assert.equal(receipt.fulfilment, "delivery");
    assert.equal(receipt.car, null);
    assert.equal(receipt.totalPence, order.totalPence);
    assert.ok(
      receipt.items.length > 0 && receipt.items.every((x) => Array.isArray(x.mealComponents)),
    );
  });
  await f.staff("mealdeck_ops_kds_transition_order", [
    f.tenantId,
    f.locationId,
    order.orderId,
    (await card()).version,
    "preparing",
  ]);
  for (const item of (await card()).items) {
    await f.staff("mealdeck_ops_kds_set_item_ready", [
      f.tenantId,
      f.locationId,
      order.orderId,
      item.order_item_id,
      (await card()).version,
      true,
    ]);
  }
  await f.staff("mealdeck_ops_kds_transition_pass", [
    f.tenantId,
    f.locationId,
    order.orderId,
    (await card()).pass.version,
    "packing",
  ]);
  await f.staff("mealdeck_ops_kds_transition_pass", [
    f.tenantId,
    f.locationId,
    order.orderId,
    (await card()).pass.version,
    "sealed",
  ]);
  // Driver authorisation is tied to the owner's verified existing MealDeck Auth user.
  const driverActor = (functionName,args=[]) =>
    asActor(db,f.customer,()=>scalar(
      "select public."+functionName+"("+args.map((_,index)=>"$"+(index+1)).join(",")+")",args
    ));
  await check("driver roster and jobs cannot be read as public tables",async()=>{
    for(const table of ["driver_roster","driver_assignments","driver_action_receipts"]){
      assert.equal(await scalar("select relrowsecurity from pg_class where oid=$1::regclass",["mealdeck_private."+table]),true);
      for(const actor of ["anon","authenticated","service_role"]){
        assert.equal(await scalar("select has_table_privilege($1,$2,'SELECT')",[actor,"mealdeck_private."+table]),false);
      }
    }
    assert.equal(await scalar("select has_function_privilege('anon',$1,'EXECUTE')",[
      "public.mealdeck_driver_portal()"
    ]),false);
    await assert.rejects(()=>driverActor("mealdeck_driver_portal"),/mealdeck_driver_forbidden/);
  });
  await check("only authorised managers can resolve an existing verified driver by exact email",async()=>{
    const fn="public.mealdeck_ops_driver_find_verified_email(uuid,uuid,text)";
    assert.equal(await scalar("select has_function_privilege('anon',$1,'EXECUTE')",[fn]),false);
    await db.query("update auth.users set email_confirmed_at=now() where id=$1",[f.customer]);
    // The shared fixture creates the actual Auth email from the driver's UUID.
    // Use that verified account; never assume a hard-coded unrelated mailbox.
    const verifiedEmail = await scalar("select email from auth.users where id=$1",[f.customer]);
    assert.match(verifiedEmail,/^fixture-[0-9a-f-]+@example[.]invalid$/);
    const lookup=(email)=>asActor(db,f.owner,()=>scalar(
      "select public.mealdeck_ops_driver_find_verified_email($1,$2,$3)",
      [f.tenantId,f.locationId,email]
    ));
    assert.deepEqual(await lookup(verifiedEmail.toUpperCase()),{found:true,userId:f.customer});
    assert.deepEqual(await lookup("not-a-driver@example.invalid"),{found:false,userId:null});
    await assert.rejects(()=>asActor(db,f.customer,()=>scalar(
      "select public.mealdeck_ops_driver_find_verified_email($1,$2,$3)",
      [f.tenantId,f.locationId,verifiedEmail]
    )),/mealdeck_ops_forbidden/);
    await assert.rejects(()=>lookup("not-an-email"),/mealdeck_driver_email_invalid/);
  });
  await check("owner enrols a real driver, who starts shift and sees no unrelated jobs",async()=>{
    await asActor(db,f.owner,()=>scalar(
      "select public.mealdeck_ops_driver_enrol($1,$2,$3,$4)",
      [f.tenantId,f.locationId,f.customer,"Test Driver"]
    ));
    const initial=await driverActor("mealdeck_driver_portal");
    assert.equal(initial.onShift,false);
    assert.deepEqual(initial.jobs,[]);
    assert.equal((await driverActor("mealdeck_driver_shift",[true])).onShift,true);
    const dispatch=await f.staff("mealdeck_ops_driver_dispatch_board",[f.tenantId,f.locationId]);
    assert.equal(dispatch.orders.some(x=>x.jobId===order.orderId),true);
  });
  await check("staff offers once and address remains hidden until driver accepts",async()=>{
    await f.staff("mealdeck_ops_driver_offer",[f.tenantId,f.locationId,order.orderId,f.customer]);
    const offered=(await driverActor("mealdeck_driver_portal")).jobs[0];
    assert.equal(offered.jobId,order.orderId);
    assert.equal(offered.status,"offered");
    assert.equal(offered.address,null);
    assert.equal(offered.customerPhone,null);
    await assert.rejects(()=>f.staff("mealdeck_ops_driver_offer",[
      f.tenantId,f.locationId,order.orderId,f.customer
    ]),/mealdeck_driver_busy/);
    const acceptArgs=[order.orderId,offered.version,"accept",id(99211)];
    const accepted=await driverActor("mealdeck_driver_action",acceptArgs);
    assert.equal(accepted.status,"assigned");
    assert.deepEqual(await driverActor("mealdeck_driver_action",acceptArgs),accepted);
    await assert.rejects(()=>driverActor("mealdeck_driver_action",[
      order.orderId,offered.version,"accept",id(99212)
    ]),/mealdeck_driver_conflict/);
    // A manager cannot revoke an accepted active paid-delivery assignment.
    await assert.rejects(()=>asActor(db,f.owner,()=>scalar(
      "select public.mealdeck_ops_driver_set_enabled($1,$2,$3,$4)",
      [f.tenantId,f.locationId,f.customer,false]
    )),/mealdeck_driver_active_job/);
    const privateJob=(await driverActor("mealdeck_driver_portal")).jobs[0];
    assert.deepEqual(privateJob.address,address);
    assert.equal(privateJob.customerPhone,"+447700900123");
  });
  await check("driver cannot collect until KDS staff have confirmed packed handover",async()=>{
    let active=(await driverActor("mealdeck_driver_portal")).jobs[0];
    await driverActor("mealdeck_driver_action",[order.orderId,active.version,"arrive_kitchen",id(99213)]);
    active=(await driverActor("mealdeck_driver_portal")).jobs[0];
    await assert.rejects(()=>driverActor("mealdeck_driver_action",[
      order.orderId,active.version,"pickup",id(99214)
    ]),/mealdeck_driver_handover_pending/);
    await driver("with_driver");
    assert.equal((await card()).driverStatus,"with_driver");
    assert.equal(await scalar(
      "select count(*)::int from mealdeck_private.push_events where order_id=$1 and stage='with_driver'",
      [order.orderId],
    ),0);
    await driverActor("mealdeck_driver_action",[order.orderId,active.version,"pickup",id(99215)]);
    assert.equal(await scalar(
      "select mealdeck_private.push_current_order_stage($1)",[order.orderId],
    ),"with_driver");
    assert.equal(await scalar(
      "select count(*)::int from mealdeck_private.push_events where order_id=$1 and stage='with_driver'",
      [order.orderId],
    ),1);
    assert.equal(await scalar(
      "select count(*)::int from mealdeck_private.push_outbox where event_id=("+
      "select id from mealdeck_private.push_events where order_id=$1 and stage='with_driver')",
      [order.orderId],
    ),1);
    const claimed=await f.service(()=>scalar(
      "select public.mealdeck_push_claim($1,$2,$3)",[f.tenantId,f.locationId,50],
    ));
    const pickupJob=await scalar(
      "select id from mealdeck_private.push_outbox where event_id=("+
      "select id from mealdeck_private.push_events where order_id=$1 and stage='with_driver')",
      [order.orderId],
    );
    const leased=claimed.jobs.find(j=>j.jobId===pickupJob);
    assert.ok(leased);
    const readyToSend=await f.service(()=>scalar(
      "select public.mealdeck_push_preflight($1,$2,$3,$4)",
      [f.tenantId,f.locationId,leased.jobId,leased.leaseToken],
    ));
    assert.equal(readyToSend.send,true);
    assert.equal(readyToSend.payload.stage,"with_driver");
    assert.equal(readyToSend.payload.fulfilment,"delivery");
    assert.equal(readyToSend.payload.checkoutMode,"guest");
    assert.equal(JSON.stringify(readyToSend.payload).includes("driver-handover-fixture"),false);
    assert.equal(JSON.stringify(readyToSend.payload).includes("Test Road"),false);
    active=(await driverActor("mealdeck_driver_portal")).jobs[0];
    await driverActor("mealdeck_driver_action",[order.orderId,active.version,"arrive_customer",id(99216)]);
    active=(await driverActor("mealdeck_driver_portal")).jobs[0];
    await driverActor("mealdeck_driver_action",[order.orderId,active.version,"report_dropoff",id(99217)]);
    assert.equal((await driverActor("mealdeck_driver_portal")).jobs[0].status,"dropoff_reported");
    assert.equal((await card()).driverStatus,"with_driver");
    assert.equal(await scalar(
      "select count(*)::int from mealdeck_private.push_events where order_id=$1 and stage='with_driver'",
      [order.orderId],
    ),1);
    assert.equal(await scalar("select status::text from public.orders where id=$1",[order.orderId]),"ready");
  });

  await check(
    "driver handover then delivery updates KDS and guest receipt without printing twice",
    async () => {
      const before = await card();
      await driver("with_driver", before.driverVersion);
      assert.equal((await card()).driverStatus, "with_driver");
      await assert.rejects(() => driver("delivered", "0".repeat(32)), /conflict/);
      const out = await f.guest.receipt(token, order.orderId);
      assert.ok(out.driverHandoverAt);
      assert.equal(out.deliveredAt, null);
      assert.equal(out.collectionEstimateMinutes, 60);
      await driver("delivered");
      const completedDriverJob = (await driverActor("mealdeck_driver_portal")).jobs[0];
      assert.equal(completedDriverJob.status, "delivered");
      assert.equal(completedDriverJob.address, null);
      assert.equal(completedDriverJob.customerName, null);
      assert.equal(completedDriverJob.customerPhone, null);
      assert.equal(
        (await f.board()).orders.some((x) => x.order_id === order.orderId),
        false,
      );
      const completed = (await f.board()).completed_orders.find(
        (x) => x.order_id === order.orderId,
      );
      assert.equal(completed.driverStatus, "delivered");
      assert.deepEqual(completed.deliveryAddress, address);
      const done = await f.guest.receipt(token, order.orderId);
      assert.equal(done.status, "fulfilled");
      assert.ok(done.deliveredAt);
      assert.equal(done.completedAt, done.deliveredAt);
      assert.equal(
        await scalar("select count(*)::int from mealdeck_private.receipt_jobs where order_id=$1", [
          order.orderId,
        ]),
        1,
      );
    },
  );
  await check("manager can disable or restore driver access only after a delivery completes",async()=>{
    const fn="public.mealdeck_ops_driver_set_enabled(uuid,uuid,uuid,boolean)";
    assert.equal(await scalar("select has_function_privilege('anon',$1,'EXECUTE')",[fn]),false);
    await assert.rejects(()=>asActor(db,f.customer,()=>scalar(
      "select public.mealdeck_ops_driver_set_enabled($1,$2,$3,$4)",
      [f.tenantId,f.locationId,f.customer,false]
    )),/mealdeck_ops_forbidden/);
    const manager=(enabled)=>asActor(db,f.owner,()=>scalar(
      "select public.mealdeck_ops_driver_set_enabled($1,$2,$3,$4)",
      [f.tenantId,f.locationId,f.customer,enabled]
    ));
    const disabled=await manager(false);
    assert.deepEqual(disabled,{ok:true,enabled:false});
    assert.equal(await scalar(
      "select enabled from mealdeck_private.driver_roster where user_id=$1",[f.customer]
    ),false);
    assert.equal(await scalar(
      "select on_shift from mealdeck_private.driver_roster where user_id=$1",[f.customer]
    ),false);
    await assert.rejects(()=>driverActor("mealdeck_driver_portal"),/mealdeck_driver_forbidden/);
    await assert.rejects(()=>driverActor("mealdeck_driver_shift",[true]),/mealdeck_driver_forbidden/);
    const restored=await manager(true);
    assert.deepEqual(restored,{ok:true,enabled:true});
    const portal=await driverActor("mealdeck_driver_portal");
    assert.equal(portal.onShift,false);
    assert.equal(portal.jobs[0].status,"delivered");
    assert.deepEqual((await f.staff("mealdeck_ops_driver_dispatch_board",[
      f.tenantId,f.locationId
    ])).drivers.find(d=>d.driverId===f.customer),{
      driverId:f.customer,name:"Test Driver",onShift:false,enabled:true,
    });
    assert.equal(await scalar(
      "select count(*)::int from public.mealdeck_ops_audit_log where action='driver.enable' and entity_id=$1",
      [f.customer]
    ),2);
  });
  await check("courier switches default only own fleet on and require manager permission",async()=>{
    const board=await f.staff("mealdeck_ops_courier_switchboard",[f.tenantId,f.locationId]);
    assert.equal(board.automatedDispatchReady,false);
    assert.deepEqual(board.providers.map((p)=>[p.provider,p.enabled]),[
      ["own_fleet",true],["uber_direct",false],["deliveroo_express",false],
      ["just_eat_go",false],["stuart",false],
    ]);
    assert.equal(await scalar("select has_function_privilege('anon',$1,'EXECUTE')",[
      "public.mealdeck_ops_courier_set_enabled(uuid,uuid,text,boolean)"
    ]),false);
    await assert.rejects(()=>asActor(db,f.customer,()=>scalar(
      "select public.mealdeck_ops_courier_set_enabled($1,$2,$3,$4)",
      [f.tenantId,f.locationId,"stuart",true],
    )),/forbidden|permission|scope/i);
    const change=(provider,enabled)=>asActor(db,f.owner,()=>scalar(
      "select public.mealdeck_ops_courier_set_enabled($1,$2,$3,$4)",
      [f.tenantId,f.locationId,provider,enabled],
    ));
    const switched=await change("stuart",true);
    assert.equal(switched.providers.find(x=>x.provider==="stuart").enabled,true);
    assert.equal(switched.providers.find(x=>x.provider==="stuart").connected,false);
    const disabled=await change("own_fleet",false);
    assert.equal(disabled.providers.find(x=>x.provider==="own_fleet").enabled,false);
    assert.equal(await scalar("select mealdeck_private.courier_provider_enabled($1,$2,'own_fleet')",[
      f.tenantId,f.locationId,
    ]),false);
    await assert.rejects(()=>change("other",true),/invalid_switch/);
  });
  console.log(`Verified ${passed} complete own-driver delivery behavior groups.`);
} catch (error) {
  console.error("Own-driver delivery verification failed:", error.message, error.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
