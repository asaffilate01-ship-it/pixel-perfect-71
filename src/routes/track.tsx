import { COMING_SOON } from "@/lib/launch-status";
import { ComingSoonPage } from "@/components/coming-soon";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Bike, CheckCircle2, Gamepad2, Loader2, RefreshCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TrackingTimeline } from "@/components/order/tracking-timeline";
import { presentMealDeckTracking } from "@/lib/mealdeck-tracking-presentation";
import { getOrderTracking, type OrderTrackingResult } from "@/lib/dishbee.functions";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "MealDeck order tracking — Coming soon" },
      { name: "description",
        content: "Track a MealDeck multi-brand order with the private order reference and handoff code once ordering is open." },
    ],
  }),
  component: () => COMING_SOON
    ? <ComingSoonPage title="Order tracking is coming soon" />
    : <TrackOrderPage />,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NETWORK_MESSAGE = "We couldn't refresh the kitchen's status. Please try again.";
const DEFAULT_MISSING_MESSAGE = "No order matched that reference and code.";

function TrackOrderPage() {
  const [orderId, setOrderId] = useState("");
  const [handoffCode, setHandoffCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OrderTrackingResult | null>(null);
  const activeRequest = useRef(0);
  const inFlight = useRef(false);
  const track = useServerFn(getOrderTracking);
  const eligible = UUID.test(orderId.trim()) && /^\d{4}$/.test(handoffCode.trim());
  const projection = result?.found ? presentMealDeckTracking(result) : null;

  function invalidate() {
    activeRequest.current += 1;
    inFlight.current = false;
    setLoading(false);
    setResult(null);
  }

  async function submit() {
    if (!eligible || inFlight.current) return;
    const requestId = ++activeRequest.current;
    inFlight.current = true;
    setLoading(true);
    setResult(null);
    try {
      const response = await track({ data: {
        orderId: orderId.trim(), handoffCode: handoffCode.trim(),
      }});
      if (activeRequest.current === requestId) setResult(response);
    } catch {
      if (activeRequest.current === requestId) {
        setResult({ found: false, message: NETWORK_MESSAGE });
      }
    } finally {
      if (activeRequest.current === requestId) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }

  return <div className="min-h-screen bg-background">
    <SiteHeader context={
      <Link to="/menus" className="font-display text-sm font-black uppercase tracking-wide text-accent">
        Explore menus
      </Link>
    }/>
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <section className="card-elevated p-5 sm:p-8">
        <p className="eyebrow">MealDeck tracking</p>
        <h1 className="mt-2 font-display text-3xl font-black sm:text-4xl">
          Follow your full order
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Your different food brands travel together in one MealDeck order.
          Enter the private order UUID and its 4-digit handoff code to view the
          latest kitchen and courier updates.
        </p>
        <form onSubmit={(event) => { event.preventDefault(); void submit(); }}
          className="mt-7 grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="order-id">Order reference</Label>
            <Input id="order-id" value={orderId} autoComplete="off"
              onChange={event => { invalidate(); setOrderId(event.target.value.slice(0,36)); }}
              placeholder="Order UUID"
              aria-describedby="tracking-privacy"
              className="min-h-11 font-mono text-sm"/>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="handoff-code">4-digit code</Label>
            <Input id="handoff-code" value={handoffCode} inputMode="numeric"
              autoComplete="off" maxLength={4} type="password"
              onChange={event => { invalidate();
                setHandoffCode(event.target.value.replace(/\D/g, "").slice(0,4)); }}
              placeholder="••••" className="min-h-11 font-mono tracking-[.18em]"/>
          </div>
          <Button type="submit" variant="hero" size="lg" className="min-h-11 rounded-xl"
            disabled={loading || !eligible}>
            {loading ? <Loader2 aria-hidden="true" className="size-5 animate-spin"/> :
              <Search aria-hidden="true" className="size-5"/>}
            {loading ? "Checking…" : "Track"}
          </Button>
        </form>
        <p id="tracking-privacy" className="mt-3 text-xs leading-5 text-muted-foreground">
          Keep both details private. This page never asks for your card details or
          treats a courier update as independent proof of delivery.
        </p>
      </section>

      {result?.found && projection ? (
        <section aria-label="Your latest MealDeck order status"
          className="mt-6 overflow-hidden rounded-3xl border border-border bg-card">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent/10">
                {projection.tone === "review" ?
                  <AlertCircle aria-hidden="true" className="size-6 text-destructive"/> :
                  <CheckCircle2 aria-hidden="true" className="size-6 text-accent"/>}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {projection.tone === "review" ? "Status needs checking" :
                    projection.tone === "reported" ? "Reported status" : "Latest update"}
                </p>
                <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">
                  {projection.headline}
                </h2>
                <p role={projection.tone === "review" ? "alert" : "status"}
                  className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  {projection.description}
                </p>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm"
              className="min-h-11 shrink-0 gap-2 rounded-xl"
              onClick={() => void submit()} disabled={loading || !eligible}>
              {loading ? <Loader2 aria-hidden="true" className="size-4 animate-spin"/> :
                <RefreshCcw aria-hidden="true" className="size-4"/>}
              Refresh
            </Button>
          </div>
          <TrackingTimeline value={projection}/>
          {projection.tone !== "review" && ["paid", "accepted", "preparing"].includes(result.orderStatus) ? (
            <div className="border-t border-border p-5 sm:p-6">
              <p className="mb-3 text-sm text-muted-foreground">Fancy a free food-card game while you wait?</p>
              <Link to="/play" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2">
                <Gamepad2 aria-hidden="true" className="size-5"/> Play while you wait
              </Link>
              <p className="mt-2 text-xs text-muted-foreground">Games are for fun only, with no prizes or wagering. Return here to track your order.</p>
            </div>
          ) : null}
          {projection.canOpenCourierTracking && result.trackingUrl ? (
            <div className="border-t border-border p-5 sm:p-6">
              <a href={result.trackingUrl} rel="noopener noreferrer" target="_blank"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2">
                <Bike aria-hidden="true" className="size-4"/>
                View courier tracking
              </a>
              <p className="mt-2 text-xs text-muted-foreground">
                Opens the verified delivery provider's tracking page. Times are estimates.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {result && !result.found ? (
        <p role="status" className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm leading-6">
          {result.message || DEFAULT_MISSING_MESSAGE}
        </p>
      ) : null}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        No automatic refresh. Use Refresh to request another status update.
      </p>
    </main>
    <SiteFooter/>
  </div>;
}
