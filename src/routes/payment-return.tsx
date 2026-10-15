import {createFileRoute,Link} from "@tanstack/react-router";
import {useEffect,useState} from "react";
import {useServerFn} from "@tanstack/react-start";
import {checkMealDeckPayment} from "@/lib/dishbee.functions";
import type {LocationKey} from "@/lib/mealdeck";
import {seo} from "@/lib/seo";

type PaymentSearch={orderId?:string};
type SavedHandoff={orderId:string;handoffCode:string;location:LocationKey};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route=createFileRoute("/payment-return")({
  validateSearch:(raw:Record<string,unknown>):PaymentSearch=>
    typeof raw["orderId"]==="string"&&uuid.test(raw["orderId"])
      ?{orderId:raw["orderId"]}:{},
  head:()=>seo({title:"Payment status | MealDeck",
    description:"Check your MealDeck payment status securely.",
    path:"/payment-return",noindex:true}),
  component:PaymentReturn,
});

function readHandoff(expected?:string):SavedHandoff|null{
  if(!expected)return null;
  try{
    const raw=sessionStorage.getItem("mealdeck-payment-return");
    if(!raw)return null;
    const value=JSON.parse(raw) as Partial<SavedHandoff>;
    if(value.orderId!==expected||!uuid.test(value.orderId??"")||
      !/^\d{4}$/.test(value.handoffCode??"")||
      !["luton","stalbans"].includes(value.location??""))return null;
    return value as SavedHandoff;
  }catch{return null}
}

function PaymentReturn(){
  const {orderId}=Route.useSearch();
  const [handoff,setHandoff]=useState<SavedHandoff|null>(null);
  const [state,setState]=useState<"checking"|"paid"|"pending"|"unavailable">("checking");
  const [busy,setBusy]=useState(false);
  const status=useServerFn(checkMealDeckPayment);

  async function verify(value:SavedHandoff){
    setBusy(true);setState("checking");
    try{
      const result=await status({data:value});
      if(result.status==="paid"){
        setState("paid");
        try{sessionStorage.removeItem("mealdeck-payment-return")}catch{}
      }else{
        setState(result.status==="pending"?"pending":"unavailable");
      }
    }catch{setState("unavailable")}finally{setBusy(false)}
  }

  useEffect(()=>{
    const saved=readHandoff(orderId);
    setHandoff(saved);
    if(saved)void verify(saved);
    else setState("unavailable");
    // Order reference is immutable in the redirect; check once on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[orderId]);

  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-16">
    <p className="text-xs font-semibold uppercase tracking-widest">MealDeck • secure payment</p>
    <h1 className="mt-3 text-3xl font-bold">
      {state==="paid"?"Payment confirmed":state==="checking"?"Checking payment":
       state==="pending"?"Payment still processing":"Payment not verified"}
    </h1>
    <p className="mt-4 text-sm leading-7 text-muted-foreground">
      {state==="paid"
        ?"Dishbee has verified your payment with the provider. Your order can now be prepared."
        :state==="pending"
         ?"We cannot confirm a completed payment yet. Do not place a duplicate order. You may check again."
         :"A return from a payment page is not proof of payment. Only verified payments reach the kitchen."}
    </p>
    {orderId?<p className="mt-3 text-xs text-muted-foreground">Order reference: {orderId.slice(0,8).toUpperCase()}</p>:null}
    <div className="mt-8 flex flex-wrap gap-3">
      {handoff&&state!=="paid"?(
        <button type="button" onClick={()=>void verify(handoff)} disabled={busy}
          className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50">
          {busy?"Checking…":"Refresh payment status"}
        </button>
      ):null}
      <Link to="/track" className="rounded-xl border border-border px-5 py-3 font-semibold">Track an order</Link>
      <Link to="/order" className="rounded-xl border border-border px-5 py-3 font-semibold">Browse MealDeck</Link>
    </div>
  </main>;
}
