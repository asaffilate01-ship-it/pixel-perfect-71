import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  LockKeyhole,
  LogOut,
  RefreshCcw,
  ShieldCheck,
  Store,
  UserRoundCog,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  getMealDeckOpsClient,
  initializeMealDeckOpsClient,
  resetMealDeckOpsClient,
  opsRpc,
  opsRows,
  type OpsAccess,
} from "@/lib/mealdeck-ops-browser";
import { MEALDECK_BUSINESS } from "@/lib/business-identity";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import "./ops-theme.css";
import {
  effectiveOpsPermissions,
  OPS_SECTIONS,
  type OpsPermission,
  type OpsSection,
} from "@/lib/mealdeck-ops-access";
import type {
  OpsAnalytics,
  OpsBrandSales,
  OpsAudit,
  OpsCost,
  OpsExpense,
  OpsFinance,
  OpsIngredient,
  OpsLocation,
  OpsMenuItem,
  OpsOrder,
  OpsRecipe,
  OpsRecipeCost,
  OpsStaff,
  OpsStock,
  OpsTaxonomy,
} from "@/lib/mealdeck-ops-types";
import {
  OpsAnalyticsPanel,
  OpsCostsPanel,
  OpsFinancePanel,
  OpsIngredientPanel,
  OpsMenuPanel,
  OpsOrdersPanel,
  OpsRecipePanel,
  OpsTeamPanel,
} from "@/components/ops/ops-panels";
import { OpsSupplierInvoicesPanel } from "@/components/ops/supplier-invoices-panel";
import type {
  OpsSupplierInvoice,
  OpsSupplierCredit,
  OpsSupplierInvoiceSummary,
} from "@/lib/mealdeck-ops-invoice-types";
import { OpsProcurementPanel } from "@/components/ops/procurement-panel";
import { OpsStockBatchesPanel } from "@/components/ops/stock-batches-panel";
import {
  PaidOrdersGoalPanel,
  type PaidGoalLocation,
} from "@/components/ops/paid-orders-goal-panel";
import { paidOrderGoalRange, summariseWeeklyPaidOrders } from "@/lib/mealdeck-weekly-paid-goal";
import type { OpsSupplier, OpsPurchase, OpsBatch } from "@/lib/mealdeck-ops-procurement-types";

import { OpsKdsPanel } from "@/components/ops/kds-panel";
const field = "md-ops-field";
const btn = "md-ops-button md-ops-primary";
const columns = "md-ops-card p-5";
type WorkspaceData = {
  menu: OpsMenuItem[];
  taxonomy: OpsTaxonomy[];
  orders: OpsOrder[];
  recipes: OpsRecipe[];
  ingredients: OpsIngredient[];
  stock: OpsStock[];
  costs: OpsCost[];
  recipeCosts: OpsRecipeCost[];
  expenses: OpsExpense[];
  finance: OpsFinance | null;
  analytics: OpsAnalytics | null;
  brandSales: OpsBrandSales[];
  staff: OpsStaff[];
  audit: OpsAudit[];
  paidGoalLocations: PaidGoalLocation[];
  suppliers: OpsSupplier[];
  purchases: OpsPurchase[];
  batches: OpsBatch[];
  invoices: OpsSupplierInvoice[];
  credits: OpsSupplierCredit[];
  invoiceSummary: OpsSupplierInvoiceSummary | null;
};
const blank = (): WorkspaceData => ({
  menu: [],
  taxonomy: [],
  orders: [],
  recipes: [],
  ingredients: [],
  stock: [],
  costs: [],
  recipeCosts: [],
  expenses: [],
  finance: null,
  analytics: null,
  brandSales: [],
  staff: [],
  audit: [],
  paidGoalLocations: [],
  suppliers: [],
  purchases: [],
  batches: [],
  invoices: [],
  credits: [],
  invoiceSummary: null,
});
function dateISO(date: Date) {
  return date.toISOString().slice(0, 10);
}
function lastMonth() {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return dateISO(date);
}

export function MealDeckOperations({ kitchenMode = false }: { kitchenMode?: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authCycle, setAuthCycle] = useState(0);
  const [authError, setAuthError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accesses, setAccesses] = useState<OpsAccess[]>([]);
  const [accessBusy, setAccessBusy] = useState(false);
  const [tenant, setTenant] = useState("");
  const [locations, setLocations] = useState<OpsLocation[]>([]);
  const [location, setLocation] = useState("");
  const [section, setSection] = useState<OpsSection>(kitchenMode ? "kitchen" : "overview");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(lastMonth());
  const [toDate, setToDate] = useState(dateISO(new Date()));
  const [data, setData] = useState<WorkspaceData>(blank);
  const reqRef = useRef(0);
  const accessRequest = useRef(0);
  const authRequest = useRef(0);
  const activeUserId = useRef<string | null>(null);
  const signingOut = useRef(false);

  const clearStaffState = useCallback(() => {
    reqRef.current++;
    accessRequest.current++;
    authRequest.current++;
    activeUserId.current = null;
    setUser(null);
    setAccesses([]);
    setTenant("");
    setLocation("");
    setLocations([]);
    setData(blank());
    setNotice("");
    setError("");
    setPassword("");
    setAccessBusy(false);
    setLoading(false);
  }, []);

  const fetchAccess = useCallback(async () => {
    const request = ++accessRequest.current;
    setAccessBusy(true);
    try {
      const rows = opsRows<OpsAccess>(await opsRpc<unknown>("mealdeck_ops_my_access"));
      if (request !== accessRequest.current) return;
      setAccesses(rows);
      setTenant((previous) =>
        rows.some((x) => x.tenant_id === previous) ? previous : (rows[0]?.tenant_id ?? ""),
      );
    } catch (reason) {
      if (request !== accessRequest.current) return;
      setAccesses([]);
      setAuthError(
        reason instanceof Error ? reason.message : "Staff access could not be verified.",
      );
    } finally {
      if (request === accessRequest.current) setAccessBusy(false);
    }
  }, []);

  useEffect(() => {
    let current = true;
    const request = ++authRequest.current;
    let unsubscribe: (() => void) | undefined;
    setCheckingAuth(true);
    setAuthError("");
    void initializeMealDeckOpsClient(true)
      .then(async (sb) => {
        if (!current) return;
        const {
          data: { subscription },
        } = sb.auth.onAuthStateChange((event, session) => {
          if (!current) return;
          const changedUser =
            event === "SIGNED_IN" &&
            activeUserId.current !== null &&
            session?.user.id !== activeUserId.current;
          if (event === "SIGNED_OUT" || changedUser) {
            clearStaffState();
            if (!signingOut.current) {
              resetMealDeckOpsClient();
              setAuthCycle((cycle) => cycle + 1);
            }
          }
        });
        unsubscribe = () => subscription.unsubscribe();
        const { data: result, error: authIssue } = await sb.auth.getUser();
        if (!current || request !== authRequest.current) return;
        if (authIssue || !result.user) {
          clearStaffState();
        } else {
          activeUserId.current = result.user.id;
          setUser(result.user);
          void fetchAccess();
        }
        setCheckingAuth(false);
      })
      .catch((reason) => {
        if (!current || request !== authRequest.current) return;
        clearStaffState();
        setAuthError(reason instanceof Error ? reason.message : "Staff login is not configured.");
        setCheckingAuth(false);
      });
    return () => {
      current = false;
      unsubscribe?.();
    };
  }, [fetchAccess, clearStaffState, authCycle]);

  useEffect(() => {
    let current = true;
    if (!tenant || !user) {
      setLocations([]);
      setLocation("");
      return undefined; // No active tenant subscription to clean up.
    }
    setLocations([]);
    setLocation("");
    setData(blank());
    void opsRpc<unknown>("mealdeck_ops_locations", { p_tenant: tenant })
      .then((raw) => {
        if (!current) return;
        const places = opsRows<OpsLocation>(raw);
        setLocations(places);
        setLocation(places[0]?.location_id ?? "");
      })
      .catch((reason) => {
        if (current)
          setError(reason instanceof Error ? reason.message : "Locations could not be loaded.");
      });
    return () => {
      current = false;
    };
  }, [tenant, user]);

  const tenants = useMemo(
    () => [
      ...new Map(
        accesses.map((a) => [a.tenant_id, { id: a.tenant_id, name: a.tenant_name }]),
      ).values(),
    ],
    [accesses],
  );
  const permissions = useMemo(
    () => effectiveOpsPermissions(accesses, tenant, location || null),
    [accesses, tenant, location],
  );
  const globalPermissions = useMemo(
    () => effectiveOpsPermissions(accesses, tenant, null),
    [accesses, tenant],
  );
  const accessibleSections = OPS_SECTIONS.filter((x) => permissions.has(x.permission));
  const selectedSection: OpsSection = kitchenMode
    ? "kitchen"
    : accessibleSections.some((x) => x.id === section)
      ? section
      : (accessibleSections[0]?.id ?? "menu");

  const reload = useCallback(async () => {
    if (!tenant || !location || !user) return;
    const request = ++reqRef.current;
    setLoading(true);
    setError("");
    try {
      const base = { p_tenant: tenant, p_location: location };
      const period = { ...base, p_from: fromDate, p_to: toDate };
      const next: WorkspaceData = blank();
      const row = <T,>(raw: unknown): T[] => opsRows<T>(raw);
      switch (selectedSection) {
        case "menu": {
          const [products, categories] = await Promise.all([
            opsRpc<unknown>("mealdeck_ops_menu_list", base),
            opsRpc<unknown>("mealdeck_ops_menu_taxonomy", base),
          ]);
          next.menu = row<OpsMenuItem>(products);
          next.taxonomy = row<OpsTaxonomy>(categories);
          break;
        }
        case "orders":
          next.orders = row<OpsOrder>(await opsRpc<unknown>("mealdeck_ops_order_history", period));
          break;
        case "recipes": {
          const [products, recipes, ingredients] = await Promise.all([
            opsRpc<unknown>("mealdeck_ops_menu_list", base),
            opsRpc<unknown>("mealdeck_ops_recipe_list", base),
            opsRpc<unknown>("mealdeck_ops_ingredient_list", base),
          ]);
          next.menu = row<OpsMenuItem>(products);
          next.recipes = row<OpsRecipe>(recipes);
          next.ingredients = row<OpsIngredient>(ingredients);
          break;
        }
        case "ingredients": {
          const [ingredients, stock] = await Promise.all([
            opsRpc<unknown>("mealdeck_ops_ingredient_list", base),
            opsRpc<unknown>("mealdeck_ops_stock_levels", base),
          ]);
          next.ingredients = row<OpsIngredient>(ingredients);
          next.stock = row<OpsStock>(stock);
          break;
        }
        case "purchasing": {
          const [suppliers, purchases, ingredients] = await Promise.all([
            opsRpc<unknown>("mealdeck_ops_supplier_list", base),
            opsRpc<unknown>("mealdeck_ops_purchase_list", base),
            opsRpc<unknown>("mealdeck_ops_ingredient_list", base),
          ]);
          next.suppliers = row<OpsSupplier>(suppliers);
          next.purchases = row<OpsPurchase>(purchases);
          next.ingredients = row<OpsIngredient>(ingredients);
          break;
        }
        case "batches": {
          next.batches = row<OpsBatch>(
            await opsRpc<unknown>("mealdeck_ops_batch_list", { ...base, p_days: 14 }),
          );
          break;
        }
        case "costs": {
          const [ingredients, costs, recipes, menu] = await Promise.all([
            opsRpc<unknown>("mealdeck_ops_ingredient_list", base),
            opsRpc<unknown>("mealdeck_ops_cost_list", base),
            opsRpc<unknown>("mealdeck_ops_recipe_costs", base),
            opsRpc<unknown>("mealdeck_ops_menu_list", base),
          ]);
          next.ingredients = row<OpsIngredient>(ingredients);
          next.costs = row<OpsCost>(costs);
          next.recipeCosts = row<OpsRecipeCost>(recipes);
          next.menu = row<OpsMenuItem>(menu);
          break;
        }
        case "invoices": {
          const [invoices, credits, summary, purchases] = await Promise.all([
            opsRpc<unknown>("mealdeck_ops_invoice_list", period),
            opsRpc<unknown>("mealdeck_ops_credit_list", period),
            opsRpc<OpsSupplierInvoiceSummary>("mealdeck_ops_invoice_summary", period),
            opsRpc<unknown>("mealdeck_ops_purchase_list", base),
          ]);
          next.invoices = row<OpsSupplierInvoice>(invoices);
          next.credits = row<OpsSupplierCredit>(credits);
          next.invoiceSummary = summary;
          next.purchases = row<OpsPurchase>(purchases);
          break;
        }
        case "finance": {
          const [finance, expenses] = await Promise.all([
            opsRpc<OpsFinance>("mealdeck_ops_finance_summary", period),
            opsRpc<unknown>("mealdeck_ops_expense_list", period),
          ]);
          next.finance = finance;
          next.expenses = row<OpsExpense>(expenses);
          break;
        }
        case "overview": {
          const [analytics, brandSales] = await Promise.all([
            opsRpc<OpsAnalytics>("mealdeck_ops_analytics", period),
            opsRpc<unknown>("mealdeck_ops_brand_sales", period),
          ]);
          next.analytics = analytics;
          next.brandSales = row<OpsBrandSales>(brandSales);
          // Read each location through the same authenticated, location-scoped
          // analytics RPC. A missing/forbidden source is NOT a zero-order week.
          const asOf = dateISO(new Date());
          const range = paidOrderGoalRange(asOf);
          const siteNames = ["Luton", "St Albans"] as const;
          next.paidGoalLocations = await Promise.all(
            siteNames.map(async (city: PaidGoalLocation["city"]): Promise<PaidGoalLocation> => {
              const matching = locations.filter((place) =>
                city === "Luton"
                  ? /\bluton\b/i.test(place.location_name)
                  : /\bst[.\s-]*albans\b/i.test(place.location_name),
              );
              if (matching.length !== 1) return { city, status: "not_configured", goal: null };
              const site = matching[0]!;
              if (
                !effectiveOpsPermissions(accesses, tenant, site.location_id).has("analytics.read")
              )
                return { city, status: "no_access", goal: null };
              if (!range) return { city, status: "unavailable", goal: null };
              try {
                const source = await opsRpc<OpsAnalytics>("mealdeck_ops_analytics", {
                  p_tenant: tenant,
                  p_location: site.location_id,
                  p_from: range.from,
                  p_to: range.to,
                });
                const goal = summariseWeeklyPaidOrders(source, asOf);
                return { city, status: goal ? "ready" : "unavailable", goal };
              } catch {
                return { city, status: "unavailable", goal: null };
              }
            }),
          );
          break;
        }
        case "team": {
          const [staff, audit] = await Promise.all([
            opsRpc<unknown>("mealdeck_ops_staff_list", { p_tenant: tenant }),
            opsRpc<unknown>("mealdeck_ops_audit_history", { p_tenant: tenant, p_limit: 60 }),
          ]);
          next.staff = row<OpsStaff>(staff);
          next.audit = row<OpsAudit>(audit);
          break;
        }
      }
      if (request === reqRef.current) setData(next);
    } catch (reason) {
      if (request === reqRef.current) {
        setError(reason instanceof Error ? reason.message : "Operations data could not be loaded.");
        setData(blank());
      }
    } finally {
      if (request === reqRef.current) setLoading(false);
    }
  }, [tenant, location, user, selectedSection, fromDate, toDate, accesses, locations]);
  useEffect(() => {
    if (tenant && location && user) void reload();
  }, [tenant, location, user, reload]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setLoginBusy(true);
    try {
      const sb = await initializeMealDeckOpsClient(true);
      const { data: result, error: issue } = await sb.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (issue || !result.user)
        throw new Error("Staff sign-in was not accepted. Check your credentials.");
      if (getMealDeckOpsClient() !== sb)
        throw new Error("The staff connection changed. Please sign in again.");
      setPassword("");
      // Reattach the auth observer to the currently selected MealDeck client
      // and re-read access; no role/tenant state crosses a new staff session.
      clearStaffState();
      setAuthCycle((cycle) => cycle + 1);
    } catch (reason) {
      setAuthError(reason instanceof Error ? reason.message : "Staff sign-in failed.");
    } finally {
      setLoginBusy(false);
    }
  }
  async function sendLoginLink() {
    setAuthError("");
    setLoginBusy(true);
    try {
      const sb = await initializeMealDeckOpsClient(true);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        throw new Error("Enter your existing staff email first.");
      const { error: issue } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: window.location.origin + (kitchenMode ? "/kds" : "/ops"),
        },
      });
      if (issue) throw new Error("Sign-in link could not be sent for this staff account.");
      setAuthError(
        "Check your email for the staff sign-in link. New users are not created automatically.",
      );
    } catch (reason) {
      setAuthError(reason instanceof Error ? reason.message : "Unable to send a login link.");
    } finally {
      setLoginBusy(false);
    }
  }
  async function signOut() {
    signingOut.current = true;
    clearStaffState();
    try {
      await getMealDeckOpsClient().auth.signOut({ scope: "local" });
    } catch {
      // Private UI is already cleared. Retire this connection even if the
      // authentication SDK cannot finish its remote logout request.
    } finally {
      resetMealDeckOpsClient();
      signingOut.current = false;
      setAuthCycle((cycle) => cycle + 1);
    }
  }
  const kitchenSelected = selectedSection === "kitchen";
  const can = (perm: OpsPermission) => permissions.has(perm);
  const canGlobal = (perm: OpsPermission) => globalPermissions.has(perm);
  const common = {
    tenantId: tenant,
    locationId: location,
    can,
    canGlobal,
    reload,
    notice: setNotice,
  };
  const activeLocation = locations.find((x) => x.location_id === location);

  return (
    <div className="md-ops">
      <header className="md-ops-masthead">
        <div
          className={
            "mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 " +
            (kitchenMode ? "py-2" : "flex-wrap py-3")
          }
        >
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link to="/" className="md-ops-logo-link" aria-label="MealDeck home">
              <MealDeckLogo className="md-ops-logo" decorative />
            </Link>
            <div className="min-w-0">
              <p className="md-ops-kicker text-[11px] font-black uppercase tracking-[0.16em] sm:text-xs">
                MealDeck
                <span className={kitchenMode ? "hidden sm:inline" : ""}> · Back of house</span>
              </p>
              <h1
                className={
                  "font-display font-black tracking-tight " +
                  (kitchenMode ? "text-lg sm:text-2xl" : "text-xl sm:text-2xl")
                }
              >
                {kitchenMode ? "Kitchen display" : "Operations & intelligence"}
              </h1>
            </div>
          </div>
          <div className={"flex items-center gap-2 " + (kitchenMode ? "shrink-0" : "flex-wrap")}>
            <Link
              to={kitchenMode ? "/ops" : "/"}
              aria-label={kitchenMode ? "Operations" : "Public website"}
              title={kitchenMode ? "Operations" : "Public website"}
              className={
                "md-ops-button md-ops-header-action min-w-11 " +
                (kitchenMode ? "px-3 sm:px-4" : "px-4")
              }
            >
              <ArrowLeft className="size-4" aria-hidden="true" />{" "}
              <span className={kitchenMode ? "hidden sm:inline" : ""}>
                {kitchenMode ? "Operations" : "Public website"}
              </span>
            </Link>
            {user && (
              <button
                type="button"
                onClick={() => void signOut()}
                aria-label="Sign out"
                title="Sign out"
                className={
                  "md-ops-button md-ops-header-action min-w-11 " +
                  (kitchenMode ? "px-3 sm:px-4" : "px-4")
                }
              >
                <LogOut className="size-4" aria-hidden="true" />{" "}
                <span className={kitchenMode ? "hidden sm:inline" : ""}>Sign out</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main
        className={"mx-auto max-w-7xl px-4 sm:px-6 " + (kitchenMode ? "py-4" : "py-7 sm:py-10")}
      >
        {checkingAuth ? (
          <div className={columns}>
            <p>Checking secure staff authentication…</p>
          </div>
        ) : !user ? (
          <div className="md-ops-card md-ops-login mx-auto max-w-lg overflow-hidden">
            <div className="md-ops-login-heading p-6 sm:p-7">
              <LockKeyhole className="md-ops-login-mark size-8" />
              <h2 className="mt-4 font-display text-3xl font-black">Staff sign-in</h2>
              <p className="mt-2 text-sm leading-6">
                For approved MealDeck kitchen, finance, menu and operations staff. Accounts must be
                provisioned and assigned by an authorised administrator.
              </p>
            </div>
            <form className="md-ops-login-form space-y-4" onSubmit={(event) => void signIn(event)}>
              <label className="block text-sm font-bold">
                Staff email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  className={"mt-2 " + field}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block text-sm font-bold">
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  className={"mt-2 " + field}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {authError && (
                <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  {authError}
                </p>
              )}
              <button type="submit" disabled={loginBusy} className={btn + " w-full"}>
                Secure staff sign-in
              </button>
              <button
                type="button"
                disabled={loginBusy}
                onClick={() => void sendLoginLink()}
                className="md-ops-button md-ops-secondary w-full"
              >
                Email me a sign-in link instead
              </button>
              <p className="text-xs md-ops-muted">
                No public staff sign-up. Staff roles and all operational data are checked by
                Supabase RLS and authorised database functions; this screen alone grants no access.
              </p>
            </form>
          </div>
        ) : accessBusy ? (
          <div className={columns}>Checking your tenant roles…</div>
        ) : accesses.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 md-ops-paper p-7 text-center">
            <ShieldCheck className="mx-auto size-10 md-ops-accent" />
            <h2 className="mt-4 text-2xl font-black">No operational access assigned</h2>
            <p className="mt-2 text-sm md-ops-muted">
              Your login is valid, but no active MealDeck tenant or kitchen role has been assigned.
              Ask an authorised administrator to grant a scoped role. Signing in alone does not
              expose private orders, recipes or financial records.
            </p>
            {authError && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {authError}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {kitchenSelected ? (
              <section
                aria-label="Kitchen workspace"
                className="md-ops-scopebar flex flex-wrap items-end gap-3 p-3"
              >
                {tenants.length > 1 && (
                  <label className="min-w-0 flex-1 text-xs font-bold md-ops-muted">
                    Business
                    <select
                      aria-label="Business"
                      value={tenant}
                      onChange={(e) => {
                        reqRef.current++;
                        setData(blank());
                        setTenant(e.target.value);
                        setNotice("");
                      }}
                      className={"mt-1 " + field}
                    >
                      {tenants.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {locations.length > 1 ? (
                  <label className="min-w-0 flex-1 text-xs font-bold md-ops-muted">
                    Kitchen
                    <select
                      aria-label="Kitchen"
                      value={location}
                      disabled={!locations.length}
                      onChange={(e) => {
                        reqRef.current++;
                        setData(blank());
                        setLocation(e.target.value);
                        setNotice("");
                      }}
                      className={"mt-1 " + field}
                    >
                      {!locations.length && <option value="">No accessible kitchens</option>}
                      {locations.map((x) => (
                        <option key={x.location_id} value={x.location_id}>
                          {x.location_name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg font-bold">
                      {activeLocation?.location_name ?? "Loading kitchen…"}
                    </h2>
                    <p className="mt-0.5 text-xs md-ops-muted">
                      All brands · one shared kitchen board
                    </p>
                  </div>
                )}
                {!kitchenMode && (
                  <Link to="/kds" className="md-ops-button md-ops-secondary">
                    Open kitchen screen
                  </Link>
                )}
              </section>
            ) : (
              <>
                <section className="md-ops-scopebar grid gap-4 p-5 lg:grid-cols-[1fr_1fr_1.2fr]">
                  <label className="text-xs font-bold uppercase tracking-wide md-ops-muted">
                    Business
                    <select
                      aria-label="Business"
                      value={tenant}
                      onChange={(e) => {
                        reqRef.current++;
                        setTenant(e.target.value);
                        setNotice("");
                      }}
                      className={"mt-2 " + field}
                    >
                      {tenants.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-bold uppercase tracking-wide md-ops-muted">
                    Kitchen / location
                    <select
                      aria-label="Kitchen"
                      value={location}
                      disabled={!locations.length}
                      onChange={(e) => {
                        reqRef.current++;
                        setLocation(e.target.value);
                        setNotice("");
                      }}
                      className={"mt-2 " + field}
                    >
                      {locations.map((x) => (
                        <option key={x.location_id} value={x.location_id}>
                          {x.location_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide md-ops-muted">
                        Access verified for
                      </p>
                      <p className="mt-2 font-bold">
                        {activeLocation?.location_name ?? "Choose kitchen"}
                      </p>
                      <p className="mt-1 break-words text-xs md-ops-muted">
                        {user.email ?? "Authenticated staff"} · {permissions.size} permissions
                      </p>
                    </div>
                    <button
                      type="button"
                      className="md-ops-button md-ops-secondary"
                      onClick={() => void reload()}
                      disabled={!location || loading}
                    >
                      <RefreshCcw className="size-4" /> Refresh
                    </button>
                  </div>
                </section>
              </>
            )}
            {!kitchenMode && (
              <>
                <label className="block text-xs font-bold md-ops-muted md:hidden">
                  Operations area
                  <select
                    className={"mt-1 " + field}
                    value={selectedSection}
                    onChange={(e) => {
                      reqRef.current++;
                      setSection(e.target.value as OpsSection);
                      setNotice("");
                    }}
                  >
                    {accessibleSections.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </label>
                <nav
                  aria-label="Operations areas"
                  className="md-ops-nav hidden flex-wrap gap-2 md:flex"
                >
                  {accessibleSections.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      aria-current={x.id === selectedSection ? "page" : undefined}
                      onClick={() => {
                        reqRef.current++;
                        setSection(x.id);
                        setNotice("");
                      }}
                      className={
                        x.id === selectedSection
                          ? "md-ops-button md-ops-primary"
                          : "md-ops-button md-ops-secondary"
                      }
                    >
                      {x.label}
                    </button>
                  ))}
                </nav>
              </>
            )}

            {(selectedSection === "overview" ||
              selectedSection === "orders" ||
              selectedSection === "finance" ||
              selectedSection === "invoices") && (
              <section className="md-ops-reporting flex flex-wrap items-end gap-3 p-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="size-5 md-ops-accent" />
                  <p className="text-sm font-bold">Reporting period</p>
                </div>
                <label className="text-xs font-semibold">
                  From
                  <input
                    className="md-ops-field md-ops-date ml-2"
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold">
                  To
                  <input
                    className="md-ops-field md-ops-date ml-2"
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </label>
                <p className="text-xs md-ops-muted">
                  Up to 94 calendar days; data is scoped to one kitchen.
                </p>
              </section>
            )}
            {notice && (
              <p
                role="status"
                className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900"
              >
                <ShieldCheck className="size-4 shrink-0" />
                {notice}
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              >
                {error}
              </p>
            )}
            {!location ? (
              <div className={columns}>
                <p className="font-semibold">
                  No accessible kitchen locations. Contact your tenant administrator.
                </p>
              </div>
            ) : loading && !kitchenSelected ? (
              <div role="status" className={columns}>
                Loading authorised records for this kitchen…
              </div>
            ) : (
              <div>
                {kitchenSelected &&
                  (can("orders.read") ? (
                    <OpsKdsPanel
                      key={tenant + ":" + location + ":" + user.id}
                      tenantId={tenant}
                      locationId={location}
                      can={can}
                    />
                  ) : (
                    <p role="alert" className={columns}>
                      Your staff role does not have access to the kitchen display.
                    </p>
                  ))}
                {selectedSection === "overview" && (
                  <div className="space-y-5">
                    <PaidOrdersGoalPanel locations={data.paidGoalLocations} />
                    <OpsAnalyticsPanel analytics={data.analytics} brandSales={data.brandSales} />
                  </div>
                )}
                {selectedSection === "menu" && (
                  <OpsMenuPanel {...common} menu={data.menu} taxonomy={data.taxonomy} />
                )}
                {selectedSection === "orders" && (
                  <OpsOrdersPanel orders={data.orders} tenantId={tenant} locationId={location} />
                )}
                {selectedSection === "recipes" && (
                  <OpsRecipePanel
                    {...common}
                    recipes={data.recipes}
                    ingredients={data.ingredients}
                    menu={data.menu}
                  />
                )}
                {selectedSection === "ingredients" && (
                  <OpsIngredientPanel
                    {...common}
                    ingredients={data.ingredients}
                    stock={data.stock}
                  />
                )}
                {selectedSection === "purchasing" && (
                  <OpsProcurementPanel
                    tenantId={tenant}
                    locationId={location}
                    staffUserId={user.id}
                    suppliers={data.suppliers}
                    purchases={data.purchases}
                    ingredients={data.ingredients}
                    canFinance={can("finance.manage")}
                    canFinanceGlobal={canGlobal("finance.manage")}
                    canReceive={can("inventory.write")}
                    onRefresh={reload}
                    onNotice={setNotice}
                  />
                )}
                {selectedSection === "batches" && (
                  <OpsStockBatchesPanel
                    tenantId={tenant}
                    locationId={location}
                    batches={data.batches}
                    canIssue={can("inventory.write")}
                    onRefresh={reload}
                    onNotice={setNotice}
                  />
                )}
                {selectedSection === "costs" && (
                  <OpsCostsPanel
                    {...common}
                    ingredients={data.ingredients}
                    costs={data.costs}
                    recipeCosts={data.recipeCosts}
                    menu={data.menu}
                  />
                )}
                {selectedSection === "invoices" && (
                  <OpsSupplierInvoicesPanel
                    tenantId={tenant}
                    locationId={location}
                    staffUserId={user.id}
                    invoices={data.invoices}
                    credits={data.credits}
                    summary={data.invoiceSummary}
                    purchaseOrders={data.purchases}
                    canManage={can("finance.manage")}
                    canManageGlobal={canGlobal("finance.manage")}
                    refresh={reload}
                    notify={setNotice}
                  />
                )}
                {selectedSection === "finance" && (
                  <OpsFinancePanel {...common} finance={data.finance} expenses={data.expenses} />
                )}
                {selectedSection === "team" && (
                  <OpsTeamPanel
                    {...common}
                    staff={data.staff}
                    audit={data.audit}
                    locations={locations}
                  />
                )}
              </div>
            )}
            {!kitchenSelected && (
              <p className="flex flex-wrap items-center gap-2 text-xs md-ops-muted">
                <Store className="size-4" /> Records belong to MealDeck’s independent database.{" "}
                {MEALDECK_BUSINESS.technologyCredit}. Owner approval is required for tenant-wide
                editing.
                <UserRoundCog className="ml-2 size-4" /> No automatic staff invitations or checkout
                activation.
                <ClipboardList className="ml-2 size-4" /> Coming-soon customer ordering remains
                closed.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
