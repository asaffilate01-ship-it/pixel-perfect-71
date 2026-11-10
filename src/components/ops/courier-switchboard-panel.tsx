import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw, Truck } from "lucide-react";
import { z } from "zod";
import { opsRpc } from "@/lib/mealdeck-ops-browser";
import {
  COURIER_PROVIDERS,
  COURIER_PROVIDER_LABELS,
  type CourierProvider,
} from "@/lib/mealdeck-courier-orchestration";

const rowSchema = z.strictObject({
  provider: z.enum(COURIER_PROVIDERS),
  enabled: z.boolean(),
  connected: z.boolean(),
  setupRequired: z.boolean(),
  availability: z.literal("not_quoted"),
});
const responseSchema = z.strictObject({
  providers: z.array(rowSchema).length(5),
  automatedDispatchReady: z.boolean(),
});
type Board = z.infer<typeof responseSchema>;

/**
 * Switches are persisted by a staff.manage-guarded RPC. Enabling an unconfigured
 * external provider does not claim coverage, fabricate a fare or book a driver.
 * Actual quoting and booking require approved server-side provider adapters.
 */
export function OpsCourierSwitchboardPanel({
  tenantId, locationId, canManage,
}: { tenantId: string; locationId: string; canManage: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [board, setBoard] = useState<Board | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setBusy("refresh");
    setError("");
    try {
      const data = await opsRpc<unknown>("mealdeck_ops_courier_switchboard", {
        p_tenant: tenantId, p_location: locationId,
      });
      const checked = responseSchema.safeParse(data);
      if (!checked.success) throw new Error("The courier switchboard did not return a verified configuration.");
      setBoard(checked.data);
    } catch (reason) {
      setBoard(null);
      setError(reason instanceof Error ? reason.message : "Courier routing is unavailable.");
    } finally {
      setBusy(null);
    }
  }, [tenantId, locationId]);

  useEffect(() => { if (expanded) void refresh(); }, [expanded, refresh]);

  async function toggle(provider: CourierProvider, enabled: boolean) {
    if (!canManage || busy) return;
    setBusy(provider);
    setError(""); setNotice("");
    try {
      const data = await opsRpc<unknown>("mealdeck_ops_courier_set_enabled", {
        p_tenant: tenantId, p_location: locationId, p_provider: provider, p_enabled: enabled,
      });
      const checked = responseSchema.safeParse(data);
      if (!checked.success) throw new Error("Courier provider update could not be confirmed.");
      setBoard(checked.data);
      setNotice(COURIER_PROVIDER_LABELS[provider] + (enabled ? " enabled for future live comparisons." : " disabled for new requests."));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Switch update failed; refresh before retrying.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="md-ops-card rounded-2xl border p-4" aria-label="Delivery provider switches">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Truck size={22} aria-hidden="true" />
          <div>
            <h3 className="font-display text-lg font-black md-ops-ink">Delivery providers</h3>
            <p className="text-xs md-ops-muted">Luton · compare only genuine quotes from switched-on couriers</p>
          </div>
        </div>
        <button type="button" className="md-ops-button md-ops-secondary"
          aria-expanded={expanded} aria-controls="mealdeck-courier-switchboard"
          onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Hide providers" : "Manage courier switches"}
        </button>
      </header>
      {expanded && (
        <div id="mealdeck-courier-switchboard" className="mt-4 space-y-3">
          <p className="text-sm md-ops-muted">
            Each provider can be switched on or off independently. A switched-on provider without
            approved credentials and a valid live quote is never eligible for dispatch.
            Your own drivers must be approved and on shift. No automatic third-party bookings
            are enabled until their production APIs and booking callbacks are commissioned.
          </p>
          <button type="button" className="md-ops-button md-ops-secondary" onClick={() => void refresh()}
            disabled={busy !== null}><RefreshCw size={16} /> Refresh provider status</button>
          {error && <p className="md-ops-status md-ops-status-error" role="alert">{error}</p>}
          {notice && <p role="status" className="md-ops-status"><Check size={16} /> {notice}</p>}
          {!board && !error && <p role="status">Checking the authorised provider switches…</p>}
          {board && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {COURIER_PROVIDERS.map((provider) => {
                  const state = board.providers.find((item) => item.provider === provider);
                  if (!state) return null;
                  return (
                    <div key={provider} className="rounded-xl border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="md-ops-ink">{COURIER_PROVIDER_LABELS[provider]}</strong>
                        <button type="button" role="switch"
                          aria-label={COURIER_PROVIDER_LABELS[provider] + " enabled"}
                          aria-checked={state.enabled}
                          disabled={!canManage || busy !== null}
                          className={state.enabled ? "md-ops-button md-ops-primary" : "md-ops-button md-ops-secondary"}
                          onClick={() => void toggle(provider, !state.enabled)}>
                          {busy === provider ? "Saving…" : state.enabled ? "On" : "Off"}
                        </button>
                      </div>
                      <p className="text-xs md-ops-muted">
                        {provider === "own_fleet"
                          ? state.connected
                            ? "Approved driver currently on shift. A live cost quote and job acceptance are still required."
                            : "No approved MealDeck driver currently available on shift."
                          : "Requires an approved live API connection, quote and production booking access."}
                      </p>
                      {state.enabled && !state.connected && (
                        <p role="status" className="text-xs font-semibold md-ops-muted">
                          Enabled switch · not connected, so not eligible for dispatch
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-sm md-ops-muted">
                Automatic booking is {board.automatedDispatchReady ? "ready" : "not commissioned"}.
                Orders continue through verified payment, kitchen preparation and sealed handover
                before any courier can be booked. Existing active delivery assignments are not cancelled by a switch.
              </p>
            </>
          )}
          {!canManage && <p className="text-sm md-ops-muted">Only a manager with staff management permission can change providers.</p>}
        </div>
      )}
    </section>
  );
}
