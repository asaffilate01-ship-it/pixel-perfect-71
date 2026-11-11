import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Truck, RefreshCw, ShieldCheck, UserPlus } from "lucide-react";
import { opsRpc } from "@/lib/mealdeck-ops-browser";
import { z } from "zod";

const driverId = z.uuid();
const dispatchSchema = z.strictObject({
  drivers: z.array(z.strictObject({
    driverId, name: z.string(), onShift: z.boolean(), enabled: z.boolean(),
  })).max(300),
  orders: z.array(z.strictObject({
    jobId: driverId, postcode: z.string(),
    assignment: z.string().nullable(), assignedDriver: driverId.nullable(),
    driverStatus: z.string(), createdAt: z.string(),
  })).max(25),
});
type Dispatch = z.infer<typeof dispatchSchema>;

export function OpsDriverDispatchPanel({ tenantId, locationId, canEnrol }:{
  tenantId:string;locationId:string;canEnrol:boolean;
}) {
  const [expanded,setExpanded]=useState(false);
  const [board,setBoard]=useState<Dispatch|null>(null);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [newDriverEmail,setNewDriverEmail]=useState("");
  const [verifiedDriverId,setVerifiedDriverId]=useState<string|null>(null);
  const [newDriverName,setNewDriverName]=useState("");
  // Revocation/restoration requires a second, named manager confirmation.
  const [pendingAccess,setPendingAccess]=useState<{
    driverId:string;name:string;nextEnabled:boolean;
  }|null>(null);
  const [choices,setChoices]=useState<Record<string,string>>({});
  const refresh=useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const raw=await opsRpc<unknown>("mealdeck_ops_driver_dispatch_board",{
        p_tenant:tenantId,p_location:locationId,
      });
      const parsed=dispatchSchema.safeParse(raw);
      if (!parsed.success) throw new Error("Driver dispatch returned an unexpected response.");
      setBoard(parsed.data);
    } catch(reason) {
      setBoard(null);
      setError(reason instanceof Error ? reason.message : "Driver dispatch is not ready.");
    } finally {setLoading(false);}
  },[tenantId,locationId]);

  useEffect(()=>{
    if(!expanded) return;
    void refresh();
    const timer=window.setInterval(()=>{
      if(document.visibilityState==="visible" && !busy)void refresh();
    },20_000);
    return ()=>window.clearInterval(timer);
  },[expanded,refresh,busy]);

  async function findDriverAccount(){
    if(!canEnrol||busy||!/^\S+@\S+\.\S+$/.test(newDriverEmail.trim()))return;
    setBusy(true);setError("");setNotice("");setVerifiedDriverId(null);
    try {
      const data=await opsRpc<unknown>("mealdeck_ops_driver_find_verified_email",{
        p_tenant:tenantId,p_location:locationId,p_email:newDriverEmail.trim().toLowerCase(),
      });
      const parsed=z.strictObject({found:z.boolean(),userId:driverId.nullable()}).safeParse(data);
      if(!parsed.success)throw new Error("Driver account lookup returned an unexpected response.");
      if(!parsed.data.found||!parsed.data.userId){
        setError("No verified MealDeck account was found for that email. Ask the driver to register and verify their email under /account, then search again.");
      } else {
        setVerifiedDriverId(parsed.data.userId);
        setNotice("Verified account found. Check the driver's name and email before granting driver access.");
      }
    }catch(reason){setError(reason instanceof Error?reason.message:"The verified account lookup is unavailable. Ask the owner to install the driver lookup migration.");}
    finally{setBusy(false);}
  }
  async function enrol(){
    if(!canEnrol||busy||!verifiedDriverId||newDriverName.trim().length<2)return;
    setBusy(true);setError("");setNotice("");
    try{
      await opsRpc("mealdeck_ops_driver_enrol",{p_tenant:tenantId,p_location:locationId,
        p_user:verifiedDriverId,p_name:newDriverName.trim()});
      setNotice("Driver approved. They can now sign in at /driver using their email code and start a shift.");
      setVerifiedDriverId(null);setNewDriverEmail("");setNewDriverName("");await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not approve the driver.");}
    finally{setBusy(false);}
  }
  async function confirmDriverAccess(){
    if(!canEnrol||busy||!pendingAccess||!driverId.safeParse(pendingAccess.driverId).success)return;
    const currentlyListed=board?.drivers.find(d=>d.driverId===pendingAccess.driverId);
    if(!currentlyListed||currentlyListed.enabled===pendingAccess.nextEnabled){
      setPendingAccess(null);setError("Driver access has changed. Refresh and review the latest roster.");
      return;
    }
    setBusy(true);setError("");setNotice("");
    try {
      const result=await opsRpc<unknown>("mealdeck_ops_driver_set_enabled",{
        p_tenant:tenantId,p_location:locationId,
        p_user:pendingAccess.driverId,p_enabled:pendingAccess.nextEnabled,
      });
      const confirmed=z.strictObject({ok:z.literal(true),enabled:z.boolean()}).safeParse(result);
      if(!confirmed.success||confirmed.data.enabled!==pendingAccess.nextEnabled)
        throw new Error("Driver access could not be verified. Refresh before retrying.");
      const changedName=pendingAccess.name;
      const nowEnabled=pendingAccess.nextEnabled;
      setPendingAccess(null);
      await refresh();
      setNotice(nowEnabled
        ? changedName+" can now sign in and start a shift. No job is assigned automatically."
        : changedName+" can no longer access driver jobs. Their shift was ended.");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Driver access could not be changed. Refresh and check the roster.");
    }finally{setBusy(false);}
  }
  async function offer(orderId:string){
    const driver=choices[orderId];
    if(!driver||!driverId.safeParse(driver).success||busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      await opsRpc("mealdeck_ops_driver_offer",{p_tenant:tenantId,p_location:locationId,
        p_order:orderId,p_driver:driver});
      setNotice("Offer sent. The driver must accept it in their app before it expires.");
      await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:"Offer could not be confirmed. Refresh before retrying.");}
    finally{setBusy(false);}
  }
  return <section aria-label="Own-driver dispatch" className="md-ops-card rounded-2xl border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><Truck size={22} aria-hidden="true"/>
        <div><h3 className="font-display text-lg font-black md-ops-ink">Own-driver dispatch</h3>
          <p className="text-xs md-ops-muted">Luton · staff-controlled handover remains in KDS</p></div>
      </div>
      <button type="button" className="md-ops-button md-ops-secondary" onClick={()=>setExpanded(!expanded)}
        aria-expanded={expanded} aria-controls="mealdeck-dispatch-details">
        {expanded?"Hide dispatch":"Show dispatch"}
      </button>
    </div>
    {expanded && <div id="mealdeck-dispatch-details" className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm md-ops-muted">Assign only paid, fully packed delivery orders. Drivers receive the address after accepting.</p>
        <button type="button" disabled={loading||busy} onClick={()=>void refresh()} className="md-ops-button md-ops-secondary">
          <RefreshCw size={16}/> {loading?"Checking…":"Refresh"}
        </button>
      </div>
      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">{notice}</p>}
      {!board && !error && <p role="status">Checking authorised driver dispatch…</p>}
      {board && <>
        <p className="text-sm font-bold md-ops-ink">{board.drivers.filter(d=>d.enabled&&d.onShift).length} driver(s) on shift · {board.orders.length} ready delivery job(s)</p>
        {board.drivers.filter(d=>d.enabled&&d.onShift).length===0 && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="status">
          No approved driver is on shift. Ask an approved driver to sign in at <Link to="/driver" target="_blank" rel="noopener noreferrer" className="underline font-bold">/driver</Link> and start a shift.
          Do not offer jobs until an available driver is listed; KDS staff still verify sealed-bag handover.
        </p>}
        {board.orders.length===0 && <p className="text-sm md-ops-muted">No fully packed, paid delivery jobs awaiting assignment.</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          {board.orders.map(order=>{
            const available=board.drivers.filter(d=>d.enabled&&d.onShift);
            const awaiting=order.assignment==="offered"||order.assignment==="assigned"||
              order.assignment==="at_kitchen"||order.assignment==="collected"||
              order.assignment==="at_customer"||order.assignment==="dropoff_reported";
            return <div key={order.jobId} className="rounded-xl border p-4 space-y-2">
              <strong className="md-ops-ink">Job …{order.jobId.slice(-6).toUpperCase()} · {order.postcode}</strong>
              <p className="text-xs md-ops-muted">{awaiting ? `Assigned: ${order.assignment}`:"Ready for driver"} · Kitchen handover: {order.driverStatus}</p>
              {!awaiting && <div className="flex flex-wrap gap-2">
                <label className="flex-1 text-sm font-bold md-ops-text">Driver
                  <select className="md-ops-field mt-1 w-full" value={choices[order.jobId]??""}
                    onChange={e=>setChoices(c=>({...c,[order.jobId]:e.target.value}))}>
                    <option value="">Choose a driver</option>
                    {available.map(d=><option key={d.driverId} value={d.driverId}>{d.name}</option>)}
                  </select>
                </label>
                <button type="button" className="md-ops-button md-ops-primary self-end"
                  disabled={busy||!choices[order.jobId]} onClick={()=>void offer(order.jobId)}>Offer job</button>
              </div>}
            </div>;
          })}
        </div>
        <div className="border-t pt-4 space-y-3">
          <h4 className="font-bold md-ops-ink">Approved drivers</h4>
          {board.drivers.length===0 && <div className="rounded-xl border bg-amber-50 p-3 text-sm text-amber-950" role="status">
            No approved drivers. To enable dispatch: verify the driver's email in MealDeck /account,
            find that exact email below, approve their account, then ask them to sign in at /driver and start a shift.
            Approving access does not assign a job or enable delivery payments.
          </div>}
          <ul className="space-y-2 text-sm">
            {board.drivers.map(d=><li key={d.driverId} className="flex flex-col gap-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold md-ops-ink">{d.name}</span>
                <span className="text-xs md-ops-muted">{!d.enabled?"Access disabled":d.onShift?"On shift":"Off shift"}</span>
                {canEnrol && <button type="button" className="md-ops-button md-ops-secondary"
                  disabled={busy||loading}
                  aria-label={(d.enabled?"Disable":"Enable")+" driver access for "+d.name}
                  onClick={()=>{setError("");setNotice("");setPendingAccess({
                    driverId:d.driverId,name:d.name,nextEnabled:!d.enabled,
                  });}}>
                  {d.enabled?"Disable driver":"Enable driver"}
                </button>}
              </div>
              {canEnrol&&pendingAccess?.driverId===d.driverId && <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 space-y-2">
                <p className="text-sm font-semibold text-amber-950" role="status">
                  Confirm {pendingAccess.nextEnabled?"restoring":"revoking"} driver access for {d.name}?
                </p>
                <p className="text-xs text-amber-900">
                  {pendingAccess.nextEnabled
                    ? "Access can be restored, but the driver must start a shift themselves."
                    : "Active deliveries cannot be revoked until the kitchen finishes or resolves the job. This does not cancel any paid customer order."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="md-ops-button md-ops-primary" disabled={busy}
                    onClick={()=>void confirmDriverAccess()}>
                    {busy?"Checking…":pendingAccess.nextEnabled?"Confirm enable":"Confirm disable"}
                  </button>
                  <button type="button" className="md-ops-button md-ops-secondary" disabled={busy}
                    onClick={()=>setPendingAccess(null)}>Cancel</button>
                </div>
              </div>}
            </li>)}
          </ul>
          {canEnrol && <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h5 className="font-bold md-ops-ink">Approve a driver in two steps</h5>
              <p className="text-sm md-ops-muted">
                First, the driver must create and verify an account at <Link to="/account" target="_blank" className="underline">MealDeck /account</Link>.
                Then find that exact email below. Only the manager can approve driver access.
              </p>
            </div>
            <label className="text-sm font-bold">Driver's verified email address
              <input type="email" autoComplete="off" className="md-ops-field mt-1 w-full"
                value={newDriverEmail} disabled={busy} onChange={e=>{setNewDriverEmail(e.target.value);setVerifiedDriverId(null);}}
                placeholder="driver@example.com"/>
            </label>
            <button type="button" className="md-ops-button md-ops-secondary self-end"
              disabled={busy||!/^\S+@\S+\.\S+$/.test(newDriverEmail.trim())}
              onClick={()=>void findDriverAccount()}>
              <UserPlus size={17}/> Find verified account
            </button>
            {verifiedDriverId && <>
              <p className="sm:col-span-2 text-sm md-ops-muted" role="status">
                Verified email found. Approve this person only after confirming they are your driver.
              </p>
              <label className="text-sm font-bold">Driver display name
                <input className="md-ops-field mt-1 w-full" value={newDriverName}
                  onChange={e=>setNewDriverName(e.target.value)}
                  disabled={busy} maxLength={100} placeholder="Driver name"/>
              </label>
              <button type="button" className="md-ops-button md-ops-primary self-end"
                disabled={busy||newDriverName.trim().length<2}
                onClick={()=>void enrol()}><UserPlus size={17}/> Approve driver access</button>
            </>}
          </div>}
          <p className="flex gap-2 items-center text-xs md-ops-muted"><ShieldCheck size={16}/> Driver app is a separate protected login. Customer payment and final delivery remain staff-authorised.</p>
          <Link to="/driver" className="inline-flex items-center gap-2 underline font-bold" target="_blank">Open driver app</Link>
        </div>
      </>}
    </div>}
  </section>;
}
