import {useEffect,useState,type ReactNode} from "react";
import {
  AlertCircle,BookOpen,ClipboardList,
  Plus,ShieldCheck,Trash2,
} from "lucide-react";
import {opsRpc} from "@/lib/mealdeck-ops-browser";
import {OPS_PERMISSIONS,type OpsPermission} from "@/lib/mealdeck-ops-access";
import {penceToPounds,poundsToPence,packCostPerBaseUnit,estimatedRecipeMargin,cleanDailySeries} from "@/lib/mealdeck-ops-math";
import type {
  OpsMenuItem,OpsTaxonomy,OpsIngredient,OpsOrder,
  OpsRecipe,OpsStock,OpsCost,OpsRecipeCost,OpsExpense,
  OpsFinance,OpsAnalytics,OpsStaff,
} from "@/lib/mealdeck-ops-types";

const field="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-amber-500";
const primary="min-h-11 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50";
const secondary="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50";
const card="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const empty="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500";

type Common={
  tenantId:string;locationId:string;
  can:(permission:OpsPermission)=>boolean;
  canGlobal:(permission:OpsPermission)=>boolean;
  reload:()=>Promise<void>;
  notice:(message:string)=>void;
};
function Labelled({label,children}:{label:string;children:ReactNode}){
  return <label className="block text-sm font-semibold text-slate-800">
    {label}<span className="mt-2 block">{children}</span>
  </label>;
}
function Status({label}:{label:string}){
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">{label}</span>;
}
function useCommit({reload,notice}:Pick<Common,"reload"|"notice">){
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState("");
  async function commit(work:()=>Promise<unknown>,success:string){
    setBusy(true);setError("");
    try{
      await work();
      await reload();
      notice(success);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Unable to save. Please retry.");
    }finally{setBusy(false);}
  }
  return{busy,error,commit};
}
function ErrorRow({error}:{error:string}){
  return error?<p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">
    <AlertCircle className="mt-0.5 size-4 shrink-0"/>{error}
  </p>:null;
}

export function OpsMenuPanel(props:Common&{
  menu:OpsMenuItem[];taxonomy:OpsTaxonomy[];
}){
  const{menu,taxonomy,tenantId,locationId,can,canGlobal,reload,notice}=props;
  const{busy,error,commit}=useCommit({reload,notice});
  const[query,setQuery]=useState("");
  const[editing,setEditing]=useState("");
  const[name,setName]=useState("");
  const[description,setDescription]=useState("");
  const[price,setPrice]=useState("");
  const[active,setActive]=useState(true);
  const[category,setCategory]=useState("");
  const[newName,setNewName]=useState("");
  const[newPrice,setNewPrice]=useState("");
  const[newDesc,setNewDesc]=useState("");
  const current=menu.find(row=>row.item_id===editing);
  const filtered=menu.filter(row=>(row.item_name+" "+(row.brand_name??"")+" "+row.category_name)
    .toLowerCase().includes(query.toLowerCase())).slice(0,120);
  const selection=taxonomy.find(x=>x.category_id===category);
  const globalWrite=canGlobal("menu.write");
  function choose(row:OpsMenuItem){
    setEditing(row.item_id);
    setName(row.item_name);
    setDescription(row.description??"");
    setPrice((row.price_pence/100).toFixed(2));
    setActive(row.active);
  }
  return <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-black">Brand menus</h2>
          <p className="mt-1 text-sm text-slate-500">Canonical Dishbee products, with MealDeck location visibility.</p>
        </div><Status label={menu.length+" products"}/>
      </div>
      <Labelled label="Search menus and brands">
        <input type="search" value={query} onChange={e=>setQuery(e.target.value)} className={field}
          placeholder="Burger, Skorch, drinks, tacos…"/>
      </Labelled>
      <div className="mt-4 max-h-[34rem] space-y-2 overflow-y-auto pr-1">
        {filtered.map(row=><div key={row.item_id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-amber-700">{row.brand_name??"Unassigned"} · {row.category_name}</p>
            <p className="mt-1 font-bold">{row.item_name}</p>
            <p className="text-sm text-slate-500">{penceToPounds(row.location_price_pence)} · {row.visible&&row.active?"Visible":"Hidden or inactive"}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <button type="button" className={secondary} onClick={()=>choose(row)}>Edit</button>
            {can("menu.write")&&<button type="button" className={secondary} disabled={busy}
              onClick={()=>void commit(async()=>{
                const ok=await opsRpc<boolean>("mealdeck_ops_set_menu_visibility",{
                  p_tenant:tenantId,p_location:locationId,p_item:row.item_id,p_visible:!row.visible,
                });
                if(!ok)throw new Error("Visibility was not changed.");
              },"Menu channel visibility updated. Other channels are unchanged.")}>
              {row.visible?"Hide":"Show"}
            </button>}
          </div>
        </div>)}
        {filtered.length===0&&<div className={empty}>No products match the search, or your tenant has no menu records.</div>}
      </div>
    </section>
    <div className="space-y-5">
      <section className={card}>
        <h2 className="text-lg font-black">Edit master product</h2>
        <p className="mt-1 text-xs text-slate-500">Price and name changes affect the shared canonical Dishbee item. A tenant-wide menu role is required. Channel-specific price overrides may still apply.</p>
        {!current?<p className="mt-4 text-sm text-slate-500">Select a product from the list to edit it.</p>:<div className="mt-4 space-y-3">
          <Labelled label="Product name"><input value={name} disabled={!globalWrite||busy}
            onChange={e=>setName(e.target.value)} className={field}/></Labelled>
          <Labelled label="Description"><textarea value={description} rows={3} disabled={!globalWrite||busy}
            onChange={e=>setDescription(e.target.value)} className={field}/></Labelled>
          <Labelled label="Base price (£)"><input inputMode="decimal" value={price}
            disabled={!globalWrite||busy} onChange={e=>setPrice(e.target.value)} className={field}/></Labelled>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={active}
            disabled={!globalWrite||busy} onChange={e=>setActive(e.target.checked)} className="size-5"/> Active in canonical menu</label>
          <button type="button" className={primary} disabled={!globalWrite||busy}
            onClick={()=>void commit(async()=>{
              const value=poundsToPence(price);
              if(value===null)throw new Error("Enter a valid price with no more than two decimals.");
              const saved=await opsRpc<boolean>("mealdeck_ops_update_menu_item",{
                p_tenant:tenantId,p_item:current.item_id,p_name:name,
                p_description:description,p_price_pence:value,p_active:active,
              });
              if(!saved)throw new Error("Product no longer exists.");
            },"Canonical product saved.")}>Save product</button>
        </div>}
      </section>
      {globalWrite&&<section className={card}>
        <h2 className="text-lg font-black">Add product</h2>
        <p className="mt-1 text-sm text-slate-500">Choose an existing approved brand and category. New products do not bypass station routing or live availability checks.</p>
        <div className="mt-3 space-y-3">
          <Labelled label="Brand / category"><select className={field} value={category}
            onChange={e=>setCategory(e.target.value)}>
            <option value="">Choose category…</option>
            {taxonomy.map(x=><option key={x.category_id} value={x.category_id}>{x.brand_name} · {x.category_name}</option>)}
          </select></Labelled>
          <Labelled label="Dish name"><input value={newName} onChange={e=>setNewName(e.target.value)} className={field}/></Labelled>
          <Labelled label="Base price (£)"><input value={newPrice} inputMode="decimal"
            onChange={e=>setNewPrice(e.target.value)} className={field}/></Labelled>
          <Labelled label="Description"><textarea value={newDesc} rows={2}
            onChange={e=>setNewDesc(e.target.value)} className={field}/></Labelled>
          <button type="button" className={primary} disabled={busy||!selection}
            onClick={()=>void commit(async()=>{
              const value=poundsToPence(newPrice);
              if(value===null||!selection)throw new Error("Choose a category and valid price.");
              await opsRpc("mealdeck_ops_create_menu_item",{
                p_tenant:tenantId,p_brand:selection.brand_id,p_category:selection.category_id,
                p_name:newName,p_description:newDesc,p_price_pence:value,
              });
              setNewName("");setNewPrice("");setNewDesc("");
            },"Product created in the canonical menu. Check KDS routes and channel availability before publishing.")}>
            <Plus className="mr-1 inline size-4"/> Add product
          </button>
        </div>
      </section>}
      <ErrorRow error={error}/>
    </div>
  </div>;
}

export function OpsOrdersPanel({orders}:{orders:OpsOrder[]}){
  return <section className={card}>
    <div className="flex items-start gap-3">
      <ClipboardList className="mt-1 size-6 text-amber-600"/>
      <div><h2 className="text-xl font-black">Order history</h2>
        <p className="mt-1 text-sm text-slate-500">Real Dishbee orders only. Payment pending is not a completed sale; marketplace order numbers and delivery proofs will follow canonical provider integrations.</p>
      </div>
    </div>
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
          {["Order","Channel","Fulfilment","Received","Items","Amount","Status","Paid"].map(x=><th key={x} className="whitespace-nowrap px-3 py-3">{x}</th>)}
        </tr></thead>
        <tbody>{orders.map(row=><tr key={row.order_id} className="border-b border-slate-100">
          <td className="whitespace-nowrap px-3 py-4 font-bold">{row.order_id.slice(0,8).toUpperCase()}</td>
          <td className="px-3 py-4">{row.source??"—"}</td>
          <td className="px-3 py-4">{row.fulfilment}</td>
          <td className="whitespace-nowrap px-3 py-4">{new Date(row.created_at).toLocaleString("en-GB")}</td>
          <td className="px-3 py-4">{row.item_count}</td>
          <td className="whitespace-nowrap px-3 py-4 font-bold">{penceToPounds(row.total_pence)}</td>
          <td className="px-3 py-4"><Status label={row.status}/></td>
          <td className="px-3 py-4">{row.paid_at?"Recorded paid":"Not recorded"}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {orders.length===0&&<div className={empty}>No orders are available for this period and kitchen. Sample baskets are not included.</div>}
  </section>;
}

export function OpsRecipePanel(props:Common&{
  recipes:OpsRecipe[];ingredients:OpsIngredient[];menu:OpsMenuItem[];
}){
  const{recipes,ingredients,menu,tenantId,canGlobal,reload,notice}=props;
  const{busy,error,commit}=useCommit({reload,notice});
  const[item,setItem]=useState("");
  const[yieldUnits,setYieldUnits]=useState("1");
  const[prep,setPrep]=useState("10");
  const[instructions,setInstructions]=useState("");
  const[lines,setLines]=useState<Array<{ingredientId:string;quantity:string;wastePercent:string}>>([]);
  const recipe=recipes.find(x=>x.menu_item_id===item);
  useEffect(()=>{
    if(!item)return;
    const selected=recipes.find(x=>x.menu_item_id===item);
    setYieldUnits(String(selected?.yield_units??1));
    setPrep(String(selected?.prep_minutes??10));
    setInstructions(selected?.instructions??"");
    setLines((selected?.ingredients??[]).map(x=>({
      ingredientId:x.ingredientId,quantity:String(x.quantity),
      wastePercent:String(x.wastePercent),
    })));
  },[item,recipes]);
  const canEdit=canGlobal("recipes.write");
  return <div className="grid gap-5 xl:grid-cols-[1fr_1.25fr]">
    <section className={card}>
      <div className="flex items-center gap-3"><BookOpen className="size-6 text-amber-600"/>
        <div><h2 className="text-xl font-black">Recipe library</h2>
          <p className="text-sm text-slate-500">Production yields, ingredient amounts and recipe versions.</p>
        </div></div>
      <div className="mt-5 space-y-2">
        {recipes.map(entry=><button key={entry.recipe_id} type="button" onClick={()=>setItem(entry.menu_item_id)}
          aria-pressed={item===entry.menu_item_id}
          className={"w-full rounded-xl border p-4 text-left "+(item===entry.menu_item_id?"border-amber-500 bg-amber-50":"border-slate-200")}>
          <p className="text-xs font-bold uppercase text-amber-700">{entry.brand_name??"MealDeck"} · v{entry.version}</p>
          <p className="mt-1 font-bold">{entry.item_name}</p>
          <p className="text-sm text-slate-500">{entry.ingredients.length} ingredients · {entry.prep_minutes} minutes</p>
        </button>)}
        {recipes.length===0&&<div className={empty}>No recipes entered. A staff member with global recipe permission can add the first one.</div>}
      </div>
    </section>
    <section className={card}>
      <h2 className="text-xl font-black">{recipe?"Edit recipe":"Create recipe"}</h2>
      <p className="mt-1 text-sm text-slate-500">Every save increments the recipe version; prior ingredient quantities are retained in an audit snapshot. Only approved users can edit recipes across locations.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Labelled label="Dish"><select className={field} value={item}
          onChange={e=>setItem(e.target.value)}>
          <option value="">Select a canonical dish…</option>
          {menu.map(x=><option key={x.item_id} value={x.item_id}>{x.brand_name??"MealDeck"} · {x.item_name}</option>)}
        </select></Labelled></div>
        <Labelled label="Recipe yield (portions)"><input className={field} value={yieldUnits}
          inputMode="decimal" onChange={e=>setYieldUnits(e.target.value)}/></Labelled>
        <Labelled label="Prep time (minutes)"><input className={field} value={prep}
          inputMode="numeric" onChange={e=>setPrep(e.target.value)}/></Labelled>
        <div className="sm:col-span-2"><Labelled label="Method and kitchen instructions">
          <textarea className={field} rows={6} value={instructions}
            onChange={e=>setInstructions(e.target.value)} placeholder="Prep stages, safe handling, station notes…"/>
        </Labelled></div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-black">Ingredients (base unit)</h3>
        {canEdit&&<button type="button" className={secondary} onClick={()=>setLines(old=>[
          ...old,{ingredientId:"",quantity:"",wastePercent:"0"},
        ])}><Plus className="mr-1 inline size-4"/> Add ingredient</button>}
      </div>
      <div className="mt-3 space-y-3">{lines.map((line,index)=><div key={index}
        className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_110px_100px_44px]">
        <select aria-label={"Ingredient "+(index+1)} value={line.ingredientId}
          onChange={e=>setLines(old=>old.map((x,i)=>i===index?{...x,ingredientId:e.target.value}:x))}
          className={field}>
          <option value="">Choose ingredient…</option>
          {ingredients.filter(x=>x.active).map(x=><option value={x.ingredient_id} key={x.ingredient_id}>
            {x.name} ({x.base_unit})
          </option>)}
        </select>
        <input aria-label={"Quantity "+(index+1)} inputMode="decimal" className={field} value={line.quantity}
          onChange={e=>setLines(old=>old.map((x,i)=>i===index?{...x,quantity:e.target.value}:x))}/>
        <input aria-label={"Waste percentage "+(index+1)} inputMode="decimal" className={field}
          value={line.wastePercent}
          onChange={e=>setLines(old=>old.map((x,i)=>i===index?{...x,wastePercent:e.target.value}:x))}/>
        <button type="button" title="Remove ingredient" aria-label={"Remove ingredient "+(index+1)}
          onClick={()=>setLines(old=>old.filter((_,i)=>i!==index))} className={secondary}>
          <Trash2 className="size-4"/></button>
      </div>)}</div>
      <p className="mt-3 text-xs text-slate-500">Base units are grams, millilitres or each. Quantities and waste percentages are included in estimated food cost. No allergen-free claim is inferred from a recipe.</p>
      <div className="mt-4">
        <button type="button" className={primary} disabled={!item||!canEdit||busy}
          onClick={()=>void commit(async()=>{
            const quantity=Number(yieldUnits),minutes=Number(prep);
            if(!Number.isFinite(quantity)||quantity<=0||!Number.isInteger(minutes)||minutes<0)
              throw new Error("Enter a positive yield and whole prep time.");
            if(lines.some(x=>!x.ingredientId||!(Number(x.quantity)>0)||
                !Number.isFinite(Number(x.wastePercent))||Number(x.wastePercent)<0||
                Number(x.wastePercent)>100)){
              throw new Error("Choose every ingredient and valid quantity/waste values.");
            }
            await opsRpc("mealdeck_ops_save_recipe",{
              p_tenant:tenantId,p_item:item,p_yield:quantity,p_prep:minutes,
              p_instructions:instructions,p_ingredients:lines.map(x=>({
                ingredientId:x.ingredientId,quantity:Number(x.quantity),
                wastePercent:Number(x.wastePercent),
              })),
            });
          },"Recipe saved, with prior version retained.")}>Save recipe version</button>
      </div>
      <ErrorRow error={error}/>
    </section>
  </div>;
}

export function OpsIngredientPanel(props:Common&{
  ingredients:OpsIngredient[];stock:OpsStock[];
}){
  const{ingredients,stock,tenantId,locationId,can,canGlobal,reload,notice}=props;
  const{busy,error,commit}=useCommit({reload,notice});
  const[name,setName]=useState("");
  const[unit,setUnit]=useState<"g"|"ml"|"each">("g");
  const[reorder,setReorder]=useState("0");
  const[allergens,setAllergens]=useState("");
  const[ingredientId,setIngredientId]=useState("");
  const[delta,setDelta]=useState("");
  const[reason,setReason]=useState("purchase");
  const[note,setNote]=useState("");
  return <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
    <section className={card}>
      <h2 className="text-xl font-black">Ingredient stock</h2>
      <p className="mt-1 text-sm text-slate-500">Append-only purchase, production and waste movements. No automatic stock deductions or accounting postings are claimed.</p>
      <div className="mt-5 overflow-x-auto"><table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500"><tr>
          {["Ingredient","On hand","Reorder","State"].map(x=><th key={x} className="px-3 py-3">{x}</th>)}
        </tr></thead>
        <tbody>{stock.map(row=><tr key={row.ingredient_id} className="border-t border-slate-100">
          <td className="px-3 py-3 font-bold">{row.name}</td>
          <td className="px-3 py-3">{row.quantity} {row.base_unit}</td>
          <td className="px-3 py-3">{row.reorder_threshold} {row.base_unit}</td>
          <td className="px-3 py-3">{row.quantity<=row.reorder_threshold?<span className="font-bold text-amber-700">Check stock</span>:"—"}</td>
        </tr>)}</tbody>
      </table></div>
      {!stock.length&&<div className={empty}>No stock or ingredients have been recorded for this location.</div>}
    </section>
    <div className="space-y-5">
      {canGlobal("recipes.write")&&<section className={card}>
        <h2 className="text-lg font-black">Create ingredient</h2>
        <div className="mt-4 space-y-3">
          <Labelled label="Ingredient name"><input className={field} value={name}
            onChange={e=>setName(e.target.value)}/></Labelled>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labelled label="Base unit"><select className={field} value={unit}
              onChange={e=>setUnit(e.target.value as typeof unit)}>
              <option value="g">Grams (g)</option><option value="ml">Millilitres (ml)</option><option value="each">Each</option>
            </select></Labelled>
            <Labelled label="Reorder at quantity"><input className={field}
              inputMode="decimal" value={reorder} onChange={e=>setReorder(e.target.value)}/></Labelled>
          </div>
          <Labelled label="Known allergens (comma-separated)"><input className={field}
            value={allergens} onChange={e=>setAllergens(e.target.value)}
            placeholder="e.g. milk, nuts"/></Labelled>
          <button type="button" className={primary} disabled={busy}
            onClick={()=>void commit(async()=>{
              await opsRpc("mealdeck_ops_upsert_ingredient",{
                p_tenant:tenantId,p_id:null,p_name:name,p_unit:unit,
                p_allergens:allergens.split(",").map(x=>x.trim()).filter(Boolean),
                p_reorder:Number(reorder),
              });
              setName("");setAllergens("");
            },"Ingredient created.")}>Add ingredient</button>
        </div>
      </section>}
      {can("inventory.write")&&<section className={card}>
        <h2 className="text-lg font-black">Record stock movement</h2>
        <div className="mt-4 space-y-3">
          <Labelled label="Ingredient"><select className={field} value={ingredientId}
            onChange={e=>setIngredientId(e.target.value)}>
            <option value="">Select ingredient…</option>
            {ingredients.map(x=><option key={x.ingredient_id} value={x.ingredient_id}>{x.name} ({x.base_unit})</option>)}
          </select></Labelled>
          <Labelled label="Quantity change (+ or -)"><input className={field}
            inputMode="decimal" value={delta} onChange={e=>setDelta(e.target.value)}/></Labelled>
          <Labelled label="Movement type"><select className={field} value={reason}
            onChange={e=>setReason(e.target.value)}>
            {["opening","purchase","production","waste","adjustment","transfer_in","transfer_out"].map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}
          </select></Labelled>
          <Labelled label="Reason / reference"><input className={field} value={note}
            onChange={e=>setNote(e.target.value)} maxLength={300}/></Labelled>
          <button type="button" className={primary} disabled={busy||!ingredientId}
            onClick={()=>void commit(async()=>{
              const qty=Number(delta);
              if(!Number.isFinite(qty)||qty===0)throw new Error("Enter a non-zero quantity.");
              await opsRpc("mealdeck_ops_record_stock",{
                p_tenant:tenantId,p_location:locationId,p_ingredient:ingredientId,
                p_delta:qty,p_reason:reason,p_note:note,
              });
              setDelta("");setNote("");
            },"Append-only stock movement saved.")}>Record movement</button>
        </div>
      </section>}
      <ErrorRow error={error}/>
    </div>
  </div>;
}

export function OpsCostsPanel(props:Common&{
  ingredients:OpsIngredient[];costs:OpsCost[];
  recipeCosts:OpsRecipeCost[];menu:OpsMenuItem[];
}){
  const{tenantId,locationId,can,ingredients,costs,recipeCosts,menu,reload,notice}=props;
  const{busy,error,commit}=useCommit({reload,notice});
  const[ingredientId,setIngredientId]=useState("");
  const[packPrice,setPackPrice]=useState("");
  const[packSize,setPackSize]=useState("1000");
  const[supplier,setSupplier]=useState("");
  const[effectiveOn,setEffectiveOn]=useState(new Date().toISOString().slice(0,10));
  return <div className="space-y-5">
    <section className={card}>
      <h2 className="text-xl font-black">Dish costing and margin estimates</h2>
      <p className="mt-1 text-sm text-slate-500">The recipe BOM uses the latest recorded supplier price at this location. This is an ingredient-only estimate, not realised COGS, gross profit, VAT, fees, packaging or delivery contribution.</p>
      <div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500"><tr>
          {["Dish","Version","Menu price","Est. ingredients","Est. food-cost %","Missing quotes"].map(x=><th key={x} className="whitespace-nowrap px-3 py-3">{x}</th>)}
        </tr></thead>
        <tbody>{recipeCosts.map(row=>{
          const sale=menu.find(i=>i.item_id===row.menu_item_id)?.location_price_pence??null;
          const margin=sale===null?null:estimatedRecipeMargin(sale,row.estimated_cost_pence);
          return <tr key={row.menu_item_id} className="border-t border-slate-100">
            <td className="px-3 py-3 font-bold">{row.menu_item_name}</td>
            <td className="px-3 py-3">v{row.recipe_version}</td>
            <td className="px-3 py-3">{sale===null?"—":penceToPounds(sale)}</td>
            <td className="px-3 py-3">{row.estimated_cost_pence===null?"Incomplete":penceToPounds(row.estimated_cost_pence)}</td>
            <td className="px-3 py-3">{margin?margin.foodCostPercent.toFixed(1)+"%":"—"}</td>
            <td className="px-3 py-3">{row.missing_ingredient_costs||"—"}</td>
          </tr>;
        })}</tbody>
      </table></div>
      {recipeCosts.length===0&&<div className={empty}>Enter recipes and supplier costs before a margin estimate is available.</div>}
    </section>
    <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <section className={card}>
        <h2 className="text-lg font-black">Supplier cost history</h2>
        <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
          {costs.map(row=><div key={row.ingredient_id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm">
            <div><p className="font-bold">{row.ingredient_name}</p>
              <p className="text-xs text-slate-500">{row.supplier||"No supplier"} · {row.effective_on??"No quote"}</p></div>
            <span className="font-bold">{row.cost_per_unit_pence===null?"Missing":row.cost_per_unit_pence+"p/"+row.base_unit}</span>
          </div>)}
        </div>
      </section>
      {can("costs.write")&&<section className={card}>
        <h2 className="text-lg font-black">Record a supplier pack price</h2>
        <p className="mt-1 text-xs text-slate-500">Enter the net pack price and pack size in grams, millilitres or units. We calculate the price per base unit; historical effective dates are retained.</p>
        <div className="mt-4 space-y-3">
          <Labelled label="Ingredient"><select className={field} value={ingredientId}
            onChange={e=>setIngredientId(e.target.value)}>
            <option value="">Select ingredient…</option>
            {ingredients.map(x=><option key={x.ingredient_id} value={x.ingredient_id}>{x.name} ({x.base_unit})</option>)}
          </select></Labelled>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labelled label="Pack price (£, excluding VAT)"><input value={packPrice}
              inputMode="decimal" className={field} onChange={e=>setPackPrice(e.target.value)}/></Labelled>
            <Labelled label="Pack size (base units)"><input value={packSize}
              inputMode="decimal" className={field} onChange={e=>setPackSize(e.target.value)}/></Labelled>
          </div>
          <Labelled label="Supplier"><input className={field} value={supplier} maxLength={160}
            onChange={e=>setSupplier(e.target.value)}/></Labelled>
          <Labelled label="Effective date"><input type="date" className={field}
            value={effectiveOn} onChange={e=>setEffectiveOn(e.target.value)}/></Labelled>
          <button className={primary} type="button" disabled={busy||!ingredientId}
            onClick={()=>void commit(async()=>{
              const pence=poundsToPence(packPrice);
              const perUnit=pence===null?null:packCostPerBaseUnit(pence,Number(packSize));
              if(perUnit===null)throw new Error("Enter a valid pack price and positive pack size.");
              await opsRpc("mealdeck_ops_record_ingredient_cost",{
                p_tenant:tenantId,p_location:locationId,p_ingredient:ingredientId,
                p_effective:effectiveOn,p_supplier:supplier,p_unit_cost:perUnit,
              });
              setPackPrice("");
            },"Supplier cost quote saved; menu prices and past orders unchanged.")}>Save cost quote</button>
        </div>
        <ErrorRow error={error}/>
      </section>}
    </div>
  </div>;
}

export function OpsFinancePanel(props:Common&{
  finance:OpsFinance|null;expenses:OpsExpense[];
}){
  const{finance,expenses,tenantId,locationId,can,reload,notice}=props;
  const{busy,error,commit}=useCommit({reload,notice});
  const[category,setCategory]=useState("supplies");
  const[amount,setAmount]=useState("");
  const[date,setDate]=useState(new Date().toISOString().slice(0,10));
  const[note,setNote]=useState("");
  const metrics=[
    {label:"Recorded paid orders",value:String(finance?.recordedPaidOrders??"—")},
    {label:"Recorded gross paid",value:finance?penceToPounds(finance.recordedPaidGrossPence):"—"},
    {label:"Pending order value",value:finance?penceToPounds(finance.pendingOrderValuePence):"—"},
    {label:"Settled Hive refunds",value:finance?penceToPounds(finance.settledHiveRefundsPence):"—"},
    {label:"Manually recorded expenses",value:finance?penceToPounds(finance.recordedManualExpensesPence):"—"},
  ];
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {metrics.map(x=><div key={x.label} className={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{x.label}</p>
        <p className="mt-3 text-2xl font-black">{x.value}</p>
      </div>)}
    </div>
    <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <ShieldCheck className="mt-0.5 size-5 shrink-0"/>
      <p><b>Not an audited profit-and-loss statement.</b> Paid totals are recorded in Dishbee, not independently bank-reconciled. Refunds are settled Hive allocations; manual expenses may be incomplete. VAT, actual stock consumption, provider fees, payroll accruals and merchant settlement verification are not yet calculated.</p>
    </div>
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <section className={card}>
        <h2 className="text-lg font-black">Recorded operating expenses</h2>
        <div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500"><tr>
            {["Date","Category","Amount","Note"].map(x=><th key={x} className="px-3 py-3">{x}</th>)}
          </tr></thead>
          <tbody>{expenses.map(x=><tr key={x.expense_id} className="border-t border-slate-100">
            <td className="px-3 py-3">{x.occurred_on}</td><td className="px-3 py-3">{x.category}</td>
            <td className="px-3 py-3 font-semibold">{penceToPounds(x.amount_pence)}</td>
            <td className="px-3 py-3">{x.note||"—"}</td>
          </tr>)}</tbody>
        </table></div>
        {expenses.length===0&&<div className={empty}>No manual expenses recorded for this period.</div>}
      </section>
      {can("finance.manage")&&<section className={card}>
        <h2 className="text-lg font-black">Record an expense</h2>
        <p className="mt-1 text-xs text-slate-500">Creates an append-only operations record; it does not post to the ledger, bank, HMRC or Adyen.</p>
        <div className="mt-4 space-y-3">
          <Labelled label="Date"><input type="date" className={field} value={date}
            onChange={e=>setDate(e.target.value)}/></Labelled>
          <Labelled label="Category"><select className={field} value={category}
            onChange={e=>setCategory(e.target.value)}>
            {["labour","rent","utilities","marketing","packaging","supplies","software","repair","transport","other"].map(x=><option key={x} value={x}>{x}</option>)}
          </select></Labelled>
          <Labelled label="Amount (£)"><input className={field} inputMode="decimal" value={amount}
            onChange={e=>setAmount(e.target.value)}/></Labelled>
          <Labelled label="Reference / note"><input className={field} value={note}
            onChange={e=>setNote(e.target.value)}/></Labelled>
          <button className={primary} type="button" disabled={busy}
            onClick={()=>void commit(async()=>{
              const pence=poundsToPence(amount);
              if(pence===null||pence<=0)throw new Error("A valid positive expense is required.");
              await opsRpc("mealdeck_ops_add_expense",{
                p_tenant:tenantId,p_location:locationId,p_date:date,p_category:category,
                p_amount_pence:pence,p_note:note,
              });
              setAmount("");setNote("");
            },"Expense recorded; reconciliation is still required.")}>Save expense</button>
          <ErrorRow error={error}/>
        </div>
      </section>}
    </div>
  </div>;
}

export function OpsAnalyticsPanel({analytics}:{analytics:OpsAnalytics|null}){
  const points=cleanDailySeries(analytics?.daily);
  const biggest=Math.max(1,...points.map(x=>x.grossPence));
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className={card}><p className="text-sm text-slate-500">Recorded paid orders</p>
        <p className="mt-2 text-3xl font-black">{analytics?.paidOrders??"—"}</p></div>
      <div className={card}><p className="text-sm text-slate-500">Recorded paid gross</p>
        <p className="mt-2 text-3xl font-black">{analytics?penceToPounds(analytics.recordedPaidGrossPence):"—"}</p></div>
      <div className={card}><p className="text-sm text-slate-500">Reporting basis</p>
        <p className="mt-2 text-sm font-bold">Dishbee paid_at, by kitchen</p>
        <p className="mt-1 text-xs text-slate-500">Not independently settled or VAT-adjusted.</p></div>
    </div>
    <section className={card}>
      <h2 className="text-xl font-black">Recorded paid sales by day</h2>
      <p className="mt-1 text-sm text-slate-500">Only canonical Dishbee orders with a recorded paid_at timestamp. No sample sales or estimated refunds.</p>
      {points.length?<div className="mt-6 flex h-56 items-end gap-2 overflow-x-auto border-b border-slate-200 pb-2">
        {points.map(p=><div key={p.date} className="flex min-w-7 flex-1 flex-col items-center gap-2"
          title={p.date+": "+penceToPounds(p.grossPence)+" · "+p.orders+" orders"}>
          <div role="img" aria-label={p.date+": "+penceToPounds(p.grossPence)}
            style={{height:Math.max(3,Math.round(p.grossPence/biggest*175))}}
            className="w-full max-w-10 rounded-t-lg bg-amber-500"/>
          <span className="text-[10px] text-slate-500">{p.date.slice(5)}</span>
        </div>)}
      </div>:<div className={empty}>No recorded paid orders in the selected period.</div>}
    </section>
    <section className={card}>
      <h2 className="text-xl font-black">Source-channel breakdown</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(analytics?.channels??[]).map(row=><div key={row.source} className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{row.source}</p>
          <p className="mt-2 text-2xl font-black">{penceToPounds(row.grossPence)}</p>
          <p className="mt-1 text-sm text-slate-600">{row.orders} recorded paid orders</p>
        </div>)}
      </div>
      {!analytics?.channels.length&&<p className="mt-3 text-sm text-slate-500">No verified channel totals available.</p>}
    </section>
  </div>;
}

export function OpsTeamPanel(props:Common&{
  staff:OpsStaff[];
}){
  const{staff,tenantId,locationId,canGlobal,reload,notice}=props;
  const{busy,error,commit}=useCommit({reload,notice});
  const[user,setUser]=useState("");
  const[role,setRole]=useState("viewer");
  const[scope,setScope]=useState("location");
  const[enabled,setEnabled]=useState(true);
  const[grants,setGrants]=useState<string[]>([]);
  const[denies,setDenies]=useState<string[]>([]);
  const ownerOrAdmin=canGlobal("staff.manage");
  function toggle(value:string,mode:"grant"|"deny"){
    if(mode==="grant"){
      setGrants(old=>old.includes(value)?old.filter(x=>x!==value):[...old,value]);
      setDenies(old=>old.filter(x=>x!==value));
    }else{
      setDenies(old=>old.includes(value)?old.filter(x=>x!==value):[...old,value]);
      setGrants(old=>old.filter(x=>x!==value));
    }
  }
  return <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
    <section className={card}>
      <div className="flex items-center gap-3"><ShieldCheck className="size-6 text-amber-600"/>
        <div><h2 className="text-xl font-black">Staff role assignments</h2>
          <p className="text-sm text-slate-500">Account access is enforced by tenant and kitchen in PostgreSQL, independently of this screen.</p>
        </div></div>
      <div className="mt-5 max-h-[36rem] space-y-2 overflow-y-auto">
        {staff.map(row=><div key={row.access_id} className="rounded-xl border border-slate-200 p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="font-bold">{row.user_email??row.user_id.slice(0,8)}</p>
            <Status label={row.enabled?row.role:row.role+" · disabled"}/>
          </div>
          <p className="mt-2 text-xs text-slate-600">Scope: {row.location_id?row.location_id.slice(0,8)+"…":"All tenant locations"}</p>
          {(row.grant_permissions.length>0||row.deny_permissions.length>0)&&
            <p className="mt-1 text-xs text-slate-500">Extra grants: {row.grant_permissions.length} · Denials: {row.deny_permissions.length}</p>}
          {ownerOrAdmin&&<button type="button" className="mt-2 min-h-10 text-sm font-semibold underline"
            onClick={()=>{setUser(row.user_id);setRole(row.role);setScope(row.location_id?"location":"global");
              setEnabled(row.enabled);setGrants(row.grant_permissions);setDenies(row.deny_permissions);}}>
            Edit assignment
          </button>}
        </div>)}
        {staff.length===0&&<div className={empty}>No visible staff assignments for this tenant.</div>}
      </div>
    </section>
    {ownerOrAdmin&&<section className={card}>
      <h2 className="text-xl font-black">Assign or update staff</h2>
      <p className="mt-1 text-sm text-slate-500">Provision the user in Supabase Auth first. Enter their verified UID; this page cannot create an Auth user or send an invitation. You cannot edit your own access.</p>
      <div className="mt-4 space-y-3">
        <Labelled label="Provisioned staff user UUID"><input className={field} value={user}
          autoComplete="off" onChange={e=>setUser(e.target.value.trim())}/></Labelled>
        <Labelled label="Role"><select className={field} value={role} onChange={e=>setRole(e.target.value)}>
          {["owner","admin","operations","kitchen","menu","finance","analyst","viewer"].map(x=><option key={x} value={x}>{x}</option>)}
        </select></Labelled>
        <Labelled label="Scope"><select className={field} value={scope} onChange={e=>setScope(e.target.value)}>
          <option value="location">Selected kitchen only</option><option value="global">All locations in tenant</option>
        </select></Labelled>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="size-5" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>
          Assignment enabled
        </label>
        <div><p className="text-sm font-black">Permission overrides</p>
          <p className="mt-1 text-xs text-slate-500">Role defaults apply first; explicit denials win. Owner/admin assignment remains restricted by the database.</p>
          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-3">
            {OPS_PERMISSIONS.map(permission=><div key={permission} className="grid grid-cols-[1fr_70px_70px] items-center gap-2 py-1 text-xs">
              <span className="font-semibold">{permission}</span>
              <label className="flex items-center gap-1"><input type="checkbox" checked={grants.includes(permission)}
                onChange={()=>toggle(permission,"grant")}/> Grant</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={denies.includes(permission)}
                onChange={()=>toggle(permission,"deny")}/> Deny</label>
            </div>)}
          </div>
        </div>
        <button type="button" className={primary} disabled={busy||!user}
          onClick={()=>void commit(async()=>{
            if(!/^[0-9a-f-]{36}$/i.test(user))throw new Error("A valid staff Auth UUID is required.");
            await opsRpc("mealdeck_ops_assign_staff",{
              p_tenant:tenantId,p_user:user,
              p_location:scope==="global"?null:locationId,
              p_role:role,p_grants:grants,p_denies:denies,p_enabled:enabled,
            });
          },"Staff role assignment saved and restricted by database permissions.")}>
          Save staff access
        </button>
        <ErrorRow error={error}/>
      </div>
    </section>}
  </div>;
}
