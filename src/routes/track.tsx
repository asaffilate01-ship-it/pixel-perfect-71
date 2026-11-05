import { COMING_SOON } from "@/lib/launch-status";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Bike,
  CheckCircle2,
  Clock3,
  Gamepad2,
  Loader2,
  RefreshCcw,
  Search,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TrackingTimeline } from "@/components/order/tracking-timeline";
import { presentMealDeckTracking } from "@/lib/mealdeck-tracking-presentation";
import { getOrderTracking, type OrderTrackingResult } from "@/lib/dishbee.functions";

export const Route = createFileRoute("/track")({
  // Collection launch orders and progress belong to the verified customer's
  // account. Keep the legacy reference lookup behind its existing release gate.
  beforeLoad: () => {
    if (COMING_SOON)
      throw redirect({ to: "/account", hash: "customer-orders-title", replace: true });
  },
  head: () => ({
    meta: [
      { title: "Your MealDeck order progress" },
      {
        name: "description",
        content:
          "Sign in to see your MealDeck orders, collection progress and full itemised receipts.",
      },
    ],
  }),
  component: TrackOrderPage,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NETWORK_MESSAGE = "We couldn't refresh your order. Please try again.";
const DEFAULT_MISSING_MESSAGE = "No order matched that reference and code.";
const POLL_INTERVAL_MS = 20_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_AUTOMATIC_CHECKS = 180;
type FoundOrder = Extract<OrderTrackingResult, { found: true }>;

function isTransportFailure(reason: unknown): boolean {
  return (
    reason instanceof TypeError &&
    /failed to fetch|fetch failed|load failed|network(?:error| error| request failed)/i.test(
      reason.message,
    )
  );
}

/** Exported for local UI acceptance; the public route and server launch gates stay closed. */
export function TrackOrderPage() {
  const [orderId, setOrderId] = useState("");
  const [handoffCode, setHandoffCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OrderTrackingResult | null>(null);
  const [refreshIssue, setRefreshIssue] = useState<string | null>(null);
  const [autoPaused, setAutoPaused] = useState(false);
  const [availability, setAvailability] = useState({ visible: true, online: true });
  const activeRequest = useRef(0);
  const inFlight = useRef(false);
  const abortRequest = useRef<AbortController | null>(null);
  const lastGood = useRef<FoundOrder | null>(null);
  const lastRequestAt = useRef(0);
  const automaticChecks = useRef(0);
  const track = useServerFn(getOrderTracking);
  const eligible = UUID.test(orderId.trim()) && /^\d{4}$/.test(handoffCode.trim());
  const projection = useMemo(
    () => (result?.found ? presentMealDeckTracking(result) : null),
    [result],
  );

  function invalidate() {
    activeRequest.current += 1;
    abortRequest.current?.abort();
    abortRequest.current = null;
    inFlight.current = false;
    lastGood.current = null;
    automaticChecks.current = 0;
    setLoading(false);
    setResult(null);
    setRefreshIssue(null);
    setAutoPaused(false);
  }

  useEffect(() => {
    const syncAvailability = () => {
      const visible = document.visibilityState !== "hidden";
      const online = navigator.onLine;
      setAvailability({ visible, online });
      if ((!visible || !online) && inFlight.current) {
        activeRequest.current += 1;
        abortRequest.current?.abort();
        abortRequest.current = null;
        inFlight.current = false;
        setLoading(false);
      }
    };
    syncAvailability();
    document.addEventListener("visibilitychange", syncAvailability);
    window.addEventListener("online", syncAvailability);
    window.addEventListener("offline", syncAvailability);
    return () => {
      activeRequest.current += 1;
      abortRequest.current?.abort();
      abortRequest.current = null;
      inFlight.current = false;
      document.removeEventListener("visibilitychange", syncAvailability);
      window.removeEventListener("online", syncAvailability);
      window.removeEventListener("offline", syncAvailability);
    };
  }, []);

  const submit = useCallback(
    async (background = false) => {
      if (!eligible || inFlight.current) return;
      if (background && (document.visibilityState === "hidden" || !navigator.onLine)) return;
      if (!background) {
        automaticChecks.current = 0;
        setAutoPaused(false);
      }
      if (!navigator.onLine) {
        if (lastGood.current) {
          setRefreshIssue("You're offline. Showing your last confirmed status.");
        } else {
          setResult({
            found: false,
            reason: "unavailable",
            message: "You're offline. Reconnect to check your order.",
          });
        }
        return;
      }
      if (background) {
        if (automaticChecks.current >= MAX_AUTOMATIC_CHECKS) return;
        automaticChecks.current += 1;
        if (automaticChecks.current === MAX_AUTOMATIC_CHECKS) setAutoPaused(true);
      }
      const requestId = ++activeRequest.current;
      const controller = new AbortController();
      abortRequest.current = controller;
      inFlight.current = true;
      lastRequestAt.current = performance.now();
      setLoading(true);
      if (!lastGood.current) setResult(null);
      let timedOut = false;
      const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      try {
        const response = await track({
          data: { orderId: orderId.trim(), handoffCode: handoffCode.trim() },
          signal: controller.signal,
        });
        if (activeRequest.current !== requestId) return;
        if (response.found) {
          lastGood.current = response;
          setResult(response);
          setRefreshIssue(null);
        } else if (response.reason === "unavailable" && lastGood.current) {
          setRefreshIssue(
            "Updates are temporarily unavailable. Showing your last confirmed status.",
          );
        } else {
          // Failed authorisation, a missing order, a closed service or an unknown
          // response must clear the prior order, not preserve a misleading card.
          lastGood.current = null;
          setResult(response);
          setRefreshIssue(null);
        }
      } catch (reason) {
        if (activeRequest.current !== requestId) return;
        const unavailable = timedOut || !navigator.onLine || isTransportFailure(reason);
        if (unavailable && lastGood.current) {
          setRefreshIssue(
            "Updates are temporarily unavailable. Showing your last confirmed status.",
          );
        } else {
          lastGood.current = null;
          setResult({
            found: false,
            message: NETWORK_MESSAGE,
            reason: unavailable ? "unavailable" : undefined,
          });
          setRefreshIssue(null);
        }
      } finally {
        window.clearTimeout(timeout);
        if (activeRequest.current === requestId) {
          abortRequest.current = null;
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    [eligible, orderId, handoffCode, track],
  );

  useEffect(() => {
    if (
      !result?.found ||
      !projection ||
      projection.isFinalStatus ||
      loading ||
      !availability.visible ||
      !availability.online ||
      autoPaused
    )
      return;
    const remaining = Math.max(0, POLL_INTERVAL_MS - (performance.now() - lastRequestAt.current));
    const timer = window.setTimeout(() => {
      void submit(true);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [result, projection, loading, availability, autoPaused, submit]);

  return (
    <div className="md-tracking min-h-screen">
      <SiteHeader
        context={
          <Link
            to="/menus"
            className="font-display text-sm font-black uppercase tracking-wide text-accent"
          >
            Explore menus
          </Link>
        }
      />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <section className="rounded-3xl border border-border bg-card p-5 sm:p-8">
          <p className="text-xs font-black uppercase tracking-widest text-primary">
            MealDeck tracking
          </p>
          <h1 className="mt-2 font-display text-3xl font-black sm:text-4xl">
            Follow your full order
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            All your brands, together from the kitchen to your handoff. Enter your order reference
            and 4-digit code to see its progress.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="mt-7 grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end"
          >
            <div className="min-w-0 space-y-2">
              <Label htmlFor="order-id">Order reference</Label>
              <Input
                id="order-id"
                value={orderId}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => {
                  invalidate();
                  setOrderId(event.target.value.slice(0, 36));
                }}
                placeholder="Your order reference"
                aria-describedby="tracking-privacy"
                className="min-h-12 font-mono text-base md:text-base"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="handoff-code">4-digit code</Label>
              <Input
                id="handoff-code"
                value={handoffCode}
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                type="password"
                onChange={(event) => {
                  invalidate();
                  setHandoffCode(event.target.value.replace(/\D/g, "").slice(0, 4));
                }}
                placeholder="••••"
                className="min-h-12 font-mono text-base tracking-[.18em] md:text-base"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="md-tracking-submit min-h-12 rounded-xl font-display font-bold"
              disabled={loading || !eligible}
              aria-busy={loading}
            >
              {loading ? (
                <Loader2 aria-hidden="true" className="size-5 animate-spin" />
              ) : (
                <Search aria-hidden="true" className="size-5" />
              )}
              {loading ? "Checking…" : "Track order"}
            </Button>
          </form>
          <p id="tracking-privacy" className="mt-3 text-xs leading-5 text-muted-foreground">
            Keep your order reference and code private.
          </p>
        </section>

        {result?.found && projection ? (
          <section
            aria-label="Your latest MealDeck order status"
            aria-busy={loading}
            className="mt-6 overflow-hidden rounded-3xl border border-border bg-card"
          >
            {(refreshIssue || !availability.online) && (
              <p
                role="status"
                className="flex items-start gap-2 border-b border-border bg-secondary p-4 text-sm leading-6"
              >
                <WifiOff aria-hidden="true" className="mt-1 size-4 shrink-0" />
                {!availability.online
                  ? "You're offline. Showing your last confirmed status."
                  : refreshIssue}
              </p>
            )}
            <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10">
                  {projection.tone === "review" ? (
                    <AlertCircle aria-hidden="true" className="size-6 text-destructive" />
                  ) : projection.tone === "reported" ? (
                    <CheckCircle2 aria-hidden="true" className="size-6 text-primary" />
                  ) : (
                    <Clock3 aria-hidden="true" className="size-6 text-primary" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {projection.tone === "review"
                      ? "Status needs checking"
                      : projection.tone === "reported"
                        ? "Reported status"
                        : refreshIssue || !availability.online
                          ? "Last confirmed status"
                          : "Latest update"}
                  </p>
                  <h2 className="mt-1 font-display text-xl font-black sm:text-2xl">
                    {projection.headline}
                  </h2>
                  <p
                    role={projection.tone === "review" ? "alert" : "status"}
                    className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground"
                  >
                    {projection.description}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 shrink-0 gap-2 rounded-xl"
                onClick={() => void submit()}
                disabled={loading || !eligible}
              >
                {loading ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <RefreshCcw aria-hidden="true" className="size-4" />
                )}
                Refresh
              </Button>
            </div>
            <TrackingTimeline value={projection} />
            {projection.tone !== "review" &&
            ["paid", "accepted", "preparing"].includes(result.orderStatus) ? (
              <div className="border-t border-border p-5 sm:p-6">
                <p className="mb-3 text-sm text-muted-foreground">
                  Fancy a free food-card game while you wait?
                </p>
                <Link
                  to="/play"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <Gamepad2 aria-hidden="true" className="size-5" /> Play while you wait
                </Link>
                <p className="mt-2 text-xs text-muted-foreground">
                  Games are for fun only, with no prizes or wagering. Return here to track your
                  order.
                </p>
              </div>
            ) : null}
            {projection.canOpenCourierTracking && result.trackingUrl ? (
              <div className="border-t border-border p-5 sm:p-6">
                <a
                  href={result.trackingUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <Bike aria-hidden="true" className="size-4" />
                  View courier tracking
                </a>
                <p className="mt-2 text-xs text-muted-foreground">
                  Opens your delivery provider's tracking page.
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        {result && !result.found ? (
          <p
            role="status"
            className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6"
          >
            {result.message || DEFAULT_MISSING_MESSAGE}
          </p>
        ) : null}
        {result?.found && (
          <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
            {!availability.online
              ? "Automatic updates will resume when you reconnect."
              : projection?.isFinalStatus
                ? "Final status reported. Refresh whenever you need another check."
                : autoPaused
                  ? "Automatic updates are paused. Select Refresh to continue checking."
                  : loading
                    ? "Checking for the latest update…"
                    : "Status refreshes about every 20 seconds while this page is open."}
          </p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
