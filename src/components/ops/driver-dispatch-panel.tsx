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
          {board.drivers.length===0 && <p className="text-sm md-ops-muted">No drivers registered. A manager must add an existing MealDeck Auth account.</p>}
          <ul className="space-y-2 text-sm">
            {board.drivers.map(d=><li key={d.driverId} className="flex justify-between gap-3">
              <span className="font-semibold">{d.name}</span>
              <span>{!d.enabled?"Disabled":d.onShift?"On shift":"Off shift"}</span>
            </li>)}
          </ul>
          {canEnrol && <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
            <label className="text-sm font-bold">Existing Auth user UUID
              <input className="md-ops-field mt-1 w-full" value={newDriverId} onChange={e=>setNewDriverId(e.target.value.trim())} placeholder="Driver's MealDeck Auth user ID"/>
            </label>
            <label className="text-sm font-bold">Driver display name
              <input className="md-ops-field mt-1 w-full" value={newDriverName} onChange={e=>setNewDriverName(e.target.value)} maxLength={100} placeholder="Driver name"/>
            </label>
            <button type="button" className="md-ops-button md-ops-primary sm:col-span-2"
              disabled={busy||!driverId.safeParse(newDriverId).success||newDriverName.trim().length<2}
              onClick={()=>void enrol()}><UserPlus size={17}/> Approve driver account</button>
          </div>}
          <p className="flex gap-2 items-center text-xs md-ops-muted"><ShieldCheck size={16}/> Driver app is a separate protected login. Customer payment and final delivery remain staff-authorised.</p>
          <Link to="/driver" className="inline-flex items-center gap-2 underline font-bold" target="_blank">Open driver app</Link>
        </div>
      </>}
    </div>}
  </section>;
}
