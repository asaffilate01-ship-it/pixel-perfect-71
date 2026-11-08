import { useCallback, useEffect, useState } from "react";
import { MapPin, MessageCircle, RefreshCw, Send } from "lucide-react";
import { opsRpc } from "@/lib/mealdeck-ops-browser";
import { parseOrderCommsSnapshot, type OrderCommsSnapshot } from "@/lib/mealdeck-order-comms";

export function KdsOrderComms({tenantId,locationId,orderId,canReply,autoPoll}:{
  tenantId:string;locationId:string;orderId:string;canReply:boolean;autoPoll:boolean;
}){
  const [open,setOpen]=useState(false);
  const [snapshot,setSnapshot]=useState<OrderCommsSnapshot|null>(null);
  const [draft,setDraft]=useState("");
  const [busy,setBusy]=useState(false);
  const [issue,setIssue]=useState("");
  const read=useCallback(async(action:"read"|"message"="read",body?:string)=>{
    const raw=await opsRpc<unknown>("mealdeck_ops_order_comms",{
      p_tenant:tenantId,p_location:locationId,p_order:orderId,
      p_action:action,...(body===undefined?{}:{p_body:body}),
    });
    const parsed=parseOrderCommsSnapshot(raw);
    if(!parsed)throw new Error("Unverified kitchen messaging result.");
    return parsed;
  },[tenantId,locationId,orderId]);
  useEffect(()=>{
    if(!open&&!autoPoll)return;
    let active=true,reading=false;
    const refresh=async()=>{
      if(reading||document.visibilityState==="hidden")return;
      reading=true;
      try{
        const next=await read();
        if(active){setSnapshot(next);setIssue("");}
      }catch{
        if(active)setIssue("Cannot refresh customer messages. Check the kitchen connection.");
      }finally{reading=false;}
    };
    void refresh();
    const timer=setInterval(()=>void refresh(),15000);
    const visible=()=>void refresh();
    document.addEventListener("visibilitychange",visible);
    return()=>{active=false;clearInterval(timer);document.removeEventListener("visibilitychange",visible);};
  },[open,autoPoll,read]);

  async function send(){
    if(!canReply||busy||!draft.trim())return;
    setBusy(true);setIssue("");
    try{
      const next=await read("message",draft.trim());
      setSnapshot(next);setDraft("");
    }catch(e){setIssue(e instanceof Error?e.message:"The message could not be sent.");}
    finally{setBusy(false);}
  }

  const arrived=snapshot?.state==="arrived";
  return (
    <section className="my-3 rounded-lg border border-slate-300 bg-white p-3 text-zinc-900"
      aria-label="Collection and kerbside communications">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={arrived?"font-bold text-emerald-800":"font-semibold"}>
          {arrived?"CUSTOMER ARRIVED":snapshot?.state==="on_my_way"?"Customer on the way":"Customer not arrived / no update"}
        </span>
        <button className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-bold"
          type="button" onClick={()=>setOpen(x=>!x)}
          aria-expanded={open}>
          <MessageCircle size={16} aria-hidden="true"/>{open?"Hide messages":"Messages & arrival"}
        </button>
      </div>
      {snapshot?.parkingNote && <p className="mt-2 text-sm"><b>Parking:</b> {snapshot.parkingNote}</p>}
      {snapshot?.pin && (
        <a className="mt-2 inline-flex items-center gap-1 text-sm font-bold underline"
          href={`https://www.google.com/maps?q=${snapshot.pin.latitude},${snapshot.pin.longitude}`}
          rel="noopener noreferrer" target="_blank">
          <MapPin size={15} aria-hidden="true"/> View customer's shared pin
        </a>
      )}
      {open && (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          <p className="text-xs">Messages are private to this paid order. Arrival does not complete handover; verify the four-digit code.</p>
          {snapshot?.messages.length?(
            <ol className="max-h-48 space-y-2 overflow-y-auto">
              {snapshot.messages.map(message=>(
                <li key={message.id} className="rounded-md bg-slate-100 p-2 text-sm">
                  <strong>{message.sender==="customer"?"Customer":"MealDeck team"}</strong>
                  <p className="break-words whitespace-pre-wrap">{message.body}</p>
                </li>
              ))}
            </ol>
          ):<p className="text-sm">No messages yet.</p>}
          <form className="flex flex-col gap-2" onSubmit={e=>{e.preventDefault();void send();}}>
            <label className="text-sm font-bold" htmlFor={`kds-message-${orderId}`}>Reply to customer</label>
            <textarea id={`kds-message-${orderId}`} className="min-h-16 rounded-md border border-slate-300 p-2 text-sm"
              rows={2} maxLength={500} value={draft} placeholder="Your order is ready for collection"
              disabled={!canReply||busy} onChange={e=>setDraft(e.currentTarget.value)}/>
            <button type="submit" disabled={!canReply||busy||!draft.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-300 px-3 py-2 text-sm font-bold disabled:opacity-50">
              <Send size={15} aria-hidden="true"/> Send reply
            </button>
          </form>
          <button type="button" className="flex items-center gap-1 text-sm underline"
            onClick={()=>void read().then(setSnapshot).catch(()=>setIssue("Can't refresh messages."))}>
            <RefreshCw size={14} aria-hidden="true"/> Refresh
          </button>
        </div>
      )}
      {issue && <p role="alert" className="mt-2 text-sm text-red-700">{issue}</p>}
    </section>
  );
}
