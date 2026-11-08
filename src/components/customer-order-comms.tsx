import { useCallback, useEffect, useState } from "react";
import { Check, MapPin, MessageCircle, Navigation, RefreshCw, Send } from "lucide-react";
import { getMealDeckCustomerAccessToken } from "@/lib/mealdeck-customer-browser";
import {
  requestMealDeckCheckout,
  type MealDeckCheckoutMode,
} from "@/lib/mealdeck-checkout-browser";
import {
  parseOrderCommsSnapshot,
  type CustomerCommsKind,
  type OrderCommsSnapshot,
} from "@/lib/mealdeck-order-comms";

type Props = {
  orderId:string;
  mode:MealDeckCheckoutMode;
  fulfilment:"pickup"|"curbside";
};

/** Works with an existing signed-in order or the original private guest cookie. */
export function CustomerOrderComms({orderId,mode,fulfilment}:Props){
  const [snapshot,setSnapshot]=useState<OrderCommsSnapshot|null>(null);
  const [busy,setBusy]=useState(false);
  const [issue,setIssue]=useState("");
  const [draft,setDraft]=useState("");
  const [parking,setParking]=useState("");
  const [locating,setLocating]=useState(false);
  const request=useCallback(async (kind:CustomerCommsKind,values:Record<string,unknown>={})=>{
    const result=await requestMealDeckCheckout<{comms:unknown}>(
      mode,{action:"handoff_comms",orderId,kind,...values},
      getMealDeckCustomerAccessToken,undefined,fetch,
    );
    const parsed=parseOrderCommsSnapshot(result.comms);
    if(!parsed)throw new Error("We couldn't verify the latest order messages.");
    return parsed;
  },[mode,orderId]);

  useEffect(()=>{
    let active=true;let reading=false;
    const refresh=async()=>{
      if(reading||document.visibilityState==="hidden")return;
      reading=true;
      try{
        const result=await request("read");
        if(active){setSnapshot(result);setIssue("");}
      }catch{
        if(active)setIssue("Messages couldn't refresh. Your order is still available above.");
      }finally{reading=false;}
    };
    void refresh();
    const timer=setInterval(()=>void refresh(),12000);
    const onVisible=()=>void refresh();
    window.addEventListener("online",onVisible);
    document.addEventListener("visibilitychange",onVisible);
    return()=>{active=false;clearInterval(timer);window.removeEventListener("online",onVisible);
      document.removeEventListener("visibilitychange",onVisible);};
  },[request]);

  const save=async(kind:CustomerCommsKind,values:Record<string,unknown>={})=>{
    if(busy||locating)return;
    setBusy(true);setIssue("");
    try{
      const result=await request(kind,values);
      setSnapshot(result);
      if(kind==="message")setDraft("");
    }catch(error){
      setIssue(error instanceof Error?error.message:"The update couldn't be sent. Please retry.");
    }finally{setBusy(false);}
  };

  async function sharePin(){
    if(busy||locating)return;
    if(!navigator.geolocation){
      setIssue("This browser can't share its location. You can type your parking position instead.");
      return;
    }
    setLocating(true);setIssue("");
    // Location permission is requested only after the explicit button press.
    navigator.geolocation.getCurrentPosition(
      (position)=>{
        setLocating(false);
        void save("pin",{
          latitude:Math.round(position.coords.latitude*1000000)/1000000,
          longitude:Math.round(position.coords.longitude*1000000)/1000000,
          ...(parking.trim()?{parkingNote:parking.trim()}:{}),
        });
      },
      ()=>{setLocating(false);setIssue("Location wasn't shared. Enter your parking position instead.");},
      {enableHighAccuracy:true,timeout:8000,maximumAge:0},
    );
  }

  return (
    <section className="md-checkout-card space-y-3" aria-label="Contact the MealDeck kitchen about your order">
      <div className="flex items-center gap-2">
        <MessageCircle size={22} aria-hidden="true"/>
        <h2 className="font-bold text-xl">Collection updates &amp; messages</h2>
      </div>
      <p className="text-sm">Tell our team when you're coming or have arrived. This does not mark your food as collected. Keep your four-digit code for handover.</p>
      <p role="status" className="text-sm font-semibold">
        {snapshot?.state==="arrived"?"Arrival sent to kitchen":
          snapshot?.state==="on_my_way"?"Kitchen notified: on your way":
          "Arrival not reported yet"}
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="md-checkout-refresh" type="button" disabled={busy||locating}
          onClick={()=>void save("on_my_way")}>
          <Navigation size={16} aria-hidden="true"/> On my way
        </button>
        <button className="md-checkout-primary" type="button" disabled={busy||locating}
          onClick={()=>void save("arrived",parking.trim()?{parkingNote:parking.trim()}: {})}>
          <Check size={16} aria-hidden="true"/> I've arrived
        </button>
      </div>
      {fulfilment==="curbside"&&(
        <div className="space-y-2">
          <label className="block text-sm font-semibold" htmlFor="mealdeck-parking-note">
            Where are you parked? (optional)
          </label>
          <input id="mealdeck-parking-note" value={parking}
            placeholder="e.g. Blue car near entrance, bay 2" maxLength={120}
            disabled={busy||locating}
            onChange={event=>setParking(event.currentTarget.value)}
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-zinc-900"/>
          <button className="md-checkout-refresh" type="button" disabled={busy||locating}
            onClick={()=>void sharePin()}>
            <MapPin size={16} aria-hidden="true"/>
            {locating?"Requesting location permission…":"Share my location pin (optional)"}
          </button>
          <p className="text-xs">Only this one position is shared with the kitchen, for up to 30 minutes. No background tracking. You can still collect without sharing it.</p>
        </div>
      )}
      {snapshot?.messages.length ? (
        <ol className="space-y-2" aria-label="Your order conversation">
          {snapshot.messages.map(message=>(
            <li key={message.id} className="rounded-lg bg-stone-100 p-3 text-sm text-zinc-900">
              <strong>{message.sender==="customer"?"You":"MealDeck team"}</strong>
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
            </li>
          ))}
        </ol>
      ):<p className="text-sm text-zinc-600">No messages yet. Ask a question or let us know if you're delayed.</p>}
      <form className="flex flex-col gap-2" onSubmit={event=>{event.preventDefault();
        if(draft.trim())void save("message",{body:draft.trim()});}}>
        <label htmlFor="mealdeck-order-message" className="font-semibold text-sm">Message the kitchen</label>
        <textarea id="mealdeck-order-message" value={draft}
          onChange={e=>setDraft(e.currentTarget.value)} maxLength={500}
          placeholder="e.g. Running 10 minutes late" rows={2}
          disabled={busy||locating} className="w-full rounded-lg border border-stone-300 bg-white p-3 text-zinc-900"/>
        <button type="submit" disabled={busy||locating||!draft.trim()} className="md-checkout-primary">
          <Send size={16} aria-hidden="true"/> Send message
        </button>
      </form>
      <button className="md-checkout-refresh" type="button" disabled={busy||locating}
        onClick={()=>void request("read").then(setSnapshot).catch(()=>setIssue("Unable to refresh messages."))}>
        <RefreshCw size={14} aria-hidden="true"/> Refresh messages
      </button>
      {issue&&<p role="alert" className="text-sm text-red-700">{issue}</p>}
    </section>
  );
}
