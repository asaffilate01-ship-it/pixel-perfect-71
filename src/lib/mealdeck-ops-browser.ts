import {createClient,type SupabaseClient} from "@supabase/supabase-js";

/**
 * Browser-only authenticated staff client. NEVER use a service-role key here.
 * Points to the existing Dishbee Supabase project that owns canonical orders.
 */
let client:SupabaseClient|null=null;

export function getMealDeckOpsClient():SupabaseClient{
  if(typeof window==="undefined")throw new Error("mealdeck_ops_browser_only");
  if(client)return client;
  const url=import.meta.env["VITE_MEALDECK_OPS_SUPABASE_URL"] as string|undefined;
  const key=import.meta.env["VITE_MEALDECK_OPS_SUPABASE_ANON_KEY"] as string|undefined;
  if(!url?.startsWith("https://")||!key?.trim()){
    throw new Error(
      "Staff operations is not configured. Connect the approved Dishbee Supabase public URL and publishable key.",
    );
  }
  client=createClient(url,key,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
    global:{headers:{"X-Client-Info":"mealdeck-ops-web"}},
  });
  return client;
}

export type OpsAccess={
  access_id:string;
  tenant_id:string;
  tenant_name:string;
  location_id:string|null;
  role:OpsRole;
  grant_permissions:string[];
  deny_permissions:string[];
};
export type OpsRole=
  "owner"|"admin"|"operations"|"kitchen"|"menu"|"finance"|"analyst"|"viewer";

export async function opsRpc<T>(
  name:string,parameters:Record<string,unknown>={},
):Promise<T>{
  const db=getMealDeckOpsClient();
  // Every private RPC checks the signed-in user via auth.uid() and verifies
  // explicit per-tenant/location permissions. UI visibility is not authority.
  const {data,error}=await db.rpc(name,parameters);
  if(error){
    // Narrow, reviewed operational errors are translated without returning
    // raw SQL, database schema details, user IDs or provider credentials.
    const invoiceFailures:readonly [string,string][]=[
      ["mealdeck_ops_invoice_totals_mismatch","Invoice lines must total exactly to the supplier's stated net and VAT."],
      ["mealdeck_ops_invoice_unreceived_goods","Record and approve the physical delivery receipt before matching this quantity."],
      ["mealdeck_ops_invoice_goods_already_claimed","These received goods are already claimed by another matched or approved invoice."],
      ["mealdeck_ops_invoice_price_variance","Supplier net price differs from the approved purchase order beyond rounding tolerance."],
      ["mealdeck_ops_invoice_tax_category_missing","Review the tax category on every invoice line before confirming the tax document."],
      ["mealdeck_ops_invoice_second_approver_required","A different, tenant-wide finance manager must approve this reviewed invoice."],
      ["mealdeck_ops_invoice_tax_not_reviewable","Tax evidence can only be reviewed after a successful goods/PO match."],
      ["mealdeck_ops_invoice_not_matchable","This invoice cannot be matched until it is submitted and the purchase order is approved."],
      ["mealdeck_ops_credit_exceeds_invoice","Approved credit notes cannot exceed the original invoice net or VAT."],
      ["mealdeck_ops_credit_second_approver_required","A separate tenant-wide finance manager must approve this credit."],
      ["mealdeck_ops_credit_requires_approved_invoice","Only an approved supplier invoice can receive a supplier credit note."],
      ["mealdeck_ops_invoice_not_editable","This supplier invoice can no longer be edited. Use a reviewed credit or void an unapproved invoice."],
    ];
    const known=invoiceFailures.find(([code])=>error.message.includes(code));
    if(known)throw new Error(known[1]);
    if(error.code==="23505"&&/mealdeck_ops_supplier_(invoices|credits)/i.test(error.message)){
      throw new Error("This supplier invoice or credit note number already exists. Verify the original record instead of submitting it twice.");
    }
    if(error.code==="42501"||/forbidden|permission/i.test(error.message)){
      throw new Error("Your staff role is not permitted to access this area.");
    }
    throw new Error("The operations request failed. Verify your access and try again.");
  }
  return data as T;
}
export function opsRows<T>(value:unknown):T[]{
  return Array.isArray(value)?value as T[]:value==null?[]:[value as T];
}
