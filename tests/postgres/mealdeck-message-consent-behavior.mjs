import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDatabase, asActor } from "./harness.mjs";
import { setupStripeCheckoutFixture } from "./stripe-checkout-fixture.mjs";

const db=await createDatabase(process.argv.includes("--native"));
let checks=0;
const test=async(name,task)=>{await task();console.log("PASS message consent "+(++checks)+": "+name);};
const count=async(table)=>Number((await db.query("select count(*)::integer total from "+table)).rows[0].total);
try {
  const f=await setupStripeCheckoutFixture(db);
  const sql=await readFile(new URL("../../deploy/mealdeck/post-install-migrations/20261109104500_mealdeck_message_channel_consent.sql",import.meta.url),"utf8");
  await test("migration installs twice with independent MealDeck owner guard",async()=>{
    await db.exec(sql);
    await db.exec(sql);
    assert.equal(await count("mealdeck_private.customer_message_consent_events"),0);
  });
  const member=action=>asActor(db,f.customer,action);
  const profile=async()=> (await member(()=>db.query("select public.mealdeck_customer_profile_with_messages() as result"))).rows[0].result;
  await test("new permissions are off and no direct table access exists",async()=>{
    const p=await profile();
    assert.equal(p.preferences.smsMarketing,false);
    assert.equal(p.preferences.whatsappMarketing,false);
    const rights=(await db.query(`select
      has_table_privilege('anon','mealdeck_private.customer_message_consent_events','SELECT,INSERT,UPDATE,DELETE') guest,
      has_table_privilege('authenticated','mealdeck_private.customer_message_consent_events','SELECT,INSERT,UPDATE,DELETE') customer,
      has_table_privilege('service_role','mealdeck_private.customer_message_consent_events','SELECT,INSERT,UPDATE,DELETE') service`)).rows[0];
    assert.deepEqual(rights,{guest:false,customer:false,service:false});
    await assert.rejects(()=>asActor(db,null,()=>db.query("select public.mealdeck_customer_message_preferences()"),"anon"));
  });
  await test("specific SMS/WhatsApp opt-in is saved with a versioned audit record",async()=>{
    const p=await profile();
    const r=(await member(()=>db.query(
      `select public.mealdeck_customer_update_with_messages(
        'Fixture Customer','+447700900123',false,false,false,$1,
        'mealdeck-preferences-2026-11-05',true,true) as result`,
      [p.updatedAt],
    ))).rows[0].result;
    assert.equal(r.preferences.smsMarketing,true);
    assert.equal(r.preferences.whatsappMarketing,true);
    assert.equal(await count("mealdeck_private.customer_message_consent_events"),2);
    const kinds=(await db.query("select channel,allowed from mealdeck_private.customer_message_consent_events order by channel")).rows;
    assert.deepEqual(kinds.map(x=>x.channel),["sms_marketing","whatsapp_marketing"]);
    assert.ok(kinds.every(x=>x.allowed));
  });
  await test("unchanged consents do not duplicate audit events",async()=>{
    const p=await profile();
    await member(()=>db.query(
      `select public.mealdeck_customer_update_with_messages(
        'Fixture Customer','+447700900123',false,false,false,$1,
        'mealdeck-preferences-2026-11-05',true,true)`,
      [p.updatedAt],
    ));
    assert.equal(await count("mealdeck_private.customer_message_consent_events"),2);
  });
  await test("changing mobile number automatically invalidates previous marketing consent",async()=>{
    const p=await profile();
    await member(()=>db.query(
      `select public.mealdeck_customer_update(
        'Fixture Customer','+447700900124',false,false,false,$1,
        'mealdeck-preferences-2026-11-05')`,
      [p.updatedAt],
    ));
    const next=await profile();
    assert.equal(next.preferences.smsMarketing,false);
    assert.equal(next.preferences.whatsappMarketing,false);
  });
  await test("withdrawal stays off and audit remains exportable",async()=>{
    const p=await profile();
    const output=(await member(()=>db.query(
      `select public.mealdeck_customer_update_with_messages(
        'Fixture Customer','+447700900124',false,false,false,$1,
        'mealdeck-preferences-2026-11-05',false,false) as result`,
      [p.updatedAt],
    ))).rows[0].result;
    assert.equal(output.preferences.smsMarketing,false);
    assert.equal(output.preferences.whatsappMarketing,false);
    const exported=(await member(()=>db.query(
      "select public.mealdeck_customer_export_with_messages() as result",
    ))).rows[0].result;
    assert.equal(exported.messagePreferences.smsMarketing,false);
    assert.ok(Array.isArray(exported.messageConsentHistory));
    assert.equal(exported.messageConsentHistory.length,4);
    assert.equal(exported.messageConsentHistory.filter(e => !e.allowed).length,2);
  });
  console.log(checks+" independent message consent tests passed.");
} finally {await db.close();}
