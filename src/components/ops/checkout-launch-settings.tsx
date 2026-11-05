import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  Pause,
  Power,
  RefreshCw,
  Save,
} from "lucide-react";
import { opsRpc } from "@/lib/mealdeck-ops-browser";
import { MEALDECK_LAUNCH_DAYS } from "@/lib/mealdeck-launch-schedule";
import {
  kitchenAcceptsNewOrders,
  parseKitchenAvailabilityState,
  type KitchenAvailabilityState,
} from "@/lib/mealdeck-kitchen-availability";

const AVAILABILITY_OPTIONS = [
  { state: "online", action: "Online", label: "Online", icon: CheckCircle2 },
  { state: "busy", action: "Busy", label: "Busy", icon: Clock3 },
  { state: "paused", action: "Pause", label: "Paused", icon: Pause },
  { state: "closed", action: "Closed", label: "Closed", icon: Power },
] as const;

type LaunchSettings = {
  enabled: boolean;
  availabilityState: KitchenAvailabilityState;
  openingStartDate: string | null;
  collectionEstimateMinutes: number | null;
};

function parseSettings(value: unknown): LaunchSettings {
  if (!value || typeof value !== "object")
    throw new Error("Launch settings could not be verified.");
  const input = value as Record<string, unknown>;
  const date = input["openingStartDate"];
  const minutes = input["collectionEstimateMinutes"];
  const availabilityState = parseKitchenAvailabilityState(input["availabilityState"]);
  if (
    !availabilityState ||
    typeof input["enabled"] !== "boolean" ||
    input["enabled"] !== kitchenAcceptsNewOrders(availabilityState) ||
    !(date === null || (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))) ||
    !(
      minutes === null ||
      (Number.isInteger(minutes) && (minutes as number) >= 5 && (minutes as number) <= 180)
    )
  )
    throw new Error("Launch settings could not be verified.");
  return {
    enabled: input["enabled"],
    availabilityState,
    openingStartDate: date as string | null,
    collectionEstimateMinutes: minutes as number | null,
  };
}

/** Owner/admin convenience only; both RPCs independently enforce current scope. */
export function CheckoutLaunchSettings({
  tenantId,
  locationId,
}: {
  tenantId: string;
  locationId: string;
}) {
  const scope = JSON.stringify([tenantId, locationId]);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [messageScope, setMessageScope] = useState<string | null>(null);
  const [settings, setSettings] = useState<LaunchSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingState, setPendingState] = useState<KitchenAvailabilityState | null>(null);
  const [estimate, setEstimate] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const saving = useRef(false);
  const loaded = loadedScope === scope && settings !== null;
  const currentState = loaded ? settings.availabilityState : null;
  const currentLabel = AVAILABILITY_OPTIONS.find((option) => option.state === currentState)?.label;

  const populate = (value: LaunchSettings, savedScope: string) => {
    setSettings(value);
    setEstimate(
      value.collectionEstimateMinutes === null ? "" : String(value.collectionEstimateMinutes),
    );
    setLoadedScope(savedScope);
  };

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoadedScope(null);
    setMessageScope(scope);
    setError("");
    setNotice("");
    try {
      const result = await opsRpc("mealdeck_ops_checkout_settings", {
        p_tenant: tenantId,
        p_location: locationId,
      });
      if (request === generation.current) populate(parseSettings(result), scope);
    } catch (reason) {
      if (request === generation.current)
        setError(
          reason instanceof Error ? reason.message : "Launch settings are unavailable. Try again.",
        );
    }
  }, [tenantId, locationId, scope]);

  useEffect(() => {
    setBusy(false);
    setPendingState(null);
    saving.current = false;
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [refresh]);

  async function saveAvailability(nextState: KitchenAvailabilityState, estimateOnly = false) {
    if (saving.current || !loaded) return;
    // Stopping orders must not depend on an unfinished pickup-time edit.
    const needsEstimate = estimateOnly || kitchenAcceptsNewOrders(nextState);
    const minutes = needsEstimate && estimate.trim() !== "" ? Number(estimate) : null;
    if (
      needsEstimate &&
      (minutes === null || !Number.isInteger(minutes) || minutes < 5 || minutes > 180)
    ) {
      setMessageScope(scope);
      setNotice("");
      setError("Enter a pickup estimate between 5 and 180 minutes before saving.");
      return;
    }
    const request = generation.current;
    saving.current = true;
    setBusy(true);
    setPendingState(nextState);
    setMessageScope(scope);
    setError("");
    setNotice("");
    try {
      const result = estimateOnly
        ? await opsRpc("mealdeck_ops_update_collection_estimate", {
            p_tenant: tenantId,
            p_location: locationId,
            p_collection_estimate_minutes: minutes,
          })
        : await opsRpc("mealdeck_ops_update_checkout_availability", {
            p_tenant: tenantId,
            p_location: locationId,
            p_state: nextState,
            p_collection_estimate_minutes: minutes,
          });
      if (request === generation.current) {
        const saved = parseSettings(result);
        populate(saved, scope);
        const savedLabel = AVAILABILITY_OPTIONS.find(
          (option) => option.state === saved.availabilityState,
        )!.label;
        setNotice(
          estimateOnly
            ? `Pickup estimate saved. Kitchen status remains ${savedLabel}.`
            : `${savedLabel} saved. ${kitchenAcceptsNewOrders(saved.availabilityState) ? "New orders are accepted only when readiness and opening hours allow." : "New orders are stopped. Existing paid orders continue through the kitchen."}`,
        );
      }
    } catch (reason) {
      if (request === generation.current)
        setError(
          reason instanceof Error ? reason.message : "The settings were not saved. Try again.",
        );
    } finally {
      if (request === generation.current) {
        saving.current = false;
        setBusy(false);
        setPendingState(null);
      }
    }
  }

  function saveEstimate(event: FormEvent) {
    event.preventDefault();
    if (currentState) void saveAvailability(currentState, true);
  }

  return (
    <section className="md-ops-card p-5 space-y-4" aria-labelledby="checkout-launch-settings-title">
      <div className="flex items-start gap-3">
        <CalendarDays className="size-5 shrink-0 mt-1" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold md-ops-text" id="checkout-launch-settings-title">
            Luton kitchen status
          </h2>
          <p className="text-sm md-ops-muted mt-1">
            Collection and kerbside only. These settings apply to the selected kitchen.
          </p>
        </div>
      </div>
      {messageScope === scope && error && (
        <p className="md-ops-status md-ops-status-error" role="alert">
          {error}
        </p>
      )}
      {messageScope === scope && notice && (
        <p className="md-ops-status md-ops-status-success" role="status">
          {notice}
        </p>
      )}
      {!loaded ? (
        <button type="button" className="md-ops-button" onClick={() => void refresh()}>
          <RefreshCw size={16} aria-hidden="true" />
          {messageScope === scope && error ? "Retry settings" : "Loading launch settings…"}
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm md-ops-text" aria-live="polite">
              Saved kitchen state: <strong>{currentLabel}</strong>
              {settings.collectionEstimateMinutes !== null && (
                <span className="md-ops-muted">
                  {" "}
                  · {settings.collectionEstimateMinutes} min pickup
                </span>
              )}
            </p>
            <button
              type="button"
              className="md-ops-button"
              disabled={busy}
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </button>
          </div>
          <fieldset disabled={busy} aria-describedby="checkout-availability-help">
            <legend className="text-sm font-semibold md-ops-text mb-2">
              Change kitchen status
            </legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {AVAILABILITY_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = currentState === option.state;
                return (
                  <button
                    key={option.state}
                    type="button"
                    aria-pressed={selected}
                    className={
                      "md-ops-button min-h-20 flex-col justify-center gap-2 " +
                      (selected ? "md-ops-primary" : "")
                    }
                    onClick={() => {
                      void saveAvailability(option.state);
                    }}
                  >
                    {busy && pendingState === option.state ? (
                      <Loader2
                        size={22}
                        className="animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    ) : (
                      <Icon size={22} aria-hidden="true" />
                    )}
                    <span>{option.action}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          {busy && (
            <p className="text-sm md-ops-muted" role="status">
              Saving kitchen settings…
            </p>
          )}
          <p className="text-sm md-ops-muted" id="checkout-availability-help">
            Online and Busy accept new orders only when the kitchen is ready and opening hours
            allow. Pause and Closed stop new orders and do not resume automatically. Existing paid
            orders continue on the kitchen display.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 text-sm md-ops-text">
              <strong>Confirmed opening hours · UK time</strong>
              <dl className="grid gap-2">
                {MEALDECK_LAUNCH_DAYS.map((day) => (
                  <div key={day.date} className="flex flex-wrap justify-between gap-2">
                    <dt>{day.label}</dt>
                    <dd>{day.hoursLabel}</dd>
                  </div>
                ))}
              </dl>
              <span className="text-xs md-ops-muted">
                The 30% opening offer and guest checkout run during these hours. Guest orders earn
                no loyalty points. The kitchen remains closed between each day's opening hours.
              </span>
              <p className="text-xs md-ops-muted">
                From 9 November, choose Closed outside service until regular opening hours are
                configured. Closing remains a manual action after launch weekend.
              </p>
            </div>
            <form onSubmit={saveEstimate}>
              <fieldset disabled={busy} className="grid gap-3">
                <label className="grid gap-2 text-sm md-ops-text">
                  <span className="inline-flex items-center gap-2">
                    <Clock3 size={16} aria-hidden="true" />
                    Approximate pickup time
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={5}
                      max={180}
                      step={1}
                      required
                      className="md-ops-field min-w-0 flex-1"
                      value={estimate}
                      onChange={(event) => setEstimate(event.target.value)}
                    />
                    <span>minutes</span>
                  </div>
                  <span className="text-xs md-ops-muted">
                    Enter 5–180 minutes before choosing Online or Busy. Busy shows this estimate;
                    set the actual pickup time your kitchen can meet. Timing starts from confirmed
                    payment, and ready status still comes from the team.
                  </span>
                </label>
                <button className="md-ops-button" type="submit">
                  <Save size={17} aria-hidden="true" />
                  Save estimate
                </button>
                <p className="text-xs md-ops-muted">
                  Saving an estimate keeps the current kitchen state.
                </p>
              </fieldset>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
