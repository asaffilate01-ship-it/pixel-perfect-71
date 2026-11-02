import {useEffect,useMemo,useState} from "react";
import {AlertTriangle,ClipboardCheck,PackageCheck,Plus,RefreshCcw,ShieldCheck,Truck} from "lucide-react";
import {opsRpc,opsRows} from "@/lib/mealdeck-ops-browser";
import {poundsToPence,penceToPounds} from "@/lib/mealdeck-ops-math";
import {canApprovePurchase,canSubmitPurchase,poRemainingBaseUnits,positiveBaseQuantity,quotedPoTotalPence,type ExpiryKind} from "@/lib/mealdeck-ops-procurement";
import type {OpsIngredient} from "@/lib/mealdeck-ops-types";
import type {OpsPurchase,OpsPurchaseLine,OpsSupplier} from "@/lib/mealdeck-ops-procurement-types";

const box="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const field="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600";
const action="min-h-11 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white disabled:opacity-40";
const secondary="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 disabled:opacity-40";
const label="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-600";
type Props={
  tenantId:string;locationId:string;staffUserId:string;
  suppliers:OpsSupplier[];purchases:OpsPurchase[];ingredients:OpsIngredient[];
  canFinance:boolean;canFinanceGlobal:boolean;canReceive:boolean;
  onRefresh:()=>Promise<void>;onNotice:(text:string)=>void;
};
function ErrorMessage({message}:{message:string}){
  return message?<p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{message}</p>:null;
}

export function OpsProcurementPanel(props:Props){
  const{tenantId,locationId,staffUserId,suppliers,purchases,ingredients,
    canFinance,canFinanceGlobal,canReceive,onRefresh,onNotice}=props;
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState("");
  const[selected,setSelected]=useState("");
  const[lines,setLines]=useState<OpsPurchaseLine[]>([]);
  const[loadingLines,setLoadingLines]=useState(false);
  const[version,setVersion]=useState(0);
  const[supplierName,setSupplierName]=useState("");
  const[supplierEmail,setSupplierEmail]=useState("");
  const[leadTime,setLeadTime]=useState("2");
  const[supplierId,setSupplierId]=useState("");
  const[note,setNote]=useState("");
  const[ingredientId,setIngredientId]=useState("");
  const[packCount,setPackCount]=useState("1");
  const[baseUnits,setBaseUnits]=useState("1000");
  const[packPrice,setPackPrice]=useState("");
  const[receiptLine,setReceiptLine]=useState("");
  const[receiptQuantity,setReceiptQuantity]=useState("");
  const[batchCode,setBatchCode]=useState("");
  const[expiryKind,setExpiryKind]=useState<ExpiryKind>("use_by");
  const[expiryDate,setExpiryDate]=useState("");
  const[deliveryRef,setDeliveryRef]=useState("");

  useEffect(()=>{
    setSelected("");setLines([]);setSupplierId("");setIngredientId("");
    setReceiptLine("");setError("");
  },[tenantId,locationId]);

  useEffect(()=>{
    let current=true;
    if(!selected){setLines([]);return;}
    setLines([]);setLoadingLines(true);
    void opsRpc<unknown>("mealdeck_ops_purchase_lines_list",{
      p_tenant:tenantId,p_location:locationId,p_order:selected,
    }).then(raw=>{if(current)setLines(opsRows<OpsPurchaseLine>(raw));})
      .catch(reason=>{if(current)setError(reason instanceof Error?reason.message:"Purchase lines unavailable.");})
      .finally(()=>{if(current)setLoadingLines(false);});
    return()=>{current=false;};
  },[selected,tenantId,locationId,version]);

  const selectedOrder=purchases.find(p=>p.order_id===selected);
  const total=useMemo(()=>quotedPoTotalPence(lines),[lines]);
  const chosenReceiptLine=lines.find(line=>line.line_id===receiptLine);
  const remaining=chosenReceiptLine?poRemainingBaseUnits(chosenReceiptLine):null;
  const eligibleReceipt=selectedOrder&&
    ["approved","partially_received"].includes(selectedOrder.status);
  const activeSuppliers=suppliers.filter(x=>x.status==="active");

  async function execute(task:()=>Promise<unknown>,message:string){
    setBusy(true);setError("");
    try{
      await task();
      await onRefresh();
      setVersion(v=>v+1);
      onNotice(message);
    }catch(e){
      setError(e instanceof Error?e.message:"The purchasing operation could not be verified.");
    }finally{setBusy(false);}
  }

  return <div className="space-y-5">
    <section className={box}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="flex items-center gap-2"><Truck className="size-6 text-amber-600"/>
          <h2 className="text-xl font-black">Suppliers & purchase orders</h2></div>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Draft purchases, obtain a separate finance approval, and record physical goods only when they arrive. This does not send supplier emails, make payments or post an invoice.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
          {purchases.length} kitchen orders
        </span>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            {["PO reference","Supplier","Status","Received","Estimated goods","Action"].map(x=><th key={x} className="px-3 py-3">{x}</th>)}
          </tr></thead>
          <tbody>{purchases.map(row=><tr key={row.order_id} className="border-b border-slate-100">
            <td className="px-3 py-4 font-bold">{row.order_id.slice(0,8).toUpperCase()}</td>
            <td className="px-3 py-4">{row.supplier_name}</td>
            <td className="px-3 py-4"><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold">{row.status.replaceAll("_"," ")}</span></td>
            <td className="px-3 py-4">{row.received_line_count} / {row.line_count} lines</td>
            <td className="px-3 py-4">{row.quoted_total_pence===null?"Restricted":penceToPounds(row.quoted_total_pence)}</td>
            <td className="px-3 py-4"><button type="button" aria-pressed={selected===row.order_id}
              className={secondary} onClick={()=>{setSelected(row.order_id);setReceiptLine("");}}>
              {selected===row.order_id?"Selected":"View"}
            </button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!purchases.length&&<p className="mt-4 text-sm text-slate-500">No purchase orders have been recorded for this kitchen.</p>}
    </section>

    {canFinance&&<div className="grid gap-5 lg:grid-cols-2">
      {canFinanceGlobal&&<section className={box}>
        <h3 className="font-display text-lg font-black">Register an approved supplier</h3>
        <p className="mt-1 text-sm text-slate-600">Supplier account details are tenant-wide. Bank details are deliberately not stored here.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label><span className={label}>Supplier name</span>
            <input className={field} value={supplierName} maxLength={160}
              onChange={e=>setSupplierName(e.target.value)}/></label>
          <label><span className={label}>Email (optional)</span>
            <input className={field} type="email" value={supplierEmail}
              onChange={e=>setSupplierEmail(e.target.value)}/></label>
          <label><span className={label}>Typical lead time (days)</span>
            <input className={field} inputMode="numeric" value={leadTime}
              onChange={e=>setLeadTime(e.target.value)}/></label>
        </div>
        <button type="button" className={"mt-4 "+action} disabled={busy||!supplierName.trim()}
          onClick={()=>void execute(async()=>{
            await opsRpc("mealdeck_ops_save_supplier",{
              p_tenant:tenantId,p_id:null,p_name:supplierName,p_email:supplierEmail,
              p_lead_days:Number(leadTime),p_status:"active",
            });
            setSupplierName("");setSupplierEmail("");
          },"Supplier saved to the authorised tenant.")}>
          <Plus className="mr-1 inline size-4"/> Add supplier
        </button>
      </section>}
      <section className={box}>
        <h3 className="font-display text-lg font-black">Create a draft purchase order</h3>
        <p className="mt-1 text-sm text-slate-600">An approved supplier and this exact kitchen are required.</p>
        <div className="mt-4 space-y-3">
          <label><span className={label}>Supplier</span>
            <select className={field} value={supplierId}
              onChange={e=>setSupplierId(e.target.value)}>
              <option value="">Choose supplier</option>
              {activeSuppliers.map(x=><option key={x.supplier_id} value={x.supplier_id}>{x.name}</option>)}
            </select></label>
          <label><span className={label}>Internal note</span>
            <textarea className={field} value={note} maxLength={500} rows={2}
              onChange={e=>setNote(e.target.value)}/></label>
        </div>
        <button type="button" className={"mt-4 "+action}
          disabled={busy||!supplierId}
          onClick={()=>void execute(async()=>{
            const id=await opsRpc<string>("mealdeck_ops_create_purchase",{
              p_tenant:tenantId,p_location:locationId,p_supplier:supplierId,p_note:note,
            });
            setSelected(id);setNote("");
          },"Draft PO created. Add goods and submit for independent approval.")}>
          Create draft
        </button>
      </section>
    </div>}

    {selectedOrder&&<div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
      <section className={box}>
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-lg font-black">PO {selectedOrder.order_id.slice(0,8).toUpperCase()}</h3>
            <p className="mt-1 text-sm text-slate-600">{selectedOrder.supplier_name} · {selectedOrder.status}</p>
          </div>
          <button type="button" className={secondary} onClick={()=>setVersion(v=>v+1)}
            disabled={busy||loadingLines} aria-label="Refresh purchase lines">
            <RefreshCcw className="size-4"/>
          </button>
        </div>
        {loadingLines?<p className="mt-5 text-sm">Loading authorised purchase lines…</p>:
        <div className="mt-4 space-y-2">
          {lines.map(line=><div key={line.line_id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex justify-between gap-3"><b>{line.ingredient_name}</b>
              <span className="text-xs text-slate-500">
                {line.price_per_pack_pence===null?"Costs restricted":penceToPounds(line.price_per_pack_pence)+"/pack"}
              </span></div>
            <p className="mt-1 text-sm text-slate-600">{line.pack_count} packs · {line.base_units_per_pack} {line.base_unit}/pack</p>
            <p className="mt-1 text-xs text-slate-600">Received {line.received_base_units} {line.base_unit} · remaining {poRemainingBaseUnits(line)??"—"} {line.base_unit}</p>
          </div>)}
          {!lines.length&&<p className="text-sm text-slate-500">No ingredients on this PO yet.</p>}
          {total!==null&&<p className="border-t border-slate-200 pt-3 text-sm font-bold">Quoted goods total: {penceToPounds(total)} <span className="font-normal text-slate-500">(not invoiced or paid)</span></p>}
        </div>}
        {canFinance&&selectedOrder.status==="draft"&&<div className="mt-5 space-y-4 rounded-xl bg-slate-50 p-4">
          <h4 className="font-black">Add or update draft line</h4>
          <label><span className={label}>Ingredient</span><select className={field} value={ingredientId} onChange={e=>setIngredientId(e.target.value)}>
            <option value="">Choose ingredient</option>
            {ingredients.filter(x=>x.active).map(x=><option key={x.ingredient_id} value={x.ingredient_id}>{x.name} ({x.base_unit})</option>)}
          </select></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label><span className={label}>Packs</span>
              <input className={field} inputMode="numeric" value={packCount}
                onChange={e=>setPackCount(e.target.value)}/></label>
            <label><span className={label}>Base units/pack</span>
              <input className={field} inputMode="decimal" value={baseUnits}
                onChange={e=>setBaseUnits(e.target.value)}/></label>
            <label><span className={label}>Net £/pack</span>
              <input className={field} inputMode="decimal" value={packPrice}
                onChange={e=>setPackPrice(e.target.value)}/></label>
          </div>
          <button type="button" className={action} disabled={busy||!ingredientId}
            onClick={()=>void execute(async()=>{
              const count=Number(packCount),unit=positiveBaseQuantity(baseUnits);
              const price=poundsToPence(packPrice);
              if(!Number.isInteger(count)||count<1||unit===null||price===null)
                throw new Error("Enter a whole pack count, valid unit quantity and net pack price.");
              await opsRpc("mealdeck_ops_save_purchase_line",{
                p_tenant:tenantId,p_location:locationId,p_order:selectedOrder.order_id,
                p_ingredient:ingredientId,p_pack_count:count,
                p_base_units:unit,p_pack_price:price,
              });
              setPackPrice("");setIngredientId("");
            },"Draft purchase line saved. No supplier order was sent.")}>
            Save draft line
          </button>
        </div>}

        {canFinance&&<div className="mt-5 flex flex-wrap gap-3">
          {canSubmitPurchase(selectedOrder.status,lines.length>0)&&
            <button type="button" className={action} disabled={busy}
              onClick={()=>void execute(
                ()=>opsRpc("mealdeck_ops_advance_purchase",{
                  p_tenant:tenantId,p_location:locationId,
                  p_order:selectedOrder.order_id,p_action:"submit",
                }),
                "PO submitted for another finance manager's approval. No supplier notification sent.",
              )}>Submit for approval</button>}
          {canApprovePurchase(selectedOrder.status,canFinanceGlobal,
            selectedOrder.created_by===staffUserId)&&
            <button type="button" className={action} disabled={busy}
              onClick={()=>void execute(
                ()=>opsRpc("mealdeck_ops_advance_purchase",{
                  p_tenant:tenantId,p_location:locationId,
                  p_order:selectedOrder.order_id,p_action:"approve",
                }),
                "PO approved in MealDeck records only. Contact supplier using an approved process.",
              )}><ClipboardCheck className="mr-1 inline size-4"/> Approve</button>}
          {["draft","submitted"].includes(selectedOrder.status)&&
            <button type="button" className={secondary} disabled={busy}
              onClick={()=>void execute(
                ()=>opsRpc("mealdeck_ops_advance_purchase",{
                  p_tenant:tenantId,p_location:locationId,
                  p_order:selectedOrder.order_id,p_action:"cancel",
                }),"Unfulfilled draft/submitted PO cancelled.",
              )}>Cancel PO</button>}
        </div>}
      </section>
      {canReceive&&eligibleReceipt&&<section className={box}>
        <h3 className="flex items-center gap-2 text-lg font-black"><PackageCheck className="size-5 text-amber-600"/> Receive goods</h3>
        <p className="mt-2 text-sm text-slate-600">Count physical stock, check the supplier docket, batch code and use-by/best-before date. Each delivery-reference/line is idempotent.</p>
        <div className="mt-4 space-y-3">
          <label><span className={label}>Approved PO line</span>
            <select className={field} value={receiptLine} onChange={e=>setReceiptLine(e.target.value)}>
              <option value="">Choose remaining line…</option>
              {lines.filter(x=>(poRemainingBaseUnits(x)??0)>0).map(x=>
                <option key={x.line_id} value={x.line_id}>{x.ingredient_name} · remaining {poRemainingBaseUnits(x)} {x.base_unit}</option>)}
            </select></label>
          <label><span className={label}>Received quantity ({chosenReceiptLine?.base_unit??"base units"})</span>
            <input className={field} value={receiptQuantity} inputMode="decimal"
              onChange={e=>setReceiptQuantity(e.target.value)}
              placeholder={remaining===null?"":String(remaining)}/></label>
          <label><span className={label}>Printed supplier batch code</span>
            <input className={field} value={batchCode} maxLength={100}
              onChange={e=>setBatchCode(e.target.value)}/></label>
          <label><span className={label}>Expiry basis</span>
            <select className={field} value={expiryKind}
              onChange={e=>setExpiryKind(e.target.value as ExpiryKind)}>
              <option value="use_by">Use by (food safety)</option>
              <option value="best_before">Best before</option>
              <option value="none">Not applicable (e.g. packaging)</option>
            </select></label>
          {expiryKind!=="none"&&<label><span className={label}>Printed expiry date</span>
            <input className={field} type="date" value={expiryDate}
              onChange={e=>setExpiryDate(e.target.value)}/></label>}
          <label><span className={label}>Supplier delivery note / idempotency reference</span>
            <input className={field} value={deliveryRef} maxLength={100}
              onChange={e=>setDeliveryRef(e.target.value)}/></label>
          <button type="button" className={action}
            disabled={busy||!receiptLine||!batchCode.trim()||!deliveryRef.trim()}
            onClick={()=>void execute(async()=>{
              const amount=positiveBaseQuantity(receiptQuantity);
              if(amount===null||remaining===null||amount>remaining)
                throw new Error("Quantity must be positive and within unreceived PO balance.");
              if(expiryKind!=="none"&&!expiryDate)
                throw new Error("Enter the expiry date printed on the packaging.");
              await opsRpc("mealdeck_ops_receive_purchase",{
                p_tenant:tenantId,p_location:locationId,p_line:receiptLine,
                p_base_qty:amount,p_batch_code:batchCode,
                p_expiry_kind:expiryKind,p_expiry:expiryKind==="none"?null:expiryDate,
                p_delivery_ref:deliveryRef,
              });
              setReceiptQuantity("");setBatchCode("");setExpiryDate("");setDeliveryRef("");
            },"Received approved goods. Stock and batch provenance updated together.")}>
            Verify & receive into stock
          </button>
          <p className="text-xs text-slate-500">This is not a supplier invoice, bank payment, approved food-safety inspection or FEFO auto-consumption.</p>
        </div>
      </section>}
    </div>}
    <ErrorMessage message={error}/>
  </div>;
}
