import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Boxes,
  ChefHat,
  ChevronRight,
  ClipboardList,
  House,
  LockKeyhole,
  LogOut,
  Menu,
  PackageSearch,
  PoundSterling,
  ReceiptText,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  Store,
  Truck,
  Users,
  UtensilsCrossed,
  type LucideIcon,
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
import { CashOrderPanel } from "@/components/ops/cash-order-panel";
import { CheckoutLaunchSettings } from "@/components/ops/checkout-launch-settings";
import { IntegrationStatusPanel } from "@/components/ops/integration-status-panel";
import { WhatsAppInboxPanel } from "@/components/ops/whatsapp-inbox-panel";
import { StaffPasswordPanel } from "@/components/ops/staff-password-panel";
import {
  StaffMobileNav,
  StaffMobileSheet,
  type StaffMobileNavItem,
} from "./staff-mobile-navigation";
import "./operations-mobile.css";
const field = "md-ops-field";
const btn = "md-ops-button md-ops-primary";
const columns = "md-ops-card p-5";
const sectionIcons: Record<OpsSection, LucideIcon> = {
  overview: House,
  kitchen: ChefHat,
  menu: UtensilsCrossed,
  orders: ClipboardList,
  recipes: BookOpen,
  ingredients: Boxes,
  purchasing: Truck,
  batches: PackageSearch,
  costs: PoundSterling,
  finance: BarChart3,
  invoices: ReceiptText,
  team: Users,
};
const mobilePrimarySections: readonly OpsSection[] = ["overview", "kitchen", "orders", "menu"];
const mobileLabels: Partial<Record<OpsSection, string>> = {
  overview: "Home",
  kitchen: "Kitchen",
  orders: "Orders",
  menu: "Menu",
};
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
  const [accessError, setAccessError] = useState("");
  const [tenant, setTenant] = useState("");
  const [locations, setLocations] = useState<OpsLocation[]>([]);
  const [location, setLocation] = useState("");
  const [locationState, setLocationState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [locationError, setLocationError] = useState("");
  const [locationCycle, setLocationCycle] = useState(0);
  const [section, setSection] = useState<OpsSection>(kitchenMode ? "kitchen" : "overview");
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(lastMonth());
  const [toDate, setToDate] = useState(dateISO(new Date()));
  const [data, setData] = useState<WorkspaceData>(blank);
  const reqRef = useRef(0);
  const accessRequest = useRef(0);
  const locationRequest = useRef(0);
  const authRequest = useRef(0);
  const activeUserId = useRef<string | null>(null);
  const signingOut = useRef(false);
  const mobileMoreButton = useRef<HTMLButtonElement | null>(null);
  const mobileSheetOpener = useRef<HTMLButtonElement | null>(null);
  const workspaceMain = useRef<HTMLElement | null>(null);
  const mobileSectionHeading = useRef<HTMLHeadingElement | null>(null);
  const focusNewSection = useRef(false);

  const clearStaffState = useCallback(() => {
    reqRef.current++;
    accessRequest.current++;
    locationRequest.current++;
    authRequest.current++;
    activeUserId.current = null;
    setUser(null);
    setAccesses([]);
    setAccessError("");
    setTenant("");
    setLocation("");
    setLocations([]);
    setLocationState("idle");
    setLocationError("");
    setData(blank());
    setNotice("");
    setError("");
    setPassword("");
    setAccessBusy(false);
    setLoading(false);
    setMobileMoreOpen(false);
  }, []);

  const fetchAccess = useCallback(async () => {
    const request = ++accessRequest.current;
    setAccessBusy(true);
    setAccessError("");
    try {
      const rows = opsRows<OpsAccess>(await opsRpc<unknown>("mealdeck_ops_my_access"));
      if (request !== accessRequest.current) return;
      setAccesses(rows);
      setTenant((previous) =>
        rows.some((x) => x.tenant_id === previous) ? previous : (rows[0]?.tenant_id ?? ""),
      );
    } catch (reason) {
      if (request !== accessRequest.current) return;
      reqRef.current++;
      locationRequest.current++;
      setAccesses([]);
      setTenant("");
      setLocations([]);
      setLocation("");
      setLocationState("idle");
      setData(blank());
      setAccessError(
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
    const request = ++locationRequest.current;
    if (!tenant || !user) {
      setLocations([]);
      setLocation("");
      setLocationState("idle");
      setLocationError("");
      return undefined; // No active tenant subscription to clean up.
    }
    const isCurrent = () =>
      current && request === locationRequest.current && activeUserId.current === user.id;
    reqRef.current++;
    setLocations([]);
    setLocation("");
    setLocationState("loading");
    setLocationError("");
    setData(blank());
    setLoading(false);
    void opsRpc<unknown>("mealdeck_ops_locations", { p_tenant: tenant })
      .then((raw) => {
        if (!isCurrent()) return;
        const places = opsRows<OpsLocation>(raw);
        setLocations(places);
        setLocation(places[0]?.location_id ?? "");
        setLocationState("ready");
      })
      .catch((reason) => {
        if (!isCurrent()) return;
        setLocationState("error");
        setLocationError(
          reason instanceof Error ? reason.message : "Your kitchens could not be loaded.",
        );
      });
    return () => {
      current = false;
    };
  }, [tenant, user, locationCycle]);

  function changeTenant(nextTenant: string) {
    if (nextTenant === tenant) return;
    reqRef.current++;
    locationRequest.current++;
    setLocations([]);
    setLocation("");
    setLocationState("loading");
    setLocationError("");
    setData(blank());
    setTenant(nextTenant);
    setNotice("");
    setError("");
  }

  function retryLocations() {
    setLocationState("loading");
    setLocationError("");
    setLocationCycle((cycle) => cycle + 1);
  }

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
  const locationPending = !!tenant && (locationState === "idle" || locationState === "loading");
  const mobileNavigationAvailable = !kitchenMode && !!user && accesses.length > 0;
  const activeSectionLabel =
    accessibleSections.find((entry) => entry.id === selectedSection)?.label ?? "Operations";
  function selectArea(next: OpsSection, mobile = false) {
    if (!accessibleSections.some((entry) => entry.id === next)) return;
    if (selectedSection !== next) {
      reqRef.current++;
      setData(blank());
      setSection(next);
      setNotice("");
      setError("");
    }
    focusNewSection.current = mobile;
    setMobileMoreOpen(false);
    if (mobile && !mobileMoreOpen) {
      window.requestAnimationFrame(() => {
        mobileSectionHeading.current?.focus({ preventScroll: true });
        workspaceMain.current?.scrollIntoView({ block: "start" });
      });
    }
  }
  const mobileNavigation: StaffMobileNavItem[] = [
    ...mobilePrimarySections
      .filter((id) => accessibleSections.some((entry) => entry.id === id))
      .map((id) => ({
        id,
        label: mobileLabels[id]!,
        icon: sectionIcons[id],
        active: selectedSection === id,
        onClick: () => selectArea(id, true),
      })),
    {
      id: "more",
      label: "More",
      icon: Menu,
      active: !mobilePrimarySections.includes(selectedSection),
      expanded: mobileMoreOpen,
      controls: "mealdeck-operations-more",
      buttonRef: (element) => {
        mobileMoreButton.current = element;
      },
      onClick: () => {
        mobileSheetOpener.current = mobileMoreButton.current;
        focusNewSection.current = false;
        setMobileMoreOpen(true);
      },
    },
  ];

  return (
    <div
      className={
        "md-ops md-ops-workspace " +
        (kitchenMode ? "md-ops-kitchen-shell " : "") +
        (mobileNavigationAvailable ? "md-staff-has-mobile-nav" : "")
      }
    >
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
                  "md-ops-workspace-title font-display font-black tracking-tight " +
                  (kitchenMode ? "text-lg sm:text-2xl" : "text-xl sm:text-2xl")
                }
              >
                {kitchenMode ? (
                  "Kitchen display"
                ) : (
                  <>
                    <span className="md-ops-title-desktop">Operations & intelligence</span>
                    <span className="md-ops-title-mobile">Operations</span>
                  </>
                )}
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
                (kitchenMode ? "px-3 sm:px-4" : "md-ops-desktop-action px-4")
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
                  (kitchenMode
                    ? "px-3 sm:px-4"
                    : (mobileNavigationAvailable ? "md-ops-desktop-action " : "") + "px-4")
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
        ref={workspaceMain}
        tabIndex={-1}
        className={
          "md-ops-main mx-auto max-w-7xl px-4 sm:px-6 " + (kitchenMode ? "py-4" : "py-7 sm:py-10")
        }
      >
        {checkingAuth ? (
          <div role="status" className={columns}>
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
                Use your assigned staff account. An administrator controls which kitchens and tools
                you can access.
              </p>
            </form>
          </div>
        ) : accessBusy ? (
          <div role="status" className={columns}>
            Checking your staff access…
          </div>
        ) : accesses.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 md-ops-paper p-7 text-center">
            {accessError ? (
              <AlertCircle className="mx-auto size-10 md-ops-accent" aria-hidden="true" />
            ) : (
              <ShieldCheck className="mx-auto size-10 md-ops-accent" aria-hidden="true" />
            )}
            <h2 className="mt-4 text-2xl font-black">
              {accessError ? "Staff access could not be checked" : "No operational access assigned"}
            </h2>
            <p className="mt-2 text-sm md-ops-muted">
              {accessError
                ? "Your workspace will open after we can verify your staff access. Try the check again."
                : "You’re signed in, but no MealDeck business or kitchen role is assigned to this account. Ask an administrator to assign your access, then check again."}
            </p>
            {accessError && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {accessError}
              </p>
            )}
            <button
              type="button"
              className="md-ops-button md-ops-primary mt-5"
              onClick={() => void fetchAccess()}
            >
              <RefreshCcw className="size-4" aria-hidden="true" />
              {accessError ? "Retry access check" : "Check access again"}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {!kitchenMode && (
              <div className="md-ops-mobile-context">
                <div className="min-w-0">
                  <p className="md-ops-mobile-location">
                    <Store aria-hidden="true" />
                    {activeLocation?.location_name ??
                      (locationPending ? "Loading kitchen…" : "Choose kitchen")}
                  </p>
                  <h2 ref={mobileSectionHeading} tabIndex={-1}>
                    {activeSectionLabel}
                  </h2>
                </div>
                <button
                  type="button"
                  className="md-ops-context-button"
                  aria-label="Kitchen and account settings"
                  aria-haspopup="dialog"
                  onClick={(event) => {
                    mobileSheetOpener.current = event.currentTarget;
                    focusNewSection.current = false;
                    setMobileMoreOpen(true);
                  }}
                >
                  <Settings2 aria-hidden="true" />
                </button>
              </div>
            )}
            {kitchenSelected ? (
              <section
                aria-label="Kitchen workspace"
                className={
                  "md-ops-scopebar flex flex-wrap items-end gap-3 p-3 " +
                  (!kitchenMode ? "md-ops-desktop-scope" : "")
                }
              >
                {tenants.length > 1 && (
                  <label className="min-w-0 flex-1 text-xs font-bold md-ops-muted">
                    Business
                    <select
                      aria-label="Business"
                      value={tenant}
                      onChange={(e) => changeTenant(e.target.value)}
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
                      {activeLocation?.location_name ??
                        (locationPending
                          ? "Loading kitchen…"
                          : locationError
                            ? "Kitchen unavailable"
                            : "No kitchen assigned")}
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
                <section className="md-ops-scopebar md-ops-desktop-scope grid gap-4 p-5 lg:grid-cols-[1fr_1fr_1.2fr]">
                  <label className="text-xs font-bold uppercase tracking-wide md-ops-muted">
                    Business
                    <select
                      aria-label="Business"
                      value={tenant}
                      onChange={(e) => changeTenant(e.target.value)}
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
                      {!locations.length && (
                        <option value="">
                          {locationPending ? "Loading kitchens…" : "No accessible kitchens"}
                        </option>
                      )}
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
                <nav
                  aria-label="Operations areas"
                  className="md-ops-nav md-ops-desktop-navigation flex flex-wrap gap-2"
                >
                  {accessibleSections.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      aria-current={x.id === selectedSection ? "page" : undefined}
                      onClick={() => selectArea(x.id)}
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
                {locationPending ? (
                  <p role="status" className="flex items-center gap-2 text-sm font-semibold">
                    <RefreshCcw className="size-4 motion-safe:animate-spin" aria-hidden="true" />
                    Loading your kitchens…
                  </p>
                ) : (
                  <>
                    <h2 className="font-display text-lg font-bold">
                      {locationError ? "Kitchen list unavailable" : "No kitchen assigned"}
                    </h2>
                    <p
                      role={locationError ? "alert" : "status"}
                      className="mt-2 text-sm md-ops-muted"
                    >
                      {locationError ||
                        "There are no accessible kitchens for this business. Ask an administrator to check your kitchen assignment."}
                    </p>
                    <button
                      type="button"
                      className="md-ops-button md-ops-primary mt-4"
                      disabled={!tenant}
                      onClick={retryLocations}
                    >
                      <RefreshCcw className="size-4" aria-hidden="true" />
                      {locationError ? "Retry kitchen lookup" : "Check kitchens again"}
                    </button>
                  </>
                )}
              </div>
            ) : loading && !kitchenSelected ? (
              <div role="status" className={columns}>
                Loading authorised records for this kitchen…
              </div>
            ) : (
              <div>
                {kitchenSelected &&
                  (can("orders.read") ? (
                    <div className="space-y-5">
                      <OpsKdsPanel
                        key={tenant + ":" + location + ":" + user.id}
                        tenantId={tenant}
                        locationId={location}
                        can={can}
                        mobileNavigation={kitchenMode}
                      />
                      <WhatsAppInboxPanel
                        tenantId={tenant}
                        locationId={location}
                        staffUserId={user.id}
                        canControl={can("orders.status")}
                      />
                    </div>
                  ) : (
                    <p role="alert" className={columns}>
                      Your staff role does not have access to the kitchen display.
                    </p>
                  ))}
                {selectedSection === "overview" && (
                  <div className="space-y-5">
                    {!!location &&
                      can("finance.manage") &&
                      accesses.some(
                        (access) =>
                          access.tenant_id === tenant &&
                          (access.location_id === null || access.location_id === location) &&
                          (access.role === "owner" || access.role === "admin"),
                      ) && (
                        <div className="space-y-5" key={tenant + ":" + location + ":" + user.id}>
                          <CheckoutLaunchSettings tenantId={tenant} locationId={location} />
                          <IntegrationStatusPanel tenantId={tenant} locationId={location} />
                        </div>
                      )}
                    <PaidOrdersGoalPanel locations={data.paidGoalLocations} />
                    <OpsAnalyticsPanel analytics={data.analytics} brandSales={data.brandSales} />
                  </div>
                )}
                {selectedSection === "menu" && (
                  <OpsMenuPanel {...common} menu={data.menu} taxonomy={data.taxonomy} />
                )}
                {selectedSection === "orders" && (
                  <div className="space-y-5">
                    {!!location && can("orders.read") && (
                      <WhatsAppInboxPanel
                        key={tenant + ":" + location + ":" + user.id}
                        tenantId={tenant}
                        locationId={location}
                        staffUserId={user.id}
                        canControl={can("orders.status")}
                      />
                    )}
                    {!!location && can("payments.collect") && (
                      <CashOrderPanel
                        key={tenant + ":" + location + ":" + user.id}
                        tenantId={tenant}
                        locationId={location}
                        staffUserId={user.id}
                        onRecorded={(order) =>
                          setNotice(
                            order.verifiedPaid && order.paymentStatus === "paid"
                              ? `Cash order ${order.orderNumber} recorded. ${order.acceptedAt ? "Check its progress on KDS." : "Awaiting kitchen acceptance."}`
                              : `Saved cash order ${order.orderNumber} found. Its payment status has changed; review order history before taking further payment.`,
                          )
                        }
                      />
                    )}
                    <OpsOrdersPanel orders={data.orders} tenantId={tenant} locationId={location} />
                  </div>
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
                  <>
                    {!!location &&
                      can("finance.manage") &&
                      accesses.some(
                        (access) =>
                          access.tenant_id === tenant &&
                          (access.location_id === null || access.location_id === location) &&
                          (access.role === "owner" || access.role === "admin"),
                      ) && (
                        <div className="space-y-5" key={tenant + ":" + location + ":" + user.id}>
                          <CheckoutLaunchSettings tenantId={tenant} locationId={location} />
                          <IntegrationStatusPanel tenantId={tenant} locationId={location} />
                        </div>
                      )}
                    <OpsFinancePanel {...common} finance={data.finance} expenses={data.expenses} />
                  </>
                )}
                {selectedSection === "team" && (
                  <div className="space-y-5">
                    {canGlobal("staff.manage") &&
                      accesses.some(
                        (a) =>
                          a.tenant_id === tenant && a.location_id === null && a.role === "owner",
                      ) && <StaffPasswordPanel key={tenant + ":" + user.id} />}
                    <OpsTeamPanel
                      {...common}
                      staff={data.staff}
                      audit={data.audit}
                      locations={locations}
                    />
                  </div>
                )}
              </div>
            )}
            {!kitchenSelected && (
              <p className="md-ops-workspace-footnote flex flex-wrap items-center gap-2 text-xs md-ops-muted">
                MealDeck back of house · {MEALDECK_BUSINESS.technologyCredit}
              </p>
            )}
          </div>
        )}
      </main>
      {mobileNavigationAvailable && (
        <>
          <StaffMobileNav
            label="Operations navigation"
            items={mobileNavigation}
            hidden={mobileMoreOpen}
          />
          <StaffMobileSheet
            id="mealdeck-operations-more"
            open={mobileMoreOpen}
            onOpenChange={setMobileMoreOpen}
            title="Your workspace"
            description="Kitchen settings, account and the areas available to your role."
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              window.requestAnimationFrame(() => {
                if (!window.matchMedia("(max-width: 800px)").matches) {
                  workspaceMain.current?.focus({ preventScroll: true });
                } else if (focusNewSection.current) {
                  mobileSectionHeading.current?.focus({ preventScroll: true });
                  workspaceMain.current?.scrollIntoView({ block: "start" });
                } else {
                  const opener = mobileSheetOpener.current ?? mobileMoreButton.current;
                  if (opener?.isConnected && opener.getClientRects().length) {
                    opener.focus({ preventScroll: true });
                  } else workspaceMain.current?.focus({ preventScroll: true });
                }
                focusNewSection.current = false;
              });
            }}
          >
            <div className="md-ops-mobile-settings">
              <div className="md-ops-mobile-account">
                <ShieldCheck aria-hidden="true" />
                <div>
                  <strong>Signed in</strong>
                  <p>{user?.email ?? "Authenticated staff"}</p>
                </div>
              </div>
              <div className="md-ops-mobile-scope">
                <label>
                  Business
                  <select
                    aria-label="Mobile business"
                    value={tenant}
                    onChange={(event) => changeTenant(event.target.value)}
                    className={field}
                  >
                    {tenants.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Kitchen
                  <select
                    aria-label="Mobile kitchen"
                    value={location}
                    disabled={!locations.length}
                    onChange={(event) => {
                      reqRef.current++;
                      setData(blank());
                      setLocation(event.target.value);
                      setNotice("");
                    }}
                    className={field}
                  >
                    {!locations.length && (
                      <option value="">
                        {locationPending ? "Loading kitchens…" : "No accessible kitchens"}
                      </option>
                    )}
                    {locations.map((entry) => (
                      <option key={entry.location_id} value={entry.location_id}>
                        {entry.location_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <nav className="md-ops-mobile-areas" aria-label="All authorised operations areas">
                {accessibleSections.map((entry) => {
                  const Icon = sectionIcons[entry.id];
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      aria-current={entry.id === selectedSection ? "page" : undefined}
                      onClick={() => selectArea(entry.id, true)}
                    >
                      <Icon aria-hidden="true" />
                      <span>{entry.label}</span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                  );
                })}
              </nav>
              <div className="md-ops-mobile-account-actions">
                <button
                  type="button"
                  className="md-ops-button md-ops-secondary"
                  disabled={!location || loading}
                  onClick={() => void reload()}
                >
                  <RefreshCcw aria-hidden="true" className="size-4" />
                  {loading ? "Refreshing…" : "Refresh workspace"}
                </button>
                <Link to="/" className="md-ops-button md-ops-secondary">
                  <Store aria-hidden="true" className="size-4" /> Public website
                </Link>
                <button
                  type="button"
                  className="md-ops-button md-ops-secondary"
                  onClick={() => void signOut()}
                >
                  <LogOut aria-hidden="true" className="size-4" /> Sign out
                </button>
              </div>
            </div>
          </StaffMobileSheet>
        </>
      )}
    </div>
  );
}
