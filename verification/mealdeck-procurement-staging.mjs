#!/usr/bin/env node
/**
 * Opt-in approved staging-only purchasing concurrency acceptance.
 * Creates synthetic supplier + PO + two receipts with SAME idempotency key;
 * records one lot issue. It NEVER contacts a supplier, bank, Adyen or courier.
 * Does NOT activate customer ordering or KDS.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";

const env=process.env;
function required(name){
  const value=env[name]?.trim();
  if(!value)throw new Error("Missing staging-only setting: "+name);
  return value;
}
function deny(reason){throw new Error("MealDeck procurement test refused: "+reason);}
const origin=new URL(required("SUPABASE_URL"));
const match=origin.hostname.match(/^([a-z0-9]{15,30})\.supabase\.co$/);
if(!match||origin.protocol!=="https:"||origin.pathname!=="/"||
  origin.search||origin.hash||origin.username||origin.password){
  deny("Use approved HTTPS hosted staging Supabase project");
}
const ref=match[1];
if(ref!==required("APPROVED_STAGING_PROJECT_REF")||
   ref===required("PRODUCTION_PROJECT_REF")||
   required("PRODUCTION_PROJECT_REF")===required("APPROVED_STAGING_PROJECT_REF")){
  deny("Unapproved or production Supabase project");
}
if(required("PROCUREMENT_STAGING_CONFIRM")!=="CREATE-SYNTHETIC-PURCHASE-NO-PROVIDER"){
  deny("Explicit permission to create a synthetic staging PO is required");
}
const url=origin.origin;
const anon=required("SUPABASE_PUBLISHABLE_KEY");
const service=required("SUPABASE_SERVICE_ROLE_KEY");
const createdBy=required("STAGING_PURCHASER_JWT");
const approvedBy=required("STAGING_APPROVER_JWT");
const receiver=required("STAGING_RECEIVER_JWT");
const tenant=required("STAGING_TENANT_ID");
const location=required("STAGING_LOCATION_ID");
const ingredient=required("STAGING_INGREDIENT_ID");
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if(![tenant,location,ingredient].every(x=>uuid.test(x)))
  deny("A valid staged tenant/location/ingredient is required");
if(createdBy===approvedBy)deny("An independent approving staff JWT is required");

async function api(method,path,token,key,body){
  const res=await fetch(url+"/rest/v1/"+path,{
    method,
    headers:{
      apikey:key,authorization:"Bearer "+token,
      "content-type":"application/json",
      accept:"application/json",
    },
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),
  });
  if(!res.ok){
    // Avoid logging JWT, provider details, supplier PII or SQL.
    const error=new Error("Staging request denied: "+path+" HTTP "+res.status);
    error.status=res.status;
    throw error;
  }
  const response=await res.text();
  return response?JSON.parse(response):null;
}
const staff=(name,payload,token)=>api("POST","rpc/"+name,token,anon,payload);
const inspect=(table,filter)=>api("GET",table+"?"+filter,service,service);

const nonce=randomUUID().slice(0,8);
const supplier=await staff("mealdeck_ops_save_supplier",{
  p_tenant:tenant,p_id:null,p_name:"STAGING ONLY supplier "+nonce,
  p_email:null,p_lead_days:2,p_status:"active",
},approvedBy);
assert.match(supplier,uuid);
const order=await staff("mealdeck_ops_create_purchase",{
  p_tenant:tenant,p_location:location,p_supplier:supplier,
  p_note:"SYNTHETIC procurement acceptance, no supplier contact",
},createdBy);
assert.match(order,uuid);
const line=await staff("mealdeck_ops_save_purchase_line",{
  p_tenant:tenant,p_location:location,p_order:order,
  p_ingredient:ingredient,p_pack_count:1,p_base_units:10,p_pack_price:1234,
},createdBy);
assert.match(line,uuid);
assert.equal(await staff("mealdeck_ops_advance_purchase",{
  p_tenant:tenant,p_location:location,p_order:order,p_action:"submit",
},createdBy),true);
assert.equal(await staff("mealdeck_ops_advance_purchase",{
  p_tenant:tenant,p_location:location,p_order:order,p_action:"approve",
},approvedBy),true);

const deliveryRef="STAGING-"+nonce;
const batchCode="BATCH-"+nonce;
const expiration=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
const receiptArgs={
  p_tenant:tenant,p_location:location,p_line:line,
  p_base_qty:10,p_batch_code:batchCode,p_expiry_kind:"use_by",
  p_expiry:expiration,p_delivery_ref:deliveryRef,
};
const [receiptA,receiptB]=await Promise.all([
  staff("mealdeck_ops_receive_purchase",receiptArgs,receiver),
  staff("mealdeck_ops_receive_purchase",receiptArgs,receiver),
]);
assert.equal(receiptA,receiptB,"Concurrent repeated receipt must reuse one row");

const receipts=await inspect("mealdeck_ops_purchase_receipts",
  "select=id,base_quantity&tenant_id=eq."+tenant+"&location_id=eq."+location+
  "&purchase_line_id=eq."+line);
assert.equal(receipts.length,1,"One physical receipt per delivery reference");
const lots=await inspect("mealdeck_ops_stock_batches",
  "select=id,received_base_units,issued_base_units,expiry_on"+
  "&tenant_id=eq."+tenant+"&location_id=eq."+location+
  "&ingredient_id=eq."+ingredient+"&batch_code=eq."+batchCode);
assert.equal(lots.length,1);
assert.equal(Number(lots[0].received_base_units),10);
assert.equal(lots[0].expiry_on,expiration);

const po=await inspect("mealdeck_ops_purchase_orders",
  "select=status&tenant_id=eq."+tenant+"&location_id=eq."+location+
  "&id=eq."+order);
assert.equal(po[0]?.status,"received","Approved PO must be fully received");

const issueReference="STAGING-ISSUE-"+nonce;
const issueArgs={
  p_tenant:tenant,p_location:location,p_batch:lots[0].id,
  p_quantity:3,p_reason:"waste",p_reference:issueReference,
  p_note:"SYNTHETIC staged waste, not actual food disposal",
};
const [issueA,issueB]=await Promise.all([
  staff("mealdeck_ops_issue_batch",issueArgs,receiver),
  staff("mealdeck_ops_issue_batch",issueArgs,receiver),
]);
assert.equal(issueA,issueB,"Repeated batch issue must not deplete stock twice");
const updated=await inspect("mealdeck_ops_stock_batches",
  "select=received_base_units,issued_base_units"+
  "&tenant_id=eq."+tenant+"&location_id=eq."+location+
  "&id=eq."+lots[0].id);
assert.equal(Number(updated[0]?.received_base_units),10);
assert.equal(Number(updated[0]?.issued_base_units),3);

const extra=await staff("mealdeck_ops_receive_purchase",{
  ...receiptArgs,p_delivery_ref:"OVERRECEIPT-"+nonce,p_base_qty:1,
},receiver).then(()=>false,()=>true);
assert.equal(extra,true,"Overreceipt after a completed PO must be refused");

const movements=await inspect("mealdeck_ops_stock_movements",
  "select=delta_qty,reason,note&tenant_id=eq."+tenant+
  "&location_id=eq."+location+"&ingredient_id=eq."+ingredient+
  "&note=ilike.*"+nonce+"*");
const positives=movements.filter(x=>Number(x.delta_qty)===10&&x.reason==="purchase");
const negatives=movements.filter(x=>Number(x.delta_qty)===-3&&x.reason==="waste");
assert.equal(positives.length,1,"One stock purchase movement");
assert.equal(negatives.length,1,"One idempotent stock waste movement");

process.stdout.write(JSON.stringify({
  stagingOnly:true,
  supplierNotificationsSent:0,
  bankTransactions:0,
  adyenRequests:0,
  customerOrdersAffected:0,
  independentApproval:true,
  idempotentReceipt:true,
  idempotentBatchIssue:true,
  expiryTracked:true,
  sourceOrderRef:order,
  manualCleanupRequired:true,
},null,2)+"\n");
