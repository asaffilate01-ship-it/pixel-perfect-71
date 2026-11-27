import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { asActor, createDatabase } from "./harness.mjs";
import { setupOrderNotesFixture } from "./order-notes-fixture.mjs";
import { buildOrderNotesSql } from "../../deploy/mealdeck/order-notes.mjs";
import { setGuestFixtureClock } from "./guest-checkout-fixture.mjs";

const db=await createDatabase(process.argv.includes("--native"),{uuid_ossp});
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const operation=await readFile(new URL("../../deploy/mealdeck/operations/20261127_staff_vouchers.sql",import.meta.url),"utf8");
const codeHash=code=>createHash("sha256").update(code).digest("hex");
let checks=0;
async function check(label,action){await action();console.log("PASS staff voucher "+(++checks)+": "+label);}
try {
 const f=await setupOrderNotesFixture(db);
 await db.exec(buildOrderNotesSql());
 await setGuestFixtureClock(db,"2026-11-10T16:00:00Z");
 const scope=[f.tenantId,f.locationId];
 const admin=(name,args=[],actor=f.owner)=>asActor(db,actor,()=>scalar(
   "select public."+name+"("+args.map((_,i)=>"$"+(i+1)).join(",")+")",args));
 const issue=(actor=f.owner,staff=f.customer,days=7)=>admin("mealdeck_ops_issue_staff_voucher",[...scope,staff,days],actor);
 const list=()=>admin("mealdeck_ops_staff_vouchers",scope);
 const revoke=id=>admin("mealdeck_ops_revoke_staff_voucher",[...scope,id]);
 const status=actor=>f.service(()=>scalar("select public.mealdeck_staff_voucher_status($1,$2,$3)",[...scope,actor]));
 const quote=(hash,actor=f.customer,options={})=>{
   const lines=options.lines??[f.line];
   return f.service(()=>scalar("select public.mealdeck_create_staff_voucher_quote($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb,$9,$10)",
     [...scope,actor,options.fulfilment??"pickup",options.vehicle?JSON.stringify(options.vehicle):null,
       JSON.stringify(lines),"a".repeat(64),JSON.stringify(options.packing??f.pack(lines)),options.notes??null,hash]));
 };
 const prepare=(q,actor=f.customer,attempt=f.next())=>f.prepare(q.quoteId,{actor,attemptId:attempt});
 const resetAttempts=()=>db.exec("delete from mealdeck_private.staff_voucher_attempts");
 const original=await f.quote();
 assert.equal(original.discountPence,0);
 await check("installation starts disabled, refuses a second install and keeps existing order/quote amounts",async()=>{
   const before=await scalar("select to_jsonb(q) from mealdeck_private.checkout_quotes q where id=$1",[original.quoteId]);
   await db.exec(operation);
   assert.equal((await list()).enabled,false);
   assert.equal((await status(f.customer)).eligible,false);
   await assert.rejects(()=>issue(),/voucher_unavailable/);
   assert.deepEqual(await scalar("select to_jsonb(q) from mealdeck_private.checkout_quotes q where id=$1",[original.quoteId]),before);
   // Check owner profile/definition guard without installing twice.
   await db.exec("begin");
   try{
     const managed=operation.replace(/^begin;$/m,"").replace(/^commit;$/m,"");
     await assert.rejects(()=>db.exec(managed),/unreviewed_installation/);
   }finally{await db.exec("rollback");}
 });
 await db.query("insert into public.mealdeck_ops_staff_access(tenant_id,location_id,user_id,role) values($1,$2,$3,'kitchen')",[...scope,f.customer]);
 await db.exec("update mealdeck_private.staff_voucher_settings set enabled=true where singleton");

 await check("only verified scoped staff qualify; only owner/admin with staff and finance authority can issue",async()=>{
   assert.equal((await status(f.customer)).eligible,true);
   assert.equal((await status(f.otherCustomer)).eligible,false);
   await assert.rejects(()=>issue(f.customer),/voucher_forbidden/);
   await assert.rejects(()=>issue(f.owner,f.otherCustomer),/voucher_unavailable/);
   await assert.rejects(()=>issue(f.owner,f.customer,31),/voucher_unavailable/);
   for(const role of ["anon","authenticated","service_role"])
     await assert.rejects(()=>asActor(db,f.customer,()=>scalar("select code_hash from mealdeck_private.staff_vouchers"),role),/permission denied/);
   for(const role of ["anon","authenticated"])
     await assert.rejects(()=>asActor(db,f.customer,()=>scalar("select public.mealdeck_create_staff_voucher_quote($1,$2,$3,'pickup',null,'[]','bad','{}',null,'bad')",[...scope,f.customer]),role),/permission denied/);
   await assert.rejects(()=>admin("mealdeck_ops_staff_vouchers",scope,f.customer),/voucher_forbidden/);
 });
 let voucher, q1,q2;
 await check("random one-time reveal, exact account binding, no plaintext or digest in manager history",async()=>{
   voucher=await issue();
   assert.match(voucher.code,/^MD-[A-F0-9]{32}$/);
   assert.equal(await scalar("select code_hash from mealdeck_private.staff_vouchers where id=$1",[voucher.id]),codeHash(voucher.code));
   assert.equal(JSON.stringify(await list()).includes(voucher.code),false);
   assert.equal(JSON.stringify(await list()).includes(codeHash(voucher.code)),false);
   assert.deepEqual(await quote(codeHash(voucher.code),f.otherCustomer),{staffVoucherRejected:true});
   assert.deepEqual(await quote("0".repeat(64)),{staffVoucherRejected:true});
   q1=await quote(codeHash(voucher.code),f.customer,{notes:"No onions"});
   q2=await quote(codeHash(voucher.code));
   for(const q of [q1,q2]){
     assert.equal(q.staffVoucherApplied,true);
     assert.equal(q.discountPence,Math.floor(q.grossPence/2));
     assert.equal(q.totalPence,q.grossPence-q.discountPence);
     assert.equal(q.grossPence,original.grossPence);
     assert.ok(!JSON.stringify(q).includes(voucher.code));
   }
   assert.equal(q1.notes,"No onions");
   assert.equal(await scalar("select consumed_at from mealdeck_private.staff_vouchers where id=$1",[voucher.id]),null);
 });
 await check("one successful preparation consumes the code atomically; exact original retry recovers, other quotes fail",async()=>{
   const attempt=f.next();
   const order=await prepare(q1,f.customer,attempt);
   assert.equal(order.totalPence,q1.totalPence);
   assert.equal((await prepare(q1,f.customer,attempt)).orderId,order.orderId);
   await assert.rejects(()=>prepare(q2),/staff_voucher_unavailable/);
   await assert.rejects(()=>prepare(q1,f.otherCustomer),/quote_unavailable|registration_required/);
   assert.deepEqual(await quote(codeHash(voucher.code)),{staffVoucherRejected:true});
   assert.equal(await scalar("select consumed_quote_id from mealdeck_private.staff_vouchers where id=$1",[voucher.id]),q1.quoteId);
   assert.equal(await scalar("select count(*)::integer from mealdeck_private.stripe_orders where quote_id in ($1,$2)",[q1.quoteId,q2.quoteId]),1);
   assert.equal(await scalar("select payment_status from public.orders where id=$1",[order.orderId]),"pending");
   assert.deepEqual(await f.service(()=>scalar("select public.mealdeck_staff_voucher_order($1,$2)",[order.orderId,f.customer])),{applied:true});
   assert.deepEqual(await f.service(()=>scalar("select public.mealdeck_staff_voucher_order($1,$2)",[order.orderId,f.otherCustomer])),{applied:false});
   await assert.rejects(()=>revoke(voucher.id),/voucher_unavailable/);
 });
 await resetAttempts();
 await check("revocation, expiry, disabled staff and disabled campaign invalidate unprepared discounted quotes",async()=>{
   let v=await issue();let q=await quote(codeHash(v.code));
   await revoke(v.id);await assert.rejects(()=>prepare(q),/staff_voucher_unavailable/);
   v=await issue();q=await quote(codeHash(v.code));
   // Fixture-only clock manipulation, preserving the issued/expiry constraint.
   await db.query("update mealdeck_private.staff_vouchers set issued_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=$1",[v.id]);
   await assert.rejects(()=>prepare(q),/staff_voucher_unavailable/);
   v=await issue();q=await quote(codeHash(v.code));
   await db.query("update public.mealdeck_ops_staff_access set enabled=false where user_id=$1",[f.customer]);
   await assert.rejects(()=>prepare(q),/staff_voucher_unavailable/);
   await db.query("update public.mealdeck_ops_staff_access set enabled=true where user_id=$1",[f.customer]);
   await db.exec("update mealdeck_private.staff_voucher_settings set enabled=false");
   await assert.rejects(()=>prepare(q),/staff_voucher_unavailable/);
   assert.equal((await status(f.customer)).eligible,false);
   await db.exec("update mealdeck_private.staff_voucher_settings set enabled=true");
 });
 await resetAttempts();
 await check("no stacking with opening discount and no group-payment materialization",async()=>{
   const v=await issue();
   await setGuestFixtureClock(db,"2026-11-06T16:00:00Z");
   assert.deepEqual(await quote(codeHash(v.code)),{staffVoucherRejected:true});
   await setGuestFixtureClock(db,"2026-11-10T16:00:00Z");
   const lines=[{...f.line,quantity:2}];
   const packing={version:1,separateBags:true,cutleryRequested:false,bags:[{number:1,allocations:[{lineId:f.line.lineId,quantity:1}]},{number:2,allocations:[{lineId:f.line.lineId,quantity:1}]}]};
   const q=await quote(codeHash(v.code),f.customer,{lines,packing});
   assert.equal(q.staffVoucherApplied,true);
   await assert.rejects(()=>f.group({quote:q,customer:f.customer,packing}));
   assert.equal(await scalar("select consumed_at from mealdeck_private.staff_vouchers where id=$1",[v.id]),null);
 });
 await resetAttempts();
 await check("ten unsuccessful well-formed guesses persist; later attempts fail closed",async()=>{
   for(let i=0;i<10;i++)assert.deepEqual(await quote("f".repeat(64)),{staffVoucherRejected:true});
   assert.deepEqual(await quote("f".repeat(64)),{staffVoucherRateLimited:true});
   assert.equal(await scalar("select attempts from mealdeck_private.staff_voucher_attempts where staff_user_id=$1",[f.customer]),10);
 });
 await resetAttempts();
 if(db.native) await check("native concurrent payment attempts on two separate quotes cannot redeem the same voucher",async()=>{
   const v=await issue();const a=await quote(codeHash(v.code));const b=await quote(codeHash(v.code));
   const clients=[new pg.Client(db.config),new pg.Client(db.config)];
   try{
     await Promise.all(clients.map(c=>c.connect()));
     for(const c of clients){await c.query("begin");await c.query("set local role service_role");}
     const call=(c,q,attempt)=>c.query("select public.mealdeck_prepare_stripe_order($1,$2,$3,'acct_Fixture',false) result",[q.quoteId,f.customer,attempt]);
     const first=await call(clients[0],a,f.next());
     const second=call(clients[1],b,f.next()).then(value=>({ok:true,value}),error=>({ok:false,error}));
     await clients[0].query("commit");
     const other=await second;
     assert.equal(other.ok,false);assert.match(other.error.message,/staff_voucher_unavailable/);
     await clients[1].query("rollback");
     assert.equal(first.rows[0].result.totalPence,a.totalPence);
     assert.equal(await scalar("select count(*)::integer from mealdeck_private.stripe_orders where quote_id in ($1,$2)",[a.quoteId,b.quoteId]),1);
   }finally{await Promise.allSettled(clients.map(c=>c.query("rollback")));await Promise.allSettled(clients.map(c=>c.end()));}
 });
 await check("ordinary checkout remains unchanged after voucher installation",async()=>{
   const q=await f.quote({actor:f.otherCustomer});assert.equal(q.discountPence,0);assert.equal(q.totalPence,q.grossPence);
   const p=await prepare(q,f.otherCustomer);assert.equal(p.totalPence,q.totalPence);
 });
 console.log("Staff voucher checks passed:",checks);
}finally{await db.close();}
