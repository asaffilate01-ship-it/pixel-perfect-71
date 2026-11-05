import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { RefreshCcw } from "lucide-react";
import { OpsRequestError } from "@/lib/mealdeck-ops-browser";
import { penceToPounds, poundsToPence } from "@/lib/mealdeck-ops-math";
import {
  listModifierPrices,
  updateModifierPrice,
  type OpsModifierPrice,
} from "@/lib/mealdeck-ops-modifier-prices";

type Props = { tenantId: string; canRead: boolean; canWrite: boolean };

export function ModifierPricesPanel({ tenantId, canRead, canWrite }: Props) {
  const id = useId();
  const request = useRef(0);
  const priceInput = useRef<HTMLInputElement>(null);
  const reviewFocusPending = useRef(false);
  const [rows, setRows] = useState<OpsModifierPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [editing, setEditing] = useState<OpsModifierPrice | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const cancelRequests = useCallback(() => {
    request.current++;
  }, []);

  const load = useCallback(async () => {
    if (!canRead) return;
    const cycle = ++request.current;
    setLoading(true);
    setLoadError("");
    try {
      const next = await listModifierPrices(tenantId);
      if (cycle === request.current) setRows(next);
    } catch (reason) {
      if (cycle === request.current) {
        setRows([]);
        setLoadError(
          reason instanceof Error
            ? reason.message
            : "Option prices could not be loaded. Please retry.",
        );
      }
    } finally {
      if (cycle === request.current) setLoading(false);
    }
  }, [tenantId, canRead]);

  useEffect(() => {
    setRows([]);
    setEditing(null);
    setAmount("");
    setSaveError("");
    setConflict(false);
    setNotice("");
    setBusy(false);
    reviewFocusPending.current = false;
    void load();
    return cancelRequests;
  }, [load, cancelRequests]);

  useEffect(() => {
    if (!loading && reviewFocusPending.current) {
      reviewFocusPending.current = false;
      priceInput.current?.focus();
    }
  }, [loading]);

  const current = rows.find((row) => row.option_id === editing?.option_id);
  const groups = [...new Map(rows.map((row) => [row.group_id, row.group_name])).entries()];
  const filtered = rows.filter(
    (row) =>
      (!group || row.group_id === group) &&
      `${row.group_name} ${row.option_name}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const changedElsewhere =
    !!current && !!editing && current.price_delta_pence !== editing.price_delta_pence;
  const needsReview = conflict || changedElsewhere;
  const enteredPence = poundsToPence(amount);

  function choose(row: OpsModifierPrice) {
    if (editing?.option_id !== row.option_id) {
      setEditing(row);
      setAmount((row.price_delta_pence / 100).toFixed(2));
      setSaveError("");
      setConflict(false);
      setNotice("");
    }
    window.requestAnimationFrame(() => {
      priceInput.current?.focus({ preventScroll: true });
      priceInput.current?.scrollIntoView({ block: "center", behavior: "auto" });
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || !editing || !current || busy || loading || needsReview) return;
    if (enteredPence === null || enteredPence > 1000000) {
      setSaveError("Enter a price from £0.00 to £10,000.00 with no more than two decimals.");
      priceInput.current?.focus();
      return;
    }
    const cycle = request.current;
    setBusy(true);
    setSaveError("");
    setNotice("");
    try {
      const saved = await updateModifierPrice(
        tenantId,
        editing.option_id,
        enteredPence,
        editing.price_delta_pence,
      );
      if (cycle !== request.current) return;
      setRows((previous) =>
        previous.map((row) => (row.option_id === saved.option_id ? saved : row)),
      );
      setEditing(saved);
      setAmount((saved.price_delta_pence / 100).toFixed(2));
      setNotice(
        `${saved.option_name} saved at ${penceToPounds(saved.price_delta_pence)}. ${saved.affected_item_count === 0 ? "This option is not linked to a menu item yet." : `Used by ${saved.affected_item_count} menu ${saved.affected_item_count === 1 ? "item" : "items"}.`}`,
      );
    } catch (reason) {
      if (cycle !== request.current) return;
      if (reason instanceof OpsRequestError && reason.code === "conflict") {
        setConflict(true);
        setSaveError(
          "This price changed on another screen. Your entry has been kept. Review the latest saved price before saving again.",
        );
      } else
        setSaveError(
          reason instanceof Error ? reason.message : "The price could not be saved. Please retry.",
        );
    } finally {
      if (cycle === request.current) setBusy(false);
    }
  }

  async function reviewLatest() {
    if (!editing) return;
    const selected = editing.option_id;
    const cycle = ++request.current;
    setLoading(true);
    setLoadError("");
    try {
      const next = await listModifierPrices(tenantId);
      if (cycle !== request.current) return;
      setRows(next);
      const latest = next.find((row) => row.option_id === selected);
      if (!latest) {
        setEditing(null);
        setSaveError("This option is no longer available. Choose another option.");
        return;
      }
      setEditing(latest);
      setConflict(false);
      setSaveError("");
      setNotice(
        `Latest saved price: ${penceToPounds(latest.price_delta_pence)}. Your entry is still ${amount || "empty"}. Review it before saving.`,
      );
      reviewFocusPending.current = true;
    } catch (reason) {
      if (cycle === request.current)
        setLoadError(
          reason instanceof Error
            ? reason.message
            : "The latest price could not be loaded. Please retry.",
        );
    } finally {
      if (cycle === request.current) setLoading(false);
    }
  }

  return (
    <section className="md-ops-card p-5 xl:col-span-2" aria-labelledby={id + "-heading"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 id={id + "-heading"} className="text-xl font-black">
            Add-ons &amp; upgrade prices
          </h2>
          <p className="mt-1 text-sm md-ops-muted">
            Manage the price of each choice across the business. A shared option changes for every
            menu item that uses its group.
          </p>
          <p className="mt-2 text-xs md-ops-muted">
            These prices are saved for the live menu. The current coming-soon menu still shows the
            approved launch prices.
          </p>
        </div>
        {canRead && (
          <button
            type="button"
            className="md-ops-button md-ops-secondary"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            <RefreshCcw className="size-4" aria-hidden="true" /> Reload prices
          </button>
        )}
      </div>
      {!canRead ? (
        <p className="mt-4 text-sm md-ops-muted">
          A business-wide menu role is required to view shared option prices.
        </p>
      ) : (
        <>
          {loading && (
            <p role="status" className="mt-4 text-sm md-ops-muted">
              Loading option prices…
            </p>
          )}
          {loadError && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              <p>{loadError}</p>
              <button
                type="button"
                className="md-ops-button md-ops-secondary mt-3"
                disabled={loading || busy}
                onClick={() => void load()}
              >
                Retry option prices
              </button>
            </div>
          )}
          {!loading && !loadError && rows.length === 0 && (
            <p role="status" className="md-ops-empty mt-4 p-5 text-sm">
              No add-on or upgrade options have been added to this business yet.
            </p>
          )}
          {rows.length > 0 && (
            <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
              <div className="min-w-0">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-semibold" htmlFor={id + "-search"}>
                    Search options
                    <input
                      id={id + "-search"}
                      type="search"
                      className="md-ops-field mt-2"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Fries, mocktail, cheese…"
                    />
                  </label>
                  <label className="block min-w-0 text-sm font-semibold" htmlFor={id + "-group"}>
                    Option group
                    <select
                      id={id + "-group"}
                      className="md-ops-field mt-2"
                      value={group}
                      onChange={(e) => setGroup(e.target.value)}
                    >
                      <option value="">All groups</option>
                      {groups.map(([value, name]) => (
                        <option key={value} value={value}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="mt-3 text-xs md-ops-muted">
                  {filtered.length} of {rows.length} options
                </p>
                <ul
                  className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-1"
                  aria-label="Saved add-on and upgrade prices"
                >
                  {filtered.map((row) => (
                    <li
                      key={row.option_id}
                      className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${editing?.option_id === row.option_id ? "md-ops-selection" : "md-ops-border"}`}
                    >
                      <div className="min-w-0 break-words">
                        <p className="text-xs font-bold md-ops-accent">{row.group_name}</p>
                        <p className="mt-1 font-bold">{row.option_name}</p>
                        <p className="mt-1 text-sm md-ops-muted">
                          {penceToPounds(row.price_delta_pence)} ·{" "}
                          {row.active ? "Active option" : "Draft option"}
                        </p>
                        <p className="text-xs md-ops-muted">
                          {row.affected_item_count === 0
                            ? "Not linked to menu items"
                            : `Used by ${row.affected_item_count} menu ${row.affected_item_count === 1 ? "item" : "items"}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="md-ops-button md-ops-secondary shrink-0"
                        disabled={busy || loading}
                        aria-label={`${canWrite ? "Edit price for" : "View price for"} ${row.option_name} in ${row.group_name}`}
                        aria-controls={id + "-editor"}
                        aria-current={editing?.option_id === row.option_id ? "true" : undefined}
                        onClick={() => choose(row)}
                      >
                        {canWrite ? "Edit" : "View"}
                      </button>
                    </li>
                  ))}
                </ul>
                {filtered.length === 0 && (
                  <p className="md-ops-empty mt-2 p-4 text-sm">
                    No options match your search. Try another name or group.
                  </p>
                )}
              </div>
              <div id={id + "-editor"} className="min-w-0 rounded-xl border md-ops-border p-4">
                {!current || !editing ? (
                  <p className="text-sm md-ops-muted">Choose an option to review its price.</p>
                ) : (
                  <form onSubmit={(event) => void save(event)}>
                    <p className="text-xs font-bold md-ops-accent">{current.group_name}</p>
                    <h3 className="mt-1 break-words text-lg font-black">{current.option_name}</h3>
                    <p className="mt-2 text-sm md-ops-muted">
                      {current.affected_item_count === 0
                        ? "This option is not linked to a menu item yet."
                        : `This group is used by ${current.affected_item_count} menu ${current.affected_item_count === 1 ? "item" : "items"}. The saved price applies wherever this option is offered.`}
                    </p>
                    <p className="mt-2 text-xs md-ops-muted">
                      Status: {current.active ? "active" : "draft"}. Saving a price does not change
                      availability.
                    </p>
                    <label className="mt-4 block text-sm font-semibold" htmlFor={id + "-price"}>
                      Option price (£)
                    </label>
                    <input
                      ref={priceInput}
                      id={id + "-price"}
                      className="md-ops-field mt-2"
                      inputMode="decimal"
                      value={amount}
                      aria-describedby={id + "-price-help"}
                      disabled={!canWrite || busy || loading}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        setNotice("");
                      }}
                    />
                    <p id={id + "-price-help"} className="mt-2 text-xs md-ops-muted">
                      Saved price: {penceToPounds(editing.price_delta_pence)}. Enter 0.00 for an
                      included choice.
                    </p>
                    {needsReview && (
                      <button
                        type="button"
                        className="md-ops-button md-ops-secondary mt-3"
                        disabled={busy || loading}
                        onClick={() => void reviewLatest()}
                      >
                        Review latest price
                      </button>
                    )}
                    {canWrite ? (
                      <button
                        type="submit"
                        className="md-ops-button md-ops-primary mt-4 w-full"
                        disabled={
                          busy ||
                          loading ||
                          needsReview ||
                          enteredPence === editing.price_delta_pence
                        }
                      >
                        {busy ? "Saving price…" : "Save option price"}
                      </button>
                    ) : (
                      <p className="mt-4 text-sm md-ops-muted">
                        Your role can view these prices. A business-wide menu editor can change
                        them.
                      </p>
                    )}
                  </form>
                )}
                {saveError && (
                  <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                    {saveError}
                  </p>
                )}
                {notice && (
                  <p
                    role="status"
                    className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
                  >
                    {notice}
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
