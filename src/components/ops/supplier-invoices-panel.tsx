import {useEffect,useMemo,useState} from "react";
import {AlertTriangle,BadgeCheck,ClipboardList,FileCheck2,FileMinus,ReceiptText,RefreshCcw} from "lucide-react";
import {opsRpc,opsRows} from "@/lib/mealdeck-ops-browser";
import {penceToPounds,poundsToPence} from "@/lib/mealdeck-ops-math";
import {TAX_CATEGORIES,canApproveSupplierInvoice,canApproveSupplierCredit,isInvoiceSubmittable,poPriceVariancePence,type TaxCategory} from "@/lib/mealdeck-ops-invoices";
import type {OpsSupplierInvoice,OpsSupplierInvoiceLine,OpsSupplierCredit,OpsSupplierInvoiceSummary} from "@/lib/mealdeck-ops-invoice-types";
import type {OpsPurchase,OpsPurchaseLine} from "@/lib/mealdeck-ops-procurement-types";

const box="md-ops-card p-5";
const field="md-ops-field";
const primary="md-ops-button md-ops-primary";
const secondary="md-ops-button md-ops-secondary";
const label="mb-2 block text-xs font-bold uppercase tracking-wide md-ops-muted";
const currentDate=()=>new Date().toISOString().slice(0,10);

type Props={
  tenantId:string;locationId:string;staffUserId:string;
  invoices:OpsSupplierInvoice[];credits:OpsSupplierCredit[];
  summary:OpsSupplierInvoiceSummary|null;
  purchaseOrders:OpsPurchase[];
  canManage:boolean;canManageGlobal:boolean;
  refresh:()=>Promise<void>;notify:(message:string)=>void;
};

function money(value:string):number{
  const cents=poundsToPence(value);
  if(cents===null)throw new Error("Enter a valid amount with no more than two decimal places.");
  return cents;
}

export function OpsSupplierInvoicesPanel({
  tenantId,locationId,staffUserId,invoices,credits,summary,purchaseOrders,
  canManage,canManageGlobal,refresh,notify,
}:Props){
  const[selectedId,setSelectedId]=useState("");
  const[lines,setLines]=useState<OpsSupplierInvoiceLine[]>([]);
  const[poLines,setPoLines]=useState<OpsPurchaseLine[]>([]);
  const[busy,setBusy]=useState(false);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");
  const[reloadLines,setReloadLines]=useState(0);
  const[poId,setPoId]=useState("");
  const[invoiceNo,setInvoiceNo]=useState("");
  const[invoiceDate,setInvoiceDate]=useState(currentDate());
  const[dueDate,setDueDate]=useState("");
  const[net,setNet]=useState("");
  const[vat,setVat]=useState("");
  const[note,setNote]=useState("");
  const[linePoId,setLinePoId]=useState("");
  const[quantity,setQuantity]=useState("");
  const[lineNet,setLineNet]=useState("");
  const[lineVat,setLineVat]=useState("");
  const[lineTax,setLineTax]=useState<TaxCategory>("unreviewed");
  const[creditNo,setCreditNo]=useState("");
  const[creditNet,setCreditNet]=useState("");
  const[creditVat,setCreditVat]=useState("");
  const[creditReason,setCreditReason]=useState("");
  const[creditDate,setCreditDate]=useState(currentDate());

  const current=invoices.find(x=>x.invoice_id===selectedId);
  const selectedInvoiceId=current?.invoice_id??"";
  const selectedPoId=current?.purchase_order_id??"";
  const po=poLines.find(x=>x.line_id===linePoId);
  const totalsMatch=current?isInvoiceSubmittable({
    declaredNetPence:current.declared_net_pence,
    declaredVatPence:current.declared_vat_pence,
    lines,
  }):false;
  const costCheck=useMemo(()=>po?poPriceVariancePence(
    Number(quantity),po.base_units_per_pack,po.price_per_pack_pence??-1,
    poundsToPence(lineNet)??-1,
  ):null,[po,quantity,lineNet]);
  const vatTotals=useMemo(()=>({
    net:lines.reduce((sum,line)=>sum+line.net_pence,0),
    vat:lines.reduce((sum,line)=>sum+line.vat_pence,0),
  }),[lines]);

  useEffect(()=>{
    setSelectedId("");setLines([]);setPoLines([]);setPoId("");setError("");
  },[tenantId,locationId]);

  useEffect(()=>{
    let currentReq=true;
    if(!selectedInvoiceId||!selectedPoId){setLines([]);setPoLines([]);return;}
    setLoading(true);setLines([]);setPoLines([]);setError("");
    void Promise.all([
      opsRpc<unknown>("mealdeck_ops_invoice_line_list",{
        p_tenant:tenantId,p_location:locationId,p_invoice:selectedInvoiceId,
      }),
      opsRpc<unknown>("mealdeck_ops_purchase_lines_list",{
        p_tenant:tenantId,p_location:locationId,p_order:selectedPoId,
      }),
    ]).then(([a,b])=>{
      if(!currentReq)return;
      setLines(opsRows<OpsSupplierInvoiceLine>(a));
      setPoLines(opsRows<OpsPurchaseLine>(b));
    }).catch(reason=>{
      if(currentReq)setError(reason instanceof Error?reason.message:"Invoice line details could not be loaded.");
    }).finally(()=>{if(currentReq)setLoading(false);});
    return()=>{currentReq=false;};
  },[selectedInvoiceId,selectedPoId,tenantId,locationId,reloadLines]);

  async function act(fn:()=>Promise<unknown>,success:string){
    setBusy(true);setError("");
    try{
      await fn();
      await refresh();
      setReloadLines(x=>x+1);
      notify(success);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Invoice operation could not be verified.");
    }finally{setBusy(false);}
  }
  const matchingPo=purchaseOrders.filter(x=>
    ["approved","partially_received","received"].includes(x.status));
  const fmt=(num:number|null|undefined)=>num===null||num===undefined?"—":penceToPounds(num);

  return <div className="space-y-5">
    <section className={box}>
      <div className="flex items-start gap-3"><ReceiptText className="mt-1 size-6 md-ops-accent"/>
        <div><h2 className="text-xl font-black">Supplier invoices & VAT document checks</h2>
          <p className="mt-1 max-w-3xl text-sm md-ops-muted">Three-way match against approved purchasing and physically received goods. An internal invoice approval is not proof of payment, bank settlement, correct VAT treatment or an HMRC filing.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Approved invoice net",fmt(summary?.approvedSupplierNetPence)],
          ["VAT stated on invoices",fmt(summary?.supplierVatDeclaredPence)],
          ["Invoices requiring review",String(summary?.unmatchedInvoiceCount??"—")],
          ["Approved supplier credits (net)",fmt(summary?.approvedCreditNetPence)],
        ].map(([title,value])=><div key={title} className="rounded-xl border md-ops-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide md-ops-muted">{title}</p>
          <p className="mt-2 text-xl font-black">{value}</p>
        </div>)}
      </div>
      <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0"/>
        VAT figures here are supplier-declared evidence, not recoverable-input-VAT calculations. Net cost, refunds, accounts payable, accountant approval and bank settlement still require separate reconciliation.
      </p>
    </section>

    <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
      <section className={box}>
        <h3 className="text-lg font-black">Recorded supplier invoices</h3>
        <div className="mt-4 max-h-[36rem] space-y-2 overflow-y-auto">
          {invoices.map(item=><button key={item.invoice_id} type="button"
            aria-pressed={selectedId===item.invoice_id}
            onClick={()=>setSelectedId(item.invoice_id)}
            className={"w-full rounded-xl border p-4 text-left "+(selectedId===item.invoice_id?"md-ops-selection":"md-ops-border")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-black">{item.invoice_number}</p>
              <span className="rounded-full md-ops-soft px-3 py-1 text-xs font-black uppercase md-ops-text">{item.status}</span>
            </div>
            <p className="mt-1 text-sm md-ops-muted">{item.supplier_name} · {item.invoice_date}</p>
            <p className="mt-2 text-sm font-bold">{fmt(item.declared_gross_pence)}
              <span className="ml-3 font-normal md-ops-muted">{item.line_count} PO line{item.line_count===1?"":"s"} entered</span>
            </p>
          </button>)}
          {!invoices.length&&<p className="rounded-xl border border-dashed md-ops-border p-6 text-sm md-ops-muted">No supplier invoices recorded in the selected period.</p>}
        </div>
      </section>
      {canManage&&<section className={box}>
        <h3 className="text-lg font-black">Create draft supplier invoice</h3>
        <p className="mt-1 text-xs md-ops-muted">A supplier invoice can only reference an already approved PO at this kitchen. The original supplier and purchase must match the backend record.</p>
        <div className="mt-4 space-y-3">
          <label><span className={label}>Approved purchase order</span>
            <select value={poId} onChange={e=>setPoId(e.target.value)} className={field}>
              <option value="">Choose a PO</option>
              {matchingPo.map(x=><option key={x.order_id} value={x.order_id}>
                {x.supplier_name} · {x.order_id.slice(0,8)} · {x.status}
              </option>)}
            </select></label>
          <label><span className={label}>Invoice number</span>
            <input value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)}
              maxLength={100} className={field}/></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className={label}>Invoice date</span>
              <input type="date" value={invoiceDate}
                onChange={e=>setInvoiceDate(e.target.value)} className={field}/></label>
            <label><span className={label}>Due date (optional)</span>
              <input type="date" value={dueDate}
                onChange={e=>setDueDate(e.target.value)} className={field}/></label>
            <label><span className={label}>Supplier net (£)</span>
              <input value={net} inputMode="decimal"
                onChange={e=>setNet(e.target.value)} className={field}/></label>
            <label><span className={label}>Supplier VAT (£)</span>
              <input value={vat} inputMode="decimal"
                onChange={e=>setVat(e.target.value)} className={field}/></label>
          </div>
          <label><span className={label}>Internal reference</span>
            <input value={note} maxLength={500} onChange={e=>setNote(e.target.value)} className={field}/></label>
          <button type="button" className={primary} disabled={busy||!poId||!invoiceNo.trim()}
            onClick={()=>void act(async()=>{
              const value=money(net),tax=money(vat);
              if(value<=0)throw new Error("The invoice net amount must be positive.");
              const newId=await opsRpc<string>("mealdeck_ops_create_invoice",{
                p_tenant:tenantId,p_location:locationId,p_order:poId,
                p_number:invoiceNo,p_date:invoiceDate,p_due:dueDate||null,
                p_net:value,p_vat:tax,p_note:note,
              });
              setSelectedId(newId);setInvoiceNo("");setNet("");setVat("");setNote("");
            },"Draft invoice recorded. Add all supplier lines before matching.")}>
            Record draft invoice
          </button>
        </div>
      </section>}
    </div>

    {current&&<section className={box}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-xl font-black">{current.invoice_number} — PO matching</h3>
          <p className="mt-1 text-sm md-ops-muted">Supplier: {current.supplier_name} · invoice {current.status} · {current.tax_document_reviewed?"Tax document reviewed":"Tax document not reviewed"}</p>
        </div>
        <button type="button" aria-label="Refresh invoice lines" className={secondary} disabled={loading||busy}
          onClick={()=>setReloadLines(x=>x+1)}><RefreshCcw className="size-4"/></button>
      </div>
      {loading?<p className="mt-4 text-sm">Loading restricted invoice lines…</p>:
      <div className="mt-5 space-y-3">
        {lines.map(line=><div key={line.line_id} className="rounded-xl border md-ops-border p-4">
          <div className="flex flex-wrap justify-between gap-3">
            <div><p className="font-bold">{line.ingredient_name}</p>
              <p className="mt-1 text-xs md-ops-muted">{line.base_quantity} {line.base_unit} invoiced · {line.po_received_quantity} physically received</p></div>
            <div className="text-right">
              <p className="font-bold">Net {fmt(line.net_pence)} + VAT {fmt(line.vat_pence)}</p>
              <p className="mt-1 text-xs md-ops-muted">PO quoted net {fmt(line.po_quoted_net_pence)} · {line.tax_category.replaceAll("_"," ")}</p>
            </div>
          </div>
        </div>)}
        {!lines.length&&<p className="text-sm md-ops-muted">No invoice lines yet. Add the corresponding PO items and stated amounts.</p>}
      </div>}
      <div className="mt-5 rounded-xl border md-ops-border md-ops-wash p-4 text-sm">
        <p><b>Declared:</b> net {fmt(current.declared_net_pence)} · VAT {fmt(current.declared_vat_pence)}</p>
        <p className="mt-1"><b>Entered lines:</b> net {fmt(vatTotals.net)} · VAT {fmt(vatTotals.vat)}</p>
        <p className={"mt-2 font-semibold "+(totalsMatch?"text-emerald-700":"text-amber-800")}>
          {totalsMatch?"Line totals match the supplier header.":"Invoice header and line totals must match exactly before submission."}
        </p>
      </div>

      {canManage&&current.status==="draft"&&<div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div>
          <h4 className="text-lg font-black">Add or replace PO invoice line</h4>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className={label}>Physically received PO item</span>
              <select value={linePoId} onChange={e=>setLinePoId(e.target.value)} className={field}>
                <option value="">Choose PO item</option>
                {poLines.map(line=><option value={line.line_id} key={line.line_id}>
                  {line.ingredient_name} · received {line.received_base_units} {line.base_unit}
                </option>)}
              </select></label>
            <label><span className={label}>Invoice base quantity</span>
              <input className={field} value={quantity} inputMode="decimal"
                onChange={e=>setQuantity(e.target.value)}/></label>
            <label><span className={label}>Line net (£)</span>
              <input className={field} value={lineNet} inputMode="decimal"
                onChange={e=>setLineNet(e.target.value)}/></label>
            <label><span className={label}>Line VAT (£)</span>
              <input className={field} value={lineVat} inputMode="decimal"
                onChange={e=>setLineVat(e.target.value)}/></label>
            <label><span className={label}>Supplier tax category</span>
              <select value={lineTax} onChange={e=>setLineTax(e.target.value as TaxCategory)} className={field}>
                {TAX_CATEGORIES.map(k=><option key={k} value={k}>{k.replaceAll("_"," ")}</option>)}
              </select></label>
          </div>
          {costCheck&&<p className={"mt-2 text-xs font-semibold "+(costCheck.withinTolerance?"md-ops-muted":"text-rose-800")}>
            Expected PO net {fmt(costCheck.expectedPence)}.
            Difference {fmt(costCheck.differencePence)} — {costCheck.withinTolerance?"within rounding tolerance":"requires supplier review"}.
          </p>}
          <button type="button" className={"mt-4 "+primary} disabled={busy||!linePoId}
            onClick={()=>void act(async()=>{
              const q=Number(quantity);
              if(!Number.isFinite(q)||q<=0||!po)throw new Error("Select a PO item and a positive quantity.");
              if(po.base_unit==="each"&&!Number.isInteger(q))
                throw new Error("Items measured 'each' require whole quantities.");
              await opsRpc("mealdeck_ops_save_invoice_line",{
                p_tenant:tenantId,p_location:locationId,p_invoice:current.invoice_id,
                p_po_line:linePoId,p_quantity:q,p_net:money(lineNet),
                p_vat:money(lineVat),p_tax:lineTax,
              });
              setLinePoId("");setQuantity("");setLineNet("");setLineVat("");
            },"Supplier invoice line saved. No payment or VAT return initiated.")}>
            Save invoice line
          </button>
        </div>
        <div className="rounded-xl md-ops-wash p-4">
          <FileCheck2 className="size-7 md-ops-accent"/>
          <h4 className="mt-3 font-black">Three independent records</h4>
          <p className="mt-2 text-sm leading-6 md-ops-muted">The backend compares this supplier invoice against the original PO pricing and physically received quantities, then prevents overlapping claims from previously matched/approved invoices. VAT category review and second-person approval are separate.</p>
        </div>
      </div>}

      {canManage&&<div className="mt-5 flex flex-wrap gap-3">
        {current.status==="draft"&&<button type="button" className={primary}
          disabled={busy||!totalsMatch}
          onClick={()=>void act(
            ()=>opsRpc("mealdeck_ops_invoice_action",{
              p_tenant:tenantId,p_location:locationId,
              p_invoice:current.invoice_id,p_action:"submit",
            }),"Supplier invoice submitted; PO and goods match still required.")}>
          Submit invoice
        </button>}
        {current.status==="submitted"&&<button type="button" className={primary} disabled={busy}
          onClick={()=>void act(
            ()=>opsRpc("mealdeck_ops_invoice_action",{
              p_tenant:tenantId,p_location:locationId,
              p_invoice:current.invoice_id,p_action:"match",
            }),"Three-way PO/receipt/invoice quantity and price match recorded.")}>
          <ClipboardList className="mr-1 inline size-4"/> Match PO + receipts
        </button>}
        {current.status==="matched"&&!current.tax_document_reviewed&&
          <button type="button" className={secondary} disabled={busy||lines.some(x=>x.tax_category==="unreviewed")}
            onClick={()=>void act(
              ()=>opsRpc("mealdeck_ops_review_invoice_tax",{
                p_tenant:tenantId,p_location:locationId,
                p_invoice:current.invoice_id,p_reviewed:true,
              }),"Supplier tax document marked reviewed; this does not file or validate a VAT return.")}>
            Review tax evidence
          </button>}
        {canApproveSupplierInvoice(current.status,current.tax_document_reviewed,
          canManageGlobal,current.created_by,staffUserId)&&
          <button type="button" className={primary} disabled={busy}
            onClick={()=>void act(
              ()=>opsRpc("mealdeck_ops_invoice_action",{
                p_tenant:tenantId,p_location:locationId,
                p_invoice:current.invoice_id,p_action:"approve",
              }),"Supplier invoice approved internally; still not paid or posted to accounts.")}>
            <BadgeCheck className="mr-1 inline size-4"/> Second-person approve
          </button>}
        {["draft","submitted","matched"].includes(current.status)&&
          <button type="button" className={secondary} disabled={busy}
            onClick={()=>void act(
              ()=>opsRpc("mealdeck_ops_invoice_action",{
                p_tenant:tenantId,p_location:locationId,
                p_invoice:current.invoice_id,p_action:"void",
              }),"Unapproved invoice voided; audit history retained.")}>
            Void pending invoice
          </button>}
      </div>}
    </section>}

    <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
      <section className={box}>
        <div className="flex items-center gap-2"><FileMinus className="size-5 md-ops-accent"/>
          <h3 className="text-lg font-black">Supplier credit notes</h3></div>
        <p className="mt-1 text-sm md-ops-muted">Credits reduce internal supplier claims only after an independent approval. No money is returned and no VAT filing occurs automatically.</p>
        <div className="mt-4 space-y-2">
          {credits.map(credit=><div key={credit.credit_id}
            className="rounded-xl border md-ops-border p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-bold">{credit.credit_number}</p>
              <span className="rounded-lg md-ops-soft px-2.5 py-1 text-xs font-bold">{credit.status}</span>
            </div>
            <p className="mt-1 text-xs md-ops-muted">{credit.issued_on} · {credit.reason}</p>
            <p className="mt-2 font-bold">Net {fmt(credit.net_pence)} · VAT {fmt(credit.vat_pence)}</p>
            {canManage&&<div className="mt-3 flex flex-wrap gap-2">
              {credit.status==="draft"&&<button type="button" className={secondary} disabled={busy}
                onClick={()=>void act(()=>opsRpc("mealdeck_ops_credit_action",{
                  p_tenant:tenantId,p_location:locationId,p_credit:credit.credit_id,p_action:"submit",
                }),"Credit note submitted for separate finance approval.")}>Submit credit</button>}
              {canApproveSupplierCredit(credit.status,canManageGlobal,credit.created_by,staffUserId)&&
                <button type="button" className={primary} disabled={busy}
                  onClick={()=>void act(()=>opsRpc("mealdeck_ops_credit_action",{
                    p_tenant:tenantId,p_location:locationId,p_credit:credit.credit_id,p_action:"approve",
                  }),"Supplier credit approved; bank refund is not assumed.")}>Approve credit</button>}
              {["draft","submitted"].includes(credit.status)&&<button type="button" className={secondary}
                disabled={busy} onClick={()=>void act(()=>opsRpc("mealdeck_ops_credit_action",{
                  p_tenant:tenantId,p_location:locationId,p_credit:credit.credit_id,p_action:"void",
                }),"Unapproved credit voided.")}>Void</button>}
            </div>}
          </div>)}
          {!credits.length&&<p className="rounded-xl border border-dashed md-ops-border p-5 text-sm md-ops-muted">No supplier credits recorded in this period.</p>}
        </div>
      </section>
      {canManage&&current?.status==="approved"&&<section className={box}>
        <h3 className="text-lg font-black">Record supplier credit</h3>
        <p className="mt-1 text-xs md-ops-muted">The approved invoice is the original source. Credit amounts cannot exceed the outstanding net and VAT components after other approved credits.</p>
        <div className="mt-4 space-y-3">
          <label><span className={label}>Supplier credit note number</span>
            <input className={field} maxLength={100} value={creditNo}
              onChange={e=>setCreditNo(e.target.value)}/></label>
          <label><span className={label}>Supplier issued date</span>
            <input className={field} type="date" value={creditDate}
              onChange={e=>setCreditDate(e.target.value)}/></label>
          <label><span className={label}>Reason</span>
            <textarea className={field} rows={2} maxLength={500} value={creditReason}
              onChange={e=>setCreditReason(e.target.value)}/></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className={label}>Net credit (£)</span>
              <input className={field} inputMode="decimal" value={creditNet}
                onChange={e=>setCreditNet(e.target.value)}/></label>
            <label><span className={label}>Supplier VAT credit (£)</span>
              <input className={field} inputMode="decimal" value={creditVat}
                onChange={e=>setCreditVat(e.target.value)}/></label>
          </div>
          <button type="button" disabled={busy||!creditNo.trim()} className={primary}
            onClick={()=>void act(async()=>{
              await opsRpc("mealdeck_ops_create_supplier_credit",{
                p_tenant:tenantId,p_location:locationId,p_invoice:current.invoice_id,
                p_number:creditNo,p_issued:creditDate,p_reason:creditReason,
                p_net:money(creditNet),p_vat:money(creditVat),
              });
              setCreditNo("");setCreditReason("");setCreditNet("");setCreditVat("");
            },"Credit draft recorded, pending independent approval.")}>
            Record credit draft
          </button>
        </div>
      </section>}
    </div>
    {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
  </div>;
}
