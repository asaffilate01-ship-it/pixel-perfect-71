import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Bike,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  PackageCheck,
  Search,
  Gamepad2,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getOrderTracking, type OrderTrackingResult } from "@/lib/dishbee.functions";

export const Route=createFileRoute("/track")({
  head:()=>({
    meta:[
      {title:"Track Order — MealDeck"},
      {
        name:"description",
        content:"Track a MealDeck order using the order reference and 4-digit handoff code.",
      },
    ],
  }),
  component:TrackOrderPage,
});

const statusCopy:Record<string,{label:string;copy:string;Icon:typeof Clock3}>={
  payment_pending:{
    label:"Awaiting payment",
    copy:"Payment has not confirmed yet, so your order has not been sent for preparation.",
    Icon:Clock3,
  },
  paid:{
    label:"Payment confirmed",
    copy:"Payment is confirmed and your order is being sent for preparation.",
    Icon:CheckCircle2,
  },
  accepted:{
    label:"Sent for preparation",
    copy:"Your order has been sent to the chefs.",
    Icon:PackageCheck,
  },
  preparing:{
    label:"Preparing",
    copy:"Each brand is freshly preparing their dishes for your order.",
    Icon:PackageCheck,
  },
  ready:{
    label:"Ready",
    copy:"Your order is ready for the next handoff step.",
    Icon:CheckCircle2,
  },
  fulfilled:{
    label:"Completed",
    copy:"Your MealDeck order has been completed.",
    Icon:CheckCircle2,
  },
};

const passCopy:Record<string,{label:string;copy:string;Icon:typeof Clock3}>={
  ready_to_pack:{
    label:"Preparation complete",
    copy:"Every brand's dishes are ready and your order is moving to the MealDeck pass.",
    Icon:PackageCheck,
  },
  packing:{
    label:"Packing your order",
    copy:"Your MealDeck pass keeps every brand together for one delivery.",
    Icon:PackageCheck,
  },
  sealed:{
    label:"Packed & sealed",
    copy:"Your full multi-brand order is packed and being checked for handoff.",
    Icon:CheckCircle2,
  },
  ready_for_handoff:{
    label:"Ready for handoff",
    copy:"Your complete order is ready for collection or delivery handoff.",
    Icon:CheckCircle2,
  },
};

const deliveryCopy:Record<string,string>={
  waiting_for_kitchen:"Waiting for preparation",
  waiting_for_ready:"Waiting for the full order to be packed",
  pending_quote:"Finding the best available delivery",
  quoted:"Delivery option selected",
  booking:"Booking your driver",
  booked:"Driver booking confirmed",
  requested:"Finding a delivery driver",
  accepted:"Delivery accepted",
  driver_assigned:"Driver assigned",
  arriving_pickup:"Driver on the way to collect your order",
  picked_up:"Order collected by driver",
  arriving_customer:"Driver heading to you",
  delivered:"Delivered",
  cancelled:"Delivery cancelled",
  failed:"Delivery issue",
};

function TrackOrderPage(){
  const[orderId,setOrderId]=useState("");
  const[handoffCode,setHandoffCode]=useState("");
  const[loading,setLoading]=useState(false);
  const[result,setResult]=useState<OrderTrackingResult|null>(null);
  const track=useServerFn(getOrderTracking);

  async function submit(){
    if(!orderId.trim()||handoffCode.trim().length!==4)return;
    setLoading(true);
    try{
      setResult(await track({
        data:{
          orderId:orderId.trim(),
          handoffCode:handoffCode.trim(),
        },
      }));
    }finally{
      setLoading(false);
    }
  }

  const status=result?.found
    ? (result.passStatus?passCopy[result.passStatus]:undefined)
      ??statusCopy[result.orderStatus]
      ??{
        label:result.orderStatus.replace(/_/g," "),
        copy:"Your order status has been updated.",
        Icon:Clock3,
      }
    : null;
  const StatusIcon=status?.Icon??Clock3;

  return <div className="min-h-screen bg-background">
    <SiteHeader
      context={
        <Link to="/order" className="font-display text-sm font-black uppercase tracking-wide text-accent">
          Start an order
        </Link>
      }
    />

    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <section className="card-elevated p-6 sm:p-8">
        <p className="eyebrow">MealDeck tracking</p>
        <h1 className="mt-2 text-4xl font-extrabold">Where is my order?</h1>
        <p className="mt-3 text-muted-foreground">
          Enter the order UUID from your confirmation and the 4-digit handoff code.
        </p>

        <div className="mt-7 grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="order-id">Order reference</Label>
            <Input
              id="order-id"
              value={orderId}
              onChange={(event)=>setOrderId(event.target.value)}
              placeholder="Order UUID"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="handoff-code">4-digit code</Label>
            <Input
              id="handoff-code"
              value={handoffCode}
              inputMode="numeric"
              maxLength={4}
              onChange={(event)=>setHandoffCode(event.target.value.replace(/\D/g,"").slice(0,4))}
              placeholder="1234"
              className="font-mono tracking-[.25em]"
            />
          </div>
          <Button
            variant="hero"
            size="lg"
            className="rounded-xl"
            disabled={loading||!orderId.trim()||handoffCode.length!==4}
            onClick={()=>void submit()}
          >
            {loading?<Loader2 className="animate-spin"/>:<Search/>}
            Track
          </Button>
        </div>
      </section>

      {result?.found&&status?(
        <section className="mt-6 overflow-hidden rounded-3xl border border-border bg-card">
          <div className="flex items-start gap-4 border-b border-border p-6">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent/10">
              <StatusIcon className="size-6 text-accent"/>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[.16em] text-muted-foreground">
                Order status
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold">{status.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{status.copy}</p>
            </div>
          </div>

          <div className="grid gap-3 p-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background/50 p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {result.fulfilment==="delivery"?<Bike className="size-4"/>:
                  result.fulfilment==="curbside"?<MapPin className="size-4"/>:
                  <ShoppingBag className="size-4"/>}
                Fulfilment
              </div>
              <p className="mt-2 font-display text-lg font-bold capitalize">
                {result.fulfilment.replace(/_/g," ")}
              </p>
            </div>

            {result.fulfilment==="delivery"?(
              <div className="rounded-2xl border border-border bg-background/50 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Bike className="size-4"/>Delivery
                </div>
                <p className="mt-2 font-display text-lg font-bold">
                  {deliveryCopy[result.deliveryStatus??""]??"Waiting for dispatch"}
                </p>
              </div>
            ):null}
          </div>

          {["paid", "accepted", "preparing"].includes(result.orderStatus) ? (
            <div className="border-t border-border p-6">
              <p className="mb-3 text-sm text-muted-foreground">Your chefs are at work. Fancy a free food-card game while you wait?</p>
              <Link to="/play" className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-foreground">
                <Gamepad2 className="size-5" /> Play while you wait
              </Link>
              <p className="mt-2 text-xs text-muted-foreground">Games are for fun only, with no prizes or wagering. Return here to track your order.</p>
            </div>
          ) : null}

          {result.trackingUrl?(
            <div className="border-t border-border p-6">
              <a
                href={result.trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
              >
                <Bike className="size-4"/>Live delivery tracking
              </a>
            </div>
          ):null}
        </section>
      ):null}

      {result&&!result.found?(
        <p className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
          {result.message}
        </p>
      ):null}
    </main>

    <SiteFooter/>
  </div>
}
