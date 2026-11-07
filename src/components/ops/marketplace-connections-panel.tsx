import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getMealDeckOpsClient } from "@/lib/mealdeck-ops-browser";
import {
  marketplaceConnectionsReportSchema,
  marketplaceConnectionStatus,
  type MarketplaceConnectionsReport,
} from "@/lib/mealdeck-marketplace-connections";

const platforms = [
  { id: "uber_eats", label: "Uber Eats" },
  { id: "just_eat", label: "Just Eat" },
] as const;
const actionLabels = {
  accept: "Accept",
  preparing: "Preparing",
  ready: "Ready",
  handover: "Handover",
} as const;

export function MarketplaceConnectionReport({ report }: { report: MarketplaceConnectionsReport }) {
  return (
    <div className="space-y-4">
      {!report.runtimeEnabled && (
        <p className="md-ops-status" role="status">
          The marketplace bridge is paused. Use the original merchant screens for new orders and
          status updates.
        </p>
      )}
      <ul className="divide-y divide-current/10">
        {platforms.map((platform) => {
          const connections = report.connections.filter(
            (connection) => connection.platform === platform.id,
          );
          return (
            <li key={platform.id} className="py-4 first:pt-0 last:pb-0">
              <h3 className="font-semibold md-ops-text">{platform.label}</h3>
              {connections.length === 0 ? (
                <p className="mt-1 text-sm md-ops-muted">
                  Needs setup — no store connection has been commissioned.
                </p>
              ) : (
                <ul className="mt-2 space-y-3">
                  {connections.map((connection) => {
                    const supported = (Object.keys(actionLabels) as (keyof typeof actionLabels)[])
                      .filter((action) => connection.capabilities[action])
                      .map((action) => actionLabels[action]);
                    return (
                      <li
                        key={connection.connector_id}
                        className="space-y-1 text-sm [overflow-wrap:anywhere]"
                      >
                        <div className="flex flex-wrap items-center gap-2 md-ops-text">
                          <strong>{connection.label}</strong>
                          <span className="rounded-full border px-2 py-0.5 text-xs">
                            {marketplaceConnectionStatus(connection, report.runtimeEnabled)}
                          </span>
                        </div>
                        <p className="md-ops-muted">Store: {connection.external_store_id}</p>
                        <p className="md-ops-muted">
                          Configured controls:{" "}
                          {supported.length ? supported.join(", ") : "No outbound controls"}.
                        </p>
                        {connection.unresolved_commands > 0 && (
                          <p className="font-semibold md-ops-text" role="status">
                            {connection.unresolved_commands}{" "}
                            {connection.unresolved_commands === 1 ? "action needs" : "actions need"}{" "}
                            checking against the original merchant screen.
                          </p>
                        )}
                        <p className="md-ops-muted">
                          Last bridge contact:{" "}
                          {connection.last_seen_at
                            ? new Date(connection.last_seen_at).toLocaleString("en-GB", {
                                timeZone: "Europe/London",
                              })
                            : "Not received"}
                          .
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs leading-5 md-ops-muted">
        Each ticket shows its last confirmed platform state. Customer and courier updates depend on
        the controls available for that order.
      </p>
    </div>
  );
}

export function MarketplaceConnectionsPanel({
  tenantId,
  locationId,
}: {
  tenantId: string;
  locationId: string;
}) {
  const [report, setReport] = useState<MarketplaceConnectionsReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const currentRequest = ++generation.current;
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const client = getMealDeckOpsClient();
      const { data, error: sessionError } = await client.auth.getSession();
      if (sessionError || !data.session)
        throw new Error("Sign in again to check marketplace connections.");
      const response = await fetch("/api/ops/marketplaces", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({ action: "status", tenantId, locationId }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "Sign in again to check marketplace connections."
            : response.status === 403
              ? "Current owner or administrator permission is required."
              : "The marketplace setup report is unavailable. Check the connector database installation and try again.",
        );
      const result = marketplaceConnectionsReportSchema.safeParse(await response.json());
      const current = await client.auth.getSession();
      if (
        getMealDeckOpsClient() !== client ||
        current.error ||
        current.data.session?.user.id !== data.session.user.id
      )
        throw new Error("Your staff account changed. Sign in again to check connections.");
      if (
        !result.success ||
        result.data.tenantId !== tenantId ||
        result.data.locationId !== locationId
      )
        throw new Error("The marketplace setup report could not be verified for this kitchen.");
      if (currentRequest === generation.current) setReport(result.data);
    } catch (reason) {
      if (currentRequest === generation.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Marketplace connections could not be checked.",
        );
    } finally {
      if (currentRequest === generation.current) setBusy(false);
    }
  }, [tenantId, locationId]);
  useEffect(() => {
    void refresh();
    return () => {
      // This ref is a request counter, not a DOM ref. Invalidate the latest read on unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [refresh]);
  const currentReport =
    report?.tenantId === tenantId && report.locationId === locationId ? report : null;
  return (
    <section className="md-ops-card p-5 space-y-4" aria-labelledby="marketplace-connections-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="marketplace-connections-title" className="text-lg font-semibold md-ops-text">
            Uber Eats &amp; Just Eat
          </h2>
          <p className="mt-1 text-sm md-ops-muted">
            MealDeck’s own connections to the kitchen display.
          </p>
        </div>
        <button
          type="button"
          className="md-ops-button min-h-11"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshCw
            size={16}
            className={busy ? "animate-spin motion-reduce:animate-none" : ""}
            aria-hidden="true"
          />
          {busy ? "Checking…" : "Check connections"}
        </button>
      </div>
      {error && (
        <p className="md-ops-status md-ops-status-error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="text-sm md-ops-muted" role="status">
          Checking store connections and bridge contact…
        </p>
      )}
      {currentReport && <MarketplaceConnectionReport report={currentReport} />}
    </section>
  );
}
