import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCcw } from "lucide-react";
import { opsRpc } from "@/lib/mealdeck-ops-browser";

type KitchenStation = { station_id: string; station_name: string; station_code: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stationsFrom(value: unknown): KitchenStation[] {
  if (!Array.isArray(value)) throw new Error("Kitchen preparation options could not be verified.");
  const seen = new Set<string>();
  return value.map((row: unknown) => {
    const station = row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    if (
      !station ||
      typeof station["station_id"] !== "string" ||
      !uuid.test(station["station_id"]) ||
      seen.has(station["station_id"]) ||
      typeof station["station_name"] !== "string" ||
      !station["station_name"].trim() ||
      typeof station["station_code"] !== "string" ||
      !station["station_code"].trim()
    ) {
      throw new Error("Kitchen preparation options could not be verified.");
    }
    seen.add(station["station_id"]);
    return {
      station_id: station["station_id"],
      station_name: station["station_name"],
      station_code: station["station_code"],
    };
  });
}

/** Mounted with a tenant/location/item key; late replies never enter another editor. */
export function MenuKitchenRoute({
  tenantId,
  locationId,
  itemId,
  disabled,
  canActivate,
  onBusyChange,
}: {
  tenantId: string;
  locationId: string;
  itemId: string;
  disabled: boolean;
  canActivate: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [assigned, setAssigned] = useState<KitchenStation | null>(null);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    setStations([]);
    setSelected("");
    setAssigned(null);
    void opsRpc<unknown>("mealdeck_ops_kitchen_stations", {
      p_tenant: tenantId,
      p_location: locationId,
    })
      .then((raw) => {
        if (request !== generation.current) return;
        const rows = stationsFrom(raw);
        setStations(rows);
        // One shared station is unambiguous. A future multi-station kitchen
        // requires an explicit choice; ordering from the RPC is not authority.
        setSelected(rows.length === 1 ? rows[0]!.station_id : "");
      })
      .catch((reason) => {
        if (request !== generation.current) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Kitchen preparation options could not be loaded.",
        );
      })
      .finally(() => {
        if (request === generation.current) setLoading(false);
      });
    return () => {
      generation.current = request + 1;
      onBusyChange(false);
    };
  }, [tenantId, locationId, itemId, retry, onBusyChange]);

  async function assign() {
    const station = stations.find((entry) => entry.station_id === selected);
    if (disabled || busy || loading || !station || assigned) return;
    const request = generation.current;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const ok = await opsRpc<boolean>("mealdeck_ops_set_station_route", {
        p_tenant: tenantId,
        p_location: locationId,
        p_item: itemId,
        p_station: station.station_id,
        p_enabled: true,
      });
      if (request !== generation.current) return;
      if (ok !== true) throw new Error("The kitchen assignment was not confirmed. Please retry.");
      setAssigned(station);
    } catch (reason) {
      if (request !== generation.current) return;
      setError(
        reason instanceof Error
          ? reason.message
          : "The product could not be assigned to this kitchen.",
      );
    } finally {
      if (request === generation.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }

  return (
    <section
      aria-label="Product kitchen preparation"
      className="rounded-xl border border-amber-200 bg-amber-50/70 p-4"
    >
      <h3 className="font-bold text-slate-900">Prepare in this kitchen</h3>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        Assign this draft product before activating it. All brands stay on the same kitchen display.
      </p>
      {loading ? (
        <p className="mt-3 text-sm text-slate-600" role="status">
          Loading kitchen preparation options…
        </p>
      ) : stations.length ? (
        <div className="mt-3 space-y-3">
          {stations.length === 1 ? (
            <p className="text-sm font-semibold text-slate-800">{stations[0]!.station_name}</p>
          ) : (
            <label className="block text-sm font-semibold text-slate-800">
              Preparation station
              <select
                className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                value={selected}
                disabled={disabled || busy || assigned !== null}
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">Choose a preparation station…</option>
                {stations.map((station) => (
                  <option key={station.station_id} value={station.station_id}>
                    {station.station_name} · {station.station_code}
                  </option>
                ))}
              </select>
            </label>
          )}
          {assigned ? (
            <p role="status" className="flex items-start gap-2 text-sm leading-6 text-green-900">
              <CheckCircle2 className="mt-1 size-4 shrink-0" aria-hidden="true" />
              <span>
                Assigned to {assigned.station_name}.{" "}
                {canActivate
                  ? "Review allergens and modifiers, then activate and save the product."
                  : "Ask staff with a business-wide menu role to activate and save the product."}{" "}
                Customer ordering remains closed.
              </span>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void assign()}
              disabled={disabled || busy || !selected}
              className="min-h-11 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {busy ? "Assigning…" : "Assign to kitchen"}
            </button>
          )}
        </div>
      ) : !error ? (
        <p className="mt-3 text-sm leading-6 text-slate-700">
          No active preparation station is configured for this kitchen. Ask your administrator to
          finish kitchen setup.
        </p>
      ) : null}
      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm leading-6 text-red-800">
          <AlertCircle className="mt-1 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {!loading && (error || stations.length === 0) && (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => setRetry((value) => value + 1)}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50"
        >
          <RefreshCcw className="size-4" aria-hidden="true" /> Reload kitchen options
        </button>
      )}
    </section>
  );
}
