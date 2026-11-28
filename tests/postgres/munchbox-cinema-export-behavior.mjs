import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDatabase, asActor, id } from "./harness.mjs";
import { setupSharedPaymentsFixture } from "./shared-terminal-payments-fixture.mjs";
import { buildWhatsappOrderingSql } from "../../deploy/mealdeck/whatsapp-ordering.mjs";
import { setGuestFixtureClock, guestTokenHash } from "./guest-checkout-fixture.mjs";
import { validateCinemaSnapshot } from "../../deploy/mealdeck/munchbox-cinema-draw.mjs";

const db=await createDatabase(process.argv.includes("--native"));
const source=await readFile(new URL("../../deploy/mealdeck/operations/20261127_munchbox_cinema_draw_export.sql",import.meta.url),"utf8");
const guard=source.match(/do \$guard\$[\s\S]*?end \$guard\$;/)?.[0];
const selection=source.match(/with\ncfg as \([\s\S]*?\n\);\nrollback;/)?.[0];
assert.ok(guard&&selection,"Production export must have its owner guard and read-only query");
assert.match(source,/begin transaction isolation level repeatable read read only;/);
const query=selection.replace(/\nrollback;$/,"")
  .replace(":'installation_id'","$1").replace(":'location_id'","$2")
  .replace(":'stripe_account'","$3").replace(":'eligible_skus'","$4")
  // Only a disposable test uses a fixed clock. Production SQL retains current_timestamp.
  .replaceAll("current_timestamp","$5::timestamptz");
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
let checks=0;
async function check(label,fn){await fn();console.log("PASS cinema export "+(++checks)+": "+label);}
try {
 const f=await setupSharedPaymentsFixture(db);
 await db.exec(buildWhatsappOrderingSql());
 await setGuestFixtureClock(db,"2026-11-10T16:00:00Z");
 const install=await scalar("select installation_id from mealdeck_private.installation where singleton");
 const sku=f.line.sku;
 const cutoff="2026-12-07T09:00:00Z";
 const early="2026-12-02T23:59:59.999Z";
 const start="2026-12-03T00:00:00Z";
 const last="2026-12-06T23:59:59.999Z";
 const end="2026-12-07T00:00:00Z";
 const fixtureAccount="acct_Fixture";
 // This fixture uses an existing real catalogue SKU as synthetic evidence only,
 // never claiming it is a Munchbox or production-approved.
 await db.query("update auth.users set email_confirmed_at='2026-12-01T00:00:00Z' where id in ($1,$2)",[f.customer,f.otherCustomer]);
 await db.query("update mealdeck_private.customer_profiles set created_at='2026-12-01T00:00:00Z' where user_id in ($1,$2)",[f.customer,f.otherCustomer]);
 let sequence=0;
 const paid=async({actor=f.customer,at=start,live=true,refunded=false,disputed=false,guest=false}={})=>{
   const seq=++sequence;
   const token=guest?guestTokenHash("cinema-fixture-"+seq):null;
   if(guest){await setGuestFixtureClock(db,"2026-11-06T16:00:00Z");await f.guest.session(token);}
   else await setGuestFixtureClock(db,"2026-11-10T16:00:00Z");
   const quote=guest?await f.guest.quote(token):await f.quote({actor});
   const order=guest?await f.guest.prepare(token,quote.quoteId,{attemptId:f.next(),livemode:live}):
     await f.service(()=>scalar("select public.mealdeck_prepare_stripe_order($1,$2,$3,$4,$5)",[quote.quoteId,actor,f.next(),fixtureAccount,live]));
   const session="cs_"+(live?"live_":"test_")+"cinema"+seq;
   await f.service(()=>scalar("select public.mealdeck_bind_stripe_session($1,$2,$3,$4,$5)",[order.orderId,session,"https://checkout.stripe.com/c/pay/"+session,fixtureAccount,live]));
   const intent="pi_cinema"+seq;
   await f.reconcile(order,{event:"evt_cinema"+seq,session,intent,livemode:live,account:fixtureAccount,captured:order.totalPence});
   if(refunded||disputed)await f.reconcile(order,{event:"evt_cinemarefund"+seq,session,intent,livemode:live,account:fixtureAccount,type:refunded?"charge.refunded":"charge.dispute.created",captured:order.totalPence,refunded:refunded?1:0,disputed});
   // Synthetic owner-controlled clock fixtures, never production operations.
   await db.query("update public.orders set paid_at=$2::timestamptz where id=$1",[order.orderId,at]);
   await db.query("update mealdeck_private.stripe_orders set verified_at=$2::timestamptz where order_id=$1",[order.orderId,at]);
   return {...order,session,intent};
 };
 const exportDraw=async({skus=[sku],installation=install,location=f.locationId,account=fixtureAccount,at=cutoff}={})=>{
   await db.exec("begin transaction isolation level repeatable read read only");
   try{await db.exec(guard);return await scalar(query,[installation,location,account,JSON.stringify(skus),at]);}
   finally{await db.exec("rollback");}
 };
 await check("only the independent owner may export; invalid exact SKU lists and pre/post windows fail closed",async()=>{
   for(const role of ["anon","authenticated","service_role"]){
     await assert.rejects(()=>asActor(db,f.customer,()=>db.exec(guard),role),/independent_owner_required|permission denied/);
   }
   for(const options of [{skus:[]},{skus:[sku,sku]},{skus:[sku,123]},{skus:[sku,{}]},{skus:[sku+" "]},{skus:["unknown-sku"]},{skus:null},{installation:id(99999)},{location:id(99998)},{account:"wrong"},{at:early},{at:"2026-12-16T19:20:00Z"}]){
     const result=await exportDraw(options);
     assert.equal(result.ready,false);
     assert.deepEqual(result.entrants,[]);
   }
 });
 const first=await paid({at:start});
 const second=await paid({at:last});
 await paid({actor:f.otherCustomer,at:early});
 await paid({actor:f.otherCustomer,at:end});
 await paid({actor:f.otherCustomer,at:start,live:false});
 await paid({actor:f.otherCustomer,at:start,refunded:true});
 await paid({actor:f.otherCustomer,at:start,disputed:true});
 await paid({at:start,guest:true});
 await check("inclusive paid window, live member-only evidence and one entry per member",async()=>{
   const result=await exportDraw();
   assert.equal(result.ready,true);
   assert.deepEqual(result.eligibleSkus,[sku]);
   assert.deepEqual(result.entrants,[{memberId:f.customer,orderIds:[first.orderId,second.orderId].sort()}]);
   assert.deepEqual(validateCinemaSnapshot(result,Date.parse(cutoff)).entrants,result.entrants);
   assert.ok(!JSON.stringify(result).includes("example.invalid"));
 });
 await check("WhatsApp-origin payment is excluded even if it shares an otherwise eligible verified account",async()=>{
   const chat=await paid({actor:f.otherCustomer,at:start});
   const sid=await scalar("insert into mealdeck_private.whatsapp_sessions(tenant_id,location_id,phone_id,sender_id) values($1,$2,'123456789','fixture') returning id",[f.tenantId,f.locationId]);
   await db.query("insert into mealdeck_private.whatsapp_handoffs(session_id,tenant_id,location_id,phone_id,token_hash,draft_revision,frozen_draft,request_hash,quote_id,order_id,customer_id) values($1,$2,$3,'123456789',$4,0,'{}',$5,$6,$7,$8)",[sid,f.tenantId,f.locationId,"c".repeat(64),"d".repeat(64),chat.quoteId,chat.orderId,f.otherCustomer]);
   const result=await exportDraw();
   assert.deepEqual(result.entrants,[{memberId:f.customer,orderIds:[first.orderId,second.orderId].sort()}]);
 });
 await check("wrong Stripe account has no entrants; missing paid-event evidence cannot qualify",async()=>{
   assert.deepEqual((await exportDraw({account:"acct_Other"})).entrants,[]);
   await db.query("delete from mealdeck_private.stripe_events where order_id=$1",[first.orderId]);
   assert.deepEqual((await exportDraw()).entrants,[{memberId:f.customer,orderIds:[second.orderId]}]);
 });
 console.log("Cinema export checks passed:",checks);
}finally{await db.close();}
