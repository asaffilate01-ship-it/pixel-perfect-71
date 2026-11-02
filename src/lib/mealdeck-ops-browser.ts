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
