import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Check,
  ClipboardList,
  LockKeyhole,
  LogOut,
  Printer,
  RefreshCw,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import { PwaInstallCard } from "@/components/pwa-install-card";
import {
  initializePrinterClient,
  printerRpc,
  printerBridge,
  PrinterBridgeError,
} from "@/lib/mealdeck-printer-browser";
import { confirmReceiptPaper } from "@/lib/mealdeck-printer-recovery";
import { orderDisplayNumber } from "@/lib/mealdeck-order-number";
import { preloadReceiptLogo, waitForReceiptLogo } from "@/lib/mealdeck-receipt-logo";
import { MealDeckBackendSetupError } from "@/lib/mealdeck-backend-client-cache";
import { PrinterSignInError, signInPrinterWithPassword } from "@/lib/mealdeck-printer-auth";
import {
  acceptPrinterPendingOrder,
  parsePrinterAcceptanceBoard,
  PrinterAcceptanceError,
  printerArrivalKeys,
  type PrinterPendingOrder,
} from "@/lib/mealdeck-printer-acceptance";
import { OpsRequestError } from "@/lib/mealdeck-ops-browser";
import {
  parsePrinterBoard,
  parsePrinterScopes,
  parseClaim,
  printerStatusLabel,
  type PrinterJob,
  type PrinterScope,
} from "@/lib/mealdeck-printer";
import { StaffAlertControls, StaffSoundUnlock, useStaffAlerts } from "./staff-alerts";
import { ReceiptPreview } from "./receipt-preview";
import { PrinterApkDownload } from "./printer-apk-download";
import { PrinterConnectionStatus, PrinterPendingOrderCard } from "./printer-pending-orders";
import { StaffMobileNav } from "./staff-mobile-navigation";
import "./ops-theme.css";
import "./printer.css";
const errorMessage = (reason: unknown, fallback: string) =>
  reason instanceof OpsRequestError ||
  reason instanceof PrinterSignInError ||
  reason instanceof PrinterAcceptanceError ||
  reason instanceof MealDeckBackendSetupError
    ? reason.message
    : fallback;
const accessError = (e: unknown) =>
  e instanceof OpsRequestError && (e.code === "forbidden" || e.code === "unauthenticated");

export function PrinterWorkspace() {
  const client = useRef<SupabaseClient | null>(null),
    live = useRef(false),
    accessRequest = useRef(0),
    activeUser = useRef<string | null>(null);
  const [authId, setAuthId] = useState("");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [signedIn, setSignedIn] = useState(false);
  const [scopes, setScopes] = useState<PrinterScope[]>([]),
    [scopeId, setScopeId] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [connectionReady, setConnectionReady] = useState(false),
    [connectionCycle, setConnectionCycle] = useState(0),
    [checkingAccess, setCheckingAccess] = useState(false);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const loadAccess = useCallback(async () => {
    const userId = activeUser.current;
    if (!userId) return;
    const request = ++accessRequest.current;
    setCheckingAccess(true);
    setError("");
    const isCurrent = () =>
      live.current && request === accessRequest.current && activeUser.current === userId;
    try {
      const result = parsePrinterScopes(await printerRpc("mealdeck_printer_my_access"));
      if (!isCurrent()) return;
      setScopes(result);
      setScopeId((previous) =>
        result.some((entry) => entry.locationId === previous)
          ? previous
          : (result[0]?.locationId ?? ""),
      );
    } catch (reason) {
      if (isCurrent()) {
        setScopes([]);
        setScopeId("");
        setError(
          errorMessage(reason, "Printer access could not be verified. Check it again below."),
        );
      }
    } finally {
      if (isCurrent()) setCheckingAccess(false);
    }
  }, []);
  useEffect(() => {
    live.current = true;
    let current = true;
    let unsubscribe: (() => void) | undefined;
    setLoading(true);
    setConnectionReady(false);
    setError("");
    void (async () => {
      try {
        const db = await initializePrinterClient(true);
        if (!current) return;
        client.current = db;
        setConnectionReady(true);
        const subscription = db.auth.onAuthStateChange((event, session) => {
          if (!current) return;
          const changed = activeUser.current !== null && session?.user.id !== activeUser.current;
          if (!session || event === "SIGNED_OUT" || changed) {
            accessRequest.current++;
            setSignedIn(false);
            setScopes([]);
            setScopeId("");
            setAuthId("");
            setCheckingAccess(false);
          }
          if (session) {
            activeUser.current = session.user.id;
            setAuthId(session.user.id);
            setSignedIn(true);
            if (event === "SIGNED_IN")
              setTimeout(() => {
                if (current && activeUser.current === session.user.id) void loadAccess();
              }, 0);
          } else activeUser.current = null;
        }).data.subscription;
        unsubscribe = () => subscription.unsubscribe();
        const { data, error: issue } = await db.auth.getUser();
        if (!current) return;
        if (data.user && !issue) {
          activeUser.current = data.user.id;
          setAuthId(data.user.id);
          setSignedIn(true);
          await loadAccess();
        } else {
          accessRequest.current++;
          activeUser.current = null;
          setAuthId("");
          setSignedIn(false);
          setScopes([]);
          setScopeId("");
          setCheckingAccess(false);
        }
      } catch (e) {
        if (current)
          setError(
            errorMessage(
              e,
              "The printer connection could not be loaded. Retry or ask your administrator to check setup.",
            ),
          );
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
      live.current = false;
      accessRequest.current++;
      unsubscribe?.();
      client.current = null;
    };
  }, [loadAccess, connectionCycle]);
  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!client.current || busy) return;
    setBusy(true);
    setError("");
    setLoginNotice("");
    try {
      const user = await signInPrinterWithPassword(client.current.auth, email, password);
      if (!live.current) return;
      activeUser.current = user.id;
      setAuthId(user.id);
      setSignedIn(true);
      await loadAccess();
    } catch (e) {
      setError(
        errorMessage(e, "Sign-in was not confirmed. Check your details and verified email."),
      );
    } finally {
      setPassword("");
      setBusy(false);
    }
  }
  async function emailLink() {
    if (!client.current || busy || !email.trim()) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await client.current.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: new URL("/printer", window.location.origin).href,
        },
      });
      if (error) throw new Error("email link");
      setLoginNotice(
        "If this account is registered, check your inbox for a secure sign-in link. Printer access is checked after sign-in.",
      );
    } catch {
      setError("A sign-in link could not be requested. Check the email address and try again.");
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    accessRequest.current++;
    activeUser.current = null;
    setAuthId("");
    setSignedIn(false);
    setScopes([]);
    setScopeId("");
    setCheckingAccess(false);
    setPassword("");
    setError("");
    setLoginNotice("");
    await client.current?.auth.signOut({ scope: "local" });
  }
  const scope = scopes.find((s) => s.locationId === scopeId);
  return (
    <div className="md-ops md-printer min-h-screen">
      <header className="md-ops-inverse md-printer-header px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MealDeckLogo className="md-printer-header-logo h-14 w-16 object-contain" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] opacity-75">
                MealDeck staff
              </p>
              <h1 className="text-2xl font-black">Receipt printer</h1>
            </div>
          </div>
          {signedIn && (
            <button
              className={`md-ops-button md-ops-secondary ${scope ? "md-printer-desktop-only" : ""}`}
              onClick={() => void signOut()}
              disabled={busy}
              type="button"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          )}
        </div>
      </header>
      <main
        className={`md-printer-main mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 ${signedIn && scope ? "md-staff-has-mobile-nav" : ""}`}
      >
        {(!signedIn || !scope) && <PrinterApkDownload />}
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-950">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status" className="md-ops-card p-8 text-center">
            Connecting to the receipt service…
          </p>
        ) : !connectionReady ? (
          <section className="md-ops-card mx-auto max-w-md space-y-4 p-6">
            <AlertTriangle className="size-8 md-ops-accent" />
            <h2 className="text-2xl font-black">Printer connection unavailable</h2>
            <p className="text-sm leading-6 md-ops-muted">
              The secure MealDeck connection must load before you can sign in. Check this device’s
              internet connection, then try again.
            </p>
            <button
              className="md-ops-button md-ops-primary w-full"
              type="button"
              onClick={() => setConnectionCycle((cycle) => cycle + 1)}
            >
              <RefreshCw className="size-4" />
              Retry printer connection
            </button>
          </section>
        ) : !signedIn ? (
          <section className="md-ops-card mx-auto max-w-md space-y-4 p-6">
            <LockKeyhole className="size-8 md-ops-accent" />
            <h2 className="text-2xl font-black">Printer sign-in</h2>
            <p className="text-sm leading-6 md-ops-muted">
              Use a verified account assigned to this kitchen’s printer. This terminal has its own
              session and installation.
            </p>
            <form onSubmit={(event) => void signIn(event)} className="space-y-4">
              <label className="block text-sm font-bold">
                Email
                <input
                  className="md-ops-field mt-2 w-full"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block text-sm font-bold">
                Password
                <input
                  className="md-ops-field mt-2 w-full"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="md-ops-button md-ops-primary w-full" disabled={busy} type="submit">
                {busy ? "Signing in…" : "Sign in with password"}
              </button>
              <button
                className="md-ops-button md-ops-secondary w-full"
                disabled={busy || !email.trim()}
                type="button"
                onClick={() => void emailLink()}
              >
                Email me a sign-in link
              </button>
              {loginNotice && (
                <p role="status" className="text-sm leading-6 md-ops-muted">
                  {loginNotice}
                </p>
              )}
            </form>
            <p className="text-xs leading-5 md-ops-muted">
              Use an existing staff account. The secure email link verifies your email; it does not
              create an account or grant printer access. An owner assigns printer access after
              verification.
            </p>
          </section>
        ) : !scope ? (
          <section className="md-ops-card p-6">
            <h2 className="text-xl font-black">
              {checkingAccess ? "Checking printer access…" : "Printer access needed"}
            </h2>
            <p className="mt-2 text-sm md-ops-muted">
              {checkingAccess
                ? "Verifying this account’s permission for the kitchen receipt queue."
                : "You are signed in. Check access again, or ask your owner to assign this verified account to a kitchen."}
            </p>
            <button
              type="button"
              className="md-ops-button md-ops-primary mt-4"
              disabled={checkingAccess || busy}
              onClick={() => void loadAccess()}
            >
              Check access again
            </button>
          </section>
        ) : (
          <>
            {scopes.length > 1 && (
              <label className="md-printer-desktop-only block text-sm font-bold">
                Kitchen
                <select
                  className="md-ops-field ml-3"
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                >
                  {scopes.map((s) => (
                    <option key={s.locationId} value={s.locationId}>
                      {s.locationName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <ReceiptTerminal
              key={`${authId}:${scope.tenantId}:${scope.locationId}`}
              scope={scope}
              accountControls={
                <div className="md-printer-mobile-only md-ops-card space-y-4 p-4">
                  <div>
                    <p className="text-sm font-bold">Signed in for {scope.locationName}</p>
                    <p className="mt-1 text-sm leading-6 md-ops-muted">
                      This account can accept paid orders and manage this kitchen’s receipt queue.
                    </p>
                  </div>
                  {scopes.length > 1 && (
                    <label className="block text-sm font-bold">
                      Kitchen
                      <select
                        className="md-ops-field mt-2"
                        value={scopeId}
                        onChange={(event) => setScopeId(event.target.value)}
                      >
                        {scopes.map((entry) => (
                          <option key={entry.locationId} value={entry.locationId}>
                            {entry.locationName}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    type="button"
                    className="md-ops-button md-ops-secondary w-full"
                    disabled={checkingAccess || busy}
                    onClick={() => void loadAccess()}
                  >
                    <RefreshCw className="size-4" aria-hidden="true" />
                    {checkingAccess ? "Checking access…" : "Check account access"}
                  </button>
                  <button
                    type="button"
                    className="md-ops-button md-ops-secondary w-full"
                    disabled={busy}
                    onClick={() => void signOut()}
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    Sign out of this terminal
                  </button>
                </div>
              }
            />
          </>
        )}
        {(!signedIn || !scope) && <PwaInstallCard appName="MealDeck Printer" />}
      </main>
    </div>
  );
}

type PrinterMobileView = "orders" | "queue" | "setup" | "account";

function ReceiptTerminal({
  scope,
  accountControls,
}: {
  scope: PrinterScope;
  accountControls: ReactNode;
}) {
  // Panels stay mounted: navigating never restarts polling, claims, or automatic printing.
  const [mobileView, setMobileView] = useState<PrinterMobileView>("orders");
  function showMobileView(view: PrinterMobileView) {
    setMobileView(view);
    window.requestAnimationFrame(() => {
      document.getElementById(`printer-${view}-heading`)?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }
  const [feedError, setFeedError] = useState("");
  const [pendingOrders, setPendingOrders] = useState<PrinterPendingOrder[]>([]),
    [acceptanceError, setAcceptanceError] = useState(""),
    [acceptanceSyncAt, setAcceptanceSyncAt] = useState<number | null>(null),
    [remainingOrderCount, setRemainingOrderCount] = useState(0),
    [acceptingOrder, setAcceptingOrder] = useState<string | null>(null);
  const [jobs, setJobs] = useState<PrinterJob[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [syncAt, setSyncAt] = useState<number | null>(null),
    [now, setNow] = useState(Date.now),
    [busy, setBusy] = useState(false);
  const [pairCode, setPairCode] = useState(""),
    [paired, setPaired] = useState(false),
    [automatic, setAutomatic] = useState(false);
  const [localHolds, setLocalHolds] = useState<{ jobId: string; copyNumber: number }[]>([]);
  const [preview, setPreview] = useState<string | null>(null),
    [printJob, setPrintJob] = useState<PrinterJob | null>(null);
  const mounted = useRef(false),
    generation = useRef(0),
    mutating = useRef(false),
    reading = useRef(false);
  const token = useRef<string | null>(null),
    terminal = useRef<string>(""),
    currentJobs = useRef<PrinterJob[]>([]),
    currentPendingOrders = useRef<PrinterPendingOrder[]>([]),
    receiptFreshAt = useRef<number | null>(null),
    acceptanceFreshAt = useRef<number | null>(null),
    refreshRequested = useRef(false),
    refreshRef = useRef<(() => Promise<void>) | null>(null);
  const alerts = useStaffAlerts("printer", `${scope.tenantId}:${scope.locationId}`);
  const params = { p_tenant: scope.tenantId, p_location: scope.locationId };
  const call = useCallback(
    (name: string, extra: Record<string, unknown> = {}) =>
      printerRpc(`mealdeck_printer_${name}`, {
        p_tenant: scope.tenantId,
        p_location: scope.locationId,
        ...extra,
      }),
    [scope.tenantId, scope.locationId],
  );
  const refresh = useCallback(async () => {
    if (mutating.current) return;
    if (reading.current) {
      refreshRequested.current = true;
      return;
    }
    const g = ++generation.current;
    reading.current = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("timeout")), 12000);
      });
      const identity = { tenantId: scope.tenantId, locationId: scope.locationId };
      const results = await Promise.allSettled([
        Promise.race([call("board"), deadline]).then((raw) => parsePrinterBoard(raw, identity)),
        Promise.race([call("acceptance_board"), deadline]).then((raw) =>
          parsePrinterAcceptanceBoard(raw, identity),
        ),
      ]);
      if (!mounted.current || g !== generation.current) return;
      const [receipts, acceptance] = results;
      const checkedAt = Date.now();
      if (receipts.status === "fulfilled") {
        setJobs(receipts.value.jobs);
        currentJobs.current = receipts.value.jobs;
        receiptFreshAt.current = checkedAt;
        setSyncAt(checkedAt);
        setFeedError("");
      } else {
        receiptFreshAt.current = null;
        setSyncAt(null);
        setFeedError(
          errorMessage(
            receipts.reason,
            "Receipt connection interrupted. Printing is paused until the queue is verified again.",
          ),
        );
      }
      if (acceptance.status === "fulfilled") {
        setPendingOrders(acceptance.value.orders);
        currentPendingOrders.current = acceptance.value.orders;
        setRemainingOrderCount(acceptance.value.remainingOrderCount);
        acceptanceFreshAt.current = checkedAt;
        setAcceptanceSyncAt(checkedAt);
        setAcceptanceError("");
      } else {
        acceptanceFreshAt.current = null;
        setAcceptanceSyncAt(null);
        setAcceptanceError(
          errorMessage(
            acceptance.reason,
            "Paid orders awaiting acceptance could not be checked. Refresh before accepting an order; the existing receipt queue remains separate.",
          ),
        );
      }
      setNow(checkedAt);
      if (results.some((result) => result.status === "rejected" && accessError(result.reason))) {
        receiptFreshAt.current = null;
        acceptanceFreshAt.current = null;
        setSyncAt(null);
        setAcceptanceSyncAt(null);
        setJobs([]);
        setPendingOrders([]);
        setRemainingOrderCount(0);
        setPrintJob(null);
        setPreview(null);
        setLocalHolds([]);
        setNotice("");
        currentJobs.current = [];
        currentPendingOrders.current = [];
        token.current = null;
        setPaired(false);
        setAutomatic(false);
      }
    } finally {
      clearTimeout(timeout);
      reading.current = false;
      if (refreshRequested.current && mounted.current && !mutating.current) {
        refreshRequested.current = false;
        void refreshRef.current?.();
      }
    }
  }, [call, scope.tenantId, scope.locationId]);
  refreshRef.current = refresh;
  useEffect(() => {
    mounted.current = true;
    terminal.current = crypto.randomUUID();
    void refresh();
    const poll = setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible") void refresh();
    }, 15000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const resume = () => void refresh();
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      mounted.current = false;
      generation.current++;
      token.current = null;
      currentJobs.current = [];
      currentPendingOrders.current = [];
      receiptFreshAt.current = null;
      acceptanceFreshAt.current = null;
      refreshRequested.current = false;
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);
  const fresh =
    syncAt !== null && now - syncAt < 45000 && typeof navigator !== "undefined" && navigator.onLine;
  const acceptanceFresh = fresh && acceptanceSyncAt !== null && now - acceptanceSyncAt < 45000;
  const observeArrivals = alerts.observe;
  useEffect(() => {
    observeArrivals(printerArrivalKeys(pendingOrders, jobs), fresh);
  }, [jobs, pendingOrders, fresh, observeArrivals]);
  async function accept(order: PrinterPendingOrder) {
    if (mutating.current || busy) return;
    try {
      const result = await acceptPrinterPendingOrder({
        order,
        scope,
        mutation: mutating,
        readCurrent: () => ({
          fresh:
            mounted.current &&
            navigator.onLine &&
            receiptFreshAt.current !== null &&
            Date.now() - receiptFreshAt.current < 45000 &&
            acceptanceFreshAt.current !== null &&
            Date.now() - acceptanceFreshAt.current < 45000,
          orders: currentPendingOrders.current,
        }),
        request: printerRpc,
        onStart: () => {
          generation.current++;
          receiptFreshAt.current = null;
          acceptanceFreshAt.current = null;
          setSyncAt(null);
          setAcceptanceSyncAt(null);
          setBusy(true);
          setAcceptingOrder(order.orderId);
          setError("");
          setNotice("");
        },
      });
      if (!mounted.current) return;
      currentPendingOrders.current = currentPendingOrders.current.filter(
        (entry) => entry.orderId !== order.orderId,
      );
      setPendingOrders(currentPendingOrders.current);
      setNotice(
        result.replayed
          ? `Order ${orderDisplayNumber(order.orderNumber, order.orderId.slice(0, 8).toUpperCase())} was already accepted. Its existing receipt is unchanged; no extra copy was requested.`
          : `Order ${orderDisplayNumber(order.orderNumber, order.orderId.slice(0, 8).toUpperCase())} accepted. One receipt is queued.${paired && automatic ? " Automatic printing will send it when the live queue refreshes; check the paper afterwards." : " On the H10S, check that MealDeck Printer shows auto-print running. A network printer uses this browser’s paired bridge."}`,
      );
    } catch (reason) {
      if (mounted.current)
        setError(
          errorMessage(
            reason,
            "Acceptance was not confirmed. Refresh the orders and receipt queue before trying again.",
          ),
        );
    } finally {
      if (mounted.current) {
        setBusy(false);
        setAcceptingOrder(null);
        await refresh();
      }
    }
  }
  async function pair() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await printerBridge("/v1/pair", null, { code: pairCode.trim() });
      if (typeof result["token"] !== "string" || result["token"].length < 20)
        throw new Error("pair");
      token.current = result["token"];
      setPairCode("");
      setPaired(true);
      setNotice("Printer bridge paired. Enable automatic printing when this terminal is ready.");
    } catch {
      setError(
        "The local printer bridge could not be paired. Check its installation, trusted certificate and current pairing code on this device.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function send(job: PrinterJob, mode: "bridge" | "dialog") {
    if (
      mutating.current ||
      !fresh ||
      job.status !== "queued" ||
      (mode === "bridge" && !token.current)
    )
      return;
    mutating.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    setNotice("");
    let claim: string | null = null;
    try {
      if (mode === "dialog") await preloadReceiptLogo();
      if (!mounted.current) throw new Error("printer screen unavailable");
      const claimed = parseClaim(
        await call("claim_job", { p_job: job.jobId, p_terminal: terminal.current }),
        job.jobId,
      );
      claim = claimed.claimToken;
      if (mode === "dialog") {
        flushSync(() => setPrintJob(claimed));
        const logo = document.querySelector<HTMLImageElement>(
          ".md-printer-print-only [data-receipt-logo]",
        );
        if (!logo) throw new Error("receipt logo unavailable");
        await waitForReceiptLogo(logo);
        if (!mounted.current) throw new Error("printer screen unavailable");
      }
      const begun = (await call("begin_send", { p_job: job.jobId, p_claim: claim })) as {
        ok?: boolean;
        replayed?: boolean;
      };
      if (begun.ok !== true || begun.replayed !== false || !mounted.current)
        throw new Error("send not newly authorised");
      if (mode === "bridge") {
        const db = await initializePrinterClient();
        const session = await db.auth.getSession();
        const jwt = session.data.session?.access_token;
        if (!jwt || !token.current || !mounted.current) throw new Error("session unavailable");
        const result = await printerBridge(
          "/v1/jobs",
          token.current,
          { jobId: job.jobId, claimToken: claim, receipt: claimed.receipt },
          jwt,
        );
        if (result["status"] !== "sent_unconfirmed")
          throw new Error("printer delivery unconfirmed");
      } else {
        window.print();
      }
      await call("send_result", {
        p_job: job.jobId,
        p_claim: claim,
        p_outcome: "sent_unconfirmed",
      });
      if (mounted.current)
        setNotice(
          `Order ${orderDisplayNumber(job.receipt.orderNumber, job.orderId.slice(0, 8).toUpperCase())}: check that one complete receipt printed, then confirm the paper below.`,
        );
    } catch (e) {
      if (claim)
        try {
          await call("send_result", { p_job: job.jobId, p_claim: claim, p_outcome: "held" });
        } catch {
          /* The lease expires into a hold. Never resend. */
        }
      if (mounted.current) {
        setError(
          errorMessage(
            e,
            "Printing was not confirmed. Inspect the printer; this receipt will not be sent again automatically.",
          ),
        );
        setAutomatic(false);
      }
    } finally {
      mutating.current = false;
      if (mounted.current) {
        setBusy(false);
        await refresh();
      }
    }
  }
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (!automatic || !paired || !fresh || busy || mutating.current) return;
    const next = jobs.find((j) => j.status === "queued");
    if (next) void sendRef.current(next, "bridge");
  }, [jobs, automatic, paired, fresh, busy]);
  async function inspectBridge(job: PrinterJob) {
    if (!token.current || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await printerBridge(`/v1/jobs/${job.jobId}`, token.current);
      const state = typeof result["status"] === "string" ? result["status"] : "unknown";
      setNotice(
        `Local printer record: ${state.replaceAll("_", " ")}. No receipt was resent. Inspect the paper before confirming below.`,
      );
    } catch {
      setError(
        "The local receipt record could not be read. Nothing was resent. Inspect the printer before resolving this receipt.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function syncLocal(job: PrinterJob) {
    if (!token.current || busy || !["printed", "failed"].includes(job.status)) return;
    setBusy(true);
    setError("");
    try {
      await printerBridge(`/v1/jobs/${job.jobId}/resolve`, token.current, {
        outcome: job.status === "printed" ? "printed" : "not_printed",
        reason: job.resolution ?? "Synchronised prior operator paper inspection.",
      });
      setNotice(
        "Local printer record resolved from the recorded paper inspection. Nothing was resent.",
      );
    } catch (e) {
      setError(
        e instanceof PrinterBridgeError && e.status === 404
          ? "This receipt has no record on the paired bridge. It may have used the browser print dialog."
          : "The local record could not be resolved. Reconnect the bridge and try this recovery action again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reviewLocalHolds() {
    if (!token.current || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await printerBridge("/v1/recovery", token.current);
      if (!Array.isArray(data["jobs"])) throw new Error("invalid recovery queue");
      const held = data["jobs"].filter(
        (j): j is { jobId: string; copyNumber: number } =>
          !!j &&
          typeof j === "object" &&
          typeof j.jobId === "string" &&
          /^[a-f0-9-]{36}$/.test(j.jobId) &&
          Number.isInteger(j.copyNumber),
      );
      setLocalHolds(held);
      if (held.length) setAutomatic(false);
      if (!held.length) setNotice("No interrupted receipts are held by this local printer.");
    } catch {
      setError("The local recovery queue could not be read. Nothing was resent.");
    } finally {
      setBusy(false);
    }
  }
  async function resolveLocalHold(jobId: string, outcome: "printed" | "not_printed") {
    if (!token.current || busy) return;
    setBusy(true);
    setError("");
    try {
      await printerBridge(`/v1/jobs/${jobId}/resolve`, token.current, {
        outcome,
        reason: "Operator inspected printer and paper during local recovery.",
      });
      setLocalHolds((previous) => previous.filter((j) => j.jobId !== jobId));
      setNotice(
        "Local interrupted receipt resolved. No receipt was resent. Confirm any outstanding server paper check below.",
      );
    } catch {
      setError(
        "Local recovery was not confirmed. Inspect the printer and retry only this resolution action.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm(job: PrinterJob, outcome: "printed" | "not_printed", reason: string) {
    if (mutating.current || !fresh) return;
    mutating.current = true;
    setBusy(true);
    setError("");
    try {
      await confirmReceiptPaper({
        ...(token.current
          ? {
              resolveLocal: async () => {
                try {
                  await printerBridge(`/v1/jobs/${job.jobId}/resolve`, token.current, {
                    outcome,
                    reason,
                  });
                  return "resolved" as const;
                } catch (e) {
                  if (e instanceof PrinterBridgeError && e.status === 404)
                    return "missing" as const;
                  throw e;
                }
              },
            }
          : {}),
        confirmServer: () =>
          call("confirm_paper", { p_job: job.jobId, p_outcome: outcome, p_reason: reason }),
      });
      setPrintJob(null);
      setNotice(
        outcome === "printed"
          ? "Paper receipt confirmed. No further copy will print."
          : "Recorded as not printed. A replacement requires the separate COPY action.",
      );
    } catch (e) {
      setError(
        errorMessage(
          e,
          "Paper confirmation was not saved. Check the local bridge connection and try the inspection action again; nothing was resent.",
        ),
      );
    } finally {
      mutating.current = false;
      setBusy(false);
      await refresh();
    }
  }
  async function reprint(job: PrinterJob, reason: string) {
    if (mutating.current || !fresh) return;
    mutating.current = true;
    setBusy(true);
    setError("");
    try {
      await call("reprint", { p_job: job.jobId, p_reason: reason, p_request: crypto.randomUUID() });
      setNotice("One replacement receipt is queued and clearly marked COPY.");
    } catch (e) {
      setError(
        errorMessage(e, "A copy was not confirmed. Refresh the queue before requesting another."),
      );
    } finally {
      mutating.current = false;
      setBusy(false);
      await refresh();
    }
  }
  const queueActionCount = new Set([
    ...jobs
      .filter((job) => job.status !== "printed" && job.status !== "failed")
      .map((job) => job.jobId),
    ...localHolds.map((hold) => hold.jobId),
  ]).size;
  const paperCheckCount = new Set([
    ...jobs
      .filter((job) => ["sending", "sent_unconfirmed", "held"].includes(job.status))
      .map((job) => job.jobId),
    ...localHolds.map((hold) => hold.jobId),
  ]).size;
  return (
    <section className="space-y-4" aria-label="Receipt terminal">
      <div className="md-printer-overview flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] md-ops-muted">
            {scope.locationName}
          </p>
          <h2 className="md-printer-desktop-only mt-1 text-2xl font-black">
            One order. One receipt.
          </h2>
          <p className="md-printer-desktop-only mt-2 text-sm md-ops-muted">
            Accept paid orders here or on the KDS. Both use the same receipt queue.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="md-ops-button md-ops-secondary"
        >
          <RefreshCw className="size-4" />
          Refresh
        </button>
      </div>
      <div className="md-printer-mobile-only md-printer-live-strip">
        <p>
          <span
            className={`md-printer-live-dot ${fresh ? "is-ready" : "is-waiting"}`}
            aria-hidden="true"
          />
          {fresh ? "Queue live" : "Queue paused"}
          <span className="md-ops-muted">
            {automatic
              ? fresh && paired
                ? " · Auto print on"
                : " · Auto paused"
              : " · Auto print off"}
          </span>
        </p>
        <button
          type="button"
          className="md-printer-status-action"
          onClick={() => showMobileView("setup")}
          aria-controls="printer-setup"
        >
          <Settings2 className="size-4" aria-hidden="true" />
          {paired ? "Setup" : "Connect printer"}
        </button>
      </div>
      <StaffSoundUnlock alerts={alerts} />
      {paperCheckCount > 0 && mobileView !== "queue" && (
        <button
          type="button"
          className="md-printer-mobile-only md-printer-paper-reminder"
          onClick={() => showMobileView("queue")}
          aria-controls="printer-queue"
        >
          <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
          <span>
            {paperCheckCount} {paperCheckCount === 1 ? "receipt needs" : "receipts need"} a paper
            check
          </span>
          <span className="ml-auto font-black">View</span>
        </button>
      )}
      <section
        id="printer-setup"
        className="md-printer-view space-y-4"
        data-mobile-active={mobileView === "setup"}
        aria-label="Printer setup"
      >
        <div className="md-printer-mobile-only">
          <h2 id="printer-setup-heading" tabIndex={-1} className="md-printer-view-heading">
            Printer setup
          </h2>
          <p className="mt-1 text-sm md-ops-muted">Connection, sound and receipt delivery.</p>
        </div>
        <PrinterApkDownload headingLevel="h3" />
        <PrinterConnectionStatus
          fresh={fresh}
          paired={paired}
          automatic={automatic}
          busy={busy}
          onAutomaticChange={setAutomatic}
        />
        <StaffAlertControls
          alerts={alerts}
          kind="printer"
          noticeLabels={{ singular: "order or receipt", plural: "orders or receipts" }}
        />
        <details className="md-ops-card md-printer-setup-details p-4" open={!paired}>
          <summary className="cursor-pointer text-sm font-bold">
            {paired ? "Local printer bridge paired" : "Network printer via local bridge"}
          </summary>
          <div className="mt-4 space-y-3">
            <p className="text-sm leading-6 md-ops-muted">
              The MealDeck local bridge connects a supported network receipt printer to a Linux or
              macOS computer. Pair it from this app on that same computer. It sends one receipt and
              stops; paper cutting depends on the configured printer.
            </p>
            {!paired && (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void pair();
                }}
              >
                <label className="min-w-0 flex-1 text-sm font-bold">
                  Local bridge pairing code
                  <input
                    className="md-ops-field mt-2 w-full"
                    autoComplete="off"
                    value={pairCode}
                    onChange={(e) => setPairCode(e.target.value)}
                    placeholder="Code from the local bridge"
                    required
                  />
                </label>
                <button
                  className="md-ops-button md-ops-primary"
                  type="submit"
                  disabled={busy || !pairCode.trim()}
                >
                  Pair local bridge
                </button>
              </form>
            )}
            {paired && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reviewLocalHolds()}
                  className="md-ops-button md-ops-secondary"
                >
                  Review interrupted local receipts
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    token.current = null;
                    setPaired(false);
                    setAutomatic(false);
                    setLocalHolds([]);
                  }}
                  className="md-ops-button md-ops-secondary"
                >
                  Disconnect bridge
                </button>
              </div>
            )}
            <p className="text-xs leading-5 md-ops-muted">
              Keep this staff app open and the device awake. If a send is interrupted, the receipt
              is held for inspection. On supported browsers, use Browser print dialog in Queue,
              select one copy and check the actual paper.
            </p>
          </div>
        </details>
      </section>
      {!fresh && (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <AlertTriangle className="mr-2 inline size-4" />
          Acceptance and printing are paused until the live queue is verified.
        </p>
      )}
      {feedError && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
        >
          {feedError}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
        >
          {notice}
        </p>
      )}
      <section
        id="printer-orders"
        className="md-printer-view space-y-3"
        data-mobile-active={mobileView === "orders"}
        aria-label="Paid orders awaiting acceptance"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="printer-orders-heading"
              tabIndex={-1}
              className="md-printer-view-heading text-xl font-black"
            >
              Paid orders to accept
            </h2>
            <p className="mt-1 text-sm md-ops-muted">
              Review the order, then accept it. Orders are never accepted automatically.
            </p>
          </div>
          {acceptanceFresh && (
            <p className="text-sm font-bold">
              {pendingOrders.length} waiting
              {remainingOrderCount > 0 ? ` · ${remainingOrderCount} more after these` : ""}
            </p>
          )}
        </div>
        {acceptanceError ? (
          <p
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
          >
            {acceptanceError}
          </p>
        ) : acceptanceSyncAt === null ? (
          <p role="status" className="md-ops-card p-4 text-sm md-ops-muted">
            Checking paid orders awaiting acceptance…
          </p>
        ) : null}
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {pendingOrders.map((order) => (
            <PrinterPendingOrderCard
              key={order.orderId}
              order={order}
              fresh={acceptanceFresh}
              paired={paired}
              automatic={automatic}
              busy={busy}
              accepting={acceptingOrder === order.orderId}
              onAccept={() => void accept(order)}
            />
          ))}
        </div>
        {acceptanceFresh && !pendingOrders.length && (
          <p className="md-ops-card p-5 text-sm md-ops-muted">
            No paid orders are awaiting acceptance. New paid orders will appear here.
          </p>
        )}
      </section>
      <section
        id="printer-queue"
        className="md-printer-view space-y-3"
        data-mobile-active={mobileView === "queue"}
        aria-label="Receipt queue"
      >
        <div>
          <h2
            id="printer-queue-heading"
            tabIndex={-1}
            className="md-printer-view-heading text-xl font-black"
          >
            Receipt queue
          </h2>
          <p className="md-printer-mobile-only mt-1 text-sm md-ops-muted">
            Accepted orders, paper checks and interrupted receipts.
          </p>
        </div>
        {localHolds.length > 0 && (
          <section
            className="md-ops-card space-y-3 border-amber-300 p-4"
            aria-label="Interrupted local receipt recovery"
          >
            <h3 className="text-lg font-black">Inspect interrupted receipts</h3>
            <p className="text-sm md-ops-muted">
              These local holds can block the printer even if an older server receipt has left the
              queue. Check the actual paper before resolving each record. These actions do not
              print.
            </p>
            {localHolds.map((hold) => (
              <LocalReceiptRecovery
                key={hold.jobId}
                job={hold}
                disabled={busy}
                onResolve={(outcome) => void resolveLocalHold(hold.jobId, outcome)}
              />
            ))}
          </section>
        )}
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {jobs.map((job) => (
            <ReceiptJobCard
              key={job.jobId}
              job={job}
              disabled={busy || !fresh}
              paired={paired}
              showing={preview === job.jobId}
              onPreview={() => setPreview(preview === job.jobId ? null : job.jobId)}
              onPrint={(mode) => void send(job, mode)}
              onInspect={() => void inspectBridge(job)}
              onSyncLocal={() => void syncLocal(job)}
              onConfirm={(outcome, reason) => void confirm(job, outcome, reason)}
              onReprint={(reason) => void reprint(job, reason)}
            />
          ))}
        </div>
        {fresh && !jobs.length && !localHolds.length && (
          <div className="md-ops-card p-8 text-center">
            <Printer className="mx-auto size-8 md-ops-muted" />
            <h3 className="mt-3 text-xl font-black">Receipt queue clear</h3>
            <p className="mt-2 text-sm md-ops-muted">
              The next accepted, paid order will appear here.
            </p>
          </div>
        )}
      </section>
      <section
        id="printer-account"
        className={`md-printer-view space-y-4 ${scope.canManage ? "" : "md-printer-mobile-only"}`}
        data-mobile-active={mobileView === "account"}
        aria-label="Printer account"
      >
        <div className="md-printer-mobile-only">
          <h2 id="printer-account-heading" tabIndex={-1} className="md-printer-view-heading">
            Account
          </h2>
          <p className="mt-1 text-sm md-ops-muted">Your kitchen access on this terminal.</p>
        </div>
        {accountControls}
        {scope.canManage && <PrinterAccessManager scope={scope} />}
      </section>
      <div className="md-printer-view" data-mobile-active={mobileView === "setup"}>
        <PwaInstallCard appName="MealDeck Printer" />
      </div>
      <StaffMobileNav
        label="Printer navigation"
        items={[
          {
            id: "orders",
            label: "Orders",
            icon: ClipboardList,
            active: mobileView === "orders",
            badge: acceptanceFresh ? pendingOrders.length + remainingOrderCount : 0,
            controls: "printer-orders",
            onClick: () => showMobileView("orders"),
          },
          {
            id: "queue",
            label: "Queue",
            icon: Printer,
            active: mobileView === "queue",
            badge: fresh ? queueActionCount : 0,
            controls: "printer-queue",
            onClick: () => showMobileView("queue"),
          },
          {
            id: "setup",
            label: "Setup",
            icon: Settings2,
            active: mobileView === "setup",
            controls: "printer-setup",
            onClick: () => showMobileView("setup"),
          },
          {
            id: "account",
            label: "Account",
            icon: UserRound,
            active: mobileView === "account",
            controls: "printer-account",
            onClick: () => showMobileView("account"),
          },
        ]}
      />
      {printJob &&
        createPortal(
          <div className="md-printer-print-only">
            <ReceiptPreview receipt={printJob.receipt} />
          </div>,
          document.body,
        )}
    </section>
  );
}

function ReceiptJobCard({
  job,
  disabled,
  paired,
  showing,
  onPreview,
  onPrint,
  onInspect,
  onSyncLocal,
  onConfirm,
  onReprint,
}: {
  job: PrinterJob;
  disabled: boolean;
  paired: boolean;
  showing: boolean;
  onPreview: () => void;
  onPrint: (mode: "bridge" | "dialog") => void;
  onInspect: () => void;
  onSyncLocal: () => void;
  onConfirm: (outcome: "printed" | "not_printed", reason: string) => void;
  onReprint: (reason: string) => void;
}) {
  const [inspection, setInspection] = useState(false),
    [reason, setReason] = useState(""),
    [copyOpen, setCopyOpen] = useState(false);
  const needsCheck = ["sending", "sent_unconfirmed", "held"].includes(job.status);
  return (
    <article className="md-ops-card overflow-hidden" data-testid="printer-job">
      <header className="md-ops-ticket-heading flex flex-wrap items-center justify-between gap-3 border-b md-ops-border p-4">
        <div>
          <h3 className="break-words text-2xl font-black tabular-nums">
            Order{" "}
            {orderDisplayNumber(job.receipt.orderNumber, job.orderId.slice(0, 8).toUpperCase())}
          </h3>
          <p className="mt-1 text-sm md-ops-muted">
            Collection code <strong className="tabular-nums">{job.receipt.displayCode}</strong>
          </p>
          <p className="mt-1 text-xs font-bold md-ops-muted">
            {job.receipt.fulfilment === "curbside" ? "Kerbside" : "Collection"} ·{" "}
            {job.copyNumber === 1 ? "Original" : `COPY ${job.copyNumber}`}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-2 text-xs font-bold ${job.status === "printed" ? "bg-emerald-100 text-emerald-950" : needsCheck ? "bg-amber-100 text-amber-950" : "md-ops-soft"}`}
        >
          {printerStatusLabel[job.status]}
        </span>
      </header>
      <div className="space-y-3 p-4">
        <p className="text-sm md-ops-muted">
          Accepted{" "}
          {new Date(job.receipt.acceptedAt).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · {job.receipt.items.reduce((n, i) => n + i.quantity, 0)} items ·{" "}
          {job.receipt.packingPlan.bags.length} bag
          {job.receipt.packingPlan.bags.length === 1 ? "" : "s"}
        </p>
        {job.resolution && <p className="text-sm md-ops-text">{job.resolution}</p>}
        <button type="button" onClick={onPreview} className="min-h-11 text-sm font-bold underline">
          {showing ? "Hide itemised receipt" : "View items, extras and bag numbers"}
        </button>
        {showing && <ReceiptPreview receipt={job.receipt} />}
        {job.status === "queued" && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || !paired}
              onClick={() => onPrint("bridge")}
              className="md-ops-button md-ops-primary"
            >
              <Printer className="size-4" />
              Print one receipt
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPrint("dialog")}
              className="md-ops-button md-ops-secondary"
            >
              Browser print dialog
            </button>
          </div>
        )}
        {needsCheck && (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-bold text-amber-950">
              Check the printer before taking another action.
            </p>
            {paired && (
              <button
                type="button"
                disabled={disabled}
                onClick={onInspect}
                className="md-ops-button md-ops-secondary"
              >
                Check local printer status
              </button>
            )}
            <label className="flex min-h-11 items-center gap-2 text-sm text-amber-950">
              <input
                type="checkbox"
                className="size-5"
                checked={inspection}
                onChange={(e) => setInspection(e.target.checked)}
              />
              I have inspected the paper and printer.
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={disabled || !inspection}
                onClick={() =>
                  onConfirm("printed", "Operator inspected one complete paper receipt.")
                }
                className="md-ops-button md-ops-primary"
              >
                <Check className="size-4" />
                One receipt printed
              </button>
              <button
                type="button"
                disabled={disabled || !inspection}
                onClick={() =>
                  onConfirm(
                    "not_printed",
                    "Operator inspected printer and confirmed no usable receipt.",
                  )
                }
                className="md-ops-button md-ops-secondary"
              >
                Not printed / unusable
              </button>
            </div>
          </div>
        )}
        {(job.status === "printed" || job.status === "failed") && (
          <div>
            {paired && (
              <button
                type="button"
                disabled={disabled}
                onClick={onSyncLocal}
                className="md-ops-button md-ops-secondary mb-2"
              >
                Sync local printer record
              </button>
            )}
            <button
              type="button"
              className="min-h-11 text-sm font-bold underline"
              onClick={() => setCopyOpen(!copyOpen)}
            >
              Request a marked COPY
            </button>
            {copyOpen && (
              <form
                className="mt-2 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (reason.trim().length >= 5) onReprint(reason.trim());
                }}
              >
                <label className="block text-sm font-bold">
                  Why is another copy needed?
                  <input
                    className="md-ops-field mt-2 w-full"
                    value={reason}
                    minLength={5}
                    maxLength={300}
                    required
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="For example, paper jam inspected"
                  />
                </label>
                <p className="text-xs md-ops-muted">
                  This deliberately queues one additional receipt marked COPY and records your
                  account and reason.
                </p>
                <button
                  type="submit"
                  disabled={disabled || reason.trim().length < 5}
                  className="md-ops-button md-ops-secondary"
                >
                  Queue one COPY
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
function LocalReceiptRecovery({
  job,
  disabled,
  onResolve,
}: {
  job: { jobId: string; copyNumber: number };
  disabled: boolean;
  onResolve: (outcome: "printed" | "not_printed") => void;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="space-y-2 rounded-xl border md-ops-border p-3">
      <p className="break-all text-xs md-ops-muted">
        Local receipt {job.jobId} · copy {job.copyNumber}
      </p>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        I inspected the printer and paper for this interrupted receipt.
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || !checked}
          onClick={() => onResolve("printed")}
          className="md-ops-button md-ops-secondary"
        >
          Paper printed
        </button>
        <button
          type="button"
          disabled={disabled || !checked}
          onClick={() => onResolve("not_printed")}
          className="md-ops-button md-ops-secondary"
        >
          No usable paper
        </button>
      </div>
    </div>
  );
}

function PrinterAccessManager({ scope }: { scope: PrinterScope }) {
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [access, setAccess] = useState<{ userId: string; email: string; enabled: boolean }[]>([]);
  const args = { p_tenant: scope.tenantId, p_location: scope.locationId };
  const load = useCallback(async () => {
    const result = await printerRpc("mealdeck_printer_access_list", {
      p_tenant: scope.tenantId,
      p_location: scope.locationId,
    });
    if (!Array.isArray(result)) return;
    setAccess(
      result.filter(
        (x): x is { userId: string; email: string; enabled: boolean } =>
          !!x &&
          typeof x === "object" &&
          typeof x.userId === "string" &&
          typeof x.email === "string" &&
          typeof x.enabled === "boolean",
      ),
    );
  }, [scope.tenantId, scope.locationId]);
  useEffect(() => {
    void load().catch(() => {});
  }, [load]);
  async function assign(address: string, enabled: boolean) {
    setBusy(true);
    setMessage("");
    try {
      await printerRpc("mealdeck_printer_assign_access", {
        ...args,
        p_email: address,
        p_enabled: enabled,
      });
      setEmail("");
      setMessage(
        enabled ? "Printer-only access assigned to this kitchen." : "Printer access removed.",
      );
      await load();
    } catch (e) {
      setMessage(errorMessage(e, "Printer access was not saved."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="md-ops-card p-4">
      <summary className="cursor-pointer text-sm font-bold">
        <ShieldCheck className="mr-2 inline size-4" />
        Owner setup · printer accounts
      </summary>
      <div className="mt-4 space-y-4">
        <p className="text-sm leading-6 md-ops-muted">
          Assign an existing, email-verified account to {scope.locationName}. Printer access permits
          accepting paid orders and managing their receipts. It does not grant preparation, packing,
          handover, menu or financial administration.
        </p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void assign(email.trim(), true);
          }}
        >
          <label className="min-w-0 flex-1 text-sm font-bold">
            Verified account email
            <input
              type="email"
              required
              className="md-ops-field mt-2 w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy} className="md-ops-button md-ops-primary">
            Assign printer access
          </button>
        </form>
        {message && (
          <p role="status" className="text-sm md-ops-text">
            {message}
          </p>
        )}
        <ul className="space-y-2">
          {access.map((a) => (
            <li
              key={a.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border md-ops-border p-3"
            >
              <span className="min-w-0 break-all text-sm">
                {a.email} · {a.enabled ? "Enabled" : "Disabled"}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void assign(a.email, !a.enabled)}
                className="md-ops-button md-ops-secondary"
              >
                {a.enabled ? "Remove access" : "Restore access"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
