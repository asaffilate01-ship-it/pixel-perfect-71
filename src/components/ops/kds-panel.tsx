import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChefHat,
  Clock3,
  LockKeyhole,
  PackageCheck,
  RefreshCw,
  Search,
  StickyNote,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { PwaInstallCard } from "@/components/pwa-install-card";
import { StaffAlertControls, useStaffAlerts } from "./staff-alerts";
import type { OpsPermission } from "@/lib/mealdeck-ops-access";
import { OpsRequestError, opsRpc } from "@/lib/mealdeck-ops-browser";
import { parseKdsBoard, parseKdsMutation, type KdsBoard, type KdsOrder } from "@/lib/mealdeck-kds";
import { formatPackingBagName } from "@/lib/mealdeck-packing-name";
import {
  KDS_STAGES,
  KDS_STAGE_LABELS,
  groupKdsItems,
  kdsOrderStage,
  nextKdsOrderAction,
  type KdsOrderStage as Stage,
  type KdsOrderAction as Action,
} from "@/lib/mealdeck-kds-presentation";

const POLL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 12_000;
const STALE_AFTER_MS = 45_000;
const control = "md-ops-field min-w-0";
const button = "md-ops-button";

type Props = {
  tenantId: string;
  locationId: string;
  can: (permission: OpsPermission) => boolean;
};
type FeedState = "loading" | "connected" | "stale" | "access_blocked" | "setup_required";
type StageFilter = "all" | Stage;

const stageLabels = KDS_STAGE_LABELS;
const stageStyles: Record<Stage, { badge: string; border: string }> = {
  new: { badge: "md-ops-soft md-ops-text", border: "md-ops-stage-new" },
  accepted: { badge: "bg-sky-100 text-sky-900", border: "md-ops-stage-packing" },
  preparing: { badge: "bg-amber-100 text-amber-900", border: "md-ops-stage-preparing" },
  ready_to_pack: { badge: "bg-emerald-100 text-emerald-900", border: "md-ops-stage-ready" },
  ready_for_handover: { badge: "md-ops-inverse", border: "md-ops-stage-sealed" },
  done: { badge: "bg-emerald-100 text-emerald-900", border: "md-ops-stage-ready" },
};
const fulfilmentLabels: Record<KdsOrder["fulfilment"], string> = {
  delivery: "Delivery",
  pickup: "Collection",
  curbside: "Kerbside",
  dine_in: "Dine in",
};

function matchesSearch(order: KdsOrder, query: string): boolean {
  const term = query.trim().toLocaleLowerCase("en-GB");
  if (!term) return true;
  return [
    order.display_code,
    ...order.items.flatMap((item) => [item.item_name, item.brand_name, ...item.modifiers]),
  ].some((value) => value.toLocaleLowerCase("en-GB").includes(term));
}

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
      opsRpc<unknown>("mealdeck_ops_kds_board_v2", {
        p_tenant: tenantId,
        p_location: locationId,
      }).catch((reason: unknown) => {
        // A rolling deployment may still have the original feed. Keep active
        // work available, but never pretend that missing Done history is empty.
        if (reason instanceof OpsRequestError && reason.code === "unconfigured")
          return opsRpc<unknown>("mealdeck_ops_kds_board", {
            p_tenant: tenantId,
            p_location: locationId,
          });
        throw reason;
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
    return parseKdsBoard(raw, { tenantId, locationId });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Scope remounting also protects callers that do not supply their own React key. */
export function OpsKdsPanel(props: Props) {
  return <ScopedKitchenBoard key={`${props.tenantId}:${props.locationId}`} {...props} />;
}

function ScopedKitchenBoard({ tenantId, locationId, can }: Props) {
  const alerts = useStaffAlerts("kds", `${tenantId}:${locationId}`);
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
  const [sealConfirmation, setSealConfirmation] = useState<string | null>(null);
  const mounted = useRef(false);
  const request = useRef(0);
  const reading = useRef(false);
  const mutating = useRef(false);
  const accessBlocked = useRef(false);
  const boardRef = useRef<KdsBoard | null>(null);
  const actionButtons = useRef(new Map<string, HTMLButtonElement>());
  const orderCards = useRef(new Map<string, HTMLElement>());
  const stageControl = useRef<HTMLSelectElement>(null);
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
    alerts.observe(
      board?.orders.map((order) => order.order_id) ?? [],
      fresh && board?.readiness === "ready",
    );
  }, [board, fresh, alerts.observe]);
  const canChange = can("orders.status") && fresh && board?.readiness === "ready" && !pendingOrder;
  const counts = useMemo(() => {
    const result = Object.fromEntries(KDS_STAGES.map((stage) => [stage, 0])) as Record<
      Stage,
      number
    >;
    for (const order of [...(board?.orders ?? []), ...(board?.completed_orders ?? [])])
      result[kdsOrderStage(order)]++;
    return result;
  }, [board]);
  const visibleOrders = useMemo(
    () =>
      (filter === "done" ? (board?.completed_orders ?? []) : (board?.orders ?? [])).filter(
        (order) =>
          (filter === "all" || kdsOrderStage(order) === filter) && matchesSearch(order, query),
      ),
    [board, filter, query],
  );

  async function updateOrder(order: KdsOrder, action: Action) {
    if (
      !canChange ||
      mutating.current ||
      !order.routing_complete ||
      order.order_status === "fulfilled"
    )
      return;
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
        `${order.display_code} · ${action.status === "accepted" ? "Accepted · receipt queued" : action.status === "completed" ? "Done · handover confirmed" : action.target === "item" ? "Item checklist updated" : action.status === "preparing" ? "Preparation started" : action.status === "ready" ? "Ready to pack" : action.status === "packing" ? "Packing started" : "Ready for handover"}.`,
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
            setNotice(`${order.display_code} was updated. Reconnect to see its latest stage.`);
          window.requestAnimationFrame(() => {
            const focusTarget =
              actionButtons.current.get(order.order_id) ??
              orderCards.current.get(order.order_id) ??
              stageControl.current;
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
      className="min-w-0 space-y-3"
      data-testid="mealdeck-kds-board"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="mealdeck-kitchen-title" className="sr-only">
          Kitchen orders
        </h2>
        {board?.readiness === "ready" ? (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Kitchen order counts">
            {KDS_STAGES.map((stage) => (
              <Count
                key={stage}
                label={stageLabels[stage]}
                value={counts[stage]}
                tone={stageStyles[stage].badge}
                selected={filter === stage}
                onClick={() => setFilter(stage)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm font-semibold md-ops-muted">
            All brands together. One card per order.
          </p>
        )}
        <div
          className="flex items-center gap-1.5 text-xs font-semibold md-ops-muted"
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
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}
          </span>
        </div>
      </header>

      <StaffAlertControls alerts={alerts} kind="kds" />
      {board?.readiness === "ready" && (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,15rem)_auto]">
            <label className="relative col-span-2 min-w-0 sm:col-span-1">
              <span className="sr-only">Find an order, dish or brand</span>
              <Search
                className="pointer-events-none absolute left-3 top-3.5 size-4 md-ops-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find order, dish or brand"
                className={`${control} md-ops-field-search w-full`}
              />
            </label>
            <label className="min-w-0">
              <span className="sr-only">Show orders at this stage</span>
              <select
                ref={stageControl}
                value={filter}
                onChange={(event) => setFilter(event.target.value as StageFilter)}
                className={`${control} w-full`}
              >
                <option value="all">All active orders ({board.orders.length})</option>
                {KDS_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stageLabels[stage]} ({counts[stage]})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing || !!pendingOrder}
              className={`${button} md-ops-secondary`}
              aria-label="Refresh kitchen orders"
              title="Refresh kitchen orders"
            >
              <RefreshCw
                className={`size-4 ${refreshing ? "motion-safe:animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </>
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
      {board?.readiness === "ready" && board.remaining_order_count > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Showing the oldest {board.orders.length} orders. {board.remaining_order_count} more will
          appear as orders leave the kitchen.
        </p>
      )}
      {board?.readiness === "ready" && filter === "done" && (
        <p
          className="rounded-xl border md-ops-border md-ops-paper p-3 text-sm md-ops-muted"
          role="status"
        >
          {board.completed_history_available
            ? `Done shows confirmed handovers from the last 24 hours. ${board.remaining_completed_count ? `${board.remaining_completed_count} older completed orders are in order history.` : "Completed orders are read-only."}`
            : "Done history is not connected yet. Active kitchen orders are still available; an administrator must apply the KDS history update."}
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
      ) : visibleOrders.length ? (
        <div
          className="grid min-w-0 items-start gap-4 md:grid-cols-2 xl:grid-cols-3"
          aria-label="Kitchen orders"
        >
          {visibleOrders.map((order) => {
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
                disabled={!canChange || stage === "done"}
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
                    label: "Confirm handover & mark done",
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
          })}
        </div>
      ) : (
        <StateCard
          icon={<ChefHat className="size-8" />}
          title={
            filter === "done"
              ? board.completed_history_available
                ? "No completed orders in this view"
                : "Done history needs setup"
              : board.orders.length
                ? "No orders match this view"
                : stale
                  ? "Waiting for the latest kitchen board"
                  : "Kitchen clear"
          }
        >
          <p>
            {filter === "done"
              ? "Orders move here only after handover is confirmed."
              : board.orders.length
                ? "Try another order number, dish or stage."
                : stale
                  ? "Reconnect before checking whether new orders have arrived."
                  : "New orders will appear here after kitchen release."}
          </p>
          {(filter !== "all" || query) && (
            <button
              type="button"
              className={`${button} md-ops-secondary mt-5`}
              onClick={() => {
                setFilter("all");
                setQuery("");
              }}
            >
              Show all orders
            </button>
          )}
        </StateCard>
      )}
      <PwaInstallCard appName="MealDeck Kitchen" />
    </section>
  );
}

function Count({
  label,
  value,
  tone,
  selected,
  onClick,
}: {
  label: string;
  value: number;
  tone: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full border md-ops-border px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${tone} ${selected ? "ring-2 ring-current" : ""}`}
    >
      <span className="text-xs font-semibold">{label}</span>
      <strong className="font-display text-lg font-black leading-none tabular-nums">{value}</strong>
    </button>
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

function KitchenOrderCard({
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
  const totalItems = groups.reduce(
    (sum, group) => sum + group.items.reduce((count, item) => count + item.quantity, 0),
    0,
  );
  const elapsedUntil =
    stage === "done" && order.completed_at ? Date.parse(order.completed_at) : now;
  return (
    <article
      ref={cardRef}
      tabIndex={-1}
      aria-labelledby={`kds-order-${order.order_id}`}
      className={`md-ops-ticket min-w-0 overflow-hidden border md-ops-border border-t-4 md-ops-paper outline-none ${stageStyles[stage].border}`}
      data-testid="kds-order-card"
      data-order-id={order.order_id}
      data-stage={stage}
    >
      <header className="md-ops-ticket-heading border-b md-ops-divider px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            id={`kds-order-${order.order_id}`}
            className="min-w-0 break-words font-display text-2xl font-black tracking-tight md-ops-ink"
          >
            {order.display_code}
          </h3>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${stageStyles[stage].badge}`}
          >
            {stageLabels[stage]}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold md-ops-muted">
          <span>{fulfilmentLabels[order.fulfilment]}</span>
          <span>
            {totalItems} {totalItems === 1 ? "item" : "items"}
          </span>
          {order.group_order && (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" aria-hidden="true" />
              Group order
            </span>
          )}
          <span
            className="ml-auto inline-flex items-center gap-1 tabular-nums"
            title="Time since kitchen release"
          >
            <Clock3 className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Time in kitchen: </span>
            {elapsedLabel(order.released_at, elapsedUntil)}
          </span>
        </div>
      </header>
      <div className="space-y-3 px-4 py-3">
        <div className="flex flex-wrap gap-2 text-xs font-bold md-ops-text">
          <span className="rounded-md border md-ops-border px-2 py-1">
            {order.cutlery_requested ? "Include cutlery" : "No cutlery requested"}
          </span>
          {order.vehicle && (
            <span className="rounded-md border md-ops-border px-2 py-1">
              {order.vehicle.colour} {order.vehicle.make} · Reg ends{" "}
              {order.vehicle.registrationLast4}
            </span>
          )}
        </div>
        {stage === "ready_to_pack" && order.pass?.status === "packing" && (
          <p className="text-sm font-bold md-ops-text">
            Packing in progress — check all named bags.
          </p>
        )}
        {stage === "done" && order.completed_at && (
          <p className="text-xs md-ops-muted">
            Handover confirmed at{" "}
            {new Date(order.completed_at).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/London",
            })}{" "}
            UK time.
          </p>
        )}
        {order.accepted_at && stage !== "done" && (
          <p className="text-xs md-ops-muted">
            {order.items.filter((item) => item.status === "ready").length} of {order.items.length}{" "}
            lines ready · tick each item and its extras.
          </p>
        )}
        {order.notes && <Note label="Order note" text={order.notes} />}
        {groups.map((group) => (
          <section key={group.key} aria-label={`${group.name} items`}>
            <h4 className="md-ops-ticket-brand mb-1.5 border-b md-ops-border pb-1 text-xs font-black uppercase tracking-[0.12em]">
              {group.name}
            </h4>
            <ul className="space-y-3">
              {group.items.map((item) => (
                <li
                  key={item.order_item_id}
                  className={`min-w-0 ${item.parent_checkout_line_id ? "ml-5 border-l-2 md-ops-border pl-3" : ""}`}
                >
                  <div className="flex items-start gap-2.5">
                    <label className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border md-ops-border">
                      <input
                        type="checkbox"
                        className="size-6 accent-emerald-700"
                        checked={item.status === "ready"}
                        aria-label={`Ready: ${item.quantity} ${item.item_name}`}
                        disabled={
                          disabled ||
                          !order.accepted_at ||
                          order.preparation_status === "queued" ||
                          order.pass?.status === "packing" ||
                          stage === "ready_for_handover" ||
                          stage === "done" ||
                          !order.routing_complete
                        }
                        onChange={(event) => onItemReady(item.order_item_id, event.target.checked)}
                      />
                    </label>
                    <span
                      className="md-ops-ticket-quantity grid min-h-7 min-w-7 shrink-0 place-items-center rounded-md px-1 text-sm font-black tabular-nums"
                      aria-label={`Quantity ${item.quantity}`}
                    >
                      {item.quantity}×
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-base font-bold leading-6 md-ops-ink">
                        {item.item_name}
                      </p>
                      {item.parent_checkout_line_id && (
                        <p className="text-xs font-semibold md-ops-muted">
                          Extra from {item.brand_name} · with the item above
                        </p>
                      )}
                      {!!item.bags?.length && (
                        <p className="mt-1 break-words text-xs font-bold md-ops-text">
                          {item.bags
                            .map((bag) => `${formatPackingBagName(bag)}: ${bag.quantity}×`)
                            .join(" · ")}
                        </p>
                      )}
                      {item.unit_pence != null && (
                        <p className="mt-1 text-xs md-ops-muted">
                          £{(item.unit_pence / 100).toFixed(2)} each · £
                          {((item.quantity * item.unit_pence) / 100).toFixed(2)} total
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
                          className="mt-1.5 space-y-1 text-sm leading-5 md-ops-text"
                          aria-label={`Choices for ${item.item_name}`}
                        >
                          {item.modifiers.map((modifier, index) => (
                            <li key={`${index}:${modifier}`} className="flex items-start gap-1.5">
                              <span
                                className="mt-2 size-1 shrink-0 rounded-full md-ops-dot"
                                aria-hidden="true"
                              />
                              <span className="min-w-0 break-words">
                                {modifier}
                                {item.modifier_details?.[index] && (
                                  <span className="ml-1 text-xs md-ops-muted">
                                    {" "}
                                    · {item.modifier_details[index].quantity_per_parent}× each
                                    {item.modifier_details[index].price_delta_pence
                                      ? ` · +£${(item.modifier_details[index].price_delta_pence / 100).toFixed(2)}`
                                      : " · included"}
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {item.notes && (
                        <div className="mt-2">
                          <Note label="Item note" text={item.notes} />
                        </div>
                      )}
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
        {stage === "done" ? (
          <p className="flex min-h-11 items-center justify-center gap-2 text-sm font-bold md-ops-muted">
            <Check className="size-5" aria-hidden="true" /> Done · handover confirmed
          </p>
        ) : order.pass?.status === "ready_for_handoff" ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (/^\d{4}$/.test(handoffCode) && !disabled) onHandoff(handoffCode);
            }}
          >
            <label className="block text-sm font-semibold md-ops-text">
              Confirm the customer’s four-digit order number
              <input
                className="md-ops-field mt-2 w-full text-center text-xl tracking-[.3em]"
                aria-label={`Collection code for ${order.display_code}`}
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
              {saving ? "Confirming…" : "Confirm handover & mark done"}
            </button>
          </form>
        ) : confirmingSeal ? (
          <div
            className="space-y-3"
            role="group"
            aria-label={`Confirm packed order ${order.display_code}`}
            onKeyDown={(event) => {
              if (event.key === "Escape") onCancelSeal();
            }}
          >
            <p className="text-sm font-semibold leading-5 md-ops-text">
              Check every item, drink, sauce and extra is packed in the correct named bag before
              marking ready for handover.
            </p>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
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
                Confirm packed — ready for handover
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
            aria-label={`${action.label} · ${order.display_code}`}
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
            {stage === "ready_for_handover" ? (
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
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-950">
      <StickyNote className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-5">
        <strong className="font-bold">{label}: </strong>
        {text}
      </p>
    </div>
  );
}
