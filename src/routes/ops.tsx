import {createFileRoute,Link} from "@tanstack/react-router";
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import {
  ArrowLeft,BarChart3,ChefHat,ClipboardList,LockKeyhole,
  LogOut,RefreshCcw,ShieldCheck,Store,UserRoundCog,
} from "lucide-react";
import type {User} from "@supabase/supabase-js";
import {getMealDeckOpsClient,opsRpc,opsRows,type OpsAccess} from "@/lib/mealdeck-ops-browser";
import {effectiveOpsPermissions,OPS_SECTIONS,type OpsPermission,type OpsSection} from "@/lib/mealdeck-ops-access";
import type {
  OpsAnalytics,OpsBrandSales,OpsAudit,OpsCost,OpsExpense,OpsFinance,OpsIngredient,
  OpsLocation,OpsMenuItem,OpsOrder,OpsRecipe,OpsRecipeCost,
  OpsStaff,OpsStock,OpsTaxonomy,
} from "@/lib/mealdeck-ops-types";
import {
  OpsAnalyticsPanel,OpsCostsPanel,OpsFinancePanel,
  OpsIngredientPanel,OpsMenuPanel,OpsOrdersPanel,
  OpsRecipePanel,OpsTeamPanel,
} from "@/components/ops/ops-panels";
import {seo} from "@/lib/seo";
import {OpsSupplierInvoicesPanel} from "@/components/ops/supplier-invoices-panel";
import type {OpsSupplierInvoice,OpsSupplierCredit,OpsSupplierInvoiceSummary} from "@/lib/mealdeck-ops-invoice-types";
import {OpsProcurementPanel} from "@/components/ops/procurement-panel";
import {OpsStockBatchesPanel} from "@/components/ops/stock-batches-panel";
import type {OpsSupplier,OpsPurchase,OpsBatch} from "@/lib/mealdeck-ops-procurement-types";

export const Route=createFileRoute("/ops")({
  head:()=>{
    const tags=seo({
      title:"Staff operations | MealDeck",
      description:"Secure internal MealDeck staff operations. Sign-in required.",
      path:"/ops",
    });
    return{
      ...tags,
      meta:[
        ...tags.meta,
        {name:"robots",content:"noindex, nofollow, noarchive"},
        {name:"referrer",content:"no-referrer"},
      ],
    };
  },
  component:MealDeckOperations,
});
const field="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-amber-500";
const btn="min-h-11 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50";
const columns="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
type WorkspaceData={
  menu:OpsMenuItem[];taxonomy:OpsTaxonomy[];orders:OpsOrder[];
  recipes:OpsRecipe[];ingredients:OpsIngredient[];stock:OpsStock[];
  costs:OpsCost[];recipeCosts:OpsRecipeCost[];
  expenses:OpsExpense[];finance:OpsFinance|null;
  analytics:OpsAnalytics|null;brandSales:OpsBrandSales[];staff:OpsStaff[];audit:OpsAudit[];
  suppliers:OpsSupplier[];purchases:OpsPurchase[];batches:OpsBatch[];
  invoices:OpsSupplierInvoice[];credits:OpsSupplierCredit[];
  invoiceSummary:OpsSupplierInvoiceSummary|null;
};
const blank=():WorkspaceData=>({
  menu:[],taxonomy:[],orders:[],recipes:[],ingredients:[],
  stock:[],costs:[],recipeCosts:[],expenses:[],finance:null,
  analytics:null,brandSales:[],staff:[],audit:[],
  suppliers:[],purchases:[],batches:[],
  invoices:[],credits:[],invoiceSummary:null,
});
function dateISO(date:Date){return date.toISOString().slice(0,10);}
function lastMonth(){const date=new Date();date.setDate(date.getDate()-29);return dateISO(date);}

function MealDeckOperations(){
  const[user,setUser]=useState<User|null>(null);
  const[checkingAuth,setCheckingAuth]=useState(true);
  const[authError,setAuthError]=useState("");
  const[loginBusy,setLoginBusy]=useState(false);
  const[email,setEmail]=useState("");
  const[password,setPassword]=useState("");
  const[accesses,setAccesses]=useState<OpsAccess[]>([]);
  const[accessBusy,setAccessBusy]=useState(false);
  const[tenant,setTenant]=useState("");
  const[locations,setLocations]=useState<OpsLocation[]>([]);
  const[location,setLocation]=useState("");
  const[section,setSection]=useState<OpsSection>("overview");
  const[notice,setNotice]=useState("");
  const[error,setError]=useState("");
  const[loading,setLoading]=useState(false);
  const[fromDate,setFromDate]=useState(lastMonth());
  const[toDate,setToDate]=useState(dateISO(new Date()));
  const[data,setData]=useState<WorkspaceData>(blank);
  const reqRef=useRef(0);

  const fetchAccess=useCallback(async()=>{
    setAccessBusy(true);
    try{
      const rows=opsRows<OpsAccess>(await opsRpc<unknown>("mealdeck_ops_my_access"));
      setAccesses(rows);
      setTenant(previous=>
        rows.some(x=>x.tenant_id===previous)?previous:rows[0]?.tenant_id??"");
    }catch(reason){
      setAccesses([]);
      setAuthError(reason instanceof Error?reason.message:"Staff access could not be verified.");
    }finally{setAccessBusy(false);}
  },[]);

  useEffect(()=>{
    let current=true;
    try{
      const sb=getMealDeckOpsClient();
      void sb.auth.getUser().then(({data:result,error:authIssue})=>{
        if(!current)return;
        if(authIssue||!result.user){
          setUser(null);
        }else{
          setUser(result.user);
          void fetchAccess();
        }
        setCheckingAuth(false);
      });
      const{data:{subscription}}=sb.auth.onAuthStateChange((event)=>{
        if(!current)return;
        if(event==="SIGNED_OUT"){
          reqRef.current++;
          setUser(null);setAccesses([]);setTenant("");setLocation("");
          setData(blank());
        }
      });
      return()=>{current=false;subscription.unsubscribe();};
    }catch(reason){
      setAuthError(reason instanceof Error?reason.message:"Staff login is not configured.");
      setCheckingAuth(false);
    }
  },[fetchAccess]);

  useEffect(()=>{
    let current=true;
    if(!tenant||!user){
      setLocations([]);setLocation("");return;
    }
    setLocations([]);setLocation("");setData(blank());
    void opsRpc<unknown>("mealdeck_ops_locations",{p_tenant:tenant})
      .then(raw=>{
        if(!current)return;
        const places=opsRows<OpsLocation>(raw);
        setLocations(places);
        setLocation(places[0]?.location_id??"");
      }).catch(reason=>{
        if(current)setError(reason instanceof Error?reason.message:"Locations could not be loaded.");
      });
    return()=>{current=false;};
  },[tenant,user]);

  const tenants=useMemo(()=>[...new Map(accesses.map(a=>[
    a.tenant_id,{id:a.tenant_id,name:a.tenant_name},
  ])).values()], [accesses]);
  const permissions=useMemo(
    ()=>effectiveOpsPermissions(accesses,tenant,location||null),
    [accesses,tenant,location],
  );
  const globalPermissions=useMemo(
    ()=>effectiveOpsPermissions(accesses,tenant,null),
    [accesses,tenant],
  );
  const accessibleSections=OPS_SECTIONS.filter(x=>permissions.has(x.permission));
  const selectedSection=accessibleSections.some(x=>x.id===section)?
    section:accessibleSections[0]?.id??"menu";

  const reload=useCallback(async()=>{
    if(!tenant||!location||!user)return;
    const request=++reqRef.current;
    setLoading(true);setError("");
    try{
      const base={p_tenant:tenant,p_location:location};
      const period={...base,p_from:fromDate,p_to:toDate};
      const next:WorkspaceData=blank();
      const row=<T,>(raw:unknown):T[]=>opsRows<T>(raw);
      switch(selectedSection){
        case "menu":{
          const[products,categories]=await Promise.all([
            opsRpc<unknown>("mealdeck_ops_menu_list",base),
            opsRpc<unknown>("mealdeck_ops_menu_taxonomy",base),
          ]);
          next.menu=row<OpsMenuItem>(products);
          next.taxonomy=row<OpsTaxonomy>(categories);
          break;
        }
        case "orders":
          next.orders=row<OpsOrder>(await opsRpc<unknown>("mealdeck_ops_order_history",period));
          break;
        case "recipes":{
          const[products,recipes,ingredients]=await Promise.all([
            opsRpc<unknown>("mealdeck_ops_menu_list",base),
            opsRpc<unknown>("mealdeck_ops_recipe_list",base),
            opsRpc<unknown>("mealdeck_ops_ingredient_list",base),
          ]);
          next.menu=row<OpsMenuItem>(products);
          next.recipes=row<OpsRecipe>(recipes);
          next.ingredients=row<OpsIngredient>(ingredients);
          break;
        }
        case "ingredients":{
          const[ingredients,stock]=await Promise.all([
            opsRpc<unknown>("mealdeck_ops_ingredient_list",base),
            opsRpc<unknown>("mealdeck_ops_stock_levels",base),
          ]);
          next.ingredients=row<OpsIngredient>(ingredients);
          next.stock=row<OpsStock>(stock);
          break;
        }
        case "purchasing":{
          const[suppliers,purchases,ingredients]=await Promise.all([
            opsRpc<unknown>("mealdeck_ops_supplier_list",base),
            opsRpc<unknown>("mealdeck_ops_purchase_list",base),
            opsRpc<unknown>("mealdeck_ops_ingredient_list",base),
          ]);
          next.suppliers=row<OpsSupplier>(suppliers);
          next.purchases=row<OpsPurchase>(purchases);
          next.ingredients=row<OpsIngredient>(ingredients);
          break;
        }
        case "batches":{
          next.batches=row<OpsBatch>(await opsRpc<unknown>(
            "mealdeck_ops_batch_list",{...base,p_days:14},
          ));
          break;
        }
        case "costs":{
          const[ingredients,costs,recipes,menu]=await Promise.all([
            opsRpc<unknown>("mealdeck_ops_ingredient_list",base),
            opsRpc<unknown>("mealdeck_ops_cost_list",base),
            opsRpc<unknown>("mealdeck_ops_recipe_costs",base),
            opsRpc<unknown>("mealdeck_ops_menu_list",base),
          ]);
          next.ingredients=row<OpsIngredient>(ingredients);
          next.costs=row<OpsCost>(costs);
          next.recipeCosts=row<OpsRecipeCost>(recipes);
          next.menu=row<OpsMenuItem>(menu);
          break;
        }
        case "invoices":{
          const[invoices,credits,summary,purchases]=await Promise.all([
            opsRpc<unknown>("mealdeck_ops_invoice_list",period),
            opsRpc<unknown>("mealdeck_ops_credit_list",period),
            opsRpc<OpsSupplierInvoiceSummary>("mealdeck_ops_invoice_summary",period),
            opsRpc<unknown>("mealdeck_ops_purchase_list",base),
          ]);
          next.invoices=row<OpsSupplierInvoice>(invoices);
          next.credits=row<OpsSupplierCredit>(credits);
          next.invoiceSummary=summary;
          next.purchases=row<OpsPurchase>(purchases);
          break;
        }
        case "finance":{
          const[finance,expenses]=await Promise.all([
            opsRpc<OpsFinance>("mealdeck_ops_finance_summary",period),
            opsRpc<unknown>("mealdeck_ops_expense_list",period),
          ]);
          next.finance=finance;
          next.expenses=row<OpsExpense>(expenses);
          break;
        }
        case "overview":{
          const[analytics,brandSales]=await Promise.all([
            opsRpc<OpsAnalytics>("mealdeck_ops_analytics",period),
            opsRpc<unknown>("mealdeck_ops_brand_sales",period),
          ]);
          next.analytics=analytics;
          next.brandSales=row<OpsBrandSales>(brandSales);
          break;
        }
        case "team":{
          const[staff,audit]=await Promise.all([
            opsRpc<unknown>("mealdeck_ops_staff_list",{p_tenant:tenant}),
            opsRpc<unknown>("mealdeck_ops_audit_history",{p_tenant:tenant,p_limit:60}),
          ]);
          next.staff=row<OpsStaff>(staff);
          next.audit=row<OpsAudit>(audit);
          break;
        }
      }
      if(request===reqRef.current)setData(next);
    }catch(reason){
      if(request===reqRef.current){
        setError(reason instanceof Error?reason.message:"Operations data could not be loaded.");
        setData(blank());
      }
    }finally{if(request===reqRef.current)setLoading(false);}
  },[tenant,location,user,selectedSection,fromDate,toDate]);
  useEffect(()=>{if(tenant&&location&&user)void reload();},[tenant,location,user,reload]);

  async function signIn(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setAuthError("");setLoginBusy(true);
    try{
      const sb=getMealDeckOpsClient();
      const{data:result,error:issue}=await sb.auth.signInWithPassword({email:email.trim(),password});
      if(issue||!result.user)throw new Error("Staff sign-in was not accepted. Check your credentials.");
      setPassword("");
      setUser(result.user);
      await fetchAccess();
    }catch(reason){
      setAuthError(reason instanceof Error?reason.message:"Staff sign-in failed.");
    }finally{setLoginBusy(false);}
  }
  async function sendLoginLink(){
    setAuthError("");setLoginBusy(true);
    try{
      const sb=getMealDeckOpsClient();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        throw new Error("Enter your existing staff email first.");
      const{error:issue}=await sb.auth.signInWithOtp({
        email:email.trim(),
        options:{shouldCreateUser:false,emailRedirectTo:window.location.origin+"/ops"},
      });
      if(issue)throw new Error("Sign-in link could not be sent for this staff account.");
      setAuthError("Check your email for the staff sign-in link. New users are not created automatically.");
    }catch(reason){
      setAuthError(reason instanceof Error?reason.message:"Unable to send a login link.");
    }finally{setLoginBusy(false);}
  }
  async function signOut(){
    reqRef.current++;
    try{await getMealDeckOpsClient().auth.signOut();}
    finally{
      setUser(null);setAccesses([]);setTenant("");setLocation("");setData(blank());
    }
  }
  const can=(perm:OpsPermission)=>permissions.has(perm);
  const canGlobal=(perm:OpsPermission)=>globalPermissions.has(perm);
  const common={tenantId:tenant,locationId:location,can,canGlobal,reload,notice:setNotice};
  const activeLocation=locations.find(x=>x.location_id===location);

  return <div className="min-h-screen bg-[#f6f5f1] text-slate-950">
    <header className="border-b border-slate-200 bg-[#101716] text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-amber-400 p-3 text-slate-950"><ChefHat className="size-6"/></div>
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">MealDeck · Back of house</p>
            <h1 className="font-display text-2xl font-black tracking-tight">Operations & intelligence</h1></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white">
            <ArrowLeft className="size-4"/> Public website
          </Link>
          {user&&<button type="button" onClick={()=>void signOut()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 px-4 text-sm font-bold">
            <LogOut className="size-4"/> Sign out
          </button>}
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10">
      {checkingAuth?<div className={columns}><p>Checking secure staff authentication…</p></div>
      :!user?<div className="mx-auto max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div className="bg-[#132b24] p-7 text-white">
          <LockKeyhole className="size-8 text-amber-300"/>
          <h2 className="mt-4 font-display text-3xl font-black">Staff sign-in</h2>
          <p className="mt-2 text-sm leading-6 text-white/80">For approved MealDeck kitchen, finance, menu and operations staff. Accounts must be provisioned and assigned by an authorised administrator.</p>
        </div>
        <form className="space-y-4 p-7" onSubmit={event=>void signIn(event)}>
          <label className="block text-sm font-bold">Staff email
            <input type="email" autoComplete="email" required className={"mt-2 "+field}
              value={email} onChange={e=>setEmail(e.target.value)}/>
          </label>
          <label className="block text-sm font-bold">Password
            <input type="password" autoComplete="current-password" required className={"mt-2 "+field}
              value={password} onChange={e=>setPassword(e.target.value)}/>
          </label>
          {authError&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{authError}</p>}
          <button type="submit" disabled={loginBusy} className={btn+" w-full"}>Secure staff sign-in</button>
          <button type="button" disabled={loginBusy} onClick={()=>void sendLoginLink()}
            className="min-h-11 w-full rounded-xl border border-slate-300 p-3 text-sm font-semibold">
            Email me a sign-in link instead
          </button>
          <p className="text-xs text-slate-500">No public staff sign-up. Staff roles and all operational data are checked by Supabase RLS and authorised database functions; this screen alone grants no access.</p>
        </form>
      </div>:accessBusy?<div className={columns}>Checking your tenant roles…</div>
      :accesses.length===0?<div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-7 text-center">
        <ShieldCheck className="mx-auto size-10 text-amber-600"/>
        <h2 className="mt-4 text-2xl font-black">No operational access assigned</h2>
        <p className="mt-2 text-sm text-slate-600">Your login is valid, but no active MealDeck tenant or kitchen role has been assigned. Ask an authorised administrator to grant a scoped role. Signing in alone does not expose private orders, recipes or financial records.</p>
        {authError&&<p role="alert" className="mt-3 text-sm text-red-700">{authError}</p>}
      </div>:<div className="space-y-5">
        <section className="grid gap-4 rounded-3xl bg-[#132b24] p-5 text-white shadow-lg lg:grid-cols-[1fr_1fr_1.2fr]">
          <label className="text-xs font-bold uppercase tracking-wide text-white/70">Business
            <select value={tenant} onChange={e=>{reqRef.current++;setTenant(e.target.value);setNotice("");}}
              className={"mt-2 "+field}>
              {tenants.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-white/70">Kitchen / location
            <select value={location} disabled={!locations.length}
              onChange={e=>{reqRef.current++;setLocation(e.target.value);setNotice("");}}
              className={"mt-2 "+field}>
              {locations.map(x=><option key={x.location_id} value={x.location_id}>{x.location_name}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-wide text-white/70">Access verified for</p>
              <p className="mt-2 font-bold">{activeLocation?.location_name??"Choose kitchen"}</p>
              <p className="mt-1 text-xs text-white/65">{user.email??"Authenticated staff"} · {permissions.size} permissions</p></div>
            <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 px-4 text-sm font-bold"
              onClick={()=>void reload()} disabled={!location||loading}><RefreshCcw className="size-4"/> Refresh</button>
          </div>
        </section>

        <nav aria-label="Operations areas" className="flex flex-wrap gap-2">
          {accessibleSections.map(x=><button key={x.id} type="button" aria-current={x.id===selectedSection?"page":undefined}
            onClick={()=>{reqRef.current++;setSection(x.id);setNotice("");}}
            className={x.id===selectedSection?"min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white":"min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800"}>
            {x.label}
          </button>)}
        </nav>

        {(selectedSection==="overview"||selectedSection==="orders"||selectedSection==="finance"||selectedSection==="invoices")&&<section className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2"><BarChart3 className="size-5 text-amber-600"/>
            <p className="text-sm font-bold">Reporting period</p></div>
          <label className="text-xs font-semibold">From
            <input className={"ml-2 min-h-11 rounded-lg border border-slate-300 px-2"} type="date"
              value={fromDate} onChange={e=>setFromDate(e.target.value)}/>
          </label>
          <label className="text-xs font-semibold">To
            <input className={"ml-2 min-h-11 rounded-lg border border-slate-300 px-2"} type="date"
              value={toDate} onChange={e=>setToDate(e.target.value)}/>
          </label>
          <p className="text-xs text-slate-500">Up to 94 calendar days; data is scoped to one kitchen.</p>
        </section>}
        {notice&&<p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
          <ShieldCheck className="size-4 shrink-0"/>{notice}</p>}
        {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {!location?<div className={columns}><p className="font-semibold">No accessible kitchen locations. Contact your tenant administrator.</p></div>
        :loading?<div role="status" className={columns}>Loading authorised records for this kitchen…</div>
        :<div>
          {selectedSection==="overview"&&<OpsAnalyticsPanel analytics={data.analytics} brandSales={data.brandSales}/>}
          {selectedSection==="menu"&&<OpsMenuPanel {...common} menu={data.menu} taxonomy={data.taxonomy}/>}
          {selectedSection==="orders"&&<OpsOrdersPanel orders={data.orders} tenantId={tenant} locationId={location}/>}
          {selectedSection==="recipes"&&<OpsRecipePanel {...common}
            recipes={data.recipes} ingredients={data.ingredients} menu={data.menu}/>}
          {selectedSection==="ingredients"&&<OpsIngredientPanel {...common}
            ingredients={data.ingredients} stock={data.stock}/>}
          {selectedSection==="purchasing"&&<OpsProcurementPanel
            tenantId={tenant} locationId={location} staffUserId={user.id}
            suppliers={data.suppliers} purchases={data.purchases}
            ingredients={data.ingredients}
            canFinance={can("finance.manage")}
            canFinanceGlobal={canGlobal("finance.manage")}
            canReceive={can("inventory.write")}
            onRefresh={reload} onNotice={setNotice}/>}
          {selectedSection==="batches"&&<OpsStockBatchesPanel
            tenantId={tenant} locationId={location} batches={data.batches}
            canIssue={can("inventory.write")}
            onRefresh={reload} onNotice={setNotice}/>}
          {selectedSection==="costs"&&<OpsCostsPanel {...common}
            ingredients={data.ingredients} costs={data.costs}
            recipeCosts={data.recipeCosts} menu={data.menu}/>}
          {selectedSection==="invoices"&&<OpsSupplierInvoicesPanel
            tenantId={tenant} locationId={location} staffUserId={user.id}
            invoices={data.invoices} credits={data.credits}
            summary={data.invoiceSummary} purchaseOrders={data.purchases}
            canManage={can("finance.manage")}
            canManageGlobal={canGlobal("finance.manage")}
            refresh={reload} notify={setNotice}/>}
          {selectedSection==="finance"&&<OpsFinancePanel {...common}
            finance={data.finance} expenses={data.expenses}/>}
          {selectedSection==="team"&&<OpsTeamPanel {...common} staff={data.staff} audit={data.audit} locations={locations}/>}
        </div>}
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Store className="size-4"/> Records are from the approved Dishbee data source. Owner approval is required for tenant-wide editing.
          <UserRoundCog className="ml-2 size-4"/> No automatic staff invitations or checkout activation.
          <ClipboardList className="ml-2 size-4"/> Coming-soon customer ordering remains closed.
        </p>
      </div>}
    </main>
  </div>;
}
