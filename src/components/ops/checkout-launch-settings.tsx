import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Clock3, RefreshCw, Save } from "lucide-react";
import { opsRpc } from "@/lib/mealdeck-ops-browser";

type LaunchSettings = {
  enabled: boolean;
  openingStartDate: string | null;
  collectionEstimateMinutes: number | null;
};

function parseSettings(value: unknown): LaunchSettings {
  if (!value || typeof value !== "object")
    throw new Error("Launch settings could not be verified.");
  const input = value as Record<string, unknown>;
  const date = input["openingStartDate"];
  const minutes = input["collectionEstimateMinutes"];
  if (
    typeof input["enabled"] !== "boolean" ||
    !(date === null || (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))) ||
    !(
      minutes === null ||
      (Number.isInteger(minutes) && (minutes as number) >= 5 && (minutes as number) <= 180)
    )
  )
    throw new Error("Launch settings could not be verified.");
  return {
    enabled: input["enabled"],
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
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [openingDate, setOpeningDate] = useState("");
  const [estimate, setEstimate] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const saving = useRef(false);

  const populate = (value: LaunchSettings) => {
    setEnabled(value.enabled);
    setOpeningDate(value.openingStartDate ?? "");
    setEstimate(
      value.collectionEstimateMinutes === null ? "" : String(value.collectionEstimateMinutes),
    );
    setLoaded(true);
  };

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoaded(false);
    setError("");
    setNotice("");
    try {
      const result = await opsRpc("mealdeck_ops_checkout_settings", {
        p_tenant: tenantId,
        p_location: locationId,
      });
      if (request === generation.current) populate(parseSettings(result));
    } catch (reason) {
      if (request === generation.current)
        setError(
          reason instanceof Error ? reason.message : "Launch settings are unavailable. Try again.",
        );
    }
  }, [tenantId, locationId]);

  useEffect(() => {
    setBusy(false);
    saving.current = false;
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [refresh]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current || !loaded) return;
    const minutes = estimate === "" ? null : Number(estimate);
    if (
      (minutes !== null && (!Number.isInteger(minutes) || minutes < 5 || minutes > 180)) ||
      (enabled && minutes === null)
    ) {
      setError("Set a pickup estimate between 5 and 180 minutes before opening checkout.");
      return;
    }
    const request = generation.current;
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await opsRpc("mealdeck_ops_update_checkout_settings", {
        p_tenant: tenantId,
        p_location: locationId,
        p_enabled: enabled,
        p_opening_start_date: openingDate || null,
        p_collection_estimate_minutes: minutes,
      });
      if (request === generation.current) {
        populate(parseSettings(result));
        setNotice(
          "Launch settings saved. Customers can pay only when the menu and payment connection are also ready.",
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
      }
    }
  }

  return (
    <section className="md-ops-card p-5 space-y-4" aria-labelledby="checkout-launch-settings-title">
      <div className="flex items-start gap-3">
        <CalendarDays className="size-5 shrink-0 mt-1" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold md-ops-text" id="checkout-launch-settings-title">
            Luton launch &amp; checkout
          </h2>
          <p className="text-sm md-ops-muted mt-1">
            Collection and kerbside only. These settings apply to the selected kitchen.
          </p>
        </div>
      </div>
      {error && (
        <p className="md-ops-status md-ops-status-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="md-ops-status md-ops-status-success" role="status">
          {notice}
        </p>
      )}
      {!loaded ? (
        <button type="button" className="md-ops-button" onClick={() => void refresh()}>
          <RefreshCw size={16} aria-hidden="true" />
          {error ? "Retry settings" : "Loading launch settings…"}
        </button>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm md-ops-text">
              Opening offer starts
              <input
                type="date"
                className="md-ops-field"
                value={openingDate}
                onChange={(event) => setOpeningDate(event.target.value)}
              />
              <span className="text-xs md-ops-muted">
                30% off for three consecutive UK calendar days, from midnight on this date. Leave
                empty to keep the offer unscheduled.
              </span>
            </label>
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
                  className="md-ops-field min-w-0 flex-1"
                  value={estimate}
                  onChange={(event) => setEstimate(event.target.value)}
                />
                <span>minutes</span>
              </div>
              <span className="text-xs md-ops-muted">
                Shown from confirmed payment. Set a realistic kitchen estimate; ready status still
                comes from the team.
              </span>
            </label>
            <label className="flex items-start gap-3 sm:col-span-2 text-sm md-ops-text">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="mt-1 size-4"
              />
              <span>
                <strong>Accept online orders when ready</strong>
                <span className="block text-xs md-ops-muted mt-1">
                  Switch off to pause new checkout. Existing payments and orders continue to update.
                  This cannot bypass menu publication or payment verification.
                </span>
              </span>
            </label>
          </fieldset>
          <button className="md-ops-button md-ops-primary" type="submit" disabled={busy}>
            <Save size={17} aria-hidden="true" />
            {busy ? "Saving…" : "Save launch settings"}
          </button>
        </form>
      )}
    </section>
  );
}
