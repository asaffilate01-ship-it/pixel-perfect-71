import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, RefreshCw, ShieldCheck, Ticket } from "lucide-react";
import { z } from "zod";
import { opsRpc } from "@/lib/mealdeck-ops-browser";
import type { OpsStaff } from "@/lib/mealdeck-ops-types";

const voucherList = z.object({
  enabled: z.boolean(),
  vouchers: z.array(z.object({
    id: z.uuid(), staffUserId: z.uuid(), issuedAt: z.string(), issuedBy: z.uuid(), expiresAt: z.string(),
    consumedAt: z.string().nullable(), revokedAt: z.string().nullable(), revokedBy: z.uuid().nullable(), orderId: z.uuid().nullable(),
    paymentStatus: z.string().nullable(), status: z.enum(["available","used","revoked","expired"]),
  })).max(100),
});
const issuedVoucher = z.object({ id: z.uuid(), code: z.string().regex(/^MD-[A-F0-9]{32}$/), expiresAt: z.string() });
const issueResult = z.union([issuedVoucher, z.object({id:z.uuid(),alreadyIssued:z.literal(true),expiresAt:z.string()})]);
type VoucherList = z.infer<typeof voucherList>;
type Issued = z.infer<typeof issuedVoucher>;
function displayDate(value: string) {
  return Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-GB", {dateStyle:"medium",timeStyle:"short",timeZone:"Europe/London"}).format(new Date(value)) : "Unknown";
}

/** The parent keys this panel by authenticated actor and location. Server RPCs
 * independently check current staff/finance authority on every action. */
export function StaffVoucherPanel({ tenantId, locationId, staff }: {tenantId:string;locationId:string;staff:OpsStaff[]}) {
  const [data,setData]=useState<VoucherList|null>(null);
  const [staffId,setStaffId]=useState("");
  const [days,setDays]=useState("7");
  const [issued,setIssued]=useState<Issued|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [pendingRevoke,setPendingRevoke]=useState<string|null>(null);
  const [pendingIssue,setPendingIssue]=useState<{requestId:string;staffId:string;days:number}|null>(null);
  const generation=useRef(0);
  const lock=useRef(false);
  const staffOptions=[...new Map(staff.filter(row=>row.enabled && (row.location_id===null||row.location_id===locationId)).map(row=>[row.user_id,row])).values()];
  const staffName=(id:string)=>staffOptions.find(row=>row.user_id===id)?.user_email ?? id.slice(0,8)+"…";
  const refresh=useCallback(async()=>{
    const request=++generation.current;
    try {
      const value=voucherList.parse(await opsRpc("mealdeck_ops_staff_vouchers",{p_tenant:tenantId,p_location:locationId}));
      if(request===generation.current)setData(value);
    } catch {
      if(request===generation.current){setData(null);setMessage("Staff vouchers are not available for this location or role. Check installation and permissions.");}
    }
  },[tenantId,locationId]);
  useEffect(()=>{void refresh();return ()=>{generation.current++;};},[refresh]);
  async function issue() {
    if(lock.current||!data?.enabled||!staffOptions.some(row=>row.user_id===staffId)||issued)return;
    const validity=Number(days);
    if(!Number.isInteger(validity)||validity<1||validity>30)return;
    const intent=pendingIssue??{requestId:crypto.randomUUID(),staffId,days:validity};
    setPendingIssue(intent);
    lock.current=true;setBusy(true);setMessage("");
    const request=++generation.current;
    try{
      const result=issueResult.parse(await opsRpc("mealdeck_ops_issue_staff_voucher",{p_tenant:tenantId,p_location:locationId,p_staff:intent.staffId,p_days:intent.days,p_request_id:intent.requestId}));
      if(request===generation.current){
        setPendingIssue(null);
        if("alreadyIssued" in result) setMessage("The original voucher was already issued. Its code cannot be shown again. Check the audit and revoke it if it was lost.");
        else {setIssued(result);setMessage("Voucher issued. Copy it securely now; it cannot be retrieved later.");}
      }
    }catch{if(request===generation.current)setMessage("Issuance could not be confirmed. Retry the same request to check its outcome without creating another code. The recipient needs a verified customer account linked to their staff identity.");}
    finally{lock.current=false;if(request===generation.current){setBusy(false);void refresh();}}
  }
  async function revoke(id:string){
    if(lock.current||pendingRevoke!==id)return;
    lock.current=true;setBusy(true);setMessage("");
    const request=++generation.current;
    try{
      const result=z.object({revoked:z.literal(true)}).parse(await opsRpc("mealdeck_ops_revoke_staff_voucher",{p_tenant:tenantId,p_location:locationId,p_voucher:id}));
      if(result.revoked&&request===generation.current){setPendingRevoke(null);setMessage("Unused voucher revoked.");}
    }catch{if(request===generation.current)setMessage("Voucher could not be revoked. It may already be used; refresh its status.");}
    finally{lock.current=false;if(request===generation.current){setBusy(false);void refresh();}}
  }
  return <section className="md-ops-card p-5 sm:p-7" aria-label="Staff discount vouchers">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider md-ops-accent"><ShieldCheck size={16} aria-hidden="true" /> Manager controls</p>
      <h2 className="mt-1 text-xl font-black">50% staff vouchers</h2><p className="mt-1 text-sm md-ops-muted">Single-use codes assigned to verified staff accounts. No discount stacking.</p></div>
      <button type="button" className="min-h-11 rounded-lg border md-ops-border px-3 text-sm font-bold" disabled={busy} onClick={()=>void refresh()}><RefreshCw className="mr-1 inline size-4" aria-hidden="true"/> Refresh</button>
    </div>
    {!data ? <p className="mt-4 text-sm md-ops-muted">Voucher setup is unavailable or still loading.</p> : <>
      {!data.enabled && <p className="mt-4 text-sm md-ops-muted">Issuance and new redemptions are disabled. Existing voucher records remain visible.</p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label className="grid gap-1 text-sm font-bold">Assign to staff member
          <select className="min-h-11 w-full rounded-lg border md-ops-border bg-transparent px-3 font-normal" value={staffId} disabled={!data.enabled||busy||!!issued||!!pendingIssue} onChange={e=>setStaffId(e.target.value)}>
            <option value="">Choose staff member</option>{staffOptions.map(row=><option key={row.user_id} value={row.user_id}>{row.user_email??row.user_id}</option>)}
          </select></label>
        <label className="grid gap-1 text-sm font-bold">Valid for
          <select className="min-h-11 rounded-lg border md-ops-border bg-transparent px-3 font-normal" value={days} disabled={!data.enabled||busy||!!issued||!!pendingIssue} onChange={e=>setDays(e.target.value)}>
            <option value="1">1 day</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option>
          </select></label>
      </div>
      <button type="button" className="mt-3 min-h-11 rounded-lg bg-[#951018] px-4 font-bold text-white disabled:opacity-50" disabled={!data.enabled||busy||!!issued||!staffOptions.some(row=>row.user_id===staffId)} onClick={()=>void issue()}><Ticket className="mr-2 inline size-4" aria-hidden="true"/> {pendingIssue ? "Retry original issuance" : "Issue single-use voucher"}</button>
      {pendingIssue && <button type="button" className="ml-2 min-h-11 rounded-lg border md-ops-border px-3 text-sm font-bold" disabled={busy} onClick={()=>{setPendingIssue(null);setMessage("Original request outcome may be uncertain. Review the audit before issuing another code.");void refresh();}}>Stop retrying</button>}
      {issued && <div className="mt-4 rounded-xl border md-ops-border p-4">
        <strong>Copy this code now — shown once</strong>
        <p className="my-2 break-all font-mono text-sm font-bold select-all">{issued.code}</p>
        <p className="text-xs md-ops-muted">Expires {displayDate(issued.expiresAt)} UK time. Share only with the assigned staff member.</p>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="min-h-11 rounded-lg border md-ops-border px-3 font-bold" onClick={()=>{void navigator.clipboard.writeText(issued.code).then(()=>setMessage("Code copied. Share privately.")).catch(()=>setMessage("Copy the displayed code manually."));}}><Copy className="mr-1 inline size-4" aria-hidden="true"/> Copy code</button>
        <button type="button" className="min-h-11 rounded-lg border md-ops-border px-3 font-bold" onClick={()=>{setIssued(null);setMessage("Code hidden. It cannot be recovered.");}}>Hide code</button></div>
      </div>}
      <h3 className="mt-6 text-sm font-black">Latest voucher audit · up to 100</h3>
      <div className="mt-2 grid max-h-[28rem] gap-2 overflow-auto">{data.vouchers.map(row=><article key={row.id} className="rounded-lg border md-ops-border p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="break-all">{staffName(row.staffUserId)}</strong><span className="font-semibold capitalize">{row.status}</span></div>
        <p className="mt-1 text-xs md-ops-muted">Issued {displayDate(row.issuedAt)} · expires {displayDate(row.expiresAt)}</p>
        <p className="mt-1 text-xs md-ops-muted">Issued by {staffName(row.issuedBy)}{row.revokedBy ? " · revoked by "+staffName(row.revokedBy) : ""}</p>
        {row.consumedAt&&<p className="mt-1 text-xs md-ops-muted">Payment attempt created {displayDate(row.consumedAt)} · {row.paymentStatus??"Payment status unavailable"}</p>}
        {row.status==="available"&&(pendingRevoke===row.id?<div className="mt-2 flex flex-wrap gap-2"><button type="button" className="min-h-11 rounded-lg border md-ops-border px-3 font-bold" disabled={busy} onClick={()=>void revoke(row.id)}>Confirm revoke</button><button type="button" className="min-h-11 px-3" disabled={busy} onClick={()=>setPendingRevoke(null)}>Cancel</button></div>:<button type="button" className="mt-2 min-h-11 px-2 text-sm font-bold underline" disabled={busy} onClick={()=>setPendingRevoke(row.id)}>Revoke unused code</button>)}
      </article>)}
      {!data.vouchers.length&&<p className="text-sm md-ops-muted">No vouchers issued for this location.</p>}</div>
    </>}
    <p className="mt-3 text-xs md-ops-muted">A code is consumed when its payment attempt is created, not when the basket is reviewed. Do not reissue until any original payment attempt has been reconciled.</p>
    <p role="status" className="mt-2 text-sm">{message}</p>
  </section>;
}
