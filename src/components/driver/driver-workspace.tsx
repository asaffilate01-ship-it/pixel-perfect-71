import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Clock3, LogOut, MapPin, Navigation, Phone, RefreshCw, ShieldCheck, Truck, WifiOff } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import { PwaInstallCard } from "@/components/pwa-install-card";
import { driverClient, driverRpc, initialiseDriverClient } from "@/lib/mealdeck-driver-browser";
import { driverActions, driverDirectionsUrl, parseDriverPortal, type DriverJobCard, type DriverJobAction, type DriverPortal } from "@/lib/mealdeck-driver-app-view";
import { DriverGpsReadiness } from "./driver-gps-readiness";
import { DriverLiveLocation } from "./driver-live-location";
import "./driver-workspace.css";

const ACTION_REFRESH_MS = 12_000;
// Explicit opt-in beta: no GPS broadcast merely because a driver is assigned.
const DRIVER_LOCATION_BETA = import.meta.env?.VITE_MEALDECK_DRIVER_LOCATION_BETA === "true";
const stageNames: Record<DriverJobCard["status"], string> = {
  offered: "New delivery offer", assigned: "Head to the kitchen",
  at_kitchen: "Waiting for sealed bags", collected: "On the way",
  at_customer: "At customer", dropoff_reported: "Kitchen confirmation pending",
  declined: "Declined", delivered: "Delivered",
};
const kitchen = "314–318 Selbourne Road, Luton LU4 8NU";

export function DriverWorkspace() {
  const [db, setDb] = useState<SupabaseClient | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginMethod, setLoginMethod] = useState<"code" | "password">("code");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [busyAuth, setBusyAuth] = useState(false);
  const [portal, setPortal] = useState<DriverPortal | null>(null);
  const [reading, setReading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [issue, setIssue] = useState("");
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const request = useRef(0);

  useEffect(() => {
    let current = true;
    let unsubscribe: (() => void) | undefined;
    const syncOnline = () => setOnline(navigator.onLine);
    syncOnline();
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    void initialiseDriverClient()
      .then(async (client) => {
        if (!current) return;
        setDb(client);
        const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
          if (!current) return;
          setUserId(session?.user?.id ?? null);
          request.current++;
          setPortal(null);
          setLastSync(null);
        });
        unsubscribe = () => subscription.unsubscribe();
        const { data, error } = await client.auth.getUser();
        if (!current) return;
        setUserId(error ? null : (data.user?.id ?? null));
      })
      .catch((error) => { if (current) setAuthError(error instanceof Error ? error.message : "Driver login unavailable."); })
      .finally(() => { if (current) setLoadingAuth(false); });
    return () => {
      current = false;
      request.current++;
      unsubscribe?.();
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId || !online) return;
    const current = ++request.current;
    setReading(true);
    setIssue("");
    try {
      const result = parseDriverPortal(await driverRpc<unknown>("mealdeck_driver_portal"));
      if (current !== request.current) return;
      setPortal(result);
      setLastSync(Date.now());
    } catch (reason) {
      if (current !== request.current) return;
      setPortal(null);
      setLastSync(null);
      setIssue(reason instanceof Error ? reason.message : "Cannot verify driver jobs.");
    } finally {
      if (current === request.current) setReading(false);
    }
  }, [userId, online]);

  useEffect(() => {
    if (!userId || !online) {
      request.current++;
      setPortal(null);
      setLastSync(null);
      return;
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !actionBusy) void refresh();
    }, ACTION_REFRESH_MS);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [userId, online, refresh, actionBusy]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || busyAuth || !online) return;
    setBusyAuth(true);
    setAuthError("");
    setAuthMessage("");
    try {
      if (loginMethod === "code") {
        if (!codeSent) {
          const { error } = await db.auth.signInWithOtp({
            email: email.trim(),
            options: { shouldCreateUser: false },
          });
          if (error) throw new Error("We couldn't email a sign-in code. Check your address or ask the manager to create and approve the account.");
          setCodeSent(true);
          setAuthMessage("Check your MealDeck email for a one-time code. Only approved drivers can access delivery jobs.");
          return;
        }
        const { data, error } = await db.auth.verifyOtp({
          email: email.trim(),
          token: verificationCode.trim(),
          type: "email",
        });
        if (error || !data.user) throw new Error("That code could not be verified. Check the latest email or request a new one.");
        setUserId(data.user.id);
        setVerificationCode("");
        setCodeSent(false);
        return;
      }
      const { data, error } = await db.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.user) throw new Error("Email or password not accepted. Try an email code instead.");
      setUserId(data.user.id);
      setPassword("");
    } catch (reason) {
      setAuthError(reason instanceof Error ? reason.message : "Sign-in unsuccessful.");
    } finally { setBusyAuth(false); }
  }

  async function signOut() {
    if (!db) return;
    setActionBusy("signout");
    try { await db.auth.signOut(); }
    finally {
      request.current++;
      setUserId(null);
      setPortal(null);
      setActionBusy(null);
    }
  }

  async function perform(job: DriverJobCard, action: DriverJobAction) {
    if (!online || actionBusy || !portal?.onShift) return;
    const permit = driverActions(job, Date.now()).find((entry) => entry.action === action);
    if (!permit || permit.disabledReason) return;
    setActionBusy(job.jobId);
    setIssue(""); setMessage("");
    try {
      await driverRpc<unknown>("mealdeck_driver_action", {
        p_order: job.jobId, p_version: job.version, p_action: action,
        p_request_id: crypto.randomUUID(),
      });
      setMessage(action === "report_dropoff"
        ? "Handover reported. The kitchen must confirm the final delivered status."
        : "Saved. Checking the latest delivery status.");
      await refresh();
    } catch (reason) {
      setIssue(reason instanceof Error ? reason.message : "Action not confirmed. Refresh the job.");
    } finally { setActionBusy(null); }
  }

  async function changeShift() {
    if (!online || !portal || actionBusy) return;
    setActionBusy("shift");
    setIssue(""); setMessage("");
    try {
      await driverRpc<unknown>("mealdeck_driver_shift", { p_on_shift: !portal.onShift });
      setMessage(portal.onShift ? "Shift ended." : "You're on shift. Delivery offers will appear here.");
      await refresh();
    } catch (reason) {
      setIssue(reason instanceof Error ? reason.message : "Could not confirm shift status.");
    } finally { setActionBusy(null); }
  }

  return (
    <div className="md-driver-root">
      <header className="md-driver-header">
        <div className="md-driver-header-inner">
          <Link to="/" aria-label="MealDeck home"><MealDeckLogo decorative className="h-10 w-10" /></Link>
          <div><strong>MealDeck Driver</strong><span>Luton · Own deliveries</span></div>
          {userId && <button className="md-driver-header-action" onClick={() => void signOut()} disabled={!!actionBusy}><LogOut size={18} /> Sign out</button>}
        </div>
      </header>
      <main className="md-driver-main">
        <div className="md-driver-intro">
          <p className="md-driver-eyebrow">DRIVER WORKSPACE</p>
          <h1>{userId && portal ? `Hello, ${portal.displayName}` : "Deliver with MealDeck"}</h1>
          <p>One kitchen. Clear handovers. Every order verified before collection.</p>
        </div>
        {!online && <p className="md-driver-warning" role="alert"><WifiOff size={19} /> You are offline. Delivery details and status actions are unavailable until you reconnect.</p>}
        {loadingAuth && <div className="md-driver-panel" role="status">Checking your secure driver login…</div>}
        {!loadingAuth && !userId && (
          <section className="md-driver-panel md-driver-signin" aria-label="Driver sign in">
            <h2>Driver sign in</h2>
            <p>Only kitchen-approved drivers can view delivery jobs. Use your verified MealDeck email. A kitchen manager must separately approve driver access.</p>
            <div className="md-driver-login-method" role="group" aria-label="Driver sign-in method">
              <button type="button" className={loginMethod === "code" ? "md-driver-primary" : "md-driver-secondary"} aria-pressed={loginMethod === "code"} disabled={busyAuth} onClick={() => { setLoginMethod("code"); setCodeSent(false); setAuthError(""); setAuthMessage(""); }}>Email code</button>
              <button type="button" className={loginMethod === "password" ? "md-driver-primary" : "md-driver-secondary"} aria-pressed={loginMethod === "password"} disabled={busyAuth} onClick={() => { setLoginMethod("password"); setCodeSent(false); setAuthError(""); setAuthMessage(""); }}>Password</button>
            </div>
            <form onSubmit={(event) => void signIn(event)}>
              <label>Email address<input type="email" autoComplete="username" required value={email} onChange={(event) => { setEmail(event.target.value); setCodeSent(false); setVerificationCode(""); setAuthMessage(""); }} /></label>
              {loginMethod === "password" ? (
                <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              ) : codeSent ? (
                <label>Code from your MealDeck email<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" minLength={6} maxLength={8} required value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/[^0-9]/g, ""))} /></label>
              ) : null}
              <button className="md-driver-primary" type="submit" disabled={busyAuth || !online || !db}>{busyAuth ? "Checking…" : loginMethod === "password" ? "Sign in securely" : codeSent ? "Verify code and sign in" : "Email me a sign-in code"}</button>
            </form>
            {codeSent && loginMethod === "code" && <button type="button" className="md-driver-secondary" disabled={busyAuth || !online} onClick={() => { setCodeSent(false); setVerificationCode(""); setAuthMessage(""); }}>Request a new code</button>}
            {authMessage && <p className="md-driver-info" role="status">{authMessage}</p>}
            {authError && <p className="md-driver-error" role="alert">{authError}</p>}
            <p className="md-driver-info">New driver? <Link to="/account">Create and verify your MealDeck account</Link>, then ask a kitchen manager to approve your email in Operations → Driver dispatch. Signing in never grants delivery permissions by itself.</p>
          </section>
        )}
        {userId && (
          <>
            <div className="md-driver-dashboard">
              <section className="md-driver-panel md-driver-shift" aria-label="Shift availability">
                <div><span className="md-driver-small-label">Shift status</span><h2>{portal?.onShift ? "Available for deliveries" : "Off shift"}</h2>
                  <p>{portal?.onShift ? "You can receive assigned deliveries for MealDeck Luton." : "Start your shift when you are ready to accept a job."}</p></div>
                <button className={portal?.onShift ? "md-driver-secondary" : "md-driver-primary"} type="button" disabled={!portal || !!actionBusy || !online} onClick={() => void changeShift()}>
                  {actionBusy === "shift" ? "Saving…" : portal?.onShift ? "End shift" : "Start shift"}
                </button>
              </section>
              <section className="md-driver-panel md-driver-kitchen"><span className="md-driver-small-label">Collection location</span><h2>MealDeck Luton</h2><p>{kitchen}</p>
                <a href="https://www.google.com/maps/search/?api=1&query=314-318%20Selbourne%20Road%20Luton%20LU4%208NU" target="_blank" rel="noopener noreferrer"><Navigation size={17}/> Navigate to kitchen</a>
              </section>
            </div>
            {portal && <DriverGpsReadiness userId={userId} onShift={portal.onShift} online={online} />}
            <div className="md-driver-jobs-heading">
              <div><h2>Your assigned deliveries</h2><p>New offers expire quickly. Refresh when returning to the app.</p></div>
              <button type="button" className="md-driver-secondary" onClick={() => void refresh()} disabled={!online || !!actionBusy || reading}><RefreshCw size={17} /> {reading ? "Checking…" : "Refresh"}</button>
            </div>
            {lastSync !== null && <p className="md-driver-last-sync"><CheckCircle2 size={15}/> Last verified {new Date(lastSync).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</p>}
            {issue && <p className="md-driver-error" role="alert">{issue}</p>}
            {message && <p className="md-driver-success" role="status">{message}</p>}
            {!portal && !issue && <div className="md-driver-panel" role="status">Loading verified assignments…</div>}
            {portal && portal.jobs.length === 0 && (
              <div className="md-driver-panel md-driver-empty"><Truck size={32} aria-hidden="true"/><h3>No assigned deliveries</h3><p>New offers will appear here when the kitchen assigns an order to you.</p></div>
            )}
            {portal && <div className="md-driver-jobs">
              {portal.jobs.map((job) => {
                const actions = driverActions(job, Date.now());
                const directions = driverDirectionsUrl(job);
                const isCompleted = job.driverStatus === "delivered" || job.status === "delivered";
                const phone = job.customerPhone?.replace(/[^+\d]/g,"");
                return <article className="md-driver-panel md-driver-job" key={job.jobId}>
                  <div className="md-driver-job-top"><span className="md-driver-stage"><Clock3 size={15}/>{isCompleted ? "Delivered" : stageNames[job.status]}</span><span className="md-driver-reference">Job …{job.jobId.slice(-6).toUpperCase()}</span></div>
                  <div className="md-driver-destination"><MapPin size={19}/><div><h3>{job.address ? [job.address.doorNumber, job.address.roadName].join(" ") : "Delivery near " + job.postcode}</h3>
                  {job.address && <p>{job.address.addressLine2 ? job.address.addressLine2 + ", " : ""}{job.address.postcode}</p>}
                  {job.status === "offered" && <p>Full address becomes visible only after you accept.</p>}</div></div>
                  {job.customerName && <p className="md-driver-customer">Customer: {job.customerName}</p>}
                  <div className="md-driver-job-tools">
                    {directions && <a href={directions} target="_blank" rel="noopener noreferrer"><Navigation size={17}/> Directions</a>}
                    {job.customerPhone && phone && /^\+?\d{7,15}$/.test(phone) && <a href={"tel:"+phone}><Phone size={17}/> Call customer</a>}
                  </div>
                  {DRIVER_LOCATION_BETA && portal.onShift &&
                    job.driverStatus === "with_driver" &&
                    (job.status === "collected" || job.status === "at_customer") &&
                    <DriverLiveLocation orderId={job.jobId} userId={userId}
                      onShift={portal.onShift} online={online} />}
                  {job.status === "dropoff_reported" && <p className="md-driver-info"><ShieldCheck size={18}/> Your report is saved. Only kitchen staff can mark the paid order delivered.</p>}
                  {job.status === "at_kitchen" && job.driverStatus !== "with_driver" && <p className="md-driver-info">Wait for staff to confirm the sealed-bag handover in KDS.</p>}
                  {job.status === "offered" && <p className="md-driver-expiry">Offer expires {job.offeredUntil ? new Date(job.offeredUntil).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "soon"}.</p>}
                  <div className="md-driver-job-actions">
                    {actions.map((choice) => <button key={choice.action} type="button"
                      className={choice.action === "decline" ? "md-driver-secondary" : "md-driver-primary"}
                      disabled={!!actionBusy || !online || !portal.onShift || !!choice.disabledReason}
                      title={choice.disabledReason ?? ""} onClick={() => void perform(job,choice.action)}>
                      {actionBusy === job.jobId ? "Checking…" : choice.label}
                    </button>)}
                  </div>
                </article>;
              })}
            </div>}
          </>
        )}
        <div className="md-driver-install"><PwaInstallCard appName="MealDeck Driver" /></div>
        <footer className="md-driver-footer"><ShieldCheck size={17}/> Driver access is private. Customer addresses are visible only for accepted, assigned jobs.</footer>
      </main>
    </div>
  );
}
