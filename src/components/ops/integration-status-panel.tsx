import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleHelp, Copy, RefreshCw, Settings2 } from "lucide-react";
import { getMealDeckOpsClient } from "@/lib/mealdeck-ops-browser";
import {
  INTEGRATION_STATE_LABELS,
  integrationStatusSchema,
  type MealDeckIntegrationStatus,
} from "@/lib/mealdeck-integration-status";

export function IntegrationStatusPanel({
  tenantId,
  locationId,
}: {
  tenantId: string;
  locationId: string;
}) {
  const [report, setReport] = useState<MealDeckIntegrationStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setBusy(true);
    setReport(null);
    setError("");
    setCopyFeedback("");
    try {
      const client = getMealDeckOpsClient();
      // Session supplies transport only. The endpoint re-verifies Auth and SQL permissions.
      const { data, error: sessionError } = await client.auth.getSession();
      if (sessionError || !data.session) throw new Error("Sign in again to check connections.");
      const response = await fetch("/api/ops/integrations", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + data.session.access_token,
        },
        body: JSON.stringify({ action: "status", tenantId, locationId }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? "Your current owner/admin permissions do not allow this check. Sign in again or ask the owner to review your access."
            : response.status === 401
              ? "Sign in again to check connections."
              : "Connections could not be checked. Check the dedicated kitchen setup and try again.",
        );
      const result = integrationStatusSchema.safeParse(await response.json());
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
        throw new Error("The connection report could not be verified for this kitchen.");
      if (request === generation.current) setReport(result.data);
    } catch (reason) {
      if (request === generation.current)
        setError(
          reason instanceof Error ? reason.message : "Connections could not be checked. Try again.",
        );
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }, [tenantId, locationId]);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [refresh]);
  const currentReport =
    report?.tenantId === tenantId && report.locationId === locationId ? report : null;
  const copySettingName = async (name: string) => {
    setCopyFeedback("");
    try {
      await navigator.clipboard.writeText(name);
      setCopyFeedback("Setting name copied. Paste it into the Name field in Lovable.");
    } catch {
      setCopyFeedback("Your browser could not copy it. Select the setting name and copy it.");
    }
  };
  return (
    <section className="md-ops-card p-5 space-y-4" aria-labelledby="integration-status-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="integration-status-title" className="text-lg font-semibold md-ops-text">
            Payment &amp; email connections
          </h2>
          <p className="mt-1 text-sm md-ops-muted">
            Check the Luton setup without taking a payment or sending an email.
          </p>
        </div>
        <button
          type="button"
          className="md-ops-button min-h-11"
          onClick={() => void refresh()}
          disabled={busy}
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
          Checking current permissions and connection settings…
        </p>
      )}
      {currentReport && (
        <>
          <p className="text-sm md-ops-text" role="status">
            Stripe mode:{" "}
            <strong>
              {currentReport.mode === "unconfigured"
                ? "Not configured"
                : currentReport.mode === "live"
                  ? "Live"
                  : "Test"}
            </strong>
            {" · "}
            {currentReport.acceptingOnlineOrders
              ? "New website orders enabled"
              : "New website orders unavailable"}
          </p>
          <ul className="divide-y divide-current/10">
            {currentReport.checks.map((check) => (
              <li key={check.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 md-ops-text">
                  {check.state === "checked" ? (
                    <CheckCircle2 size={18} aria-hidden="true" />
                  ) : check.state === "needs_setup" ? (
                    <Settings2 size={18} aria-hidden="true" />
                  ) : (
                    <CircleHelp size={18} aria-hidden="true" />
                  )}
                  <h3 className="font-semibold">{check.label}</h3>
                  <span className="rounded-full border px-2 py-0.5 text-xs">
                    {INTEGRATION_STATE_LABELS[check.state]}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 md-ops-muted [overflow-wrap:anywhere]">
                  {check.detail}
                </p>
                {check.settings.length > 0 && (
                  <details
                    open={check.state === "needs_setup"}
                    className="mt-2 text-xs md-ops-muted"
                  >
                    <summary className="min-h-11 cursor-pointer flex items-center">
                      Setting names to check in Lovable
                    </summary>
                    <ul className="space-y-2">
                      {check.settings.map((name) => (
                        <li key={name} className="flex flex-wrap items-center gap-2">
                          <code className="min-w-0 flex-1 break-all">{name}</code>
                          <button
                            type="button"
                            className="md-ops-button min-h-11 shrink-0 text-xs"
                            aria-label={`Copy ${name} setting name`}
                            onClick={() => void copySettingName(name)}
                          >
                            <Copy size={14} aria-hidden="true" />
                            Copy name
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
          {copyFeedback && (
            <p className="text-sm md-ops-muted" role="status">
              {copyFeedback}
            </p>
          )}
          <p className="text-xs md-ops-muted">
            Checked{" "}
            {new Date(currentReport.checkedAt).toLocaleString("en-GB", {
              timeZone: "Europe/London",
            })}{" "}
            London time. Configuration checks do not certify a completed payment, phone acceptance
            or delivered email.
          </p>
        </>
      )}
    </section>
  );
}
