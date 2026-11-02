#!/usr/bin/env node
/**
 * Explicit non-production-only, synthetic supplier invoice acceptance.
 * Requires an approved staging Supabase project, seeded tenant/location and
 * ingredient, independent authenticated finance user JWTs, and the complete
 * MealDeck Phase 7→9 migration chain. Makes NO supplier email, card charge,
 * Adyen payment, bank transfer, HMRC submission or KDS update.
 * Leaves records for auditable manual staging cleanup.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";

const env=process.env;
const required=name=>{
  const value=env[name]?.trim();
  if(!value)throw new Error("Missing approved staging setting: "+name);
  return value;
};
function refuse(message){throw new Error("Invoice staging test refused: "+message);}
const url=new URL(required("SUPABASE_URL"));
const match=url.hostname.match(/^([a-z0-9]{15,30})\.supabase\.co$/);
if(url.protocol!=="https:"||!match||url.pathname!=="/"||
   url.search||url.hash||url.username||url.password)refuse("approved HTTPS hosted Supabase URL required");
const ref=match[1];
if(ref!==required("APPROVED_STAGING_PROJECT_REF")||
   ref===required("PRODUCTION_PROJECT_REF")||
   required("APPROVED_STAGING_PROJECT_REF")===required("PRODUCTION_PROJECT_REF")){
  refuse("production or unapproved project");
}
if(required("MEALDECK_INVOICE_STAGING_CONFIRM")!=="SYNTHETIC-THREE-WAY-MATCH-NO-PAYMENT"){
  refuse("explicit no-payment invoice test confirmation required");
}
const key=required("SUPABASE_PUBLISHABLE_KEY");
const service=required("SUPABASE_SERVICE_ROLE_KEY");
const purchaser=required("STAGING_PURCHASER_JWT");
const approver=required("STAGING_APPROVER_JWT");
const receiver=required("STAGING_RECEIVER_JWT");
if(purchaser===approver)refuse("independent finance approver JWT required");
const tenant=required("STAGING_TENANT_ID");
const location=required("STAGING_LOCATION_ID");
const ingredient=required("STAGING_INGREDIENT_ID");
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if(![tenant,location,ingredient].every(x=>uuid.test(x)))refuse("invalid staged tenant/location/ingredient");
async function call(method,route,token,apiKey,payload){
  const response=await fetch(url.origin+"/rest/v1/"+route,{
    method,
    headers:{
      apikey:apiKey,authorization:"Bearer "+token,
      "content-type":"application/json",accept:"application/json",
    },
    ...(payload===undefined?{}:{body:JSON.stringify(payload)}),
  });
  if(!response.ok){
    // Deliberately omit response body to avoid leaking supplier/secret details.
    throw new Error("Staging RPC denied at "+route+": HTTP "+response.status);
  }
  const text=await response.text();
  return text?JSON.parse(text):null;
}
const rpc=(name,input,token)=>call("POST","rpc/"+name,token,key,input);
const query=(name,params)=>call("GET",name+"?"+params,service,service);
const nonce=randomUUID().slice(0,8);
const today=new Date().toISOString().slice(0,10);

const supplier=await rpc("mealdeck_ops_save_supplier",{
  p_tenant:tenant,p_id:null,p_name:"INVOICE-STAGING-"+nonce,p_email:null,
  p_lead_days:0,p_status:"active",
},approver);
assert.match(supplier,uuid);
const po=await rpc("mealdeck_ops_create_purchase",{
  p_tenant:tenant,p_location:location,p_supplier:supplier,
  p_note:"SYNTHETIC invoice test - NO external supplier",
},purchaser);
assert.match(po,uuid);
const line=await rpc("mealdeck_ops_save_purchase_line",{
  p_tenant:tenant,p_location:location,p_order:po,p_ingredient:ingredient,
  p_pack_count:1,p_base_units:10,p_pack_price:1200,
},purchaser);
assert.match(line,uuid);
assert.equal(await rpc("mealdeck_ops_advance_purchase",{
  p_tenant:tenant,p_location:location,p_order:po,p_action:"submit",
},purchaser),true);
assert.equal(await rpc("mealdeck_ops_advance_purchase",{
  p_tenant:tenant,p_location:location,p_order:po,p_action:"approve",
},approver),true);
const expiry=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
const receipt=await rpc("mealdeck_ops_receive_purchase",{
  p_tenant:tenant,p_location:location,p_line:line,p_base_qty:10,
  p_batch_code:"INVOICE-"+nonce,p_expiry_kind:"best_before",
  p_expiry:expiry,p_delivery_ref:"INVOICE-DELIVERY-"+nonce,
},receiver);
assert.match(receipt,uuid);

const invoiceNo="INVOICE-"+nonce;
const invoice=await rpc("mealdeck_ops_create_invoice",{
  p_tenant:tenant,p_location:location,p_order:po,
  p_number:invoiceNo,p_date:today,p_due:null,
  p_net:1200,p_vat:0,p_note:"Synthetic zero-VAT invoice - no actual tax filing",
},purchaser);
assert.match(invoice,uuid);
const invoiceLine=await rpc("mealdeck_ops_save_invoice_line",{
  p_tenant:tenant,p_location:location,p_invoice:invoice,p_po_line:line,
  p_quantity:10,p_net:1200,p_vat:0,p_tax:"zero",
},purchaser);
assert.match(invoiceLine,uuid);

const duplicate=await rpc("mealdeck_ops_create_invoice",{
  p_tenant:tenant,p_location:location,p_order:po,
  p_number:invoiceNo.toLowerCase(),p_date:today,p_due:null,
  p_net:1200,p_vat:0,p_note:"Duplicate supplier invoice attempt",
},purchaser).then(()=>false,()=>true);
assert.equal(duplicate,true,"Duplicate supplier invoice number must be rejected");

assert.equal(await rpc("mealdeck_ops_invoice_action",{
  p_tenant:tenant,p_location:location,p_invoice:invoice,p_action:"submit",
},purchaser),true);
assert.equal(await rpc("mealdeck_ops_invoice_action",{
  p_tenant:tenant,p_location:location,p_invoice:invoice,p_action:"match",
},purchaser),true);
const beforeTax=await rpc("mealdeck_ops_invoice_action",{
  p_tenant:tenant,p_location:location,p_invoice:invoice,p_action:"approve",
},approver).then(()=>false,()=>true);
assert.equal(beforeTax,true,"Tax evidence review must precede invoice approval");
assert.equal(await rpc("mealdeck_ops_review_invoice_tax",{
  p_tenant:tenant,p_location:location,p_invoice:invoice,p_reviewed:true,
},purchaser),true);
const selfApprove=await rpc("mealdeck_ops_invoice_action",{
  p_tenant:tenant,p_location:location,p_invoice:invoice,p_action:"approve",
},purchaser).then(()=>false,()=>true);
assert.equal(selfApprove,true,"Invoice creator must not self approve");
assert.equal(await rpc("mealdeck_ops_invoice_action",{
  p_tenant:tenant,p_location:location,p_invoice:invoice,p_action:"approve",
},approver),true);

const credit=await rpc("mealdeck_ops_create_supplier_credit",{
  p_tenant:tenant,p_location:location,p_invoice:invoice,
  p_number:"CREDIT-"+nonce,p_issued:today,
  p_reason:"Synthetic supplier discount for staged finance validation",
  p_net:120,p_vat:0,
},purchaser);
assert.match(credit,uuid);
assert.equal(await rpc("mealdeck_ops_credit_action",{
  p_tenant:tenant,p_location:location,p_credit:credit,p_action:"submit",
},purchaser),true);
assert.equal(await rpc("mealdeck_ops_credit_action",{
  p_tenant:tenant,p_location:location,p_credit:credit,p_action:"approve",
},approver),true);

const invoiceRows=await query("mealdeck_ops_supplier_invoices",
  "select=id,status,tax_document_reviewed,approved_by"+
  "&tenant_id=eq."+tenant+"&location_id=eq."+location+"&id=eq."+invoice);
assert.equal(invoiceRows.length,1);
assert.equal(invoiceRows[0].status,"approved");
assert.equal(invoiceRows[0].tax_document_reviewed,true);
const creditRows=await query("mealdeck_ops_supplier_credits",
  "select=id,status,net_pence,vat_pence"+
  "&tenant_id=eq."+tenant+"&location_id=eq."+location+"&id=eq."+credit);
assert.equal(creditRows.length,1);
assert.equal(creditRows[0].status,"approved");
assert.equal(Number(creditRows[0].net_pence),120);

const foreign=await rpc("mealdeck_ops_invoice_line_list",{
  p_tenant:"00000000-0000-4000-8000-000000000999",
  p_location:location,p_invoice:invoice,
},approver).then(()=>false,()=>true);
assert.equal(foreign,true,"Foreign tenant must not read supplier invoice lines");

process.stdout.write(JSON.stringify({
  stagingOnly:true,independentPoApproval:true,goodsPhysicallyReceived:true,
  duplicateInvoiceRefused:true,threeWayMatch:true,taxEvidenceReviewRequired:true,
  independentInvoiceApproval:true,approvedCredit:true,foreignTenantRefused:true,
  supplierEmailSent:false,merchantPaymentStarted:false,
  vatReturnFiled:false,stockOrKdsRelease:false,
  stagingInvoiceId:invoice,cleanupRequired:true,
},null,2)+"\n");
