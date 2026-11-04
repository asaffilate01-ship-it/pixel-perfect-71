import {useMemo,useState} from "react";
import {AlertTriangle,Archive,ClipboardCheck,ShieldAlert} from "lucide-react";
import {opsRpc} from "@/lib/mealdeck-ops-browser";
import {positiveBaseQuantity,expiryLabel} from "@/lib/mealdeck-ops-procurement";
import type {OpsBatch} from "@/lib/mealdeck-ops-procurement-types";

type Props={
  tenantId:string;locationId:string;batches:OpsBatch[];
  canIssue:boolean;
  onRefresh:()=>Promise<void>;onNotice:(text:string)=>void;
};
const box="md-ops-card p-5";
const field="md-ops-field";
const primary="md-ops-button md-ops-primary";

export function OpsStockBatchesPanel({
  tenantId,locationId,batches,canIssue,onRefresh,onNotice,
}:Props){
  const[filter,setFilter]=useState("attention");
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState("");
  const[selected,setSelected]=useState("");
  const[qty,setQty]=useState("");
  const[reason,setReason]=useState("waste");
  const[reference,setReference]=useState("");
  const[note,setNote]=useState("");
  const counts=useMemo(()=>({
    expired:batches.filter(x=>x.expiry_state==="expired").length,
    due:batches.filter(x=>x.expiry_state==="due_soon").length,
    tracked:batches.length,
  }),[batches]);
  const visible=batches.filter(b=>{
    if(filter==="all")return true;
    if(filter==="expired")return b.expiry_state==="expired";
    return ["expired","due_soon"].includes(b.expiry_state);
  });
  const selectedBatch=batches.find(x=>x.batch_id===selected);
  async function issue(){
    setBusy(true);setError("");
    try{
      const value=positiveBaseQuantity(qty,selectedBatch?.unit??"g");
      if(value===null||!selectedBatch||value>Number(selectedBatch.tracked_balance)){
        throw new Error("Enter a quantity no greater than this batch's tracked balance.");
      }
      if(!reference.trim()||reference.trim().length<2){
        throw new Error("Enter a unique consumption/waste reference.");
      }
      await opsRpc("mealdeck_ops_issue_batch",{
        p_tenant:tenantId,p_location:locationId,
        p_batch:selectedBatch.batch_id,p_quantity:value,
        p_reason:reason,p_reference:reference,p_note:note,
      });
      await onRefresh();
      setQty("");setReference("");setNote("");
      onNotice("Batch movement recorded once, with the matching negative stock movement.");
    }catch(e){
      setError(e instanceof Error?e.message:"The batch movement was not recorded.");
    }finally{setBusy(false);}
  }

  return <div className="space-y-5">
    <section className={box}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Archive className="mt-1 size-6 md-ops-accent"/>
          <div>
            <h2 className="text-xl font-black">Stock batches & date checks</h2>
            <p className="mt-1 max-w-3xl text-sm md-ops-muted">
              Supplier provenance, printed use-by or best-before dates, and batch issues recorded against the MealDeck kitchen. This is a manually tracked lot view—not a full food-safety certification or automatically reconciled legacy stock count.
            </p>
          </div>
        </div>
        <span className="rounded-full md-ops-soft px-3 py-2 text-xs font-bold">
          {counts.tracked} tracked lots
        </span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-bold text-rose-800">Expired lot balances</p>
          <p className="mt-2 text-3xl font-black text-rose-950">{counts.expired}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-800">Due within 14 days</p>
          <p className="mt-2 text-3xl font-black text-amber-950">{counts.due}</p>
        </div>
        <div className="rounded-xl border md-ops-border p-4">
          <p className="text-sm font-bold md-ops-text">Tracked batches</p>
          <p className="mt-2 text-3xl font-black">{counts.tracked}</p>
        </div>
      </div>
      {counts.expired>0&&<div role="alert" className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        <ShieldAlert className="mt-0.5 size-5 shrink-0"/>
        <span>Past-date stock requires human review: quarantine expired USE-BY lots immediately; BEST-BEFORE dates indicate a quality limit and need separate food-safety assessment. The new lot-issue function blocks expired use-by lots for production, but legacy KDS and other inventory workflows are not automatically blocked.</span>
      </div>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <label className="text-sm font-semibold">Show batches
          <select className="ml-3 min-h-11 rounded-xl border md-ops-border md-ops-paper px-3 text-sm"
            value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="attention">Due soon / expired</option>
            <option value="expired">Expired only</option>
            <option value="all">All tracked batches</option>
          </select>
        </label>
        <p className="text-xs md-ops-muted">Ordered by expiry date · 14-day review window</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead><tr className="border-b md-ops-border text-xs uppercase md-ops-muted">
            {["Ingredient","Batch","Supplier","Date","Tracked balance","Review","Action"].map(x=>
              <th key={x} className="px-3 py-3">{x}</th>)}
          </tr></thead>
          <tbody>{visible.map(batch=><tr key={batch.batch_id} className="border-b md-ops-divider">
            <td className="px-3 py-4 font-bold">{batch.ingredient_name}</td>
            <td className="px-3 py-4">{batch.batch_code}</td>
            <td className="px-3 py-4">{batch.supplier_name}</td>
            <td className="px-3 py-4">{batch.expiry_on??"N/A"}</td>
            <td className="px-3 py-4">{batch.tracked_balance} {batch.unit}</td>
            <td className="px-3 py-4">
              <span className={batch.expiry_state==="expired"?
                "font-bold text-rose-800":batch.expiry_state==="due_soon"?
                "font-bold md-ops-accent":"md-ops-muted"}>
                {expiryLabel(batch.expiry_state,batch.expiry_kind)}
              </span>
            </td>
            <td className="px-3 py-4">{canIssue&&<button type="button"
              aria-pressed={selected===batch.batch_id} className="min-h-11 rounded-xl border md-ops-border px-3 font-bold"
              onClick={()=>{setSelected(batch.batch_id);setError("");}}>
              Issue / waste
            </button>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!visible.length&&<p className="mt-5 text-sm md-ops-muted">No tracked batches match this filter. This does not prove all stock or suppliers are free of expiry risks.</p>}
    </section>

    {canIssue&&selectedBatch&&<section className={box}>
      <div className="flex items-center gap-2"><ClipboardCheck className="size-5 md-ops-accent"/>
        <h3 className="text-lg font-black">Record usage or waste — {selectedBatch.batch_code}</h3></div>
      <p className="mt-2 text-sm md-ops-muted">
        {selectedBatch.ingredient_name} · {selectedBatch.tracked_balance} {selectedBatch.unit} currently tracked.
        A batch issue also writes a matching negative movement to the canonical ingredient stock ledger.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label><span className="mb-2 block text-xs font-bold md-ops-muted">Quantity ({selectedBatch.unit})</span>
          <input className={field} value={qty} inputMode="decimal"
            onChange={e=>setQty(e.target.value)}/></label>
        <label><span className="mb-2 block text-xs font-bold md-ops-muted">Reason</span>
          <select className={field} value={reason} onChange={e=>setReason(e.target.value)}>
            <option value="production">Production (approved in-date food only)</option>
            <option value="waste">Waste / disposal</option>
            <option value="adjustment">Stock correction</option>
          </select></label>
        <label><span className="mb-2 block text-xs font-bold md-ops-muted">Unique issue reference</span>
          <input className={field} value={reference} maxLength={100}
            onChange={e=>setReference(e.target.value)} placeholder="Kitchen shift / waste log reference"/></label>
        <label><span className="mb-2 block text-xs font-bold md-ops-muted">Note (optional)</span>
          <input className={field} value={note} maxLength={300}
            onChange={e=>setNote(e.target.value)}/></label>
      </div>
      {selectedBatch.expiry_state==="expired"&&reason==="production"&&
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm font-semibold text-rose-800">
          <AlertTriangle className="size-4 shrink-0"/> Expired use-by batches cannot be issued for production.
        </p>}
      <button type="button" className={"mt-4 "+primary}
        disabled={busy||!qty.trim()||!reference.trim()||
          (selectedBatch.expiry_kind==="use_by"&&
           selectedBatch.expiry_state==="expired"&&reason==="production")}
        onClick={()=>void issue()}>
        Record one batch movement
      </button>
      {error&&<p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <p className="mt-4 text-xs md-ops-muted">
        This tracks usage against new batches only. Older unassigned stock deductions, supplier invoice pricing and FEFO automation still require reconciliation.
      </p>
    </section>}
  </div>;
}
