import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  ChefHat,
  Clock3,
  Columns3,
  LayoutGrid,
  LockKeyhole,
  PackageCheck,
  RefreshCw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  StickyNote,
  Utensils,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { PwaInstallCard } from "@/components/pwa-install-card";
import { StaffAlertControls, StaffSoundUnlock, useStaffAlerts } from "./staff-alerts";
import { StaffMobileNav, StaffMobileSheet } from "./staff-mobile-navigation";
import type { OpsPermission } from "@/lib/mealdeck-ops-access";
import { OpsRequestError, opsRpc } from "@/lib/mealdeck-ops-browser";
import { parseKdsMutation, type KdsOrder } from "@/lib/mealdeck-kds";
import {
  parseKdsWorkflowBoard,
  type KdsWorkflowBoard as KdsBoard,
} from "@/lib/mealdeck-kds-workflow";
import { KdsCompletedCard } from "./kds-completed-card";
import { KdsPickupDetails } from "./kds-pickup-details";
import { KdsMealComponents } from "./kds-meal-components";
import { KdsTicketGrid } from "./kds-ticket-grid";
import { KdsOrderNavigator } from "./kds-order-navigator";
import { kdsFlavourHighlight } from "@/lib/mealdeck-kds-flavour";
import {
  kdsModifierChoiceText,
  kdsModifierGroupLabel,
  kdsSouvanoMainState,
} from "@/lib/mealdeck-kds-dish-clarity";
import { formatPackingBagName } from "@/lib/mealdeck-packing-name";
import { isOrderNumber, orderDisplayNumber } from "@/lib/mealdeck-order-number";
import {
  KDS_STAGE_LABELS,
  groupKdsItems,
  kdsOrderStage,
  nextKdsOrderAction,
  type KdsOrderStage as Stage,
  type KdsOrderAction as Action,
} from "@/lib/mealdeck-kds-presentation";
import {
  KDS_ACTIVE_STAGES,
  KDS_FULFILMENT_LABELS as fulfilmentLabels,
  kdsClockTime,
  kdsTicketProgress,
  selectCompletedKdsOrders,
  selectKdsOrders,
  type KdsFulfilmentFilter,
  type KdsSort,
  type KdsStageFilter as StageFilter,
  type KdsView,
} from "@/lib/mealdeck-kds-view";
import { readKdsToolsPreference, saveKdsToolsPreference } from "@/lib/mealdeck-kds-preferences";
import "./kds-workspace.css";

const POLL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 12_000;
const STALE_AFTER_MS = 45_000;
const control = "md-ops-field min-w-0";
const button = "md-ops-button";

type Props = {
  tenantId: string;
  locationId: string;
  can: (permission: OpsPermission) => boolean;
  mobileNavigation?: boolean;
};
type FeedState = "loading" | "connected" | "stale" | "access_blocked" | "setup_required";

const stageLabels = KDS_STAGE_LABELS;
const stageStyles: Record<Stage, { badge: string; border: string }> = {
  queued: { badge: "md-ops-soft md-ops-text", border: "md-ops-stage-new" },
  accepted: { badge: "bg-violet-100 text-violet-900", border: "md-ops-stage-new" },
  preparing: { badge: "bg-amber-100 text-amber-900", border: "md-ops-stage-preparing" },
  ready: { badge: "bg-emerald-100 text-emerald-900", border: "md-ops-stage-ready" },
  sealed: { badge: "md-ops-inverse", border: "md-ops-stage-sealed" },
  done: { badge: "md-ops-soft md-ops-text", border: "md-ops-stage-ready" },
};
function elapsedLabel(since: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? `${minutes}:${String(seconds % 60).padStart(2, "0")}`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function isAccessError(reason: unknown): boolean {
  return (
    reason instanceof OpsRequestError &&
    (reason.code === "forbidden" || reason.code === "unauthenticated")
  );
}

function safeMessage(reason: unknown, fallback: string): string {
  return reason instanceof OpsRequestError ? reason.message : fallback;
}

/** Only reads have a timeout. A timed-out mutation must never be auto-retried. */
async function readBoard(tenantId: string, locationId: string): Promise<KdsBoard> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([
      opsRpc<unknown>("mealdeck_ops_kds_workflow_board", {
        p_tenant: tenantId,
        p_location: locationId,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new OpsRequestError(
                "unavailable",
                "The kitchen connection is taking too long. Refresh to check the latest orders.",
              ),
            ),
          REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
    return parseKdsWorkflowBoard(raw, { tenantId, locationId });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Scope remounting also protects callers that do not supply their own React key. */
export function OpsKdsPanel(props: Props) {
  return <ScopedKitchenBoard key={`${props.tenantId}:${props.locationId}`} {...props} />;
}

function ScopedKitchenBoard({ tenantId, locationId, can, mobileNavigation = false }: Props) {
  const alerts = useStaffAlerts("kds", `${tenantId}:${locationId}`);
  const { observe: observeAlerts } = alerts;
  const [board, setBoard] = useState<KdsBoard | null>(null);
  const [feedState, setFeedState] = useState<FeedState>("loading");
  const [feedError, setFeedError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [pendingOrder, setPendingOrder] = useState<string | null>(null);
  const [filter, setFilter] = useState<StageFilter>("all");
  const [query, setQuery] = useState("");
  const [fulfilment, setFulfilment] = useState<KdsFulfilmentFilter>("all");
  const [sort, setSort] = useState<KdsSort>("oldest");
  const [completedSort, setCompletedSort] = useState<KdsSort>("newest");
  const [view, setView] = useState<KdsView>("tickets");
  const [sealConfirmation, setSealConfirmation] = useState<string | null>(null);
  const mounted = useRef(false);
  const request = useRef(0);
  const reading = useRef(false);
  const mutating = useRef(false);
  const accessBlocked = useRef(false);
  const boardRef = useRef<KdsBoard | null>(null);
  const actionButtons = useRef(new Map<string, HTMLButtonElement>());
  const orderCards = useRef(new Map<string, HTMLElement>());
  const toolbarControl = useRef<HTMLButtonElement>(null);
  const invalidateRead = useCallback(() => {
    request.current++;
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (mutating.current) return false;
    const current = ++request.current;
    reading.current = true;
    setRefreshing(true);
    try {
      const next = await readBoard(tenantId, locationId);
      if (!mounted.current || current !== request.current) return false;
      boardRef.current = next;
      accessBlocked.current = false;
      setBoard(next);
      setFeedState(next.readiness === "ready" ? "connected" : "setup_required");
      setFeedError("");
      setLastSync(Date.now());
      setNow(Date.now());
      return true;
    } catch (reason) {
      if (!mounted.current || current !== request.current) return false;
      if (isAccessError(reason)) {
        accessBlocked.current = true;
        boardRef.current = null;
        setBoard(null);
        setLastSync(null);
        setSealConfirmation(null);
        setNotice("");
        setActionError("");
        setQuery("");
        setFilter("all");
        setFulfilment("all");
        setFeedState("access_blocked");
      } else if (reason instanceof OpsRequestError && reason.code === "unconfigured") {
        boardRef.current = null;
        setBoard(null);
        setLastSync(null);
        setFeedState("setup_required");
      } else {
        setFeedState("stale");
      }
      setFeedError(
        safeMessage(
          reason,
          "The latest kitchen orders could not be verified. Refresh to reconnect.",
        ),
      );
      return false;
    } finally {
      if (mounted.current && current === request.current) {
        reading.current = false;
        setRefreshing(false);
      }
    }
  }, [tenantId, locationId]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const poll = window.setInterval(() => {
      if (
        !reading.current &&
        !mutating.current &&
        !accessBlocked.current &&
        document.visibilityState === "visible"
      ) {
        void refresh();
      }
    }, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const resume = () => {
      if (document.visibilityState === "visible" && !accessBlocked.current) {
        setNow(Date.now());
        void refresh();
      }
    };
    const goOnline = () => {
      setOnline(true);
      if (!accessBlocked.current) void refresh();
    };
    const goOffline = () => {
      setOnline(false);
      setFeedState((previous) =>
        previous === "access_blocked" || previous === "setup_required" ? previous : "stale",
      );
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      mounted.current = false;
      invalidateRead();
      boardRef.current = null;
      window.clearInterval(poll);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [refresh, invalidateRead]);

  const fresh =
    online && feedState === "connected" && lastSync !== null && now - lastSync < STALE_AFTER_MS;
  useEffect(() => {
    observeAlerts(
      board?.orders.map((order) => order.order_id) ?? [],
      fresh && board?.readiness === "ready",
    );
  }, [board, fresh, observeAlerts]);
  const canChange = can("orders.status") && fresh && board?.readiness === "ready" && !pendingOrder;
  const counts = useMemo(() => {
    const result: Record<Stage, number> = {
      queued: 0,
      accepted: 0,
      preparing: 0,
      ready: 0,
      sealed: 0,
      done: board?.completed_orders.length ?? 0,
    };
    for (const order of board?.orders ?? []) result[kdsOrderStage(order)]++;
    return result;
  }, [board]);
  const visibleOrders = useMemo(
    () => selectKdsOrders(board?.orders ?? [], { query, fulfilment, sort, stage: filter }),
    [board, filter, query, fulfilment, sort],
  );

  const completedOrders = useMemo(
    () =>
      selectCompletedKdsOrders(board?.completed_orders ?? [], {
        query,
        fulfilment,
        sort: completedSort,
      }),
    [board, query, fulfilment, completedSort],
  );

  async function updateOrder(order: KdsOrder, action: Action) {
    if (!canChange || mutating.current || !order.routing_complete) return;
    const currentOrder = boardRef.current?.orders.find(
      (candidate) => candidate.order_id === order.order_id,
    );
    if (!currentOrder || currentOrder.version !== order.version) {
      setActionError("This order has changed. Refresh and check its current stage.");
      void refresh();
      return;
    }
    const expectedVersion = action.target === "pass" ? order.pass?.version : order.version;
    if (!expectedVersion) return;
    const orderNumber = orderDisplayNumber(order.order_number, order.display_code);
    const reference = `${isOrderNumber(order.order_number) ? "Order" : "Collection code"} ${orderNumber}`;
    mutating.current = true;
    invalidateRead();
    reading.current = false;
    setRefreshing(false);
    setPendingOrder(order.order_id);
    setActionError("");
    setNotice("");
    setSealConfirmation(null);
    let saved = false;
    try {
      const names = {
        accept: "mealdeck_ops_kds_accept_order",
        order: "mealdeck_ops_kds_transition_order",
        pass: "mealdeck_ops_kds_transition_pass",
        item: "mealdeck_ops_kds_set_item_ready",
        handoff: "mealdeck_ops_kds_complete_handoff",
      };
      const raw = await opsRpc<unknown>(names[action.target], {
        p_tenant: tenantId,
        p_location: locationId,
        p_order: order.order_id,
        p_expected_version: expectedVersion,
        ...(action.target === "order" || action.target === "pass"
          ? { p_status: action.status }
          : {}),
        ...(action.target === "item" ? { p_item: action.itemId, p_ready: action.ready } : {}),
        ...(action.target === "handoff" ? { p_code: action.code } : {}),
      });
      parseKdsMutation(raw, { orderId: order.order_id, status: action.status });
      saved = true;
      if (!mounted.current) return;
      setNotice(
        `${reference} · ${action.status === "accepted" ? "Accepted · receipt queued" : action.status === "completed" ? "Done · handover confirmed" : action.target === "item" ? "Item checklist updated" : action.status === "preparing" ? "Preparation started" : action.status === "ready" ? "Ready to pack" : action.status === "packing" ? "Packing started" : "Ready for handover"}.`,
      );
    } catch (reason) {
      if (!mounted.current) return;
      setActionError(
        safeMessage(
          reason,
          "The update was not confirmed. Refresh to check the order before trying again.",
        ),
      );
      if (isAccessError(reason)) {
        accessBlocked.current = true;
        boardRef.current = null;
        setBoard(null);
        setLastSync(null);
        setNotice("");
        setActionError("");
        setQuery("");
        setFilter("all");
        setFulfilment("all");
        setSealConfirmation(null);
        setFeedState("access_blocked");
        setFeedError(safeMessage(reason, "Your kitchen access needs to be checked."));
      } else {
        setFeedState("stale");
      }
    } finally {
      mutating.current = false;
      if (mounted.current) {
        const synced = !accessBlocked.current && (await refresh());
        if (mounted.current) {
          setPendingOrder(null);
          if (saved && !synced && !accessBlocked.current)
            setNotice(`${reference} was updated. Reconnect to see its latest stage.`);
          window.requestAnimationFrame(() => {
            const focusTarget =
              actionButtons.current.get(order.order_id) ??
              orderCards.current.get(order.order_id) ??
              toolbarControl.current;
            focusTarget?.focus();
          });
        }
      }
    }
  }

  const showSetup = feedState === "setup_required" || board?.readiness === "setup_required";
  const stale = !!board && !showSetup && !fresh;

  return (
    <section
      aria-labelledby="mealdeck-kitchen-title"
      className={`md-kds-workspace min-w-0 space-y-4${mobileNavigation ? " md-staff-has-mobile-nav" : ""}`}
      data-mobile-navigation={mobileNavigation}
      data-testid="mealdeck-kds-board"
    >
      <header className="md-kds-heading">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2
              id="mealdeck-kitchen-title"
              className="font-display text-2xl font-black tracking-tight md-ops-ink"
            >
              Kitchen orders
            </h2>
          </div>
        </div>
        <div
          className="md-kds-connection flex items-center gap-2 text-xs font-semibold md-ops-muted"
          aria-live="off"
        >
          {fresh ? (
            <Wifi className="size-4 text-emerald-700" aria-hidden="true" />
          ) : (
            <WifiOff className="size-4" aria-hidden="true" />
          )}
          <span>
            {!online
              ? "Offline"
              : showSetup
                ? "Setup needed"
                : feedState === "loading"
                  ? "Connecting…"
                  : feedState === "access_blocked"
                    ? "Access needs checking"
                    : fresh
                      ? "Connected"
                      : "Reconnecting"}
            {lastSync !== null && (
              <span className="ml-2 font-normal">
                · Updated{" "}
                {new Date(lastSync).toLocaleTimeString("en-GB", {
                  timeZone: "Europe/London",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}
          </span>
        </div>
      </header>

      {board?.readiness === "ready" && (
        <KdsWorkspaceControls
          mobileNavigation={mobileNavigation}
          activeCount={board.orders.length}
          counts={counts}
          filter={filter}
          onFilterChange={setFilter}
          toolbarControl={(element) => {
            toolbarControl.current = element;
          }}
          preferencesScope={`${tenantId}:${locationId}`}
          soundEnabled={alerts.enabled}
          extraTools={
            <>
              <StaffAlertControls alerts={{ ...alerts, notice: 0, audioError: "" }} kind="kds" />
              <PwaInstallCard appName="MealDeck Kitchen" />
            </>
          }
          query={query}
          onQueryChange={setQuery}
          fulfilment={fulfilment}
          onFulfilmentChange={setFulfilment}
          sort={filter === "done" ? completedSort : sort}
          onSortChange={filter === "done" ? setCompletedSort : setSort}
          view={view}
          onViewChange={setView}
          visibleCount={filter === "done" ? completedOrders.length : visibleOrders.length}
          refreshing={refreshing}
          refreshDisabled={refreshing || !!pendingOrder}
          onRefresh={() => void refresh()}
          onClear={() => {
            setFilter("all");
            setQuery("");
            setFulfilment("all");
            window.requestAnimationFrame(() => toolbarControl.current?.focus());
          }}
        />
      )}

      <StaffSoundUnlock alerts={alerts} />
      {alerts.notice > 0 && (
        <div className="md-kds-new-orders" role="status">
          <Bell className="size-4" aria-hidden="true" />
          <strong>
            {alerts.notice} new {alerts.notice === 1 ? "order" : "orders"}
          </strong>
          <button type="button" onClick={alerts.clearNotice} className="md-kds-clear">
            Dismiss alert
          </button>
        </div>
      )}
      {alerts.audioError && (
        <p role="status" className="text-sm md-ops-muted">
          {alerts.audioError}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900"
        >
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {notice}
        </p>
      )}
      {actionError && feedState !== "access_blocked" && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {actionError}
        </p>
      )}
      {stale && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
        >
          <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <span>
            <strong>Showing the last confirmed orders.</strong>{" "}
            {feedError || "The connection needs to refresh."} Changes are paused until the latest
            board is loaded.
          </span>
        </p>
      )}
      {board?.readiness === "ready" && board.held_order_count > 0 && (
        <p className="rounded-xl border md-ops-border md-ops-paper p-3 text-sm md-ops-muted">
          {board.held_order_count} {board.held_order_count === 1 ? "order is" : "orders are"}{" "}
          waiting to be released to the kitchen.
        </p>
      )}
      {board?.readiness === "ready" && filter !== "done" && board.remaining_order_count > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Showing the oldest {board.orders.length} orders. {board.remaining_order_count} more will
          appear as orders leave the kitchen.
        </p>
      )}
      {board?.readiness === "ready" && !can("orders.status") && (
        <p className="flex items-center gap-2 text-sm md-ops-muted">
          <LockKeyhole className="size-4" aria-hidden="true" />
          Your role can view this kitchen board. Order changes require kitchen access.
        </p>
      )}

      {showSetup ? (
        <StateCard icon={<ChefHat className="size-8" />} title="Kitchen connection needs setup">
          <p>
            {feedError ||
              "Ask your administrator to finish connecting and verifying the approved kitchen order feed."}
          </p>
          <p className="mt-2">
            Once connected, orders from every MealDeck brand will appear together on this screen.
          </p>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void refresh()}
            className={`${button} md-ops-primary mt-5`}
          >
            Check connection
          </button>
        </StateCard>
      ) : feedState === "access_blocked" ? (
        <StateCard icon={<LockKeyhole className="size-8" />} title="Kitchen access needs checking">
          <p>{feedError}</p>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void refresh()}
            className={`${button} md-ops-primary mt-5`}
          >
            Check access again
          </button>
        </StateCard>
      ) : !board ? (
        <StateCard
          icon={
            feedState === "loading" ? (
              <ChefHat className="size-8" />
            ) : (
              <WifiOff className="size-8" />
            )
          }
          title={
            feedState === "loading" ? "Loading kitchen orders…" : "Kitchen connection unavailable"
          }
        >
          <p role="status">
            {feedState === "loading" ? "Checking the latest orders for this kitchen." : feedError}
          </p>
          {feedState !== "loading" && (
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void refresh()}
              className={`${button} md-ops-primary mt-5`}
            >
              Try again
            </button>
          )}
        </StateCard>
      ) : filter === "done" ? (
        <div className="space-y-3">
          <p className="text-sm md-ops-muted">
            Confirmed handovers from the last 12 hours. Completed orders are read-only and are not
            printed again.
            {board.completed_remaining_order_count > 0 &&
              ` Showing the latest ${board.completed_orders.length}; ${board.completed_remaining_order_count} more are available in order history.`}
          </p>
          {completedOrders.length ? (
            <>
              <KdsOrderNavigator
                orders={completedOrders.map((order) => ({
                  id: order.order_id,
                  headingId: `kds-completed-${order.order_id}`,
                  reference: `${isOrderNumber(order.order_number) ? "Order" : "Collection code"} ${orderDisplayNumber(order.order_number, order.display_code)}`,
                  stage: "Done",
                  quantity: order.items.reduce((total, item) => total + item.quantity, 0),
                }))}
              />
              <KdsTicketGrid label="Completed kitchen orders">
                {completedOrders.map((order) => (
                  <KdsCompletedCard key={order.order_id} order={order} />
                ))}
              </KdsTicketGrid>
            </>
          ) : (
            <StateCard
              icon={<PackageCheck className="size-8" />}
              title={
                query || fulfilment !== "all"
                  ? "No completed orders match"
                  : "No completed handovers yet"
              }
            >
              <p>
                {query || fulfilment !== "all"
                  ? "Try another search or clear the fulfilment filter."
                  : "Orders appear here only after the handover has been confirmed."}
              </p>
            </StateCard>
          )}
        </div>
      ) : visibleOrders.length ? (
        <KdsOrderCollection
          orders={visibleOrders}
          view={view}
          filter={filter}
          renderOrder={(order) => {
            const stage = kdsOrderStage(order);
            const action = nextKdsOrderAction(order);
            const confirmingSeal = sealConfirmation === `${order.order_id}:${order.pass?.version}`;
            return (
              <KitchenOrderCard
                key={order.order_id}
                order={order}
                stage={stage}
                now={now}
                action={action}
                disabled={!canChange}
                saving={pendingOrder === order.order_id}
                confirmingSeal={confirmingSeal}
                actionRef={(element) => {
                  if (element) actionButtons.current.set(order.order_id, element);
                  else actionButtons.current.delete(order.order_id);
                }}
                cardRef={(element) => {
                  if (element) orderCards.current.set(order.order_id, element);
                  else orderCards.current.delete(order.order_id);
                }}
                onItemReady={(itemId, ready) => {
                  const allReady =
                    ready &&
                    order.items.every(
                      (item) => item.order_item_id === itemId || item.status === "ready",
                    );
                  void updateOrder(order, {
                    target: "item",
                    itemId,
                    ready,
                    status: allReady ? "ready" : "preparing",
                    label: "Update item",
                  });
                }}
                onHandoff={(code) =>
                  void updateOrder(order, {
                    target: "handoff",
                    code,
                    status: "completed",
                    label: "Mark done",
                  })
                }
                onAction={() => {
                  if (!action) return;
                  if (action.status === "sealed")
                    setSealConfirmation(`${order.order_id}:${order.pass?.version}`);
                  else void updateOrder(order, action);
                }}
                onConfirmSeal={() => {
                  if (action?.status === "sealed") void updateOrder(order, action);
                }}
                onCancelSeal={() => {
                  setSealConfirmation(null);
                  window.requestAnimationFrame(() =>
                    actionButtons.current.get(order.order_id)?.focus(),
                  );
                }}
              />
            );
          }}
        />
      ) : (
        <StateCard
          icon={<ChefHat className="size-8" />}
          title={
            board.orders.length
              ? "No orders match this view"
              : stale
                ? "Waiting for the latest kitchen board"
                : "Kitchen clear"
          }
        >
          <p>
            {board.orders.length
              ? "Try another order, dish, name or note, or clear the stage and fulfilment filters."
              : stale
                ? "Reconnect before checking whether new orders have arrived."
                : "New orders will appear here after kitchen release."}
          </p>
          {(filter !== "all" || query || fulfilment !== "all") && (
            <button
              type="button"
              className={`${button} md-ops-secondary mt-5`}
              onClick={() => {
                setFilter("all");
                setQuery("");
                setFulfilment("all");
              }}
            >
              Show all orders
            </button>
          )}
        </StateCard>
      )}
      {mobileNavigation && board?.readiness !== "ready" && (
        <StaffMobileNav
          label="Kitchen navigation"
          items={[
            { id: "tickets", label: "Tickets", icon: LayoutGrid, disabled: true },
            { id: "board", label: "Board", icon: Columns3, disabled: true },
            { id: "tools", label: "Tools", icon: SlidersHorizontal, disabled: true },
            {
              id: "refresh",
              label: "Refresh",
              icon: RefreshCw,
              disabled: refreshing || !!pendingOrder,
              onClick: () => void refresh(),
            },
          ]}
        />
      )}
    </section>
  );
}

/** Presentation-only controls; filtering never changes an order or its contents. */
export function KdsWorkspaceControls({
  mobileNavigation = false,
  activeCount,
  counts,
  filter,
  onFilterChange,
  toolbarControl,
  preferencesScope = "default",
  soundEnabled,
  extraTools,
  query,
  onQueryChange,
  fulfilment,
  onFulfilmentChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  visibleCount,
  refreshing,
  refreshDisabled,
  onRefresh,
  onClear,
}: {
  mobileNavigation?: boolean;
  activeCount: number;
  counts: Record<Stage, number>;
  filter: StageFilter;
  onFilterChange: (value: StageFilter) => void;
  toolbarControl?: (element: HTMLButtonElement | null) => void;
  preferencesScope?: string;
  soundEnabled?: boolean;
  extraTools?: ReactNode;
  query: string;
  onQueryChange: (value: string) => void;
  fulfilment: KdsFulfilmentFilter;
  onFulfilmentChange: (value: KdsFulfilmentFilter) => void;
  sort: KdsSort;
  onSortChange: (value: KdsSort) => void;
  view: KdsView;
  onViewChange: (value: KdsView) => void;
  visibleCount: number;
  refreshing: boolean;
  refreshDisabled: boolean;
  onRefresh: () => void;
  onClear: () => void;
}) {
  const toolsId = useId();
  const mobileToolsId = useId();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const allStagesControl = useRef<HTMLButtonElement>(null);
  const mobileToolsControl = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setToolsOpen(readKdsToolsPreference(preferencesScope));
  }, [preferencesScope]);
  const hasFilters = filter !== "all" || !!query.trim() || fulfilment !== "all";
  const history = filter === "done";
  const totalCount = history ? counts.done : activeCount;
  const toolProps = {
    filter,
    query,
    onQueryChange,
    fulfilment,
    onFulfilmentChange,
    sort,
    onSortChange,
    view,
    onViewChange,
    extraTools,
  };

  function selectMobileView(next: KdsView) {
    onViewChange(next);
    window.requestAnimationFrame(() =>
      allStagesControl.current?.scrollIntoView({
        block: "start",
        inline: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      }),
    );
  }

  return (
    <div className="md-kds-controls" data-mobile-navigation={mobileNavigation}>
      <div className="md-kds-tools-bar">
        <div className="md-kds-tools-summary">
          <p className="md-kds-summary-count" role="status">
            <strong>{visibleCount}</strong>
            {visibleCount !== totalCount && <> of {totalCount}</>}{" "}
            {history ? "recent handovers" : "active orders"}
          </p>
          {history ? (
            <span className="md-kds-summary-detail">
              <LockKeyhole className="size-3.5" aria-hidden="true" /> Done · read-only
            </span>
          ) : (
            <span className="md-kds-summary-detail">
              {view === "tickets" ? "Tickets" : "Stage lanes"}
            </span>
          )}
          <span className="md-kds-summary-detail">
            {sort === "oldest"
              ? history
                ? "Earliest handover"
                : "Oldest first"
              : history
                ? "Latest handover"
                : "Newest first"}
          </span>
          {soundEnabled !== undefined && (
            <span className="md-kds-summary-detail">Sound {soundEnabled ? "on" : "off"}</span>
          )}
        </div>
        <div className="md-kds-tools-actions">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshDisabled}
            className={`${button} md-ops-secondary md-kds-refresh`}
            aria-label="Refresh kitchen orders"
          >
            <RefreshCw
              className={`size-4 ${refreshing ? "motion-safe:animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className={`${button} md-ops-secondary md-kds-tools-toggle`}
            aria-expanded={toolsOpen}
            aria-controls={toolsId}
            onClick={() => {
              const next = !toolsOpen;
              setToolsOpen(next);
              saveKdsToolsPreference(preferencesScope, next);
            }}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {toolsOpen ? "Hide tools" : "Show tools"}
            <ChevronDown className="md-kds-tools-chevron size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="md-kds-stage-rail" role="group" aria-label="Filter kitchen orders by stage">
        <button
          ref={(element) => {
            allStagesControl.current = element;
            toolbarControl?.(element);
          }}
          type="button"
          className="md-kds-stage-chip"
          data-stage="all"
          aria-pressed={filter === "all"}
          onClick={() => onFilterChange("all")}
        >
          <span>All active</span>
          <strong>{activeCount}</strong>
        </button>
        {(Object.keys(stageLabels) as Stage[]).map((stage) => (
          <button
            key={stage}
            type="button"
            className="md-kds-stage-chip"
            data-stage={stage}
            aria-pressed={filter === stage}
            onClick={() => onFilterChange(filter === stage ? "all" : stage)}
            title={stage === "done" ? "Confirmed handovers from the last 12 hours" : undefined}
          >
            <span>
              <span className="md-kds-stage-dot" aria-hidden="true" />
              {stageLabels[stage]}
            </span>
            <strong>{counts[stage]}</strong>
          </button>
        ))}
      </div>
      {hasFilters && (
        <div className="md-kds-applied-filters" aria-label="Applied kitchen filters">
          {filter !== "all" && <span>Stage: {stageLabels[filter]}</span>}
          {fulfilment !== "all" && <span>{fulfilmentLabels[fulfilment]}</span>}
          {query.trim() && (
            <span className="md-kds-applied-search" title={query.trim()}>
              Search: “{query.trim()}”
            </span>
          )}
          <button type="button" onClick={onClear} className="md-kds-clear">
            <X className="size-3.5" aria-hidden="true" /> Clear filters
          </button>
        </div>
      )}
      <div className="md-kds-tools-panel" id={toolsId} hidden={!toolsOpen}>
        <KdsWorkspaceTools {...toolProps} />
      </div>
      {mobileNavigation && (
        <>
          <StaffMobileNav
            label="Kitchen navigation"
            hidden={mobileToolsOpen}
            items={[
              {
                id: "tickets",
                label: "Tickets",
                icon: LayoutGrid,
                active: history || view === "tickets",
                badge: totalCount,
                onClick: () => selectMobileView("tickets"),
              },
              {
                id: "board",
                label: "Board",
                icon: Columns3,
                active: !history && view === "stages",
                disabled: history,
                onClick: () => selectMobileView("stages"),
              },
              {
                id: "tools",
                label: "Tools",
                icon: SlidersHorizontal,
                badge: Number(!!query.trim()) + Number(fulfilment !== "all"),
                expanded: mobileToolsOpen,
                controls: mobileToolsId,
                buttonRef: (element) => {
                  mobileToolsControl.current = element;
                },
                onClick: () => setMobileToolsOpen(true),
              },
              {
                id: "refresh",
                label: "Refresh",
                icon: RefreshCw,
                disabled: refreshDisabled,
                onClick: onRefresh,
              },
            ]}
          />
          <StaffMobileSheet
            id={mobileToolsId}
            open={mobileToolsOpen}
            onOpenChange={setMobileToolsOpen}
            title="Kitchen tools"
            description="Search orders, adjust your view and manage kitchen alerts."
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const trigger = mobileToolsControl.current;
              const target = trigger?.getClientRects().length ? trigger : allStagesControl.current;
              target?.focus({ preventScroll: target === trigger });
            }}
          >
            <div className="md-kds-workspace md-kds-mobile-tools">
              <KdsWorkspaceTools {...toolProps} mobile />
              <button
                type="button"
                className={`${button} md-ops-primary md-kds-mobile-tools-done`}
                onClick={() => setMobileToolsOpen(false)}
              >
                Show {visibleCount} {history ? "handovers" : "orders"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </StaffMobileSheet>
        </>
      )}
    </div>
  );
}

/** Shared controlled fields keep mobile and desktop on the same current filters. */
export function KdsWorkspaceTools({
  mobile = false,
  filter,
  query,
  onQueryChange,
  fulfilment,
  onFulfilmentChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  extraTools,
}: {
  mobile?: boolean;
  filter: StageFilter;
  query: string;
  onQueryChange: (value: string) => void;
  fulfilment: KdsFulfilmentFilter;
  onFulfilmentChange: (value: KdsFulfilmentFilter) => void;
  sort: KdsSort;
  onSortChange: (value: KdsSort) => void;
  view: KdsView;
  onViewChange: (value: KdsView) => void;
  extraTools?: ReactNode;
}) {
  return (
    <>
      <div className="md-kds-toolbar">
        <label className="md-kds-search min-w-0">
          <span className={mobile ? "md-kds-field-label" : "sr-only"}>
            Find an order, dish, brand, bag name, note or vehicle
          </span>
          <span className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-3.5 size-4 md-ops-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Order, dish, name or note"
              className={`${control} md-ops-field-search w-full`}
            />
          </span>
        </label>
        <label className="min-w-0">
          <span className={mobile ? "md-kds-field-label" : "sr-only"}>Filter by fulfilment</span>
          <select
            value={fulfilment}
            onChange={(event) => onFulfilmentChange(event.target.value as KdsFulfilmentFilter)}
            className={`${control} w-full`}
          >
            <option value="all">All fulfilment</option>
            {(Object.keys(fulfilmentLabels) as KdsOrder["fulfilment"][]).map((key) => (
              <option key={key} value={key}>
                {fulfilmentLabels[key]}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <span className={mobile ? "md-kds-field-label" : "sr-only"}>Sort kitchen orders</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as KdsSort)}
            className={`${control} w-full`}
          >
            <option value="oldest">
              {filter === "done" ? "Earliest handover" : "Oldest first"}
            </option>
            <option value="newest">{filter === "done" ? "Latest handover" : "Newest first"}</option>
          </select>
        </label>
      </div>
      {!mobile && filter !== "done" && (
        <div className="md-kds-viewbar">
          <div className="md-kds-view-switch" role="group" aria-label="Kitchen board layout">
            <button
              type="button"
              aria-pressed={view === "tickets"}
              onClick={() => onViewChange("tickets")}
            >
              <LayoutGrid className="size-4" aria-hidden="true" /> Tickets
            </button>
            <button
              type="button"
              aria-pressed={view === "stages"}
              onClick={() => onViewChange("stages")}
            >
              <Columns3 className="size-4" aria-hidden="true" /> Stage lanes
            </button>
          </div>
        </div>
      )}
      {extraTools && <div className="md-kds-extra-tools">{extraTools}</div>}
    </>
  );
}

/** Each order renders once, including all brands, attached extras and bag allocations. */
export function KdsOrderCollection({
  orders,
  view,
  filter,
  renderOrder,
}: {
  orders: KdsOrder[];
  view: KdsView;
  filter: StageFilter;
  renderOrder: (order: KdsOrder) => ReactNode;
}) {
  const navigator = (
    <KdsOrderNavigator
      orders={orders.map((order) => ({
        id: order.order_id,
        headingId: `kds-order-${order.order_id}`,
        reference: `${isOrderNumber(order.order_number) ? "Order" : "Collection code"} ${orderDisplayNumber(order.order_number, order.display_code)}`,
        stage: stageLabels[kdsOrderStage(order)],
        quantity: order.items.reduce((total, item) => total + item.quantity, 0),
      }))}
    />
  );
  if (view === "tickets") {
    return (
      <>
        {navigator}
        <KdsTicketGrid label="Kitchen orders">{orders.map(renderOrder)}</KdsTicketGrid>
      </>
    );
  }
  const stages = KDS_ACTIVE_STAGES.filter((stage) => filter === "all" || filter === stage);
  return (
    <>
      {navigator}
      {stages.length > 1 && (
        <p className="md-kds-mobile-board-hint" aria-hidden="true">
          Swipe to move between stages <ArrowRight className="size-3.5" />
        </p>
      )}
      <div
        className={`md-kds-lanes ${stages.length === 1 ? "md-kds-lanes-single" : ""}`}
        role="region"
        aria-label="Kitchen stage lanes. Scroll horizontally to see each stage."
        tabIndex={0}
      >
        {stages.map((stage) => {
          const laneOrders = orders.filter((order) => kdsOrderStage(order) === stage);
          return (
            <section
              key={stage}
              className="md-kds-lane"
              data-stage={stage}
              aria-labelledby={`kds-lane-${stage}`}
            >
              <header className="md-kds-lane-heading">
                <h3 id={`kds-lane-${stage}`}>
                  <span className="md-kds-stage-dot" aria-hidden="true" />
                  {stageLabels[stage]}
                </h3>
                <span>{laneOrders.length}</span>
              </header>
              <KdsTicketGrid className="md-kds-lane-orders" label={`${stageLabels[stage]} orders`}>
                {laneOrders.length ? (
                  laneOrders.map(renderOrder)
                ) : (
                  <p className="md-kds-lane-empty">No orders in this view</p>
                )}
              </KdsTicketGrid>
            </section>
          );
        })}
      </div>
    </>
  );
}

function StateCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="md-ops-card md-ops-kds-state px-5 py-9 text-center md-ops-muted">
      <div
        className="md-ops-state-mark mx-auto mb-4 flex size-14 items-center justify-center rounded-xl"
        aria-hidden="true"
      >
        {icon}
      </div>
      <h3 className="font-display text-xl font-black md-ops-ink">{title}</h3>
      <div className="mx-auto mt-2 max-w-lg text-sm leading-6">{children}</div>
    </div>
  );
}

export function KitchenOrderCard({
  order,
  stage,
  now,
  action,
  disabled,
  saving,
  confirmingSeal,
  actionRef,
  cardRef,
  onAction,
  onConfirmSeal,
  onCancelSeal,
  onItemReady,
  onHandoff,
}: {
  order: KdsOrder;
  stage: Stage;
  now: number;
  action: Action | null;
  disabled: boolean;
  saving: boolean;
  confirmingSeal: boolean;
  actionRef: (element: HTMLButtonElement | null) => void;
  cardRef: (element: HTMLElement | null) => void;
  onAction: () => void;
  onConfirmSeal: () => void;
  onCancelSeal: () => void;
  onItemReady: (itemId: string, ready: boolean) => void;
  onHandoff: (code: string) => void;
}) {
  const [handoffCode, setHandoffCode] = useState("");
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirmingSeal) confirmButton.current?.focus();
  }, [confirmingSeal]);
  const groups = groupKdsItems(order);
  const progress = kdsTicketProgress(order);
  const orderNumber = orderDisplayNumber(order.order_number, order.display_code);
  const hasOrderNumber = isOrderNumber(order.order_number);
  const referenceLabel = hasOrderNumber ? "Order" : "Collection code";
  const collection = order.fulfilment === "pickup" || order.fulfilment === "curbside";
  return (
    <article
      ref={cardRef}
      tabIndex={-1}
      aria-labelledby={`kds-order-${order.order_id}`}
      className={`md-ops-ticket md-kds-ticket min-w-0 overflow-hidden border md-ops-border border-t-4 md-ops-paper outline-none ${stageStyles[stage].border}`}
      data-testid="kds-order-card"
      data-order-id={order.order_id}
      data-stage={stage}
      aria-busy={saving}
    >
      <header className="md-ops-ticket-heading md-kds-ticket-heading border-b md-ops-divider">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="md-kds-fulfilment">{fulfilmentLabels[order.fulfilment]}</span>
          <span
            className={`md-kds-status rounded-full px-2.5 py-1 text-xs font-bold ${stageStyles[stage].badge}`}
          >
            {stageLabels[stage]}
          </span>
        </div>
        <div className="md-kds-ticket-identity">
          <div className="min-w-0">
            <p className="md-kds-ticket-eyebrow">{referenceLabel}</p>
            <h3 id={`kds-order-${order.order_id}`} className="md-kds-order-number">
              {orderNumber}
            </h3>
          </div>
          <div className="md-kds-ticket-timer" title="Elapsed time since verified kitchen release">
            <span>In kitchen</span>
            <strong aria-label={`Time in kitchen: ${elapsedLabel(order.released_at, now)}`}>
              {elapsedLabel(order.released_at, now)}
            </strong>
          </div>
        </div>
        {hasOrderNumber && (collection || order.pass?.status === "ready_for_handoff") && (
          <p className="md-kds-collection-code">
            <span>Collection code</span>
            <strong>{order.display_code}</strong>
          </p>
        )}
        <div className="md-kds-ticket-meta">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Released at </span>
            <time dateTime={order.released_at}>{kdsClockTime(order.released_at)}</time>
          </span>
          <span>
            {progress.quantity} {progress.quantity === 1 ? "item" : "items"}
          </span>
          {progress.bagCount > 0 && (
            <span>
              {progress.bagCount} {progress.bagCount === 1 ? "bag" : "bags"}
            </span>
          )}
          {order.group_order && (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" aria-hidden="true" />
              Group order
            </span>
          )}
        </div>
      </header>
      <div className="md-kds-ticket-body">
        <KdsPickupDetails
          fulfilment={order.fulfilment}
          pickupContact={order.pickupContact ?? null}
          vehicle={order.vehicle ?? null}
        />
        <div className="md-kds-packing-flags">
          <span
            className={order.cutlery_requested ? "md-kds-cutlery-requested" : "md-kds-cutlery-none"}
          >
            <Utensils className="size-3.5 shrink-0" aria-hidden="true" />
            {order.cutlery_requested ? "Include cutlery" : "No cutlery requested"}
          </span>
        </div>
        {order.accepted_at && (
          <div className="md-kds-progress">
            <div>
              <span>Preparation checklist</span>
              <strong>
                {progress.readyLines} / {progress.totalLines} lines ready
              </strong>
            </div>
            <progress
              value={progress.readyLines}
              max={progress.totalLines}
              aria-label={`Preparation checklist for ${referenceLabel.toLowerCase()} ${orderNumber}: ${progress.readyLines} of ${progress.totalLines} lines ready`}
            />
            <p>Check every dish, drink and extra.</p>
          </div>
        )}
        {order.notes && <Note label="Order note" text={order.notes} />}
        {groups.map((group) => (
          <section
            key={group.key}
            className="md-kds-brand-group"
            aria-label={`${group.name} items`}
          >
            <div className="md-kds-brand-heading">
              <h4 className="md-ops-ticket-brand">{group.name}</h4>
              <span
                aria-label={`${group.items.filter((item) => item.status === "ready").length} of ${group.items.length} lines ready`}
              >
                {group.items.filter((item) => item.status === "ready").length}/{group.items.length}{" "}
                ready
              </span>
            </div>
            <ul className="md-kds-lines">
              {group.items.map((item) => (
                <li
                  key={item.order_item_id}
                  className={`md-kds-line min-w-0 ${item.parent_checkout_line_id ? "md-kds-attached-line" : ""}`}
                  data-ready={item.status === "ready"}
                >
                  <div className="md-kds-line-layout">
                    <label className="md-kds-ready-toggle">
                      <input
                        type="checkbox"
                        className="size-6 accent-emerald-700"
                        checked={item.status === "ready"}
                        aria-label={`Ready: ${item.quantity} ${item.item_name}${item.bags?.length ? ` · ${item.bags.map(formatPackingBagName).join(", ")}` : item.participant_name ? ` · ${item.participant_name}` : ""}`}
                        disabled={
                          disabled ||
                          !order.accepted_at ||
                          order.preparation_status === "queued" ||
                          order.pass?.status === "packing" ||
                          stage === "sealed" ||
                          !order.routing_complete
                        }
                        onChange={(event) => onItemReady(item.order_item_id, event.target.checked)}
                      />
                    </label>
                    <div className="md-kds-line-content">
                      <div className="md-kds-line-title">
                        <span
                          className="md-ops-ticket-quantity md-kds-quantity"
                          aria-label={`Quantity ${item.quantity}`}
                        >
                          {item.quantity}×
                        </span>
                        <p
                          className={kdsSouvanoMainState(item) ? "md-kds-souvano-main" : undefined}
                          data-main-state={kdsSouvanoMainState(item) ?? undefined}
                        >
                          {kdsSouvanoMainState(item) && (
                            <span className="md-kds-souvano-main-label">
                              {kdsSouvanoMainState(item) === "verify-main"
                                ? "VERIFY MAIN — check customer’s selected dish"
                                : "MAIN DISH"}
                            </span>
                          )}
                          <span
                            className={
                              kdsSouvanoMainState(item) ? "md-kds-souvano-main-name" : undefined
                            }
                          >
                            {item.item_name}
                          </span>
                        </p>
                      </div>
                      <div className="md-kds-line-details">
                        {item.parent_checkout_line_id && (
                          <p className="md-kds-extra-label">
                            Extra from {item.brand_name} · with the item above
                          </p>
                        )}
                        {!!item.bags?.length && (
                          <ul
                            className="md-kds-bag-labels"
                            aria-label={`Packing for ${item.item_name}`}
                          >
                            {item.bags.map((bag) => (
                              <li key={bag.number}>
                                <ShoppingBag className="size-3 shrink-0" aria-hidden="true" />
                                <span>{formatPackingBagName(bag)}</span>
                                <strong>{bag.quantity}×</strong>
                              </li>
                            ))}
                          </ul>
                        )}
                        <KdsMealComponents
                          components={item.mealComponents ?? []}
                          quantity={item.quantity}
                        />
                        {item.unit_pence != null && (
                          <p className="md-kds-line-price">
                            <strong>£{(item.unit_pence / 100).toFixed(2)} each</strong>
                            <span> · selected choices included</span>
                            {item.quantity > 1 && (
                              <span>
                                {" "}
                                · £{((item.quantity * item.unit_pence) / 100).toFixed(2)} line total
                              </span>
                            )}
                          </p>
                        )}
                        {order.group_order &&
                          item.participant_name &&
                          !item.bags?.some((bag) => bag.name === item.participant_name) && (
                            <p className="mt-0.5 break-words text-xs font-semibold md-ops-muted">
                              For {item.participant_name}
                            </p>
                          )}
                        {item.modifiers.length > 0 && (
                          <ul
                            className="md-kds-choices"
                            aria-label={`Choices for ${item.item_name}`}
                          >
                            {item.modifiers.map((modifier, index) => {
                              const detail = item.modifier_details?.[index];
                              const priceVariant = detail?.kind === "variant";
                              const groupName = kdsModifierGroupLabel(
                                item,
                                priceVariant ? "Portion & flavour" : detail?.group_name,
                              );
                              const visibleModifier = kdsModifierChoiceText(item, modifier);
                              const flavour = kdsFlavourHighlight(visibleModifier, detail);
                              return (
                                <li
                                  key={`${index}:${modifier}`}
                                  className={flavour ? "md-kds-flavour-choice" : undefined}
                                >
                                  {flavour ? (
                                    <div className="md-kds-flavour-main">
                                      <span className="md-kds-flavour-eyebrow">
                                        {flavour.label}
                                      </span>
                                      <strong className="md-kds-flavour-value">
                                        {flavour.value}
                                      </strong>
                                    </div>
                                  ) : (
                                    <>
                                      <span className="md-kds-choice-mark" aria-hidden="true" />
                                      <span className="min-w-0 break-words">
                                        {groupName &&
                                          !visibleModifier
                                            .toLocaleLowerCase("en-GB")
                                            .startsWith(
                                              `${groupName.toLocaleLowerCase("en-GB")}:`,
                                            ) && (
                                            <span className="md-kds-choice-group">
                                              {groupName}:{" "}
                                            </span>
                                          )}
                                        {visibleModifier}
                                        {detail && !priceVariant && (
                                          <span className="md-kds-choice-detail">
                                            {detail.quantity_per_parent}× each
                                            {item.unit_pence != null && " · included in item price"}
                                          </span>
                                        )}
                                      </span>
                                    </>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {item.notes && (
                          <div className="mt-2">
                            <Note label="Item note" text={item.notes} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!order.routing_complete && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
            This order needs an operations review before preparation can continue.
          </p>
        )}
      </div>
      <footer className="md-ops-ticket-footer border-t md-ops-divider px-4 py-3">
        {!order.accepted_at && order.routing_complete && (
          <p className="md-kds-action-hint">Accepting queues the kitchen receipt once.</p>
        )}
        {order.pass?.status === "packing" && (
          <p className="mb-2 text-sm font-semibold md-ops-muted">
            Packing in progress · check all named bags before handover.
          </p>
        )}
        {order.pass?.status === "ready_for_handoff" ? (
          <form
            className="md-kds-handoff-form space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (/^\d{4}$/.test(handoffCode) && !disabled) onHandoff(handoffCode);
            }}
          >
            <label className="block text-sm font-semibold md-ops-text">
              Enter the customer’s four-digit collection code
              <input
                className="md-ops-field mt-2 w-full text-center text-xl tracking-[.3em]"
                aria-label={
                  hasOrderNumber ? `Collection code for order ${orderNumber}` : "Collection code"
                }
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{4}"
                maxLength={4}
                value={handoffCode}
                onChange={(event) => setHandoffCode(event.target.value.replace(/\D/g, ""))}
                disabled={disabled}
              />
            </label>
            <button
              type="submit"
              className={`${button} md-ops-primary w-full`}
              disabled={disabled || !/^\d{4}$/.test(handoffCode)}
            >
              {saving ? "Confirming…" : "Confirm handover · Mark done"}
            </button>
          </form>
        ) : confirmingSeal ? (
          <div
            className="space-y-3"
            role="group"
            aria-label={`Confirm sealing · ${referenceLabel} ${orderNumber}`}
            onKeyDown={(event) => {
              if (event.key === "Escape") onCancelSeal();
            }}
          >
            <p className="text-sm font-semibold leading-5 md-ops-text">
              Check every item, drink, sauce and requested cutlery. Confirm the named bags are
              packed correctly before marking ready for handover.
            </p>
            <div className="md-kds-seal-actions">
              <button type="button" onClick={onCancelSeal} className={`${button} md-ops-secondary`}>
                Back
              </button>
              <button
                ref={confirmButton}
                type="button"
                disabled={disabled}
                onClick={onConfirmSeal}
                className={`${button} md-ops-primary`}
              >
                <PackageCheck className="size-4 shrink-0" aria-hidden="true" />
                Confirm ready for handover
              </button>
            </div>
          </div>
        ) : action ? (
          <button
            ref={actionRef}
            type="button"
            disabled={disabled || !order.routing_complete}
            onClick={onAction}
            className={`${button} md-ops-primary w-full`}
            aria-label={`${action.label} · ${referenceLabel} ${orderNumber}`}
          >
            {saving ? (
              <RefreshCw className="size-4 motion-safe:animate-spin" aria-hidden="true" />
            ) : action.status === "sealed" ? (
              <PackageCheck className="size-4" aria-hidden="true" />
            ) : (
              <ArrowRight className="size-4" aria-hidden="true" />
            )}
            {saving ? "Saving…" : action.label}
          </button>
        ) : (
          <p className="flex min-h-11 items-center justify-center gap-2 text-center text-sm font-bold md-ops-muted">
            {stage === "sealed" ? (
              <>
                <PackageCheck className="size-5 shrink-0" aria-hidden="true" />
                Ready for handover
              </>
            ) : order.routing_complete ? (
              order.preparation_status === "preparing" ? (
                "Tick each item when ready"
              ) : (
                "Waiting for packing status"
              )
            ) : (
              "Preparation paused"
            )}
          </p>
        )}
      </footer>
    </article>
  );
}

function Note({ label, text }: { label: string; text: string }) {
  return (
    <div className="md-kds-note flex items-start gap-2">
      <StickyNote className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-5">
        <strong className="font-bold">{label}: </strong>
        {text}
      </p>
    </div>
  );
}
